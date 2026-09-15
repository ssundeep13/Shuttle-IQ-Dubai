// Re-book guard root cause (Sandeep, 2026-09-15; the Vishak MS miss + nine more since June): a drop-in booking
// request that repeats within seconds must return the FIRST booking and its intent — never mint a second intent,
// never cancel a booking whose intent is younger than the payment window. When the guard does supersede an old,
// verified-unpaid booking, it says so (cancellation_reason 'rebook_superseded') so the confirm path and the
// reconciliation sweep can still honour a payment that lands on it.
//
// Review fixes (adversarial pass, 2026-09-15): "the same request" compares wallet INTENT (the request only ever
// carries a boolean) and the GUEST SET, not just a head-count — a repeat that switches credit on, or names different
// guests, is a different request and answers 409 rather than silently reusing the first intent.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET ??= 'test-main-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { decideRebook, guestKeyOf, REBOOK_GRACE_MS, REBOOK_SUPERSEDED_REASON, REBOOK_REFUND_PENDING_REASON, ziinaIntentIsDead } = await import('../server/rebookGuard');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

const NOW = new Date('2026-09-14T09:42:52.000Z');
const MIN = 60_000; const H = 60 * MIN;
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b-old', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina', amountAed: 49, spotsBooked: 1, walletAmountUsed: 0,
  ziinaPaymentIntentId: 'pi_old', createdAt: new Date(NOW.getTime() - 1000), cancelledAt: null, cancellationReason: null, ...over,
});
function deps(over: Record<string, any> = {}) {
  return {
    now: () => NOW,
    getPayments: vi.fn().mockResolvedValue([]),
    retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_instrument', redirect_url: 'https://pay.ziina.com/pi_old' }),
    getGuestKey: vi.fn().mockResolvedValue(''),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}
const request = { spotsBooked: 1, applyWallet: false, guestKey: '' };

describe('decideRebook — the constants', () => {
  it('the grace window is the 4-hour drop-in payment window and the reason strings are stable', () => {
    expect(REBOOK_GRACE_MS).toBe(4 * H);
    expect(REBOOK_SUPERSEDED_REASON).toBe('rebook_superseded');
    expect(REBOOK_REFUND_PENDING_REASON).toBe('rebook_refund_pending');
    for (const s of ['failed', 'expired', 'cancelled', 'canceled', 'declined', 'rejected']) expect(ziinaIntentIsDead(s)).toBe(true);
    for (const s of ['requires_payment_instrument', 'pending', 'processing', 'completed', '']) expect(ziinaIntentIsDead(s)).toBe(false);
  });
  it('guestKeyOf is order-insensitive and case/space-normalised over name|email pairs', () => {
    expect(guestKeyOf([])).toBe('');
    expect(guestKeyOf([{ name: ' Priya ', email: 'P@X.com' }, { name: 'Arjun', email: null }])).toBe(guestKeyOf([{ name: 'arjun' }, { name: 'priya', email: 'p@x.com' }]));
    expect(guestKeyOf([{ name: 'Priya' }])).not.toBe(guestKeyOf([{ name: 'Arjun' }]));
    expect(guestKeyOf([{ name: 'Priya', email: 'a@x.com' }])).not.toBe(guestKeyOf([{ name: 'Priya', email: 'b@x.com' }]));
  });
});

describe('decideRebook — nothing or a live seat', () => {
  it('no existing booking → none; a confirmed / attended / waitlisted / pending_payment booking → 400 "already have a booking"', async () => {
    expect(await decideRebook(null, request, deps())).toEqual({ kind: 'none' });
    for (const status of ['confirmed', 'attended', 'waitlisted', 'pending_payment']) {
      const d = await decideRebook(booking({ status }), request, deps());
      expect(d).toMatchObject({ kind: 'blocked', status: 400 });
    }
  });
  it('a cancelled existing booking is no obstacle (the row is dead; the unique index ignores cancelled rows)', async () => {
    expect(await decideRebook(booking({ status: 'cancelled', cancelledAt: NOW }), request, deps())).toEqual({ kind: 'none' });
  });
});

describe('decideRebook — a pending booking younger than the payment window (the double-submit)', () => {
  it('an identical request 1 s later REUSES the first booking and its intent: no cancel, no new intent, the same redirect', async () => {
    const d = deps();
    const r = await decideRebook(booking(), request, d);
    expect(r).toMatchObject({ kind: 'reuse', booking: expect.objectContaining({ id: 'b-old' }), redirectUrl: 'https://pay.ziina.com/pi_old' });
    expect(d.retrieveIntent).toHaveBeenCalledTimes(1);
    expect(d.sleep).not.toHaveBeenCalled();
  });
  it('a request 3 hours later (still inside the window) also reuses — the intent is never cancelled young', async () => {
    const r = await decideRebook(booking({ createdAt: new Date(NOW.getTime() - 3 * H) }), request, deps());
    expect(r).toMatchObject({ kind: 'reuse', redirectUrl: 'https://pay.ziina.com/pi_old' });
  });
  it('a DIFFERENT head-count inside the window → 409 pending_booking_exists with the existing booking and its redirect; still no cancel', async () => {
    const r = await decideRebook(booking(), { ...request, spotsBooked: 2 }, deps());
    expect(r).toMatchObject({ kind: 'blocked', status: 409, error: 'pending_booking_exists', booking: expect.objectContaining({ id: 'b-old' }), redirectUrl: 'https://pay.ziina.com/pi_old' });
  });
  it('wallet INTENT is compared against the row\'s wallet USAGE: credit switched on against a full-price row → 409; the same intent either way → reuse', async () => {
    // The row used no credit; the repeat wants credit — a different request (the first intent is full price).
    expect(await decideRebook(booking(), { ...request, applyWallet: true }, deps())).toMatchObject({ kind: 'blocked', status: 409, error: 'pending_booking_exists' });
    // The row used credit; the repeat wants credit too — the same request.
    expect(await decideRebook(booking({ walletAmountUsed: 1500 }), { ...request, applyWallet: true }, deps())).toMatchObject({ kind: 'reuse' });
    // The row used credit; the repeat switched it off — different.
    expect(await decideRebook(booking({ walletAmountUsed: 1500 }), request, deps())).toMatchObject({ kind: 'blocked', status: 409 });
  });
  it('the GUEST SET is part of sameness: the same head-count with different guests → 409 (the reused booking would confirm and email the FIRST guests)', async () => {
    const d = deps({ getGuestKey: vi.fn().mockResolvedValue(guestKeyOf([{ name: 'Priya', email: null }])) });
    const same = await decideRebook(booking({ spotsBooked: 2 }), { ...request, spotsBooked: 2, guestKey: guestKeyOf([{ name: ' priya ' }]) }, d);
    expect(same).toMatchObject({ kind: 'reuse' });
    expect(d.getGuestKey).toHaveBeenCalledWith('b-old');
    const different = await decideRebook(booking({ spotsBooked: 2 }), { ...request, spotsBooked: 2, guestKey: guestKeyOf([{ name: 'Arjun' }]) }, d);
    expect(different).toMatchObject({ kind: 'blocked', status: 409, error: 'pending_booking_exists' });
  });
  it('the young intent is already paid at Ziina → already_paid (the caller confirms through the canonical path)', async () => {
    const r = await decideRebook(booking(), request, deps({ retrieveIntent: vi.fn().mockResolvedValue({ status: 'completed', redirect_url: 'x' }) }));
    expect(r).toMatchObject({ kind: 'already_paid', intentId: 'pi_old', intentStatus: 'completed' });
  });
  it('a completed payment row on the young booking → already_paid without asking Ziina', async () => {
    const d = deps({ getPayments: vi.fn().mockResolvedValue([{ status: 'completed', ziinaPaymentIntentId: 'pi_old' }]) });
    expect(await decideRebook(booking(), request, d)).toMatchObject({ kind: 'already_paid', intentId: 'pi_old' });
    expect(d.retrieveIntent).not.toHaveBeenCalled();
  });
  it('a young intent that Ziina reports dead (declined / failed / expired) cannot be paid → supersede so the player gets a fresh one', async () => {
    const r = await decideRebook(booking(), request, deps({ retrieveIntent: vi.fn().mockResolvedValue({ status: 'declined' }) }));
    expect(r).toMatchObject({ kind: 'supersede', reason: 'rebook_superseded', flagPossiblyPaid: false });
  });
  it('a young booking with no intent yet (the second request landed in the gap before the intent id was attached) → 409, never a cancel', async () => {
    const d = deps();
    expect(await decideRebook(booking({ ziinaPaymentIntentId: null }), request, d)).toMatchObject({ kind: 'blocked', status: 409, error: 'pending_booking_exists' });
    expect(d.retrieveIntent).not.toHaveBeenCalled();
  });
  it('an OLD booking with no intent (intent creation failed hours ago) → supersede', async () => {
    const d = deps();
    expect(await decideRebook(booking({ ziinaPaymentIntentId: null, createdAt: new Date(NOW.getTime() - 5 * H) }), request, d)).toMatchObject({ kind: 'supersede', flagPossiblyPaid: false });
  });
  it('Ziina unreachable → 503 fail closed, nothing cancelled', async () => {
    const r = await decideRebook(booking(), request, deps({ retrieveIntent: vi.fn().mockRejectedValue(new Error('ziina down')) }));
    expect(r).toMatchObject({ kind: 'blocked', status: 503 });
  });
});

describe('decideRebook — a pending booking older than the payment window (the original guard, kept)', () => {
  const old = () => booking({ createdAt: new Date(NOW.getTime() - 5 * H) });
  it('verified unpaid (requires_payment_instrument) → supersede, not flagged', async () => {
    const d = deps();
    expect(await decideRebook(old(), request, d)).toMatchObject({ kind: 'supersede', reason: REBOOK_SUPERSEDED_REASON, flagPossiblyPaid: false });
  });
  it('paid at Ziina → already_paid', async () => {
    expect(await decideRebook(old(), request, deps({ retrieveIntent: vi.fn().mockResolvedValue({ status: 'completed' }) }))).toMatchObject({ kind: 'already_paid' });
  });
  it('in-flight status → wait 1 s and re-check once; still in flight → supersede but FLAGGED possibly paid; paid on re-check → already_paid', async () => {
    const d = deps({ retrieveIntent: vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'pending' }) });
    expect(await decideRebook(old(), request, d)).toMatchObject({ kind: 'supersede', flagPossiblyPaid: true });
    expect(d.sleep).toHaveBeenCalledWith(1000);
    const d2 = deps({ retrieveIntent: vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'completed' }) });
    expect(await decideRebook(old(), request, d2)).toMatchObject({ kind: 'already_paid', intentStatus: 'completed' });
  });
  it('Ziina unreachable on the re-check → 503 fail closed', async () => {
    const d = deps({ retrieveIntent: vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockRejectedValueOnce(new Error('down')) });
    expect(await decideRebook(old(), request, d)).toMatchObject({ kind: 'blocked', status: 503 });
  });
});

describe('source pins — the route, the confirm path and the sweep honour the seam', () => {
  const routeSrc = () => {
    const src = read('server/marketplace-routes.ts');
    const start = src.indexOf('app.post("/api/marketplace/bookings"');
    // Bounded by the next route so the pins cannot leak into unrelated handlers.
    return src.slice(start, src.indexOf('app.post("/api/marketplace/bookings/:id', start));
  };
  it('POST /api/marketplace/bookings decides through decideRebook with wallet INTENT + the guest key, supersedes with the reason, and answers reuse with the existing booking', () => {
    const route = routeSrc();
    expect(route.includes('await decideRebook(')).toBe(true);
    expect(route.includes('applyWallet: !!applyWallet')).toBe(true);
    expect(route.includes('guestKey: guestKeyOf(guests)')).toBe(true);
    expect(route.includes('walletFils')).toBe(false);
    expect(route.includes("cancellationReason: REBOOK_SUPERSEDED_REASON")).toBe(true);
    expect(route.includes("case 'reuse'")).toBe(true);
    expect(route.includes("case 'already_paid'")).toBe(true);
    expect(route.includes('isZiinaPaymentTerminalUnpaid(')).toBe(false); // the decision lives in the seam now
  });
  it('the 409 copy tells the player what is actually true (no Pay-now/expiry that does not exist for a pending drop-in)', () => {
    const route = routeSrc();
    expect(route.includes("error: 'pending_booking_exists', message:")).toBe(true);
    expect(route.includes('wait for it to expire')).toBe(false);
    expect(route.includes('Pay it from My games')).toBe(false);
  });
  it('the confirm path restores a guard-superseded booking (or flags it) instead of refusing every cancelled row; the sweep includes guard-cancelled rows only', () => {
    const wh = read('server/webhookHandler.ts');
    expect(wh.includes('REBOOK_SUPERSEDED_REASON')).toBe(true);
    expect(wh.includes('REBOOK_REFUND_PENDING_REASON')).toBe(true);
    expect(wh.includes('restoreSupersededBooking(')).toBe(true);
    const st = read('server/storage.ts');
    const i = st.indexOf('async getBookingsPendingZiinaReconciliation');
    const fn = st.slice(i, i + 2000);
    expect(fn.includes("rebook_superseded")).toBe(true);
    expect(fn.includes("rebook_refund_pending")).toBe(false); // a flagged row is terminal — the sweep never re-decides it
    expect(fn.includes("isNull(bookings.cancelledAt)")).toBe(false);
  });
});
