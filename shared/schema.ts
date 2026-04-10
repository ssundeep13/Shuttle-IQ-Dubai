import { pgTable, text, varchar, integer, timestamp, boolean, uniqueIndex, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions schema (for multi-venue queue sessions)
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  date: timestamp("date").notNull(),
  venueName: text("venue_name").notNull(),
  venueLocation: text("venue_location"),
  venueMapUrl: text("venue_map_url"),
  courtCount: integer("court_count").notNull(),
  status: text("status").notNull().default('active'), // 'draft', 'active', 'upcoming', 'ended'
  isSandbox: boolean("is_sandbox").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, endedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Player schema (global player registry)
export const players = pgTable("players", {
  id: varchar("id").primaryKey(),
  shuttleIqId: text("shuttle_iq_id").unique(), // Human-readable unique ID (e.g., "SIQ-00001")
  externalId: text("external_id"), // Optional unique identifier for cross-venue tracking (e.g., membership ID)
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  gender: text("gender").notNull(), // 'Male', 'Female'
  level: text("level").notNull(), // 'Novice' (10-39), 'Beginner' (40-69), 'lower_intermediate' (70-89), 'upper_intermediate' (90-109), 'Advanced' (110-159), 'Professional' (160-200)
  skillScore: integer("skill_score").notNull().default(50), // 10-200 point scale (default: mid-Beginner)
  gamesPlayed: integer("games_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  status: text("status").notNull().default('waiting'), // 'waiting', 'playing'
  createdAt: timestamp("created_at").notNull().defaultNow(), // When player was first registered
  lastPlayedAt: timestamp("last_played_at"), // When player last participated in a game (null = never)
  skillScoreBaseline: integer("skill_score_baseline"), // Score at time of last game — anchor for inactivity decay (null = never played)
  returnGamesRemaining: integer("return_games_remaining").notNull().default(0), // Games left with return K-boost after 14+ day absence
  tierCandidate: text("tier_candidate"), // Tier the player is trending toward (null = stable)
  tierCandidateGames: integer("tier_candidate_games").notNull().default(0), // Consecutive games with score in candidate tier
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, shuttleIqId: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect & {
  skid?: number; // Computed SKID (1-20), derived from skillScore / 10
};

// Partner statistics for player profile
export interface PartnerStats {
  player: Player;
  gamesTogether: number;
  winsTogether: number;
  winRate: number;
}

// Opponent/rival statistics for player profile
export interface OpponentStats {
  player: Player;
  gamesAgainst: number;
  winsAgainst: number;
  lossesAgainst: number;
  winRate: number;
}

// Player profile statistics (computed from game history)
export interface PlayerStats {
  player: Player;
  winRate: number;
  totalGames: number;
  totalWins: number;
  
  // Streak statistics
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
  
  // Ranking (1 = best)
  rankBySkillScore: number;
  rankByWins: number;
  rankByWinRate: number;
  totalPlayersRanked: number;
  
  // Performance trend (based on recent games vs overall)
  performanceTrend: 'improving' | 'declining' | 'stable';
  recentWinRate: number; // Last 5 games
  
  // Score differential
  avgScoreDifferential: number; // Positive = winning by more, Negative = losing by more
  avgPointsFor: number;
  avgPointsAgainst: number;
  
  // Partner stats
  bestPartner: { player: Player; winsTogether: number } | null;
  frequentPartners: PartnerStats[];
  
  // Opponent stats
  rivals: OpponentStats[]; // Most played against
  favoriteOpponents: OpponentStats[]; // Highest win rate against (min 2 games)
  
  recentGames: Array<{
    gameId: string;
    sessionId: string;
    partnerId: string | null;
    partnerName: string;
    opponentIds: string[];
    opponentNames: string[];
    won: boolean;
    score: string;
    date: Date;
    pointsGained?: number;
    pointsLost?: number;
    skillScoreBefore?: number;
    skillScoreAfter?: number;
  }>;
}

// Court schema (session-specific courts)
export const courts = pgTable("courts", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull(), // Links court to a specific session
  name: text("name").notNull(),
  status: text("status").notNull().default('available'), // 'available', 'occupied'
  timeRemaining: integer("time_remaining").notNull().default(0), // in minutes
  winningTeam: integer("winning_team"), // 1 or 2, null if not selected
  startedAt: timestamp("started_at"), // When the game started
});

export const insertCourtSchema = createInsertSchema(courts).omit({ id: true });
export type InsertCourt = z.infer<typeof insertCourtSchema>;
export type Court = typeof courts.$inferSelect;

// Court Players (many-to-many relationship with team assignment)
export const courtPlayers = pgTable("court_players", {
  courtId: varchar("court_id").notNull(),
  playerId: varchar("player_id").notNull(),
  team: integer("team").notNull(), // 1 or 2
});

export type CourtPlayer = typeof courtPlayers.$inferSelect;

// Session Queue (ordered list of player IDs waiting in a specific session)
export const queueEntries = pgTable("queue_entries", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull(), // Links queue entry to a specific session
  playerId: varchar("player_id").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type QueueEntry = typeof queueEntries.$inferSelect;

// Game Results (track individual game scores per session)
export const gameResults = pgTable("game_results", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull(), // Links game to a specific session
  courtId: varchar("court_id").notNull(),
  team1Score: integer("team1_score").notNull(),
  team2Score: integer("team2_score").notNull(),
  winningTeam: integer("winning_team").notNull(), // 1 or 2
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGameResultSchema = createInsertSchema(gameResults).omit({ id: true, createdAt: true });
export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type GameResult = typeof gameResults.$inferSelect;

// Game Participants (track which players were in each game and on which team)
export const gameParticipants = pgTable("game_participants", {
  gameId: varchar("game_id").notNull(),
  playerId: varchar("player_id").notNull(),
  team: integer("team").notNull(), // 1 or 2
  skillScoreBefore: integer("skill_score_before").notNull(), // Skill score before the game
  skillScoreAfter: integer("skill_score_after").notNull(), // Skill score after the game
});

export type GameParticipant = typeof gameParticipants.$inferSelect;

// Notification types
export type NotificationType = 'success' | 'warning' | 'danger' | 'info';

export interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

// Frontend-only types for complex state
export interface PlayerWithTeam extends Player {
  team: number; // 1 or 2
}

export interface CourtWithPlayers extends Court {
  players: PlayerWithTeam[];
}

export interface AppStats {
  activePlayers: number;
  inQueue: number;
  availableCourts: number;
  occupiedCourts: number;
  totalPlayers: number;
  totalCourts: number;
}

// Admin Users schema (for authentication)
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default('admin'), // 'admin', 'super_admin'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true, lastLoginAt: true });
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// Auth Sessions schema (for JWT refresh tokens)
export const authSessions = pgTable("auth_sessions", {
  id: varchar("id").primaryKey(),
  adminUserId: varchar("admin_user_id").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuthSessionSchema = createInsertSchema(authSessions).omit({ id: true, createdAt: true });
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type AuthSession = typeof authSessions.$inferSelect;

// ============================================================
// MARKETPLACE TABLES
// ============================================================

// Marketplace Users (player-facing accounts, separate from admin)
export const marketplaceUsers = pgTable("marketplace_users", {
  id: varchar("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  phone: text("phone"),
  linkedPlayerId: varchar("linked_player_id"),
  role: text("role").notNull().default('player'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  googleId: text("google_id").unique(),
});

export const insertMarketplaceUserSchema = createInsertSchema(marketplaceUsers).omit({ id: true, createdAt: true, lastLoginAt: true });
export type InsertMarketplaceUser = z.infer<typeof insertMarketplaceUserSchema>;
export type MarketplaceUser = typeof marketplaceUsers.$inferSelect;

// Marketplace Auth Sessions (JWT refresh tokens for marketplace users)
export const marketplaceAuthSessions = pgTable("marketplace_auth_sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MarketplaceAuthSession = typeof marketplaceAuthSessions.$inferSelect;

// Bookable Sessions (distinct from internal court management sessions)
export const bookableSessions = pgTable("bookable_sessions", {
  id: varchar("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  venueName: text("venue_name").notNull(),
  venueLocation: text("venue_location"),
  venueMapUrl: text("venue_map_url"),
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  courtCount: integer("court_count").notNull().default(2),
  capacity: integer("capacity").notNull().default(16),
  priceAed: integer("price_aed").notNull().default(50),
  status: text("status").notNull().default('upcoming'),
  imageUrl: text("image_url"),
  bookingStartAt: timestamp("booking_start_at"),
  bookingEndAt: timestamp("booking_end_at"),
  linkedSessionId: varchar("linked_session_id").references(() => sessions.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookableSessionSchema = createInsertSchema(bookableSessions).omit({ id: true, createdAt: true });
export type InsertBookableSession = z.infer<typeof insertBookableSessionSchema>;
export type BookableSession = typeof bookableSessions.$inferSelect;

// Bookings (user → bookable session)
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  sessionId: varchar("session_id").notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'confirmed', 'waitlisted', 'pending_payment', 'attended', 'cancelled'
  paymentMethod: text("payment_method").notNull().default('ziina'),
  ziinaPaymentIntentId: text("ziina_payment_intent_id"),
  amountAed: integer("amount_aed").notNull(),
  cashPaid: boolean("cash_paid").notNull().default(false),
  waitlistPosition: integer("waitlist_position"),
  lateFeeApplied: boolean("late_fee_applied").notNull().default(false),
  spotsBooked: integer("spots_booked").notNull().default(1), // how many spots this booking covers (1 = self only, 2+ = self + guests)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  attendedAt: timestamp("attended_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  promotedAt: timestamp("promoted_at"),
}, (table) => [
  uniqueIndex('unique_active_booking_per_session')
    .on(table.userId, table.sessionId)
    .where(sql`${table.status} != 'cancelled'`),
]);

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, cancelledAt: true, attendedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Booking Guests (additional players covered by a single booking)
export const bookingGuests = pgTable("booking_guests", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  name: text("name").notNull(),
  email: text("email"),
  linkedUserId: varchar("linked_user_id"), // if they later sign up / match a marketplace account
  isPrimary: boolean("is_primary").notNull().default(false), // true for the primary booker slot
  status: text("status").notNull().default('confirmed'), // 'confirmed' | 'cancelled' | 'pending'
  cancelledAt: timestamp("cancelled_at"),
  cancellationToken: text("cancellation_token").unique(), // for guest self-cancel via email link
  pendingPaymentIntentId: text("pending_payment_intent_id"), // tracks in-flight Ziina payment for extra guest slot
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookingGuestSchema = createInsertSchema(bookingGuests).omit({ id: true, createdAt: true, cancelledAt: true });
export type InsertBookingGuest = z.infer<typeof insertBookingGuestSchema>;
export type BookingGuest = typeof bookingGuests.$inferSelect;

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  ziinaPaymentIntentId: text("ziina_payment_intent_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default('aed'),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Score Disputes (marketplace players flagging incorrect game results)
export const scoreDisputes = pgTable("score_disputes", {
  id: varchar("id").primaryKey(),
  gameResultId: varchar("game_result_id").notNull(),
  filedByUserId: varchar("filed_by_user_id").notNull(),
  note: text("note"),
  status: text("status").notNull().default('open'), // 'open' | 'resolved' | 'dismissed'
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScoreDisputeSchema = createInsertSchema(scoreDisputes).omit({ id: true, createdAt: true });
export type InsertScoreDispute = z.infer<typeof insertScoreDisputeSchema>;
export type ScoreDispute = typeof scoreDisputes.$inferSelect;

export interface ScoreDisputeWithDetails extends ScoreDispute {
  filedByName: string;
  filedByEmail: string;
  gameScore: string;
  gameDate: Date;
  sessionId: string;
}

// Marketplace Notifications
export const marketplaceNotifications = pgTable("marketplace_notifications", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // 'waitlist_promoted' | 'late_fee_applied' | 'booking_confirmed'
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  relatedBookingId: varchar("related_booking_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MarketplaceNotification = typeof marketplaceNotifications.$inferSelect;

// Marketplace frontend types
export interface BookableSessionWithAvailability extends BookableSession {
  spotsRemaining: number;
  totalBookings: number;
  waitlistCount: number;
}

export type BookingGuestWithLinked = BookingGuest & { linkedPlayerId?: string | null };

export interface BookingWithDetails extends Booking {
  session: BookableSession;
  user?: MarketplaceUser;
  guests?: BookingGuestWithLinked[];
  isGuestBooking?: boolean;
  bookedByName?: string;
  myGuestId?: string;
}

// ============================================================
// PLAYER PERSONALITY TAGS
// ============================================================

export const tags = pgTable("tags", {
  id: varchar("id").primaryKey(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull(),
  category: text("category").notNull(), // 'playing_style' | 'social' | 'reputation'
  isActive: boolean("is_active").notNull().default(true),
});
export const insertTagSchema = createInsertSchema(tags).omit({ id: true });
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

export const playerTags = pgTable("player_tags", {
  id: varchar("id").primaryKey(),
  taggedPlayerId: varchar("tagged_player_id").notNull(),
  taggedByPlayerId: varchar("tagged_by_player_id").notNull(),
  tagId: varchar("tag_id").notNull(),
  gameResultId: varchar("game_result_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertPlayerTagSchema = createInsertSchema(playerTags).omit({ id: true, createdAt: true });
export type InsertPlayerTag = z.infer<typeof insertPlayerTagSchema>;
export type PlayerTag = typeof playerTags.$inferSelect;

// ─── Community Tag Suggestions ────────────────────────────────────────────────

export const tagSuggestions = pgTable("tag_suggestions", {
  id: varchar("id").primaryKey(),
  suggestedByPlayerId: varchar("suggested_by_player_id").notNull(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull(),
  category: text("category").notNull(), // 'playing_style' | 'social' | 'reputation'
  reason: text("reason"),
  status: text("status").notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  adminNote: text("admin_note"),
  voteCount: integer("vote_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  promotedAt: timestamp("promoted_at"),
});
export const insertTagSuggestionSchema = createInsertSchema(tagSuggestions).omit({ id: true, status: true, adminNote: true, voteCount: true, createdAt: true, reviewedAt: true, promotedAt: true });
export type InsertTagSuggestion = z.infer<typeof insertTagSuggestionSchema>;
export type TagSuggestion = typeof tagSuggestions.$inferSelect;

export const tagSuggestionVotes = pgTable("tag_suggestion_votes", {
  id: varchar("id").primaryKey(),
  suggestionId: varchar("suggestion_id").notNull().references(() => tagSuggestions.id, { onDelete: 'cascade' }),
  votedByPlayerId: varchar("voted_by_player_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueVote: unique("uq_tag_suggestion_vote").on(table.suggestionId, table.votedByPlayerId),
}));

// ─── Finance / Accounting ─────────────────────────────────────────────────────

export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull().default("circle"),
  color: text("color").notNull().default("#6B7280"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true, createdAt: true });
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey(),
  categoryId: varchar("category_id").notNull().references(() => expenseCategories.id),
  amountAed: integer("amount_aed").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor"),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Session rest state persistence (survives server restarts)
export const sessionRestStatesTable = pgTable("session_rest_states", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull(),
  playerId: varchar("player_id").notNull(),
  consecutiveGames: integer("consecutive_games").notNull().default(0),
  gamesWaited: integer("games_waited").notNull().default(0),
  gamesThisSession: integer("games_this_session").notNull().default(0),
  needsRest: boolean("needs_rest").notNull().default(false),
  isSittingOut: boolean("is_sitting_out").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export interface ExpenseWithCategory extends Expense {
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
}

export interface FinanceSummary {
  revenue: {
    chargedAed: number;
    collectedAed: number;
    pendingCashAed: number;
    lateFeesAed: number;
  };
  expenses: {
    totalAed: number;
    byCategory: Array<{ id: string; name: string; color: string; icon: string; totalAed: number; count: number }>;
  };
  netProfitAed: number;
  monthlyRows: Array<{
    month: string;
    revenueCollectedAed: number;
    expensesAed: number;
    netAed: number;
  }>;
}

export interface TrendingTag {
  tag: Tag;
  count: number;
}
export interface PlayerTopTag {
  tag: Tag;
  count: number;
}
export interface PlayerTopTagEntry {
  playerId: string;
  tag: Tag;
  count: number;
}
export interface CommunitySpotlightEntry {
  tag: Tag;
  count: number;
  topPlayer: {
    id: string;
    name: string;
    level: string;
    skillScore: number;
    shuttleIqId: string | null;
  };
}
export interface ReceivedTagEntry {
  taggerInitial: string;
  tag: Tag;
  sessionName: string;
  createdAt: string;
}
export interface TagCountResult {
  playerId: string;
  tagId: string;
  newCount: number;
}
export interface GameParticipantInfo {
  id: string;
  name: string;
  team: number;
}

export interface TagSuggestionWithVote extends TagSuggestion {
  hasVoted: boolean;
  suggestedByPlayerName: string;
}

export interface RefundNotificationWithDetails {
  id: string;
  message: string;
  createdAt: Date;
  read: boolean;
  relatedBookingId: string | null;
  amountAed: number | null;
  spotsBooked: number | null;
  paymentMethod: string | null;
  ziinaPaymentIntentId: string | null;
  bookingSessionId: string | null;
  playerName: string | null;
  playerEmail: string | null;
  sessionTitle: string | null;
  sessionDate: Date | null;
  sessionVenueName: string | null;
}
