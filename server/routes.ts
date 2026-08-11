import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { applyWalletDelta } from "./walletLedger";
import { insertPlayerSchema, insertSessionSchema, gameResults, gameParticipants, players, sessions, tags, playerTags, tagSuggestions, insertTagSuggestionSchema, insertBlogPostSchema, referrals, marketplaceUsers } from "@shared/schema";
import { buildTagFeedEvents, buildCorrectionReplacements, insertFeedEvents, supersedeGameFeedEvents } from "./feedEvents";
import { findPlayerCandidates, isFullName } from "@shared/utils/playerMatching";
import { mergePlayers, undoPlayerMerge, MergeError } from "./playerMerge";
import { BLOG_UPLOADS_DIR } from "./uploadsRoot";
import { getSkillTier, getTierDisplayName } from "@shared/utils/skillUtils";
import { primarySlotActive } from "@shared/utils/slotUtils";
import { autoFillCourtCostFils } from "./sessionCostCompute";
import { sendReferralCreditEmail, sendReferralMilestoneEmail } from "./emailClient";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "./db";
import { sql, eq, inArray, and, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCaptain, requireMarketplaceAuth, type AuthRequest } from "./auth/middleware";
import { verifyAccessToken } from "./auth/utils";
import { 
  generateAccessToken, 
  generateRefreshToken, 
  comparePassword, 
  verifyRefreshToken,
  generateSessionId
} from "./auth/utils";
import {
  findAdminByEmail,
  updateAdminLastLogin,
  createAuthSession,
  findAuthSession,
  deleteAuthSession,
  deleteSessionsForUser,
  findAdminById,
  seedAdminUser,
  rotateDefaultAdminPassword,
  ensureOwnerSuperAdmin
} from "./auth/storage";
import {
  buildPartnerHistoryFromHistory,
  repeatReceipt,
  selectOptimalPlayers,
  findBalancedTeams,
  generateAllMatchupOptions,
  generateBracketedLineups,
  updatePlayerRestState,
  updatePartnerHistory,
  clearPlayerRestState,
  clearSessionRestStates,
  toggleSittingOut,
  getSittingOutPlayers,
  clearSittingOutPlayer,
  getPlayerRestState,
  getTierIndex,
  persistRestStatesToDb,
  ensureRestStatesHydrated,
  persistSittingOutFlag,
  deletePersistedRestState,
  playerPassesBand,
  bandDistance,
  COURT_SKILL_BANDS,
  type TeamCombination
} from "./matchmaking";
import {
  deriveSessionPlayFromHistory,
  orderRotationCandidates,
  buildRotationSeatings,
  pairingKey,
  pickArrangement,
  rankByBalance,
  deriveRecentPairings,
  FAIR_GAME_GAP,
  type RotationCandidate,
} from "./rotation-planner";
import { registerMarketplaceRoutes } from "./marketplace-routes";
import { seedExpenseCategories } from "./portal/portalExpenses";
import { registerVenueRoutes } from "./venueRoutes";
import { registerSessionCostRoutes } from "./sessionCostRoutes";
import { registerPortalRoutes } from "./portal/portalRoutes";

// ─── Tier buffer helper ───────────────────────────────────────────────────────
// After each game, a player's confirmed level (stored in DB) only changes after
// 3 consecutive games where their skill score lands in the new tier.
// Until then, tierCandidate + tierCandidateGames track the trend.
function applyTierBuffer(
  player: { level: string; tierCandidate: string | null; tierCandidateGames: number },
  newScore: number,
  getSkillTierFn: (score: number) => string
): { level: string; tierCandidate: string | null; tierCandidateGames: number } {
  const scoreTier = getSkillTierFn(newScore);
  const currentTier = player.level;

  if (scoreTier === currentTier) {
    // Score stays in same tier — reset candidate
    return { level: currentTier, tierCandidate: null, tierCandidateGames: 0 };
  }

  // Score crossed a tier boundary — check candidate progression
  const existingCandidate = player.tierCandidate;
  const existingCount = player.tierCandidateGames ?? 0;

  let newCandidate: string;
  let newCount: number;

  if (scoreTier === existingCandidate) {
    // Continuing toward same candidate tier
    newCount = existingCount + 1;
    newCandidate = existingCandidate;
  } else {
    // Changed direction or different candidate — start fresh
    newCandidate = scoreTier;
    newCount = 1;
  }

  if (newCount >= 3) {
    // Confirmed — promote or demote
    return { level: scoreTier, tierCandidate: null, tierCandidateGames: 0 };
  }

  // Not yet confirmed — keep current tier
  return { level: currentTier, tierCandidate: newCandidate, tierCandidateGames: newCount };
}

import { completeReferral, linkReferralPostSignup } from "./referrals";
import { requestClaudeMatchmaking, requestClaudeLineupOptions, aiMatchmakingModel } from "./claude-matchmaking";
export { completeReferral };

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed admin user on startup (dev only), then rotate legacy password (all envs)
  await seedAdminUser();
  await rotateDefaultAdminPassword();
  await ensureOwnerSuperAdmin();

  // Register marketplace routes
  registerMarketplaceRoutes(app);

  // Seed default expense categories (expense routes now live in the portal boundary)
  await seedExpenseCategories();

  // Register venue routes (Phase 1 — super-admin venue price book)
  registerVenueRoutes(app);

  // Register session-cost read routes (Phase 1 gate d — session-form dropdowns + prefill)
  registerSessionCostRoutes(app);

  // Register finance-portal routes (Phase 2 — /api/portal/*, own identity + host wall)
  registerPortalRoutes(app);

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const admin = await findAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, admin.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await updateAdminLastLogin(admin.id);
      
      // Delete any existing sessions for this user to prevent session conflicts
      await deleteSessionsForUser(admin.id);

      const payload = {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await createAuthSession(admin.id, refreshToken, expiresAt);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await deleteAuthSession(refreshToken);
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ error: "Refresh token required" });
      }

      const session = await findAuthSession(refreshToken);
      if (!session) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      if (new Date() > new Date(session.expiresAt)) {
        await deleteAuthSession(refreshToken);
        return res.status(401).json({ error: "Refresh token expired" });
      }

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      const admin = await findAdminById(payload.userId);
      if (!admin) {
        return res.status(401).json({ error: "User not found" });
      }

      const newAccessToken = generateAccessToken({
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const admin = await findAdminById(req.user!.userId);
      if (!admin) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: admin.id,
        email: admin.email,
        role: admin.role,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Session routes - Protected with auth
  app.post("/api/sessions", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const requestData = {
        ...req.body,
        date: new Date(req.body.date),
      };
      
      const validated = insertSessionSchema.parse(requestData);
      
      const statusToCreate = validated.status || 'active';
      if (statusToCreate === 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before creating a new active session." 
          });
        }
      }
      
      const session = await storage.createSession(validated);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.post("/api/sessions/unified", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { marketplace: rawMarketplace, ...sessionData } = req.body;
      
      const requestData = {
        ...sessionData,
        date: new Date(sessionData.date),
      };
      
      const validated = insertSessionSchema.parse(requestData);

      // Validate the marketplace block (was previously spread unvalidated). Covers the
      // fields the create wizard sends today + optional STEP 3/4 passthrough (captain/
      // costs) that later steps will write — parsed here but NOT acted on this step.
      // Bad input throws ZodError → the existing catch returns 400.
      const marketplaceSchema = z.object({
        enabled: z.boolean().optional(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        capacity: z.number().int().min(1).optional(),
        priceAed: z.number().int().min(0).optional(),
        captainId: z.string().nullable().optional(),
        courtCostAed: z.number().min(0).nullable().optional(),
        shuttleCostAed: z.number().min(0).nullable().optional(),
        waterCostAed: z.number().min(0).nullable().optional(),
        courtCostOverridden: z.boolean().optional(),
      }).strip();
      const marketplace = rawMarketplace ? marketplaceSchema.parse(rawMarketplace) : undefined;

      // Reject sandbox + marketplace combination before any DB write
      if (validated.isSandbox && marketplace && marketplace.enabled) {
        return res.status(400).json({ error: "Sandbox sessions cannot be published to the marketplace" });
      }
      
      const statusToCreate = validated.status || 'active';
      if (statusToCreate === 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before creating a new active session." 
          });
        }
      }
      
      const session = await storage.createSession(validated);
      
      let bookableSession = null;
      if (marketplace && marketplace.enabled) {
        bookableSession = await storage.createBookableSession({
          title: marketplace.title || session.venueName,
          description: marketplace.description || null,
          venueName: session.venueName,
          venueLocation: session.venueLocation || null,
          venueMapUrl: session.venueMapUrl || null,
          date: new Date(sessionData.date),
          startTime: marketplace.startTime || '18:00',
          endTime: marketplace.endTime || '21:00',
          courtCount: session.courtCount,
          capacity: marketplace.capacity || 16,
          priceAed: marketplace.priceAed || 50,
          status: 'upcoming',
          imageUrl: null,
          linkedSessionId: session.id,
        });
      }
      
      // STEP 3 — best-effort session-cost capture on create. Court cost AUTO-FILLS from
      // the venue rate; shuttle/water/captain come from the validated marketplace
      // passthrough. A failure here MUST NOT break session creation (log + continue;
      // backfillable). session_costs.session_id is UNIQUE → insert-if-absent.
      if (bookableSession) {
        try {
          const { courtCostFils, reason } = await autoFillCourtCostFils(bookableSession.venueName, bookableSession.courtCount, bookableSession.startTime, bookableSession.endTime);
          console.log(`[SessionCost] create ${bookableSession.id}: court cost ${courtCostFils} fils (${reason})`);
          const shuttleCostFils = marketplace?.shuttleCostAed != null ? Math.round(marketplace.shuttleCostAed * 100) : 0;
          const waterCostFils = marketplace?.waterCostAed != null ? Math.round(marketplace.waterCostAed * 100) : 0;
          await storage.createSessionCostsIfAbsent({
            sessionId: bookableSession.id,
            courtCostFils,
            shuttleCostFils,
            waterCostFils,
            courtCostOverridden: false,
            captainId: marketplace?.captainId ?? null,
            capturedBy: req.user?.userId ?? null,
          });
        } catch (costErr) {
          console.error(`[SessionCost] create — cost capture failed for session ${bookableSession.id} (session still created; backfillable):`, costErr instanceof Error ? costErr.message : costErr);
        }
      }

      res.status(201).json({ session, bookableSession });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      console.error('Unified session creation error:', error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions/active", async (req, res) => {
    try {
      const session = await storage.getActiveSession();
      if (!session) {
        return res.status(404).json({ error: "No active session" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.get("/api/sessions", async (req: AuthRequest, res) => {
    try {
      const sandbox = req.query.sandbox === 'true';
      if (sandbox) {
        // Sandbox listing is admin-only — parse token inline for this optional-auth route
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = token ? verifyAccessToken(token) : null;
        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
          return res.status(403).json({ error: "Admin access required" });
        }
      }
      const sessions = await storage.getAllSessions(sandbox);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.patch("/api/sessions/:id", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (req.body.status === 'active' && session.status !== 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive && existingActive.id !== req.params.id) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before activating a new one." 
          });
        }

        // Date-lock: non-sandbox sessions can only be activated on or after their scheduled date
        if (!session.isSandbox && session.date) {
          const sessionDate = new Date(session.date);
          const todayUTC = new Date();
          const sessionDateOnly = new Date(Date.UTC(sessionDate.getUTCFullYear(), sessionDate.getUTCMonth(), sessionDate.getUTCDate()));
          const todayDateOnly = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));
          if (sessionDateOnly > todayDateOnly) {
            // Match frontend date-fns PPP format: "April 4th, 2026"
            const day = sessionDate.getUTCDate();
            const suffix = day >= 11 && day <= 13 ? 'th' : ['th','st','nd','rd','th'][Math.min(day % 10, 4)];
            const month = sessionDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
            const year = sessionDate.getUTCFullYear();
            const formatted = `${month} ${day}${suffix}, ${year}`;
            return res.status(400).json({ error: `This session can only be activated on or after ${formatted}` });
          }
        }
      }

      const updates = { ...req.body };
      if (updates.date && typeof updates.date === 'string') {
        updates.date = new Date(updates.date);
      }

      const updated = await storage.updateSession(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Failed to update session:', error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // deleteSession now handles rest state clearing internally
      const deleted = await storage.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  app.post("/api/sessions/:id/end", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getSession(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Sandbox sessions are permanently deleted on end — no archive, clean slate
      if (existing.isSandbox) {
        clearSessionRestStates(req.params.id);
        await storage.deleteSession(req.params.id);
        return res.json({ deleted: true, sandbox: true });
      }

      const session = await storage.endSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Clear rest states for this session
      clearSessionRestStates(req.params.id);
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  app.get("/api/sessions/:id/bookings", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const bookableSession = await storage.getBookableSessionByLinkedSessionId(sessionId);
      if (!bookableSession) {
        return res.json({ linked: false, bookings: [] });
      }

      const sessionBookings = await storage.getSessionBookings(bookableSession.id);
      const nonCancelled = sessionBookings.filter(b => b.status !== 'cancelled');

      const result = await Promise.all(nonCancelled.map(async (b) => {
        // Gate 3 (Option A): the primary plays iff their slot row is active.
        // No-row legacy bookings stay active by the shared rule. The booking
        // entry itself is KEPT either way — its guest slots must remain
        // check-in-able even when the booker's own spot is gone.
        const primaryActive = primarySlotActive(b.guests);
        let player = null;
        if (primaryActive && b.user?.linkedPlayerId) {
          player = await storage.getPlayer(b.user.linkedPlayerId);
        }
        return {
          bookingId: b.id,
          bookingStatus: b.status,
          attendedAt: b.attendedAt,
          paymentMethod: b.paymentMethod,
          cashPaid: b.cashPaid,
          primaryActive,
          user: primaryActive && b.user ? {
            id: b.user.id,
            name: b.user.name,
            email: b.user.email,
            linkedPlayerId: b.user.linkedPlayerId,
          } : null,
          player: player || null,
          // Extra paid spots with no booker profile of their own. linkedPlayerId
          // is the effective player (account guest, or an auto-created pure-guest
          // player); null = a pure guest who still needs a player on check-in.
          guests: (b.guests ?? [])
            .filter(g => !g.isPrimary && g.status === 'confirmed')
            .map(g => ({ guestId: g.id, name: g.name, linkedPlayerId: g.linkedPlayerId ?? null })),
        };
      }));

      res.json({ linked: true, bookings: result });
    } catch (error) {
      console.error('Get session bookings error:', error);
      res.status(500).json({ error: "Failed to fetch session bookings" });
    }
  });

  // Ensure a Player exists for a booked GUEST slot so the captain can queue +
  // check them in. Idempotent: reuses an already-linked player (account guest, or
  // a guest linked on a prior check-in); for a pure guest with no account/link it
  // auto-creates a lightweight Intermediate player and attaches it to the guest
  // row via CAS, so re-opening the modal never creates a duplicate.
  app.post("/api/sessions/:id/guests/:guestId/ensure-player", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const guestId = req.params.guestId;

      const bookableSession = await storage.getBookableSessionByLinkedSessionId(sessionId);
      if (!bookableSession) return res.status(404).json({ error: "No linked bookable session found" });

      const guest = await storage.getBookingGuestById(guestId);
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      if (guest.isPrimary || guest.status !== 'confirmed') {
        return res.status(400).json({ error: "Not a confirmed guest slot" });
      }
      const booking = await storage.getBooking(guest.bookingId);
      if (!booking || booking.sessionId !== bookableSession.id) {
        return res.status(404).json({ error: "Guest does not belong to this session" });
      }

      // Reuse an existing link (account guest or already-checked-in guest).
      if (guest.linkedPlayerId) {
        return res.json({ playerId: guest.linkedPlayerId, created: false });
      }

      // P1a: captain picked an existing player from the same-person sheet —
      // link the guest row to them instead of minting a duplicate. The CAS
      // link keeps this idempotent under concurrent check-ins, and the queue
      // add downstream already dedupes if they're in the session.
      const linkToPlayerId = (req.body?.linkToPlayerId ?? '').toString();
      if (linkToPlayerId) {
        const existing = await storage.getPlayer(linkToPlayerId);
        if (!existing) return res.status(404).json({ error: "Player not found" });
        const linked = await storage.linkPlayerToGuest(guestId, linkToPlayerId);
        if (!linked) {
          const fresh = await storage.getBookingGuestById(guestId);
          return res.json({ playerId: fresh?.linkedPlayerId ?? linkToPlayerId, created: false });
        }
        return res.json({ playerId: linkToPlayerId, created: false, linked: true });
      }

      // P1a: same-person check — before minting a player from a typed guest
      // name, surface existing players who look like this person. The captain
      // resolves with one tap: link a candidate, or forceNew to create.
      // No candidates → fall through and create exactly as before.
      if (req.body?.forceNew !== true) {
        const candidates = findPlayerCandidates(await storage.getAllPlayers(), { name: guest.name });
        if (candidates.length > 0) {
          return res.json({ candidates, guestName: guest.name });
        }
      }

      // Pure guest → the captain picks the gender at check-in (no 'unknown').
      const gender = (req.body?.gender ?? '').toString();
      if (gender !== 'Male' && gender !== 'Female') {
        return res.status(400).json({ error: "A gender (Male or Female) is required for a new guest player" });
      }

      // Auto-create a lightweight Intermediate player (mirrors the POST /api/players
      // "Intermediate" mapping: level lower_intermediate, score 80).
      const newPlayer = await storage.createPlayer({
        name: guest.name,
        gender,
        level: 'lower_intermediate',
        skillScore: 80,
        gamesPlayed: 0,
        wins: 0,
        status: 'waiting',
      });
      // CAS link — if a concurrent request linked one first, keep theirs and drop
      // this duplicate (it never entered the queue).
      const linked = await storage.linkPlayerToGuest(guestId, newPlayer.id);
      if (!linked) {
        const fresh = await storage.getBookingGuestById(guestId);
        return res.json({ playerId: fresh?.linkedPlayerId ?? newPlayer.id, created: false });
      }
      return res.json({ playerId: newPlayer.id, created: true });
    } catch (error) {
      console.error('Ensure guest player error:', error);
      res.status(500).json({ error: "Failed to prepare guest player" });
    }
  });

  app.patch("/api/sessions/:id/bookings/:bookingId/checkin", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const bookingId = req.params.bookingId;

      const bookableSession = await storage.getBookableSessionByLinkedSessionId(sessionId);
      if (!bookableSession) {
        return res.status(404).json({ error: "No linked bookable session found" });
      }

      const booking = await storage.getBooking(bookingId);
      if (!booking || booking.sessionId !== bookableSession.id) {
        return res.status(404).json({ error: "Booking not found for this session" });
      }

      // Gate 3 (Option A): this stamp is booking-level and the guest check-in
      // flow fires it too, so a cancelled PRIMARY alone must not block it —
      // the wife still checks in. Refuse only when NO slot is active at all
      // (nobody left on the booking to check in). Legacy no-row bookings have
      // zero rows and stay stampable via the empty-rows escape.
      const slotRows = await storage.getBookingGuests(bookingId);
      const anyActiveSlot = slotRows.length === 0 || slotRows.some((s) => s.status !== 'cancelled');
      if (!anyActiveSlot) {
        return res.status(400).json({ error: "This spot was cancelled." });
      }

      const updated = await storage.updateBooking(bookingId, {
        attendedAt: new Date(),
      });
      if (!updated) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // PR2: attendance-based referral trigger removed. Referral completion
      // now happens at first confirmed payment (Ziina webhook / cash-paid /
      // admin-confirm / full-wallet / waitlist-promotion-cash), not on
      // check-in. The admin force-complete endpoint at
      // POST /api/referrals/:id/complete (below) still uses completeReferral
      // for the manual-override case.

      res.json(updated);
    } catch (error) {
      console.error('Checkin booking error:', error);
      res.status(500).json({ error: "Failed to check in booking" });
    }
  });

  app.get("/api/sessions/:id/game-history", async (req, res) => {
    try {
      const games = await storage.getSessionGameHistory(req.params.id);
      if (games.length === 0) return res.json([]);

      const gameIds = games.map(g => g.id);

      // Single batch query for all participants
      const allParticipants = await db
        .select()
        .from(gameParticipants)
        .where(inArray(gameParticipants.gameId, gameIds));

      // Single batch query for all players referenced
      const playerIds = [...new Set(allParticipants.map(p => p.playerId))];
      const allPlayers = playerIds.length > 0
        ? await db.select().from(players).where(inArray(players.id, playerIds))
        : [];
      const playerMap = new Map(allPlayers.map(p => [p.id, p]));

      // Group participants by gameId
      const participantsByGame = new Map<string, typeof allParticipants>();
      for (const p of allParticipants) {
        if (!participantsByGame.has(p.gameId)) participantsByGame.set(p.gameId, []);
        participantsByGame.get(p.gameId)!.push(p);
      }

      const gamesWithDetails = games.map(game => ({
        ...game,
        participants: (participantsByGame.get(game.id) || []).map(p => ({
          ...p,
          playerName: playerMap.get(p.playerId)?.name || 'Unknown',
          playerLevel: playerMap.get(p.playerId)?.level || 'Unknown',
        })),
      }));

      res.json(gamesWithDetails);
    } catch (error) {
      console.error('Session game history error:', error);
      res.status(500).json({ error: "Failed to fetch session game history" });
    }
  });

  // Edit game result (update scores)
  app.patch("/api/game-results/:id", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { team1Score, team2Score } = req.body;
      const gameId = req.params.id;

      if (team1Score === undefined || team2Score === undefined) {
        return res.status(400).json({ error: "team1Score and team2Score are required" });
      }

      // Server-side validation: no ties allowed
      if (team1Score === team2Score) {
        return res.status(400).json({ error: "Scores cannot be tied. One team must win." });
      }

      // Get existing game result
      const [existingGame] = await db.select().from(gameResults).where(eq(gameResults.id, gameId));
      if (!existingGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Block score edits for sandbox session games — they have no effect on global stats
      const gameSession = await storage.getSession(existingGame.sessionId);
      if (gameSession?.isSandbox) {
        return res.status(403).json({ error: "Cannot edit game results from a sandbox session" });
      }

      // Determine new winning team
      const newWinningTeam = team1Score > team2Score ? 1 : 2;
      const oldWinningTeam = existingGame.winningTeam;
      const winnerChanged = newWinningTeam !== oldWinningTeam;

      // Update game result
      await db.update(gameResults)
        .set({ team1Score, team2Score, winningTeam: newWinningTeam })
        .where(eq(gameResults.id, gameId));

      // Get all participants for this game
      const participants = await db.select().from(gameParticipants).where(eq(gameParticipants.gameId, gameId));
      
      // Get player details
      const playerIds = participants.map(p => p.playerId);
      const playerList = await db.select().from(players).where(inArray(players.id, playerIds));
      const playerMap = new Map(playerList.map(p => [p.id, p]));

      const { calculateSkillAdjustment, getSkillTier } = await import('@shared/utils/skillUtils');
      
      // Get opponent average skill (from baseline scores before this game)
      const team1Participants = participants.filter(p => p.team === 1);
      const team2Participants = participants.filter(p => p.team === 2);
      
      const team1AvgSkill = team1Participants.reduce((sum, p) => sum + p.skillScoreBefore, 0) / team1Participants.length;
      const team2AvgSkill = team2Participants.reduce((sum, p) => sum + p.skillScoreBefore, 0) / team2Participants.length;
      const pointDifferential = Math.abs(team1Score - team2Score);

      // Process each participant
      const correctionPlayers: Array<{ playerId: string; name: string; prevLevel: string; newLevel: string }> = [];
      for (const participant of participants) {
        const player = playerMap.get(participant.playerId);
        if (!player) continue;

        const wasWinner = participant.team === oldWinningTeam;
        const isNowWinner = participant.team === newWinningTeam;
        
        // Reverse old skill change from player's current score
        const oldChange = participant.skillScoreAfter - participant.skillScoreBefore;
        const baselineSkill = player.skillScore - oldChange;
        
        // Calculate new skill adjustment from the baseline (skillScoreBefore)
        const opponentAvgSkill = participant.team === 1 ? team2AvgSkill : team1AvgSkill;

        // Fix 1: Find partner's skillScoreBefore for contribution factor
        const partnerParticipant = participants.find(
          p => p.team === participant.team && p.playerId !== participant.playerId
        );
        const partnerScoreBefore = partnerParticipant?.skillScoreBefore ?? null;
        
        const newSkillAfter = calculateSkillAdjustment(
          participant.skillScoreBefore,
          opponentAvgSkill,
          isNowWinner,
          pointDifferential,
          player.gamesPlayed || 0,
          partnerScoreBefore
        );
        
        // Calculate what player's new current skill should be
        const newChange = newSkillAfter - participant.skillScoreBefore;
        const newCurrentSkill = baselineSkill + newChange;

        // Apply 3-game tier promotion buffer
        const tierResult = applyTierBuffer(
          { level: player.level, tierCandidate: player.tierCandidate ?? null, tierCandidateGames: player.tierCandidateGames ?? 0 },
          newCurrentSkill,
          getSkillTier
        );
        
        // Update game participant record with new skill after
        await db.update(gameParticipants)
          .set({ skillScoreAfter: newSkillAfter })
          .where(and(
            eq(gameParticipants.gameId, gameId),
            eq(gameParticipants.playerId, participant.playerId)
          ));
        
        // Calculate wins adjustment only if winner changed
        const winsAdjustment = winnerChanged 
          ? (wasWinner && !isNowWinner ? -1 : (!wasWinner && isNowWinner ? 1 : 0))
          : 0;
        
        await storage.updatePlayer(participant.playerId, {
          skillScore: newCurrentSkill,
          level: tierResult.level,
          tierCandidate: tierResult.tierCandidate,
          tierCandidateGames: tierResult.tierCandidateGames,
          wins: Math.max(0, player.wins + winsAdjustment),
        });

        correctionPlayers.push({
          playerId: participant.playerId,
          name: player.name,
          prevLevel: player.level,
          newLevel: tierResult.level,
        });
      }

      // Feed events (Gate F2): a correction that flips the winner or changes
      // a tier outcome supersedes this game's published events and emits
      // replacements. supersedeGameFeedEvents is self-guarded — a feed
      // failure never fails the correction.
      const tierChanged = correctionPlayers.some(p => p.newLevel !== p.prevLevel);
      if (winnerChanged || tierChanged) {
        await supersedeGameFeedEvents(gameId, buildCorrectionReplacements({
          gameResultId: gameId,
          sessionId: existingGame.sessionId,
          newWinningTeam,
          perPlayer: correctionPlayers,
        }));
      }

      // Return updated game with session ID for cache invalidation
      const [updatedGame] = await db.select().from(gameResults).where(eq(gameResults.id, gameId));
      res.json(updatedGame);
    } catch (error) {
      console.error('Update game result error:', error);
      res.status(500).json({ error: "Failed to update game result" });
    }
  });

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.get("/api/players/search", async (req, res) => {
    try {
      const query = req.query.q as string || '';
      if (!query) {
        return res.json([]);
      }
      const players = await storage.searchPlayers(query);
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to search players" });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  app.get("/api/players/:id/stats", async (req, res) => {
    try {
      const stats = await storage.getPlayerStats(req.params.id);
      if (!stats) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(stats);
    } catch (error) {
      console.error('Player stats error:', error);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  app.post("/api/players", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();

      const validated = insertPlayerSchema.parse(req.body);
      
      // Operators can assign Novice/Beginner/Intermediate/Competitive at creation.
      // Advanced/Professional are earned through gameplay — cap at lower_intermediate.
      const ALLOWED_LEVELS: Record<string, { level: string; score: number }> = {
        'Novice':             { level: 'Novice',             score: 25 },
        'Beginner':           { level: 'Beginner',           score: 50 },
        'Intermediate':       { level: 'lower_intermediate', score: 80 },
        'lower_intermediate': { level: 'lower_intermediate', score: 80 },
        'upper_intermediate': { level: 'upper_intermediate', score: 100 },
        'Competitive':        { level: 'upper_intermediate', score: 100 },
        'Advanced':           { level: 'lower_intermediate', score: 80 },
        'Professional':       { level: 'lower_intermediate', score: 80 },
      };
      const levelEntry = ALLOWED_LEVELS[validated.level] ?? { level: 'lower_intermediate', score: 80 };
      const skillScore = levelEntry.score;
      const normalizedLevel = levelEntry.level;

      // P1b: did-you-mean before insert. force:true (an explicit second tap)
      // bypasses both the duplicate-candidate check and the single-name
      // policy — Shannon is never hard-blocked mid-session.
      if (req.body?.force !== true) {
        const candidates = findPlayerCandidates(
          await storage.getAllPlayers(),
          { name: validated.name, phone: validated.phone },
        );
        const singleName = !isFullName(validated.name);
        if (candidates.length > 0 || singleName) {
          return res.status(409).json({
            error: candidates.length > 0
              ? "This may be an existing player"
              : "That looks like a first name only",
            code: candidates.length > 0 ? 'DUPLICATE_CANDIDATES' : 'SINGLE_NAME',
            candidates,
          });
        }
      }

      const player = await storage.createPlayer({ ...validated, level: normalizedLevel, skillScore });
      
      // Only add to queue if there's an active session
      if (activeSession) {
        await storage.addToQueue(activeSession.id, player.id);
      }
      
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid player data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const updates = { ...req.body };
      // Keep skillScoreBaseline in sync when an admin manually edits skillScore,
      // so inactivity decay continues to use the correct anchor going forward.
      if (typeof updates.skillScore === 'number' && updates.skillScoreBaseline === undefined) {
        updates.skillScoreBaseline = updates.skillScore;
      }
      const player = await storage.updatePlayer(req.params.id, updates);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      await storage.removeFromQueue(activeSession.id, req.params.id);
      
      // Clear rest state when player is removed
      clearPlayerRestState(activeSession.id, req.params.id);
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.post("/api/players/import", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // Validate request body - support both URL and CSV content, plus optional sessionId
      const requestSchema = z.union([
        z.object({ 
          url: z.string().url(),
          sessionId: z.string().optional()
        }),
        z.object({ 
          csvContent: z.string(),
          sessionId: z.string().optional()
        })
      ]);
      
      const validated = requestSchema.parse(req.body);
      
      // Determine which session to add players to
      let targetSession = null;
      if (validated.sessionId) {
        // Explicit sessionId provided - validate it exists
        targetSession = await storage.getSession(validated.sessionId);
        if (!targetSession) {
          return res.status(404).json({ error: "Session not found" });
        }
      } else {
        // Fall back to active session for backward compatibility
        targetSession = await storage.getActiveSession();
      }

      let playersToImport: any[] = [];

      // Handle CSV content
      if ('csvContent' in validated) {
        const csvContent = validated.csvContent;
        
        // Limit CSV size to 1MB
        if (csvContent.length > 1024 * 1024) {
          return res.status(400).json({ 
            error: "CSV file too large",
            details: "Maximum file size is 1MB"
          });
        }

        // Parse CSV
        const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length === 0) {
          return res.status(400).json({ error: "Empty CSV file" });
        }

        // Check for header row (skip if present)
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('name') || firstLine.includes('gender') || firstLine.includes('level');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Parse CSV rows
        // Supports multiple formats:
        // 1. externalId, name, gender, skillScore (numeric)
        // 2. externalId, name, gender, level (text - legacy)
        // 3. name, gender, skillScore/level
        playersToImport = dataLines.map((line, index) => {
          const fields = line.split(',').map(f => f.trim());
          if (fields.length < 2) {
            throw new Error(`Invalid CSV format on line ${index + (hasHeader ? 2 : 1)}: expected at least name`);
          }
          
          const hasExternalId = fields.length >= 4;
          const skillOrLevel = hasExternalId ? fields[3] : (fields[2] || '50');
          
          // Check if last field is numeric (skillScore) or text (level)
          const isNumeric = !isNaN(Number(skillOrLevel));
          
          return {
            externalId: hasExternalId ? fields[0] : undefined,
            name: hasExternalId ? fields[1] : fields[0],
            gender: hasExternalId ? fields[2] : (fields[1] || 'Male'),
            skillScore: isNumeric ? Number(skillOrLevel) : undefined,
            level: !isNumeric ? skillOrLevel : undefined
          };
        });
      } 
      // Handle URL import
      else {
        const externalUrl = validated.url;
      
      // Security: Validate URL is from allowed hosts only
      const allowedHosts = [
        'shuttleiq.ssundeep13.repl.co',
        'shuttleiq.ssundeep13.replit.app',
        'replit.com',
        'replit.app',
        'repl.co'
      ];
      
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(externalUrl);
      } catch (error) {
        return res.status(400).json({ 
          error: "Invalid URL format",
          details: "Please provide a valid HTTP/HTTPS URL"
        });
      }
      
      // Only allow HTTPS (or HTTP for repl.co domains)
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ 
          error: "Invalid URL protocol",
          details: "Only HTTP and HTTPS protocols are allowed"
        });
      }
      
      // Check if hostname is in allowed list
      const hostname = parsedUrl.hostname;
      const isAllowed = allowedHosts.some(allowed => 
        hostname === allowed || hostname.endsWith(`.${allowed}`)
      );
      
      if (!isAllowed) {
        return res.status(403).json({ 
          error: "URL not allowed",
          details: `Only URLs from approved ShuttleIQ instances are allowed: ${allowedHosts.join(', ')}`
        });
      }
      
      // Prevent access to non-standard ports (except 80, 443)
      if (parsedUrl.port && parsedUrl.port !== '80' && parsedUrl.port !== '443') {
        return res.status(400).json({ 
          error: "Invalid port",
          details: "Only standard HTTP/HTTPS ports are allowed"
        });
      }
      
      // Fetch players from external app with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      let response;
      try {
        response = await fetch(externalUrl, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'ShuttleIQ-Import/1.0'
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === 'AbortError') {
          return res.status(504).json({ 
            error: "Request timeout",
            details: "External API did not respond within 10 seconds"
          });
        }
        return res.status(502).json({ 
          error: "Failed to connect to external app",
          details: error instanceof Error ? error.message : "Network error"
        });
      } finally {
        clearTimeout(timeout);
      }
      
      if (!response.ok) {
        return res.status(502).json({ 
          error: "Failed to fetch players from external app",
          details: `External API returned status ${response.status}`
        });
      }

      const externalPlayers = await response.json();
      
      if (!Array.isArray(externalPlayers)) {
        return res.status(502).json({ 
          error: "Invalid response from external app",
          details: "Expected an array of players"
        });
      }

      playersToImport = externalPlayers;
      }

      // Shared import logic for both CSV and URL sources
      const { getSkillTier, estimateScoreFromLegacyLevel, MIN_SKILL_SCORE, MAX_SKILL_SCORE } = await import('@shared/utils/skillUtils');
      
      const importedPlayers = [];
      const skippedPlayers = [];
      
      for (const externalPlayer of playersToImport) {
        try {
          // Determine skill score and tier
          let skillScore: number;
          let level: string;
          
          if (externalPlayer.skillScore !== undefined) {
            // Skill score provided - validate and use it
            skillScore = Math.max(MIN_SKILL_SCORE, Math.min(MAX_SKILL_SCORE, externalPlayer.skillScore));
            level = getSkillTier(skillScore);
          } else if (externalPlayer.level) {
            // Legacy level text provided - estimate score and normalize tier
            skillScore = estimateScoreFromLegacyLevel(externalPlayer.level);
            level = getSkillTier(skillScore);
          } else {
            // No skill info - default to mid-Beginner (Fix 2: lower starting point)
            skillScore = 50;
            level = 'Beginner';
          }
          
          // Validate and create player
          const playerData = {
            name: externalPlayer.name,
            gender: externalPlayer.gender || 'Male',
            level,
            skillScore,
            gamesPlayed: externalPlayer.gamesPlayed || 0,
            wins: externalPlayer.wins || 0,
            status: 'waiting'
          };
          
          const validated = insertPlayerSchema.parse(playerData);
          
          const player = await storage.createPlayer(validated);
          
          // Only add to queue if there's a target session (explicit or active)
          if (targetSession) {
            await storage.addToQueue(targetSession.id, player.id);
          }
          
          importedPlayers.push(player);
        } catch (error) {
          skippedPlayers.push({
            name: externalPlayer.name,
            reason: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      res.json({
        success: true,
        added: importedPlayers.length,
        duplicates: skippedPlayers.length,
        players: importedPlayers,
        skippedDetails: skippedPlayers
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: error.errors 
        });
      }
      res.status(500).json({ 
        error: "Failed to import players",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Court routes
  app.get("/api/courts", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json([]); // Return empty array if no active session
        }
        sessionId = activeSession.id;
      }
      
      const courts = await storage.getCourtsWithPlayers(sessionId);
      res.json(courts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  app.get("/api/courts/:id", async (req, res) => {
    try {
      const court = await storage.getCourt(req.params.id);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const playerIds = await storage.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);
      
      res.json({ ...court, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch court" });
    }
  });

  app.post("/api/courts", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      // Deferred-fix sweep: honor a body sessionId (validated) so Add Court
      // works on upcoming/sandbox sessions the admin is viewing — the old
      // getActiveSession()-only resolution silently targeted the wrong
      // session (Gate-5d operability class). No sessionId → active session.
      const bodySessionId = typeof req.body.sessionId === 'string' ? req.body.sessionId : undefined;
      const targetSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!targetSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session. Please create a session first." });
      }
      if (targetSession.status === 'completed') {
        return res.status(400).json({ error: "This session has ended — courts can't be added." });
      }

      const courtData = {
        name: req.body.name,
        sessionId: targetSession.id,
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
      };
      const court = await storage.createCourt(courtData);
      res.status(201).json({ ...court, players: [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  app.patch("/api/courts/:id", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const court = await storage.updateCourt(req.params.id, req.body);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const playerIds = await storage.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);
      
      res.json({ ...court, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to update court" });
    }
  });

  app.delete("/api/courts/:id", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const court = await storage.getCourt(req.params.id);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status === 'occupied') {
        return res.status(400).json({ error: "Cannot delete occupied court" });
      }

      // Gate 1 (claim-leak fix): release every open suggestion row — auto AND
      // captain-pinned — BEFORE the court disappears. Without this, the dead
      // court's rows keep their player claims forever and silently shrink
      // every other court's pool (the stale-auto sweep only covers 'auto'
      // rows, and only on assignment).
      const released = await storage.releaseOpenSuggestionsForCourt(req.params.id);
      if (released > 0) {
        console.log(`[Court delete] released ${released} open suggestion row(s) for court ${req.params.id}`);
      }

      const deleted = await storage.deleteCourt(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Court not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete court" });
    }
  });

  // Queue routes
  app.get("/api/queue", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json([]); // Return empty array if no active session
        }
        sessionId = activeSession.id;
      }
      
      const queue = await storage.getQueue(sessionId);
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.put("/api/queue", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      // Gate 2: honor an explicit sessionId like POST/DELETE do — this verb used to
      // hardcode the active session, so reordering while viewing another session
      // silently rewrote the LIVE queue.
      const { playerIds, sessionId } = req.body;
      const session = sessionId
        ? await storage.getSession(sessionId)
        : await storage.getActiveSession();
      if (!session) {
        return res.status(400).json({ error: sessionId ? "Session not found" : "No active session" });
      }

      if (!Array.isArray(playerIds)) {
        return res.status(400).json({ error: "playerIds must be an array" });
      }

      // Get old queue and clone it to prevent mutation issues
      const oldQueue = [...await storage.getQueue(session.id)];

      await storage.setQueue(session.id, playerIds);

      // Clear rest states and sit-out flags for players removed from queue —
      // including the persisted row, so a restart can't resurrect a stale
      // sticky sit-out flag for a player who already left the queue.
      const removedPlayerIds = oldQueue.filter(id => !playerIds.includes(id));
      for (const playerId of removedPlayerIds) {
        clearPlayerRestState(session.id, playerId);
        clearSittingOutPlayer(session.id, playerId);
        await deletePersistedRestState(session.id, playerId);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update queue" });
    }
  });

  app.post("/api/queue/:playerId", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessionId
        ? await storage.getSession(sessionId)
        : await storage.getActiveSession();
      if (!session) {
        return res.status(400).json({ error: "No active session" });
      }

      await storage.addToQueue(session.id, req.params.playerId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add to queue" });
    }
  });

  app.delete("/api/queue/:playerId", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessionId
        ? await storage.getSession(sessionId)
        : await storage.getActiveSession();
      if (!session) {
        return res.status(400).json({ error: "No active session" });
      }

      await storage.removeFromQueue(session.id, req.params.playerId);

      // Clear rest state and sit-out flag when player is removed from queue,
      // including the persisted row (restart must not resurrect either).
      clearPlayerRestState(session.id, req.params.playerId);
      clearSittingOutPlayer(session.id, req.params.playerId);
      await deletePersistedRestState(session.id, req.params.playerId);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from queue" });
    }
  });

  // Sit-out toggle routes
  app.post("/api/sessions/:sessionId/queue/players/:playerId/sit-out", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId, playerId } = req.params;
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const queue = await storage.getQueue(sessionId);
      if (!queue.includes(playerId)) {
        return res.status(404).json({ error: "Player not in queue" });
      }
      // Hydrate first so a post-restart toggle flips the player's REAL
      // persisted state rather than an empty set; persist immediately so the
      // pure-toggle flag survives a restart even before the next game end.
      await ensureRestStatesHydrated(sessionId);
      const nowSittingOut = toggleSittingOut(sessionId, playerId);
      await persistSittingOutFlag(sessionId, playerId, nowSittingOut);
      res.json({ playerId, sittingOut: nowSittingOut });
    } catch (error) {
      console.error("Sit-out toggle error:", error);
      res.status(500).json({ error: "Failed to toggle sit-out" });
    }
  });

  // ── Court Captain: pending match suggestions ──────────────────────────────
  // List pending suggestions for a session, with court name and lineup names
  // pre-joined. Polled every ~10s by the admin Home page.
  app.get("/api/sessions/:sessionId/pending-suggestions", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      const suggestions = await storage.listSessionPendingSuggestionsWithDetails(sessionId);
      // Hot-path UI gate: fairness receipts on lineup members (in-memory
      // rest-state counters the planner already maintains).
      await ensureRestStatesHydrated(sessionId);
      const enriched = suggestions.map((s: any) => ({
        ...s,
        players: (s.players ?? []).map((p: any) => {
          const rs = getPlayerRestState(sessionId, p.playerId);
          return { ...p, gamesWaited: rs.gamesWaited || 0, gamesThisSession: rs.gamesThisSession || 0 };
        }),
      }));
      res.json(enriched);
    } catch (error) {
      console.error('Pending suggestions list error:', error);
      res.status(500).json({ error: "Failed to fetch pending suggestions" });
    }
  });

  // Approve-now: admin-triggered approval that ALSO places the lineup.
  // Phase 1 (stranded-lineup fix): approve used to stop at the status flip +
  // notifications — the physical start (court occupied, roster written,
  // statuses flipped, queue removal) lived ONLY in the player-phone
  // start-game path, so captain-run sessions could approve forever and
  // nothing ever landed. The captain's Approve now runs the same hardened
  // CAS chain the player tap uses (startApprovedSuggestion). A previously
  // approved-but-never-started row is recovered by tapping Approve again:
  // the status flip is skipped and we go straight to placement. The
  // auto-approve SWEEP is deliberately unchanged (owner scope ruling) —
  // player-driven sessions keep their notify-then-player-starts flow.
  app.post("/api/sessions/:sessionId/suggestions/:suggestionId/approve", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId, suggestionId } = req.params;
      const suggestion = await storage.getMatchSuggestion(suggestionId);
      if (!suggestion || suggestion.sessionId !== sessionId) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      if (suggestion.status !== 'pending' && suggestion.status !== 'approved') {
        return res.status(409).json({ error: `Suggestion is already ${suggestion.status} and cannot be approved.` });
      }
      const court = await storage.getCourt(suggestion.courtId);
      if (court?.status === 'occupied') {
        return res.status(409).json({ error: "That court is already occupied — finish the current game first." });
      }

      const adminId = req.user?.userId ?? 'admin';
      let didApprove = false;
      if (suggestion.status === 'pending') {
        const updated = await storage.transitionPendingMatchSuggestion(suggestionId, 'approved', adminId);
        if (!updated) {
          // Lost the approve race with the sweep or another admin call.
          // If the row is now approved, fall through to placement anyway;
          // any other state resolves idempotently.
          const current = await storage.getMatchSuggestion(suggestionId);
          if (!current || current.status !== 'approved') {
            return res.json(current ?? suggestion);
          }
        } else {
          didApprove = true;
        }
        console.log(`[Court Captain] suggestion ${suggestionId} approved by ${adminId}`);
      }

      // PLACEMENT — the step that was always missing from the admin flow.
      const startResult = await storage.startApprovedSuggestion(suggestionId);
      if (startResult.result === 'not-startable' || startResult.result === 'not-found') {
        return res.status(409).json({ error: "This lineup was just changed by another action — refresh and retry" });
      }
      console.log(`[Court Captain] suggestion ${suggestionId} placed on court ${suggestion.courtId} (${startResult.result})`);

      // Gate 5c parity: this court just became occupied — pre-build its Up Next.
      setImmediate(() => {
        import('./auto-matchmaking').then(m =>
          m.tryQueuedBuildForSession(sessionId).catch(err =>
            console.error('[queued-build] post-approve unhandled:', err),
          ),
        );
      });

      // Notify the 4 players (best-effort, mirrors the sweep). Only on the
      // first approval — a recovery re-tap must not re-notify.
      try {
        if (didApprove && court) {
          // Mirror the sweep: two batched IN-queries instead of 4 + 4
          // round-trips for the player + marketplace-user lookups.
          const playerIds = suggestion.players.map(p => p.playerId);
          const [playerList, mUserList] = await Promise.all([
            storage.getPlayersByIds(playerIds),
            storage.getMarketplaceUsersByLinkedPlayerIds(playerIds),
          ]);
          const playersById = new Map(playerList.map(pl => [pl.id, pl.name]));
          const mUserByPlayerId = new Map(
            mUserList
              .filter(u => u.linkedPlayerId)
              .map(u => [u.linkedPlayerId as string, u]),
          );

          for (const p of suggestion.players) {
            const partnerRow = suggestion.players.find(x => x.team === p.team && x.playerId !== p.playerId);
            const opponents = suggestion.players.filter(x => x.team !== p.team);
            const partnerName = partnerRow ? playersById.get(partnerRow.playerId) ?? 'your partner' : 'your partner';
            const opponentNames = opponents.map(x => playersById.get(x.playerId)).filter(Boolean) as string[];
            const opponentLabel = opponentNames.length === 2 ? `${opponentNames[0]} + ${opponentNames[1]}` : opponentNames.join(' + ') || 'opponents';
            const mUser = mUserByPlayerId.get(p.playerId);
            if (!mUser) continue;
            await storage.createMarketplaceNotification({
              userId: mUser.id,
              type: 'court_ready',
              title: 'Your court is ready',
              message: `Court ${court.name} — ${partnerName} vs ${opponentLabel}. Head to your court now.`,
            }).catch(err => console.error('[Court Captain] notify player failed:', err));
          }
        }
      } catch (notifyErr) {
        console.error('[Court Captain] notify batch failed:', notifyErr);
      }

      // Return the post-placement row (status 'playing') so the panel
      // reflects reality immediately.
      res.json(await storage.getMatchSuggestion(suggestionId));
    } catch (error) {
      console.error('Approve suggestion error:', error);
      res.status(500).json({ error: "Failed to approve suggestion" });
    }
  });

  // Dismiss: Court Captain rejects a pending suggestion before auto-approve.
  // Idempotent — already-dismissed returns 200.
  app.post("/api/sessions/:sessionId/suggestions/:suggestionId/dismiss", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId, suggestionId } = req.params;
      const suggestion = await storage.getMatchSuggestion(suggestionId);
      if (!suggestion || suggestion.sessionId !== sessionId) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      if (suggestion.status === 'dismissed') {
        return res.json(suggestion);
      }
      // Allow dismissing 'pending' (the original Court Captain action) and
      // 'queued' (the new "Up next" rows). Approved/playing/completed are
      // not dismissable through this surface.
      if (suggestion.status !== 'pending' && suggestion.status !== 'queued') {
        return res.status(409).json({ error: `Suggestion is already ${suggestion.status} and cannot be dismissed.` });
      }
      const adminId = req.user?.userId ?? 'admin';
      let updated;
      if (suggestion.status === 'queued') {
        // Queued rows have a dedicated CAS dismiss helper that won't
        // accidentally overwrite a row that just flipped to 'pending'
        // via the game-end transition.
        updated = await storage.dismissQueuedSuggestion(suggestionId);
      } else {
        // Pass null for approvedBy on dismiss — the field's name reflects
        // approval semantics; dismissal audit lives in the server log.
        updated = await storage.transitionPendingMatchSuggestion(suggestionId, 'dismissed', null);
      }
      if (!updated) {
        const current = await storage.getMatchSuggestion(suggestionId);
        return res.json(current);
      }
      console.log(`[Court Captain] suggestion ${suggestionId} dismissed by ${adminId} (was ${suggestion.status})`);
      // After dismissing a queued row, fire the auto-matchmaker so the
      // court can either get a fresh queued lineup from the now-larger
      // waiting pool or remain bare until game-end.
      if (suggestion.status === 'queued') {
        setImmediate(() => {
          import('./auto-matchmaking').then(m =>
            m.tryAutoMatchmaking(sessionId).catch(err =>
              console.error('[auto-matchmaking] post-queued-dismiss unhandled:', err),
            ),
          );
        });
      }
      res.json(updated);
    } catch (error) {
      console.error('Dismiss suggestion error:', error);
      res.status(500).json({ error: "Failed to dismiss suggestion" });
    }
  });

  // Court bands Gate 2 — set a court's suggestion band (mid-session allowed).
  // The band constrains suggestion generation and the auto Up Next
  // orchestrator ONLY; captain assigns/swaps/pins are never blocked by it.
  app.patch("/api/courts/:courtId/skill-band", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { skillBand, sessionId: bodySessionId } = req.body;
      if (!COURT_SKILL_BANDS.includes(skillBand)) {
        return res.status(400).json({ error: `skillBand must be one of: ${COURT_SKILL_BANDS.join(', ')}` });
      }
      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const gameSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!gameSession || court.sessionId !== gameSession.id) {
        return res.status(400).json({ error: "Court does not belong to this session" });
      }
      const updated = await storage.updateCourt(court.id, { skillBand });
      console.log(`[Court Captain] court ${court.id} skill band set to ${skillBand} by ${req.user?.userId ?? 'admin'}`);
      res.json(updated);
    } catch (error) {
      console.error('Set skill band error:', error);
      res.status(500).json({ error: "Failed to set skill band" });
    }
  });

  // Court bands Gate 2 — per-court suggestion generation. AI-first over the
  // court's BAND-FILTERED pool (the AI is never asked to self-filter), with
  // the local ranked list (same pool) as silent fallback AND as the
  // alternates the Regenerate button cycles; the AI's pick is rank #1,
  // deduped against identical local options. Read-only: confirming the shown
  // lineup goes through the existing pin endpoint (queued row → game-end
  // promotion → 6b confirm/placement), no parallel mechanism.
  app.get("/api/courts/:courtId/suggestions", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const sessionId = court.sessionId;
      const band = court.skillBand ?? 'all_levels';
      const relax = req.query.relax_band === 'true';
      const aiMode = req.query.aiMode !== 'false';
      // Gate 6 (local-first async AI): the base request NEVER waits for the
      // AI — it returns the local ladder immediately with aiPending: true,
      // and the client follows up with aiOnly=true, which runs the existing
      // AI block (same 10s timeout, same validation, same local fallback)
      // against the freshest pool. Stateless by design: no server cache to
      // go stale under the orchestrator's constant churn.
      const aiOnly = req.query.aiOnly === 'true';
      // Deferred-fix sweep: response-size cap only (ranking unchanged). The
      // fill-all path asks for the FULL ladder: at exactly 8 players the
      // one disjoint complement of another court's pick can rank anywhere
      // in the C(8,4)=70 list, so only the whole window (C(10,4)=210 max)
      // guarantees cross-court first-fit never starves.
      const maxOptions = Math.min(250, Math.max(1, parseInt(String(req.query.maxOptions ?? ''), 10) || 6));

      await ensureRestStatesHydrated(sessionId);
      const { getPlayersOnOpenSuggestionsForOtherCourts } = await import('./auto-matchmaking');
      const { chooseSuggestionPool } = await import('./suggestionPool');
      const queue = await storage.getQueue(sessionId);
      const sittingOut = new Set(getSittingOutPlayers(sessionId));
      // Gate 4 (rotation planner) — court-scoped claims: only suggestions
      // belonging to OTHER courts block a player here. This court's own rows
      // (its running game's 'playing' row, the queued row being replaced)
      // never block its own next lineup — same-court repeats are legal.
      const ownCourtPlayerIds = await storage.getCourtPlayers(court.id);
      const claimCheckIds = Array.from(new Set([...queue, ...ownCourtPlayerIds]));
      // Gate 3 (cross-court dedup): the client seeds `exclude` with players
      // already SHOWN on earlier courts' ephemeral suggestions — those never
      // touch the DB, so only the requester can see them.
      const excludeIds = new Set(
        String(req.query.exclude ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 64));
      // Two claim tiers. STRICT counts every other court's open row — the
      // auto-locked exemption ("captain outranks auto-claims", fix a) is
      // deliberately dropped from this PLANNING view: it's why two panels
      // could both offer players a third court had locked in. The exemption
      // stays where it belongs — pin/assign conflict validation, so the
      // captain can still ACT on auto-held players (capture-release evicts).
      // LEGACY is the pre-Gate-3 pool, used only by the small-pool fallback
      // inside chooseSuggestionPool: with under 4 strict-eligible players a
      // duplicate suggestion beats a false "no players" state.
      const [strictClaimed, legacyClaimed] = await Promise.all([
        getPlayersOnOpenSuggestionsForOtherCourts(sessionId, court.id, claimCheckIds, {}),
        getPlayersOnOpenSuggestionsForOtherCourts(sessionId, court.id, claimCheckIds, { treatAutoQueuedAsFree: true }),
      ]);

      const allPlayers = await storage.getAllPlayers();
      const byId = new Map(allPlayers.map(p => [p.id, p]));

      const { waiterIds, currentIds, sharedPool, strictEligibleCount } = chooseSuggestionPool({
        queue,
        sittingOut,
        ownCourtPlayerIds,
        strictClaimed,
        legacyClaimed,
        excludeIds,
        passesBand: (id: string) => playerPassesBand(band, byId.get(id)?.level ?? ''),
      });
      const currentSet = new Set(currentIds);
      const basePool = [...waiterIds, ...currentIds];
      const inBand = basePool.filter(id => playerPassesBand(band, byId.get(id)?.level ?? ''));

      if (inBand.length < 4 && !relax) {
        return res.json({ band, insufficientEligible: true, eligibleCount: inBand.length, ...(sharedPool ? { sharedPool: true } : {}) });
      }

      // relax_band: nearest-tier expansion — closest out-of-band players
      // (by confirmed-tier distance from the band boundary) top up the pool
      // to two lineups' worth; each is flagged outside_band in the response.
      let candidateIds = inBand;
      const outsideBand = new Set<string>();
      if (inBand.length < 4 && relax) {
        const outsiders = basePool
          .filter(id => !inBand.includes(id))
          .sort((a, b) =>
            bandDistance(band, byId.get(a)?.level ?? '') - bandDistance(band, byId.get(b)?.level ?? ''));
        for (const id of outsiders.slice(0, Math.max(0, 8 - inBand.length))) {
          outsideBand.add(id);
        }
        candidateIds = [...inBand, ...Array.from(outsideBand)];
        if (candidateIds.length < 4) {
          return res.json({ band, insufficientEligible: true, eligibleCount: candidateIds.length, relaxed: true, ...(sharedPool ? { sharedPool: true } : {}) });
        }
      }

      const history = await storage.getSessionGameParticipants(sessionId);
      buildPartnerHistoryFromHistory(sessionId, history);

      // Gate 4 — rotation planner replaces the priority-weighted generator.
      // WHO plays: waiters first (gamesWaited desc, queue position), then
      // this court's most-rested current players (fewest games this session,
      // oldest last game end — both from the participants join, restart-safe).
      // HOW they're arranged: findBalancedTeams, unchanged.
      const playedBy = deriveSessionPlayFromHistory(history);
      // Fairness receipts (hot-path UI gate): per eligible player, the
      // counters the planner already computes — the strip's microcopy
      // ("waited N games" / "N games") reads straight from this map.
      const receipts: Record<string, { gamesWaited: number; gamesThisSession: number }> = {};
      for (const id of basePool) {
        const rs = getPlayerRestState(sessionId, id);
        receipts[id] = {
          gamesWaited: rs.gamesWaited || 0,
          gamesThisSession: playedBy.get(id)?.gamesThisSession ?? rs.gamesThisSession ?? 0,
        };
      }
      const toRotationCandidate = (id: string): RotationCandidate | null => {
        const player = byId.get(id);
        if (!player) return null;
        return currentSet.has(id)
          ? {
              player, kind: 'current',
              gamesWaited: 0, queueIndex: Number.MAX_SAFE_INTEGER,
              gamesThisSession: playedBy.get(id)?.gamesThisSession ?? 0,
              lastGameEndedAt: playedBy.get(id)?.lastGameEndedAt ?? null,
            }
          : {
              player, kind: 'waiter',
              gamesWaited: getPlayerRestState(sessionId, id).gamesWaited,
              queueIndex: queue.indexOf(id),
              gamesThisSession: 0, lastGameEndedAt: null,
            };
      };
      const rotationCandidates = candidateIds
        .map(toRotationCandidate)
        .filter((c): c is RotationCandidate => c !== null);
      const ordered = orderRotationCandidates(
        rotationCandidates.filter(c => c.kind === 'waiter'),
        rotationCandidates.filter(c => c.kind === 'current'),
      );
      const seatings = buildRotationSeatings(ordered);

      type Option = {
        team1: any[]; team2: any[]; skillGap: number; team1Avg: number; team2Avg: number;
        uneven: boolean; fromAI?: boolean; reason?: string; splitPenalty?: number;
      };
      const playerOut = (p: any) => ({
        id: p.id,
        name: p.name,
        level: p.level,
        skillScore: p.skillScore ?? 90,
        outsideBand: outsideBand.has(p.id),
        inGame: currentSet.has(p.id),
      });
      const toOption = (team1: any[], team2: any[]): Option => {
        const avg = (t: any[]) => t.reduce((s, p) => s + (p.skillScore ?? 90), 0) / (t.length || 1);
        const a1 = avg(team1), a2 = avg(team2);
        const gap = Math.round(Math.abs(a1 - a2) * 10) / 10;
        return {
          team1: team1.map(playerOut),
          team2: team2.map(playerOut),
          skillGap: gap,
          team1Avg: Math.round(a1),
          team2Avg: Math.round(a2),
          uneven: gap > FAIR_GAME_GAP,
        };
      };
      // Each rotation-legal seating arranged for balance (3 permutations,
      // cross-tier hard constraint, gap → splitPenalty → variance) —
      // "balance preserved" decides the arrangement, never the seats.
      // Identical-repeat guard (fix b): the court's CURRENT pairing is never
      // the picked arrangement while a remix exists — "play the exact same
      // game again" is trust-destroying when players are waiting.
      const currentTeams = await storage.getCourtPlayersWithTeams(court.id);
      const currentPairing = currentTeams.length === 4
        ? pairingKey(
            currentTeams.filter(cp => cp.team === 1).map(cp => cp.playerId),
            currentTeams.filter(cp => cp.team === 2).map(cp => cp.playerId),
          )
        : null;
      // Balance-first ranking (2026-07 ruling): every rotation-legal seating
      // in the window is arranged, then the OPTIONS are ranked by skill gap
      // — rotation decides who is eligible, balance decides the best game.
      // Stable sort: equal gaps keep rotation order. Cap AFTER ranking, so
      // the cap can never hide a better-balanced combination.
      const arranged = seatings
        .map(seat => pickArrangement(findBalancedTeams(seat.map(c => c.player), 3, true, sessionId), currentPairing))
        .filter((c): c is TeamCombination => !!c);
      // Gate 5: splitPenalty rides into the option so rankByBalance can break
      // equal-gap ties on repeats, and the local receipt says why the pick is
      // fresh ("no repeat partners") or honest about an unavoidable repeat.
      let options: Option[] = rankByBalance(arranged)
        .slice(0, maxOptions)
        .map(c => {
          const receipt = repeatReceipt(
            c.team1.map((p: any) => p.id), c.team2.map((p: any) => p.id), sessionId);
          return {
            ...toOption(c.team1, c.team2),
            splitPenalty: c.splitPenalty,
            ...(receipt ? { reason: receipt } : {}),
          };
        });
      let fromAI = false;

      // AI five-option set (2026-07 gate): ONE call returns the full ladder.
      // Only when a full lineup of WAITERS exists — the AI pool is the
      // waiters-only rotation window, so every option satisfies "waiters
      // first" by construction, and band filtering already shaped the pool.
      // With fewer than 4 waiters the seating is rule-determined and the AI
      // is skipped. 10s hard timeout. Every option is validated (pool
      // membership, 4 distinct players, distinct pairings, identical-repeat
      // guard); invalid ones are dropped and backfilled from the local
      // ladder. Total failure/timeout → the local ladder stands untouched.
      const orderedWaiters = ordered.filter(c => c.kind === 'waiter');
      // Gate 6: same eligibility the AI block always had — but the block now
      // runs ONLY on the aiOnly follow-up; the base request flags aiPending
      // instead of blocking on the model call.
      const aiEligible = aiMode && !!process.env.ANTHROPIC_API_KEY && orderedWaiters.length >= 4;
      if (aiEligible && aiOnly) {
        try {
          const candidates = orderedWaiters.slice(0, 10).map(c => c.player);
          const recentPairings = deriveRecentPairings(history);
          const nameOfId = (id: string) => byId.get(id)?.name ?? '';
          const profiles = candidates.map(p => {
            const rs = getPlayerRestState(sessionId, p.id);
            const rp = recentPairings.get(p.id);
            return {
              name: p.name,
              score: p.skillScore || 90,
              tier: p.level || 'lower_intermediate',
              gender: p.gender || 'male',
              gamesThisSession: rs.gamesThisSession || 0,
              gamesWaited: rs.gamesWaited || 0,
              recentPartners: (rp?.partnerIds ?? []).map(nameOfId).filter(Boolean),
              recentOpponents: (rp?.opponentIds ?? []).map(nameOfId).filter(Boolean),
            };
          });
          const aiStart = Date.now();
          const parsed = await requestClaudeLineupOptions(profiles, { timeoutMs: 10_000 });
          const aiMs = Date.now() - aiStart;

          const candidateByNameLower = new Map(candidates.map(p => [p.name.toLowerCase(), p]));
          const seenPairings = new Set<string>();
          const aiOptions: Option[] = [];
          let dropped = 0;
          for (const raw of (parsed.options ?? []).slice(0, 5)) {
            try {
              const resolve = (team: Array<{ name: string }>) => (team ?? []).map(r => {
                const found = candidateByNameLower.get((r?.name ?? '').toLowerCase());
                // The AI must never smuggle in a player outside the pool we gave it.
                if (!found) throw new Error(`outside pool: "${r?.name}"`);
                return found;
              });
              const t1 = resolve(raw.team1);
              const t2 = resolve(raw.team2);
              if (t1.length !== 2 || t2.length !== 2 ||
                  new Set([...t1, ...t2].map(p => p.id)).size !== 4) {
                throw new Error('not 4 distinct players');
              }
              const key = pairingKey(t1.map(p => p.id), t2.map(p => p.id));
              if (seenPairings.has(key)) throw new Error('duplicate pairing');
              if (currentPairing && key === currentPairing) throw new Error('identical to current game');
              seenPairings.add(key);
              aiOptions.push({
                ...toOption(t1, t2),
                fromAI: true,
                ...(raw.reason ? { reason: String(raw.reason).slice(0, 80) } : {}),
              });
            } catch (optErr) {
              dropped++;
              console.log(`[court-suggestions] court=${court.id} AI option dropped: ${optErr instanceof Error ? optErr.message : optErr}`);
            }
          }
          if (aiOptions.length > 0) {
            const keyOfOption = (o: Option) =>
              pairingKey(o.team1.map((p: any) => p.id), o.team2.map((p: any) => p.id));
            const backfill = options
              .filter(o => !seenPairings.has(keyOfOption(o)))
              .slice(0, Math.max(0, 5 - aiOptions.length))
              .map(o => ({ ...o, fromAI: false }));
            // Display order is gap-ascending regardless of the AI's own
            // ranking — fairest game first (stable: AI order breaks ties).
            options = rankByBalance([...aiOptions, ...backfill]).slice(0, 5);
            fromAI = true;
            console.log(`[court-suggestions] court=${court.id} AI set: ${aiOptions.length}/5 valid in ${aiMs}ms (${dropped} dropped, ${backfill.length} local backfill, model=${aiMatchmakingModel()})`);
          } else {
            console.log(`[court-suggestions] court=${court.id} AI set: 0 valid options in ${aiMs}ms — full local fallback`);
          }
        } catch (aiErr) {
          // Silent local fallback — the ranked list above already stands.
          console.log(`[court-suggestions] court=${court.id} AI fallback: ${aiErr instanceof Error ? aiErr.message : aiErr}`);
        }
      }

      res.json({
        band,
        relaxed: relax && outsideBand.size > 0,
        fromAI,
        // Gate 6: the base response says an AI pass is worth a follow-up;
        // the aiOnly response never sets it (it IS the follow-up).
        ...(aiEligible && !aiOnly ? { aiPending: true } : {}),
        // Gate 3: the small-pool fallback re-admitted players other courts'
        // suggestions already hold — the strip shows a "Shared pool" chip.
        // Gate 4: strictEligibleCount rides along so the strip can tell FULL
        // recycle (0 → honest empty-pool state) from partial overlap (chip).
        ...(sharedPool ? { sharedPool: true, strictEligibleCount } : {}),
        eligibleCount: inBand.length,
        // Gate 4: pool composition for the strip's copy and the smokes.
        waiterCount: rotationCandidates.filter(c => c.kind === 'waiter').length,
        currentCount: rotationCandidates.filter(c => c.kind === 'current').length,
        // Fair-game mark: the best available option is still uneven — the
        // UI shows "best available — teams uneven" instead of presenting
        // it as a good match.
        uneven: (options[0]?.skillGap ?? 0) > FAIR_GAME_GAP,
        fairGapThreshold: FAIR_GAME_GAP,
        receipts,
        options,
      });
    } catch (error) {
      console.error('Court suggestions error:', error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Gate 5 — PIN: install a captain-authored lineup as an occupied court's
  // next game ('queued' row, source='captain'). Replaces any existing queued
  // row for the court (auto or captain — the newest captain action wins).
  // Queued players stay in the queue until promotion, exactly like
  // orchestrator-built rows. Unpin = the dismiss route above; promotion =
  // the same tryFlipQueuedToPendingForCourt path both origins share.
  app.post("/api/courts/:courtId/queued-suggestion", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId: bodySessionId, teamAssignments } = req.body;
      if (!Array.isArray(teamAssignments) || teamAssignments.length !== 4) {
        return res.status(400).json({ error: "teamAssignments must list exactly 4 players" });
      }
      const playerIds = teamAssignments.map((a: { playerId: string }) => a.playerId);
      if (new Set(playerIds).size !== 4) {
        return res.status(400).json({ error: "Players must be unique" });
      }
      const team1Count = teamAssignments.filter((a: { team: number }) => a.team === 1).length;
      const team2Count = teamAssignments.filter((a: { team: number }) => a.team === 2).length;
      if (team1Count !== 2 || team2Count !== 2) {
        return res.status(400).json({ error: "Each team must have exactly 2 players" });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Up-next lineups are for occupied courts — assign a free court directly instead" });
      }

      const gameSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!gameSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session" });
      }
      if (court.sessionId !== gameSession.id) {
        return res.status(400).json({ error: "Court does not belong to this session" });
      }

      // Eligibility: in queue, not sitting out, not on another open lineup.
      // Gate 4 court-scoped exemption: this court's OWN current players are
      // pinnable for its next game (same-court repeats) — they count as
      // seated-eligible, and none of this court's own rows (playing row,
      // queued row being replaced) block them. Cross-court claims still 409.
      const { findLineupConflicts, getPlayersOnOpenSuggestionsForOtherCourts, releaseAutoQueuedClaims } = await import('./auto-matchmaking');
      await ensureRestStatesHydrated(gameSession.id);
      const existingQueued = await storage.getQueuedSuggestionForCourt(court.id);
      const ownCourtPlayers = await storage.getCourtPlayers(court.id);
      const conflicts = findLineupConflicts(playerIds, {
        queueSet: new Set([...(await storage.getQueue(gameSession.id)), ...ownCourtPlayers]),
        sittingOutSet: new Set(getSittingOutPlayers(gameSession.id)),
        // Captain outranks auto-claims (fix a): unconfirmed orchestrator
        // auto-rows don't block the pin; captured ones are released below.
        onOtherOpenSet: await getPlayersOnOpenSuggestionsForOtherCourts(
          gameSession.id, court.id, playerIds, { treatAutoQueuedAsFree: true }),
      });
      if (conflicts.length > 0) {
        // Conflict copy gate: carry player NAMES so the client never has to
        // show ids — "X was just placed on another court".
        const named = await Promise.all(conflicts.map(async c => ({
          ...c,
          name: (await storage.getPlayer(c.playerId))?.name ?? null,
        })));
        return res.status(409).json({
          error: "Some players were just placed elsewhere",
          conflicts: named,
        });
      }

      const result = await storage.pinQueuedSuggestionForCourt({
        sessionId: gameSession.id,
        courtId: court.id,
        players: teamAssignments,
      });
      if (result.result === 'conflict') {
        return res.status(409).json({ error: "Another lineup was just pinned to this court — refresh and retry" });
      }
      console.log(`[Court Captain] lineup pinned to court ${court.id} by ${req.user?.userId ?? 'admin'} (replaced=${existingQueued ? existingQueued.id : 'none'})`);
      // Capture-release (fix a): evict auto-rows that were holding any of
      // the pinned players, then let the orchestrator replan those courts.
      const releasedCount = await releaseAutoQueuedClaims(gameSession.id, court.id, playerIds);
      if (releasedCount > 0) {
        setImmediate(() => {
          import('./auto-matchmaking').then(m =>
            m.tryAutoMatchmaking(gameSession.id).catch(err =>
              console.error('[auto-matchmaking] post-capture replan unhandled:', err),
            ),
          );
        });
      }
      res.status(201).json(result.suggestion);
    } catch (error) {
      console.error('Pin queued suggestion error:', error);
      res.status(500).json({ error: "Failed to pin lineup" });
    }
  });

  // Gate 5c — BUILD NOW: run the queued-only orchestrator pass on demand.
  // Backs the Up Next strip's "Build now" action for the rare cases the
  // proactive triggers missed (generator declined with pool ≥ 4, restart,
  // race). Awaited (not fire-and-forget) so the client's refetch right
  // after this response observes the new row.
  // Gate 5d: honest outcomes — a pass that builds nothing says why, and a
  // non-operable session is a 409, never a silent success.
  app.post("/api/sessions/:sessionId/queued-lineups/build", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const { tryQueuedBuildForSession } = await import('./auto-matchmaking');
      const result = await tryQueuedBuildForSession(sessionId);
      if (result.outcome === 'not-operable') {
        return res.status(409).json({ error: "This session is not running — lineups can only be built for the active session or a sandbox session" });
      }
      if (result.outcome === 'busy') {
        return res.json({ built: 0, reason: "Another matchmaking pass is running — try again in a moment" });
      }
      res.json({ built: result.created, ...(result.reason ? { reason: result.reason } : {}) });
    } catch (error) {
      console.error('Queued build error:', error);
      res.status(500).json({ error: "Failed to build lineups" });
    }
  });

  // Gate 5 — EDIT: swap one player on a 'queued' lineup before it goes live.
  // The storage CAS gates on status='queued' and flips source to 'captain'
  // (editing an auto lineup makes it captain-owned).
  app.patch("/api/sessions/:sessionId/suggestions/:suggestionId/players", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId, suggestionId } = req.params;
      const { outPlayerId, inPlayerId } = req.body;
      if (typeof outPlayerId !== 'string' || typeof inPlayerId !== 'string' || !outPlayerId || !inPlayerId) {
        return res.status(400).json({ error: "outPlayerId and inPlayerId are required" });
      }
      if (outPlayerId === inPlayerId) {
        return res.status(400).json({ error: "Pick a different player to swap in" });
      }

      const suggestion = await storage.getMatchSuggestion(suggestionId);
      if (!suggestion || suggestion.sessionId !== sessionId) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      if (suggestion.status !== 'queued') {
        return res.status(409).json({ error: `Only up-next lineups can be edited — this one is ${suggestion.status}.` });
      }
      if (!suggestion.players.some(p => p.playerId === outPlayerId)) {
        return res.status(400).json({ error: "That player is not on this lineup" });
      }
      if (suggestion.players.some(p => p.playerId === inPlayerId)) {
        return res.status(400).json({ error: "That player is already on this lineup" });
      }

      // Gate 4 court-scoped exemption (same as pin): the lineup's court may
      // swap in its own current players; cross-court claims still 409.
      // Fix a: unconfirmed auto-rows don't block the swap-in either.
      const { findLineupConflicts, getPlayersOnOpenSuggestionsForOtherCourts, releaseAutoQueuedClaims } = await import('./auto-matchmaking');
      await ensureRestStatesHydrated(sessionId);
      const ownCourtPlayers = await storage.getCourtPlayers(suggestion.courtId);
      const conflicts = findLineupConflicts([inPlayerId], {
        queueSet: new Set([...(await storage.getQueue(sessionId)), ...ownCourtPlayers]),
        sittingOutSet: new Set(getSittingOutPlayers(sessionId)),
        onOtherOpenSet: await getPlayersOnOpenSuggestionsForOtherCourts(
          sessionId, suggestion.courtId, [inPlayerId], { treatAutoQueuedAsFree: true }),
      });
      if (conflicts.length > 0) {
        const named = await Promise.all(conflicts.map(async c => ({
          ...c,
          name: (await storage.getPlayer(c.playerId))?.name ?? null,
        })));
        return res.status(409).json({ error: "That player was just placed elsewhere", conflicts: named });
      }

      const result = await storage.swapQueuedSuggestionPlayer({ suggestionId, outPlayerId, inPlayerId });
      if (result.result === 'not-queued') {
        return res.status(409).json({ error: "This lineup was just promoted or removed — refresh and retry" });
      }
      if (result.result === 'player-not-on-lineup') {
        return res.status(400).json({ error: "That player is not on this lineup" });
      }
      console.log(`[Court Captain] queued lineup ${suggestionId} edited by ${req.user?.userId ?? 'admin'}: ${outPlayerId} → ${inPlayerId}`);
      // Capture-release (fix a): if the swapped-in player sat on another
      // court's auto-row, evict it and let the orchestrator replan.
      const releasedCount = await releaseAutoQueuedClaims(sessionId, suggestion.courtId, [inPlayerId]);
      if (releasedCount > 0) {
        setImmediate(() => {
          import('./auto-matchmaking').then(m =>
            m.tryAutoMatchmaking(sessionId).catch(err =>
              console.error('[auto-matchmaking] post-swap replan unhandled:', err),
            ),
          );
        });
      }
      res.json(await storage.getMatchSuggestion(suggestionId));
    } catch (error) {
      console.error('Edit queued suggestion error:', error);
      res.status(500).json({ error: "Failed to edit lineup" });
    }
  });

  app.get("/api/sessions/:sessionId/queue/sitting-out", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      // Hydrate so the UI shows the persisted sit-out flags after a restart
      await ensureRestStatesHydrated(sessionId);
      res.json({ sittingOut: getSittingOutPlayers(sessionId) });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sitting-out players" });
    }
  });

  // Matchmaking routes
  app.get("/api/matchmaking/optimal-teams", async (req, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      // Get queue and all players
      const queue = await storage.getQueue(activeSession.id);
      const allPlayers = await storage.getAllPlayers();

      if (queue.length < 4) {
        return res.status(400).json({ 
          error: "Need at least 4 players in queue",
          availablePlayers: queue.length
        });
      }

      // Gate 3: rest states are live in-memory state (hydrated from DB only
      // after a restart) — never rebuilt from history, which can't see
      // voluntary sit-outs. Partner history replay stays: it's idempotent.
      await ensureRestStatesHydrated(activeSession.id);
      const gameParticipants = await storage.getSessionGameParticipants(activeSession.id);
      buildPartnerHistoryFromHistory(activeSession.id, gameParticipants);

      const groupByTier = req.query.groupByTier !== 'false';

      // Generate multiple matchup options with different player sets
      const { allCombinations, restWarnings } = generateAllMatchupOptions(
        activeSession.id,
        queue,
        allPlayers,
        15,
        groupByTier
      );

      if (allCombinations.length === 0) {
        return res.status(400).json({ 
          error: "Not enough eligible players available (need at least 4 players in queue)",
        });
      }

      res.json({
        combinations: allCombinations,
        restWarnings
      });
    } catch (error) {
      console.error("Matchmaking error:", error);
      res.status(500).json({ error: "Failed to generate optimal teams" });
    }
  });

  // ─── Claude AI prompt builder (extracted to ./claude-matchmaking.ts) ────────
  // The original inline prompt body now lives in claude-matchmaking.ts so the
  // player-driven auto-matchmaking flow can reuse it verbatim.

  // Get matchmaking suggestions for display (top 3-5 options)
  app.get("/api/matchmaking/suggestions", requireAuth, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      
      // Get the session - either specific session or active session
      let session;
      if (sessionId) {
        session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
      } else {
        session = await storage.getActiveSession();
        if (!session) {
          return res.status(404).json({ error: "No active session" });
        }
      }

      // Get queue and all players
      const queue = await storage.getQueue(session.id);
      const allPlayers = await storage.getAllPlayers();

      if (queue.length < 4) {
        return res.json({ 
          suggestions: [],
          restWarnings: [],
          loneOutliers: [],
          stretchMatches: [],
          queueSize: queue.length,
          message: `Need ${4 - queue.length} more players in queue`
        });
      }

      // Gate 3: hydrate-once (restart-only DB load); rest states are never
      // rebuilt from history. Partner history replay stays (idempotent).
      await ensureRestStatesHydrated(session.id);
      const gameParticipants = await storage.getSessionGameParticipants(session.id);
      buildPartnerHistoryFromHistory(session.id, gameParticipants);

      const groupByTier = req.query.groupByTier !== 'false';
      const aiMode = req.query.aiMode === 'true';

      // ── AI mode: try Claude first, silently fall back to local algorithm ──
      if (aiMode && process.env.ANTHROPIC_API_KEY) {
        try {
          // Collect player data for the prompt (queue is string[] of player IDs)
          // Exclude players who have voluntarily sat out (same as local algorithm)
          const sittingOutIds = new Set(getSittingOutPlayers(session.id));
          const queuePlayerIds = (queue as string[]).filter(id => !sittingOutIds.has(id));
          const queuePlayers = allPlayers.filter(p => queuePlayerIds.includes(p.id));

          // Build session average games from rest states
          const allRestStates = queuePlayers.map(p => getPlayerRestState(session.id, p.id));
          const totalGames = allRestStates.reduce((sum, rs) => sum + (rs.gamesThisSession || 0), 0);
          const avgGames = queuePlayers.length > 0 ? totalGames / queuePlayers.length : 0;

          // Get court count (non-occupied courts)
          const sessionCourts = await storage.getCourtsBySession(session.id);
          const availableCourts = sessionCourts.filter(c => c.status === 'available').length;

          if (availableCourts < 1) {
            // No courts available, use local algorithm
            throw new Error("No available courts for AI mode");
          }

          const sessionState = {
            availableCourts,
            avgGames: Math.round(avgGames * 10) / 10,
            players: queuePlayers.map(p => {
              const rs = getPlayerRestState(session.id, p.id);
              return {
                name: p.name,
                score: p.skillScore || 90,
                tier: p.level || 'lower_intermediate',
                gender: p.gender || 'male',
                gamesThisSession: rs.gamesThisSession || 0,
                gamesWaited: rs.gamesWaited || 0,
              };
            }),
          };

          const parsed = await requestClaudeMatchmaking(sessionState);

          // Fallback: if Claude returns fewer suggestions than available courts
          if (parsed.suggestions.length < availableCourts) {
            throw new Error(`AI returned ${parsed.suggestions.length} suggestions for ${availableCourts} courts — falling back`);
          }

          // Normalise: map player names → IDs from allPlayers (case-insensitive)
          const playersByNameLower = new Map<string, typeof allPlayers[0]>();
          for (const p of allPlayers) {
            playersByNameLower.set(p.name.toLowerCase(), p);
          }

          const normalised = parsed.suggestions.map(sug => {
            const resolveTeam = (teamRaw: { name: string; score: number; tier: string; gender: string }[]) =>
              teamRaw.map(raw => {
                const found = playersByNameLower.get(raw.name.toLowerCase());
                if (!found) throw new Error(`Unknown player name from AI: "${raw.name}"`);
                return found;
              });

            const team1 = resolveTeam(sug.team1);
            const team2 = resolveTeam(sug.team2);

            const scores1 = team1.map(p => p.skillScore || 90);
            const scores2 = team2.map(p => p.skillScore || 90);
            const avg1 = scores1.reduce((a, b) => a + b, 0) / scores1.length;
            const avg2 = scores2.reduce((a, b) => a + b, 0) / scores2.length;
            const spread1 = Math.max(...scores1) - Math.min(...scores1);
            const spread2 = Math.max(...scores2) - Math.min(...scores2);
            const gap = Math.abs(avg1 - avg2);

            const allTierIndices = [...team1, ...team2].map(p => getTierIndex(p.skillScore || 90));
            const tierDispersion = Math.max(...allTierIndices) - Math.min(...allTierIndices);

            return {
              team1,
              team2,
              team1Avg: avg1,
              team2Avg: avg2,
              skillGap: gap,
              variance: 0,
              tierDispersion,
              splitPenalty: 0,
              crossTierPenalty: tierDispersion > 0 ? 1 : 0,
              withinTeamSpread1: spread1,
              withinTeamSpread2: spread2,
              equityRank: 0,
              isStretchMatch: sug.isStretchMatch,
              stretchMatchText: sug.isStretchMatch ? sug.reasoning : undefined,
              isCompromised: false,
              rank: sug.courtNumber,
              courtNumber: sug.courtNumber,
              reasoning: sug.reasoning,
              fromAI: true,
            };
          });

          return res.json({
            suggestions: normalised,
            restWarnings: [],
            loneOutliers: [],
            stretchMatches: [],
            queueSize: queue.length,
            fromAI: true,
          });
        } catch (aiError) {
          console.warn('[AI Suggestions] Falling back to local algorithm:', (aiError as Error).message);
          // Fall through to local algorithm below
        }
      }

      // Generate top 5 matchup options (local algorithm)
      const { allCombinations, restWarnings, loneOutliers, stretchMatches } = generateAllMatchupOptions(
        session.id,
        queue,
        allPlayers,
        5,
        groupByTier
      );

      res.json({
        suggestions: allCombinations,
        restWarnings,
        loneOutliers,
        stretchMatches,
        queueSize: queue.length
      });
    } catch (error) {
      console.error('Matchmaking suggestions error:', error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Bracketed court assignment suggestions
  app.get("/api/matchmaking/bracket-suggestions", requireAuth, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const courtCountParam = Number(req.query.courtCount);

      let session;
      if (sessionId) {
        session = await storage.getSession(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });
      } else {
        session = await storage.getActiveSession();
        if (!session) return res.status(404).json({ error: "No active session" });
      }

      // Cap courtCount at available courts to prevent pathological requests
      const availableCourts = await storage.getCourtsBySession(session.id);
      const maxCourts = Math.max(1, availableCourts.length);
      const courtCount = Number.isFinite(courtCountParam) && courtCountParam >= 1
        ? Math.min(courtCountParam, maxCourts)
        : 1;

      const queue = await storage.getQueue(session.id);
      const allPlayers = await storage.getAllPlayers();

      // Gate 3: hydrate-once (restart-only DB load); rest states are never
      // rebuilt from history. Partner history replay stays (idempotent).
      await ensureRestStatesHydrated(session.id);
      const gameParticipants = await storage.getSessionGameParticipants(session.id);
      buildPartnerHistoryFromHistory(session.id, gameParticipants);

      const { brackets, restWarnings } = generateBracketedLineups(
        session.id,
        queue,
        allPlayers,
        courtCount,
      );

      res.json({ brackets, restWarnings, queueSize: queue.length });
    } catch (error) {
      console.error('Bracket suggestions error:', error);
      res.status(500).json({ error: "Failed to generate bracket suggestions" });
    }
  });

  // Batch assign multiple courts at once (bracket-assign)
  app.post("/api/matchmaking/bracket-assign", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        sessionId: z.string().optional(),
        assignments: z.array(z.object({
          courtId: z.string(),
          teamAssignments: z.array(z.object({
            playerId: z.string(),
            team: z.number(),
          })),
        })),
      });

      const { sessionId: bodySessionId, assignments } = schema.parse(req.body);

      const gameSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!gameSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session" });
      }

      // ── Pre-validation pass: reject early before any mutations ────────────
      const validatedCourts: Awaited<ReturnType<typeof storage.getCourt>>[] = [];
      const seenCourtIds = new Set<string>();
      const seenPlayerIds = new Set<string>();

      for (const { courtId, teamAssignments } of assignments) {
        if (teamAssignments.length !== 4) {
          return res.status(400).json({
            error: `Court ${courtId}: exactly 4 players required (2 per team), got ${teamAssignments.length}`,
          });
        }
        const invalidTeam = teamAssignments.find(a => a.team !== 1 && a.team !== 2);
        if (invalidTeam) {
          return res.status(400).json({
            error: `Court ${courtId}: team must be 1 or 2, got ${invalidTeam.team}`,
          });
        }
        const team1Count = teamAssignments.filter(a => a.team === 1).length;
        const team2Count = teamAssignments.filter(a => a.team === 2).length;
        if (team1Count !== 2 || team2Count !== 2) {
          return res.status(400).json({
            error: `Court ${courtId}: each team must have exactly 2 players`,
          });
        }

        if (seenCourtIds.has(courtId)) {
          return res.status(400).json({ error: `Court ${courtId} appears more than once in the request` });
        }
        seenCourtIds.add(courtId);

        for (const a of teamAssignments) {
          if (seenPlayerIds.has(a.playerId)) {
            return res.status(400).json({ error: `Player ${a.playerId} appears in more than one court assignment` });
          }
          seenPlayerIds.add(a.playerId);
        }

        const court = await storage.getCourt(courtId);
        if (!court) return res.status(404).json({ error: `Court ${courtId} not found` });
        if (court.status === 'occupied') {
          return res.status(400).json({ error: `Court ${court.name} is already occupied` });
        }

        validatedCourts.push(court);
      }

      // ── Mutation pass: all validations passed, now apply changes via shared helper ──
      // Gate 4b: each court's queue removal is a targeted advisory-locked
      // delete inside assignCourtCore — the old single stale setQueue write
      // could overwrite a concurrent end-game's re-append. A court whose CAS
      // loses (taken between validation and mutation) is skipped and
      // reported; the others still assign.
      const results = [];
      const skipped: { courtId: string; reason: string }[] = [];

      for (let idx = 0; idx < assignments.length; idx++) {
        const { courtId, teamAssignments } = assignments[idx];
        const assignResult = await assignCourtCore({
          courtId,
          teamAssignments,
          sessionId: gameSession.id,
        });
        if (!assignResult) {
          skipped.push({ courtId, reason: 'court no longer available' });
          continue;
        }
        results.push(assignResult.updatedCourt);
      }

      // Gate 5c: proactive Up Next — one queued-only pass covers every court
      // this batch just occupied (never creates timed pending rows).
      if (results.length > 0) {
        setImmediate(() => {
          import('./auto-matchmaking').then(m =>
            m.tryQueuedBuildForSession(gameSession.id).catch(err =>
              console.error('[queued-build] post-bracket-assign unhandled:', err),
            ),
          );
        });
      }

      res.json({ success: true, courts: results, ...(skipped.length > 0 ? { skipped } : {}) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error('Bracket assign error:', error);
      res.status(500).json({ error: "Failed to batch-assign courts" });
    }
  });

  // ── Shared court-assignment helper ────────────────────────────────────────
  // Both /api/courts/:courtId/assign and /api/matchmaking/bracket-assign use
  // this function so the mutation logic stays in one canonical place.
  // Gate 4b: returns null when the court CAS loses — a concurrent
  // cancel-game, player start-game, or second assign claimed the court
  // between the caller's validation read and this mutation. Callers must
  // treat null as a clean conflict (nothing was written).
  async function assignCourtCore(params: {
    courtId: string;
    teamAssignments: { playerId: string; team: number }[];
    sessionId: string;
  }): Promise<{ updatedCourt: Awaited<ReturnType<typeof storage.getCourt>> } | null> {
    const { courtId, teamAssignments, sessionId } = params;

    // Claim the court first: occupied only if currently 'available'.
    const claimed = await storage.occupyCourtIfAvailable(courtId);
    if (!claimed) return null;

    await storage.setCourtPlayersWithTeams(courtId, teamAssignments);

    for (const a of teamAssignments) {
      await storage.updatePlayer(a.playerId, { status: 'playing' });
    }

    // Gate 4b: targeted advisory-locked removal replaces the old
    // read-outside-the-lock setQueue persistence — a concurrent end-game
    // re-append can no longer be overwritten by a stale full-queue write.
    await storage.removeManyFromQueue(sessionId, teamAssignments.map(a => a.playerId));

    // Mirror the assignment into match_suggestions so the player-facing
    // /current-suggestion endpoint (which reads only this table) reflects
    // the admin's action. This is the bridge that keeps the admin's Court
    // Management screen and the player phones in sync. Any pre-existing
    // active suggestion for this court OR involving any of these players
    // is dismissed in the same transaction so the player view never sees
    // two live rows for the same person.
    //
    // pendingUntil is unused for 'playing' rows (the auto-approve sweep
    // only touches 'pending'), but the column is NOT NULL — set it to a
    // benign near-future value.
    const SUGGESTION_PENDING_UNTIL_MS = 60 * 1000;
    try {
      await storage.replaceActiveSuggestionForAdminAssignment({
        sessionId,
        courtId,
        pendingUntil: new Date(Date.now() + SUGGESTION_PENDING_UNTIL_MS),
        approvedBy: 'admin',
        players: teamAssignments,
      });
    } catch (err) {
      // Don't fail the admin's assign action over a player-app sync write.
      // The legacy state (courts/court_players/players) is already correct
      // — the player phones will just keep showing "Finding next game…"
      // until the next assign succeeds.
      console.error('[assignCourtCore] Failed to mirror assignment into match_suggestions:', err);
    }

    // Deferred-fix sweep: the mirror above already dismisses queued rows
    // naming these players, but an orchestrator pass that read its pool
    // BEFORE this assign can INSERT a stale auto-row AFTER it (the two
    // paths hold different advisory-lock keys, so they don't serialize).
    // A delayed sweep catches that write-after-dismiss race; CAS dismissal
    // leaves rows that legitimately flipped meanwhile untouched. The
    // deeper fix (aligning the lock keys) stays deferred with the
    // orchestrator work.
    const assignedIds = teamAssignments.map(a => a.playerId);
    setTimeout(() => {
      import('./auto-matchmaking')
        .then(async m => {
          const released = await m.releaseAutoQueuedClaims(sessionId, courtId, assignedIds, { includeOwnCourt: true });
          if (released > 0) {
            console.log(`[assignCourtCore] stale-auto sweep released ${released} row(s) for court ${courtId}`);
            m.tryAutoMatchmaking(sessionId).catch(err =>
              console.error('[auto-matchmaking] post-sweep replan unhandled:', err));
          }
        })
        .catch(err => console.error('[assignCourtCore] stale-auto sweep unhandled:', err));
    }, 2500);

    const updatedCourt = await storage.getCourt(courtId);
    return { updatedCourt };
  }

  // Game management routes
  app.post("/api/courts/:courtId/assign", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { playerIds, teamAssignments, sessionId: bodySessionId } = req.body;
      
      // Support both legacy (playerIds only) and new (teamAssignments) formats
      let assignments: { playerId: string; team: number }[];
      
      if (teamAssignments && Array.isArray(teamAssignments)) {
        // New format: explicit team assignments
        assignments = teamAssignments;
      } else if (playerIds && Array.isArray(playerIds)) {
        // Legacy format: auto-split into teams
        if (playerIds.length < 2) {
          return res.status(400).json({ error: "At least 2 players required" });
        }
        const midpoint = Math.ceil(playerIds.length / 2);
        assignments = playerIds.map((playerId, index) => ({
          playerId,
          team: index < midpoint ? 1 : 2
        }));
      } else {
        return res.status(400).json({ error: "playerIds or teamAssignments required" });
      }

      // Validate exactly 2 players per team (4 total)
      const team1Count = assignments.filter(a => a.team === 1).length;
      const team2Count = assignments.filter(a => a.team === 2).length;
      
      if (team1Count !== 2 || team2Count !== 2) {
        return res.status(400).json({ 
          error: `Each team must have exactly 2 players. Team 1: ${team1Count}, Team 2: ${team2Count}` 
        });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status === 'occupied') {
        return res.status(400).json({ error: "Court is occupied" });
      }

      // Resolve session before any mutations (prevents partial writes on invalid session)
      const gameSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!gameSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session" });
      }

      // Delegate to shared helper for canonical mutation logic
      const assignResult = await assignCourtCore({
        courtId: court.id,
        teamAssignments: assignments,
        sessionId: gameSession.id,
      });
      if (!assignResult) {
        return res.status(409).json({ error: "Court was just taken by another action — refresh and retry" });
      }
      const { updatedCourt } = assignResult;

      // Gate 5c: proactive Up Next — build queued lineups the moment a court
      // becomes occupied (queued-ONLY pass; never creates timed pending rows).
      setImmediate(() => {
        import('./auto-matchmaking').then(m =>
          m.tryQueuedBuildForSession(gameSession.id).catch(err =>
            console.error('[queued-build] post-assign unhandled:', err),
          ),
        );
      });

      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter(p => p !== null);

      res.json({ ...updatedCourt, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to assign players" });
    }
  });

  app.post("/api/courts/:courtId/cancel-game", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { sessionId: bodySessionId } = req.body;
      console.log(`[CANCEL-GAME] Canceling game on court ${req.params.courtId}`);
      
      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Court is not occupied" });
      }

      // Resolve session before any mutations (prevents partial writes on invalid session)
      const gameSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!gameSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session" });
      }

      // Gate 4b: claim the cancel FIRST via a conditional 'dismissed'
      // transition on the in-flight suggestion. Losing the CAS means a
      // concurrent end-game already completed this game (or another cancel
      // won) — nothing may be touched; the players' stats and queue state
      // belong to that winner. This also gives the player phones their
      // dismissal signal: PlayingScreen polls /current-suggestion every 5s
      // and routes back to the waiting screen on status='dismissed'.
      // pendingUntil is bumped to (now + 10 min) so the recently-dismissed
      // fallback detects the cancel via a single column filter, independent
      // of how long the game ran; the sweep only reads status='pending'
      // rows so the re-purposing is safe. Courts with no suggestion
      // (legacy manual assigns) proceed unguarded as before.
      const activeSuggestion = await storage.getActiveMatchSuggestionForCourt(court.id);
      if (activeSuggestion) {
        const wonCancel = await storage.dismissSuggestionIfInFlight(
          activeSuggestion.id,
          new Date(Date.now() + 10 * 60 * 1000),
        );
        if (!wonCancel) {
          return res.status(409).json({ error: "Game already ended or cancelled" });
        }
      }

      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is typeof p & { team: number } => p !== null);

      // Return all players to waiting status
      for (const player of players) {
        await storage.updatePlayer(player.id, { status: 'waiting' });
      }

      // Gate 2: same atomic re-append as end-game — cancel-game is the third
      // "return players to the queue" site and races identically.
      await storage.appendPlayersToQueue(
        gameSession.id,
        players.map(p => p.id),
        players.map(p => p.id),
      );

      // Reset court
      await storage.updateCourt(court.id, {
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null,
      });
      await storage.setCourtPlayers(court.id, []);

      console.log(`[CANCEL-GAME] Game canceled successfully. Players returned to queue.`);
      res.json({ message: 'Game canceled successfully' });
    } catch (error) {
      console.error(`[CANCEL-GAME] Error canceling game:`, error);
      res.status(500).json({ error: "Failed to cancel game" });
    }
  });

  app.post("/api/courts/:courtId/end-game", requireAuth, requireCaptain, async (req: AuthRequest, res) => {
    try {
      const { winningTeam, team1Score, team2Score, sessionId: bodySessionId } = req.body;
      
      console.log(`[END-GAME] Court ${req.params.courtId}: Team ${winningTeam} wins ${team1Score}-${team2Score}`);
      
      // Validate input
      if (winningTeam !== 1 && winningTeam !== 2) {
        console.error(`[END-GAME] Invalid winning team: ${winningTeam}`);
        return res.status(400).json({ error: "winningTeam must be 1 or 2" });
      }
      if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        console.error(`[END-GAME] Invalid scores: team1=${team1Score}, team2=${team2Score}`);
        return res.status(400).json({ error: "team1Score and team2Score are required" });
      }
      if (team1Score < 0 || team2Score < 0) {
        console.error(`[END-GAME] Negative scores: team1=${team1Score}, team2=${team2Score}`);
        return res.status(400).json({ error: "Scores must be non-negative" });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Court is not occupied" });
      }

      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is typeof p & { team: number } => p !== null);

      // Determine winners and losers based on team assignments
      const team1 = players.filter(p => p.team === 1);
      const team2 = players.filter(p => p.team === 2);
      
      // Defensive check: ensure exactly 2 players per team
      if (team1.length !== 2 || team2.length !== 2) {
        console.error(`[END-GAME] Invalid team sizes: Team 1 has ${team1.length} players, Team 2 has ${team2.length} players`);
        console.error(`[END-GAME] Court players:`, courtPlayerData);
        return res.status(400).json({ 
          error: `Invalid team configuration. Each team must have exactly 2 players. Team 1: ${team1.length}, Team 2: ${team2.length}` 
        });
      }
      
      console.log(`[END-GAME] Team sizes validated: Team 1=${team1.length}, Team 2=${team2.length}`);
      
      const winners = winningTeam === 1 ? team1 : team2;
      const losers = winningTeam === 1 ? team2 : team1;

      // Resolve session — supports both active and sandbox sessions
      const activeSession = bodySessionId
        ? await storage.getSession(bodySessionId)
        : await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: bodySessionId ? "Session not found" : "No active session" });
      }
      const isSandboxSession = activeSession.isSandbox;

      // Calculate average skill scores for each team (using 10-200 scale)
      const { calculateSkillAdjustment, calculateTeamAverage, getSkillTier } = await import('@shared/utils/skillUtils');

      // Calculate point differential for skill adjustment
      const pointDifferential = Math.abs(team1Score - team2Score);

      const now = new Date();
      const RETURN_BOOST_THRESHOLD_DAYS = 14;
      const RETURN_BOOST_GAMES = 2;

      // Build a map of playerId → team assignment so the callback (which
      // receives DB-fresh player rows without the .team field) can recover it.
      const teamByPlayerId = new Map<string, number>(players.map(p => [p.id, p.team]));
      const winnerIdSet = new Set(winners.map(w => w.id));
      const playerIds = players.map(p => p.id);

      // Look up the live match suggestion for this court (created by
      // assignCourtCore on assign). Passing its id into the transaction
      // both (a) marks the suggestion 'completed' atomically with the
      // game_results insert, and (b) provides idempotency via the unique
      // constraint on game_results.matchSuggestionId. If no live row
      // exists (e.g. legacy game started before this sync was added),
      // we proceed with null and the transaction still records the game.
      let activeSuggestionIdForGame: string | null = null;
      try {
        const activeSuggestion = await storage.getActiveMatchSuggestionForCourt(court.id);
        activeSuggestionIdForGame = activeSuggestion?.id ?? null;
      } catch (err) {
        console.error(`[END-GAME] Failed to look up active suggestion for court ${court.id}:`, err);
      }

      // Wrap player updates + game_results + game_participants in a single
      // transaction. The callback runs INSIDE the tx with freshly-read player
      // rows so concurrent end-game calls (defense in depth: court state
      // already gates against this) cannot corrupt skill scores via stale reads.
      const txResult = await storage.completeGameTransaction({
        sessionId: activeSession.id,
        courtId: court.id,
        team1Score,
        team2Score,
        winningTeam,
        matchSuggestionId: activeSuggestionIdForGame,
        isSandboxSession,
        playerIds,
        computePerPlayer: (freshPlayers) => {
          // Recompute team averages from fresh skill scores
          const freshTeam1 = freshPlayers.filter(p => teamByPlayerId.get(p.id) === 1);
          const freshTeam2 = freshPlayers.filter(p => teamByPlayerId.get(p.id) === 2);
          const team1AvgSkill = calculateTeamAverage(freshTeam1.map(p => p.skillScore || 50));
          const team2AvgSkill = calculateTeamAverage(freshTeam2.map(p => p.skillScore || 50));

          return freshPlayers.map(player => {
            const team = teamByPlayerId.get(player.id);
            if (team !== 1 && team !== 2) {
              throw new Error(`Player ${player.id} missing team assignment`);
            }
            const isWinner = winnerIdSet.has(player.id);
            const isTeam1 = team === 1;
            const opponentAvgSkill = isTeam1 ? team2AvgSkill : team1AvgSkill;

            // Fix 1: Find partner score for contribution factor
            const partnerScore = freshPlayers.find(
              p => teamByPlayerId.get(p.id) === team && p.id !== player.id,
            )?.skillScore ?? null;

            // Fix 6: Determine return boost — if player was inactive 14+ days, grant 2-game boost
            const lastPlayed = player.lastPlayedAt;
            const daysInactive = lastPlayed
              ? (now.getTime() - new Date(lastPlayed).getTime()) / (24 * 60 * 60 * 1000)
              : 0;
            const isReturning = lastPlayed !== null && daysInactive >= RETURN_BOOST_THRESHOLD_DAYS;
            const currentReturnGames = isReturning ? RETURN_BOOST_GAMES : (player.returnGamesRemaining ?? 0);
            const newReturnGamesRemaining = Math.max(0, currentReturnGames - 1);

            // Snap-back: a score below baseline is unrecovered inactivity decay
            // (baseline re-syncs to the score at every game end, so a deficit can
            // only come from the decay job). Restore to the baseline before
            // applying this game's result — the decay dip evaporates on the
            // first game back instead of being baked into the new baseline.
            const storedScore = player.skillScore || 50;
            const skillBefore = Math.max(storedScore, player.skillScoreBaseline ?? storedScore);
            const skillAfter = calculateSkillAdjustment(
              skillBefore,
              opponentAvgSkill,
              isWinner,
              pointDifferential,
              player.gamesPlayed || 0,
              partnerScore,
              currentReturnGames,
            );

            const tierResult = applyTierBuffer(
              { level: player.level, tierCandidate: player.tierCandidate ?? null, tierCandidateGames: player.tierCandidateGames ?? 0 },
              skillAfter,
              getSkillTier,
            );

            const playerUpdates = isSandboxSession
              ? { status: 'waiting' as const }
              : {
                  gamesPlayed: player.gamesPlayed + 1,
                  wins: isWinner ? player.wins + 1 : player.wins,
                  skillScore: skillAfter,
                  level: tierResult.level,
                  tierCandidate: tierResult.tierCandidate,
                  tierCandidateGames: tierResult.tierCandidateGames,
                  status: 'waiting' as const,
                  lastPlayedAt: now,
                  skillScoreBaseline: skillAfter,
                  returnGamesRemaining: newReturnGamesRemaining,
                };

            return {
              playerId: player.id,
              team,
              skillBefore,
              skillAfter,
              playerUpdates,
            };
          });
        },
      });

      // Concurrency guard: if a duplicate end-game request raced past the
      // court-status check above, only one of them inserted the
      // game_results row (enforced by the unique index on
      // matchSuggestionId inside completeGameTransaction). The losing
      // request gets alreadySubmitted=true with the canonical
      // participants from the winner. We must NOT re-apply the post-tx
      // side effects (rest states, queue append, court reset) for the
      // loser — those would double-count and corrupt session state.
      // Returning the existing court state matches what the winning
      // request would have returned after its full post-tx pass.
      if (txResult.alreadySubmitted) {
        console.log(`[END-GAME] Duplicate end-game for court ${court.id} ignored (game ${txResult.gameId} already recorded).`);
        const currentCourt = await storage.getCourt(court.id);
        return res.json({ ...currentCourt, players: [] });
      }

      const participantData = txResult.participants;

      // Gate 3: hydrate BEFORE mutating — if the first thing after a restart
      // is an end-game, updating an unhydrated map would strand every other
      // player's persisted counters (persist only writes map members).
      await ensureRestStatesHydrated(activeSession.id);

      // Update rest states: players who just played have their consecutive count incremented
      for (const participant of participantData) {
        updatePlayerRestState(activeSession.id, participant.playerId, true);
      }
      
      // Fix 3: Record partner pairings for split-penalty calculation
      updatePartnerHistory(activeSession.id, team1, team2);
      
      // Update rest states for players who were waiting (reset their consecutive count)
      const currentQueue = await storage.getQueue(activeSession.id);
      const playedPlayerIds = new Set(participantData.map(p => p.playerId));

      for (const playerId of currentQueue) {
        if (!playedPlayerIds.has(playerId)) {
          updatePlayerRestState(activeSession.id, playerId, false);
        }
      }

      // Add players back to queue (losers first, then winners). Gate 2: atomic +
      // filtered inside the per-session lock — the queue is re-read fresh in the
      // transaction, so two courts ending simultaneously both land their players,
      // and a played player already in the queue can never be duplicated.
      await storage.appendPlayersToQueue(
        activeSession.id,
        Array.from(playedPlayerIds),
        [...losers.map(p => p.id), ...winners.map(p => p.id)],
      );

      // Reset court
      await storage.updateCourt(court.id, {
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null,
      });
      await storage.setCourtPlayers(court.id, []);

      const updatedCourt = await storage.getCourt(court.id);
      console.log(`[END-GAME] Game ended successfully. Court ${court.id} now ${updatedCourt?.status}. Players returned to queue.`);

      // Persist rest states so they survive server restarts
      await persistRestStatesToDb(activeSession.id);

      // Queued → pending transition (mirrors the player-driven submit-score
      // path in marketplace-routes.ts). Runs BEFORE any background
      // matchmaking so a pre-built next-round lineup is honoured rather
      // than replaced. Best-effort: any failure here is logged but never
      // breaks the end-game response.
      try {
        const { tryFlipQueuedToPendingForCourt } = await import('./auto-matchmaking');
        await tryFlipQueuedToPendingForCourt(activeSession.id, court.id);
      } catch (flipErr) {
        console.error('[queued-transition] admin-end-game unhandled:', flipErr);
      }

      // Fire-and-forget session-wide matchmaking (parity with the player
      // submit-score path in marketplace-routes.ts). The orchestrator decides
      // which courts get a fresh suggestion (the just-vacated one plus any
      // others currently free) and never re-suggests an in-flight court.
      // Best-effort: never blocks or breaks the end-game response.
      setImmediate(() => {
        import('./auto-matchmaking')
          .then(({ tryAutoMatchmaking }) => tryAutoMatchmaking(activeSession.id))
          .catch(err => {
            console.error('[auto-matchmaking] post-admin-end-game unhandled:', err);
          });
      });

      res.json({ ...updatedCourt, players: [] });
    } catch (error) {
      console.error(`[END-GAME] Error ending game:`, error);
      res.status(500).json({ error: "Failed to end game" });
    }
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json({
            activePlayers: 0,
            inQueue: 0,
            availableCourts: 0,
            occupiedCourts: 0,
            totalPlayers: 0,
            totalCourts: 0,
          });
        }
        sessionId = activeSession.id;
      }

      // Fire the independent queries in parallel — each was previously
      // sequential, costing an extra ~233 ms per hop to the Railway DB.
      // Phase 1 KPI fix: courts come WITH their rosters so activePlayers can
      // count people actually ON courts. The old derivation intersected the
      // queue with status='playing' — structurally empty, since assignment
      // removes players from the queue; the "Playing" chip showed 0 during
      // every game ever played.
      const [courts, queue] = await Promise.all([
        storage.getCourtsWithPlayers(sessionId),
        storage.getQueue(sessionId),
      ]);

      const stats = {
        activePlayers: courts.reduce((sum: number, c: any) => sum + (c.players?.length ?? 0), 0),
        inQueue: queue.length,
        availableCourts: courts.filter((c: any) => c.status === 'available').length,
        occupiedCourts: courts.filter((c: any) => c.status === 'occupied').length,
        // Everyone participating right now: waiting in the queue or on a court
        totalPlayers: queue.length + courts.reduce((sum: number, c: any) => sum + (c.players?.length ?? 0), 0),
        totalCourts: courts.length,
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Today's stats endpoint for leaderboard
  app.get("/api/stats/today", async (req, res) => {
    try {
      // Get start of today (midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fire players and today's games in parallel — they are independent,
      // so there's no reason to await one before starting the other.
      const [players, todaysGames] = await Promise.all([
        storage.getAllPlayers(),
        db
          .select()
          .from(gameResults)
          .where(sql`${gameResults.createdAt} >= ${today} AND ${gameResults.sessionId} IN (SELECT id FROM sessions WHERE is_sandbox = false)`),
      ]);
      
      const gameIds = todaysGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games today, return all players with 0 stats
        const playersWithStats = players.map(p => ({
          ...p,
          gamesPlayedToday: 0,
          winsToday: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from today's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);
      
      // Calculate stats for each player
      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedToday = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsToday = 0;
        for (const participation of playerParticipations) {
          const game = todaysGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsToday++;
          }
        }
        
        return {
          ...player,
          gamesPlayedToday,
          winsToday,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-TODAY] Error:', error);
      res.status(500).json({ error: "Failed to fetch today's stats" });
    }
  });

  // Weekly stats endpoint for leaderboard (current week, Mon–Sun)
  app.get("/api/stats/week", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();

      // Get start of current week (Monday at midnight)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
      const daysFromMonday = (dayOfWeek + 6) % 7; // days since last Monday
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - daysFromMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const weekGames = await db
        .select()
        .from(gameResults)
        .where(sql`${gameResults.createdAt} >= ${startOfWeek} AND ${gameResults.sessionId} IN (SELECT id FROM sessions WHERE is_sandbox = false)`);

      const gameIds = weekGames.map(g => g.id);

      if (gameIds.length === 0) {
        return res.json(players.map(p => ({ ...p, gamesPlayedThisWeek: 0, winsThisWeek: 0 })));
      }

      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);

      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedThisWeek = playerParticipations.length;
        let winsThisWeek = 0;
        for (const participation of playerParticipations) {
          const game = weekGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsThisWeek++;
          }
        }
        return { ...player, gamesPlayedThisWeek, winsThisWeek };
      });

      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-WEEK] Error:', error);
      res.status(500).json({ error: "Failed to fetch this week's stats" });
    }
  });

  // Monthly stats endpoint for leaderboard
  app.get("/api/stats/month/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month); // 1-12
      
      // Validate month range
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
      
      // Validate year range (reasonable bounds: 2020-2100)
      if (year < 2020 || year > 2100) {
        return res.status(400).json({ error: "Year must be between 2020 and 2100" });
      }
      
      const players = await storage.getAllPlayers();
      
      // Get start and end of the month
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
      
      // Get all games from the specified month (excluding sandbox sessions)
      const monthGames = await db
        .select()
        .from(gameResults)
        .where(sql`${gameResults.createdAt} >= ${startOfMonth} AND ${gameResults.createdAt} <= ${endOfMonth} AND ${gameResults.sessionId} IN (SELECT id FROM sessions WHERE is_sandbox = false)`);
      
      const gameIds = monthGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games this month, return all players with 0 stats
        const playersWithStats = players.map(p => ({
          ...p,
          gamesPlayedInMonth: 0,
          winsInMonth: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from month's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);
      
      // Calculate stats for each player
      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedInMonth = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsInMonth = 0;
        for (const participation of playerParticipations) {
          const game = monthGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsInMonth++;
          }
        }
        
        return {
          ...player,
          gamesPlayedInMonth,
          winsInMonth,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-MONTH] Error:', error);
      res.status(500).json({ error: "Failed to fetch monthly stats" });
    }
  });

  // Get session-specific player stats
  app.get("/api/stats/session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Verify session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Get all players in the session's queue
      // Note: queue is already an array of player IDs (strings)
      const queue = await storage.getQueue(sessionId);
      const queuePlayerIds = queue;
      
      // Get all games from this session
      const sessionGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.sessionId, sessionId));
      
      const gameIds = sessionGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games in session, return queue players with 0 stats
        const players = await storage.getAllPlayers();
        const queuePlayers = players.filter(p => queuePlayerIds.includes(p.id));
        const playersWithStats = queuePlayers.map(p => ({
          ...p,
          gamesPlayedInSession: 0,
          winsInSession: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from session's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(inArray(gameParticipants.gameId, gameIds));
      
      // Get all players
      const allPlayers = await storage.getAllPlayers();
      
      // Filter to only players who have participated in this session or are in queue
      const participantPlayerIds = Array.from(new Set(participants.map(p => p.playerId)));
      const relevantPlayerIds = Array.from(new Set([...queuePlayerIds, ...participantPlayerIds]));
      const relevantPlayers = allPlayers.filter(p => relevantPlayerIds.includes(p.id));
      
      // Calculate stats for each player in this session
      const playersWithStats = relevantPlayers.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedInSession = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsInSession = 0;
        for (const participation of playerParticipations) {
          const game = sessionGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsInSession++;
          }
        }
        
        return {
          ...player,
          gamesPlayedInSession,
          winsInSession,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-SESSION] Error:', error);
      res.status(500).json({ error: "Failed to fetch session stats" });
    }
  });

  // Most improved players in last 30 days (by net skill score gain)
  app.get("/api/stats/most-improved", async (req, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Single grouped join: participants → games (30 days, non-sandbox) → players
      const rows = await db
        .select({
          id: players.id,
          name: players.name,
          level: players.level,
          skillScore: players.skillScore,
          shuttleIqId: players.shuttleIqId,
          gender: players.gender,
          wins: players.wins,
          gamesPlayed: players.gamesPlayed,
          scoreGain: sql<number>`SUM(${gameParticipants.skillScoreAfter} - ${gameParticipants.skillScoreBefore})`.as('score_gain'),
          gamesInWindow: sql<number>`COUNT(*)`.as('games_in_window'),
        })
        .from(gameParticipants)
        .innerJoin(gameResults, eq(gameParticipants.gameId, gameResults.id))
        .innerJoin(sessions, eq(gameResults.sessionId, sessions.id))
        .innerJoin(players, eq(gameParticipants.playerId, players.id))
        .where(
          and(
            sql`${gameResults.createdAt} >= ${thirtyDaysAgo}`,
            sql`${sessions.isSandbox} = false`
          )
        )
        .groupBy(
          players.id, players.name, players.level, players.skillScore,
          players.shuttleIqId, players.gender, players.wins, players.gamesPlayed
        )
        .orderBy(desc(sql`score_gain`));

      res.json(rows);
    } catch (error) {
      console.error('[STATS-MOST-IMPROVED] Error:', error);
      res.status(500).json({ error: "Failed to fetch most improved stats" });
    }
  });

  // Reset all games endpoint
  app.delete("/api/game-history", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      console.log('[RESET-GAMES] Starting full reset (games, stats, and courts)...');
      
      // Delete all game participants first (foreign key constraint)
      await db.delete(gameParticipants);
      console.log('[RESET-GAMES] Game participants deleted');
      
      // Delete all game results
      await db.delete(gameResults);
      console.log('[RESET-GAMES] Game results deleted');
      
      // Reset all player statistics
      const allPlayers = await storage.getAllPlayers();
      for (const player of allPlayers) {
        // Reset stats based on initial skill levels (Novice=25, Beginner=50, Intermediate/higher=80)
        const resetScoreMap: Record<string, number> = {
          'Novice': 25,
          'Beginner': 50,
          'lower_intermediate': 80,
          'upper_intermediate': 100,
          'Intermediate': 80,       // legacy label — map to lower_intermediate score
          'Advanced': 80,           // Advanced/Professional earned through play; reset to Intermediate
          'Professional': 80,
        };
        const initialSkillScore = resetScoreMap[player.level] ?? 50;
        
        await storage.updatePlayer(player.id, {
          gamesPlayed: 0,
          wins: 0,
          skillScore: initialSkillScore,
          skillScoreBaseline: initialSkillScore,
          returnGamesRemaining: 0,
          status: 'waiting',
        });
      }
      console.log('[RESET-GAMES] Player statistics reset');
      
      // Clear all court assignments and reset court states
      const activeSession = await storage.getActiveSession();
      if (activeSession) {
        const allCourts = await storage.getCourtsBySession(activeSession.id);
        for (const court of allCourts) {
          // Clear all players from this court
          await storage.setCourtPlayers(court.id, []);
          
          // Reset court to available state
          await storage.updateCourt(court.id, {
            status: 'available',
            timeRemaining: 0,
            winningTeam: null,
          });
        }
        console.log('[RESET-GAMES] Courts cleared and reset to available');
      }
      
      console.log('[RESET-GAMES] Full reset completed successfully');
      res.json({ message: 'All games, stats, and courts have been reset' });
    } catch (error) {
      console.error('[RESET-GAMES] Error:', error);
      res.status(500).json({ error: "Failed to reset game history" });
    }
  });

  // POST /api/admin/recalculate-player-stats
  // Recomputes games_played and wins for all players from game_participants + game_results history.
  // Useful after deleting duplicate game records to restore accurate counts.
  app.post("/api/admin/recalculate-player-stats", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      console.log('[RECALCULATE-STATS] Starting player stats recalculation from game history...');

      // Single atomic transaction that:
      // 1. Recomputes games_played and wins from game_participants for all players
      // 2. Restores skill_score, skill_score_baseline, and level from each player's
      //    most recent game_participants entry (same logic as the startup backfill)
      const result = await db.execute(sql`
        WITH
        -- Step 1: aggregate games_played and wins per player (non-sandbox sessions only)
        counts AS (
          SELECT
            gp.player_id,
            COUNT(*)::int                                                   AS games_played,
            COUNT(*) FILTER (WHERE gr.winning_team = gp.team)::int         AS wins
          FROM game_participants gp
          JOIN game_results gr ON gr.id = gp.game_id
          JOIN sessions      s  ON s.id = gr.session_id
          WHERE s.is_sandbox = false OR s.is_sandbox IS NULL
          GROUP BY gp.player_id
        ),
        -- Step 2: most-recent game scores for skill restoration
        last_game AS (
          SELECT DISTINCT ON (gp.player_id)
            gp.player_id,
            gp.skill_score_after AS restored_score,
            CASE
              WHEN gp.skill_score_after < 40  THEN 'Novice'
              WHEN gp.skill_score_after < 70  THEN 'Beginner'
              WHEN gp.skill_score_after < 90  THEN 'lower_intermediate'
              WHEN gp.skill_score_after < 110 THEN 'upper_intermediate'
              WHEN gp.skill_score_after < 160 THEN 'Advanced'
              ELSE 'Professional'
            END AS restored_level
          FROM game_participants gp
          JOIN game_results gr ON gr.id = gp.game_id
          ORDER BY gp.player_id, gr.created_at DESC, gp.game_id DESC
        ),
        -- Step 3: apply all corrections in one UPDATE
        updated AS (
          UPDATE players p
          SET
            games_played         = COALESCE(c.games_played, 0),
            wins                 = COALESCE(c.wins, 0),
            skill_score          = COALESCE(lg.restored_score, p.skill_score),
            skill_score_baseline = COALESCE(lg.restored_score, p.skill_score_baseline),
            level                = COALESCE(lg.restored_level, p.level)
          FROM (SELECT id FROM players) sub
          LEFT JOIN counts   c  ON c.player_id  = sub.id
          LEFT JOIN last_game lg ON lg.player_id = sub.id
          WHERE p.id = sub.id
          RETURNING p.id
        )
        SELECT COUNT(*) AS updated_count FROM updated
      `);

      const updatedCount = Number((result.rows[0] as { updated_count: string }).updated_count);
      console.log(`[RECALCULATE-STATS] Updated ${updatedCount} player records`);
      res.json({
        message: `Player stats (games played, wins, skill score) recalculated from game history`,
        playersUpdated: updatedCount,
      });
    } catch (error) {
      console.error('[RECALCULATE-STATS] Error:', error);
      res.status(500).json({ error: "Failed to recalculate player stats" });
    }
  });

  // ─── Gate M1: admin player merge ──────────────────────────────────────────
  const mergeErrorStatus = (code: string) => (code.endsWith("_NOT_FOUND") ? 404 : 409);

  // Receipt cards for the pair-confirmation UI: name, games, rating, display
  // tier, wallet, linked account, created date, likely creation path.
  app.get("/api/admin/players/merge-preview", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const ids = [req.query.survivorId, req.query.absorbedId].map((v) => (v ?? "").toString());
      if (!ids[0] || !ids[1]) return res.status(400).json({ error: "survivorId and absorbedId are required" });
      const receipts = [];
      for (const id of ids) {
        const r = await db.execute(sql`
          SELECT p.id, p.name, p.games_played, p.wins, p.skill_score, p.wallet_balance,
                 p.created_at, p.external_id, p.shuttle_iq_id,
                 mu.id AS mu_id, mu.email AS mu_email, mu.created_at AS mu_created,
                 EXISTS (SELECT 1 FROM booking_guests bg WHERE bg.linked_player_id = p.id) AS guest_created
          FROM players p
          LEFT JOIN marketplace_users mu ON mu.linked_player_id = p.id
          WHERE p.id = ${id}`);
        const row = (r.rows as any[])[0];
        if (!row) return res.status(404).json({ error: "Player not found", playerId: id });
        const createdMs = new Date(row.created_at).getTime();
        const path = row.external_id
          ? "Import"
          : row.guest_created
            ? "Guest check-in"
            : row.mu_id && Math.abs(createdMs - new Date(row.mu_created).getTime()) < 10 * 60 * 1000
              ? "Marketplace signup"
              : row.mu_id
                ? "Walk-in (claimed)"
                : "Walk-in / admin add";
        receipts.push({
          id: row.id,
          name: row.name,
          shuttleIqId: row.shuttle_iq_id,
          gamesPlayed: row.games_played,
          wins: row.wins,
          skillScore: row.skill_score,
          tier: getTierDisplayName(getSkillTier(row.skill_score)),
          walletFils: row.wallet_balance,
          linkedAccount: !!row.mu_id,
          createdAt: row.created_at,
          creationPath: path,
        });
      }
      res.json({ survivor: receipts[0], absorbed: receipts[1] });
    } catch (error) {
      console.error("merge-preview error:", error);
      res.status(500).json({ error: "Failed to load merge preview" });
    }
  });

  app.post("/api/admin/players/:survivorId/merge/:absorbedId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const summary = await mergePlayers({
        survivorId: req.params.survivorId,
        absorbedId: req.params.absorbedId,
        adminId: req.user?.userId ?? "unknown-admin",
      });
      res.json(summary);
    } catch (error) {
      if (error instanceof MergeError) {
        return res.status(mergeErrorStatus(error.code)).json({ error: error.message, code: error.code });
      }
      console.error("player-merge error:", error);
      res.status(500).json({ error: "Merge failed — nothing was changed" });
    }
  });

  app.post("/api/admin/player-merges/:logId/undo", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { log } = await undoPlayerMerge({ logId: req.params.logId, adminId: req.user?.userId ?? "unknown-admin" });
      res.json({ success: true, log });
    } catch (error) {
      if (error instanceof MergeError) {
        return res.status(mergeErrorStatus(error.code)).json({ error: error.message, code: error.code });
      }
      console.error("player-merge undo error:", error);
      res.status(500).json({ error: "Undo failed — nothing was changed" });
    }
  });

  app.get("/api/admin/player-merges", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const r = await db.execute(sql`
        SELECT ml.id, ml.survivor_id, ml.absorbed_id, ml.admin_id, ml.status,
               ml.created_at, ml.undone_at, ml.wallet_moved_fils,
               ml.absorbed_snapshot->>'name' AS absorbed_name,
               COALESCE(p.name, ml.absorbed_snapshot->>'name') AS survivor_name
        FROM player_merge_log ml
        LEFT JOIN players p ON p.id = ml.survivor_id
        ORDER BY ml.created_at DESC
        LIMIT 50`);
      res.json((r.rows as any[]).map((row) => ({
        id: row.id,
        survivorId: row.survivor_id,
        absorbedId: row.absorbed_id,
        adminId: row.admin_id,
        status: row.status,
        createdAt: row.created_at,
        undoneAt: row.undone_at,
        walletMovedFils: row.wallet_moved_fils,
        absorbedName: row.absorbed_name,
        survivorName: row.survivor_name,
      })));
    } catch (error) {
      console.error("player-merges list error:", error);
      res.status(500).json({ error: "Failed to load merge history" });
    }
  });

  // Game History endpoint
  app.get("/api/game-history/:sessionId?", async (req, res) => {
    try {
      const sessionId = req.params.sessionId;

      const games = sessionId
        ? await db.select().from(gameResults).where(eq(gameResults.sessionId, sessionId)).orderBy(desc(gameResults.createdAt))
        : await db.select().from(gameResults).where(sql`${gameResults.sessionId} IN (SELECT id FROM sessions WHERE is_sandbox = false)`).orderBy(desc(gameResults.createdAt));

      if (games.length === 0) return res.json([]);

      const gameIds = games.map(g => g.id);

      // Single batch query for all participants
      const allParticipants = await db
        .select()
        .from(gameParticipants)
        .where(inArray(gameParticipants.gameId, gameIds));

      // Single batch query for all players referenced
      const playerIds = [...new Set(allParticipants.map(p => p.playerId))];
      const allPlayers = playerIds.length > 0
        ? await db.select().from(players).where(inArray(players.id, playerIds))
        : [];
      const playerMap = new Map(allPlayers.map(p => [p.id, p]));

      // Group participants by gameId
      const participantsByGame = new Map<string, typeof allParticipants>();
      for (const p of allParticipants) {
        if (!participantsByGame.has(p.gameId)) participantsByGame.set(p.gameId, []);
        participantsByGame.get(p.gameId)!.push(p);
      }

      const gamesWithDetails = games.map(game => ({
        ...game,
        participants: (participantsByGame.get(game.id) || []).map(p => ({
          ...p,
          playerName: playerMap.get(p.playerId)?.name || 'Unknown',
          playerLevel: playerMap.get(p.playerId)?.level || 'Unknown',
        })),
      }));

      res.json(gamesWithDetails);
    } catch (error) {
      console.error('Game history error:', error);
      res.status(500).json({ error: "Failed to fetch game history" });
    }
  });

  // ── Player Personality Tags ────────────────────────────────────────────────

  // GET /api/tags/game/:gameResultId/participants – participants for a game
  app.get("/api/tags/game/:gameResultId/participants", async (req, res) => {
    try {
      const info = await storage.getGameParticipantInfo(req.params.gameResultId);
      res.json(info);
    } catch {
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  // GET /api/tags – list all active tags (flat array for frontend grouping)
  app.get("/api/tags", async (_req, res) => {
    try {
      const allTags = await storage.getAllTags();
      res.json(allTags);
    } catch {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // GET /api/tags/trending – top tags in last 7 days
  app.get("/api/tags/trending", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 5;
      const trending = await storage.getTrendingTags(limit);
      res.json(trending);
    } catch {
      res.status(500).json({ error: "Failed to fetch trending tags" });
    }
  });

  // GET /api/tags/player/:playerId – top tags for a specific player
  app.get("/api/tags/player/:playerId", async (req, res) => {
    try {
      const { playerId } = req.params;
      const limit = Number(req.query.limit) || 3;
      const topTags = await storage.getPlayerTopTags(playerId, limit);
      res.json(topTags);
    } catch {
      res.status(500).json({ error: "Failed to fetch player tags" });
    }
  });

  // GET /api/tags/players/top-tags – single top tag per player (bulk, for rankings)
  app.get("/api/tags/players/top-tags", async (_req, res) => {
    try {
      const result = await storage.getAllPlayersTopTag();
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to fetch player top tags" });
    }
  });

  // GET /api/tags/community-spotlight – trending tags + top player per tag (for homepage)
  app.get("/api/tags/community-spotlight", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 5;
      const result = await storage.getCommunitySpotlight(limit);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to fetch community spotlight" });
    }
  });

  // GET /api/tags/received/recent – last N tags received by the authenticated player
  app.get("/api/tags/received/recent", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const limit = Number(req.query.limit) || 5;
      const result = await storage.getRecentReceivedTags(mpUser.linkedPlayerId, limit);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to fetch received tags" });
    }
  });

  // GET /api/tags/:tagId/players – players tagged with a specific tag
  app.get("/api/tags/:tagId/players", async (req, res) => {
    try {
      const { tagId } = req.params;
      const limit = Number(req.query.limit) || 10;
      const tagged = await storage.getPlayersWithTag(tagId, limit);
      res.json(tagged);
    } catch {
      res.status(500).json({ error: "Failed to fetch players with tag" });
    }
  });

  // GET /api/tags/game/:gameResultId/mine – tags already submitted by the caller for a game
  app.get("/api/tags/game/:gameResultId/mine", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const existing = await storage.getPlayerTagsForGame(req.params.gameResultId, mpUser.linkedPlayerId);
      res.json(existing);
    } catch {
      res.status(500).json({ error: "Failed to fetch tags for game" });
    }
  });

  // GET /api/tags/tagged-games – game IDs the caller has already tagged (requires marketplace auth)
  app.get("/api/tags/tagged-games", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const gameIds = await storage.getTaggedGameIds(mpUser.linkedPlayerId);
      res.json(gameIds);
    } catch {
      res.status(500).json({ error: "Failed to fetch tagged game IDs" });
    }
  });

  // POST /api/tags/game/:gameResultId – submit tags for teammates in a game
  app.post("/api/tags/game/:gameResultId", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.status(403).json({ error: "Link your player profile first" });

      const { gameResultId } = req.params;
      const schema = z.object({
        tags: z.array(z.object({ targetPlayerId: z.string(), tagId: z.string() })).min(1).max(8),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

      const callerId = mpUser.linkedPlayerId;

      // Validate: caller must be a participant in this game
      const participants = await storage.getGameParticipantInfo(gameResultId);
      if (participants.length === 0) return res.status(400).json({ error: "Game not found" });

      // Enforce 30-day tagging window
      const [gameRow] = await db.select({ createdAt: gameResults.createdAt, sessionId: gameResults.sessionId }).from(gameResults).where(eq(gameResults.id, gameResultId));
      if (gameRow) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (gameRow.createdAt < thirtyDaysAgo) {
          return res.status(400).json({ error: "Tagging window has closed (30 days after the game)" });
        }
      }
      if (!participants.some(p => p.id === callerId)) {
        return res.status(403).json({ error: "You were not in this game" });
      }

      const participantIds = new Set(participants.map(p => p.id));

      // Validate all tag IDs exist in the catalog
      const requestedTagIds = [...new Set(parsed.data.tags.map(t => t.tagId))];
      const validTagRows = await db.select({ id: tags.id, label: tags.label }).from(tags).where(inArray(tags.id, requestedTagIds));
      const validTagIds = new Set(validTagRows.map(r => r.id));
      const invalidTagId = requestedTagIds.find(id => !validTagIds.has(id));
      if (invalidTagId) return res.status(400).json({ error: `Unknown tag: ${invalidTagId}` });

      // Anti-abuse: validate each entry strictly
      const existingTags = await storage.getPlayerTagsForGame(gameResultId, callerId);
      const existingTargetCounts: Record<string, number> = {};
      for (const et of existingTags) {
        existingTargetCounts[et.taggedPlayerId] = (existingTargetCounts[et.taggedPlayerId] || 0) + 1;
      }

      // Check for self-tagging
      const selfTag = parsed.data.tags.find(t => t.targetPlayerId === callerId);
      if (selfTag) return res.status(400).json({ error: "You cannot tag yourself" });

      // Check all targets are valid game participants
      const invalidTarget = parsed.data.tags.find(t => !participantIds.has(t.targetPlayerId));
      if (invalidTarget) return res.status(400).json({ error: `Player ${invalidTarget.targetPlayerId} was not in this game` });

      // Check max 2 tags per target across new submission (count new tags per target)
      const newTargetCounts: Record<string, number> = {};
      for (const t of parsed.data.tags) {
        newTargetCounts[t.targetPlayerId] = (newTargetCounts[t.targetPlayerId] || 0) + 1;
      }
      for (const [targetId, newCount] of Object.entries(newTargetCounts)) {
        const existing = existingTargetCounts[targetId] || 0;
        if (existing + newCount > 2) {
          return res.status(409).json({ error: `Maximum 2 tags per player per game (player ${targetId})` });
        }
      }

      // Check exact duplicate tag+target for existing records
      for (const t of parsed.data.tags) {
        const dup = existingTags.find(et => et.taggedPlayerId === t.targetPlayerId && et.tagId === t.tagId);
        if (dup) return res.status(409).json({ error: "Duplicate tag: you already gave this tag to this player in this game" });
      }

      // Check duplicates within this submission (same target+tag twice)
      const submissionKeys = parsed.data.tags.map(t => `${t.targetPlayerId}:${t.tagId}`);
      if (new Set(submissionKeys).size !== submissionKeys.length) {
        return res.status(409).json({ error: "Duplicate tag in submission" });
      }

      const entries = parsed.data.tags.map(t => ({
        taggedPlayerId: t.targetPlayerId,
        taggedByPlayerId: callerId,
        tagId: t.tagId,
        gameResultId,
      }));

      const created = await storage.createPlayerTags(entries);

      // Feed events (Gate F2) + feed_tag notifications (Gate F4) — guarded so
      // a feed/notification failure never fails the tag submission itself.
      // Sandbox games emit nothing.
      try {
        const [sess] = gameRow?.sessionId
          ? await db.select({ isSandbox: sessions.isSandbox }).from(sessions).where(eq(sessions.id, gameRow.sessionId))
          : [];
        const isSandbox = sess?.isSandbox ?? false;
        const nameById = new Map(participants.map(p => [p.id, p.name]));
        const labelById = new Map(validTagRows.map(r => [r.id, r.label]));
        const giverName = nameById.get(callerId) ?? "A teammate";
        await insertFeedEvents(db, buildTagFeedEvents({
          gameResultId,
          sessionId: gameRow?.sessionId ?? null,
          isSandbox,
          entries: entries.map(e => ({
            receiverId: e.taggedPlayerId,
            receiverName: nameById.get(e.taggedPlayerId) ?? "A player",
            giverId: callerId,
            giverName,
            tagId: e.tagId,
            tagLabel: labelById.get(e.tagId) ?? e.tagId,
          })),
        }));

        // feed_tag: tell each receiver with a marketplace account. The tag
        // endpoint already 409s duplicates, so this fires once per real tag.
        if (!isSandbox) {
          const receiverIds = Array.from(new Set(entries.map(e => e.taggedPlayerId)));
          const receiverUsers = await db.select({ id: marketplaceUsers.id, linkedPlayerId: marketplaceUsers.linkedPlayerId })
            .from(marketplaceUsers).where(inArray(marketplaceUsers.linkedPlayerId, receiverIds));
          const userByPlayer = new Map(receiverUsers.map(u => [u.linkedPlayerId, u]));
          for (const e of entries) {
            const u = userByPlayer.get(e.taggedPlayerId);
            if (!u) continue;
            await storage.createMarketplaceNotification({
              userId: u.id,
              type: "feed_tag",
              title: "You earned a tag",
              message: `${giverName} tagged you "${labelById.get(e.tagId) ?? e.tagId}"`,
            });
          }
        }
      } catch (feedErr) {
        console.error("[FeedEvents] tag emission failed (tags unaffected):", feedErr instanceof Error ? feedErr.message : feedErr);
      }

      // Build enriched tagCounts: get cumulative count for each exact submitted player+tag pair
      const submittedPairs = entries.map(e => ({ playerId: e.taggedPlayerId, tagId: e.tagId }));
      const targetPlayerIds = [...new Set(entries.map(e => e.taggedPlayerId))];
      const submittedTagIds = [...new Set(entries.map(e => e.tagId))];
      const rawCounts = await storage.getTagCountsForTargets(targetPlayerIds, submittedTagIds);
      // Filter to exact submitted pairs only
      const pairKeys = new Set(submittedPairs.map(p => `${p.playerId}:${p.tagId}`));
      const tagCounts = rawCounts.filter(c => pairKeys.has(`${c.playerId}:${c.tagId}`));

      res.status(201).json({ created: created.length, tagCounts });
    } catch (err) {
      console.error("Tag submission error:", err);
      res.status(500).json({ error: "Failed to submit tags" });
    }
  });

  // DELETE /api/admin/player-tags/:id – remove a specific player tag assignment (admin only)
  app.delete("/api/admin/player-tags/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const deleted = await db.delete(playerTags).where(eq(playerTags.id, id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Player tag not found" });
      res.json({ deleted: deleted[0] });
    } catch (err) {
      console.error("Delete player tag error:", err);
      res.status(500).json({ error: "Failed to delete player tag" });
    }
  });

  // DELETE /api/admin/tags/:id – remove a tag definition and all its assignments (admin only)
  app.delete("/api/admin/tags/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const deletedAssignments = await db.delete(playerTags).where(eq(playerTags.tagId, id)).returning();
      const deletedTag = await db.delete(tags).where(eq(tags.id, id)).returning();
      if (deletedTag.length === 0) return res.status(404).json({ error: "Tag not found" });
      res.json({ deletedTag: deletedTag[0], deletedAssignments: deletedAssignments.length });
    } catch (err) {
      console.error("Delete tag error:", err);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // ============================================================
  // TAG SUGGESTIONS
  // ============================================================

  // POST /api/tags/suggestions – submit a new tag suggestion (marketplace auth required)
  app.post("/api/tags/suggestions", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) {
        return res.status(403).json({ error: "Link your player profile first" });
      }

      const schema = insertTagSuggestionSchema.extend({
        category: z.enum(['playing_style', 'social', 'reputation']),
        label: z.string().min(2).max(20),
        emoji: z.string().refine(
          (val) => {
            // Must be exactly one grapheme cluster (one emoji)
            const segments = [...new Intl.Segmenter().segment(val)];
            return segments.length === 1;
          },
          { message: "Emoji must be a single character" }
        ),
        reason: z.string().max(200).optional(),
      });

      const parsed = schema.safeParse({ ...req.body, suggestedByPlayerId: mpUser.linkedPlayerId });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid suggestion data", details: parsed.error.flatten() });
      }

      // Prevent duplicate label globally (case-insensitive, any status)
      const existing = await db
        .select({ id: tagSuggestions.id })
        .from(tagSuggestions)
        .where(sql`LOWER(${tagSuggestions.label}) = LOWER(${parsed.data.label})`);
      if (existing.length > 0) {
        return res.status(409).json({ error: "A tag suggestion with this label already exists" });
      }

      // Prevent the same player from suggesting a similar tag again (case-insensitive, any status)
      const playerExisting = await db
        .select({ id: tagSuggestions.id })
        .from(tagSuggestions)
        .where(
          and(
            eq(tagSuggestions.suggestedByPlayerId, mpUser.linkedPlayerId),
            sql`LOWER(${tagSuggestions.label}) = LOWER(${parsed.data.label})`
          )
        );
      if (playerExisting.length > 0) {
        return res.status(409).json({ error: "You have already suggested a tag with this name" });
      }

      const suggestion = await storage.createTagSuggestion(parsed.data);
      res.status(201).json(suggestion);
    } catch (err) {
      console.error("Tag suggestion create error:", err);
      res.status(500).json({ error: "Failed to create suggestion" });
    }
  });

  // GET /api/tags/suggestions/my – suggestions submitted by the authenticated player
  app.get("/api/tags/suggestions/my", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const suggestions = await storage.getTagSuggestionsByPlayer(mpUser.linkedPlayerId);
      res.json(suggestions);
    } catch {
      res.status(500).json({ error: "Failed to fetch your suggestions" });
    }
  });

  // GET /api/tags/suggestions – get pending suggestions (public; includes hasVoted if authenticated)
  app.get("/api/tags/suggestions", async (req: AuthRequest, res) => {
    try {
      let viewerPlayerId: string | undefined;
      // Optionally identify viewer for hasVoted flag (no auth required)
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const jwt = await import('jsonwebtoken');
          const token = authHeader.slice(7);
          const decoded = jwt.default.verify(token, process.env.JWT_SECRET!) as { userId?: string };
          if (decoded?.userId) {
            const mpUser = await storage.getMarketplaceUser(decoded.userId);
            viewerPlayerId = mpUser?.linkedPlayerId ?? undefined;
          }
        } catch {
          // Ignore auth errors — serve public list without hasVoted
        }
      }
      const suggestions = await storage.getTagSuggestions('pending', viewerPlayerId);
      res.json(suggestions);
    } catch {
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // POST /api/tags/suggestions/:id/vote – upvote a suggestion
  app.post("/api/tags/suggestions/:id/vote", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) {
        return res.status(403).json({ error: "Link your player profile first" });
      }
      const result = await storage.voteTagSuggestion(req.params.id, mpUser.linkedPlayerId);
      if (result.ownSuggestion) {
        return res.status(403).json({ error: "Cannot vote on your own suggestion" });
      }
      if (result.notPending) {
        return res.status(409).json({ error: "Suggestion is no longer pending" });
      }
      if (result.alreadyVoted) {
        return res.status(409).json({ error: "Already voted", newCount: result.newCount });
      }
      res.json({ success: true, newCount: result.newCount });
    } catch {
      res.status(500).json({ error: "Failed to vote" });
    }
  });

  // DELETE /api/tags/suggestions/:id/vote – unvote a suggestion
  app.delete("/api/tags/suggestions/:id/vote", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) {
        return res.status(403).json({ error: "Link your player profile first" });
      }
      const { newCount } = await storage.unvoteTagSuggestion(req.params.id, mpUser.linkedPlayerId);
      res.json({ success: true, newCount });
    } catch {
      res.status(500).json({ error: "Failed to remove vote" });
    }
  });

  // GET /api/admin/tags/suggestions – admin: list suggestions by status
  app.get("/api/admin/tags/suggestions", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const status = (req.query.status as 'pending' | 'approved' | 'rejected') || 'pending';
      const suggestions = await storage.getTagSuggestions(status);
      res.json(suggestions);
    } catch {
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // POST /api/admin/tags/suggestions/:id/approve – admin: approve suggestion
  app.post("/api/admin/tags/suggestions/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { adminNote } = req.body;
      const updated = await storage.reviewTagSuggestion(req.params.id, 'approved', adminNote);
      if (!updated) return res.status(404).json({ error: "Suggestion not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to approve suggestion" });
    }
  });

  // POST /api/admin/tags/suggestions/:id/reject – admin: reject suggestion
  app.post("/api/admin/tags/suggestions/:id/reject", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { adminNote } = req.body;
      const updated = await storage.reviewTagSuggestion(req.params.id, 'rejected', adminNote);
      if (!updated) return res.status(404).json({ error: "Suggestion not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to reject suggestion" });
    }
  });

  // ─── Admin tag-suggestion alias routes (canonical path) ──────────────────────
  // GET /api/admin/tag-suggestions – alias for /api/admin/tags/suggestions
  app.get("/api/admin/tag-suggestions", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const status = (req.query.status as 'pending' | 'approved' | 'rejected') || 'pending';
      const suggestions = await storage.getTagSuggestions(status);
      res.json(suggestions);
    } catch {
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // POST /api/admin/tag-suggestions/:id/approve – alias
  app.post("/api/admin/tag-suggestions/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { adminNote } = req.body;
      const updated = await storage.reviewTagSuggestion(req.params.id, 'approved', adminNote);
      if (!updated) return res.status(404).json({ error: "Suggestion not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to approve suggestion" });
    }
  });

  // POST /api/admin/tag-suggestions/:id/reject – alias
  app.post("/api/admin/tag-suggestions/:id/reject", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { adminNote } = req.body;
      const updated = await storage.reviewTagSuggestion(req.params.id, 'rejected', adminNote);
      if (!updated) return res.status(404).json({ error: "Suggestion not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to reject suggestion" });
    }
  });

  // ============================================================
  // ADMIN DATA EXPORT ENDPOINTS
  // ============================================================

  function csvEscape(val: unknown): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCsv(headers: string[], rows: unknown[][]): string {
    const header = headers.map(csvEscape).join(',');
    const body = rows.map(row => row.map(csvEscape).join(',')).join('\n');
    return header + '\n' + body;
  }

  function sendCsv(res: import('express').Response, filename: string, csv: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // GET /api/admin/export/matches.csv
  app.get("/api/admin/export/matches.csv", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allResults = await db.select().from(gameResults).orderBy(asc(gameResults.createdAt));
      const allParticipants = await db.select().from(gameParticipants);

      const participantsByGame = new Map<string, typeof allParticipants>();
      for (const p of allParticipants) {
        if (!participantsByGame.has(p.gameId)) participantsByGame.set(p.gameId, []);
        participantsByGame.get(p.gameId)!.push(p);
      }

      const headers = [
        'match_id', 'match_date', 'session_id', 'court_id',
        'team1_player1_id', 'team1_player2_id',
        'team2_player1_id', 'team2_player2_id',
        'team1_score', 'team2_score', 'winning_team',
      ];

      const rows = allResults.map(r => {
        const participants = participantsByGame.get(r.id) ?? [];
        const team1 = participants.filter(p => p.team === 1);
        const team2 = participants.filter(p => p.team === 2);
        return [
          r.id,
          r.createdAt.toISOString(),
          r.sessionId,
          r.courtId,
          team1[0]?.playerId ?? '',
          team1[1]?.playerId ?? '',
          team2[0]?.playerId ?? '',
          team2[1]?.playerId ?? '',
          r.team1Score,
          r.team2Score,
          r.winningTeam,
        ];
      });

      sendCsv(res, 'matches.csv', buildCsv(headers, rows));
    } catch (error) {
      console.error('Export matches error:', error);
      res.status(500).json({ error: 'Failed to export matches' });
    }
  });

  // GET /api/admin/export/players.csv
  app.get("/api/admin/export/players.csv", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allPlayers = await db.select().from(players).orderBy(asc(players.name));

      const headers = [
        'player_id', 'shuttle_iq_id', 'display_name', 'gender',
        'current_score', 'current_tier', 'total_games_played', 'wins',
        'created_at', 'last_played_at',
      ];

      const rows = allPlayers.map(p => [
        p.id,
        p.shuttleIqId ?? '',
        p.name,
        p.gender,
        p.skillScore,
        p.level,
        p.gamesPlayed,
        p.wins,
        p.createdAt.toISOString(),
        p.lastPlayedAt ? p.lastPlayedAt.toISOString() : '',
      ]);

      sendCsv(res, 'players.csv', buildCsv(headers, rows));
    } catch (error) {
      console.error('Export players error:', error);
      res.status(500).json({ error: 'Failed to export players' });
    }
  });

  // GET /api/admin/export/score-history.csv
  app.get("/api/admin/export/score-history.csv", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allParticipants = await db.select().from(gameParticipants);
      const allResults = await db.select().from(gameResults).orderBy(asc(gameResults.createdAt));

      const gameResultMap = new Map(allResults.map(r => [r.id, r]));

      // Group participants by gameId for opponent avg calculation
      const participantsByGame = new Map<string, typeof allParticipants>();
      for (const p of allParticipants) {
        if (!participantsByGame.has(p.gameId)) participantsByGame.set(p.gameId, []);
        participantsByGame.get(p.gameId)!.push(p);
      }

      const headers = [
        'player_id', 'match_id', 'match_date', 'session_id',
        'player_team', 'score_before', 'score_after', 'score_delta',
        'opponent_team_avg_score_before',
      ];

      const rows: unknown[][] = [];
      for (const p of allParticipants) {
        const gameResult = gameResultMap.get(p.gameId);
        if (!gameResult) continue;

        const gameParts = participantsByGame.get(p.gameId) ?? [];
        const opponentTeam = p.team === 1 ? 2 : 1;
        const opponentParts = gameParts.filter(op => op.team === opponentTeam);
        const opponentAvg = opponentParts.length > 0
          ? opponentParts.reduce((sum, op) => sum + op.skillScoreBefore, 0) / opponentParts.length
          : null;

        rows.push([
          p.playerId,
          p.gameId,
          gameResult.createdAt.toISOString(),
          gameResult.sessionId,
          p.team,
          p.skillScoreBefore,
          p.skillScoreAfter,
          p.skillScoreAfter - p.skillScoreBefore,
          opponentAvg !== null ? opponentAvg.toFixed(2) : '',
        ]);
      }

      // Sort rows by match_date then player_id for consistency
      rows.sort((a, b) => {
        const dateA = String(a[2]);
        const dateB = String(b[2]);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        const idA = String(a[0]);
        const idB = String(b[0]);
        if (idA < idB) return -1;
        if (idA > idB) return 1;
        return 0;
      });

      sendCsv(res, 'score-history.csv', buildCsv(headers, rows));
    } catch (error) {
      console.error('Export score-history error:', error);
      res.status(500).json({ error: 'Failed to export score history' });
    }
  });

  // GET /api/admin/export/sessions.csv
  app.get("/api/admin/export/sessions.csv", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allSessions = await db.select().from(sessions).orderBy(asc(sessions.createdAt));

      const headers = [
        'session_id', 'session_date', 'venue_name', 'venue_location',
        'court_count', 'status', 'created_at', 'ended_at',
      ];

      const rows = allSessions.map(s => [
        s.id,
        s.date.toISOString(),
        s.venueName,
        s.venueLocation ?? '',
        s.courtCount,
        s.status,
        s.createdAt.toISOString(),
        s.endedAt ? s.endedAt.toISOString() : '',
      ]);

      sendCsv(res, 'sessions.csv', buildCsv(headers, rows));
    } catch (error) {
      console.error('Export sessions error:', error);
      res.status(500).json({ error: 'Failed to export sessions' });
    }
  });

  // ─── Blog routes ───────────────────────────────────────────────────────────────

  // Public: list published blog posts
  app.get('/api/blog', async (_req, res) => {
    try {
      const posts = await storage.getAllBlogPosts(false);
      res.json(posts);
    } catch (error: unknown) {
      console.error('Error fetching blog posts:', error);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
  });

  // Public: get single published post by slug
  app.get('/api/blog/:slug', async (req, res) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      if (!post || post.status !== 'published') {
        return res.status(404).json({ error: 'Post not found' });
      }
      res.json(post);
    } catch (error: unknown) {
      console.error('Error fetching blog post:', error);
      res.status(500).json({ error: 'Failed to fetch blog post' });
    }
  });

  // Admin: list all blog posts (including drafts)
  // Gate FV: root comes from uploadsRoot (UPLOADS_DIR env on Railway → the
  // mounted volume; local default unchanged). Tree is created at import time.
  const uploadsDir = BLOG_UPLOADS_DIR;

  const blogImageStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const blogImageUpload = multer({
    storage: blogImageStorage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
      }
    },
  });

  app.post('/api/admin/blog/upload-image', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    blogImageUpload.single('image')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      const url = `/uploads/blog/${req.file.filename}`;
      res.json({ url });
    });
  });

  app.get('/api/admin/blog', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const posts = await storage.getAllBlogPosts(true);
      res.json(posts);
    } catch (error: unknown) {
      console.error('Error fetching admin blog posts:', error);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
  });

  // Admin: get single blog post by ID
  app.get('/api/admin/blog/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const post = await storage.getBlogPost(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json(post);
    } catch (error: unknown) {
      console.error('Error fetching blog post:', error);
      res.status(500).json({ error: 'Failed to fetch blog post' });
    }
  });

  // Admin: create blog post
  app.post('/api/admin/blog', requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = insertBlogPostSchema.parse(req.body);
      if (data.slug) {
        data.slug = data.slug.replace(/^\/+/, '');
      }
      if (data.status === 'published' && !data.publishedAt) {
        data.publishedAt = new Date();
      }
      const post = await storage.createBlogPost(data);
      res.status(201).json(post);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Error creating blog post:', error);
      res.status(500).json({ error: 'Failed to create blog post' });
    }
  });

  // Admin: update blog post
  const updateBlogPostSchema = insertBlogPostSchema.partial();
  app.patch('/api/admin/blog/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getBlogPost(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Post not found' });
      const parsed = updateBlogPostSchema.parse(req.body);
      if (parsed.slug) {
        parsed.slug = parsed.slug.replace(/^\/+/, '');
      }
      if (parsed.status === 'published' && existing.status !== 'published' && !parsed.publishedAt && !existing.publishedAt) {
        parsed.publishedAt = new Date();
      }
      const post = await storage.updateBlogPost(req.params.id, parsed);
      res.json(post);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Error updating blog post:', error);
      res.status(500).json({ error: 'Failed to update blog post' });
    }
  });

  // Admin: delete blog post
  app.delete('/api/admin/blog/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteBlogPost(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Post not found' });
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Error deleting blog post:', error);
      res.status(500).json({ error: 'Failed to delete blog post' });
    }
  });

  // ============================================================
  // REFERRAL SYSTEM
  // ============================================================

  app.get('/api/referrals/validate/:code', async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const player = await storage.getPlayerByReferralCode(code);
      if (!player) {
        return res.status(404).json({ valid: false, error: 'Invalid referral code' });
      }
      res.json({ valid: true, referrerName: player.name, referrerId: player.id });
    } catch (error: unknown) {
      console.error('Error validating referral code:', error);
      res.status(500).json({ error: 'Failed to validate referral code' });
    }
  });

  // Post-signup referral linking (PR4). Thin wrapper over linkReferralPostSignup
  // which owns the rules: one referral per user, 30-day window, no self-referral,
  // and decision-E backfill (fires the credit now if a confirmed booking already
  // exists). Both the Dashboard nudge and the Profile field POST here.
  app.post('/api/referrals/link', requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const schema = z.object({ referralCode: z.string().min(1) });
      const { referralCode } = schema.parse(req.body);

      const outcome = await linkReferralPostSignup({ userId: req.user.userId, referralCode });

      if (!outcome.ok) {
        const map: Record<typeof outcome.code, { status: number; error: string }> = {
          ALREADY_LINKED: { status: 409, error: 'You have already used a referral code' },
          WINDOW_CLOSED: { status: 403, error: 'The 30-day referral window has closed' },
          INVALID_CODE: { status: 404, error: 'Invalid referral code' },
          SELF_REFERRAL: { status: 400, error: 'You cannot refer yourself' },
          USER_NOT_FOUND: { status: 404, error: 'User not found' },
        };
        const mapped = map[outcome.code];
        return res.status(mapped.status).json({ error: mapped.error, code: outcome.code });
      }

      res.json({
        success: true,
        referralId: outcome.referralId,
        backfilled: outcome.backfilled,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('Error linking referral:', error);
      res.status(500).json({ error: 'Failed to link referral' });
    }
  });

  app.get('/api/referrals/player/:playerId', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const { playerId } = req.params;

      const isAdmin = req.user.role === 'admin';
      if (!isAdmin) {
        const user = await storage.getMarketplaceUser(req.user.userId);
        if (!user?.linkedPlayerId || user.linkedPlayerId !== playerId) {
          return res.status(403).json({ error: 'You can only view your own referral data' });
        }
      }

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const referralsList = await storage.getReferralsByReferrerId(playerId);
      const completedCount = await storage.getCompletedReferralCount(playerId);

      res.json({
        referralCode: player.referralCode,
        walletBalance: player.walletBalance,
        ambassadorStatus: player.ambassadorStatus,
        jerseyDispatched: player.jerseyDispatched,
        leaderboardMention: player.leaderboardMention,
        completedCount,
        referrals: referralsList,
      });
    } catch (error: unknown) {
      console.error('Error getting player referral data:', error);
      res.status(500).json({ error: 'Failed to get referral data' });
    }
  });

  app.get('/api/referrals/leaderboard', async (_req, res) => {
    try {
      const leaderboard = await storage.getReferralLeaderboard(10);
      res.json(leaderboard);
    } catch (error: unknown) {
      console.error('Error getting referral leaderboard:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  app.get('/api/referrals/all', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const all = await storage.getAllReferrals();
      res.json(all);
    } catch (error: unknown) {
      console.error('Error getting all referrals:', error);
      res.status(500).json({ error: 'Failed to get referrals' });
    }
  });

  app.patch('/api/referrals/:id/jersey-dispatched', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const referral = await storage.getReferral(req.params.id);
      if (!referral) return res.status(404).json({ error: 'Referral not found' });

      const player = await storage.getPlayer(referral.referrerId);
      if (!player) return res.status(404).json({ error: 'Referrer player not found' });

      await storage.updatePlayer(player.id, { jerseyDispatched: true });
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Error marking jersey dispatched:', error);
      res.status(500).json({ error: 'Failed to mark jersey dispatched' });
    }
  });

  app.post('/api/referrals/:id/complete', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // Optional: tie the completion to the real qualifying booking (must be
      // the referee's own booking) so the ledger and any future clawback of
      // that booking stay truthful.
      let triggeringBookingId: string | null = null;
      const rawBookingId = (req.body?.triggeringBookingId ?? '').toString();
      if (rawBookingId) {
        const referral = await storage.getReferral(req.params.id);
        const booking = await storage.getBooking(rawBookingId);
        if (!referral || !booking || booking.userId !== referral.refereeUserId) {
          return res.status(400).json({ error: 'triggeringBookingId must be a booking of the referee' });
        }
        triggeringBookingId = booking.id;
      }
      const result = await completeReferral(req.params.id, triggeringBookingId);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      console.error('Error completing referral:', error);
      res.status(500).json({ error: 'Failed to complete referral' });
    }
  });

  app.post('/api/referrals/apply-wallet', requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

      const walletSchema = z.object({
        bookingAmountFils: z.number().int().positive(),
        bookingId: z.string().min(1),
      });
      const { bookingAmountFils, bookingId } = walletSchema.parse(req.body);

      const booking = await storage.getBooking(bookingId);
      if (!booking || booking.userId !== req.user.userId) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      // Idempotency: if wallet was already applied to this booking, return current state
      if (booking.walletAmountUsed && booking.walletAmountUsed > 0) {
        return res.json({ walletApplied: booking.walletAmountUsed, remainingToPay: bookingAmountFils - booking.walletAmountUsed });
      }

      const user = await storage.getMarketplaceUser(req.user.userId);
      if (!user?.linkedPlayerId) {
        return res.status(400).json({ error: 'No linked player account. Link your player profile first.' });
      }

      const player = await storage.getPlayer(user.linkedPlayerId);
      if (!player || player.walletBalance <= 0) {
        return res.json({ walletApplied: 0, remainingToPay: bookingAmountFils });
      }

      const walletApplied = Math.min(player.walletBalance, bookingAmountFils);
      const remainingToPay = bookingAmountFils - walletApplied;

      // Ledger site #3 (booking_payment): atomic deduction + ledger row in one
      // transaction; the never-below-zero guard lives in applyWalletDelta.
      const deltaResult = await db.transaction(async (tx) =>
        applyWalletDelta(tx, {
          playerId: player.id,
          deltaFils: -walletApplied,
          type: 'booking_payment',
          relatedBookingId: bookingId,
          description: 'Wallet credit applied at checkout',
          createdBy: 'player',
        }),
      );

      if (!deltaResult) {
        return res.status(409).json({ error: 'Wallet balance changed. Please try again.' });
      }

      // Record wallet usage on the booking for idempotency and tracking
      await storage.updateBooking(bookingId, { walletAmountUsed: walletApplied });

      res.json({ walletApplied, remainingToPay });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error('Error applying wallet:', error);
      res.status(500).json({ error: 'Failed to apply wallet credit' });
    }
  });

  // Backfill referral codes on startup (idempotent — skips players who already have codes)
  storage.backfillReferralCodes().then(count => {
    if (count > 0) console.log(`[Referral] Backfilled ${count} referral codes`);
  }).catch(err => {
    console.error('[Referral] Backfill failed:', err);
  });

  const httpServer = createServer(app);
  return httpServer;
}
