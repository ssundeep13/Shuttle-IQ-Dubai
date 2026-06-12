import { storage } from "./storage";
import { db } from "./db";
import { players, type Booking } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { applyWalletDelta } from "./walletLedger";
import { sendWaitlistPromotionEmail } from "./emailClient";

/**
 * Shared money + capacity logic for cancelling a single guest slot on a
 * multi-spot booking. Used by all three guest-cancel endpoints so the
 * proration, ledger decrement, refund settle and waitlist promotion behave
 * identically regardless of who cancels (primary booker, linked guest, or
 * guest via emailed token).
 */

/**
 * The cancelled slot's share of the booking, in fils.
 *
 * Birthday-aware: on a birthday booking the primary spot was free, so only
 * (spotsBooked - 1) spots were ever charged — the cancelled guest's share is
 * amountAed / chargeableSpots, not amountAed / spotsBooked. For a 2-spot
 * birthday booking (AED 49 charged) that is the full AED 49, not 24.50.
 *
 * Capped at the card-captured remainder (amountAed minus wallet credit spent)
 * so a flagged bank refund can never exceed what Ziina actually captured.
 */
export function computeGuestSlotRefundFils(booking: Booking): number {
  const spots = booking.spotsBooked ?? 1;
  const chargeableSpots = booking.birthdayDiscountApplied
    ? Math.max(1, spots - 1)
    : Math.max(1, spots);
  const proratedFils = Math.round((booking.amountAed * 100) / chargeableSpots);
  const cardRemainderFils = booking.amountAed * 100 - (booking.walletAmountUsed ?? 0);
  return Math.min(proratedFils, Math.max(0, cardRemainderFils));
}

export interface GuestSlotSettleResult {
  proratedAed: number;
  settledToWallet: boolean;
  pendingFlagged: boolean;
}

/**
 * Settle the money side of a cancelled guest slot, and write the booking's
 * new spot count + decremented amount in ONE update.
 *
 * - Decrements bookings.amountAed by the prorated share so a later
 *   whole-booking cancel refunds only what remains (never the full original).
 * - preference 'wallet' (allowed for the primary booker only): credits the
 *   prorated fils to the payer's wallet immediately — already settled, so NO
 *   Pending Refunds entry is created.
 * - preference 'bank' (or anything else): creates an idempotent
 *   refund_required entry carrying the prorated amount + preference so the
 *   Refunds tab shows exactly what Shannon should refund in Ziina.
 */
export async function settleCancelledGuestSlot(
  booking: Booking,
  opts: {
    newSpotsBooked: number;
    refundPreference?: string;
    /** Wallet credit moves the payer's money — only the payer (primary booker) may choose it. */
    allowWallet: boolean;
  },
): Promise<GuestSlotSettleResult> {
  const proratedFils = computeGuestSlotRefundFils(booking);
  const refundable =
    booking.paymentMethod === "ziina" &&
    !!booking.ziinaPaymentIntentId &&
    proratedFils > 0;

  // One write: spots always; amountAed only when a paid share is released.
  const newAmountAed = Math.max(0, booking.amountAed - Math.round(proratedFils / 100));
  await storage.updateBooking(booking.id, {
    spotsBooked: opts.newSpotsBooked,
    ...(refundable ? { amountAed: newAmountAed } : {}),
  });

  if (!refundable) return { proratedAed: 0, settledToWallet: false, pendingFlagged: false };
  const proratedAed = proratedFils / 100;

  if (opts.refundPreference === "wallet" && opts.allowWallet) {
    const payer = await storage.getMarketplaceUser(booking.userId);
    if (payer?.linkedPlayerId) {
      // Ledger site #10 (cancellation_refund): balance + ledger atomically.
      await db.transaction(async (tx) => {
        await applyWalletDelta(tx, {
          playerId: payer.linkedPlayerId!,
          deltaFils: proratedFils,
          type: "cancellation_refund",
          relatedBookingId: booking.id,
          description: "Cancelled guest spot refunded to wallet (payer choice)",
          createdBy: "player",
        });
      });
      await storage.createMarketplaceNotification({
        userId: booking.userId,
        type: "wallet_refund_credited",
        title: "Wallet credit added",
        message: `AED ${proratedAed.toFixed(2)} for the cancelled guest spot has been added to your ShuttleIQ wallet.`,
        relatedBookingId: booking.id,
      });
      return { proratedAed, settledToWallet: true, pendingFlagged: false };
    }
    // No linked player wallet to credit — fall through to the bank path so
    // the refund is never silently dropped.
  }

  // Amount-accurate idempotency: one UNRESOLVED Pending row per booking.
  // - Unresolved entry exists → accumulate this slot's share onto it and
  //   restate the total in the message (multi-guest cancels never under-flag).
  // - Resolved entry exists → never reopen or mutate it; create a fresh entry
  //   for the new amount.
  // - No entry → create one.
  const existing = await storage.getRefundNotificationByBooking(booking.id);
  if (existing && !existing.read) {
    const newTotalFils = (existing.refundAmountFils ?? 0) + proratedFils;
    await storage.updateNotificationRefundAmount(
      existing.id,
      newTotalFils,
      `Guest slots cancelled on Ziina booking. Total refund of AED ${(newTotalFils / 100).toFixed(2)} owed to the player's bank via the Ziina dashboard (intent ${booking.ziinaPaymentIntentId}).`,
    );
    return { proratedAed, settledToWallet: false, pendingFlagged: true };
  }

  await storage.createMarketplaceNotification({
    userId: booking.userId,
    type: "refund_required",
    title: "Partial refund required",
    message: `Guest slot cancelled on Ziina booking. Refund AED ${proratedAed.toFixed(2)} to the player's bank via the Ziina dashboard (intent ${booking.ziinaPaymentIntentId}).`,
    relatedBookingId: booking.id,
    refundAmountFils: proratedFils,
    refundPreference: "bank",
  });
  return { proratedAed, settledToWallet: false, pendingFlagged: true };
}

/**
 * Promote the first waitlisted booking that fits the session's freed
 * capacity. Mirrors the whole-booking cancel's promotion logic (every
 * promotion is a Ziina pending_payment hold with a 4-hour window); the
 * guest-cancel paths previously freed a spot without ever running this.
 */
export async function promoteFirstFittingWaitlisted(
  sessionId: string,
): Promise<{ bookingId: string; userId: string } | null> {
  const bookableSession = await storage.getBookableSession(sessionId);
  if (!bookableSession) return null;
  const waitlisted = await storage.getWaitlistedBookingsForSession(sessionId);
  if (waitlisted.length === 0) return null;

  const currentCount = await storage.getBookingCountForSession(sessionId);
  const spotsAvailable = bookableSession.capacity - currentCount;
  const first = waitlisted.find((w) => (w.spotsBooked ?? 1) <= spotsAvailable);
  if (!first) return null;

  await storage.updateBooking(first.id, {
    status: "pending_payment",
    waitlistPosition: null,
    promotedAt: new Date(),
  });

  const dateLabel = new Date(bookableSession.date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  await storage.createMarketplaceNotification({
    userId: first.userId,
    type: "waitlist_promoted",
    title: "Spot available — complete payment!",
    message: `A spot opened up for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}. You have 4 hours to complete payment to secure your spot.`,
    relatedBookingId: first.id,
  });

  try {
    const promotedUser = await storage.getMarketplaceUser(first.userId);
    if (promotedUser) {
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:5000";
      sendWaitlistPromotionEmail(
        promotedUser.email,
        promotedUser.name,
        bookableSession,
        `${baseUrl}/marketplace/my-bookings`,
      ).catch(() => {});
    }
  } catch (emailErr) {
    console.error("[Email] waitlist promotion lookup failed:", emailErr);
  }

  // Re-number remaining waitlisted bookings (exclude the promoted one)
  const remaining = waitlisted.filter((w) => w.id !== first.id);
  for (let i = 0; i < remaining.length; i++) {
    await storage.updateBooking(remaining[i].id, { waitlistPosition: i + 1 });
  }

  return { bookingId: first.id, userId: first.userId };
}
