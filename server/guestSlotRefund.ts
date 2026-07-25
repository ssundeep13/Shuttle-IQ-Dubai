import { storage } from "./storage";
import { db } from "./db";
import { players, type Booking } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { applyWalletDelta } from "./walletLedger";
import { sendWaitlistPromotionEmail } from "./emailClient";
import { sessionStartEpochMs } from "@shared/sessionTime";
import { formatDubaiDeadline, paymentDeadline } from "@shared/dubaiTime";

/**
 * Shared money + capacity logic for cancelling a single guest slot on a
 * multi-spot booking. Used by all three guest-cancel endpoints so the
 * proration, ledger decrement, refund settle and waitlist promotion behave
 * identically regardless of who cancels (primary booker, linked guest, or
 * guest via emailed token).
 */

/**
 * Shared late-cancellation cutoff — the SINGLE source of truth for the 5-hour
 * rule. True when `at` is inside the 5h window before session start (forfeit
 * territory). Both the whole-booking cancel path and the guest-slot cancel path
 * call this, so the rule is defined once. (The unrelated 25h availability window
 * in storage.ts and the client-side display copy are intentionally left alone.)
 */
export function isWithinLateCancelWindow(
  session: { date: Date | string; startTime: string },
  at: Date = new Date(),
): boolean {
  // Timezone-explicit (Asia/Dubai) via the shared helper, so the server and the
  // client compute the same cutoff instant to the millisecond (fixes P0-3).
  const cutoffMs = sessionStartEpochMs(session.date, session.startTime) - 5 * 60 * 60 * 1000;
  return at.getTime() >= cutoffMs;
}

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
 * (Retained for callers/tests; settleCancelledGuestSlot now prorates inline so
 * it can split the wallet- vs card-funded shares.)
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
  /** Cancelled within 5h of start — spot freed, amounts decremented, NO refund. */
  forfeited: boolean;
  /** Session timing couldn't be determined — flagged for admin review, no auto-refund. */
  manualReview: boolean;
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
    /** Ziina only: the primary booker may divert the CARD refund to wallet instead
     *  of bank. Wallet-FUNDED money always returns to the payer's wallet regardless. */
    allowWallet: boolean;
  },
): Promise<GuestSlotSettleResult> {
  // ── Prorate this spot's value into its wallet- and card-funded shares.
  //    Uncapped on purpose (unlike computeGuestSlotRefundFils, whose card cap is
  //    only for the bank figure): the decrements below must reflect the FULL spot
  //    value for every payment type so the record can never over-refund later.
  const spots = booking.spotsBooked ?? 1;
  const chargeableSpots = booking.birthdayDiscountApplied ? Math.max(1, spots - 1) : Math.max(1, spots);
  const walletUsedFils = booking.walletAmountUsed ?? 0;
  const spotValueFils = Math.round((booking.amountAed * 100) / chargeableSpots);
  const spotWalletFils = Math.min(Math.round(walletUsedFils / chargeableSpots), walletUsedFils);
  const spotCardFils = Math.max(0, spotValueFils - spotWalletFils);

  // ── Decrement ALWAYS (refund, forfeit, or manual review) — spots + BOTH money
  //    columns, for every payment type. This is what permanently kills the
  //    over-refund: a later whole-booking cancel reads the reduced amount/wallet.
  await storage.updateBooking(booking.id, {
    spotsBooked: opts.newSpotsBooked,
    amountAed: Math.max(0, booking.amountAed - Math.round(spotValueFils / 100)),
    walletAmountUsed: Math.max(0, walletUsedFils - spotWalletFils),
  });

  // ── Forfeit decision via the shared 5h helper. Fail-safe on a missing session:
  //    we cannot positively confirm we're OUTSIDE the window, so we neither
  //    silently forfeit nor silently refund — flag for manual admin review.
  const session = await storage.getBookableSession(booking.sessionId);
  if (!session) {
    await storage.createMarketplaceNotification({
      userId: booking.userId,
      type: "refund_required",
      title: "Manual review — guest spot cancelled",
      message: `A guest spot was cancelled but the session timing could not be determined automatically. Review whether a refund of up to AED ${(spotValueFils / 100).toFixed(2)} is owed.`,
      relatedBookingId: booking.id,
      refundAmountFils: spotValueFils,
      refundPreference: "bank",
    });
    return { proratedAed: 0, settledToWallet: false, pendingFlagged: true, forfeited: false, manualReview: true };
  }
  if (isWithinLateCancelWindow(session)) {
    // Within 5h of start → forfeit. Spot freed + amounts decremented above; no
    // money moves and no Pending entry is created. Mirrors the whole-booking rule.
    return { proratedAed: 0, settledToWallet: false, pendingFlagged: false, forfeited: true, manualReview: false };
  }

  // ── Refund-eligible (outside 5h). The wallet-FUNDED share always returns to the
  //    payer's wallet (their own spent credit) regardless of who cancelled — a
  //    wallet booking has no bank fallback. The card-FUNDED share follows today's
  //    Ziina rule (bank Pending, or the primary booker's wallet opt-in).
  //    Idempotency: the caller claimed the slot atomically
  //    (markGuestSlotCancelled), so this runs exactly once per slot.
  const payer = await storage.getMarketplaceUser(booking.userId);
  let settledToWallet = false;
  let pendingFlagged = false;
  let walletCreditedFils = 0;
  let bankShareFils = 0;

  const creditWallet = async (fils: number, desc: string) => {
    await db.transaction(async (tx) => {
      await applyWalletDelta(tx, {
        playerId: payer!.linkedPlayerId!,
        deltaFils: fils,
        type: "cancellation_refund",
        relatedBookingId: booking.id,
        description: desc,
        createdBy: "player",
      });
    });
    await storage.createMarketplaceNotification({
      userId: booking.userId,
      type: "wallet_refund_credited",
      title: "Wallet credit added",
      message: `AED ${(fils / 100).toFixed(2)} for the cancelled guest spot has been added to your ShuttleIQ wallet.`,
      relatedBookingId: booking.id,
    });
    settledToWallet = true;
    walletCreditedFils += fils;
  };

  // (1) Wallet-funded share → payer's wallet. Covers wallet bookings entirely;
  //     for ziina+partial-wallet it returns the spent-credit slice exactly as the
  //     whole-booking path always does. Fully-ziina bookings have 0 here → no-op.
  if (spotWalletFils > 0) {
    if (payer?.linkedPlayerId) {
      await creditWallet(spotWalletFils, "Cancelled guest spot — wallet-funded share returned to wallet");
    } else {
      bankShareFils += spotWalletFils; // no wallet to credit — never drop it
    }
  }

  // (2) Card-funded share. Unchanged behaviour for Ziina bookings: the primary
  //     booker may divert to wallet (allowWallet); otherwise it goes to bank Pending.
  if (booking.paymentMethod === "ziina" && booking.ziinaPaymentIntentId && spotCardFils > 0) {
    if (opts.refundPreference === "wallet" && opts.allowWallet && payer?.linkedPlayerId) {
      await creditWallet(spotCardFils, "Cancelled guest spot refunded to wallet (payer choice)");
    } else {
      bankShareFils += spotCardFils;
    }
  } else if (spotCardFils > 0 && booking.paymentMethod !== "ziina") {
    bankShareFils += spotCardFils; // non-ziina residual (shouldn't occur) — flag, don't drop
  }

  // (3) Bank Pending entry for anything settled out-of-band — accumulated
  //     idempotently onto one unresolved row so multi-guest cancels never under-flag.
  if (bankShareFils > 0) {
    const intentNote = booking.ziinaPaymentIntentId ? ` (intent ${booking.ziinaPaymentIntentId})` : "";
    const existing = await storage.getRefundNotificationByBooking(booking.id);
    if (existing && !existing.read) {
      const newTotalFils = (existing.refundAmountFils ?? 0) + bankShareFils;
      await storage.updateNotificationRefundAmount(
        existing.id,
        newTotalFils,
        `Guest slot(s) cancelled. Total refund of AED ${(newTotalFils / 100).toFixed(2)} owed to the player's bank via the Ziina dashboard${intentNote}.`,
      );
    } else {
      await storage.createMarketplaceNotification({
        userId: booking.userId,
        type: "refund_required",
        title: "Partial refund required",
        message: `Guest slot cancelled. Refund AED ${(bankShareFils / 100).toFixed(2)} to the player's bank via the Ziina dashboard${intentNote}.`,
        relatedBookingId: booking.id,
        refundAmountFils: bankShareFils,
        refundPreference: "bank",
      });
    }
    pendingFlagged = true;
  }

  return {
    proratedAed: (walletCreditedFils + bankShareFils) / 100,
    settledToWallet,
    pendingFlagged,
    forfeited: false,
    manualReview: false,
  };
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

  const promotedAt = new Date();
  await storage.updateBooking(first.id, {
    status: "pending_payment",
    waitlistPosition: null,
    promotedAt,
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
    // Explicit Asia/Dubai deadline — the server clock is UTC, so a locally
    // formatted time would state an hour the player never sees.
    message: `A spot opened up for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}. Complete payment by ${formatDubaiDeadline(paymentDeadline(promotedAt))} to secure your spot.`,
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

/**
 * Promote up to maxPromotions waitlisted bookings (Gate W2 — the capacity-
 * increase trigger). ALL capacity math stays inside the per-call promote
 * function, which recomputes free spots (confirmed + attended +
 * pending_payment reserved) on every iteration and returns null when
 * nothing fits or the waitlist is empty — so an organic booking landing
 * mid-loop shrinks or stops the run, never oversells. The loop's only own
 * guard is the hard iteration cap. `promote` is injectable for tests.
 */
export async function promoteWaitlistForFreedSpots(
  sessionId: string,
  maxPromotions: number,
  promote: (sid: string) => Promise<{ bookingId: string; userId: string } | null> = promoteFirstFittingWaitlisted,
): Promise<number> {
  let promoted = 0;
  for (let i = 0; i < maxPromotions; i++) {
    const result = await promote(sessionId);
    if (!result) break;
    promoted++;
  }
  return promoted;
}
