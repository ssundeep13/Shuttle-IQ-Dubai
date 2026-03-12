import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions schema (for multi-venue queue sessions)
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  date: timestamp("date").notNull(),
  venueName: text("venue_name").notNull(),
  venueLocation: text("venue_location"),
  courtCount: integer("court_count").notNull(),
  status: text("status").notNull().default('active'), // 'draft', 'active', 'upcoming', 'ended'
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
  gender: text("gender").notNull(), // 'Male', 'Female'
  level: text("level").notNull(), // 'Novice' (10-39), 'Beginner' (40-69), 'Intermediate' (70-109), 'Advanced' (110-159), 'Professional' (160-200)
  skillScore: integer("skill_score").notNull().default(90), // 10-200 point scale (default: mid-Intermediate)
  gamesPlayed: integer("games_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  status: text("status").notNull().default('waiting'), // 'waiting', 'playing'
  createdAt: timestamp("created_at").notNull().defaultNow(), // When player was first registered
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
    partnerName: string;
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
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  linkedPlayerId: varchar("linked_player_id"),
  role: text("role").notNull().default('player'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
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
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  courtCount: integer("court_count").notNull().default(2),
  capacity: integer("capacity").notNull().default(16),
  priceAed: integer("price_aed").notNull().default(50),
  status: text("status").notNull().default('upcoming'),
  imageUrl: text("image_url"),
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
  status: text("status").notNull().default('confirmed'),
  paymentIntentId: text("payment_intent_id"),
  amountAed: integer("amount_aed").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  attendedAt: timestamp("attended_at"),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, cancelledAt: true, attendedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default('aed'),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, completedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Marketplace frontend types
export interface BookableSessionWithAvailability extends BookableSession {
  spotsRemaining: number;
  totalBookings: number;
}

export interface BookingWithDetails extends Booking {
  session: BookableSession;
  user?: MarketplaceUser;
}
