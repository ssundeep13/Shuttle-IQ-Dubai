import type { Express } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { requireAuth, requireAdmin, requireMarketplaceAuth, type AuthRequest } from "./auth/middleware";
import {
  generateAccessToken,
  generateRefreshToken,
  comparePassword,
  hashPassword,
  verifyRefreshToken,
} from "./auth/utils";
import { getUncachableStripeClient, getPublishableKey } from "./stripeClient";

export function registerMarketplaceRoutes(app: Express) {
  // ============================================================
  // MARKETPLACE AUTH
  // ============================================================

  app.post("/api/marketplace/auth/signup", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
        phone: z.string().optional(),
      });
      const { email, password, name, phone } = schema.parse(req.body);

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
    } catch (error: any) {
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

  // ============================================================
  // BOOKABLE SESSIONS
  // ============================================================

  app.get("/api/marketplace/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getAllBookableSessions();
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
  // STRIPE CONFIG
  // ============================================================

  app.get("/api/marketplace/stripe/config", async (_req, res) => {
    try {
      const publishableKey = await getPublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Stripe config" });
    }
  });

  // ============================================================
  // CHECKOUT
  // ============================================================

  app.post("/api/marketplace/bookings", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const { sessionId, paymentMethod } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Session ID required" });

      const method = paymentMethod === 'cash' ? 'cash' : 'stripe';

      const existingBooking = await storage.getUserBookingForSession(req.user.userId, sessionId);
      if (existingBooking && existingBooking.status !== 'cancelled') {
        return res.status(400).json({ error: "You already have a booking for this session" });
      }

      const bookableSession = await storage.getBookableSessionWithAvailability(sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });
      if (bookableSession.spotsRemaining <= 0) return res.status(400).json({ error: "Session is full" });
      if (bookableSession.status === "cancelled") return res.status(400).json({ error: "Session is cancelled" });

      if (method === 'cash') {
        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: "confirmed",
          paymentMethod: "cash",
          paymentIntentId: null,
          stripeCheckoutSessionId: null,
          amountAed: bookableSession.priceAed,
          cashPaid: false,
        });

        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({
          bookingId: booking.id,
          paymentMethod: "cash",
          amount: bookableSession.priceAed,
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

      const stripe = await getUncachableStripeClient();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: bookableSession.priceAed * 100,
        currency: 'aed',
        metadata: {
          sessionId,
          userId: req.user.userId,
          sessionTitle: bookableSession.title,
        },
      });

      const booking = await storage.createBooking({
        userId: req.user.userId,
        sessionId,
        status: "pending",
        paymentMethod: "stripe",
        paymentIntentId: paymentIntent.id,
        stripeCheckoutSessionId: null,
        amountAed: bookableSession.priceAed,
        cashPaid: false,
      });

      res.json({
        bookingId: booking.id,
        paymentMethod: "stripe",
        clientSecret: paymentIntent.client_secret,
        amount: bookableSession.priceAed,
        session: {
          title: bookableSession.title,
          venueName: bookableSession.venueName,
          date: bookableSession.date,
          startTime: bookableSession.startTime,
          endTime: bookableSession.endTime,
        },
      });
    } catch (error: any) {
      console.error('Booking error:', error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.post("/api/marketplace/bookings/:id/confirm", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.userId !== req.user.userId) return res.status(403).json({ error: "Not authorized" });

      if (booking.status === 'confirmed') {
        const bookingWithDetails = await storage.getBookingWithDetails(booking.id);
        return res.json({ confirmed: true, booking: bookingWithDetails });
      }

      if (!booking.paymentIntentId) {
        return res.status(400).json({ error: "No payment associated with this booking" });
      }

      const stripe = await getUncachableStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);

      if (paymentIntent.metadata?.userId !== req.user.userId) {
        return res.status(400).json({ error: "Payment metadata mismatch" });
      }

      const expectedAmountCents = booking.amountAed * 100;
      if (paymentIntent.amount !== expectedAmountCents) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }

      if (paymentIntent.status === 'succeeded') {
        await storage.updateBooking(booking.id, { status: 'confirmed' });

        await storage.createPayment({
          bookingId: booking.id,
          stripePaymentIntentId: paymentIntent.id,
          amount: booking.amountAed,
          currency: "aed",
          status: "completed",
        });

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
        paymentIntentId: null,
        stripeCheckoutSessionId: null,
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
      const bookings = await storage.getUserBookings(req.user.userId);
      res.json(bookings);
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

      const updated = await storage.updateBooking(req.params.id, {
        status: "cancelled",
        cancelledAt: new Date(),
      });
      res.json(updated);
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
}
