import { 
  type Player, 
  type InsertPlayer, 
  type Court, 
  type InsertCourt,
  type CourtWithPlayers,
  type CourtPlayer,
  type Session,
  type InsertSession,
  type GameParticipant,
  type PlayerStats,
  type MarketplaceUser,
  type InsertMarketplaceUser,
  type BookableSession,
  type InsertBookableSession,
  type BookableSessionWithAvailability,
  type Booking,
  type InsertBooking,
  type BookingWithDetails,
  type BookingGuest,
  type InsertBookingGuest,
  type Payment,
  type InsertPayment,
  type MarketplaceNotification,
  type ScoreDispute,
  type ScoreDisputeWithDetails,
  type Tag,
  type InsertPlayerTag,
  type PlayerTag,
  type TrendingTag,
  type PlayerTopTag,
  type PlayerTopTagEntry,
  type CommunitySpotlightEntry,
  type ReceivedTagEntry,
  type TagCountResult,
  type GameParticipantInfo,
  type RefundNotificationWithDetails,
  type TagSuggestion,
  type InsertTagSuggestion,
  type TagSuggestionWithVote,
  type Referral,
  type InsertReferral,
  players,
  courts,
  courtPlayers as courtPlayersTable,
  queueEntries,
  sessions,
  gameResults,
  gameParticipants,
  marketplaceUsers,
  marketplaceAuthSessions,
  bookableSessions,
  bookings,
  bookingGuests,
  payments,
  marketplaceNotifications,
  scoreDisputes,
  tags,
  playerTags,
  tagSuggestions,
  tagSuggestionVotes,
  expenseCategories,
  expenses,
  referrals,
  type ExpenseCategory,
  type InsertExpenseCategory,
  type Expense,
  type InsertExpense,
  type ExpenseWithCategory,
  type FinanceSummary,
  type BlogPost,
  type InsertBlogPost,
  blogPosts,
  playerLinkOtps,
  type PlayerLinkOtp,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc, sql, asc, like, gte, lt, SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { clearSessionRestStates } from "./matchmaking";

// Helper function to add computed SKID to player object
function addSkidToPlayer(player: typeof players.$inferSelect): Player {
  return {
    ...player,
    skid: Math.floor(player.skillScore / 10)
  };
}

// Helper function to generate the next ShuttleIQ ID
async function generateShuttleIqId(): Promise<string> {
  // Get the highest existing ShuttleIQ ID number
  const result = await db.select({ shuttleIqId: players.shuttleIqId })
    .from(players)
    .where(sql`${players.shuttleIqId} IS NOT NULL`)
    .orderBy(desc(players.shuttleIqId))
    .limit(1);
  
  let nextNumber = 1;
  if (result.length > 0 && result[0].shuttleIqId) {
    // Extract number from "SIQ-00001" format
    const match = result[0].shuttleIqId.match(/SIQ-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  
  return `SIQ-${nextNumber.toString().padStart(5, '0')}`;
}

function generateReferralCode(playerName: string, shuttleIqId: string | null): string {
  const cleanName = playerName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6).padEnd(6, 'X');
  const numericPart = shuttleIqId ? shuttleIqId.replace(/\D/g, '') : String(Math.floor(Math.random() * 99999));
  return `SIQ-${cleanName}-${numericPart}`;
}

// Return type for the public analytics endpoint
export type PublicAnalyticsResponse = {
  generatedAt: string;
  filters: { sessionId: string | null; from: string | null; to: string | null };
  totals: {
    confirmedBookings: number;
    totalSpotsBooked: number;
    revenueChargedAed: number;
    revenueCollectedAed: number;
    revenuePendingCashAed: number;
    cancelledBookings: number;
    lateFeesRetainedAed: number;
    waitlistedBookings: number;
    byPaymentMethod: {
      card: { bookings: number; spotsBooked: number; amountAed: number };
      cash: { bookings: number; spotsBooked: number; amountAed: number; collectedAed: number; pendingAed: number };
    };
  };
  sessions: Array<{
    id: string;
    title: string;
    date: Date;
    startTime: string;
    endTime: string;
    venue: string;
    pricePerSpotAed: number;
    capacity: number;
    confirmed: { bookings: number; spots: number; revenueAed: number; collectedAed: number; pendingCashAed: number };
    waitlisted: { bookings: number; spots: number };
    cancelled: { bookings: number; spots: number; lateFeesAed: number };
  }>;
  monthly: Array<{
    month: string;
    confirmedBookings: number;
    totalSpotsBooked: number;
    revenueChargedAed: number;
    revenueCollectedAed: number;
    revenuePendingCashAed: number;
  }>;
};

export interface IStorage {
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getActiveSession(): Promise<Session | undefined>;
  getAllSessions(includeSandbox?: boolean): Promise<Session[]>;
  endSession(id: string): Promise<Session | undefined>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  
  // Player operations (global)
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByExternalId(externalId: string): Promise<Player | undefined>;
  getPlayerByShuttleIqId(shuttleIqId: string): Promise<Player | undefined>;
  getAllPlayers(): Promise<Player[]>;
  searchPlayers(query: string): Promise<Player[]>;
  searchPlayersWithContact(query: string): Promise<{ id: string; name: string; shuttleIqId: string | null; level: string; skillScore: number; email?: string; phone?: string }[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  getPlayerStats(playerId: string): Promise<PlayerStats | null>;
  
  // Court operations (session-specific)
  getCourt(id: string): Promise<Court | undefined>;
  getCourtsBySession(sessionId: string): Promise<Court[]>;
  createCourt(court: InsertCourt): Promise<Court>;
  updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined>;
  deleteCourt(id: string): Promise<boolean>;
  
  // Court players (many-to-many with team assignments)
  getCourtPlayers(courtId: string): Promise<string[]>;
  getCourtPlayersWithTeams(courtId: string): Promise<CourtPlayer[]>;
  setCourtPlayers(courtId: string, playerIds: string[]): Promise<void>;
  setCourtPlayersWithTeams(courtId: string, assignments: { playerId: string; team: number }[]): Promise<void>;
  
  // Queue operations (session-specific)
  getQueue(sessionId: string): Promise<string[]>;
  setQueue(sessionId: string, playerIds: string[]): Promise<void>;
  addToQueue(sessionId: string, playerId: string): Promise<void>;
  removeFromQueue(sessionId: string, playerId: string): Promise<void>;
  
  // Complex queries
  getCourtsWithPlayers(sessionId: string): Promise<CourtWithPlayers[]>;
  getSessionGameHistory(sessionId: string): Promise<any[]>;
  getSessionGameParticipants(sessionId: string): Promise<(GameParticipant & { createdAt: Date })[]>;

  // Marketplace User operations
  createMarketplaceUser(user: InsertMarketplaceUser): Promise<MarketplaceUser>;
  getMarketplaceUser(id: string): Promise<MarketplaceUser | undefined>;
  getMarketplaceUserByEmail(email: string): Promise<MarketplaceUser | undefined>;
  getMarketplaceUserByResetToken(token: string): Promise<MarketplaceUser | undefined>;
  getMarketplaceUserByLinkedPlayerId(playerId: string): Promise<MarketplaceUser | undefined>;
  // Player-link OTP (proof of player-profile ownership)
  createPlayerLinkOtp(input: { marketplaceUserId: string; playerId: string; channel: string; destination: string; codeHash: string; expiresAt: Date }): Promise<PlayerLinkOtp>;
  getLatestActivePlayerLinkOtp(marketplaceUserId: string, playerId: string): Promise<PlayerLinkOtp | undefined>;
  countPlayerLinkOtpsForUserSince(marketplaceUserId: string, since: Date): Promise<number>;
  countPlayerLinkOtpsForPairSince(marketplaceUserId: string, playerId: string, since: Date): Promise<number>;
  incrementPlayerLinkOtpAttempts(otpId: string): Promise<PlayerLinkOtp | undefined>;
  consumePlayerLinkOtp(otpId: string): Promise<void>;
  getMarketplaceUserByGoogleId(googleId: string): Promise<MarketplaceUser | undefined>;
  searchMarketplaceUsersByName(query: string): Promise<MarketplaceUser[]>;
  updateMarketplaceUser(id: string, updates: Partial<MarketplaceUser>): Promise<MarketplaceUser | undefined>;
  linkPlayerIfUnclaimed(userId: string, playerId: string): Promise<MarketplaceUser | undefined>;
  getAllMarketplaceUsers(): Promise<MarketplaceUser[]>;
  createMarketplaceAuthSession(userId: string, refreshToken: string, expiresAt: Date): Promise<void>;
  findMarketplaceAuthSession(refreshToken: string): Promise<{ id: string; userId: string; refreshToken: string; expiresAt: Date } | undefined>;
  deleteMarketplaceAuthSession(id: string): Promise<void>;

  // Bookable Session operations
  createBookableSession(session: InsertBookableSession): Promise<BookableSession>;
  getBookableSession(id: string): Promise<BookableSession | undefined>;
  getBookableSessionByLinkedSessionId(linkedSessionId: string): Promise<BookableSession | undefined>;
  getBookableSessionWithAvailability(id: string): Promise<BookableSessionWithAvailability | undefined>;
  getAllBookableSessions(): Promise<BookableSessionWithAvailability[]>;
  getUpcomingBookableSessions(): Promise<BookableSessionWithAvailability[]>;
  updateBookableSession(id: string, updates: Partial<BookableSession>): Promise<BookableSession | undefined>;
  deleteBookableSession(id: string): Promise<boolean>;

  // Booking operations
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingByZiinaPaymentIntentId(intentId: string): Promise<Booking | undefined>;
  getBookingWithDetails(id: string): Promise<BookingWithDetails | undefined>;
  getUserBookings(userId: string): Promise<BookingWithDetails[]>;
  getUserBookingForSession(userId: string, sessionId: string): Promise<Booking | undefined>;
  getSessionBookings(sessionId: string): Promise<BookingWithDetails[]>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;
  getBookingCountForSession(sessionId: string): Promise<number>;
  getWaitlistedBookingsForSession(sessionId: string): Promise<Booking[]>;
  getWaitlistCountForSession(sessionId: string): Promise<number>;
  getBookingsNeedingReminder(): Promise<BookingWithDetails[]>;
  getExpiredPendingPaymentBookings(olderThanMs: number): Promise<Booking[]>;

  // Notification operations
  createMarketplaceNotification(data: { userId: string; type: string; title: string; message: string; relatedBookingId?: string }): Promise<MarketplaceNotification>;
  getNotificationsForUser(userId: string): Promise<MarketplaceNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getRefundNotifications(): Promise<RefundNotificationWithDetails[]>;
  resolveRefundNotification(id: string): Promise<boolean>;

  // Booking Guest operations
  createBookingGuest(guest: InsertBookingGuest): Promise<BookingGuest>;
  getBookingGuests(bookingId: string): Promise<import("@shared/schema").BookingGuestWithLinked[]>;
  getBookingGuestByToken(token: string): Promise<BookingGuest | undefined>;
  getBookingGuestByPendingPaymentIntentId(intentId: string): Promise<BookingGuest | undefined>;
  deleteBookingGuest(id: string): Promise<void>;
  updateBookingGuest(id: string, updates: Partial<BookingGuest>): Promise<BookingGuest | undefined>;
  getActiveGuestCountForSession(sessionId: string): Promise<number>;
  linkGuestsByEmail(email: string, userId: string): Promise<void>;
  getGuestBookingsForUser(userId: string): Promise<BookingWithDetails[]>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByBookingId(bookingId: string): Promise<Payment | undefined>;
  getPaymentsByBookingId(bookingId: string): Promise<Payment[]>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;

  // Score dispute operations
  createScoreDispute(data: { gameResultId: string; filedByUserId: string; note?: string }): Promise<ScoreDispute>;
  getScoreDispute(id: string): Promise<ScoreDispute | undefined>;
  getDisputeByUserAndGame(userId: string, gameResultId: string): Promise<ScoreDispute | undefined>;
  getAllDisputesWithDetails(): Promise<ScoreDisputeWithDetails[]>;
  getDisputesByUser(userId: string): Promise<ScoreDispute[]>;
  updateScoreDispute(id: string, updates: Partial<ScoreDispute>): Promise<ScoreDispute | undefined>;

  // Player personality tag operations
  getAllTags(): Promise<Tag[]>;
  getTrendingTags(limit?: number): Promise<TrendingTag[]>;
  getPlayerTopTags(playerId: string, limit?: number): Promise<PlayerTopTag[]>;
  getPlayersWithTag(tagId: string, limit?: number): Promise<Array<{ player: Player; count: number }>>;
  createPlayerTags(entries: InsertPlayerTag[]): Promise<PlayerTag[]>;
  getPlayerTagsForGame(gameResultId: string, taggedByPlayerId: string): Promise<PlayerTag[]>;
  getTaggedGameIds(taggedByPlayerId: string): Promise<string[]>;
  getGameParticipantInfo(gameResultId: string): Promise<GameParticipantInfo[]>;
  getAllPlayersTopTag(): Promise<PlayerTopTagEntry[]>;
  getCommunitySpotlight(limit?: number): Promise<CommunitySpotlightEntry[]>;
  getRecentReceivedTags(taggedPlayerId: string, limit?: number): Promise<ReceivedTagEntry[]>;
  getTagCountsForTargets(targetPlayerIds: string[], tagIds: string[]): Promise<TagCountResult[]>;

  // Tag suggestions
  createTagSuggestion(data: InsertTagSuggestion): Promise<TagSuggestion>;
  getTagSuggestions(status: 'pending' | 'approved' | 'rejected', viewerPlayerId?: string): Promise<TagSuggestionWithVote[]>;
  getTagSuggestionsByPlayer(playerId: string): Promise<TagSuggestion[]>;
  voteTagSuggestion(suggestionId: string, playerId: string): Promise<{ alreadyVoted: boolean; ownSuggestion: boolean; notPending: boolean; newCount: number }>;
  unvoteTagSuggestion(suggestionId: string, playerId: string): Promise<{ newCount: number }>;
  reviewTagSuggestion(suggestionId: string, status: 'approved' | 'rejected', adminNote?: string): Promise<TagSuggestion | undefined>;

  // Public analytics
  getPublicAnalytics(options: { sessionId?: string; from?: Date; to?: Date }): Promise<PublicAnalyticsResponse>;

  // Finance / Accounting
  getAllExpenseCategories(): Promise<ExpenseCategory[]>;
  createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: string, updates: Partial<ExpenseCategory>): Promise<ExpenseCategory | undefined>;
  deleteExpenseCategory(id: string): Promise<void>;

  createExpense(data: InsertExpense): Promise<Expense>;
  getExpense(id: string): Promise<Expense | undefined>;
  getAllExpenses(filters?: { from?: Date; to?: Date; categoryId?: string }): Promise<ExpenseWithCategory[]>;
  updateExpense(id: string, updates: Partial<Pick<Expense, 'categoryId' | 'amountAed' | 'description' | 'vendor' | 'paidBy' | 'date' | 'notes'>>): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<void>;

  getFinanceSummary(from: Date, to: Date): Promise<FinanceSummary>;

  // Blog operations
  createBlogPost(data: InsertBlogPost): Promise<BlogPost>;
  getBlogPost(id: string): Promise<BlogPost | undefined>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  getAllBlogPosts(includeUnpublished?: boolean): Promise<BlogPost[]>;
  updateBlogPost(id: string, updates: Partial<BlogPost>): Promise<BlogPost | undefined>;
  deleteBlogPost(id: string): Promise<boolean>;

  // Referral operations
  createReferral(data: InsertReferral): Promise<Referral>;
  getReferral(id: string): Promise<Referral | undefined>;
  getReferralByRefereeUserId(refereeUserId: string): Promise<Referral | undefined>;
  getReferralByRefereePlayerId(refereePlayerId: string): Promise<Referral | undefined>;
  getReferralsByReferrerId(referrerId: string): Promise<(Referral & { refereeName: string | null })[]>;
  getCompletedReferralCount(referrerId: string): Promise<number>;
  getAllReferrals(): Promise<(Referral & { referrerName: string; refereeEmail: string; referralCode: string | null; ambassadorStatus: boolean; jerseyDispatched: boolean })[]>;
  updateReferral(id: string, updates: Partial<Referral>): Promise<Referral | undefined>;
  getReferralLeaderboard(limit?: number): Promise<{ playerId: string; playerName: string; referralCode: string | null; completedCount: number; ambassadorStatus: boolean }[]>;
  getPlayerByReferralCode(code: string): Promise<Player | undefined>;
  backfillReferralCodes(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Session operations
  async createSession(insertSession: InsertSession): Promise<Session> {
    // Allow multiple concurrent sessions (removed auto-ending logic)
    // Default to 'active' status to preserve existing workflow
    const id = randomUUID();
    const status = insertSession.status || 'active';
    
    // Set endedAt timestamp if creating an ended session
    const endedAt = status === 'ended' ? new Date() : undefined;
    
    const [session] = await db
      .insert(sessions)
      .values({ 
        ...insertSession,
        ...(endedAt && { endedAt }),
        id,
        status
      })
      .returning();
    
    // Create courts for the new session
    const courtsToCreate = insertSession.courtCount || 2;
    for (let i = 1; i <= courtsToCreate; i++) {
      await this.createCourt({
        name: `Court ${i}`,
        sessionId: session.id,
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null
      });
    }

    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getActiveSession(): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.status, 'active'))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return session || undefined;
  }

  async getAllSessions(includeSandbox = false): Promise<Session[]> {
    if (includeSandbox) {
      return await db.select().from(sessions).where(eq(sessions.isSandbox, true)).orderBy(desc(sessions.createdAt));
    }
    return await db.select().from(sessions).where(eq(sessions.isSandbox, false)).orderBy(desc(sessions.createdAt));
  }

  async endSession(id: string): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set({ status: 'ended', endedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    // Clear matchmaking rest states for this session
    clearSessionRestStates(id);
    
    // Delete all related data first (cascade delete)
    // Get all courts for this session FIRST before any deletions
    const sessionCourts = await this.getCourtsBySession(id);
    
    // Collect all game IDs before deleting anything
    const allGameIds: string[] = [];
    for (const court of sessionCourts) {
      const courtGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.courtId, court.id));
      allGameIds.push(...courtGames.map(g => g.id));
    }
    
    // 1. Delete game participants for all collected games
    if (allGameIds.length > 0) {
      await db.delete(gameParticipants).where(inArray(gameParticipants.gameId, allGameIds));
    }
    
    // 2. Delete game results for all courts in this session
    for (const court of sessionCourts) {
      await db.delete(gameResults).where(eq(gameResults.courtId, court.id));
    }
    
    // 3. Delete court players for all courts in this session
    for (const court of sessionCourts) {
      await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, court.id));
    }
    
    // 4. Delete courts
    await db.delete(courts).where(eq(courts.sessionId, id));
    
    // 5. Delete queue entries
    await db.delete(queueEntries).where(eq(queueEntries.sessionId, id));
    
    // 6. Delete linked bookable sessions and their bookings/payments/guests
    const linkedBookableSessions = await db.select().from(bookableSessions).where(eq(bookableSessions.linkedSessionId, id));
    for (const bs of linkedBookableSessions) {
      const linkedBookings = await db.select().from(bookings).where(eq(bookings.sessionId, bs.id));
      for (const booking of linkedBookings) {
        // booking_guests has FK on booking_id — must delete before bookings
        await db.delete(bookingGuests).where(eq(bookingGuests.bookingId, booking.id));
        await db.delete(payments).where(eq(payments.bookingId, booking.id));
      }
      await db.delete(bookings).where(eq(bookings.sessionId, bs.id));
      await db.delete(bookableSessions).where(eq(bookableSessions.id, bs.id));
    }
    
    // 7. Finally delete the session
    const result = await db.delete(sessions).where(eq(sessions.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async getPlayerByExternalId(externalId: string): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.externalId, externalId));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async getPlayerByShuttleIqId(shuttleIqId: string): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.shuttleIqId, shuttleIqId));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async getAllPlayers(): Promise<Player[]> {
    const playerList = await db.select().from(players).orderBy(asc(players.name));
    return playerList.map(addSkidToPlayer);
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const upperQuery = `%${query.toUpperCase()}%`;
    const playerList = await db
      .select()
      .from(players)
      .where(sql`LOWER(${players.name}) LIKE ${lowerQuery} OR ${players.shuttleIqId} LIKE ${upperQuery} OR LOWER(${players.email}) LIKE ${lowerQuery} OR LOWER(${players.phone}) LIKE ${lowerQuery}`)
      .orderBy(asc(players.name));

    return playerList.map(addSkidToPlayer);
  }

  async searchPlayersWithContact(query: string): Promise<{ id: string; name: string; shuttleIqId: string | null; level: string; skillScore: number; email?: string; phone?: string }[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const upperQuery = `%${query.toUpperCase()}%`;

    const playerList = await db
      .select()
      .from(players)
      .where(sql`LOWER(${players.name}) LIKE ${lowerQuery} OR ${players.shuttleIqId} LIKE ${upperQuery} OR LOWER(${players.email}) LIKE ${lowerQuery} OR LOWER(${players.phone}) LIKE ${lowerQuery}`)
      .orderBy(asc(players.name));

    return playerList.map(p => ({
      id: p.id,
      name: p.name,
      shuttleIqId: p.shuttleIqId,
      level: p.level,
      skillScore: p.skillScore,
      email: p.email || undefined,
      phone: p.phone || undefined,
    }));
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const shuttleIqId = await generateShuttleIqId();
    const referralCode = generateReferralCode(insertPlayer.name, shuttleIqId);
    const [player] = await db
      .insert(players)
      .values({ 
        ...insertPlayer, 
        id,
        shuttleIqId,
        referralCode,
        status: insertPlayer.status || 'waiting',
        gamesPlayed: insertPlayer.gamesPlayed || 0,
        wins: insertPlayer.wins || 0,
        skillScoreBaseline: insertPlayer.skillScore ?? 50,
      })
      .returning();
    return addSkidToPlayer(player);
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const [updated] = await db
      .update(players)
      .set(updates)
      .where(eq(players.id, id))
      .returning();
    return updated ? addSkidToPlayer(updated) : undefined;
  }

  async deletePlayer(id: string): Promise<boolean> {
    // Delete related court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.playerId, id));
    
    // Delete related queue entries
    await db.delete(queueEntries).where(eq(queueEntries.playerId, id));
    
    // Delete the player
    const result = await db.delete(players).where(eq(players.id, id)).returning();
    return result.length > 0;
  }

  async getPlayerStats(playerId: string): Promise<PlayerStats | null> {
    const player = await this.getPlayer(playerId);
    if (!player) return null;

    // Get all players for ranking calculations
    const allPlayers = await this.getAllPlayers();
    const playersWithGames = allPlayers.filter(p => p.gamesPlayed > 0);
    
    // Calculate rankings
    const sortedBySkill = [...allPlayers].sort((a, b) => b.skillScore - a.skillScore);
    const sortedByWins = [...allPlayers].sort((a, b) => b.wins - a.wins);
    const sortedByWinRate = [...playersWithGames].sort((a, b) => {
      const aRate = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0;
      const bRate = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0;
      return bRate - aRate;
    });
    
    const rankBySkillScore = sortedBySkill.findIndex(p => p.id === playerId) + 1;
    const rankByWins = sortedByWins.findIndex(p => p.id === playerId) + 1;
    const rankByWinRate = player.gamesPlayed > 0 
      ? sortedByWinRate.findIndex(p => p.id === playerId) + 1 
      : playersWithGames.length + 1;

    // Get all games this player participated in
    const playerGames = await db
      .select()
      .from(gameParticipants)
      .where(eq(gameParticipants.playerId, playerId));
    
    if (playerGames.length === 0) {
      return {
        player,
        winRate: 0,
        totalGames: player.gamesPlayed,
        totalWins: player.wins,
        currentStreak: { type: 'none', count: 0 },
        longestWinStreak: 0,
        longestLossStreak: 0,
        rankBySkillScore,
        rankByWins,
        rankByWinRate,
        totalPlayersRanked: allPlayers.length,
        performanceTrend: 'stable',
        recentWinRate: 0,
        avgScoreDifferential: 0,
        avgPointsFor: 0,
        avgPointsAgainst: 0,
        bestPartner: null,
        frequentPartners: [],
        rivals: [],
        favoriteOpponents: [],
        recentGames: []
      };
    }

    const gameIds = playerGames.map(g => g.gameId);
    
    // Get game results for these games, excluding sandbox session games (ordered by date for streak calculation)
    const games = await db
      .select()
      .from(gameResults)
      .where(sql`${gameResults.id} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)}) AND ${gameResults.sessionId} IN (SELECT id FROM sessions WHERE is_sandbox = false)`)
      .orderBy(desc(gameResults.createdAt));

    // Get all participants for non-sandbox games only
    const nonSandboxGameIds = games.map(g => g.id);
    if (nonSandboxGameIds.length === 0) {
      return {
        player,
        winRate: 0,
        totalGames: player.gamesPlayed,
        totalWins: player.wins,
        currentStreak: { type: 'none', count: 0 },
        longestWinStreak: 0,
        longestLossStreak: 0,
        rankBySkillScore,
        rankByWins,
        rankByWinRate,
        totalPlayersRanked: allPlayers.length,
        performanceTrend: 'stable',
        recentWinRate: 0,
        avgScoreDifferential: 0,
        avgPointsFor: 0,
        avgPointsAgainst: 0,
        bestPartner: null,
        frequentPartners: [],
        rivals: [],
        favoriteOpponents: [],
        recentGames: []
      };
    }
    const allParticipants = await db
      .select()
      .from(gameParticipants)
      .where(inArray(gameParticipants.gameId, nonSandboxGameIds));

    // Get player list for lookups
    const participantPlayerIds = Array.from(new Set(allParticipants.map(p => p.playerId)));
    const playerList = await db
      .select()
      .from(players)
      .where(inArray(players.id, participantPlayerIds));
    const playerMap = new Map(playerList.map(p => [p.id, addSkidToPlayer(p)]));

    // Calculate game outcomes for streak and trend calculations
    const gameOutcomes: { won: boolean; team1Score: number; team2Score: number; playerTeam: number }[] = [];
    
    // Partner and opponent tracking
    const partnerStats: Record<string, { games: number; wins: number }> = {};
    const opponentStats: Record<string, { games: number; wins: number }> = {};
    
    let totalPointsFor = 0;
    let totalPointsAgainst = 0;

    for (const game of games) {
      const gameParticipantsList = allParticipants.filter(p => p.gameId === game.id);
      const playerInGame = gameParticipantsList.find(p => p.playerId === playerId);
      if (!playerInGame) continue;
      
      const playerTeam = playerInGame.team;
      const isWin = game.winningTeam === playerTeam;
      
      // Calculate points for/against
      const pointsFor = playerTeam === 1 ? game.team1Score : game.team2Score;
      const pointsAgainst = playerTeam === 1 ? game.team2Score : game.team1Score;
      totalPointsFor += pointsFor;
      totalPointsAgainst += pointsAgainst;
      
      gameOutcomes.push({ won: isWin, team1Score: game.team1Score, team2Score: game.team2Score, playerTeam });
      
      // Track partner stats
      const partner = gameParticipantsList.find(p => p.team === playerTeam && p.playerId !== playerId);
      if (partner) {
        if (!partnerStats[partner.playerId]) {
          partnerStats[partner.playerId] = { games: 0, wins: 0 };
        }
        partnerStats[partner.playerId].games++;
        if (isWin) partnerStats[partner.playerId].wins++;
      }
      
      // Track opponent stats
      const opponents = gameParticipantsList.filter(p => p.team !== playerTeam);
      for (const opp of opponents) {
        if (!opponentStats[opp.playerId]) {
          opponentStats[opp.playerId] = { games: 0, wins: 0 };
        }
        opponentStats[opp.playerId].games++;
        if (isWin) opponentStats[opp.playerId].wins++;
      }
    }

    // Calculate streaks
    let currentStreak: PlayerStats['currentStreak'] = { type: 'none', count: 0 };
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;
    
    // Games are in descending order, so reverse for chronological streak calc
    const chronologicalOutcomes = [...gameOutcomes].reverse();
    
    for (const outcome of chronologicalOutcomes) {
      if (outcome.won) {
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > longestWinStreak) longestWinStreak = tempWinStreak;
      } else {
        tempLossStreak++;
        tempWinStreak = 0;
        if (tempLossStreak > longestLossStreak) longestLossStreak = tempLossStreak;
      }
    }
    
    // Current streak (from most recent games)
    if (gameOutcomes.length > 0) {
      const firstOutcome = gameOutcomes[0];
      currentStreak.type = firstOutcome.won ? 'win' : 'loss';
      currentStreak.count = 1;
      for (let i = 1; i < gameOutcomes.length; i++) {
        if (gameOutcomes[i].won === firstOutcome.won) {
          currentStreak.count++;
        } else {
          break;
        }
      }
    }

    // Performance trend (compare last 5 games to overall)
    const recentGamesForTrend = gameOutcomes.slice(0, 5);
    const recentWins = recentGamesForTrend.filter(g => g.won).length;
    const recentWinRate = recentGamesForTrend.length > 0 
      ? Math.round((recentWins / recentGamesForTrend.length) * 100) 
      : 0;
    const overallWinRate = player.gamesPlayed > 0 
      ? Math.round((player.wins / player.gamesPlayed) * 100) 
      : 0;
    
    let performanceTrend: PlayerStats['performanceTrend'] = 'stable';
    if (recentGamesForTrend.length >= 3) {
      if (recentWinRate > overallWinRate + 10) performanceTrend = 'improving';
      else if (recentWinRate < overallWinRate - 10) performanceTrend = 'declining';
    }

    // Score differential
    const avgPointsFor = games.length > 0 ? Math.round(totalPointsFor / games.length * 10) / 10 : 0;
    const avgPointsAgainst = games.length > 0 ? Math.round(totalPointsAgainst / games.length * 10) / 10 : 0;
    const avgScoreDifferential = Math.round((avgPointsFor - avgPointsAgainst) * 10) / 10;

    // Build frequent partners list
    const frequentPartners: PlayerStats['frequentPartners'] = Object.entries(partnerStats)
      .map(([partnerId, stats]) => ({
        player: playerMap.get(partnerId)!,
        gamesTogether: stats.games,
        winsTogether: stats.wins,
        winRate: Math.round((stats.wins / stats.games) * 100)
      }))
      .filter(p => p.player)
      .sort((a, b) => b.gamesTogether - a.gamesTogether)
      .slice(0, 5);

    // Best partner
    let bestPartner: PlayerStats['bestPartner'] = null;
    if (frequentPartners.length > 0) {
      const best = frequentPartners.reduce((best, current) => 
        current.winsTogether > best.winsTogether ? current : best
      );
      bestPartner = { player: best.player, winsTogether: best.winsTogether };
    }

    // Build rivals (most played against)
    const rivals: PlayerStats['rivals'] = Object.entries(opponentStats)
      .map(([oppId, stats]) => ({
        player: playerMap.get(oppId)!,
        gamesAgainst: stats.games,
        winsAgainst: stats.wins,
        lossesAgainst: stats.games - stats.wins,
        winRate: Math.round((stats.wins / stats.games) * 100)
      }))
      .filter(r => r.player)
      .sort((a, b) => b.gamesAgainst - a.gamesAgainst)
      .slice(0, 5);

    // Favorite opponents (highest win rate, min 2 games)
    const favoriteOpponents: PlayerStats['favoriteOpponents'] = Object.entries(opponentStats)
      .filter(([_, stats]) => stats.games >= 2)
      .map(([oppId, stats]) => ({
        player: playerMap.get(oppId)!,
        gamesAgainst: stats.games,
        winsAgainst: stats.wins,
        lossesAgainst: stats.games - stats.wins,
        winRate: Math.round((stats.wins / stats.games) * 100)
      }))
      .filter(r => r.player)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 3);

    // Build full game history list (all games, filtered on frontend by time range)
    const recentGames: PlayerStats['recentGames'] = games.map(game => {
      const gameParticipantsList = allParticipants.filter(p => p.gameId === game.id);
      const playerInGame = gameParticipantsList.find(p => p.playerId === playerId)!;
      const playerTeam = playerInGame.team;
      
      const partner = gameParticipantsList.find(
        p => p.team === playerTeam && p.playerId !== playerId
      );
      const opponents = gameParticipantsList.filter(
        p => p.team !== playerTeam
      );

      const pointsChange = playerInGame.skillScoreAfter - playerInGame.skillScoreBefore;
      const pointsGained = pointsChange > 0 ? pointsChange : 0;
      const pointsLost = pointsChange < 0 ? Math.abs(pointsChange) : 0;

      return {
        gameId: game.id,
        sessionId: game.sessionId,
        partnerId: partner ? partner.playerId : null,
        partnerName: partner ? (playerMap.get(partner.playerId)?.name || 'Unknown') : 'Solo',
        opponentIds: opponents.map(o => o.playerId),
        opponentNames: opponents.map(o => playerMap.get(o.playerId)?.name || 'Unknown'),
        won: game.winningTeam === playerTeam,
        score: `${game.team1Score}-${game.team2Score}`,
        date: game.createdAt,
        pointsGained: pointsGained > 0 ? pointsGained : undefined,
        pointsLost: pointsLost > 0 ? pointsLost : undefined,
        skillScoreBefore: playerInGame.skillScoreBefore,
        skillScoreAfter: playerInGame.skillScoreAfter
      };
    });

    return {
      player,
      winRate: player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0,
      totalGames: player.gamesPlayed,
      totalWins: player.wins,
      currentStreak,
      longestWinStreak,
      longestLossStreak,
      rankBySkillScore,
      rankByWins,
      rankByWinRate,
      totalPlayersRanked: allPlayers.length,
      performanceTrend,
      recentWinRate,
      avgScoreDifferential,
      avgPointsFor,
      avgPointsAgainst,
      bestPartner,
      frequentPartners,
      rivals,
      favoriteOpponents,
      recentGames
    };
  }

  // Court operations
  async getCourt(id: string): Promise<Court | undefined> {
    const [court] = await db.select().from(courts).where(eq(courts.id, id));
    return court || undefined;
  }

  async getCourtsBySession(sessionId: string): Promise<Court[]> {
    return await db.select().from(courts).where(eq(courts.sessionId, sessionId));
  }

  async createCourt(insertCourt: InsertCourt): Promise<Court> {
    const id = randomUUID();
    const [court] = await db
      .insert(courts)
      .values({ 
        ...insertCourt, 
        id,
        status: insertCourt.status || 'available',
        timeRemaining: insertCourt.timeRemaining || 0,
        winningTeam: insertCourt.winningTeam || null
      })
      .returning();
    return court;
  }

  async updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined> {
    const [updated] = await db
      .update(courts)
      .set(updates)
      .where(eq(courts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCourt(id: string): Promise<boolean> {
    // Delete related court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, id));
    
    // Delete the court
    const result = await db.delete(courts).where(eq(courts.id, id)).returning();
    return result.length > 0;
  }

  // Court players operations
  async getCourtPlayers(courtId: string): Promise<string[]> {
    const playerData = await db
      .select()
      .from(courtPlayersTable)
      .where(eq(courtPlayersTable.courtId, courtId));
    return playerData.map(cp => cp.playerId);
  }

  async getCourtPlayersWithTeams(courtId: string): Promise<CourtPlayer[]> {
    return await db
      .select()
      .from(courtPlayersTable)
      .where(eq(courtPlayersTable.courtId, courtId));
  }

  async setCourtPlayers(courtId: string, playerIds: string[]): Promise<void> {
    // Legacy method - auto-assign teams
    const assignments = playerIds.map((playerId, index) => ({
      playerId,
      team: index < Math.ceil(playerIds.length / 2) ? 1 : 2
    }));
    await this.setCourtPlayersWithTeams(courtId, assignments);
  }

  async setCourtPlayersWithTeams(courtId: string, assignments: { playerId: string; team: number }[]): Promise<void> {
    // Clear existing court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, courtId));
    
    // Insert new assignments
    if (assignments.length > 0) {
      await db.insert(courtPlayersTable).values(
        assignments.map(a => ({
          courtId,
          playerId: a.playerId,
          team: a.team
        }))
      );
    }
  }

  // Queue operations (session-specific)
  async getQueue(sessionId: string): Promise<string[]> {
    const entries = await db
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.sessionId, sessionId))
      .orderBy(queueEntries.position); // Ascending order - first in queue has lowest position
    return entries.map(e => e.playerId);
  }

  async setQueue(sessionId: string, playerIds: string[]): Promise<void> {
    // Clear existing queue for this session
    await db.delete(queueEntries).where(eq(queueEntries.sessionId, sessionId));
    
    // Insert new queue
    if (playerIds.length > 0) {
      await db.insert(queueEntries).values(
        playerIds.map((playerId, index) => ({
          id: randomUUID(),
          sessionId,
          playerId,
          position: index
        }))
      );
    }
  }

  async addToQueue(sessionId: string, playerId: string): Promise<void> {
    // Check if player already in queue for this session
    const existing = await db
      .select()
      .from(queueEntries)
      .where(and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.playerId, playerId)
      ));
    
    if (existing.length === 0) {
      // Get max position for this session
      const allEntries = await db
        .select()
        .from(queueEntries)
        .where(eq(queueEntries.sessionId, sessionId));
      const maxPosition = allEntries.length > 0 
        ? Math.max(...allEntries.map(e => e.position)) 
        : -1;
      
      await db.insert(queueEntries).values({
        id: randomUUID(),
        sessionId,
        playerId,
        position: maxPosition + 1
      });
    }
  }

  async removeFromQueue(sessionId: string, playerId: string): Promise<void> {
    await db.delete(queueEntries).where(
      and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.playerId, playerId)
      )
    );
  }

  // Complex queries
  async getCourtsWithPlayers(sessionId: string): Promise<CourtWithPlayers[]> {
    const allCourts = await this.getCourtsBySession(sessionId);
    const courtsWithPlayers: CourtWithPlayers[] = [];

    for (const court of allCourts) {
      const courtPlayerData = await this.getCourtPlayersWithTeams(court.id);
      const playersWithTeams = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await this.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is Player & { team: number } => p !== null);

      courtsWithPlayers.push({
        ...court,
        players: playersWithTeams,
      });
    }

    return courtsWithPlayers;
  }

  async getSessionGameHistory(sessionId: string): Promise<any[]> {
    const games = await db
      .select()
      .from(gameResults)
      .where(eq(gameResults.sessionId, sessionId))
      .orderBy(desc(gameResults.createdAt));
    
    return games;
  }

  async getSessionGameParticipants(sessionId: string): Promise<(GameParticipant & { createdAt: Date })[]> {
    // Join game participants with game results to get session ID and createdAt
    const participants = await db
      .select({
        gameId: gameParticipants.gameId,
        playerId: gameParticipants.playerId,
        team: gameParticipants.team,
        skillScoreBefore: gameParticipants.skillScoreBefore,
        skillScoreAfter: gameParticipants.skillScoreAfter,
        createdAt: gameResults.createdAt,
      })
      .from(gameParticipants)
      .innerJoin(gameResults, eq(gameParticipants.gameId, gameResults.id))
      .where(eq(gameResults.sessionId, sessionId))
      .orderBy(desc(gameResults.createdAt));
    
    return participants;
  }

  // ============================================================
  // MARKETPLACE OPERATIONS
  // ============================================================

  async createMarketplaceUser(user: InsertMarketplaceUser): Promise<MarketplaceUser> {
    const id = randomUUID();
    const [created] = await db
      .insert(marketplaceUsers)
      .values({ ...user, id })
      .returning();
    return created;
  }

  async getMarketplaceUser(id: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db.select().from(marketplaceUsers).where(eq(marketplaceUsers.id, id));
    return user || undefined;
  }

  async getMarketplaceUserByResetToken(token: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db
      .select()
      .from(marketplaceUsers)
      .where(eq(marketplaceUsers.resetToken, token));
    return user || undefined;
  }

  async getMarketplaceUserByEmail(email: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db.select().from(marketplaceUsers).where(eq(marketplaceUsers.email, email));
    return user || undefined;
  }

  async getMarketplaceUserByLinkedPlayerId(playerId: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db
      .select()
      .from(marketplaceUsers)
      .where(eq(marketplaceUsers.linkedPlayerId, playerId));
    return user || undefined;
  }

  async createPlayerLinkOtp(input: { marketplaceUserId: string; playerId: string; channel: string; destination: string; codeHash: string; expiresAt: Date }): Promise<PlayerLinkOtp> {
    const [row] = await db.insert(playerLinkOtps).values({
      id: randomUUID(),
      marketplaceUserId: input.marketplaceUserId,
      playerId: input.playerId,
      channel: input.channel,
      destination: input.destination,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
    }).returning();
    return row;
  }

  async getLatestActivePlayerLinkOtp(marketplaceUserId: string, playerId: string): Promise<PlayerLinkOtp | undefined> {
    const [row] = await db
      .select()
      .from(playerLinkOtps)
      .where(and(
        eq(playerLinkOtps.marketplaceUserId, marketplaceUserId),
        eq(playerLinkOtps.playerId, playerId),
        sql`${playerLinkOtps.consumedAt} IS NULL`,
        sql`${playerLinkOtps.expiresAt} > NOW()`,
      ))
      .orderBy(desc(playerLinkOtps.createdAt))
      .limit(1);
    return row || undefined;
  }

  async countPlayerLinkOtpsForUserSince(marketplaceUserId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(playerLinkOtps)
      .where(and(
        eq(playerLinkOtps.marketplaceUserId, marketplaceUserId),
        gte(playerLinkOtps.createdAt, since),
      ));
    return row?.c ?? 0;
  }

  async countPlayerLinkOtpsForPairSince(marketplaceUserId: string, playerId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(playerLinkOtps)
      .where(and(
        eq(playerLinkOtps.marketplaceUserId, marketplaceUserId),
        eq(playerLinkOtps.playerId, playerId),
        gte(playerLinkOtps.createdAt, since),
      ));
    return row?.c ?? 0;
  }

  async incrementPlayerLinkOtpAttempts(otpId: string): Promise<PlayerLinkOtp | undefined> {
    const [row] = await db
      .update(playerLinkOtps)
      .set({ attempts: sql`${playerLinkOtps.attempts} + 1` })
      .where(eq(playerLinkOtps.id, otpId))
      .returning();
    return row || undefined;
  }

  async consumePlayerLinkOtp(otpId: string): Promise<void> {
    await db
      .update(playerLinkOtps)
      .set({ consumedAt: new Date() })
      .where(eq(playerLinkOtps.id, otpId));
  }

  async getMarketplaceUserByGoogleId(googleId: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db
      .select()
      .from(marketplaceUsers)
      .where(eq(marketplaceUsers.googleId, googleId));
    return user || undefined;
  }

  async searchMarketplaceUsersByName(query: string): Promise<MarketplaceUser[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    return await db
      .select()
      .from(marketplaceUsers)
      .where(sql`LOWER(${marketplaceUsers.name}) LIKE ${lowerQuery}`)
      .orderBy(asc(marketplaceUsers.name))
      .limit(10);
  }

  async updateMarketplaceUser(id: string, updates: Partial<MarketplaceUser>): Promise<MarketplaceUser | undefined> {
    const [updated] = await db
      .update(marketplaceUsers)
      .set(updates)
      .where(eq(marketplaceUsers.id, id))
      .returning();
    return updated || undefined;
  }

  // Atomically link a player to a marketplace user only if no other account already
  // owns it. Returns the updated user on success, or undefined if the player is
  // already claimed by someone else (race-safe at the SQL level).
  async linkPlayerIfUnclaimed(userId: string, playerId: string): Promise<MarketplaceUser | undefined> {
    const [updated] = await db
      .update(marketplaceUsers)
      .set({ linkedPlayerId: playerId })
      .where(sql`${marketplaceUsers.id} = ${userId} AND NOT EXISTS (
        SELECT 1 FROM ${marketplaceUsers} AS other
        WHERE other.linked_player_id = ${playerId} AND other.id <> ${userId}
      )`)
      .returning();
    return updated || undefined;
  }

  async getAllMarketplaceUsers(): Promise<MarketplaceUser[]> {
    return await db.select().from(marketplaceUsers).orderBy(desc(marketplaceUsers.createdAt));
  }

  async createMarketplaceAuthSession(userId: string, refreshToken: string, expiresAt: Date): Promise<void> {
    await db.insert(marketplaceAuthSessions).values({
      id: randomUUID(),
      userId,
      refreshToken,
      expiresAt,
    });
  }

  async findMarketplaceAuthSession(refreshToken: string): Promise<{ id: string; userId: string; refreshToken: string; expiresAt: Date } | undefined> {
    const [session] = await db
      .select()
      .from(marketplaceAuthSessions)
      .where(eq(marketplaceAuthSessions.refreshToken, refreshToken));
    return session || undefined;
  }

  async deleteMarketplaceAuthSession(id: string): Promise<void> {
    await db.delete(marketplaceAuthSessions).where(eq(marketplaceAuthSessions.id, id));
  }

  async createBookableSession(session: InsertBookableSession): Promise<BookableSession> {
    const id = randomUUID();
    const [created] = await db
      .insert(bookableSessions)
      .values({ ...session, id })
      .returning();
    return created;
  }

  async getBookableSession(id: string): Promise<BookableSession | undefined> {
    const [session] = await db.select().from(bookableSessions).where(eq(bookableSessions.id, id));
    return session || undefined;
  }

  async getBookableSessionByLinkedSessionId(linkedSessionId: string): Promise<BookableSession | undefined> {
    const [session] = await db.select().from(bookableSessions).where(eq(bookableSessions.linkedSessionId, linkedSessionId));
    return session || undefined;
  }

  async getBookableSessionWithAvailability(id: string): Promise<BookableSessionWithAvailability | undefined> {
    const session = await this.getBookableSession(id);
    if (!session) return undefined;
    const count = await this.getBookingCountForSession(id);
    const waitlistCount = await this.getWaitlistCountForSession(id);
    return { ...session, spotsRemaining: Math.max(0, session.capacity - count), totalBookings: count, waitlistCount };
  }

  async getAllBookableSessions(): Promise<BookableSessionWithAvailability[]> {
    const allSessions = await db.select().from(bookableSessions)
      .where(sql`${bookableSessions.linkedSessionId} IS NOT NULL`)
      .orderBy(asc(bookableSessions.date));
    const result: BookableSessionWithAvailability[] = [];
    for (const session of allSessions) {
      const count = await this.getBookingCountForSession(session.id);
      const waitlistCount = await this.getWaitlistCountForSession(session.id);
      result.push({ ...session, spotsRemaining: Math.max(0, session.capacity - count), totalBookings: count, waitlistCount });
    }
    return result;
  }

  async getUpcomingBookableSessions(): Promise<BookableSessionWithAvailability[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allSessions = await db.select().from(bookableSessions)
      .where(and(
        sql`${bookableSessions.linkedSessionId} IS NOT NULL`,
        gte(bookableSessions.date, today)
      ))
      .orderBy(asc(bookableSessions.date));
    const result: BookableSessionWithAvailability[] = [];
    for (const session of allSessions) {
      const count = await this.getBookingCountForSession(session.id);
      const waitlistCount = await this.getWaitlistCountForSession(session.id);
      result.push({ ...session, spotsRemaining: Math.max(0, session.capacity - count), totalBookings: count, waitlistCount });
    }
    return result;
  }

  async updateBookableSession(id: string, updates: Partial<BookableSession>): Promise<BookableSession | undefined> {
    const [updated] = await db
      .update(bookableSessions)
      .set(updates)
      .where(eq(bookableSessions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteBookableSession(id: string): Promise<boolean> {
    await db.delete(bookings).where(eq(bookings.sessionId, id));
    const result = await db.delete(bookableSessions).where(eq(bookableSessions.id, id)).returning();
    return result.length > 0;
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const [created] = await db
      .insert(bookings)
      .values({ ...booking, id })
      .returning();
    return created;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking || undefined;
  }

  async getBookingByZiinaPaymentIntentId(intentId: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.ziinaPaymentIntentId, intentId));
    return booking || undefined;
  }

  async getBookingWithDetails(id: string): Promise<BookingWithDetails | undefined> {
    const booking = await this.getBooking(id);
    if (!booking) return undefined;
    const session = await this.getBookableSession(booking.sessionId);
    if (!session) return undefined;
    const user = await this.getMarketplaceUser(booking.userId);
    const guests = await this.getBookingGuests(id);
    return { ...booking, session, user: user || undefined, guests };
  }

  async getUserBookings(userId: string): Promise<BookingWithDetails[]> {
    const userBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt));
    const result: BookingWithDetails[] = [];
    for (const booking of userBookings) {
      const session = await this.getBookableSession(booking.sessionId);
      if (session) {
        const guests = await this.getBookingGuests(booking.id);
        result.push({ ...booking, session, guests });
      }
    }
    return result;
  }

  async getUserBookingForSession(userId: string, sessionId: string): Promise<Booking | undefined> {
    // Only return an active (non-cancelled) booking so historical cancelled rows don't block re-booking
    const results = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), eq(bookings.sessionId, sessionId)))
      .orderBy(desc(bookings.createdAt));
    return results.find(b => b.status !== 'cancelled');
  }

  async getSessionBookings(sessionId: string): Promise<BookingWithDetails[]> {
    const sessionBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.sessionId, sessionId))
      .orderBy(desc(bookings.createdAt));
    const result: BookingWithDetails[] = [];
    for (const booking of sessionBookings) {
      const session = await this.getBookableSession(booking.sessionId);
      const user = await this.getMarketplaceUser(booking.userId);
      const guests = await this.getBookingGuests(booking.id);
      if (session) result.push({ ...booking, session, user: user || undefined, guests });
    }
    return result;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const [updated] = await db
      .update(bookings)
      .set(updates)
      .where(eq(bookings.id, id))
      .returning();
    return updated || undefined;
  }

  async getBookingCountForSession(sessionId: string): Promise<number> {
    // Count total spots across all confirmed/attended/pending_payment bookings.
    // pending_payment bookings hold a reserved spot (waitlist-promoted, awaiting Ziina payment).
    const activeBookings = await db
      .select({ spotsBooked: bookings.spotsBooked })
      .from(bookings)
      .where(and(
        eq(bookings.sessionId, sessionId),
        sql`${bookings.status} IN ('confirmed', 'attended', 'pending_payment')`
      ));
    return activeBookings.reduce((sum, b) => sum + (b.spotsBooked ?? 1), 0);
  }

  async getWaitlistedBookingsForSession(sessionId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, 'waitlisted')))
      .orderBy(asc(bookings.createdAt));
  }

  async getWaitlistCountForSession(sessionId: string): Promise<number> {
    const waitlisted = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, 'waitlisted')));
    return waitlisted.length;
  }

  async createBookingGuest(guest: InsertBookingGuest): Promise<BookingGuest> {
    const id = randomUUID();
    const [created] = await db
      .insert(bookingGuests)
      .values({ ...guest, id })
      .returning();
    return created;
  }

  async getBookingGuests(bookingId: string): Promise<import("@shared/schema").BookingGuestWithLinked[]> {
    const rows = await db
      .select({
        id: bookingGuests.id,
        bookingId: bookingGuests.bookingId,
        name: bookingGuests.name,
        email: bookingGuests.email,
        linkedUserId: bookingGuests.linkedUserId,
        isPrimary: bookingGuests.isPrimary,
        status: bookingGuests.status,
        cancelledAt: bookingGuests.cancelledAt,
        cancellationToken: bookingGuests.cancellationToken,
        createdAt: bookingGuests.createdAt,
        linkedPlayerId: marketplaceUsers.linkedPlayerId,
      })
      .from(bookingGuests)
      .leftJoin(marketplaceUsers, eq(bookingGuests.linkedUserId, marketplaceUsers.id))
      .where(eq(bookingGuests.bookingId, bookingId))
      .orderBy(asc(bookingGuests.createdAt));
    return rows;
  }

  async getBookingGuestByToken(token: string): Promise<BookingGuest | undefined> {
    const [guest] = await db
      .select()
      .from(bookingGuests)
      .where(eq(bookingGuests.cancellationToken, token));
    return guest || undefined;
  }

  async getBookingGuestByPendingPaymentIntentId(intentId: string): Promise<BookingGuest | undefined> {
    const [guest] = await db
      .select()
      .from(bookingGuests)
      .where(eq(bookingGuests.pendingPaymentIntentId, intentId))
      .limit(1);
    return guest || undefined;
  }

  async deleteBookingGuest(id: string): Promise<void> {
    await db.delete(bookingGuests).where(eq(bookingGuests.id, id));
  }

  async updateBookingGuest(id: string, updates: Partial<BookingGuest>): Promise<BookingGuest | undefined> {
    const [updated] = await db
      .update(bookingGuests)
      .set(updates)
      .where(eq(bookingGuests.id, id))
      .returning();
    return updated || undefined;
  }

  async getActiveGuestCountForSession(sessionId: string): Promise<number> {
    // Count active guests linked to confirmed/attended bookings for this session
    const activeBookingIds = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.sessionId, sessionId),
        sql`${bookings.status} IN ('confirmed', 'attended')`
      ));
    if (activeBookingIds.length === 0) return 0;
    const ids = activeBookingIds.map(b => b.id);
    const guestRows = await db
      .select()
      .from(bookingGuests)
      .where(and(
        inArray(bookingGuests.bookingId, ids),
        eq(bookingGuests.status, 'confirmed')
      ));
    return guestRows.length;
  }

  async linkGuestsByEmail(email: string, userId: string): Promise<void> {
    // Only link non-primary guest rows — primary rows are already owned by the booker
    await db
      .update(bookingGuests)
      .set({ linkedUserId: userId })
      .where(and(
        eq(bookingGuests.email, email),
        eq(bookingGuests.isPrimary, false),
        sql`${bookingGuests.linkedUserId} IS NULL`,
      ));
  }

  async getGuestBookingsForUser(userId: string): Promise<BookingWithDetails[]> {
    // Find confirmed non-primary booking_guests rows linked to this user
    // isPrimary=true rows belong to the booking owner — shown via getUserBookings, not here
    const guestRows = await db
      .select()
      .from(bookingGuests)
      .where(and(
        eq(bookingGuests.linkedUserId, userId),
        eq(bookingGuests.status, 'confirmed'),
        eq(bookingGuests.isPrimary, false),
      ));
    const result: BookingWithDetails[] = [];
    for (const guest of guestRows) {
      const booking = await this.getBookingWithDetails(guest.bookingId);
      if (booking) {
        const primaryBooker = await this.getMarketplaceUser(booking.userId);
        result.push({ ...booking, isGuestBooking: true, bookedByName: primaryBooker?.name, myGuestId: guest.id });
      }
    }
    return result;
  }

  async getBookingsNeedingReminder(): Promise<BookingWithDetails[]> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const activeBookings = await db
      .select()
      .from(bookings)
      .where(and(
        sql`${bookings.status} IN ('confirmed', 'attended')`,
        sql`${bookings.reminderSentAt} IS NULL`,
      ));

    const result: BookingWithDetails[] = [];
    for (const booking of activeBookings) {
      const session = await this.getBookableSession(booking.sessionId);
      if (!session) continue;

      // Compute actual session start datetime from date + startTime (same pattern as cancellation cutoff)
      // startTime is stored as "HH:MM" text
      const [hours, minutes] = session.startTime.split(':').map(Number);
      const sessionStartAt = new Date(session.date);
      sessionStartAt.setHours(hours, minutes, 0, 0);

      if (sessionStartAt >= windowStart && sessionStartAt <= windowEnd) {
        const user = await this.getMarketplaceUser(booking.userId);
        result.push({ ...booking, session, user: user || undefined });
      }
    }
    return result;
  }

  async getExpiredPendingPaymentBookings(olderThanMs: number): Promise<Booking[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.status, 'pending_payment'),
        sql`${bookings.promotedAt} IS NOT NULL`,
        lt(bookings.promotedAt, cutoff),
      ));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const [created] = await db
      .insert(payments)
      .values({ ...payment, id })
      .returning();
    return created;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPaymentByBookingId(bookingId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
    return payment || undefined;
  }

  async getPaymentsByBookingId(bookingId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.bookingId, bookingId));
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [updated] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return updated || undefined;
  }

  async createMarketplaceNotification(data: { userId: string; type: string; title: string; message: string; relatedBookingId?: string }): Promise<MarketplaceNotification> {
    const id = randomUUID();
    const [created] = await db
      .insert(marketplaceNotifications)
      .values({ id, ...data, relatedBookingId: data.relatedBookingId || null })
      .returning();
    return created;
  }

  async getNotificationsForUser(userId: string): Promise<MarketplaceNotification[]> {
    return await db
      .select()
      .from(marketplaceNotifications)
      .where(eq(marketplaceNotifications.userId, userId))
      .orderBy(desc(marketplaceNotifications.createdAt));
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(marketplaceNotifications)
      .set({ read: true })
      .where(eq(marketplaceNotifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(marketplaceNotifications)
      .set({ read: true })
      .where(eq(marketplaceNotifications.userId, userId));
  }

  async getRefundNotifications(): Promise<RefundNotificationWithDetails[]> {
    const rows = await db
      .select({
        id: marketplaceNotifications.id,
        message: marketplaceNotifications.message,
        createdAt: marketplaceNotifications.createdAt,
        read: marketplaceNotifications.read,
        relatedBookingId: marketplaceNotifications.relatedBookingId,
        amountAed: bookings.amountAed,
        spotsBooked: bookings.spotsBooked,
        paymentMethod: bookings.paymentMethod,
        ziinaPaymentIntentId: bookings.ziinaPaymentIntentId,
        bookingSessionId: bookings.sessionId,
        playerName: marketplaceUsers.name,
        playerEmail: marketplaceUsers.email,
        sessionTitle: bookableSessions.title,
        sessionDate: bookableSessions.date,
        sessionVenueName: bookableSessions.venueName,
      })
      .from(marketplaceNotifications)
      .leftJoin(bookings, eq(marketplaceNotifications.relatedBookingId, bookings.id))
      .leftJoin(marketplaceUsers, eq(bookings.userId, marketplaceUsers.id))
      .leftJoin(bookableSessions, eq(bookings.sessionId, bookableSessions.id))
      .where(eq(marketplaceNotifications.type, 'refund_required'))
      .orderBy(desc(marketplaceNotifications.createdAt));

    return rows.map(row => ({
      id: row.id,
      message: row.message,
      createdAt: row.createdAt,
      read: row.read,
      relatedBookingId: row.relatedBookingId ?? null,
      amountAed: row.amountAed ?? null,
      spotsBooked: row.spotsBooked ?? null,
      paymentMethod: row.paymentMethod ?? null,
      ziinaPaymentIntentId: row.ziinaPaymentIntentId ?? null,
      bookingSessionId: row.bookingSessionId ?? null,
      playerName: row.playerName ?? null,
      playerEmail: row.playerEmail ?? null,
      sessionTitle: row.sessionTitle ?? null,
      sessionDate: row.sessionDate ?? null,
      sessionVenueName: row.sessionVenueName ?? null,
    }));
  }

  async resolveRefundNotification(id: string): Promise<boolean> {
    const [updated] = await db
      .update(marketplaceNotifications)
      .set({ read: true })
      .where(and(eq(marketplaceNotifications.id, id), eq(marketplaceNotifications.type, 'refund_required')))
      .returning({ id: marketplaceNotifications.id });
    return !!updated;
  }

  // Score dispute operations
  async createScoreDispute(data: { gameResultId: string; filedByUserId: string; note?: string }): Promise<ScoreDispute> {
    const id = randomUUID();
    const [dispute] = await db
      .insert(scoreDisputes)
      .values({ id, gameResultId: data.gameResultId, filedByUserId: data.filedByUserId, note: data.note ?? null, status: 'open' })
      .returning();
    return dispute;
  }

  async getScoreDispute(id: string): Promise<ScoreDispute | undefined> {
    const [dispute] = await db.select().from(scoreDisputes).where(eq(scoreDisputes.id, id));
    return dispute;
  }

  async getDisputeByUserAndGame(userId: string, gameResultId: string): Promise<ScoreDispute | undefined> {
    const [dispute] = await db
      .select()
      .from(scoreDisputes)
      .where(and(eq(scoreDisputes.filedByUserId, userId), eq(scoreDisputes.gameResultId, gameResultId)));
    return dispute;
  }

  async getAllDisputesWithDetails(): Promise<ScoreDisputeWithDetails[]> {
    const rows = await db
      .select({
        id: scoreDisputes.id,
        gameResultId: scoreDisputes.gameResultId,
        filedByUserId: scoreDisputes.filedByUserId,
        note: scoreDisputes.note,
        status: scoreDisputes.status,
        adminNote: scoreDisputes.adminNote,
        createdAt: scoreDisputes.createdAt,
        filedByName: marketplaceUsers.name,
        filedByEmail: marketplaceUsers.email,
        team1Score: gameResults.team1Score,
        team2Score: gameResults.team2Score,
        gameDate: gameResults.createdAt,
        sessionId: gameResults.sessionId,
      })
      .from(scoreDisputes)
      .innerJoin(marketplaceUsers, eq(scoreDisputes.filedByUserId, marketplaceUsers.id))
      .innerJoin(gameResults, eq(scoreDisputes.gameResultId, gameResults.id))
      .orderBy(desc(scoreDisputes.createdAt));
    return rows.map(r => ({
      ...r,
      gameScore: `${r.team1Score} - ${r.team2Score}`,
    }));
  }

  async getDisputesByUser(userId: string): Promise<ScoreDispute[]> {
    return db.select().from(scoreDisputes).where(eq(scoreDisputes.filedByUserId, userId)).orderBy(desc(scoreDisputes.createdAt));
  }

  async updateScoreDispute(id: string, updates: Partial<ScoreDispute>): Promise<ScoreDispute | undefined> {
    const [updated] = await db
      .update(scoreDisputes)
      .set(updates)
      .where(eq(scoreDisputes.id, id))
      .returning();
    return updated;
  }

  // ── Player Personality Tags ────────────────────────────────────────────────

  async getAllTags(): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.isActive, true)).orderBy(asc(tags.category), asc(tags.label));
  }

  async getTrendingTags(limit = 5): Promise<TrendingTag[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ tagId: playerTags.tagId, count: sql<number>`count(*)::int` })
      .from(playerTags)
      .where(gte(playerTags.createdAt, sevenDaysAgo))
      .groupBy(playerTags.tagId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    const result: TrendingTag[] = [];
    for (const row of rows) {
      const [tag] = await db.select().from(tags).where(eq(tags.id, row.tagId));
      if (tag) result.push({ tag, count: row.count });
    }
    return result;
  }

  async getPlayerTopTags(playerId: string, limit = 3): Promise<PlayerTopTag[]> {
    const rows = await db
      .select({ tagId: playerTags.tagId, count: sql<number>`count(*)::int` })
      .from(playerTags)
      .where(eq(playerTags.taggedPlayerId, playerId))
      .groupBy(playerTags.tagId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    const result: PlayerTopTag[] = [];
    for (const row of rows) {
      const [tag] = await db.select().from(tags).where(eq(tags.id, row.tagId));
      if (tag) result.push({ tag, count: row.count });
    }
    return result;
  }

  async getPlayersWithTag(tagId: string, limit = 10): Promise<Array<{ player: Player; count: number }>> {
    const rows = await db
      .select({ playerId: playerTags.taggedPlayerId, count: sql<number>`count(*)::int` })
      .from(playerTags)
      .where(eq(playerTags.tagId, tagId))
      .groupBy(playerTags.taggedPlayerId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    const result: Array<{ player: Player; count: number }> = [];
    for (const row of rows) {
      const [player] = await db.select().from(players).where(eq(players.id, row.playerId));
      if (player) result.push({ player: addSkidToPlayer(player), count: row.count });
    }
    return result;
  }

  async createPlayerTags(entries: InsertPlayerTag[]): Promise<PlayerTag[]> {
    if (entries.length === 0) return [];
    const inserted = await db
      .insert(playerTags)
      .values(entries.map(e => ({ ...e, id: randomUUID() })))
      .returning();
    return inserted;
  }

  async getPlayerTagsForGame(gameResultId: string, taggedByPlayerId: string): Promise<PlayerTag[]> {
    return db.select().from(playerTags).where(
      and(
        eq(playerTags.gameResultId, gameResultId),
        eq(playerTags.taggedByPlayerId, taggedByPlayerId)
      )
    );
  }

  async getTaggedGameIds(taggedByPlayerId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ gameResultId: playerTags.gameResultId })
      .from(playerTags)
      .where(eq(playerTags.taggedByPlayerId, taggedByPlayerId));
    return rows.map(r => r.gameResultId);
  }

  async getGameParticipantInfo(gameResultId: string): Promise<GameParticipantInfo[]> {
    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        team: gameParticipants.team,
      })
      .from(gameParticipants)
      .innerJoin(players, eq(gameParticipants.playerId, players.id))
      .where(eq(gameParticipants.gameId, gameResultId));
    return rows;
  }

  async getAllPlayersTopTag(): Promise<PlayerTopTagEntry[]> {
    // Single query: DISTINCT ON gets highest-count tag per player, joined with tags table
    const rows = await db.execute<{
      player_id: string;
      tag_id: string;
      cnt: number;
      tag_label: string;
      tag_emoji: string;
      tag_category: string;
    }>(sql`
      SELECT DISTINCT ON (pt.tagged_player_id)
        pt.tagged_player_id AS player_id,
        pt.tag_id,
        count(*)::int AS cnt,
        t.label AS tag_label,
        t.emoji AS tag_emoji,
        t.category AS tag_category
      FROM player_tags pt
      JOIN tags t ON t.id = pt.tag_id
      GROUP BY pt.tagged_player_id, pt.tag_id, t.label, t.emoji, t.category
      ORDER BY pt.tagged_player_id, cnt DESC
    `);

    return rows.rows.map(r => ({
      playerId: r.player_id,
      tag: { id: r.tag_id, label: r.tag_label, emoji: r.tag_emoji, category: r.tag_category } as Tag,
      count: Number(r.cnt),
    }));
  }

  async getCommunitySpotlight(limit = 5): Promise<CommunitySpotlightEntry[]> {
    // Single query: trending tags this week + top player per tag within the same window
    const rows = await db.execute<{
      tag_id: string;
      weekly_count: number;
      tag_label: string;
      tag_emoji: string;
      tag_category: string;
      top_player_id: string;
      top_player_name: string;
      top_player_level: string;
      top_player_skill_score: number;
      top_player_shuttle_iq_id: string | null;
    }>(sql`
      WITH weekly AS (
        SELECT tag_id, tagged_player_id, count(*)::int AS cnt
        FROM player_tags
        WHERE created_at >= now() - interval '7 days'
        GROUP BY tag_id, tagged_player_id
      ),
      tag_totals AS (
        SELECT tag_id, sum(cnt)::int AS weekly_count
        FROM weekly
        GROUP BY tag_id
        ORDER BY weekly_count DESC
        LIMIT ${limit}
      ),
      top_players AS (
        SELECT DISTINCT ON (w.tag_id)
          w.tag_id,
          w.tagged_player_id AS top_player_id,
          w.cnt AS top_cnt
        FROM weekly w
        JOIN tag_totals tt ON tt.tag_id = w.tag_id
        ORDER BY w.tag_id, w.cnt DESC
      )
      SELECT
        tt.tag_id,
        tt.weekly_count,
        t.label AS tag_label,
        t.emoji AS tag_emoji,
        t.category AS tag_category,
        p.id AS top_player_id,
        p.name AS top_player_name,
        p.level AS top_player_level,
        p.skill_score AS top_player_skill_score,
        p.shuttle_iq_id AS top_player_shuttle_iq_id
      FROM tag_totals tt
      JOIN tags t ON t.id = tt.tag_id
      JOIN top_players tp ON tp.tag_id = tt.tag_id
      JOIN players p ON p.id = tp.top_player_id
      ORDER BY tt.weekly_count DESC
    `);

    return rows.rows.map(r => ({
      tag: { id: r.tag_id, label: r.tag_label, emoji: r.tag_emoji, category: r.tag_category } as Tag,
      count: Number(r.weekly_count),
      topPlayer: {
        id: r.top_player_id,
        name: r.top_player_name,
        level: r.top_player_level,
        skillScore: Number(r.top_player_skill_score),
        shuttleIqId: r.top_player_shuttle_iq_id,
      },
    }));
  }

  async getRecentReceivedTags(taggedPlayerId: string, limit = 5): Promise<ReceivedTagEntry[]> {
    // Single joined query — avoids N+1 lookups per received tag
    const rows = await db.execute<{
      tagger_name: string;
      tag_id: string;
      tag_label: string;
      tag_emoji: string;
      tag_category: string;
      venue_name: string | null;
      created_at: string;
    }>(sql`
      SELECT
        tagger.name AS tagger_name,
        t.id AS tag_id,
        t.label AS tag_label,
        t.emoji AS tag_emoji,
        t.category AS tag_category,
        s.venue_name AS venue_name,
        pt.created_at
      FROM player_tags pt
      JOIN tags t ON t.id = pt.tag_id
      JOIN players tagger ON tagger.id = pt.tagged_by_player_id
      LEFT JOIN game_results gr ON gr.id = pt.game_result_id
      LEFT JOIN sessions s ON s.id = gr.session_id
      WHERE pt.tagged_player_id = ${taggedPlayerId}
      ORDER BY pt.created_at DESC
      LIMIT ${limit}
    `);

    return rows.rows.map(r => ({
      taggerInitial: r.tagger_name.charAt(0).toUpperCase(),
      tag: { id: r.tag_id, label: r.tag_label, emoji: r.tag_emoji, category: r.tag_category } as Tag,
      sessionName: r.venue_name ?? 'a session',
      createdAt: r.created_at,
    }));
  }

  async getTagCountsForTargets(
    targetPlayerIds: string[],
    tagIds: string[]
  ): Promise<TagCountResult[]> {
    if (targetPlayerIds.length === 0 || tagIds.length === 0) return [];
    // Single batch query — only for the submitted player+tag pairs
    const rows = await db
      .select({
        playerId: playerTags.taggedPlayerId,
        tagId: playerTags.tagId,
        newCount: sql<number>`count(*)::int`,
      })
      .from(playerTags)
      .where(
        and(
          inArray(playerTags.taggedPlayerId, targetPlayerIds),
          inArray(playerTags.tagId, tagIds)
        )
      )
      .groupBy(playerTags.taggedPlayerId, playerTags.tagId);
    return rows.map(r => ({ playerId: r.playerId, tagId: r.tagId, newCount: Number(r.newCount) }));
  }

  async getPublicAnalytics({ sessionId, from, to }: { sessionId?: string; from?: Date; to?: Date }) {
    // Build booking-level conditions (date range applies to booking creation time)
    const bookingConditions: SQL[] = [];
    if (sessionId) bookingConditions.push(eq(bookings.sessionId, sessionId));
    if (from) bookingConditions.push(gte(bookings.createdAt, from));
    if (to) {
      // Advance one day so `to=YYYY-MM-DD` is inclusive for that calendar day
      const exclusiveTo = new Date(to);
      exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
      bookingConditions.push(lt(bookings.createdAt, exclusiveTo));
    }

    // Fetch all bookings that match the filters
    const bookingRows = await db
      .select({
        id: bookings.id,
        sessionId: bookings.sessionId,
        status: bookings.status,
        paymentMethod: bookings.paymentMethod,
        amountAed: bookings.amountAed,
        cashPaid: bookings.cashPaid,
        spotsBooked: bookings.spotsBooked,
        lateFeeApplied: bookings.lateFeeApplied,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(bookingConditions.length > 0 ? and(...bookingConditions) : undefined)
      .orderBy(asc(bookings.createdAt));

    // Fetch all bookable sessions (scoped by sessionId filter when provided)
    const sessionRows = await db
      .select({
        id: bookableSessions.id,
        title: bookableSessions.title,
        date: bookableSessions.date,
        startTime: bookableSessions.startTime,
        endTime: bookableSessions.endTime,
        venueName: bookableSessions.venueName,
        priceAed: bookableSessions.priceAed,
        capacity: bookableSessions.capacity,
      })
      .from(bookableSessions)
      .where(sessionId ? eq(bookableSessions.id, sessionId) : undefined)
      .orderBy(asc(bookableSessions.date));

    type BookingRow = typeof bookingRows[0];

    const isActive = (b: BookingRow) => ['confirmed', 'attended'].includes(b.status);
    const confirmed = bookingRows.filter(isActive);
    const waitlisted = bookingRows.filter(b => b.status === 'waitlisted');
    const cancelled = bookingRows.filter(b => b.status === 'cancelled');

    const cardBookings = confirmed.filter(b => b.paymentMethod === 'ziina');
    const cashBookings = confirmed.filter(b => b.paymentMethod === 'cash');
    const cashPaid = cashBookings.filter(b => b.cashPaid);
    const cashPending = cashBookings.filter(b => !b.cashPaid);

    const sumField = (arr: BookingRow[], field: 'amountAed' | 'spotsBooked') =>
      arr.reduce((s, b) => s + b[field], 0);

    // Build booking map keyed by sessionId for the per-session breakdown
    const bookingsBySession = new Map<string, BookingRow[]>();
    for (const b of bookingRows) {
      const list = bookingsBySession.get(b.sessionId) ?? [];
      list.push(b);
      bookingsBySession.set(b.sessionId, list);
    }

    // Per-session breakdown — includes ALL bookable sessions, even those with zero bookings
    const sessionBreakdowns = sessionRows.map(s => {
      const bkgs = bookingsBySession.get(s.id) ?? [];
      const conf = bkgs.filter(isActive);
      const wait = bkgs.filter(b => b.status === 'waitlisted');
      const canc = bkgs.filter(b => b.status === 'cancelled');
      return {
        id: s.id,
        title: s.title,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        venue: s.venueName,
        pricePerSpotAed: s.priceAed,
        capacity: s.capacity,
        confirmed: {
          bookings: conf.length,
          spots: sumField(conf, 'spotsBooked'),
          revenueAed: sumField(conf, 'amountAed'),
          collectedAed:
            sumField(conf.filter(b => b.paymentMethod === 'ziina'), 'amountAed') +
            sumField(conf.filter(b => b.paymentMethod === 'cash' && b.cashPaid), 'amountAed'),
          pendingCashAed: sumField(conf.filter(b => b.paymentMethod === 'cash' && !b.cashPaid), 'amountAed'),
        },
        waitlisted: {
          bookings: wait.length,
          spots: sumField(wait, 'spotsBooked'),
        },
        cancelled: {
          bookings: canc.length,
          spots: sumField(canc, 'spotsBooked'),
          lateFeesAed: sumField(canc.filter(b => b.lateFeeApplied), 'amountAed'),
        },
      };
    });

    // Monthly summary (by booking creation month, confirmed bookings only)
    const monthMap = new Map<string, BookingRow[]>();
    for (const b of confirmed) {
      const m = b.createdAt.toISOString().substring(0, 7);
      const list = monthMap.get(m) ?? [];
      list.push(b);
      monthMap.set(m, list);
    }
    const monthly = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bkgs]) => ({
        month,
        confirmedBookings: bkgs.length,
        totalSpotsBooked: sumField(bkgs, 'spotsBooked'),
        revenueChargedAed: sumField(bkgs, 'amountAed'),
        revenueCollectedAed:
          sumField(bkgs.filter(b => b.paymentMethod === 'ziina'), 'amountAed') +
          sumField(bkgs.filter(b => b.paymentMethod === 'cash' && b.cashPaid), 'amountAed'),
        revenuePendingCashAed: sumField(bkgs.filter(b => b.paymentMethod === 'cash' && !b.cashPaid), 'amountAed'),
      }));

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        sessionId: sessionId ?? null,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      totals: {
        confirmedBookings: confirmed.length,
        totalSpotsBooked: sumField(confirmed, 'spotsBooked'),
        revenueChargedAed: sumField(confirmed, 'amountAed'),
        revenueCollectedAed: sumField(cardBookings, 'amountAed') + sumField(cashPaid, 'amountAed'),
        revenuePendingCashAed: sumField(cashPending, 'amountAed'),
        cancelledBookings: cancelled.length,
        lateFeesRetainedAed: sumField(cancelled.filter(b => b.lateFeeApplied), 'amountAed'),
        waitlistedBookings: waitlisted.length,
        byPaymentMethod: {
          card: {
            bookings: cardBookings.length,
            spotsBooked: sumField(cardBookings, 'spotsBooked'),
            amountAed: sumField(cardBookings, 'amountAed'),
          },
          cash: {
            bookings: cashBookings.length,
            spotsBooked: sumField(cashBookings, 'spotsBooked'),
            amountAed: sumField(cashBookings, 'amountAed'),
            collectedAed: sumField(cashPaid, 'amountAed'),
            pendingAed: sumField(cashPending, 'amountAed'),
          },
        },
      },
      sessions: sessionBreakdowns,
      monthly,
    };
  }

  // ─── Finance / Accounting ─────────────────────────────────────────────────

  async getAllExpenseCategories(): Promise<ExpenseCategory[]> {
    return db.select().from(expenseCategories).orderBy(asc(expenseCategories.name));
  }

  async createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory> {
    const id = randomUUID();
    const [row] = await db.insert(expenseCategories).values({ id, ...data }).returning();
    return row;
  }

  async updateExpenseCategory(id: string, updates: Partial<ExpenseCategory>): Promise<ExpenseCategory | undefined> {
    const [row] = await db.update(expenseCategories).set(updates).where(eq(expenseCategories.id, id)).returning();
    return row;
  }

  async deleteExpenseCategory(id: string): Promise<void> {
    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  }

  async createExpense(data: InsertExpense): Promise<Expense> {
    const id = randomUUID();
    const now = new Date();
    const [row] = await db.insert(expenses).values({ id, ...data, createdAt: now, updatedAt: now }).returning();
    return row;
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    return row;
  }

  async getAllExpenses(filters?: { from?: Date; to?: Date; categoryId?: string }): Promise<ExpenseWithCategory[]> {
    const conditions: SQL[] = [];
    if (filters?.from) conditions.push(gte(expenses.date, filters.from));
    if (filters?.to) {
      const exclusiveTo = new Date(filters.to);
      exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
      conditions.push(lt(expenses.date, exclusiveTo));
    }
    if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));

    const rows = await db
      .select({
        id: expenses.id,
        categoryId: expenses.categoryId,
        amountAed: expenses.amountAed,
        description: expenses.description,
        vendor: expenses.vendor,
        paidBy: expenses.paidBy,
        date: expenses.date,
        notes: expenses.notes,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
        categoryName: expenseCategories.name,
        categoryColor: expenseCategories.color,
        categoryIcon: expenseCategories.icon,
      })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenses.date));

    return rows;
  }

  async updateExpense(id: string, updates: Partial<Pick<Expense, 'categoryId' | 'amountAed' | 'description' | 'vendor' | 'paidBy' | 'date' | 'notes'>>): Promise<Expense | undefined> {
    const [row] = await db
      .update(expenses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    return row;
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async getFinanceSummary(from: Date, to: Date): Promise<FinanceSummary> {
    // Advance `to` to be end-of-day inclusive
    const exclusiveTo = new Date(to);
    exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);

    // ── Revenue from bookings ──────────────────────────────────────────────
    const bookingRows = await db
      .select({
        status: bookings.status,
        paymentMethod: bookings.paymentMethod,
        amountAed: bookings.amountAed,
        cashPaid: bookings.cashPaid,
        lateFeeApplied: bookings.lateFeeApplied,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(and(gte(bookings.createdAt, from), lt(bookings.createdAt, exclusiveTo)));

    type BRow = typeof bookingRows[0];
    const isActive = (b: BRow) => ['confirmed', 'attended'].includes(b.status);
    const confirmed = bookingRows.filter(isActive);
    const cancelled = bookingRows.filter(b => b.status === 'cancelled');
    const cardRows = confirmed.filter(b => b.paymentMethod === 'ziina');
    const cashPaidRows = confirmed.filter(b => b.paymentMethod === 'cash' && b.cashPaid);
    const sumAed = (arr: BRow[]) => arr.reduce((s, b) => s + b.amountAed, 0);

    const chargedAed = sumAed(confirmed);
    const collectedAed = sumAed(cardRows) + sumAed(cashPaidRows);
    const pendingCashAed = sumAed(confirmed.filter(b => b.paymentMethod === 'cash' && !b.cashPaid));
    const lateFeesAed = sumAed(cancelled.filter(b => b.lateFeeApplied));

    // ── Expenses ──────────────────────────────────────────────────────────
    const expenseRows = await db
      .select({
        id: expenses.id,
        categoryId: expenses.categoryId,
        amountAed: expenses.amountAed,
        date: expenses.date,
        categoryName: expenseCategories.name,
        categoryColor: expenseCategories.color,
        categoryIcon: expenseCategories.icon,
      })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(and(gte(expenses.date, from), lt(expenses.date, exclusiveTo)));

    const totalExpensesAed = expenseRows.reduce((s, e) => s + e.amountAed, 0);

    // Aggregate by category
    const catMap = new Map<string, { id: string; name: string; color: string; icon: string; total: number; count: number }>();
    for (const e of expenseRows) {
      const existing = catMap.get(e.categoryId);
      if (existing) {
        existing.total += e.amountAed;
        existing.count += 1;
      } else {
        catMap.set(e.categoryId, { id: e.categoryId, name: e.categoryName, color: e.categoryColor, icon: e.categoryIcon, total: e.amountAed, count: 1 });
      }
    }
    const byCategory = Array.from(catMap.values())
      .map(c => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, totalAed: c.total, count: c.count }))
      .sort((a, b) => b.totalAed - a.totalAed);

    // ── Monthly rows ──────────────────────────────────────────────────────
    const revenueByMonth = new Map<string, number>();
    for (const b of confirmed) {
      const m = b.createdAt.toISOString().substring(0, 7);
      const amt = b.paymentMethod === 'ziina' ? b.amountAed : (b.cashPaid ? b.amountAed : 0);
      revenueByMonth.set(m, (revenueByMonth.get(m) ?? 0) + amt);
    }
    const expensesByMonth = new Map<string, number>();
    for (const e of expenseRows) {
      const m = e.date.toISOString().substring(0, 7);
      expensesByMonth.set(m, (expensesByMonth.get(m) ?? 0) + e.amountAed);
    }
    const allMonths = new Set([...Array.from(revenueByMonth.keys()), ...Array.from(expensesByMonth.keys())]);
    const monthlyRows = Array.from(allMonths)
      .sort()
      .map(month => {
        const rev = revenueByMonth.get(month) ?? 0;
        const exp = expensesByMonth.get(month) ?? 0;
        return { month, revenueCollectedAed: rev, expensesAed: exp, netAed: rev - exp };
      });

    return {
      revenue: { chargedAed, collectedAed, pendingCashAed, lateFeesAed },
      expenses: { totalAed: totalExpensesAed, byCategory },
      netProfitAed: collectedAed - totalExpensesAed,
      monthlyRows,
    };
  }

  // ─── Tag Suggestions ──────────────────────────────────────────────────────

  async createTagSuggestion(data: InsertTagSuggestion): Promise<TagSuggestion> {
    const id = randomUUID();
    const [row] = await db.insert(tagSuggestions).values({ ...data, id }).returning();
    return row;
  }

  async getTagSuggestions(status: 'pending' | 'approved' | 'rejected', viewerPlayerId?: string): Promise<TagSuggestionWithVote[]> {
    const rows = await db
      .select()
      .from(tagSuggestions)
      .where(eq(tagSuggestions.status, status))
      .orderBy(desc(tagSuggestions.voteCount), desc(tagSuggestions.createdAt));

    if (rows.length === 0) return [];

    const suggestionIds = rows.map(r => r.id);

    // Get player names for suggesters
    const suggesterIds = [...new Set(rows.map(r => r.suggestedByPlayerId))];
    const playerRows = await db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(inArray(players.id, suggesterIds));
    const playerMap = new Map(playerRows.map(p => [p.id, p.name]));

    // Get votes by viewer (if provided)
    const votedSet = new Set<string>();
    if (viewerPlayerId) {
      const votes = await db
        .select({ suggestionId: tagSuggestionVotes.suggestionId })
        .from(tagSuggestionVotes)
        .where(
          and(
            inArray(tagSuggestionVotes.suggestionId, suggestionIds),
            eq(tagSuggestionVotes.votedByPlayerId, viewerPlayerId)
          )
        );
      for (const v of votes) votedSet.add(v.suggestionId);
    }

    return rows.map(r => ({
      ...r,
      hasVoted: votedSet.has(r.id),
      suggestedByPlayerName: playerMap.get(r.suggestedByPlayerId) ?? 'Unknown',
    }));
  }

  async getTagSuggestionsByPlayer(playerId: string): Promise<TagSuggestion[]> {
    return await db
      .select()
      .from(tagSuggestions)
      .where(eq(tagSuggestions.suggestedByPlayerId, playerId))
      .orderBy(desc(tagSuggestions.createdAt));
  }

  private async _promoteTagSuggestion(suggestion: TagSuggestion): Promise<void> {
    // Check the tag doesn't already exist (dedup by label, case-insensitive)
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(sql`lower(${tags.label}) = lower(${suggestion.label})`);
    if (existing.length === 0) {
      await db.insert(tags).values({
        id: randomUUID(),
        label: suggestion.label,
        emoji: suggestion.emoji,
        category: suggestion.category,
        isActive: true,
      });
    }
    const now = new Date();
    await db
      .update(tagSuggestions)
      .set({ status: 'approved', reviewedAt: now, promotedAt: now })
      .where(eq(tagSuggestions.id, suggestion.id));
  }

  async voteTagSuggestion(suggestionId: string, playerId: string): Promise<{ alreadyVoted: boolean; ownSuggestion: boolean; notPending: boolean; newCount: number }> {
    // Fetch suggestion first to validate
    const [suggestion] = await db
      .select()
      .from(tagSuggestions)
      .where(eq(tagSuggestions.id, suggestionId));

    if (!suggestion) return { alreadyVoted: false, ownSuggestion: false, notPending: true, newCount: 0 };
    if (suggestion.status !== 'pending') return { alreadyVoted: false, ownSuggestion: false, notPending: true, newCount: suggestion.voteCount };
    if (suggestion.suggestedByPlayerId === playerId) return { alreadyVoted: false, ownSuggestion: true, notPending: false, newCount: suggestion.voteCount };

    // Check if already voted
    const existing = await db
      .select()
      .from(tagSuggestionVotes)
      .where(
        and(
          eq(tagSuggestionVotes.suggestionId, suggestionId),
          eq(tagSuggestionVotes.votedByPlayerId, playerId)
        )
      );
    if (existing.length > 0) {
      return { alreadyVoted: true, ownSuggestion: false, notPending: false, newCount: suggestion.voteCount };
    }

    await db.insert(tagSuggestionVotes).values({ id: randomUUID(), suggestionId, votedByPlayerId: playerId });
    const [updated] = await db
      .update(tagSuggestions)
      .set({ voteCount: sql`${tagSuggestions.voteCount} + 1` })
      .where(eq(tagSuggestions.id, suggestionId))
      .returning();

    const newCount = updated?.voteCount ?? 0;

    // Auto-promote if threshold reached
    const VOTE_THRESHOLD = 10;
    if (updated && newCount >= VOTE_THRESHOLD && updated.status === 'pending') {
      await this._promoteTagSuggestion(updated);
    }

    return { alreadyVoted: false, ownSuggestion: false, notPending: false, newCount };
  }

  async unvoteTagSuggestion(suggestionId: string, playerId: string): Promise<{ newCount: number }> {
    await db
      .delete(tagSuggestionVotes)
      .where(
        and(
          eq(tagSuggestionVotes.suggestionId, suggestionId),
          eq(tagSuggestionVotes.votedByPlayerId, playerId)
        )
      );
    const [updated] = await db
      .update(tagSuggestions)
      .set({ voteCount: sql`GREATEST(${tagSuggestions.voteCount} - 1, 0)` })
      .where(eq(tagSuggestions.id, suggestionId))
      .returning({ voteCount: tagSuggestions.voteCount });
    return { newCount: updated?.voteCount ?? 0 };
  }

  async reviewTagSuggestion(suggestionId: string, status: 'approved' | 'rejected', adminNote?: string): Promise<TagSuggestion | undefined> {
    if (status === 'approved') {
      const [suggestion] = await db
        .select()
        .from(tagSuggestions)
        .where(eq(tagSuggestions.id, suggestionId));
      if (suggestion) {
        if (adminNote !== undefined) {
          await db.update(tagSuggestions).set({ adminNote }).where(eq(tagSuggestions.id, suggestionId));
        }
        await this._promoteTagSuggestion(suggestion);
        const [row] = await db.select().from(tagSuggestions).where(eq(tagSuggestions.id, suggestionId));
        return row ?? undefined;
      }
    }
    const updates: Partial<TagSuggestion> = {
      status,
      reviewedAt: new Date(),
      ...(adminNote !== undefined ? { adminNote } : {}),
    };
    const [row] = await db
      .update(tagSuggestions)
      .set(updates)
      .where(eq(tagSuggestions.id, suggestionId))
      .returning();
    return row ?? undefined;
  }

  // ─── Blog operations ──────────────────────────────────────────────────────────

  async createBlogPost(data: InsertBlogPost): Promise<BlogPost> {
    const id = randomUUID();
    const [row] = await db
      .insert(blogPosts)
      .values({ ...data, id })
      .returning();
    return row;
  }

  async getBlogPost(id: string): Promise<BlogPost | undefined> {
    const [row] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return row ?? undefined;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [row] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    return row ?? undefined;
  }

  async getAllBlogPosts(includeUnpublished = false): Promise<BlogPost[]> {
    const conditions: SQL[] = [];
    if (!includeUnpublished) {
      conditions.push(eq(blogPosts.status, "published"));
    }
    return db
      .select()
      .from(blogPosts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt));
  }

  async updateBlogPost(id: string, updates: Partial<BlogPost>): Promise<BlogPost | undefined> {
    const [row] = await db
      .update(blogPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();
    return row ?? undefined;
  }

  async deleteBlogPost(id: string): Promise<boolean> {
    const result = await db.delete(blogPosts).where(eq(blogPosts.id, id)).returning();
    return result.length > 0;
  }

  // ─── Referral operations ───────────────────────────────────────────────────

  async createReferral(data: InsertReferral): Promise<Referral> {
    const id = randomUUID();
    const [row] = await db
      .insert(referrals)
      .values({ ...data, id })
      .returning();
    return row;
  }

  async getReferral(id: string): Promise<Referral | undefined> {
    const [row] = await db.select().from(referrals).where(eq(referrals.id, id));
    return row ?? undefined;
  }

  async getReferralByRefereeUserId(refereeUserId: string): Promise<Referral | undefined> {
    const [row] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.refereeUserId, refereeUserId));
    return row ?? undefined;
  }

  async getReferralByRefereePlayerId(refereePlayerId: string): Promise<Referral | undefined> {
    const [row] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.refereePlayerId, refereePlayerId));
    return row ?? undefined;
  }

  async getReferralsByReferrerId(referrerId: string): Promise<(Referral & { refereeName: string | null })[]> {
    const rows = await db
      .select({
        id: referrals.id,
        referrerId: referrals.referrerId,
        refereeUserId: referrals.refereeUserId,
        refereePlayerId: referrals.refereePlayerId,
        status: referrals.status,
        completedAt: referrals.completedAt,
        createdAt: referrals.createdAt,
        refereeName: marketplaceUsers.name,
      })
      .from(referrals)
      .leftJoin(marketplaceUsers, eq(referrals.refereeUserId, marketplaceUsers.id))
      .where(eq(referrals.referrerId, referrerId))
      .orderBy(desc(referrals.createdAt));
    return rows.map(r => ({ ...r, refereeName: r.refereeName ?? null }));
  }

  async getCompletedReferralCount(referrerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, referrerId), eq(referrals.status, 'completed')));
    return result?.count ?? 0;
  }

  async getAllReferrals(): Promise<(Referral & { referrerName: string; refereeEmail: string; referralCode: string | null; ambassadorStatus: boolean; jerseyDispatched: boolean })[]> {
    const rows = await db
      .select({
        id: referrals.id,
        referrerId: referrals.referrerId,
        refereeUserId: referrals.refereeUserId,
        refereePlayerId: referrals.refereePlayerId,
        status: referrals.status,
        completedAt: referrals.completedAt,
        createdAt: referrals.createdAt,
        referrerName: players.name,
        refereeEmail: marketplaceUsers.email,
        referralCode: players.referralCode,
        ambassadorStatus: players.ambassadorStatus,
        jerseyDispatched: players.jerseyDispatched,
      })
      .from(referrals)
      .leftJoin(players, eq(referrals.referrerId, players.id))
      .leftJoin(marketplaceUsers, eq(referrals.refereeUserId, marketplaceUsers.id))
      .orderBy(desc(referrals.createdAt));
    return rows.map(r => ({
      ...r,
      referrerName: r.referrerName ?? 'Unknown',
      refereeEmail: r.refereeEmail ?? 'Unknown',
      referralCode: r.referralCode ?? null,
      ambassadorStatus: r.ambassadorStatus ?? false,
      jerseyDispatched: r.jerseyDispatched ?? false,
    }));
  }

  async updateReferral(id: string, updates: Partial<Referral>): Promise<Referral | undefined> {
    const [row] = await db
      .update(referrals)
      .set(updates)
      .where(eq(referrals.id, id))
      .returning();
    return row ?? undefined;
  }

  async getReferralLeaderboard(limit = 10): Promise<{ playerId: string; playerName: string; referralCode: string | null; completedCount: number; ambassadorStatus: boolean }[]> {
    const rows = await db
      .select({
        playerId: players.id,
        playerName: players.name,
        referralCode: players.referralCode,
        completedCount: sql<number>`count(${referrals.id})::int`,
        ambassadorStatus: players.ambassadorStatus,
      })
      .from(referrals)
      .innerJoin(players, eq(referrals.referrerId, players.id))
      .where(eq(referrals.status, 'completed'))
      .groupBy(players.id, players.name, players.referralCode, players.ambassadorStatus)
      .orderBy(desc(sql`count(${referrals.id})`))
      .limit(limit);
    return rows;
  }

  async getPlayerByReferralCode(code: string): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.referralCode, code.toUpperCase()));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async backfillReferralCodes(): Promise<number> {
    const playersWithoutCodes = await db
      .select()
      .from(players)
      .where(sql`${players.referralCode} IS NULL`);
    let count = 0;
    for (const p of playersWithoutCodes) {
      const code = generateReferralCode(p.name, p.shuttleIqId);
      try {
        await db.update(players).set({ referralCode: code }).where(eq(players.id, p.id));
        count++;
      } catch {
        const fallback = generateReferralCode(p.name, `SIQ-${Date.now() % 99999}`);
        await db.update(players).set({ referralCode: fallback }).where(eq(players.id, p.id));
        count++;
      }
    }
    return count;
  }
}

export const storage = new DatabaseStorage();
