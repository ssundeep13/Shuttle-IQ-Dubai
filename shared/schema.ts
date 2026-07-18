import { pgTable, text, varchar, integer, timestamp, boolean, uniqueIndex, unique, primaryKey, index, jsonb } from "drizzle-orm/pg-core";
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
  referralCode: text("referral_code").unique(), // e.g. "SIQ-AHMED1-00042"
  walletBalance: integer("wallet_balance").notNull().default(0), // stored in fils (1500 fils = AED 15)
  ambassadorStatus: boolean("ambassador_status").notNull().default(false), // true at 10 completed referrals
  jerseyDispatched: boolean("jersey_dispatched").notNull().default(false), // admin marks when jersey sent
  leaderboardMention: boolean("leaderboard_mention").notNull().default(false), // true at 5 completed referrals
  // C-2 (PR1): track whether the milestone congrats email has ever been sent so
  // a clawback-then-re-cross does not re-trigger it. Sticky once true.
  referralMilestone5Emailed: boolean("referral_milestone_5_emailed").notNull().default(false),
  referralMilestone10Emailed: boolean("referral_milestone_10_emailed").notNull().default(false),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, shuttleIqId: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect & {
  skid?: number; // Computed SKID (1-20), derived from skillScore / 10
};

// Referrals table (tracks referrer → referee relationships)
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey(),
  referrerId: varchar("referrer_id").notNull().references(() => players.id), // player.id of the person who referred
  refereeUserId: varchar("referee_user_id").notNull().unique(), // marketplace_users.id of the person who was referred (one referral per user)
  refereePlayerId: varchar("referee_player_id"), // player.id of the referee (populated when marketplace user links a player account)
  status: text("status").notNull().default('pending'), // 'pending' | 'completed' | 'invalid' | 'clawed_back' (revivable since 2026-07-10: a later qualifying booking completes it again)
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // PR1 additions — wiring deferred to PR2.
  triggeringBookingId: varchar("triggering_booking_id"), // booking.id whose first confirmed payment fired the credit; null for admin force-complete
  completionMethod: text("completion_method"), // 'first_payment' | 'admin' | 'first_payment_revived' | 'admin_revived' (null pre-completion)
  clawedBackAt: timestamp("clawed_back_at"),
}, (table) => [
  index('idx_referrals_triggering_booking').on(table.triggeringBookingId),
]);

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true, completedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

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
  playerPhotoUrl: string | null;
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
  // Court band: which confirmed-tier band this court accepts for SUGGESTION
  // generation (AI and local) and the auto Up Next orchestrator. It filters
  // candidate pools only — captain assigns, swaps, and pins are NEVER
  // blocked by it (captain always wins). Bands map to confirmed-tier
  // indices via getConfirmedTierIndex(player.level):
  //   'all_levels'        → no restriction
  //   'beginner'          → Novice, Beginner            (index ≤ 1)
  //   'intermediate_plus' → lower_intermediate and up   (index ≥ 2)
  //   'competitive_plus'  → upper_intermediate, Advanced, Professional (index ≥ 3)
  // Courts are session-scoped rows, so bands reset to the default each
  // new session by design.
  skillBand: text("skill_band").notNull().default('all_levels'),
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
  matchSuggestionId: varchar("match_suggestion_id").unique(), // nullable; idempotency key — links a recorded game back to the AI/admin lineup that was played, prevents double-submission for the same match
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

// Match Suggestions (AI- or admin-proposed lineup for a court — Phase 1 of player-facing gameplay flow)
// A row is created when matchmaking proposes a 2v2 lineup for a court. It moves through
// pending -> approved -> playing -> completed. The 90s auto-approve sweep uses pendingUntil.
export const matchSuggestions = pgTable("match_suggestions", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull(), // FK -> sessions.id
  courtId: varchar("court_id").notNull(), // FK -> courts.id
  suggestedAt: timestamp("suggested_at").notNull().defaultNow(),
  // suggestedAt + 90s; sweep job auto-approves past this. NULL for 'queued' rows
  // (queued rows are flipped to 'pending' by the game-end transition, which sets
  // pendingUntil = now + 90s at that moment — so they MUST never be picked up
  // by the auto-approve sweep before then).
  pendingUntil: timestamp("pending_until"),
  status: text("status").notNull().default('pending'), // 'pending' | 'approved' | 'playing' | 'completed' | 'dismissed' | 'queued' (queued = "next round" lineup pre-built for an occupied court; flipped to 'pending' on game end)
  approvedBy: text("approved_by"), // marketplace_users.id of approver, or the literal "auto" when the timer fires
  // Gate 5: who authored this lineup — 'auto' (queued orchestrator / generator)
  // or 'captain' (manual pin, captain edit, or direct admin assignment).
  // Captain-owned queued rows are display-tagged; the orchestrator never
  // replaces any existing queued row regardless of source, and promotion
  // treats both sources identically.
  source: text("source").notNull().default('auto'), // 'auto' | 'captain'
  // True when a queued lineup includes any of the 4 players currently on the court
  // (Case 2 of the queued-suggestion orchestrator). Used by the game-end transition
  // to decide whether to flip queued→pending directly or verify availability first.
  // Always false for non-queued rows (default).
  includesActivePlayers: boolean("includes_active_players").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMatchSuggestionSchema = createInsertSchema(matchSuggestions).omit({ id: true, suggestedAt: true, createdAt: true });
export type InsertMatchSuggestion = z.infer<typeof insertMatchSuggestionSchema>;
export type MatchSuggestion = typeof matchSuggestions.$inferSelect;

// Match Suggestion Players (the 4 players in a suggested lineup, with team assignment)
// courtId is duplicated from the parent match_suggestions row so "which court is player X queued for"
// is a single-table read with no join — kept in sync by the createSuggestion storage method.
export const matchSuggestionPlayers = pgTable("match_suggestion_players", {
  suggestionId: varchar("suggestion_id").notNull(), // FK -> match_suggestions.id
  courtId: varchar("court_id").notNull(), // duplicated from parent suggestion for single-table lookups
  playerId: varchar("player_id").notNull(), // FK -> players.id
  team: integer("team").notNull(), // 1 or 2
}, (table) => ({
  // Composite PK guards integrity: a player can appear at most once per suggestion.
  pk: primaryKey({ columns: [table.suggestionId, table.playerId] }),
}));

export type MatchSuggestionPlayer = typeof matchSuggestionPlayers.$inferSelect;

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
  pendingSignupCreditFils: integer("pending_signup_credit_fils").notNull().default(0),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiry: timestamp("email_verification_token_expiry"),
  photoUrl: text("photo_url"),
  // PR1 addition — wiring deferred to PR4 (Dashboard nudge dismiss).
  referralNudgeDismissedAt: timestamp("referral_nudge_dismissed_at"),
  // Birthday (free-game) feature. Day/month required to qualify; year optional.
  // discountUsedAt: 300-day reset. emailSentAt: reminder de-dupe (once per year).
  birthDay: integer("birth_day"),
  birthMonth: integer("birth_month"),
  birthYear: integer("birth_year"),
  birthdayDiscountUsedAt: timestamp("birthday_discount_used_at"),
  birthdayEmailSentAt: timestamp("birthday_email_sent_at"),
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

// Payment Resume Tokens — short-lived single-use tokens that allow a Ziina
// hosted-checkout return URL to silently re-establish the user's session even
// when the redirect lands in a different browser context (PWA -> system browser,
// in-app browser -> Safari, etc.) where localStorage tokens are not shared.
export const paymentResumeTokens = pgTable("payment_resume_tokens", {
  id: varchar("id").primaryKey(),
  marketplaceUserId: varchar("marketplace_user_id").notNull(),
  bookingId: varchar("booking_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentResumeToken = typeof paymentResumeTokens.$inferSelect;

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
  // Cancellation audit. Currently only written by the admin event-cancel
  // path ('event_cancelled_by_admin'); 40 / 743 rows populated on prod DB.
  cancellationReason: text("cancellation_reason"),
  attendedAt: timestamp("attended_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  promotedAt: timestamp("promoted_at"),
  walletAmountUsed: integer("wallet_amount_used").notNull().default(0), // fils of wallet credit applied to this booking
  // Booking-side companions to the discount_codes / discount_code_uses
  // tables (parked feature, re-declared here from live DB). Both nullable.
  discountCodeId: varchar("discount_code_id"),
  discountAmountAed: integer("discount_amount_aed"),
  // Birthday free-game: primary spot waived when applied. Set at booking submit;
  // the user's birthdayDiscountUsedAt is set only on confirmation.
  birthdayDiscountApplied: boolean("birthday_discount_applied").notNull().default(false),
  // Cancellation refund choice. refundMethod: 'wallet' | 'ziina' (null = not
  // refunded). walletRefundedAt: set when wallet credit is issued — the
  // idempotency guard that prevents a second refund of the same booking.
  refundMethod: text("refund_method"),
  walletRefundedAt: timestamp("wallet_refunded_at"),
}, (table) => [
  uniqueIndex('unique_active_booking_per_session')
    .on(table.userId, table.sessionId)
    .where(sql`${table.status} != 'cancelled'`),
]);

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, cancelledAt: true, attendedAt: true, walletAmountUsed: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Booking Guests (additional players covered by a single booking)
export const bookingGuests = pgTable("booking_guests", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  name: text("name").notNull(),
  email: text("email"),
  linkedUserId: varchar("linked_user_id"), // if they later sign up / match a marketplace account
  linkedPlayerId: varchar("linked_player_id"), // direct Player link set when a guest is checked in (esp. an auto-created pure-guest player); account guests still resolve via linkedUserId → marketplaceUsers.linkedPlayerId
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
  // Ziina refund tracking (#231). Nullable/additive — populated only when an
  // admin issues a refund via Ziina. refundedAmount is in fils (the actual
  // cash captured by Ziina, never the wallet-paid portion). refundStatus:
  // null (no refund) | 'pending' (request accepted, awaiting Ziina settlement)
  // | 'completed' | 'failed'.
  ziinaRefundId: text("ziina_refund_id"),
  refundedAmount: integer("refunded_amount"),
  refundedAt: timestamp("refunded_at"),
  refundStatus: text("refund_status"),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Wallet ledger (Layer 1) — APPEND-ONLY transaction log for players.walletBalance.
// Every balance mutation writes one row here, in the same DB transaction as the
// balance update. No update/delete ever (enforced by a DB trigger + no storage
// methods exposed); corrections are new offsetting 'adjustment' entries.
// Types are derived from the real write-site inventory, not guessed:
export const WALLET_TRANSACTION_TYPES = [
  'booking_payment',       // debit  — wallet applied to a booking at checkout
  'booking_credit_return', // credit — spent wallet credit returned (booking cancelled/failed)
  'cancellation_refund',   // credit — player chose wallet for a cancel refund (whole or guest slot)
  'event_cancel_refund',   // credit — admin cancelled a session; spent credit returned
  'referral_reward',       // credit — referral completion (referrer or referee)
  'referral_clawback',     // debit  — referral reversal (may legitimately go negative)
  'signup_credit',         // credit — staged signup credit drained to wallet at link time
  'balance_import',        // credit — one-time opening balance (pre-ledger, origin unverifiable)
  'adjustment',            // either — manual correction; the only way to "fix" a row
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey(),
  playerId: varchar("player_id").notNull(),
  amountFils: integer("amount_fils").notNull(), // signed: + credit / − debit
  balanceAfterFils: integer("balance_after_fils").notNull(),
  type: text("type").notNull(), // one of WALLET_TRANSACTION_TYPES
  relatedBookingId: varchar("related_booking_id"),
  relatedReferralId: varchar("related_referral_id"),
  description: text("description"),
  createdBy: text("created_by").notNull().default('system'), // 'system' | 'player' | admin user id
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index('idx_wallet_tx_player_created').on(table.playerId, table.createdAt),
]);

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;

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
  type: text("type").notNull(), // 'waitlist_promoted' | 'late_fee_applied' | 'booking_confirmed' | 'court_ready' | 'score_flag'
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  relatedBookingId: varchar("related_booking_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Partial-refund accounting (guest-slot cancels). The amount owed for THIS
  // refund_required entry, in fils — for a guest-slot cancel that's the
  // prorated share, not the whole booking. NULL on legacy/whole-booking
  // entries: the admin Refunds tab then falls back to the booking amount.
  refundAmountFils: integer("refund_amount_fils"),
  // 'wallet' | 'bank' — how the player asked to receive a partial refund.
  // NULL on entries created before the choice existed.
  refundPreference: text("refund_preference"),
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
  /** Sum of all completed payments rows for this booking. Populated by
   *  /api/marketplace/bookings/mine. Falls back to amountAed when absent. */
  totalPaidAed?: number;
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

export const EXPENSE_PAID_BY_OPTIONS = ["Sandeep", "Arjun", "Hari", "Akhila"] as const;
export type ExpensePaidBy = typeof EXPENSE_PAID_BY_OPTIONS[number];

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey(),
  categoryId: varchar("category_id").notNull().references(() => expenseCategories.id),
  amountAed: integer("amount_aed").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor"),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  paidBy: text("paid_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertExpenseSchema = createInsertSchema(expenses)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ paidBy: z.enum(EXPENSE_PAID_BY_OPTIONS).nullable().optional() });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// ─── Phase 1 — Per-session cost foundation ──────────────────────────────────────
// Finance-domain tables, deliberately kept OFF the player-facing bookableSessions
// table so the finance surface can be walled off cleanly later (Phase 6).
// MONEY UNIT: all amounts here are in FILS (1 AED = 100 fils), matching the wallet
// convention (players.walletBalance, payments.refundedAmount). The bridge to the
// whole-AED columns (bookings.amountAed) is an exact ×100 at read time.

// Venues + their court hire rate, stored PER COURT, PER HOUR, in fils. Sessions still
// carry venueName as free text; a venue is matched to a session by name (venues.name
// is unique), which is also how the backfill (gate e) finds each session's rate.
export const venues = pgTable("venues", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull().unique(),
  courtRateFilsPerHour: integer("court_rate_fils_per_hour").notNull().default(0),
  location: text("location"),      // saved venue location; auto-fills the session's venueLocation
  mapUrl: text("map_url"),          // saved Google Maps link; auto-fills the session's venueMapUrl
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertVenueSchema = createInsertSchema(venues).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venues.$inferSelect;

// Controlled list of people who can RUN a session (the captain). Pay attribution
// (Phase 3) groups by session_runners.id, so renaming a runner never breaks history.
// No pay-rule / percentage fields here — who-ran-it only; pay rules are Phase 3.
export const sessionRunners = pgTable("session_runners", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertSessionRunnerSchema = createInsertSchema(sessionRunners).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionRunner = z.infer<typeof insertSessionRunnerSchema>;
export type SessionRunner = typeof sessionRunners.$inferSelect;

// One cost row per bookable session. court cost auto-fills from the venue rate
// (gate b/d) but is editable; courtCostOverridden latches true once an admin edits it
// so the auto-fill never overwrites a one-off override. captainId = who RAN the session
// (app-level ref to session_runners.id; Shannon's-pay attribution); capturedBy = which
// admin saved the row (audit) — kept separate from captainId on purpose.
export const sessionCosts = pgTable("session_costs", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").notNull().unique(), // → bookableSessions.id (by convention; app-level integrity, house style)
  courtCostFils: integer("court_cost_fils").notNull().default(0),
  shuttleCostFils: integer("shuttle_cost_fils").notNull().default(0),
  waterCostFils: integer("water_cost_fils").notNull().default(0),
  courtCostOverridden: boolean("court_cost_overridden").notNull().default(false),
  captainId: varchar("captain_id"), // → session_runners.id (by convention; nullable)
  capturedBy: text("captured_by"),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});
export const insertSessionCostSchema = createInsertSchema(sessionCosts).omit({ id: true, capturedAt: true });
export type InsertSessionCost = z.infer<typeof insertSessionCostSchema>;
export type SessionCost = typeof sessionCosts.$inferSelect;

// ─── Finance Portal identity (Phase 2) ────────────────────────────────────
// DELIBERATELY separate from the main app's users/roles: the finance portal
// (finance.shuttleiq.ai) has its own tiny login. Rows are seeded only by the
// hand-run migration (scripts/phase2-portal-migrate.mjs); passwords are bcrypt
// hashes and never written from app code.
export const portalUsers = pgTable("portal_users", {
  id: varchar("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Build B — access model. role: 'owner' (everything) | 'runner' (ONLY their own
  // runner-pay). runnerId: app-level ref → session_runners.id (house convention, no FK),
  // set only for role='runner'. Read FRESH per request by requirePortalAuth — never
  // trusted from the JWT — so access changes take effect immediately.
  role: text("role").notNull().default("owner"),
  runnerId: varchar("runner_id"),
  // Phase 6 — token invalidation on password change: any portal JWT issued (iat)
  // before this instant is rejected by requirePortalAuth. NULL = never changed.
  passwordChangedAt: timestamp("password_changed_at"),
});
export type PortalUser = typeof portalUsers.$inferSelect;

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

// ─── Player Link OTPs (proof of player-profile ownership) ─────────────────
export const playerLinkOtps = pgTable("player_link_otps", {
  id: varchar("id").primaryKey(),
  marketplaceUserId: varchar("marketplace_user_id").notNull(),
  playerId: varchar("player_id").notNull(),
  channel: text("channel").notNull(), // 'email' (only channel currently wired)
  destination: text("destination").notNull(), // raw destination used for delivery (audit)
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type PlayerLinkOtp = typeof playerLinkOtps.$inferSelect;

// ─── Player contact-info change requests (self-service profile update) ────
// When a user is in the player-link OTP flow but the on-file email/phone is
// stale, they can request to update that contact. The new value is verified
// via OTP (sent to the NEW value) before it replaces the old one. The row
// itself doubles as the audit trail: who (marketplaceUserId) changed which
// field on which player from oldValue → newValue, and when (verifiedAt).
export const playerContactChangeRequests = pgTable("player_contact_change_requests", {
  id: varchar("id").primaryKey(),
  marketplaceUserId: varchar("marketplace_user_id").notNull(),
  playerId: varchar("player_id").notNull(),
  field: text("field").notNull(), // 'email' | 'phone'
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  status: text("status").notNull().default('pending'), // 'pending' | 'verified' | 'cancelled'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
});
export type PlayerContactChangeRequest = typeof playerContactChangeRequests.$inferSelect;

// Self-service contact change for the marketplace account itself
// (marketplace_users.email / marketplace_users.phone). Same OTP-to-new-value
// pattern as playerContactChangeRequests; the row doubles as an audit trail
// of who changed which field on their own marketplace account from
// oldValue → newValue, and when (verifiedAt).
export const marketplaceUserContactChanges = pgTable("marketplace_user_contact_changes", {
  id: varchar("id").primaryKey(),
  marketplaceUserId: varchar("marketplace_user_id").notNull(),
  field: text("field").notNull(), // 'email' | 'phone'
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  status: text("status").notNull().default('pending'), // 'pending' | 'verified' | 'cancelled'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
});
export type MarketplaceUserContactChange = typeof marketplaceUserContactChanges.$inferSelect;

// ─── Blog Posts ────────────────────────────────────────────────────────────────
export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  slug: varchar("slug", { length: 300 }).notNull().unique(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull().default(""),
  featuredImage: text("featured_image"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  authorName: varchar("author_name", { length: 200 }).notNull().default("ShuttleIQ"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBlogPostSchema = createInsertSchema(blogPosts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ status: z.enum(["draft", "published"]).default("draft") });
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;

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
    byPaidBy: Array<{ paidBy: string | null; label: string; totalAed: number; count: number }>;
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
    photoUrl: string | null;
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
  // Exact time the payment was taken (completedAt preferred, falling back to
  // createdAt) so the admin Refunds tab can show when the booking was paid.
  paymentAt: Date | null;
  // Wallet credit (fils) applied to the original booking. Surfaced so the
  // refund route can cap the Ziina (cash) refund at the captured amount and
  // never refund the wallet-paid portion (returned to wallet separately).
  walletAmountUsed: number | null;
  // Ziina refund state mirrored from the payments row (#231).
  refundStatus: string | null;
  refundedAt: Date | null;
  refundedAmount: number | null;
  ziinaRefundId: string | null;
  // Partial-refund accounting carried on the notification itself (guest-slot
  // cancels). When set, the Refunds tab shows THIS amount (fils) instead of
  // the booking's amountAed, and the preference tells Shannon wallet vs bank.
  refundAmountFils: number | null;
  refundPreference: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// DRIFT-CLEANUP TABLES (re-declared from live DB so future `drizzle-kit
// push` does not try to drop them). All four tables already EXIST in the
// Railway DB; these declarations are describe-only — no DDL is emitted by
// declaring them. Columns and constraints are mirrored from the live DB.
// None of these are wired into current TypeScript paths.
// ─────────────────────────────────────────────────────────────────────────

// Discount codes (parked checkout-discount feature). Live seed row "NEWBIE"
// (50% off, first-time only) currently in the DB.
export const discountCodes = pgTable("discount_codes", {
  id: varchar("id").primaryKey(),
  code: text("code").notNull().unique(), // discount_codes_code_key
  description: text("description"),
  discountType: text("discount_type").notNull(), // 'percentage' | 'fixed'
  discountValue: integer("discount_value").notNull(),
  firstTimeOnly: boolean("first_time_only").notNull().default(false),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDiscountCodeSchema = createInsertSchema(discountCodes).omit({ id: true, createdAt: true });
export type InsertDiscountCode = z.infer<typeof insertDiscountCodeSchema>;
export type DiscountCode = typeof discountCodes.$inferSelect;

// Linkage of a discount-code redemption to its booking + user. booking_id is
// UNIQUE (one code per booking). code_id has a real FK to discount_codes.id.
export const discountCodeUses = pgTable("discount_code_uses", {
  id: varchar("id").primaryKey(),
  codeId: varchar("code_id").notNull().references(() => discountCodes.id),
  bookingId: varchar("booking_id").notNull().unique(), // discount_code_uses_booking_id_key
  userId: varchar("user_id").notNull(),
  discountAmountAed: integer("discount_amount_aed").notNull(),
  usedAt: timestamp("used_at").notNull().defaultNow(),
});

export const insertDiscountCodeUseSchema = createInsertSchema(discountCodeUses).omit({ id: true, usedAt: true });
export type InsertDiscountCodeUse = z.infer<typeof insertDiscountCodeUseSchema>;
export type DiscountCodeUse = typeof discountCodeUses.$inferSelect;

// Admin-mediated player-linking workflow (fallback when the OTP self-service
// path doesn't fit; the marketplace-routes.ts:~1200 OTP flow is the primary
// path today). Two partial-unique indexes prevent a user opening multiple
// pending requests against the same player (or against no player at all).
export const playerLinkRequests = pgTable("player_link_requests", {
  id: varchar("id").primaryKey(),
  marketplaceUserId: varchar("marketplace_user_id").notNull(),
  playerId: varchar("player_id"),
  reason: text("reason").notNull(),
  note: text("note"),
  status: text("status").notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  resolvedByAdminId: varchar("resolved_by_admin_id"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unique_pending_link_request_per_user_no_player')
    .on(table.marketplaceUserId)
    .where(sql`status = 'pending' AND player_id IS NULL`),
  uniqueIndex('unique_pending_link_request_per_user_player')
    .on(table.marketplaceUserId, table.playerId)
    .where(sql`status = 'pending'`),
]);

export const insertPlayerLinkRequestSchema = createInsertSchema(playerLinkRequests).omit({ id: true, createdAt: true });
export type InsertPlayerLinkRequest = z.infer<typeof insertPlayerLinkRequestSchema>;
export type PlayerLinkRequest = typeof playerLinkRequests.$inferSelect;

// ─── Player merge log (Gate M1) ───────────────────────────────────────────
// One row per admin-triggered player merge (absorbed → survivor). Carries the
// full pre-merge state needed to undo: the absorbed player's row as JSON, the
// survivor's pre-merge stats, per-table lists of re-pointed row ids, rows
// deleted for dedupe (restored verbatim on undo), and the ids of the two
// offsetting wallet adjustment entries (the ledger itself is append-only —
// merges move balances with new entries, never by touching existing rows).
export const playerMergeLog = pgTable("player_merge_log", {
  id: varchar("id").primaryKey(),
  survivorId: varchar("survivor_id").notNull(),
  absorbedId: varchar("absorbed_id").notNull(),
  adminId: varchar("admin_id").notNull(),
  absorbedSnapshot: jsonb("absorbed_snapshot").notNull(), // full players row pre-merge
  survivorSnapshot: jsonb("survivor_snapshot").notNull(), // survivor stats pre-merge
  repointed: jsonb("repointed").notNull(), // { table: [row ids] } — exactly what moved
  restoreRows: jsonb("restore_rows").notNull(), // { table: [full rows] } — dedupe-deleted, re-inserted on undo
  walletMovedFils: integer("wallet_moved_fils").notNull().default(0),
  walletDebitTxId: varchar("wallet_debit_tx_id"),
  walletCreditTxId: varchar("wallet_credit_tx_id"),
  accountLinkMovedUserId: varchar("account_link_moved_user_id"),
  status: text("status").notNull().default('applied'), // 'applied' | 'undone'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  undoneAt: timestamp("undone_at"),
  undoneByAdminId: varchar("undone_by_admin_id"),
});
export type PlayerMergeLog = typeof playerMergeLog.$inferSelect;

// ─── Feed events (Gate F2) ────────────────────────────────────────────────
// One APPEND-mostly row per feed-worthy moment, generated inside the same
// transaction as the source write (completeGameTransaction, tag create).
// Render-from-payload principle: everything a card needs is FROZEN at event
// time (display names, display tiers, positions) so recalcs and merges can't
// silently change published posts. Score corrections supersede rather than
// delete; the (type, dedupe_key) unique index makes generators re-runnable.
export const feedEvents = pgTable("feed_events", {
  id: varchar("id").primaryKey(),
  type: text("type").notNull(), // 'tier_promotion' | 'milestone' | 'win_streak' | 'leaderboard_move' | 'tag_received' | (F4+: 'session_recap' | 'smash_of_week' | 'scarcity')
  subjectPlayerId: varchar("subject_player_id"), // who the post is about; merge re-points this
  gameResultId: varchar("game_result_id"), // correction anchor: score edits supersede by this
  sessionId: varchar("session_id"),
  relatedTagId: varchar("related_tag_id"),
  payload: jsonb("payload").notNull(), // frozen display data — names + display tiers, never DB enums
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default('published'), // 'published' | 'retracted' | 'superseded'
  supersededByEventId: varchar("superseded_by_event_id"),
  visibility: text("visibility").notNull().default('public'),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_feed_event_dedupe').on(t.type, t.dedupeKey),
  index('idx_feed_events_created').on(t.createdAt),
  index('idx_feed_events_subject').on(t.subjectPlayerId),
]);
export type FeedEvent = typeof feedEvents.$inferSelect;

// Real player likes: one per player per event. Merge re-points player_id
// (deduping on the PK like tag_suggestion_votes).
export const feedEventLikes = pgTable("feed_event_likes", {
  eventId: varchar("event_id").notNull(),
  playerId: varchar("player_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.eventId, t.playerId] }),
]);
export type FeedEventLike = typeof feedEventLikes.$inferSelect;

// One-shot migration tracking (used by scripts/* to prevent re-runs). `key`
// is the natural PK. Existing rows: discount_code_newbie_seed_v1 (2026-05-20)
// and onboarding_completed_legacy_backfill_v1 (2026-05-12).
export const systemOneShotMigrations = pgTable("system_one_shot_migrations", {
  key: text("key").primaryKey(),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
});

export type SystemOneShotMigration = typeof systemOneShotMigrations.$inferSelect;
