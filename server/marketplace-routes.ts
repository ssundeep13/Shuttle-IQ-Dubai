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
} from "./emailClient";
import { requireAuth, requireAdmin, requireMarketplaceAuth, type AuthRequest } from "./auth/middleware";
import {
  generateAccessToken,
  generateRefreshToken,
  comparePassword,
  hashPassword,
  verifyRefreshToken,
} from "./auth/utils";
import { createZiinaPaymentIntent, retrieveZiinaPaymentIntent, isZiinaPaymentSuccessful } from "./ziinaClient";

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

      // Fire-and-forget welcome email
      const marketplaceUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/marketplace`
        : 'http://localhost:5000/marketplace';
      sendWelcomeEmail(user.email, user.name, marketplaceUrl).catch(() => {});
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
  // CHECKOUT
  // ============================================================

  app.post("/api/marketplace/bookings", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      const { sessionId, paymentMethod } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Session ID required" });

      const method = paymentMethod === 'cash' ? 'cash' : 'ziina';

      const existingBooking = await storage.getUserBookingForSession(req.user.userId, sessionId);
      if (existingBooking) {
        if (existingBooking.status === 'pending') {
          // Previous payment was never completed — cancel it and allow retry
          await storage.updateBooking(existingBooking.id, { status: 'cancelled', cancelledAt: new Date() });
        } else if (existingBooking.status !== 'cancelled') {
          return res.status(400).json({ error: "You already have a booking for this session" });
        }
      }

      const bookableSession = await storage.getBookableSessionWithAvailability(sessionId);
      if (!bookableSession) return res.status(404).json({ error: "Session not found" });
      if (bookableSession.status === "cancelled") return res.status(400).json({ error: "Session is cancelled" });

      // Handle waitlist when session is full
      if (bookableSession.spotsRemaining <= 0) {
        const waitlistCount = await storage.getWaitlistCountForSession(sessionId);
        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: 'waitlisted',
          paymentMethod: 'cash',
          ziinaPaymentIntentId: null,
          amountAed: bookableSession.priceAed,
          cashPaid: false,
          waitlistPosition: waitlistCount + 1,
          lateFeeApplied: false,
        });
        return res.json({
          bookingId: booking.id,
          waitlisted: true,
          waitlistPosition: booking.waitlistPosition,
          amount: bookableSession.priceAed,
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
        const booking = await storage.createBooking({
          userId: req.user.userId,
          sessionId,
          status: "confirmed",
          paymentMethod: "cash",
          ziinaPaymentIntentId: null,
          amountAed: bookableSession.priceAed,
          cashPaid: false,
        });

        // Fire-and-forget booking confirmation email
        const cashUser = await storage.getMarketplaceUser(req.user.userId);
        if (cashUser) {
          sendBookingConfirmationEmail(cashUser.email, cashUser.name, bookableSession, 'cash', bookableSession.priceAed).catch(() => {});
        }

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

      const booking = await storage.createBooking({
        userId: req.user.userId,
        sessionId,
        status: "pending",
        paymentMethod: "ziina",
        ziinaPaymentIntentId: null,
        amountAed: bookableSession.priceAed,
        cashPaid: false,
      });

      let paymentIntent;
      try {
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'http://localhost:5000';

        paymentIntent = await createZiinaPaymentIntent({
          amountAed: bookableSession.priceAed,
          message: `Booking for ${bookableSession.title}`,
          successUrl: `${baseUrl}/marketplace/checkout/success?booking_id=${booking.id}`,
          cancelUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}`,
          failureUrl: `${baseUrl}/marketplace/checkout/cancel?booking_id=${booking.id}&failed=1`,
        });
      } catch (intentError: any) {
        await storage.updateBooking(booking.id, { status: 'cancelled', cancelledAt: new Date() });
        console.error('Ziina payment intent creation failed — booking cancelled:', intentError.message);
        return res.status(502).json({ error: intentError.message || 'Payment provider error. Please try again.' });
      }

      await storage.updateBooking(booking.id, { ziinaPaymentIntentId: paymentIntent.id });

      res.json({
        bookingId: booking.id,
        paymentMethod: "ziina",
        paymentIntentId: paymentIntent.id,
        redirectUrl: paymentIntent.redirect_url,
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
      res.status(500).json({ error: error.message || "Failed to create booking" });
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

      if (!booking.ziinaPaymentIntentId) {
        return res.status(400).json({ error: "No payment associated with this booking" });
      }

      const paymentIntent = await retrieveZiinaPaymentIntent(booking.ziinaPaymentIntentId);

      if (isZiinaPaymentSuccessful(paymentIntent.status)) {
        const wasAlreadyConfirmed = booking.status === 'confirmed';
        await storage.updateBooking(booking.id, { status: 'confirmed' });

        const existingPayments = await storage.getPaymentsByBookingId(booking.id);
        const alreadyRecorded = existingPayments.some(p => p.ziinaPaymentIntentId === paymentIntent.id);
        if (!alreadyRecorded) {
          await storage.createPayment({
            bookingId: booking.id,
            ziinaPaymentIntentId: paymentIntent.id,
            amount: booking.amountAed,
            currency: 'aed',
            status: 'completed',
          });
        }

        // Fire-and-forget booking confirmation email (only on first confirm)
        if (!wasAlreadyConfirmed) {
          const ziinaUser = await storage.getMarketplaceUser(booking.userId);
          const ziinaSession = await storage.getBookableSession(booking.sessionId);
          if (ziinaUser && ziinaSession) {
            sendBookingConfirmationEmail(ziinaUser.email, ziinaUser.name, ziinaSession, 'ziina', booking.amountAed).catch(() => {});
          }
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

      const wasConfirmed = booking.status === 'confirmed';

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

      // Send cancellation email to the cancelling user (fire-and-forget)
      const cancellingUser = await storage.getMarketplaceUser(booking.userId);
      if (cancellingUser && bookableSession) {
        sendCancellationEmail(cancellingUser.email, cancellingUser.name, bookableSession, lateFeeApplied, booking.amountAed).catch(() => {});
      }

      // If was a confirmed booking, promote first waitlisted user
      let promoted: { bookingId: string; userId: string } | null = null;
      if (wasConfirmed && bookableSession) {
        const waitlisted = await storage.getWaitlistedBookingsForSession(booking.sessionId);
        if (waitlisted.length > 0) {
          const first = waitlisted[0];
          await storage.updateBooking(first.id, { status: 'confirmed', waitlistPosition: null });
          promoted = { bookingId: first.id, userId: first.userId };

          // Create notification for promoted user
          await storage.createMarketplaceNotification({
            userId: first.userId,
            type: 'waitlist_promoted',
            title: "You're confirmed!",
            message: `A spot opened up — you've been confirmed for "${bookableSession.title}" on ${new Date(bookableSession.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${bookableSession.venueName}.`,
            relatedBookingId: first.id,
          });

          // Send waitlist promotion email (fire-and-forget)
          const promotedUser = await storage.getMarketplaceUser(first.userId);
          if (promotedUser) {
            sendWaitlistPromotionEmail(promotedUser.email, promotedUser.name, bookableSession).catch(() => {});
          }

          // Re-number remaining waitlisted bookings (skip the promoted one)
          const remaining = waitlisted.slice(1);
          for (let i = 0; i < remaining.length; i++) {
            await storage.updateBooking(remaining[i].id, { waitlistPosition: i + 1 });
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

  // Public (authenticated players): get confirmed player list for a session
  app.get("/api/marketplace/sessions/:id/players", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const sessionBookings = await storage.getSessionBookings(req.params.id);
      const confirmedBookings = sessionBookings.filter(b => b.status === 'confirmed' || b.status === 'attended');

      const players = await Promise.all(
        confirmedBookings.map(async (booking) => {
          let level: string | null = null;
          let skillScore: number | null = null;

          if (booking.user?.linkedPlayerId) {
            const player = await storage.getPlayer(booking.user.linkedPlayerId);
            if (player) {
              level = player.level ?? null;
              skillScore = player.skillScore ?? null;
            }
          }

          return {
            name: booking.user?.name ?? 'Player',
            level,
            skillScore,
            linkedPlayerId: booking.user?.linkedPlayerId ?? null,
          };
        })
      );

      res.json(players);
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
