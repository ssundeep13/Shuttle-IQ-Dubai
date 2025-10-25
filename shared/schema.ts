import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Player schema
export const players = pgTable("players", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull(), // 'Beginner', 'Intermediate', 'Advanced'
  skillScore: integer("skill_score").notNull().default(50), // 0-100 internal scale (displayed as 0.0-10.0)
  gamesPlayed: integer("games_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  status: text("status").notNull().default('waiting'), // 'waiting', 'playing'
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// Court schema
export const courts = pgTable("courts", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default('available'), // 'available', 'occupied'
  timeRemaining: integer("time_remaining").notNull().default(0), // in minutes
  winningTeam: integer("winning_team"), // 1 or 2, null if not selected
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

// Global Queue (ordered list of player IDs waiting)
export const queueEntries = pgTable("queue_entries", {
  id: varchar("id").primaryKey(),
  playerId: varchar("player_id").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type QueueEntry = typeof queueEntries.$inferSelect;

// Game Results (track individual game scores)
export const gameResults = pgTable("game_results", {
  id: varchar("id").primaryKey(),
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
