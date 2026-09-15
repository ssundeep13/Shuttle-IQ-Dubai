// The Ziina cancel return (CheckoutCancel.tsx) used to fire the full player-cancel endpoint on mount for whatever
// state the booking was in — a confirmed seat inside the late window or a promoted pending_payment seat would have
// been cancelled with no refund choice, and a webview reload re-fired it. Now it calls a narrow "abandon" that only
// ever cancels an UNPAID pending drop-in (Ziina asked first), records why ('checkout_abandoned'), and is a no-op
// for everything else. A payment that still lands on an abandoned row is honoured like a guard-superseded one.
//
// Review fixes (adversarial pass, 2026-09-15): the claim (status-guarded CAS) comes BEFORE the wallet share goes
// back, and both run in one transaction — a lost claim returns nothing; an in-flight Ziina status leaves the row
// alone; the sweep and the confirm path honour 'checkout_abandoned' in every clause that honours 'rebook_superseded'.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET ??= 'test-main-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { decideAbandon, CHECKOUT_ABANDONED_REASON } = await import('../server/checkoutAbandon');
const { applyPendingSupersede } = await import('../server/rebookGuard');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina', amountAed: 49, spotsBooked: 1, walletAmountUsed: 0,
  ziinaPaymentIntentId: 'pi_1', packId: null, createdAt: new Date('2026-09-15T08:00:00Z'), cancelledAt: null, cancellationReason: null, ...over,
});
const deps = (over: Record<string, any> = {}) => ({
  getPayments: vi.fn().mockResolvedValue([]),
  retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_instrument' }),
  ...over,
});

describe('decideAbandon', () => {
  it('the reason string is stable', () => { expect(CHECKOUT_ABANDONED_REASON).toBe('checkout_abandoned'); });
  it('no booking → not_found; another player\'s booking → forbidden; an IQ Pass seat → never (not_pending iq_pass_seat)', async () => {
    expect(await decideAbandon(undefined, 'u-1', deps())).toEqual({ kind: 'not_found' });
    expect(await decideAbandon(booking() as any, 'u-2', deps())).toEqual({ kind: 'forbidden' });
    expect(await decideAbandon(booking({ packId: 'pk-1' }) as any, 'u-1', deps())).toEqual({ kind: 'not_pending', status: 'iq_pass_seat' });
  });
  it('already cancelled → already_cancelled (a reload is harmless); confirmed / pending_payment / attended / waitlisted → not_pending, nothing else asked', async () => {
    const d = deps();
    expect(await decideAbandon(booking({ status: 'cancelled', cancelledAt: new Date() }) as any, 'u-1', d)).toEqual({ kind: 'already_cancelled' });
    for (const status of ['confirmed', 'pending_payment', 'attended', 'waitlisted']) {
      expect(await decideAbandon(booking({ status }) as any, 'u-1', d)).toEqual({ kind: 'not_pending', status });
    }
    expect(d.retrieveIntent).not.toHaveBeenCalled();
    expect(d.getPayments).not.toHaveBeenCalled();
  });
  it('a pending booking with a completed payment row → paid (the caller confirms it), never abandoned', async () => {
    const d = deps({ getPayments: vi.fn().mockResolvedValue([{ status: 'completed', ziinaPaymentIntentId: 'pi_1' }]) });
    expect(await decideAbandon(booking() as any, 'u-1', d)).toEqual({ kind: 'paid', intentId: 'pi_1', intentStatus: 'completed' });
    expect(d.retrieveIntent).not.toHaveBeenCalled();
  });
  it('Ziina says the intent is paid → paid; unpaid (requires_payment_instrument or dead) → abandon; no intent at all → abandon without asking', async () => {
    expect(await decideAbandon(booking() as any, 'u-1', deps({ retrieveIntent: vi.fn().mockResolvedValue({ status: 'completed' }) }))).toEqual({ kind: 'paid', intentId: 'pi_1', intentStatus: 'completed' });
    expect(await decideAbandon(booking() as any, 'u-1', deps())).toMatchObject({ kind: 'abandon', booking: expect.objectContaining({ id: 'bk-1' }) });
    expect(await decideAbandon(booking() as any, 'u-1', deps({ retrieveIntent: vi.fn().mockResolvedValue({ status: 'expired' }) }))).toMatchObject({ kind: 'abandon' });
    const d = deps();
    expect(await decideAbandon(booking({ ziinaPaymentIntentId: null }) as any, 'u-1', d)).toMatchObject({ kind: 'abandon' });
    expect(d.retrieveIntent).not.toHaveBeenCalled();
  });
  it('an IN-FLIGHT Ziina status (pending / processing — the player may be mid-payment in another tab) → in_flight: the booking is left alone', async () => {
    for (const status of ['pending', 'processing', 'requires_action']) {
      expect(await decideAbandon(booking() as any, 'u-1', deps({ retrieveIntent: vi.fn().mockResolvedValue({ status }) }))).toEqual({ kind: 'in_flight', intentStatus: status });
    }
  });
  it('Ziina unreachable → unavailable (fail closed: the booking is left alone)', async () => {
    expect(await decideAbandon(booking() as any, 'u-1', deps({ retrieveIntent: vi.fn().mockRejectedValue(new Error('down')) }))).toEqual({ kind: 'unavailable' });
  });
});

describe('applyPendingSupersede — the claim comes first, the wallet share only follows a won claim', () => {
  it('claim lost (another request already took the row) → false, the wallet is never touched', async () => {
    const d = { claimPending: vi.fn().mockResolvedValue(false), refundWallet: vi.fn() };
    expect(await applyPendingSupersede(booking({ walletAmountUsed: 1500 }) as any, CHECKOUT_ABANDONED_REASON, d)).toBe(false);
    expect(d.claimPending).toHaveBeenCalledWith('bk-1', CHECKOUT_ABANDONED_REASON);
    expect(d.refundWallet).not.toHaveBeenCalled();
  });
  it('claim won → the wallet share of the PRE-claim row goes back exactly once, after the claim', async () => {
    const order: string[] = [];
    const d = { claimPending: vi.fn(async () => { order.push('claim'); return true; }), refundWallet: vi.fn(async () => { order.push('refund'); }) };
    const b = booking({ walletAmountUsed: 1500 }) as any;
    expect(await applyPendingSupersede(b, 'rebook_superseded', d)).toBe(true);
    expect(order).toEqual(['claim', 'refund']);
    expect(d.refundWallet).toHaveBeenCalledTimes(1);
    expect(d.refundWallet).toHaveBeenCalledWith(b);
  });
});

describe('source pins — the routes, the confirm path, the sweep and the cancel page', () => {
  const src = read('server/marketplace-routes.ts');
  const abandonRoute = () => {
    const start = src.indexOf('app.post("/api/marketplace/bookings/:id/abandon"');
    expect(start).toBeGreaterThan(0);
    return src.slice(start, src.indexOf('app.post("/api/marketplace/bookings/:id/cancel"', start));
  };
  it('POST /api/marketplace/bookings/:id/abandon decides through the seam and supersedes through the shared transactional helper (claim, then wallet) — never an unguarded update', () => {
    const route = abandonRoute();
    expect(route.includes('await decideAbandon(')).toBe(true);
    expect(route.includes('await supersedePendingBooking(stale, CHECKOUT_ABANDONED_REASON)')).toBe(true);
    expect(route.includes('storage.updateBooking(')).toBe(false);
    expect(route.includes("case 'in_flight'")).toBe(true);
    expect(route.includes("case 'paid'")).toBe(true);
    expect(route.includes('confirmZiinaBookingByIntentId(')).toBe(true);
  });
  it('supersedePendingBooking runs the status-guarded claim and the wallet return inside ONE transaction', () => {
    const i = src.indexOf('async function supersedePendingBooking(');
    expect(i).toBeGreaterThan(0);
    const fn = src.slice(i, i + 1400);
    expect(fn.includes('db.transaction(')).toBe(true);
    expect(fn.includes("sql`${bookings.status} = 'pending'`")).toBe(true);
    expect(fn.includes('applyPendingSupersede(')).toBe(true);
    expect(fn.indexOf('applyPendingSupersede(')).toBeGreaterThan(fn.indexOf('db.transaction('));
  });
  it('a payment landing on an abandoned row is restored or flagged like a guard-superseded one (the condition, not just the import); the sweep picks abandoned rows up in BOTH clauses', () => {
    const wh = read('server/webhookHandler.ts');
    const block = wh.slice(wh.indexOf('if (booking.cancelledAt) {'), wh.indexOf('restoreSupersededBooking(booking, intentId)'));
    expect(block.includes('booking.cancellationReason !== CHECKOUT_ABANDONED_REASON')).toBe(true);
    const st = read('server/storage.ts');
    const i = st.indexOf('async getBookingsPendingZiinaReconciliation');
    const fn = st.slice(i, i + 2400);
    expect(fn.split("cancellationReason} = 'checkout_abandoned'").length - 1).toBe(2);
    expect(fn.split("cancellationReason} = 'rebook_superseded'").length - 1).toBe(2);
  });
  it('CheckoutCancel posts to /abandon once per mount (ref guard) and still never touches a pack return', () => {
    const cc = read('client/src/pages/marketplace/CheckoutCancel.tsx');
    expect(cc.includes('/abandon`')).toBe(true);
    expect(cc.includes('/cancel`')).toBe(false);
    expect(cc.includes('useRef(false)')).toBe(true);
    expect(cc.includes('if (bookingId && !packId) {')).toBe(true);
  });
});
