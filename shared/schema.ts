import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions schema (for multi-venue queue sessions)
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  date: timestamp("date").notNull(),
  venueName: text("venue_name").notNull(),
  venueLocation: text("venue_location"),
  courtCount: integer("court_count").notNull(),
  status: text("status").notNull().default('active'), // 'active', 'ended'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, endedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Player schema (global player registry)
export const players = pgTable("players", {
  id: varchar("id").primaryKey(),
  externalId: text("external_id"), // Optional unique identifier for cross-venue tracking (e.g., membership ID)
  name: text("name").notNull(),
  gender: text("gender").notNull(), // 'Male', 'Female'
  level: text("level").notNull(), // 'Novice', 'Beginner-', 'Beginner', 'Beginner+', 'Intermediate-', 'Intermediate', 'Intermediate+', 'Advanced', 'Advanced+', 'Professional'
  skillScore: integer("skill_score").notNull().default(100), // 10-200 point scale
  gamesPlayed: integer("games_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  status: text("status").notNull().default('waiting'), // 'waiting', 'playing'
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect & {
  skid?: number; // Computed SKID (1-20), derived from skillScore / 10
};

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
