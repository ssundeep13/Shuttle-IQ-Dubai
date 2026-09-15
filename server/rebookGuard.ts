// Re-book guard — the decision a drop-in booking request makes about the player's EXISTING booking on the same
// session, as a pure function over injected deps (no db, no Ziina import) so the money rules are unit-testable.
//
// Why this exists (2026-09-14/15): a booking request that fired twice within one second made the route cancel the
// first, seconds-old booking ("unpaid at this instant") and mint a second intent; the player had already been sent
// to the first intent's Ziina page and paid it. Ten players since June paid twice this way. Rules now:
//   1. A repeat inside the payment window REUSES the existing pending booking and its intent — the same request →
//      the same redirect; a different request (spots / wallet intent / guests) → 409 pending_booking_exists with
//      that booking.
//   2. A booking whose intent is younger than the payment window is NEVER cancelled by a re-book, unless Ziina says
//      the intent is dead (declined / failed / expired…) or there is no intent at all.
//   3. When the guard does supersede an old, verified-unpaid booking it says so — cancellation_reason
//      'rebook_superseded' — so confirmZiinaBookingByIntentId and the reconciliation sweep can still honour a
//      payment that lands on it (restore the seat, or flag it) instead of treating it as a player cancel.
import type { Booking, Payment } from "@shared/schema";

/** The drop-in payment window (mirrors scheduler PAYMENT_WINDOW_MS): inside it a pending booking is still live. */
export const REBOOK_GRACE_MS = 4 * 60 * 60 * 1000;
/** cancellation_reason written by the guard — never by a player cancel. */
export const REBOOK_SUPERSEDED_REASON = 'rebook_superseded';
/** Written once a payment on a superseded row has been recorded and flagged for admin: the decision is final, the
 *  row is resolved only through the refund flow — the sweep and the confirm path never re-decide it. */
export const REBOOK_REFUND_PENDING_REASON = 'rebook_refund_pending';
/** Ziina statuses under which an intent can never be paid; a fresh intent is the only way forward. */
const DEAD_STATUSES = ['failed', 'expired', 'cancelled', 'canceled', 'declined', 'rejected'];
const SUCCESS_STATUSES = ['completed', 'paid', 'succeeded', 'success', 'authorized', 'captured', 'approved'];

export function ziinaIntentIsDead(status: string | null | undefined): boolean {
  return DEAD_STATUSES.includes(String(status ?? '').toLowerCase());
}
export function ziinaIntentIsPaid(status: string | null | undefined): boolean {
  return SUCCESS_STATUSES.includes(String(status ?? '').toLowerCase());
}
const isPaid = ziinaIntentIsPaid;

/** The guest set as one comparable string: order-insensitive, case/space-normalised name|email pairs. */
export function guestKeyOf(guests: Array<{ name: string; email?: string | null }>): string {
  return guests.map((g) => `${g.name.trim().toLowerCase()}|${(g.email ?? '').trim().toLowerCase()}`).sort().join(';');
}

/** The request carries only the wallet INTENT (the server computes the amount) and the guest key (guestKeyOf).
 *  `replace` is the player's explicit "change my booking": a differently-shaped request inside the window then
 *  supersedes the unpaid young booking on purpose instead of answering 409. */
export type RebookRequest = { spotsBooked: number; applyWallet: boolean; guestKey: string; replace?: boolean };
export type RebookDeps = {
  now(): Date;
  getPayments(bookingId: string): Promise<Array<Pick<Payment, 'status' | 'ziinaPaymentIntentId'>>>;
  retrieveIntent(intentId: string): Promise<{ status: string; redirect_url?: string }>;
  /** guestKeyOf over the existing booking's non-primary guest rows. */
  getGuestKey(bookingId: string): Promise<string>;
  sleep(ms: number): Promise<void>;
};
export type RebookDecision =
  | { kind: 'none' }
  | { kind: 'reuse'; booking: Booking; redirectUrl: string | null }
  | { kind: 'already_paid'; booking: Booking; intentId: string; intentStatus: string }
  | { kind: 'blocked'; status: number; error: string; booking?: Booking; redirectUrl?: string | null }
  | { kind: 'supersede'; booking: Booking; reason: string; flagPossiblyPaid: boolean };

const ALREADY = (status: number, error: string, extra: Partial<Extract<RebookDecision, { kind: 'blocked' }>> = {}): RebookDecision => ({ kind: 'blocked', status, error, ...extra });

export async function decideRebook(existing: Booking | null | undefined, request: RebookRequest, deps: RebookDeps): Promise<RebookDecision> {
  if (!existing || existing.status === 'cancelled') return { kind: 'none' };
  if (existing.status !== 'pending') return ALREADY(400, 'You already have a booking for this session');

  // (1) Ledger guard — a completed payment row means it is paid; restore/confirm it, never cancel.
  const payments = await deps.getPayments(existing.id);
  const paidRow = payments.find((p) => p.status === 'completed');
  if (paidRow) return { kind: 'already_paid', booking: existing, intentId: paidRow.ziinaPaymentIntentId ?? existing.ziinaPaymentIntentId ?? '', intentStatus: 'completed' };

  const ageMs = deps.now().getTime() - new Date(existing.createdAt as unknown as string).getTime();
  const young = !(ageMs >= REBOOK_GRACE_MS);

  // No intent on the row: young → the first request is still attaching its intent (a repeat landed in that gap),
  // so answer 409 and let the caller retry/refresh; old → intent creation failed hours ago, nothing can be paid: supersede.
  if (!existing.ziinaPaymentIntentId) {
    return young
      ? ALREADY(409, 'pending_booking_exists', { booking: existing, redirectUrl: null })
      : { kind: 'supersede', booking: existing, reason: REBOOK_SUPERSEDED_REASON, flagPossiblyPaid: false };
  }

  // (2) Live Ziina check — FAIL CLOSED: never cancel on uncertainty.
  let intent: { status: string; redirect_url?: string };
  try { intent = await deps.retrieveIntent(existing.ziinaPaymentIntentId); }
  catch { return ALREADY(503, 'Your payment may be processing. Please refresh in a moment before trying again.'); }
  if (isPaid(intent.status)) return { kind: 'already_paid', booking: existing, intentId: existing.ziinaPaymentIntentId, intentStatus: intent.status };

  if (young) {
    // Inside the payment window the existing booking is the booking. A dead intent is the one exception.
    if (ziinaIntentIsDead(intent.status)) return { kind: 'supersede', booking: existing, reason: REBOOK_SUPERSEDED_REASON, flagPossiblyPaid: false };
    const redirectUrl = intent.redirect_url ?? null;
    // "The same request": head-count, wallet INTENT against the row's wallet USAGE (never the row's own amount on
    // both sides), and the guest set — a reused booking confirms and emails the FIRST request's guests.
    const same = request.spotsBooked === (existing.spotsBooked ?? 1)
      && request.applyWallet === ((existing.walletAmountUsed ?? 0) > 0)
      && request.guestKey === await deps.getGuestKey(existing.id);
    if (same) return { kind: 'reuse', booking: existing, redirectUrl };
    // An explicit replace: supersede the unpaid young booking on purpose. The guard reason keeps a late payment on
    // it restorable, and an in-flight status (the player may be mid-payment in another tab) is flagged possibly paid.
    if (request.replace) return { kind: 'supersede', booking: existing, reason: REBOOK_SUPERSEDED_REASON, flagPossiblyPaid: !(ziinaIntentIsDead(intent.status) || isRequiresInstrument(intent.status)) };
    return ALREADY(409, 'pending_booking_exists', { booking: existing, redirectUrl });
  }

  // Older than the window: the original guard. An in-flight status can be the pay→status lag — wait 1 s and re-check ONCE.
  let status = intent.status;
  if (!ziinaIntentIsDead(status) && !isRequiresInstrument(status)) {
    await deps.sleep(1000);
    let recheck: { status: string };
    try { recheck = await deps.retrieveIntent(existing.ziinaPaymentIntentId); }
    catch { return ALREADY(503, 'Your payment may still be processing. Please wait a moment before trying again.'); }
    if (isPaid(recheck.status)) return { kind: 'already_paid', booking: existing, intentId: existing.ziinaPaymentIntentId, intentStatus: recheck.status };
    status = recheck.status;
  }
  // About to cancel as unpaid. If the intent is not terminally unpaid it could still capture later — flag it.
  const terminallyUnpaid = ziinaIntentIsDead(status) || isRequiresInstrument(status);
  return { kind: 'supersede', booking: existing, reason: REBOOK_SUPERSEDED_REASON, flagPossiblyPaid: !terminallyUnpaid };
}

export function isRequiresInstrument(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() === 'requires_payment_instrument';
}

/** How a PENDING booking is superseded (re-book replace) or abandoned (checkout return): claim FIRST — a
 *  status-guarded update, so only the request that flips the row from 'pending' wins — and only then return the
 *  wallet share of the pre-claim row, exactly once. The route runs both inside one transaction. */
export type SupersedeDeps = {
  claimPending(bookingId: string, reason: string): Promise<boolean>;
  refundWallet(booking: { id: string; userId: string; walletAmountUsed: number | null }): Promise<void>;
};
export async function applyPendingSupersede(booking: { id: string; userId: string; walletAmountUsed: number | null }, reason: string, deps: SupersedeDeps): Promise<boolean> {
  if (!(await deps.claimPending(booking.id, reason))) return false;
  await deps.refundWallet(booking);
  return true;
}
