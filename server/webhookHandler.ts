import crypto from "crypto";
import type { Express } from "express";
import express from "express";
import { storage } from "./storage";
import { isZiinaPaymentSuccessful, isZiinaRefundSuccessful } from "./ziinaClient";
import { fireReferralOnPayment } from "./referrals";
import {
  sendBookingConfirmationEmail,
  sendGuestBookingEmail,
  sendRefundProcessedEmail,
} from "./emailClient";

// Confirms a pending extra-guest slot whose Ziina payment has completed.
// Called by confirmZiinaBookingByIntentId (webhook path) AND by the
// /confirm-guest poll endpoint. Looks up the guest directly via
// pending_payment_intent_id — the only reliable path for guest intents,
// which are never stored in bookings.ziina_payment_intent_id.
export async function confirmGuestByIntentId(
  intentId: string,
): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean; error?: string }> {
  const pendingGuest = await storage.getBookingGuestByPendingPaymentIntentId(intentId);
  if (!pendingGuest) {
    console.warn(`[Ziina] No extra-guest found for payment intent ${intentId}`);
    return { confirmed: false, error: "guest_not_found" };
  }

  const parentBooking = await storage.getBooking(pendingGuest.bookingId);
  if (!parentBooking) {
    console.warn(`[Ziina] Parent booking not found for extra-guest intent ${intentId}`);
    return { confirmed: false, error: "booking_not_found" };
  }

  // Idempotency — webhook may have beaten us here
  if (pendingGuest.status === "confirmed") return { confirmed: true, alreadyConfirmed: true };

  // Confirm the guest slot and clear the pending intent ID
  await storage.updateBookingGuest(pendingGuest.id, {
    status: "confirmed",
    pendingPaymentIntentId: null,
  });

  // Increment parent booking spots and amount
  const session = await storage.getBookableSession(parentBooking.sessionId);
  const priceAed = session?.priceAed ?? 0;
  await storage.updateBooking(parentBooking.id, {
    spotsBooked: (parentBooking.spotsBooked ?? 1) + 1,
    amountAed: parentBooking.amountAed + priceAed,
  });

  // Record payment (idempotent)
  const existingPayments = await storage.getPaymentsByBookingId(parentBooking.id);
  if (!existingPayments.some((p) => p.ziinaPaymentIntentId === intentId)) {
    await storage.createPayment({
      bookingId: parentBooking.id,
      ziinaPaymentIntentId: intentId,
      amount: priceAed,
      currency: "aed",
      status: "completed",
      completedAt: new Date(),
    });
  }

  // Send guest booking email (fire-and-forget)
  try {
    const booker = await storage.getMarketplaceUser(parentBooking.userId);
    const guestBaseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:5000";
    if (booker && session && pendingGuest.email && pendingGuest.cancellationToken) {
      const cancelGuestUrl = `${guestBaseUrl}/marketplace/guests/cancel/${pendingGuest.cancellationToken}`;
      const signupUrl = `${guestBaseUrl}/marketplace/signup?email=${encodeURIComponent(pendingGuest.email)}`;
      sendGuestBookingEmail(pendingGuest.email, pendingGuest.name, booker.name, session, cancelGuestUrl, signupUrl).catch(() => {});
    }
  } catch (err) {
    console.error("[Ziina] Extra-guest email failed:", err);
  }

  return { confirmed: true };
}

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

  // No booking found — delegate to the dedicated extra-guest confirmation path
  if (!booking) {
    return confirmGuestByIntentId(intentId);
  }

  // Defence in depth: never resurrect a booking the player deliberately
  // cancelled. The reconciliation sweep must not re-confirm/re-waitlist or email
  // a cancelled booking just because its Ziina intent reads "completed".
  if (booking.cancelledAt) {
    console.log(`[Reconcile] Skipped ${booking.id} — player-cancelled, not resurrecting`);
    return { confirmed: false };
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

  // Birthday free-game: the discount is "consumed" only when the booking
  // actually confirms (here), not at submission — so an abandoned Ziina payment
  // never burns the player's once-a-year discount. Idempotent: the already-
  // confirmed early-return above means this runs at most once per booking.
  if (booking.birthdayDiscountApplied) {
    await storage.updateMarketplaceUser(booking.userId, { birthdayDiscountUsedAt: new Date() });
  }

  // PR2 trigger site 1/5: Ziina happy-path payment confirmation. Covers both
  // the webhook delivery and the POST /bookings/:id/confirm poll fallback
  // (which delegates here). Fire-and-forget — referral failure must not
  // affect payment confirmation.
  fireReferralOnPayment(booking.userId, booking.id);

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

      // Ziina webhook envelope (per docs): { event: "<type>", data: { ...object... } }
      // The event object — the payment intent for payment_intent.* events, the
      // refund for refund.* events — lives under `data` (its id/status are at the
      // object's top level). Fallbacks handle alternate shapes defensively: a
      // Stripe-style data.object wrapper, a legacy payment_intent wrapper, or the
      // object at the very top level.
      const paymentIntent: any =
        payload.data?.object ?? payload.data ?? payload.payment_intent ?? payload;
      const intentId: string | undefined = paymentIntent?.id;
      const intentStatus: string | undefined = paymentIntent?.status;
      const eventType: string | undefined = payload.event;

      console.log(`[Ziina Webhook] Received event="${eventType}" intentId="${intentId}" status="${intentStatus}"`);

      // Refund events: refund.completed | refund.failed. The webhook is the
      // SOURCE OF TRUTH for terminal refund state — it overwrites the payment
      // row's refund_status by intent id. On terminal success it also resolves
      // the refund_required notification + emails the player, idempotently
      // (harmless whether the synchronous process response or this webhook
      // arrives first).
      if (eventType && eventType.startsWith("refund.")) {
        const refundObj: any = payload.refund ?? paymentIntent;
        const refundIntentId: string | undefined =
          refundObj?.payment_intent_id ?? refundObj?.payment_intent ?? intentId;
        const refundId: string | null = refundObj?.id ?? null;
        const refundStatus: string =
          refundObj?.status ?? (eventType === "refund.completed" ? "completed" : "failed");
        const refundAmount: number | null =
          typeof refundObj?.amount === "number" ? refundObj.amount : null;

        if (refundIntentId) {
          try {
            const result = await storage.markZiinaRefundFromWebhook({
              intentId: refundIntentId,
              refundId,
              status: refundStatus,
              amountFils: refundAmount,
              refundedAt: new Date(),
            });
            console.log(`[Ziina Webhook] refund event ${eventType} intent=${refundIntentId} →`, result);

            // On terminal success, finalize the workflow: resolve the
            // refund_required notification and email the player. Idempotent —
            // resolveRefundNotification is a no-op if already resolved.
            if (result.matched && result.bookingId && isZiinaRefundSuccessful(refundStatus)) {
              try {
                const notif = await storage.getUnresolvedRefundNotificationByBooking(result.bookingId);
                if (notif) {
                  await storage.resolveRefundNotification(notif.id);
                  if (notif.playerEmail && notif.bookingSessionId) {
                    const session = await storage.getBookableSession(notif.bookingSessionId);
                    if (session) {
                      // Email the cash amount actually refunded via Ziina —
                      // prefer the webhook's amount, else the recorded refund.
                      const refundedAed = (refundAmount ?? notif.refundedAmount ?? 0) / 100;
                      sendRefundProcessedEmail(
                        notif.playerEmail,
                        notif.playerName ?? 'there',
                        session,
                        refundedAed,
                        refundId ?? notif.ziinaRefundId ?? '',
                      ).catch((err) => console.error('[Ziina Webhook] refund email failed', err));
                    }
                  }
                }
              } catch (err) {
                console.error("[Ziina Webhook] Error finalizing refund notification:", err);
              }
            }
          } catch (err) {
            console.error("[Ziina Webhook] Error handling refund event:", err);
          }
        }
        return res.status(200).json({ received: true });
      }

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
