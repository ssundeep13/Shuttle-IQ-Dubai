import type { Express } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendBookingConfirmationEmail,
  sendWaitlistPromotionEmail,
  sendCancellationEmail,
  sendDisputeResolutionEmail,
  sendGuestBookingEmail,
} from "./emailClient";
import { requireAuth, requireAdmin, requireMarketplaceAuth, type AuthRequest } from "./auth/middleware";
import {
  generateAccessToken,
  generateRefreshToken,
  comparePassword,
  hashPassword,
  verifyRefreshToken,
} from "./auth/utils";
import { createZiinaPaymentIntent, retrieveZiinaPaymentIntent, isZiinaPaymentSuccessful, registerZiinaWebhook } from "./ziinaClient";
import { confirmZiinaBookingByIntentId } from "./webhookHandler";
import { OAuth2Client } from "google-auth-library";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { players } from "@shared/schema";

export function registerMarketplaceRoutes(app: Express) {
  // ============================================================
  // PUBLIC ANALYTICS (no auth required — aggregated data only)
  // ============================================================

  app.options("/api/public/analytics", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.sendStatus(204);
  });

  app.get("/api/public/analytics", async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    try {
      const { sessionId, from, to } = req.query as Record<string, string>;

      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;

      if (fromDate && isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: "Invalid 'from' date. Use ISO 8601 format (e.g. 2026-03-01)" });
      }
      if (toDate && isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Invalid 'to' date. Use ISO 8601 format (e.g. 2026-04-01)" });
      }

      const data = await storage.getPublicAnalytics({
        sessionId: sessionId || undefined,
        from: fromDate,
        to: toDate,
      });

      res.json(data);
    } catch (error: unknown) {
      console.error("[Public Analytics] Error:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });

  // ============================================================
  // MARKETPLACE AUTH
  // ============================================================

  app.post("/api/marketplace/auth/signup", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
        phone: z.string().min(1, "Phone number is required"),
        referralCode: z.string().optional(),
      });
      const { email, password, name, phone, referralCode } = schema.parse(req.body);

      const existing = await storage.getMarketplaceUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createMarketplaceUser({
        email,
        passwordHash,
        name,
        phone: phone || null,
        linkedPlayerId: null,
        role: "player",
      });

      const payload = { userId: user.id, email: user.email, role: "marketplace_player" };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await storage.createMarketplaceAuthSession(user.id, refreshToken, expiresAt);

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, linkedPlayerId: user.linkedPlayerId },
      });

      // Retroactive guest linking: link any prior guest records with this email to the new user
      storage.linkGuestsByEmail(user.email, user.id).catch(() => {});

      // Handle referral code linking and welcome email (fire-and-forget)
      const marketplaceUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/marketplace`
        : 'http://localhost:5000/marketplace';

      (async () => {
        let referrerName: string | undefined;
        if (referralCode) {
          try {
            const referrer = await storage.getPlayerByReferralCode(referralCode.toUpperCase());
            if (referrer) {
              referrerName = referrer.name;
              const existingRef = await storage.getReferralByRefereeUserId(user.id);
              if (!existingRef) {
                await storage.createReferral({
                  referrerId: referrer.id,
                  refereeUserId: user.id,
                  refereePlayerId: null,
                  status: 'pending',
                });
                console.log(`[Referral] Linked ${user.email} to referrer ${referrer.name} (${referralCode})`);
              }
            }
          } catch (err) {
            console.error('[Referral] Signup link error:', err);
          }
        }
        sendWelcomeEmail(user.email, user.name, marketplaceUrl, referrerName).catch(() => {});
      })();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/marketplace/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const user = await storage.getMarketplaceUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ error: "This account uses Google sign-in. Please use 'Continue with Google'." });
      }
      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateMarketplaceUser(user.id, { lastLoginAt: new Date() });

      const payload = { userId: user.id, email: user.email, role: "marketplace_player" };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await storage.createMarketplaceAuthSession(user.id, refreshToken, expiresAt);

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, linkedPlayerId: user.linkedPlayerId },
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/marketplace/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

      const decoded = verifyRefreshToken(refreshToken);
      if (!decoded) return res.status(401).json({ error: "Invalid refresh token" });

      const session = await storage.findMarketplaceAuthSession(refreshToken);
      if (!session || new Date() > session.expiresAt) {
        return res.status(401).json({ error: "Session expired" });
      }

      const user = await storage.getMarketplaceUser(session.userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      const payload = { userId: user.id, email: user.email, role: "marketplace_player" };
      const newAccessToken = generateAccessToken(payload);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      res.status(500).json({ error: "Token refresh failed" });
    }
  });

  app.get("/api/marketplace/auth/me", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getMarketplaceUser(req.user.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      let linkedPlayer = null;
      if (user.linkedPlayerId) {
        linkedPlayer = await storage.getPlayer(user.linkedPlayerId);
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        linkedPlayerId: user.linkedPlayerId,
        linkedPlayer,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.post("/api/marketplace/auth/logout", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        const session = await storage.findMarketplaceAuthSession(refreshToken);
        if (session) await storage.deleteMarketplaceAuthSession(session.id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // ============================================================
  // PASSWORD RESET
  // ============================================================

  app.post("/api/marketplace/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email required" });

      const user = await storage.getMarketplaceUserByEmail(email.toLowerCase().trim());
      if (user) {
        const token = randomUUID().replace(/-/g, '');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await storage.updateMarketplaceUser(user.id, { resetToken: token, resetTokenExpiry: expiry });

        const host = req.get('host') || 'localhost:5000';
        const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
        const resetUrl = `${protocol}://${host}/marketplace/reset-password?token=${token}`;

        try {
          await sendPasswordResetEmail(user.email, resetUrl);
          console.log(`[Password Reset] Email sent to ${user.email}`);
        } catch (emailErr) {
          console.error(`[Password Reset] Email failed for ${user.email}, token: ${token}`, emailErr);
        }
      }

      // Always return the same response to prevent email enumeration
      res.json({ success: true, message: "If that email is registered, a reset link is on its way." });
    } catch (error) {
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  app.post("/api/marketplace/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: "Token and password required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      // Find user by token
      const user = await storage.getMarketplaceUserByResetToken(token);
      if (!user || !user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
        return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
      }

      const passwordHash = await hashPassword(password);
      await storage.updateMarketplaceUser(user.id, {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      });

      res.json({ success: true, message: "Password updated. You can now log in." });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // ============================================================
  // GOOGLE OAUTH
  // ============================================================

  // The domain registered in Google Cloud Console for the OAuth callback.
  // Always use the *.replit.app domain so the callback URI never changes.
  function getOAuthCanonicalDomain(): string {
    const replitDomains = (process.env.REPLIT_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean);
    return replitDomains.find((d) => d.endsWith('.replit.app')) || replitDomains[0] || '';
  }

  // All domains this deployment serves — used to validate return domains.
  function getAllowedReturnDomains(): string[] {
    const replitDomains = (process.env.REPLIT_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean);
    return [...replitDomains, 'localhost:5000', 'localhost'];
  }

  function getGoogleOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const canonicalDomain = getOAuthCanonicalDomain();
    const redirectUri = canonicalDomain
      ? `https://${canonicalDomain}/api/marketplace/auth/google/callback`
      : 'http://localhost:5000/api/marketplace/auth/google/callback';
    return { client: new OAuth2Client(clientId, clientSecret, redirectUri), redirectUri };
  }

  function isSecureContext(): boolean {
    return !!process.env.REPLIT_DOMAINS || process.env.NODE_ENV === 'production';
  }

  // Strip default ports from a host string so comparisons are reliable
  // e.g. "example.com:443" → "example.com", "localhost:80" → "localhost"
  function normalizeHost(host: string): string {
    return host.replace(/:443$/, '').replace(/:80$/, '');
  }

  app.get("/api/marketplace/auth/google", (req, res) => {
    try {
      const canonicalDomain = getOAuthCanonicalDomain();
      const rawHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
      const currentHost = normalizeHost(rawHost);

      // If the user is not on the canonical OAuth domain, redirect them there first.
      // This ensures the state CSRF cookie is always set on the same domain as the
      // Google callback URI, preventing cross-domain cookie failures.
      if (canonicalDomain && currentHost && currentHost !== canonicalDomain) {
        const allowedDomains = getAllowedReturnDomains();
        const returnDomain = allowedDomains.includes(currentHost) ? currentHost : null;
        const qs = new URLSearchParams();
        if (returnDomain) qs.set('returnDomain', returnDomain);
        const returnPath = (req.query.returnPath as string) || '';
        if (returnPath) qs.set('returnPath', returnPath);
        return res.redirect(`https://${canonicalDomain}/api/marketplace/auth/google?${qs.toString()}`);
      }

      const { client } = getGoogleOAuthClient();
      const state = randomUUID();
      const secure = isSecureContext();
      const cookieOpts = { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: 'lax' as const, secure };

      res.cookie('google_oauth_state', state, cookieOpts);

      // Persist the originating domain and return path so we can redirect
      // the user back to the right place after a successful login.
      const returnDomain = req.query.returnDomain as string | undefined;
      const returnPath = req.query.returnPath as string | undefined;

      if (returnDomain && getAllowedReturnDomains().includes(returnDomain)) {
        res.cookie('oauth_return_domain', returnDomain, cookieOpts);
      }
      if (returnPath && returnPath.startsWith('/marketplace/') && returnPath.length < 300) {
        res.cookie('oauth_return_path', returnPath, cookieOpts);
      }

      const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'email', 'profile'],
        state,
        prompt: 'select_account',
      });
      res.redirect(url);
    } catch (error) {
      console.error('Google OAuth init error:', error);
      res.redirect('/marketplace/login?error=google_failed');
    }
  });

  app.get("/api/marketplace/auth/google/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;

      const secure = isSecureContext();
      const clearOpts = { httpOnly: true, sameSite: 'lax' as const, secure };

      if (oauthError) {
        return res.redirect('/marketplace/login?error=google_failed');
      }

      const storedState = req.cookies?.google_oauth_state;
      if (!storedState || storedState !== state) {
        console.warn('[Google OAuth] State mismatch — possible cookie domain issue or user retried mid-flow');
        return res.redirect('/marketplace/login?error=google_failed');
      }

      // Clear CSRF state cookie
      res.clearCookie('google_oauth_state', clearOpts);

      // Read and clear return-context cookies
      const returnDomain: string | undefined = req.cookies?.oauth_return_domain;
      const returnPath: string | undefined = req.cookies?.oauth_return_path;
      res.clearCookie('oauth_return_domain', clearOpts);
      res.clearCookie('oauth_return_path', clearOpts);

      const { client } = getGoogleOAuthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID!,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.redirect('/marketplace/login?error=google_failed');
      }

      if (!payload.email_verified) {
        console.warn('[Google OAuth] Rejected unverified email:', payload.email);
        return res.redirect('/marketplace/login?error=google_email_unverified');
      }

      const { sub: googleId, email, name: googleName } = payload;
      const displayName = googleName || email.split('@')[0];

      // Look up or create marketplace user
      let user = await storage.getMarketplaceUserByGoogleId(googleId);
      if (!user) {
        user = await storage.getMarketplaceUserByEmail(email);
        if (user) {
          // Existing email/password account — attach Google ID
          await storage.updateMarketplaceUser(user.id, { googleId });
          user = { ...user, googleId };
        } else {
          // Brand new account via Google
          user = await storage.createMarketplaceUser({
            email,
            passwordHash: null,
            name: displayName,
            phone: null,
            linkedPlayerId: null,
            role: 'player',
            googleId,
          });
          // Fire-and-forget welcome email
          const marketplaceUrl = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/marketplace`
            : 'http://localhost:5000/marketplace';
          sendWelcomeEmail(user.email, user.name, marketplaceUrl).catch(() => {});
          // Retroactive guest linking
          storage.linkGuestsByEmail(user.email, user.id).catch(() => {});
        }
      }

      await storage.updateMarketplaceUser(user.id, { lastLoginAt: new Date() });

      const jwtPayload = { userId: user.id, email: user.email, role: 'marketplace_player' };
      const accessToken = generateAccessToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await storage.createMarketplaceAuthSession(user.id, refreshToken, expiresAt);

      const params = new URLSearchParams({ accessToken, refreshToken });
      if (returnPath) params.set('returnPath', returnPath);

      // Redirect back to the originating domain if it differs from canonical
      const allowedDomains = getAllowedReturnDomains();
      if (returnDomain && allowedDomains.includes(returnDomain)) {
        const scheme = returnDomain.startsWith('localhost') ? 'http' : 'https';
        return res.redirect(`${scheme}://${returnDomain}/marketplace/auth/callback?${params.toString()}`);
      }

      res.redirect(`/marketplace/auth/callback?${params.toString()}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/marketplace/login?error=google_failed');
    }
  });

  // ============================================================
  // PLAYER LINKING
  // ============================================================

  app.post("/api/marketplace/link-player", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const { playerId } = req.body;
      if (!playerId) return res.status(400).json({ error: "Player ID required" });

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      await storage.updateMarketplaceUser(req.user.userId, { linkedPlayerId: playerId });
      res.json({ success: true, player });
    } catch (error) {
      res.status(500).json({ error: "Failed to link player" });
    }
  });

  app.get("/api/marketplace/search-players", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) return res.json([]);
      const results = await storage.searchPlayers(query);
      res.json(results.slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        shuttleIqId: p.shuttleIqId,
        level: p.level,
        skillScore: p.skillScore,
      })));
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Unified guest search: marketplace users + SIQ players, deduped
  app.get("/api/marketplace/search-guests", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) return res.json([]);

      // Search marketplace users and SIQ players in parallel
      const [mpUsers, siqPlayers] = await Promise.all([
        storage.searchMarketplaceUsersByName(query),
        storage.searchPlayers(query),
      ]);

      type GuestResult = {
        type: 'marketplace' | 'siq';
        name: string;
        email?: string;
        level?: string | null;
        marketplaceUserId?: string;
        siqPlayerId?: string;
      };

      const results: GuestResult[] = [];
      const usedSiqIds = new Set<string>();

      // Marketplace users first (preferred — email is known)
      for (const u of mpUsers) {
        results.push({
          type: 'marketplace',
          name: u.name,
          email: u.email,
          marketplaceUserId: u.id,
          siqPlayerId: u.linkedPlayerId ?? undefined,
          level: undefined, // resolved below if linked
        });
        if (u.linkedPlayerId) usedSiqIds.add(u.linkedPlayerId);
      }

      // Add level info for marketplace users that are linked to SIQ players.
      // Use name-matched search results first; fall back to direct ID lookup when names differ.
      const missingLevelUserIds = results
        .filter(r => r.siqPlayerId && !siqPlayers.find(p => p.id === r.siqPlayerId))
        .map(r => r.siqPlayerId as string);

      const directPlayerLookups = await Promise.all(
        missingLevelUserIds.map(id => storage.getPlayer(id).catch(() => null))
      );
      const directPlayerMap = new Map(
        directPlayerLookups.filter(Boolean).map((p: any) => [p.id, p])
      );

      for (const r of results) {
        if (r.siqPlayerId) {
          const linked = siqPlayers.find(p => p.id === r.siqPlayerId) ?? directPlayerMap.get(r.siqPlayerId);
          if (linked) r.level = linked.level;
        }
      }

      // SIQ-only players (not already covered by a linked marketplace user)
      for (const p of siqPlayers) {
        if (!usedSiqIds.has(p.id)) {
          results.push({
            type: 'siq',
            name: p.name,
            level: p.level,
            siqPlayerId: p.id,
          });
        }
      }

      res.json(results.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/marketplace/admin/search-players", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) return res.json([]);
      const results = await storage.searchPlayersWithContact(query);
      res.json(results.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Admin link player
  app.post("/api/marketplace/admin/link-player", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { marketplaceUserId, playerId } = req.body;
      if (!marketplaceUserId || !playerId) return res.status(400).json({ error: "Both user ID and player ID required" });

      const user = await storage.getMarketplaceUser(marketplaceUserId);
      if (!user) return res.status(404).json({ error: "Marketplace user not found" });

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      await storage.updateMarketplaceUser(marketplaceUserId, { linkedPlayerId: playerId });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to link player" });
    }
  });

  // Admin endpoint — returns ALL bookable sessions including past ones (for admin management)
  app.get("/api/marketplace/admin/sessions", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const sessions = await storage.getAllBookableSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // ============================================================
  // BOOKABLE SESSIONS
  // ============================================================

  app.get("/api/marketplace/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getUpcomingBookableSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/marketplace/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getBookableSessionWithAvailability(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.patch("/api/marketplace/sessions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const updates = req.body;
      if (updates.date) updates.date = new Date(updates.date);
      const session = await storage.updateBookableSession(req.params.id, updates);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      console.error('Failed to update marketplace session:', error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.patch("/api/marketplace/sessions/:id/link", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { sessionId } = req.body;
      if (sessionId !== null && sessionId !== undefined) {
        const adminSession = await storage.getSession(sessionId);
        if (!adminSession) return res.status(404).json({ error: "Admin session not found" });
        if (adminSession.status !== 'active' && adminSession.status !== 'upcoming') {
          return res.status(400).json({ error: "Can only link to active or upcoming sessions" });
        }
      }
      const updated = await storage.updateBookableSession(req.params.id, {
        linkedSessionId: sessionId || null,
      });
      if (!updated) return res.status(404).json({ error: "Bookable session not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to link session" });
    }
  });

  app.delete("/api/marketplace/sessions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteBookableSession(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Session not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // ============================================================
  // CHECKOUT
  // ============================================================

  app.post("/api/marketplace/bookings", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const { sessionId, paymentMethod, guests: guestList, applyWallet } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Session ID required" });

      // Validate guest list (optional array of { name, email?, marketplaceUserId?, siqPlayerId? })
      const guestSchema = z.array(z.object({
        name: z.string().min(1).max(100),
        email: z.string().email().optional().nullable(),
        marketplaceUserId: z.string().optional().nullable(),
        siqPlayerId: z.string().optional().nullable(),
      })).max(3).optional();
      const parsedGuests = guestSchema.safeParse(guestList);
      if (!parsedGuests.success) return res.status(400).json({ error: "Invalid guest list" });
      const guests = parsedGuests.data ?? [];
      const spotsBooked = 1 + guests.length; // booker + guests

      const method = paymentMethod === 'cash' ? 'cash' : 'ziina';

      const existingBooking = await storage.getUserBookingForSession(req.user.userId, sessionId);
      if (existingBooking) {
        if (existingBooking.status === 'pending') {
          // Check if the Ziina payment already completed before cancelling — avoids a race
          // where the user retries while the first payment is still being processed
          if (existingBooking.ziinaPaymentIntentId) {
            try {
              const ziinaStatus = await retrieveZiinaPaymentIntent(existingBooking.ziinaPaymentIntentId);
              if (isZiinaPaymentSuccessful(ziinaStatus.status)) {
                return res.status(400).json({ error: "Your payment is being processed. Please wait a moment and refresh." });
              }
            } catch (_) {
              // Ziina check failed — proceed with cancellation so user can retry
            }
          }
          // Payment not completed — cancel the stale pending booking and allow retry
          await storage.updateBooking(existingBooking.id, { status: 'cancelled', cancelledAt: new Date() });
        } else if (existingBooking.status !== 'cancelled') {
          return res.status(400).json({ error: "You already have a booking for this session" });
        }
      }

      const bookableSession = await storage.getBookableSessionWithAvailability(sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });
      if (bookableSession.status === "cancelled") return res.status(400).json({ error: "Session is cancelled" });

      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

      // Fetch primary user once — needed for waitlist path too
      const primaryUser = await storage.getMarketplaceUser(req.user.userId);

      // Helper: create per-slot booking_guest rows for ALL spots (primary + extras),
      // making the per-slot model explicit. Primary booker gets isPrimary=true.
      const createAllSlotsForBooking = async (
        bookingId: string,
        slotStatus: 'confirmed' | 'pending' = 'confirmed',
        sendGuestEmails = true,
      ) => {
        // Primary booker slot (no cancellation token — they manage via booking cancel)
        await storage.createBookingGuest({
          bookingId,
          name: primaryUser?.name ?? 'Booker',
          email: primaryUser?.email ?? null,
          linkedUserId: req.user!.userId,
          isPrimary: true,
          status: slotStatus,
          cancellationToken: null,
        });

        // Additional guest slots
        for (const g of guests) {
          const token = randomUUID();
          let linkedUserId: string | null = null;
          let resolvedEmail: string | null = g.email ?? null;

          // Resolve marketplace user by provided ID first — authoritative email wins
          if (g.marketplaceUserId) {
            const mpUser = await storage.getMarketplaceUser(g.marketplaceUserId);
            if (mpUser) {
              linkedUserId = mpUser.id;
              resolvedEmail = mpUser.email || resolvedEmail;
            }
          }

          // Fallback: resolve by email if no marketplace user ID given
          if (!linkedUserId && resolvedEmail) {
            const existingUser = await storage.getMarketplaceUserByEmail(resolvedEmail);
            if (existingUser) linkedUserId = existingUser.id;
          }

          // Fallback: resolve by SIQ player -> linked marketplace user
          if (!linkedUserId && g.siqPlayerId) {
            const mpUserViaSiq = await storage.getMarketplaceUserByLinkedPlayerId(g.siqPlayerId);
            if (mpUserViaSiq) {
              linkedUserId = mpUserViaSiq.id;
              resolvedEmail = mpUserViaSiq.email || resolvedEmail;
            }
          }

          await storage.createBookingGuest({
            bookingId,
            name: g.name,
            email: resolvedEmail,
            linkedUserId,
            isPrimary: false,
            status: slotStatus,
            cancellationToken: token,
          });
          if (sendGuestEmails && slotStatus === 'confirmed' && resolvedEmail && primaryUser) {
            const cancelGuestUrl = `${baseUrl}/marketplace/guests/cancel/${token}`;
            const signupUrl = `${baseUrl}/marketplace/signup?email=${encodeURIComponent(resolvedEmail)}`;
            sendGuestBookingEmail(resolvedEmail, g.name, primaryUser.name, bookableSession, cancelGuestUrl, signupUrl).catch(() => {});
          }
        }
      };

      // Handle waitlist when session is full (or would exceed capacity with all spots)
      if (bookableSession.spotsRemaining < spotsBooked) {
        const waitlistCount = await storage.getWaitlistCountForSession(sessionId);
        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: 'waitlisted',
          paymentMethod: method, // preserve user's chosen payment method for promotion logic
          ziinaPaymentIntentId: null,
          amountAed: bookableSession.priceAed * spotsBooked,
          cashPaid: false,
          waitlistPosition: waitlistCount + 1,
          lateFeeApplied: false,
          spotsBooked,
        });
        // Persist all slot rows even for waitlisted bookings so guest metadata/tokens survive promotion
        await createAllSlotsForBooking(booking.id, 'pending', false);
        return res.json({
          bookingId: booking.id,
          waitlisted: true,
          waitlistPosition: booking.waitlistPosition,
          amount: bookableSession.priceAed * spotsBooked,
          session: {
            title: bookableSession.title,
            venueName: bookableSession.venueName,
            date: bookableSession.date,
            startTime: bookableSession.startTime,
            endTime: bookableSession.endTime,
          },
        });
      }

      if (method === 'cash') {
        const totalAmount = bookableSession.priceAed * spotsBooked;
        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: "confirmed",
          paymentMethod: "cash",
          ziinaPaymentIntentId: null,
          amountAed: totalAmount,
          cashPaid: false,
          spotsBooked,
        });

        // Create all slot rows (primary + guests) in booking_guests
        await createAllSlotsForBooking(booking.id, 'confirmed', true);

        // Notify linked guests (non-primary) of their confirmed spot
        const cashGuests = await storage.getBookingGuests(booking.id);
        for (const g of cashGuests) {
          if (!g.isPrimary && g.linkedUserId) {
            await storage.createMarketplaceNotification({
              userId: g.linkedUserId,
              type: 'guest_booking_confirmed',
              title: 'You have a booking!',
              message: `${primaryUser?.name ?? 'Someone'} added you as a guest for "${bookableSession.title}" on ${new Date(bookableSession.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${bookableSession.venueName}.`,
              relatedBookingId: booking.id,
            });
          }
        }

        // Fire-and-forget booking confirmation email (fully isolated)
        try {
          if (primaryUser) {
            sendBookingConfirmationEmail(primaryUser.email, primaryUser.name, bookableSession, 'cash', totalAmount).catch(() => {});
          }
        } catch (emailErr) { console.error('[Email] cash booking confirm lookup failed:', emailErr); }

        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({
          bookingId: booking.id,
          paymentMethod: "cash",
          amount: totalAmount,
          spotsBooked,
          booking: bookingWithDetails,
          session: {
            title: bookableSession.title,
            venueName: bookableSession.venueName,
            date: bookableSession.date,
            startTime: bookableSession.startTime,
            endTime: bookableSession.endTime,
          },
        });
      }

      const totalAmount = bookableSession.priceAed * spotsBooked;
      const totalAmountFils = totalAmount * 100;

      // Wallet credit check: if user requests wallet application, compute deduction
      let walletAppliedFils = 0;
      if (applyWallet) {
        const walletUser = await storage.getMarketplaceUser(req.user.userId);
        if (walletUser?.linkedPlayerId) {
          const walletPlayer = await storage.getPlayer(walletUser.linkedPlayerId);
          if (walletPlayer && walletPlayer.walletBalance > 0) {
            walletAppliedFils = Math.min(walletPlayer.walletBalance, totalAmountFils);
          }
        }
      }

      const remainingFils = totalAmountFils - walletAppliedFils;

      // If wallet fully covers the cost, skip Ziina entirely
      if (walletAppliedFils > 0 && remainingFils <= 0) {
        const walletUser = await storage.getMarketplaceUser(req.user.userId);
        // Atomic wallet deduction
        const [deducted] = await db
          .update(players)
          .set({ walletBalance: sql`${players.walletBalance} - ${walletAppliedFils}` })
          .where(and(eq(players.id, walletUser!.linkedPlayerId!), sql`${players.walletBalance} >= ${walletAppliedFils}`))
          .returning();
        if (!deducted) {
          return res.status(409).json({ error: 'Wallet balance changed. Please try again.' });
        }

        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: "confirmed",
          paymentMethod: "wallet",
          ziinaPaymentIntentId: null,
          amountAed: totalAmount,
          cashPaid: false,
          spotsBooked,
        });
        await storage.updateBooking(booking.id, { walletAmountUsed: walletAppliedFils });
        await createAllSlotsForBooking(booking.id, 'confirmed', true);

        try {
          if (primaryUser) {
            sendBookingConfirmationEmail(primaryUser.email, primaryUser.name, bookableSession, 'wallet', totalAmount).catch(() => {});
          }
        } catch (emailErr) { console.error('[Email] wallet booking confirm failed:', emailErr); }

        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({
          bookingId: booking.id,
          paymentMethod: "wallet",
          amount: totalAmount,
          walletApplied: walletAppliedFils,
          spotsBooked,
          booking: bookingWithDetails,
          session: {
            title: bookableSession.title,
            venueName: bookableSession.venueName,
            date: bookableSession.date,
            startTime: bookableSession.startTime,
            endTime: bookableSession.endTime,
          },
        });
      }

      const booking = await storage.createBooking({
        userId: req.user.userId,
        sessionId,
        status: "pending",
        paymentMethod: "ziina",
        ziinaPaymentIntentId: null,
        amountAed: totalAmount,
        cashPaid: false,
        spotsBooked,
      });

      // If partial wallet credit, deduct and record it
      if (walletAppliedFils > 0) {
        const walletUser = await storage.getMarketplaceUser(req.user.userId);
        const [deducted] = await db
          .update(players)
          .set({ walletBalance: sql`${players.walletBalance} - ${walletAppliedFils}` })
          .where(and(eq(players.id, walletUser!.linkedPlayerId!), sql`${players.walletBalance} >= ${walletAppliedFils}`))
          .returning();
        if (deducted) {
          await storage.updateBooking(booking.id, { walletAmountUsed: walletAppliedFils });
        } else {
          walletAppliedFils = 0;
        }
      }

      // Wallet credits are in multiples of 1500 fils (AED 15) and booking prices are in whole AED,
      // so remainder should always be divisible by 100. Use Math.round for safety (never overcharge).
      const ziinaAmountAed = Math.round((totalAmountFils - walletAppliedFils) / 100);

      let paymentIntent;
      try {
        paymentIntent = await createZiinaPaymentIntent({
          amountAed: ziinaAmountAed,
          message: `Booking for ${bookableSession.title}${spotsBooked > 1 ? ` (${spotsBooked} spots)` : ''}`,
          successUrl: `${baseUrl}/marketplace/checkout/success?booking_id=${booking.id}`,
          cancelUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}`,
          failureUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}&failed=1`,
        });
      } catch (intentError: unknown) {
        // Refund wallet credit if Ziina fails
        if (walletAppliedFils > 0) {
          const walletUser = await storage.getMarketplaceUser(req.user.userId);
          if (walletUser?.linkedPlayerId) {
            await db.update(players).set({ walletBalance: sql`${players.walletBalance} + ${walletAppliedFils}` }).where(eq(players.id, walletUser.linkedPlayerId));
            await storage.updateBooking(booking.id, { walletAmountUsed: 0 });
          }
        }
        await storage.updateBooking(booking.id, { status: 'cancelled', cancelledAt: new Date() });
        const errMsg = intentError instanceof Error ? intentError.message : 'Payment provider error. Please try again.';
        console.error('Ziina payment intent creation failed — booking cancelled:', errMsg);
        return res.status(502).json({ error: errMsg });
      }

      await storage.updateBooking(booking.id, { ziinaPaymentIntentId: paymentIntent.id });

      // Store all slot rows as pending — emails sent only upon Ziina payment confirmation
      await createAllSlotsForBooking(booking.id, 'pending', false);

      res.json({
        bookingId: booking.id,
        paymentMethod: "ziina",
        paymentIntentId: paymentIntent.id,
        redirectUrl: paymentIntent.redirect_url,
        amount: totalAmount,
        walletApplied: walletAppliedFils,
        ziinaAmount: ziinaAmountAed,
        spotsBooked,
        session: {
          title: bookableSession.title,
          venueName: bookableSession.venueName,
          date: bookableSession.date,
          startTime: bookableSession.startTime,
          endTime: bookableSession.endTime,
        },
      });
    } catch (error: unknown) {
      const pgErr = error as Record<string, unknown>;
      if (pgErr?.code === '23505' && pgErr?.constraint === 'unique_active_booking_per_session') {
        return res.status(400).json({ error: "You already have a booking for this session" });
      }
      console.error('Booking error:', error);
      const msg = error instanceof Error ? error.message : "Failed to create booking";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/marketplace/bookings/:id/confirm", async (req: AuthRequest, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      if (booking.status === 'confirmed') {
        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({ confirmed: true, booking: bookingWithDetails });
      }

      if (!booking.ziinaPaymentIntentId) {
        return res.status(400).json({ error: "No payment associated with this booking" });
      }

      // Re-fetch the latest payment status from Ziina before confirming.
      const paymentIntent = await retrieveZiinaPaymentIntent(booking.ziinaPaymentIntentId);

      if (isZiinaPaymentSuccessful(paymentIntent.status)) {
        // Delegate to the shared confirmation logic (also used by the webhook handler).
        const result = await confirmZiinaBookingByIntentId(booking.ziinaPaymentIntentId, paymentIntent.status);

        if (result.waitlisted) {
          const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
          return res.json({ confirmed: false, waitlisted: true, booking: bookingWithDetails, status: 'session_full' });
        }

        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({ confirmed: true, booking: bookingWithDetails });
      } else {
        return res.json({ confirmed: false, status: paymentIntent.status });
      }
    } catch (error: any) {
      console.error('Confirm error:', error);
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  // Authenticated: initiate Ziina payment for a pending_payment (waitlist-promoted) booking
  app.post("/api/marketplace/bookings/:id/initiate-payment", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized" });
      if (booking.status !== 'pending_payment') {
        return res.status(400).json({ error: "Booking is not awaiting payment" });
      }
      if (booking.paymentMethod !== 'ziina') {
        return res.status(400).json({ error: "This booking does not require online payment" });
      }
      if (!booking.promotedAt) {
        return res.status(400).json({ error: "Booking has no payment window set" });
      }
      const paymentDeadline = new Date(booking.promotedAt).getTime() + 4 * 60 * 60 * 1000;
      if (Date.now() > paymentDeadline) {
        return res.status(410).json({ error: "Payment window has expired. Your spot has been released." });
      }

      const bookableSession = await storage.getBookableSession(booking.sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });

      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

      let paymentIntent;
      try {
        paymentIntent = await createZiinaPaymentIntent({
          amountAed: booking.amountAed,
          message: `Payment for ${bookableSession.title}${(booking.spotsBooked ?? 1) > 1 ? ` (${booking.spotsBooked} spots)` : ''}`,
          successUrl: `${baseUrl}/marketplace/checkout/success?booking_id=${booking.id}`,
          cancelUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}`,
          failureUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}&failed=1`,
        });
      } catch (intentError: any) {
        console.error('Ziina intent creation failed for pending_payment booking:', intentError.message);
        return res.status(502).json({ error: intentError.message || 'Payment provider error. Please try again.' });
      }

      await storage.updateBooking(booking.id, { ziinaPaymentIntentId: paymentIntent.id });
      return res.json({ redirectUrl: paymentIntent.redirect_url });
    } catch (error: any) {
      console.error('initiate-payment error:', error);
      res.status(500).json({ error: "Failed to initiate payment" });
    }
  });

  // Public: guest self-cancel via unique token (no auth required)
  app.post("/api/marketplace/guests/cancel", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Cancellation token required" });

      const guest = await storage.getBookingGuestByToken(token);
      if (!guest) return res.status(404).json({ error: "Invalid cancellation link" });
      if (guest.status === 'cancelled') return res.json({ alreadyCancelled: true });

      const booking = await storage.getBooking(guest.bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status === 'cancelled') return res.status(400).json({ error: "Parent booking is already cancelled" });

      // Cancel the guest
      await storage.updateBookingGuest(guest.id, { status: 'cancelled', cancelledAt: new Date() });

      // Flag Ziina booking for admin refund review
      if (booking.paymentMethod === 'ziina' && booking.ziinaPaymentIntentId) {
        const proratedAmount = booking.amountAed / (booking.spotsBooked ?? 1);
        await storage.createMarketplaceNotification({
          userId: booking.userId,
          type: 'refund_required',
          title: 'Partial refund required',
          message: `Guest slot cancelled on Ziina booking. A prorated refund of approximately AED ${proratedAmount.toFixed(2)} may be owed. Please process via Ziina dashboard.`,
          relatedBookingId: booking.id,
        });
      }

      // Decrement spotsBooked on the parent booking
      const newSpots = Math.max(1, (booking.spotsBooked ?? 1) - 1);
      await storage.updateBooking(booking.id, { spotsBooked: newSpots });

      res.json({ cancelled: true, guestName: guest.name });
    } catch (error: any) {
      console.error('Guest cancel error:', error);
      res.status(500).json({ error: "Failed to cancel guest spot" });
    }
  });

  // Public: lookup guest by token (for the self-cancel page) — query-string form
  app.get("/api/marketplace/guests/by-token", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ error: "Token required" });
      const guest = await storage.getBookingGuestByToken(token);
      if (!guest) return res.status(404).json({ error: "Invalid token" });
      const booking = await storage.getBooking(guest.bookingId);
      const session = booking ? await storage.getBookableSession(booking.sessionId) : null;
      res.json({ guest, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guest info" });
    }
  });

  // Public: lookup guest by token — path-param form
  app.get("/api/marketplace/guests/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const guest = await storage.getBookingGuestByToken(token);
      if (!guest) return res.status(404).json({ error: "Invalid token" });
      const booking = await storage.getBooking(guest.bookingId);
      const session = booking ? await storage.getBookableSession(booking.sessionId) : null;
      res.json({ guest, session });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guest info" });
    }
  });

  // Public: guest self-cancel by token — path-param form
  app.post("/api/marketplace/guests/:token/cancel", async (req, res) => {
    try {
      const { token } = req.params;
      const guest = await storage.getBookingGuestByToken(token);
      if (!guest) return res.status(404).json({ error: "Invalid cancellation link" });
      if (guest.status === 'cancelled') return res.json({ alreadyCancelled: true });
      const booking = await storage.getBooking(guest.bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status === 'cancelled') return res.status(400).json({ error: "Parent booking is already cancelled" });
      await storage.updateBookingGuest(guest.id, { status: 'cancelled', cancelledAt: new Date() });
      // Flag Ziina booking for admin refund review
      if (booking.paymentMethod === 'ziina' && booking.ziinaPaymentIntentId) {
        const proratedAmount = booking.amountAed / (booking.spotsBooked ?? 1);
        await storage.createMarketplaceNotification({
          userId: booking.userId,
          type: 'refund_required',
          title: 'Partial refund required',
          message: `Guest slot cancelled on Ziina booking. A prorated refund of approximately AED ${proratedAmount.toFixed(2)} may be owed. Please process via Ziina dashboard.`,
          relatedBookingId: booking.id,
        });
      }
      const newSpots = Math.max(1, (booking.spotsBooked ?? 1) - 1);
      await storage.updateBooking(booking.id, { spotsBooked: newSpots });
      res.json({ cancelled: true, guestName: guest.name });
    } catch (error) {
      console.error('Guest cancel error:', error);
      res.status(500).json({ error: "Failed to cancel guest spot" });
    }
  });

  // Authenticated: delete (cancel) a specific guest slot
  // Allowed for: primary booker (booking.userId) OR linked guest (guest.linkedUserId)
  app.delete("/api/marketplace/bookings/:bookingId/guests/:guestId", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status === 'cancelled') return res.status(400).json({ error: "Booking is already cancelled" });

      const guests = await storage.getBookingGuests(req.params.bookingId);
      const guest = guests.find(g => g.id === req.params.guestId);
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      if (guest.status === 'cancelled') return res.status(400).json({ error: "Guest slot already cancelled" });

      // Authorization: primary booker OR the linked guest themselves
      const isPrimaryBooker = booking.userId === req.user.userId;
      const isLinkedGuest = guest.linkedUserId === req.user.userId;
      if (!isPrimaryBooker && !isLinkedGuest) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.updateBookingGuest(guest.id, { status: 'cancelled', cancelledAt: new Date() });

      // If primary booker cancelled this slot, notify the linked guest
      if (isPrimaryBooker && isLinkedGuest === false && guest.linkedUserId) {
        const bookableSession = await storage.getBookableSession(booking.sessionId);
        await storage.createMarketplaceNotification({
          userId: guest.linkedUserId,
          type: 'guest_slot_cancelled',
          title: 'Your spot has been cancelled',
          message: bookableSession
            ? `Your guest spot for "${bookableSession.title}" on ${new Date(bookableSession.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} has been cancelled by the booking organiser.`
            : 'Your guest spot has been cancelled by the booking organiser.',
          relatedBookingId: booking.id,
        });
      }

      // For Ziina bookings: flag the cancellation for admin review (prorated refund not supported via API)
      let refundFlaggedForAdmin = false;
      if (booking.paymentMethod === 'ziina' && booking.ziinaPaymentIntentId) {
        const proratedAmount = booking.amountAed / (booking.spotsBooked ?? 1);
        // Ziina does not have a refund API; create an admin notification for manual processing
        await storage.createMarketplaceNotification({
          userId: booking.userId,
          type: 'refund_required',
          title: 'Partial refund required',
          message: `Guest slot cancelled on Ziina booking. A prorated refund of approximately AED ${proratedAmount.toFixed(2)} may be owed. Please process via Ziina dashboard.`,
          relatedBookingId: booking.id,
        });
        refundFlaggedForAdmin = true;
      }

      // Decrement spots; if this was the last remaining spot, cancel the parent booking
      const newSpots = (booking.spotsBooked ?? 1) - 1;
      if (newSpots <= 0) {
        // Cancel parent booking (primary booker's spot is being removed)
        await storage.updateBooking(booking.id, { status: 'cancelled', cancelledAt: new Date(), spotsBooked: 0 });
        res.json({ cancelled: true, guestId: guest.id, newSpotsBooked: 0, bookingCancelled: true, refundFlaggedForAdmin });
      } else {
        await storage.updateBooking(booking.id, { spotsBooked: newSpots });
        res.json({ cancelled: true, guestId: guest.id, newSpotsBooked: newSpots, refundFlaggedForAdmin });
      }
    } catch (error) {
      console.error('Delete guest error:', error);
      res.status(500).json({ error: "Failed to cancel guest slot" });
    }
  });

  // Authenticated: reassign a guest slot (primary booker only) — update name/email + re-resolve linkedUserId
  app.patch("/api/marketplace/bookings/:bookingId/guests/:guestId", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized — only primary booker can edit guest details" });
      if (booking.status === 'cancelled') return res.status(400).json({ error: "Booking is cancelled" });

      const guests = await storage.getBookingGuests(req.params.bookingId);
      const guest = guests.find(g => g.id === req.params.guestId);
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      if (guest.status === 'cancelled') return res.status(400).json({ error: "Cannot edit a cancelled guest slot" });

      const { name, email } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Guest name is required" });
      }

      // Re-resolve linked account if email changed
      let linkedUserId = guest.linkedUserId;
      if (email !== undefined && email !== guest.email) {
        if (email) {
          const existingUser = await storage.getMarketplaceUserByEmail(email.trim());
          linkedUserId = existingUser ? existingUser.id : null;
        } else {
          linkedUserId = null;
        }
      }

      const updated = await storage.updateBookingGuest(guest.id, {
        name: name.trim(),
        email: email !== undefined ? (email?.trim() || null) : guest.email,
        linkedUserId,
      });

      res.json(updated);
    } catch (error) {
      console.error('Patch guest error:', error);
      res.status(500).json({ error: "Failed to update guest details" });
    }
  });

  // Authenticated: get guests for a specific booking (owner only)
  app.get("/api/marketplace/bookings/:id/guests", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized" });
      const guests = await storage.getBookingGuests(req.params.id);
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch guests" });
    }
  });

  // Add an extra guest to an existing confirmed booking (cash or Ziina)
  app.post("/api/marketplace/bookings/:bookingId/add-guest", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });

      const booking = await storage.getBooking(req.params.bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized" });
      if (booking.status !== 'confirmed') return res.status(400).json({ error: "You can only add guests to confirmed bookings" });

      const bodySchema = z.object({
        guestName: z.string().min(1).max(100),
        guestEmail: z.string().email().nullable().optional(),
        paymentMethod: z.enum(['cash', 'ziina']),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      const { guestName, guestEmail, paymentMethod } = parsed.data;

      const bookableSession = await storage.getBookableSessionWithAvailability(booking.sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });
      if (bookableSession.spotsRemaining < 1) return res.status(400).json({ error: "This session is full — no spots available" });

      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

      // Resolve linked marketplace user by email if possible
      let linkedUserId: string | null = null;
      if (guestEmail) {
        const existingUser = await storage.getMarketplaceUserByEmail(guestEmail);
        if (existingUser) linkedUserId = existingUser.id;
      }

      const cancellationToken = randomUUID();

      if (paymentMethod === 'cash') {
        await storage.createBookingGuest({
          bookingId: booking.id,
          name: guestName,
          email: guestEmail ?? null,
          linkedUserId,
          isPrimary: false,
          status: 'confirmed',
          cancellationToken,
        });
        await storage.updateBooking(booking.id, {
          spotsBooked: (booking.spotsBooked ?? 1) + 1,
          amountAed: booking.amountAed + bookableSession.priceAed,
        });

        if (guestEmail) {
          const primaryUser = await storage.getMarketplaceUser(req.user.userId);
          if (primaryUser) {
            const cancelGuestUrl = `${baseUrl}/marketplace/guests/cancel/${cancellationToken}`;
            const signupUrl = `${baseUrl}/marketplace/signup?email=${encodeURIComponent(guestEmail)}`;
            sendGuestBookingEmail(guestEmail, guestName, primaryUser.name, bookableSession, cancelGuestUrl, signupUrl).catch(() => {});
          }
        }

        return res.json({ success: true });
      }

      // Ziina path — create pending guest, then payment intent
      const pendingGuest = await storage.createBookingGuest({
        bookingId: booking.id,
        name: guestName,
        email: guestEmail ?? null,
        linkedUserId,
        isPrimary: false,
        status: 'pending',
        cancellationToken,
      });

      let paymentIntent;
      try {
        paymentIntent = await createZiinaPaymentIntent({
          amountAed: bookableSession.priceAed,
          message: `Extra spot for ${bookableSession.title}`,
          successUrl: `${baseUrl}/marketplace/checkout/success?booking_id=${booking.id}&extra_guest=1`,
          cancelUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}`,
          failureUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}&failed=1`,
        });
      } catch (intentError) {
        // Clean up the pending guest row on Ziina failure — delete it so it leaves no trace
        await storage.deleteBookingGuest(pendingGuest.id);
        const msg = intentError instanceof Error ? intentError.message : 'Payment provider error';
        return res.status(502).json({ error: msg });
      }

      await storage.updateBookingGuest(pendingGuest.id, { pendingPaymentIntentId: paymentIntent.id });
      return res.json({ redirectUrl: paymentIntent.redirect_url });
    } catch (error) {
      console.error('add-guest error:', error);
      res.status(500).json({ error: "Failed to add guest" });
    }
  });

  // ============================================================
  // BOOKINGS
  // ============================================================

  app.post("/api/marketplace/admin/bookings", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { sessionId, userId } = req.body;
      if (!sessionId || !userId) return res.status(400).json({ error: "Session ID and user ID required" });

      const existingBooking = await storage.getUserBookingForSession(userId, sessionId);
      if (existingBooking && existingBooking.status !== 'cancelled') {
        return res.status(400).json({ error: "User already has a booking for this session" });
      }

      const session = await storage.getBookableSessionWithAvailability(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.spotsRemaining <= 0) return res.status(400).json({ error: "Session is full" });

      const booking = await storage.createBooking({
        userId,
        sessionId,
        status: "confirmed",
        paymentMethod: "cash",
        ziinaPaymentIntentId: null,
        amountAed: session.priceAed,
        cashPaid: false,
      });

      const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
      res.json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.get("/api/marketplace/bookings/mine", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const primaryBookings = await storage.getUserBookings(req.user.userId);
      const guestBookings = await storage.getGuestBookingsForUser(req.user.userId);
      // Merge, deduplicating by booking id (primary takes precedence)
      const seen = new Set(primaryBookings.map(b => b.id));
      const merged = [...primaryBookings, ...guestBookings.filter(b => !seen.has(b.id))];
      // Sort by createdAt desc
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(merged);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.post("/api/marketplace/bookings/:id/cancel", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized" });
      if (booking.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });

      // Check late cancellation window (< 5 hours before session start)
      let lateFeeApplied = false;
      const bookableSession = await storage.getBookableSession(booking.sessionId);
      if (bookableSession && booking.status === 'confirmed') {
        const [hours, minutes] = bookableSession.startTime.split(':').map(Number);
        const sessionStartAt = new Date(bookableSession.date);
        sessionStartAt.setHours(hours, minutes, 0, 0);
        const cutoff = new Date(sessionStartAt.getTime() - 5 * 60 * 60 * 1000);
        if (new Date() >= cutoff) {
          lateFeeApplied = true;
        }
      }

      const wasConfirmed = booking.status === 'confirmed' || booking.status === 'pending_payment';

      // Refund wallet credit if any was used (before cancellation, unless late fee)
      if (!lateFeeApplied && booking.walletAmountUsed && booking.walletAmountUsed > 0) {
        const cancelUser = await storage.getMarketplaceUser(booking.userId);
        if (cancelUser?.linkedPlayerId) {
          await db
            .update(players)
            .set({ walletBalance: sql`${players.walletBalance} + ${booking.walletAmountUsed}` })
            .where(eq(players.id, cancelUser.linkedPlayerId));
        }
      }

      // Cancel the booking
      const updated = await storage.updateBooking(req.params.id, {
        status: "cancelled",
        cancelledAt: new Date(),
        lateFeeApplied,
      });

      // Notify user if late fee applied
      if (lateFeeApplied && bookableSession) {
        await storage.createMarketplaceNotification({
          userId: booking.userId,
          type: 'late_fee_applied',
          title: 'Cancellation fee applied',
          message: `You cancelled "${bookableSession.title}" within 5 hours of the session start. Your full payment of AED ${booking.amountAed} has been retained.`,
          relatedBookingId: booking.id,
        });
      }

      // Send cancellation email (fully isolated so email failure cannot affect API response)
      try {
        const cancellingUser = await storage.getMarketplaceUser(booking.userId);
        if (cancellingUser && bookableSession) {
          sendCancellationEmail(cancellingUser.email, cancellingUser.name, bookableSession, lateFeeApplied, booking.amountAed).catch(() => {});
        }
      } catch (emailErr) { console.error('[Email] cancellation lookup failed:', emailErr); }

      // If was a confirmed booking, promote first waitlisted user that fits remaining capacity
      let promoted: { bookingId: string; userId: string } | null = null;
      if (wasConfirmed && bookableSession) {
        const waitlisted = await storage.getWaitlistedBookingsForSession(booking.sessionId);
        if (waitlisted.length > 0) {
          // Get current available capacity after this cancellation
          const currentCount = await storage.getBookingCountForSession(booking.sessionId);
          const spotsAvailable = bookableSession.capacity - currentCount;
          // Find first waitlisted booking that fits the available spots
          const first = waitlisted.find(w => (w.spotsBooked ?? 1) <= spotsAvailable);
          if (first) {
            const isZiinaPromotion = first.paymentMethod === 'ziina';
            const promotionBaseUrl = process.env.REPLIT_DOMAINS
              ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
              : 'http://localhost:5000';

            if (isZiinaPromotion) {
              // Ziina payment: hold the spot as pending_payment with a 4-hour window
              await storage.updateBooking(first.id, {
                status: 'pending_payment',
                waitlistPosition: null,
                promotedAt: new Date(),
              });
            } else {
              // Cash payment: immediately confirm the spot
              await storage.updateBooking(first.id, { status: 'confirmed', waitlistPosition: null });

              // Confirm all pending slot rows for the promoted booking
              const promotedSlots = await storage.getBookingGuests(first.id);
              for (const slot of promotedSlots) {
                if (slot.status === 'pending') {
                  await storage.updateBookingGuest(slot.id, { status: 'confirmed' });
                }
              }
            }

            promoted = { bookingId: first.id, userId: first.userId };

            // Create notification for promoted user
            const dateLabel = new Date(bookableSession.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            await storage.createMarketplaceNotification({
              userId: first.userId,
              type: 'waitlist_promoted',
              title: isZiinaPromotion ? 'Spot available — complete payment!' : "You're confirmed!",
              message: isZiinaPromotion
                ? `A spot opened up for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}. You have 4 hours to complete payment to secure your spot.`
                : `A spot opened up — you've been confirmed for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}.`,
              relatedBookingId: first.id,
            });

            // Send waitlist promotion email + notify/email non-primary guest slots (fully isolated)
            try {
              const promotedUser = await storage.getMarketplaceUser(first.userId);
              if (promotedUser) {
                const checkoutUrl = isZiinaPromotion
                  ? `${promotionBaseUrl}/marketplace/my-bookings`
                  : undefined;
                sendWaitlistPromotionEmail(promotedUser.email, promotedUser.name, bookableSession, checkoutUrl).catch(() => {});

                if (!isZiinaPromotion) {
                  // Send emails + in-app notifications to non-primary guest slots (cash only — ziina waits for payment)
                  const confirmedSlots = await storage.getBookingGuests(first.id);
                  for (const slot of confirmedSlots) {
                    if (!slot.isPrimary && slot.status === 'confirmed') {
                      if (slot.email && slot.cancellationToken) {
                        const cancelGuestUrl = `${promotionBaseUrl}/marketplace/guests/cancel/${slot.cancellationToken}`;
                        const signupUrl = `${promotionBaseUrl}/marketplace/signup?email=${encodeURIComponent(slot.email)}`;
                        sendGuestBookingEmail(slot.email, slot.name, promotedUser.name, bookableSession, cancelGuestUrl, signupUrl).catch(() => {});
                      }
                      if (slot.linkedUserId) {
                        await storage.createMarketplaceNotification({
                          userId: slot.linkedUserId,
                          type: 'guest_booking_confirmed',
                          title: 'You have a booking!',
                          message: `${promotedUser.name} has been confirmed for "${bookableSession.title}" on ${dateLabel} — your guest spot is also confirmed.`,
                          relatedBookingId: first.id,
                        });
                      }
                    }
                  }
                }
              }
            } catch (emailErr) { console.error('[Email] waitlist promotion lookup failed:', emailErr); }

            // Re-number remaining waitlisted bookings (exclude the promoted one)
            const remaining = waitlisted.filter(w => w.id !== first.id);
            for (let i = 0; i < remaining.length; i++) {
              await storage.updateBooking(remaining[i].id, { waitlistPosition: i + 1 });
            }
          }
        }
      }

      // If a waitlisted booking was cancelled, renumber the remaining waitlisted positions
      if (booking.status === 'waitlisted') {
        const waitlisted = await storage.getWaitlistedBookingsForSession(booking.sessionId);
        for (let i = 0; i < waitlisted.length; i++) {
          await storage.updateBooking(waitlisted[i].id, { waitlistPosition: i + 1 });
        }
      }

      res.json({ booking: updated, lateFeeApplied, promoted });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  app.post("/api/marketplace/bookings/:id/attend", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status === "cancelled") return res.status(400).json({ error: "Booking is cancelled" });

      const updated = await storage.updateBooking(req.params.id, {
        status: "attended",
        attendedAt: new Date(),
      });

      let queueResult: { added: boolean; reason?: string } = { added: false };

      const marketplaceUser = await storage.getMarketplaceUser(booking.userId);
      const bookableSession = await storage.getBookableSession(booking.sessionId);

      if (!marketplaceUser?.linkedPlayerId) {
        queueResult = { added: false, reason: "no_player_link" };
      } else if (!bookableSession?.linkedSessionId) {
        queueResult = { added: false, reason: "no_session_link" };
      } else {
        const queue = await storage.getQueue(bookableSession.linkedSessionId);
        if (queue.includes(marketplaceUser.linkedPlayerId)) {
          queueResult = { added: false, reason: "already_in_queue" };
        } else {
          await storage.addToQueue(bookableSession.linkedSessionId, marketplaceUser.linkedPlayerId);
          queueResult = { added: true };
        }
      }

      res.json({ ...updated, queueResult });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark attendance" });
    }
  });

  // Admin: toggle cash paid status
  app.patch("/api/marketplace/bookings/:id/cash-paid", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.paymentMethod !== 'cash') return res.status(400).json({ error: "Only cash bookings can be toggled" });

      const { cashPaid } = req.body;
      const updated = await storage.updateBooking(req.params.id, { cashPaid: !!cashPaid });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cash payment status" });
    }
  });

  // Admin: force-confirm a pending Ziina booking (escape hatch when Ziina timing caused status to get stuck)
  app.post("/api/marketplace/bookings/:id/admin-confirm", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.paymentMethod === 'cash') return res.status(400).json({ error: "Use the cash-paid toggle for cash bookings" });
      if (booking.status === 'confirmed' || booking.status === 'attended') {
        return res.json({ message: "Booking already confirmed", booking });
      }

      // Try to fetch latest Ziina status first; log it for audit purposes
      let ziinaStatus = 'unknown';
      if (booking.ziinaPaymentIntentId) {
        try {
          const intent = await retrieveZiinaPaymentIntent(booking.ziinaPaymentIntentId);
          ziinaStatus = intent.status;
          console.log(`[Admin confirm] Booking ${booking.id} — Ziina status at confirm time: "${ziinaStatus}"`);
        } catch (zErr) {
          console.warn(`[Admin confirm] Could not fetch Ziina status for booking ${booking.id}:`, zErr);
        }
      }

      await storage.updateBooking(booking.id, { status: 'confirmed' });

      // Record the payment if not already present
      if (booking.ziinaPaymentIntentId) {
        const existingPayments = await storage.getPaymentsByBookingId(booking.id);
        const alreadyRecorded = existingPayments.some(p => p.ziinaPaymentIntentId === booking.ziinaPaymentIntentId);
        if (!alreadyRecorded) {
          await storage.createPayment({
            bookingId: booking.id,
            ziinaPaymentIntentId: booking.ziinaPaymentIntentId,
            amount: booking.amountAed,
            currency: 'aed',
            status: 'completed',
          });
        }
      }

      // Confirm all pending guest slots and send guest emails/notifications
      try {
        const user = await storage.getMarketplaceUser(booking.userId);
        const session = await storage.getBookableSession(booking.sessionId);
        if (user && session) {
          sendBookingConfirmationEmail(user.email, user.name, session, 'ziina', booking.amountAed).catch(() => {});

          const adminConfirmBaseUrl = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : 'http://localhost:5000';
          const pendingSlots = await storage.getBookingGuests(booking.id);
          for (const slot of pendingSlots) {
            if (slot.status === 'pending') {
              await storage.updateBookingGuest(slot.id, { status: 'confirmed' });
              // Send guest email for non-primary slots with a cancellation token
              if (!slot.isPrimary && slot.email && slot.cancellationToken) {
                const cancelGuestUrl = `${adminConfirmBaseUrl}/marketplace/guests/cancel/${slot.cancellationToken}`;
                const signupUrl = `${adminConfirmBaseUrl}/marketplace/signup?email=${encodeURIComponent(slot.email)}`;
                sendGuestBookingEmail(slot.email, slot.name, user.name, session, cancelGuestUrl, signupUrl).catch(() => {});
              }
              // Notify linked non-primary guests
              if (!slot.isPrimary && slot.linkedUserId) {
                await storage.createMarketplaceNotification({
                  userId: slot.linkedUserId,
                  type: 'guest_booking_confirmed',
                  title: 'You have a booking!',
                  message: `${user.name} added you as a guest for "${session.title}" on ${new Date(session.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${session.venueName}.`,
                  relatedBookingId: booking.id,
                });
              }
            }
          }
        }
      } catch (emailErr) { console.error('[Email] admin-confirm email failed:', emailErr); }

      const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
      res.json({ confirmed: true, ziinaStatus, booking: bookingWithDetails });
    } catch (error: any) {
      console.error('Admin confirm error:', error);
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  // Admin: manually promote a waitlisted booking when capacity opens up
  app.post("/api/marketplace/bookings/:id/admin-promote", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status !== 'waitlisted') {
        return res.status(400).json({ error: "Booking is not waitlisted" });
      }

      const bookableSession = await storage.getBookableSession(booking.sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });

      // Check capacity: count confirmed/attended/pending_payment spots
      const currentCount = await storage.getBookingCountForSession(booking.sessionId);
      const spotsNeeded = booking.spotsBooked ?? 1;
      if (currentCount + spotsNeeded > bookableSession.capacity) {
        return res.status(409).json({ error: "session_full", message: "Session is still full — cancel another booking first." });
      }

      // Promote the booking
      await storage.updateBooking(booking.id, {
        status: 'confirmed',
        waitlistPosition: null,
        promotedAt: new Date(),
      });

      // Confirm all pending guest slots (leave cancelled slots untouched)
      const slots = await storage.getBookingGuests(booking.id);
      for (const slot of slots) {
        if (slot.status === 'pending') {
          await storage.updateBookingGuest(slot.id, { status: 'confirmed' });
        }
      }

      // Re-number remaining waitlisted bookings for this session
      const stillWaitlisted = await storage.getWaitlistedBookingsForSession(booking.sessionId);
      for (let i = 0; i < stillWaitlisted.length; i++) {
        await storage.updateBooking(stillWaitlisted[i].id, { waitlistPosition: i + 1 });
      }

      // Send confirmation email (fire-and-forget)
      try {
        const user = await storage.getMarketplaceUser(booking.userId);
        if (user) {
          sendBookingConfirmationEmail(user.email, user.name, bookableSession, booking.paymentMethod as 'ziina' | 'cash', booking.amountAed).catch(() => {});
        }
      } catch (emailErr) { console.error('[Email] admin-promote email failed:', emailErr); }

      const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
      res.json({ confirmed: true, booking: bookingWithDetails });
    } catch (error: any) {
      console.error('Admin promote error:', error);
      res.status(500).json({ error: "Failed to promote booking" });
    }
  });

  // Public (authenticated players): get confirmed player list for a session
  app.get("/api/marketplace/sessions/:id/players", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const sessionBookings = await storage.getSessionBookings(req.params.id);
      const confirmedBookings = sessionBookings.filter(b => b.status === 'confirmed' || b.status === 'attended');

      const playerEntries: Array<{ name: string; level: string | null; skillScore: number | null; linkedPlayerId: string | null; isGuest?: boolean }> = [];

      for (const booking of confirmedBookings) {
        let level: string | null = null;
        let skillScore: number | null = null;

        if (booking.user?.linkedPlayerId) {
          const player = await storage.getPlayer(booking.user.linkedPlayerId);
          if (player) {
            level = player.level ?? null;
            skillScore = player.skillScore ?? null;
          }
        }

        // Main booker
        playerEntries.push({
          name: booking.user?.name ?? 'Player',
          level,
          skillScore,
          linkedPlayerId: booking.user?.linkedPlayerId ?? null,
        });

        // Additional guests only (exclude primary slot — already represented above by booking.user)
        const guestList = booking.guests ?? [];
        for (const guest of guestList) {
          if (guest.status === 'confirmed' && !guest.isPrimary) {
            let guestLevel: string | null = null;
            let guestSkillScore: number | null = null;
            let guestLinkedPlayerId: string | null = null;
            // If guest has a linked marketplace user, resolve their linked player
            if (guest.linkedUserId) {
              const guestUser = await storage.getMarketplaceUser(guest.linkedUserId);
              if (guestUser?.linkedPlayerId) {
                const guestPlayer = await storage.getPlayer(guestUser.linkedPlayerId);
                if (guestPlayer) {
                  guestLevel = guestPlayer.level ?? null;
                  guestSkillScore = guestPlayer.skillScore ?? null;
                  guestLinkedPlayerId = guestPlayer.id;
                }
              }
            }
            playerEntries.push({
              name: guest.name,
              level: guestLevel,
              skillScore: guestSkillScore,
              linkedPlayerId: guestLinkedPlayerId,
              isGuest: true,
            });
          }
        }
      }

      res.json(playerEntries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Admin: get bookings for a session
  app.get("/api/marketplace/sessions/:id/bookings", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const bookings = await storage.getSessionBookings(req.params.id);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Admin: get all marketplace users
  app.get("/api/marketplace/admin/users", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const users = await storage.getAllMarketplaceUsers();
      const usersWithPlayers = await Promise.all(
        users.map(async (u) => {
          let linkedPlayer = null;
          if (u.linkedPlayerId) {
            linkedPlayer = await storage.getPlayer(u.linkedPlayerId);
          }
          return {
            id: u.id,
            email: u.email,
            name: u.name,
            phone: u.phone,
            linkedPlayerId: u.linkedPlayerId,
            linkedPlayer,
            createdAt: u.createdAt,
          };
        })
      );
      res.json(usersWithPlayers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  app.get("/api/marketplace/notifications", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const notifications = await storage.getNotificationsForUser(req.user.userId);
      const unreadCount = notifications.filter(n => !n.read).length;
      res.json({ notifications, unreadCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/marketplace/notifications/read-all", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      await storage.markAllNotificationsRead(req.user.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  app.post("/api/marketplace/notifications/:id/read", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // ============================================================
  // SCORE DISPUTES
  // ============================================================

  // File a dispute (marketplace player)
  app.post("/api/marketplace/game-results/:gameResultId/dispute", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const { gameResultId } = req.params;
      const userId = req.user!.userId;
      const { note } = z.object({ note: z.string().max(500).optional() }).parse(req.body);

      const existing = await storage.getDisputeByUserAndGame(userId, gameResultId);
      if (existing) {
        return res.status(409).json({ error: "You have already filed a dispute for this game." });
      }

      const dispute = await storage.createScoreDispute({ gameResultId, filedByUserId: userId, note });
      res.status(201).json(dispute);
    } catch (err) {
      res.status(500).json({ error: "Failed to file dispute" });
    }
  });

  // Get current user's disputes (marketplace player)
  app.get("/api/marketplace/my-disputes", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const disputes = await storage.getDisputesByUser(userId);
      res.json(disputes);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch disputes" });
    }
  });

  // Get all disputes (admin)
  app.get("/api/disputes", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const disputes = await storage.getAllDisputesWithDetails();
      res.json(disputes);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch disputes" });
    }
  });

  // Resolve or dismiss a dispute (admin)
  app.patch("/api/disputes/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { status, adminNote } = z.object({
        status: z.enum(['resolved', 'dismissed']),
        adminNote: z.string().max(500).optional(),
      }).parse(req.body);

      const dispute = await storage.getScoreDispute(id);
      if (!dispute) return res.status(404).json({ error: "Dispute not found" });

      const updated = await storage.updateScoreDispute(id, { status, adminNote: adminNote ?? null });

      // Send email notification to the player
      try {
        const user = await storage.getMarketplaceUser(dispute.filedByUserId);
        if (user) {
          // Get dispute details for the email
          const allDisputes = await storage.getAllDisputesWithDetails();
          const detail = allDisputes.find(d => d.id === id);
          if (detail) {
            await sendDisputeResolutionEmail(user.email, {
              playerName: user.name,
              status,
              gameScore: detail.gameScore,
              gameDate: detail.gameDate,
              adminNote: adminNote ?? null,
            });
          }
        }
      } catch (emailErr) {
        console.error('[Email] Failed to send dispute resolution email:', emailErr);
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update dispute" });
    }
  });

  // ============================================================
  // ADMIN: REFUNDS
  // ============================================================

  app.get("/api/marketplace/admin/refunds", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const refunds = await storage.getRefundNotifications();
      res.json(refunds);
    } catch (error) {
      console.error('Failed to fetch refund notifications:', error);
      res.status(500).json({ error: "Failed to fetch refunds" });
    }
  });

  app.patch("/api/marketplace/admin/refunds/:id/resolve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.resolveRefundNotification(id);
      if (!updated) return res.status(404).json({ error: "Refund notification not found" });
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to resolve refund notification:', error);
      res.status(500).json({ error: "Failed to resolve refund" });
    }
  });

  // ============================================================
  // SEED DATA
  // ============================================================

  app.post("/api/marketplace/seed", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const existing = await storage.getAllBookableSessions();
      if (existing.length > 0) {
        return res.json({ message: "Seed data already exists", count: existing.length });
      }

      const now = new Date();
      const sessions = [
        {
          title: "Friday Evening Drop-in",
          description: "Casual drop-in session for all skill levels. Great for meeting new players and getting some games in after work.",
          venueName: "Dubai Sports World",
          venueLocation: "Dubai World Trade Centre, Hall 4",
          date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          startTime: "18:00",
          endTime: "21:00",
          courtCount: 4,
          capacity: 20,
          priceAed: 45,
          status: "upcoming" as const,
          imageUrl: null,
        },
        {
          title: "Weekend Warriors Tournament",
          description: "Competitive doubles tournament for intermediate and advanced players. Prizes for top 3 teams!",
          venueName: "Shuttlers Club",
          venueLocation: "Al Quoz Industrial Area 3",
          date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          startTime: "09:00",
          endTime: "14:00",
          courtCount: 6,
          capacity: 24,
          priceAed: 75,
          status: "upcoming" as const,
          imageUrl: null,
        },
        {
          title: "Beginners Welcome Session",
          description: "Perfect for newcomers to badminton. Includes a 30-minute coaching warm-up followed by supervised games.",
          venueName: "NAS Sports Complex",
          venueLocation: "Al Quoz, Dubai",
          date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          startTime: "10:00",
          endTime: "12:00",
          courtCount: 3,
          capacity: 12,
          priceAed: 35,
          status: "upcoming" as const,
          imageUrl: null,
        },
        {
          title: "Midweek Smash Night",
          description: "High-energy midweek session. Fast-paced rotation format ensures maximum court time for everyone.",
          venueName: "Dubai Sports World",
          venueLocation: "Dubai World Trade Centre, Hall 4",
          date: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
          startTime: "19:00",
          endTime: "22:00",
          courtCount: 4,
          capacity: 16,
          priceAed: 50,
          status: "upcoming" as const,
          imageUrl: null,
        },
        {
          title: "Ladies Only Session",
          description: "Exclusive session for female players of all levels. Supportive and fun environment.",
          venueName: "Hamdan Sports Complex",
          venueLocation: "Al Nasr, Dubai",
          date: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000),
          startTime: "17:00",
          endTime: "19:00",
          courtCount: 3,
          capacity: 12,
          priceAed: 40,
          status: "upcoming" as const,
          imageUrl: null,
        },
      ];

      for (const s of sessions) {
        await storage.createBookableSession(s);
      }

      res.json({ message: "Seed data created", count: sessions.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // ============================================================
  // ADMIN: Register Ziina webhook (one-time setup)
  // ============================================================

  app.post("/api/admin/ziina/register-webhook", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const webhookSecret = process.env.ZIINA_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return res.status(400).json({
          error: "ZIINA_WEBHOOK_SECRET is not set. Add it to Replit Secrets first.",
        });
      }

      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : `http://localhost:${process.env.PORT || 5000}`;

      const webhookUrl = `${baseUrl}/api/webhooks/ziina`;
      console.log(`[Admin] Registering Ziina webhook at: ${webhookUrl}`);

      const result = await registerZiinaWebhook(webhookUrl, webhookSecret);
      res.json({ registered: true, webhookUrl, ziina: result });
    } catch (err: any) {
      console.error("[Admin] Ziina webhook registration failed:", err);
      res.status(500).json({ error: err.message || "Failed to register Ziina webhook" });
    }
  });
}
