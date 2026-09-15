// Abandon — what the Ziina cancel return (CheckoutCancel.tsx) may do to a booking, as a pure decision over injected
// deps. It only ever cancels an UNPAID pending drop-in: Ziina is asked first, every other state is a no-op, and the
// row records why ('checkout_abandoned') so a payment that still lands on it is honoured (restored or flagged) by
// confirmZiinaBookingByIntentId, exactly like a guard-superseded row.
//
// Why (2026-09-15): the page used to fire the full player-cancel endpoint on mount for whatever state the booking
// was in — a confirmed seat inside the late window or a promoted pending_payment seat would have been cancelled with
// no refund choice, and a webview reload re-fired it.
import type { Booking, Payment } from "@shared/schema";
import { ziinaIntentIsPaid, ziinaIntentIsDead, isRequiresInstrument } from "./rebookGuard";

/** cancellation_reason written by the abandon route — never by a player cancel. */
export const CHECKOUT_ABANDONED_REASON = 'checkout_abandoned';

export type AbandonDeps = {
  getPayments(bookingId: string): Promise<Array<Pick<Payment, 'status' | 'ziinaPaymentIntentId'>>>;
  retrieveIntent(intentId: string): Promise<{ status: string }>;
};
export type AbandonDecision =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'already_cancelled' }
  | { kind: 'not_pending'; status: string }
  | { kind: 'paid'; intentId: string; intentStatus: string }
  | { kind: 'unavailable' }
  | { kind: 'in_flight'; intentStatus: string }
  | { kind: 'abandon'; booking: Booking };

export async function decideAbandon(booking: Booking | null | undefined, userId: string, deps: AbandonDeps): Promise<AbandonDecision> {
  if (!booking) return { kind: 'not_found' };
  if (booking.userId !== userId) return { kind: 'forbidden' };
  // An IQ Pass seat is never cancelled from the checkout return — the 30-minute hold lapses on its own.
  if (booking.packId) return { kind: 'not_pending', status: 'iq_pass_seat' };
  if (booking.status === 'cancelled') return { kind: 'already_cancelled' };
  if (booking.status !== 'pending') return { kind: 'not_pending', status: booking.status };

  // Ledger first: a completed payment row means it is paid — confirm it, never abandon it.
  const payments = await deps.getPayments(booking.id);
  const paidRow = payments.find((p) => p.status === 'completed');
  if (paidRow) return { kind: 'paid', intentId: paidRow.ziinaPaymentIntentId ?? booking.ziinaPaymentIntentId ?? '', intentStatus: 'completed' };

  if (!booking.ziinaPaymentIntentId) return { kind: 'abandon', booking };

  // Then Ziina — FAIL CLOSED: on uncertainty the booking is left alone.
  let status: string;
  try { status = (await deps.retrieveIntent(booking.ziinaPaymentIntentId)).status; }
  catch { return { kind: 'unavailable' }; }
  if (ziinaIntentIsPaid(status)) return { kind: 'paid', intentId: booking.ziinaPaymentIntentId, intentStatus: status };
  // In flight (pending / processing / requires_action): the player may be mid-payment in another tab — leave it alone.
  if (!ziinaIntentIsDead(status) && !isRequiresInstrument(status)) return { kind: 'in_flight', intentStatus: status };
  return { kind: 'abandon', booking };
}
