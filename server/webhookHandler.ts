import crypto from "crypto";
import type { Express } from "express";
import express from "express";
import { storage } from "./storage";
import { isZiinaPaymentSuccessful } from "./ziinaClient";
import {
  sendBookingConfirmationEmail,
  sendGuestBookingEmail,
} from "./emailClient";

// Shared confirmation logic — called by both the webhook handler and the
// admin-triggered /confirm endpoint. Finds the booking by Ziina payment intent
// ID and confirms it idempotently if the payment is successful.
export async function confirmZiinaBookingByIntentId(
  intentId: string,
  intentStatus: string
): Promise<{ confirmed: boolean; waitlisted?: boolean; alreadyConfirmed?: boolean; error?: string }> {
  if (!isZiinaPaymentSuccessful(intentStatus)) {
    return { confirmed: false };
  }

  const booking = await storage.getBookingByZiinaPaymentIntentId(intentId);
  if (!booking) {
    console.warn(`[Ziina Webhook] No booking found for payment intent ${intentId}`);
    return { confirmed: false, error: "booking_not_found" };
  }

  if (booking.status === "confirmed") {
    return { confirmed: true, alreadyConfirmed: true };
  }

  // Re-check capacity before confirming (race protection — skip for pending_payment which
  // already has a reserved spot from waitlist promotion).
  if (booking.status !== "pending_payment") {
    const sessionForCapacity = await storage.getBookableSessionWithAvailability(booking.sessionId);
    const neededSpots = booking.spotsBooked ?? 1;
    if (sessionForCapacity && sessionForCapacity.spotsRemaining < neededSpots) {
      const waitlistCount = await storage.getWaitlistCountForSession(booking.sessionId);
      await storage.updateBooking(booking.id, {
        status: "waitlisted",
        waitlistPosition: waitlistCount + 1,
      });
      return { confirmed: false, waitlisted: true };
    }
  }

  await storage.updateBooking(booking.id, { status: "confirmed" });

  const existingPayments = await storage.getPaymentsByBookingId(booking.id);
  const alreadyRecorded = existingPayments.some((p) => p.ziinaPaymentIntentId === intentId);
  if (!alreadyRecorded) {
    const now = new Date();
    await storage.createPayment({
      bookingId: booking.id,
      ziinaPaymentIntentId: intentId,
      amount: booking.amountAed,
      currency: "aed",
      status: "completed",
      completedAt: now,
    });
  }

  // Fire-and-forget emails + guest slot confirmation
  try {
    const user = await storage.getMarketplaceUser(booking.userId);
    const session = await storage.getBookableSession(booking.sessionId);
    if (user && session) {
      sendBookingConfirmationEmail(user.email, user.name, session, "ziina", booking.amountAed).catch(() => {});

      const guestBaseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:5000";

      const pendingGuests = await storage.getBookingGuests(booking.id);
      for (const guest of pendingGuests) {
        if (guest.status === "pending") {
          await storage.updateBookingGuest(guest.id, { status: "confirmed" });
          if (!guest.isPrimary && guest.email && guest.cancellationToken) {
            const cancelGuestUrl = `${guestBaseUrl}/marketplace/guests/cancel/${guest.cancellationToken}`;
            const signupUrl = `${guestBaseUrl}/marketplace/signup?email=${encodeURIComponent(guest.email)}`;
            sendGuestBookingEmail(guest.email, guest.name, user.name, session, cancelGuestUrl, signupUrl).catch(() => {});
          }
          if (!guest.isPrimary && guest.linkedUserId) {
            await storage.createMarketplaceNotification({
              userId: guest.linkedUserId,
              type: "guest_booking_confirmed",
              title: "You have a booking!",
              message: `${user.name} added you as a guest for "${session.title}" on ${new Date(session.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${session.venueName}.`,
              relatedBookingId: booking.id,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Ziina Webhook] Email/guest confirm failed:", err);
  }

  return { confirmed: true };
}

// Register the Ziina webhook endpoint on the Express app.
// MUST be called BEFORE app.use(express.json()) so we can read the raw body
// for HMAC-SHA256 signature verification.
export function registerZiinaWebhookRoute(app: Express) {
  app.post(
    "/api/webhooks/ziina",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const rawBody: Buffer = req.body;
      const webhookSecret = process.env.ZIINA_WEBHOOK_SECRET;

      // Verify HMAC-SHA256 signature if a secret is configured.
      // Ziina sends the hex-encoded HMAC-SHA256 of the raw body in X-Hmac-Signature.
      const sigHeader =
        (req.headers["x-hmac-signature"] as string) ||
        (req.headers["x-ziina-signature"] as string) ||
        "";

      if (webhookSecret) {
        // Secret is configured — signature is REQUIRED. Missing or invalid signature
        // means we acknowledge receipt (200) but do not process the event.
        if (!sigHeader) {
          console.warn("[Ziina Webhook] Secret is configured but X-Hmac-Signature header is missing — ignoring event");
          return res.status(200).json({ received: true });
        }

        const expectedSig = crypto
          .createHmac("sha256", webhookSecret)
          .update(rawBody)
          .digest("hex");

        const sigBuf = Buffer.from(sigHeader, "utf8");
        const expectedBuf = Buffer.from(expectedSig, "utf8");
        const signaturesMatch =
          sigBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(sigBuf, expectedBuf);

        if (!signaturesMatch) {
          console.warn("[Ziina Webhook] Invalid HMAC signature — ignoring event");
          return res.status(200).json({ received: true });
        }
      } else {
        console.warn("[Ziina Webhook] ZIINA_WEBHOOK_SECRET not set — skipping signature verification");
      }

      let payload: any;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        console.error("[Ziina Webhook] Failed to parse JSON body — ignoring event");
        return res.status(200).json({ received: true });
      }

      // Ziina sends: { event: "payment_intent.status.updated", payment_intent: { id, status, ... } }
      // Some older docs show the payment intent object at the top level — handle both.
      const paymentIntent: any = payload.payment_intent ?? payload;
      const intentId: string | undefined = paymentIntent?.id;
      const intentStatus: string | undefined = paymentIntent?.status;
      const eventType: string | undefined = payload.event;

      console.log(`[Ziina Webhook] Received event="${eventType}" intentId="${intentId}" status="${intentStatus}"`);

      // Only process payment_intent.status.updated events (ignore everything else).
      if (eventType && eventType !== "payment_intent.status.updated") {
        return res.status(200).json({ received: true });
      }

      if (!intentId || !intentStatus) {
        // Not enough info to act — acknowledge and ignore.
        return res.status(200).json({ received: true });
      }

      try {
        const result = await confirmZiinaBookingByIntentId(intentId, intentStatus);
        console.log(`[Ziina Webhook] confirmZiinaBookingByIntentId(${intentId}) →`, result);
      } catch (err) {
        console.error("[Ziina Webhook] Error confirming booking:", err);
        // Still return 200 so Ziina doesn't retry — the client-side polling is a fallback.
      }

      // Always return 200 so Ziina stops retrying regardless of our outcome.
      return res.status(200).json({ received: true });
    }
  );
}
