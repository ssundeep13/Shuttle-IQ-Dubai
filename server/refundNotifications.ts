import { storage } from "./storage";

/**
 * Surface a paid Ziina booking that is being cancelled in the admin Refunds
 * dashboard (a `refund_required` notification), so a refund is never silently
 * owed after a cancel. Self-contained and idempotent:
 *   - no-ops unless the booking has a captured, not-yet-refunded Ziina payment
 *     (payments.status = 'completed' AND refund_status IS NULL);
 *   - no-ops if a refund_required notification already exists for the booking,
 *     so the existing admin-session / guest-slot / bank-refund-choice paths are
 *     never duplicated.
 *
 * Wallet-refunded cancels are still surfaced (for admin visibility per spec),
 * but the copy makes clear that no Ziina/card action is owed — the admin
 * dismisses those via "Dismiss without refunding".
 */
export async function maybeCreateRefundNotification(bookingId: string): Promise<void> {
  try {
    const booking = await storage.getBooking(bookingId);
    if (!booking?.ziinaPaymentIntentId) return;

    // Only a captured, not-yet-refunded Ziina charge qualifies.
    const payments = await storage.getPaymentsByBookingId(bookingId);
    const captured = payments.find(
      (p) =>
        p.ziinaPaymentIntentId === booking.ziinaPaymentIntentId &&
        p.status === "completed" &&
        p.refundStatus == null,
    );
    if (!captured) return;

    // Idempotency: one refund_required per booking, ever.
    const existing = await storage.getRefundNotificationByBooking(bookingId);
    if (existing) return;

    const [user, session] = await Promise.all([
      storage.getMarketplaceUser(booking.userId),
      storage.getBookableSession(booking.sessionId),
    ]);
    const who = user?.name ?? "A player";
    const what = session?.title ?? "a session";
    const amount = booking.amountAed.toFixed(2);
    const walletRefunded =
      booking.refundMethod === "wallet" || booking.walletRefundedAt != null;

    // Option B: wallet refunds are already settled (the cash moved to the wallet
    // at cancel time) — there is no card refund owed, so they never enter Pending.
    if (booking.refundMethod === 'wallet' || booking.walletRefundedAt) return;

    await storage.createMarketplaceNotification({
      userId: booking.userId,
      type: "refund_required",
      title: walletRefunded
        ? "Wallet refund — for visibility, no Ziina action"
        : "Refund owed — booking cancelled",
      message: walletRefunded
        ? `${who} cancelled "${what}" and was refunded AED ${amount} to their ShuttleIQ wallet. No card refund is owed — dismiss after reviewing. (intent ${booking.ziinaPaymentIntentId})`
        : `${who} cancelled "${what}". Refund of AED ${amount} owed to the player's bank via the Ziina dashboard (intent ${booking.ziinaPaymentIntentId}).`,
      relatedBookingId: bookingId,
    });
  } catch (err) {
    console.error("[Refund] maybeCreateRefundNotification failed for", bookingId, err);
  }
}
