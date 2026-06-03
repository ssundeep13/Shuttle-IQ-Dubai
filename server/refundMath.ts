// Pure money-math + re-entry classification for the live "Refund via Ziina"
// admin flow (#231). Kept side-effect-free and dependency-light so the
// money-out correctness can be unit-tested without a DB or the Ziina API.
import { isZiinaRefundSuccessful } from './ziinaClient';

/**
 * Server-authoritative Ziina refund amount, in fils.
 *
 * The booking's `amountAed` is the FULL total (including any wallet-paid
 * portion). The wallet portion is returned to the player's wallet balance
 * separately at cancellation, so it must NEVER be refunded again as cash via
 * Ziina. We therefore refund only the cash Ziina actually captured:
 *
 *   min( amountAed*100 − walletAmountUsed , payments.amount )
 *
 * Capped at the captured payment amount as a second safety net, and floored at
 * 0 (a fully wallet-covered booking yields 0 → the caller rejects it).
 */
export function computeZiinaRefundFils(input: {
  amountAedTotal: number;        // bookings.amountAed (full total, integer AED)
  walletAmountUsedFils: number;  // bookings.walletAmountUsed (fils)
  // Captured cash IN FILS. NOTE: payments.amount is stored in whole AED, so the
  // caller MUST convert (payment.amount * 100) before passing it here — passing
  // the raw AED value caps every refund at ~1/100th of the owed amount.
  paymentCapturedFils: number;
}): number {
  const cashFromTotal = Math.round(input.amountAedTotal * 100) - (input.walletAmountUsedFils || 0);
  const capped = Math.min(cashFromTotal, input.paymentCapturedFils);
  return capped > 0 ? capped : 0;
}

export type RefundReentry = 'already_refunded' | 'resolved_blocked' | 'proceed';

/**
 * Decide how to handle a refund request given the row's current state. Encodes
 * the guard ordering used by the route:
 *   1. terminal-success refund already recorded → already_refunded (no re-charge)
 *   2. row already manually resolved            → resolved_blocked (refuse)
 *   3. otherwise                                → proceed
 */
export function classifyRefundReentry(input: { refundStatus: string | null; read: boolean }): RefundReentry {
  if (input.refundStatus && isZiinaRefundSuccessful(input.refundStatus)) return 'already_refunded';
  if (input.read) return 'resolved_blocked';
  return 'proceed';
}
