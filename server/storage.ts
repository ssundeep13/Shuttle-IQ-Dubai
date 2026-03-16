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
  type Payment,
  type InsertPayment,
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
  payments
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc, sql, asc, like, gte } from "drizzle-orm";
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

export interface IStorage {
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getActiveSession(): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
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
  updateMarketplaceUser(id: string, updates: Partial<MarketplaceUser>): Promise<MarketplaceUser | undefined>;
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
  updateBookableSession(id: string, updates: Partial<BookableSession>): Promise<BookableSession | undefined>;
  deleteBookableSession(id: string): Promise<boolean>;

  // Booking operations
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingWithDetails(id: string): Promise<BookingWithDetails | undefined>;
  getUserBookings(userId: string): Promise<BookingWithDetails[]>;
  getUserBookingForSession(userId: string, sessionId: string): Promise<Booking | undefined>;
  getSessionBookings(sessionId: string): Promise<BookingWithDetails[]>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;
  getBookingCountForSession(sessionId: string): Promise<number>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByBookingId(bookingId: string): Promise<Payment | undefined>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;
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

  async getAllSessions(): Promise<Session[]> {
    return await db.select().from(sessions).orderBy(desc(sessions.createdAt));
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
    
    // 6. Delete linked bookable sessions and their bookings/payments
    const linkedBookableSessions = await db.select().from(bookableSessions).where(eq(bookableSessions.linkedSessionId, id));
    for (const bs of linkedBookableSessions) {
      const linkedBookings = await db.select().from(bookings).where(eq(bookings.sessionId, bs.id));
      for (const booking of linkedBookings) {
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
    const [player] = await db
      .insert(players)
      .values({ 
        ...insertPlayer, 
        id,
        shuttleIqId,
        status: insertPlayer.status || 'waiting',
        gamesPlayed: insertPlayer.gamesPlayed || 0,
        wins: insertPlayer.wins || 0
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
    
    // Get game results for these games (ordered by date for streak calculation)
    const games = await db
      .select()
      .from(gameResults)
      .where(inArray(gameResults.id, gameIds))
      .orderBy(desc(gameResults.createdAt));

    // Get all participants for these games
    const allParticipants = await db
      .select()
      .from(gameParticipants)
      .where(inArray(gameParticipants.gameId, gameIds));

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

    // Build recent games list (last 10)
    const recentGames: PlayerStats['recentGames'] = games.slice(0, 10).map(game => {
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
        partnerName: partner ? (playerMap.get(partner.playerId)?.name || 'Unknown') : 'Solo',
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

  async getMarketplaceUserByEmail(email: string): Promise<MarketplaceUser | undefined> {
    const [user] = await db.select().from(marketplaceUsers).where(eq(marketplaceUsers.email, email));
    return user || undefined;
  }

  async updateMarketplaceUser(id: string, updates: Partial<MarketplaceUser>): Promise<MarketplaceUser | undefined> {
    const [updated] = await db
      .update(marketplaceUsers)
      .set(updates)
      .where(eq(marketplaceUsers.id, id))
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
    return { ...session, spotsRemaining: Math.max(0, session.capacity - count), totalBookings: count };
  }

  async getAllBookableSessions(): Promise<BookableSessionWithAvailability[]> {
    const allSessions = await db.select().from(bookableSessions).orderBy(asc(bookableSessions.date));
    const result: BookableSessionWithAvailability[] = [];
    for (const session of allSessions) {
      const count = await this.getBookingCountForSession(session.id);
      result.push({ ...session, spotsRemaining: Math.max(0, session.capacity - count), totalBookings: count });
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

  async getBookingWithDetails(id: string): Promise<BookingWithDetails | undefined> {
    const booking = await this.getBooking(id);
    if (!booking) return undefined;
    const session = await this.getBookableSession(booking.sessionId);
    if (!session) return undefined;
    const user = await this.getMarketplaceUser(booking.userId);
    return { ...booking, session, user: user || undefined };
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
      if (session) result.push({ ...booking, session });
    }
    return result;
  }

  async getUserBookingForSession(userId: string, sessionId: string): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), eq(bookings.sessionId, sessionId)))
      .limit(1);
    return booking;
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
      if (session) result.push({ ...booking, session, user: user || undefined });
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
    const activeBookings = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.sessionId, sessionId), sql`${bookings.status} != 'cancelled'`));
    return activeBookings.length;
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

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [updated] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
