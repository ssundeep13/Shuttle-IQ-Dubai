// A drop-in that still has to be paid — a waitlist promotion awaiting payment (pending_payment) or an unpaid pending
// booking whose Ziina intent is still live — must be payable from My games in one tap (2026-09-15: a player on
// tonight's Bright Riders session saw "Pending · AED 49 · Ziina" with no way to pay). initiate-payment reuses the
// booking's existing payable intent and mints one only when there is none; the promotion email and notification
// point at My games with ?pay=<bookingId>, which starts that payment on arrival.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET ??= 'test-main-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { decideIntentReuse } = await import('../server/payPending');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

describe('decideIntentReuse — reuse a live intent, mint only when there is none', () => {
  it('no intent on the booking → mint', async () => {
    const retrieve = vi.fn();
    expect(await decideIntentReuse(null, retrieve)).toEqual({ kind: 'mint' });
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('an unpaid intent with a redirect (requires_payment_instrument, or in flight) → reuse its redirect', async () => {
    for (const status of ['requires_payment_instrument', 'pending', 'processing']) {
      const retrieve = vi.fn().mockResolvedValue({ status, redirect_url: 'https://pay.ziina.com/x' });
      expect(await decideIntentReuse('pi_1', retrieve)).toEqual({ kind: 'reuse', redirectUrl: 'https://pay.ziina.com/x' });
    }
  });
  it('a paid intent → paid (the caller confirms through the canonical path and never mints over it)', async () => {
    const retrieve = vi.fn().mockResolvedValue({ status: 'completed', redirect_url: 'https://pay.ziina.com/x' });
    expect(await decideIntentReuse('pi_1', retrieve)).toEqual({ kind: 'paid', intentId: 'pi_1', intentStatus: 'completed' });
  });
  it('a dead intent (declined / failed / expired), one without a redirect, or a Ziina error → mint a fresh one', async () => {
    for (const status of ['declined', 'failed', 'expired']) {
      expect(await decideIntentReuse('pi_1', vi.fn().mockResolvedValue({ status, redirect_url: 'x' }))).toEqual({ kind: 'mint' });
    }
    expect(await decideIntentReuse('pi_1', vi.fn().mockResolvedValue({ status: 'requires_payment_instrument' }))).toEqual({ kind: 'mint' });
    expect(await decideIntentReuse('pi_1', vi.fn().mockRejectedValue(new Error('down')))).toEqual({ kind: 'mint' });
  });
});

describe('source pins — the route', () => {
  const routes = read('server/marketplace-routes.ts');
  const ip = routes.slice(routes.indexOf('app.post("/api/marketplace/bookings/:id/initiate-payment"'), routes.indexOf('app.post("/api/marketplace/guests/cancel"'));
  it('accepts an unpaid pending drop-in as well as a promotion; the 4-hour deadline applies to promotions only', () => {
    expect(ip.includes("booking.status !== 'pending_payment' && booking.status !== 'pending'")).toBe(true);
    expect(ip.includes("if (booking.status === 'pending_payment') {")).toBe(true);
    expect(ip.includes('Date.now() > paymentDeadline')).toBe(true);
    expect(ip.includes('res.status(410)')).toBe(true);
  });
  it('after the ledger guard it reuses a live intent (decideIntentReuse) and only then mints; a paid intent is confirmed, never re-minted', () => {
    const guard = ip.indexOf('hasCompletedPayment(');
    const reuse = ip.indexOf('await decideIntentReuse(');
    const mint = ip.indexOf('createZiinaPaymentIntent(');
    expect(guard).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(guard);
    expect(mint).toBeGreaterThan(reuse);
    expect(ip.includes("return res.json({ redirectUrl: reuse.redirectUrl, reused: true })")).toBe(true);
    expect(ip.slice(reuse, mint).includes('confirmZiinaBookingByIntentId(')).toBe(true);
  });
});

describe('source pins — the promotion email and notification carry the pay link', () => {
  it('all three promotion sites email a link to My games with ?pay=<bookingId>', () => {
    expect(read('server/scheduler.ts').includes('`${baseUrl}/marketplace/my-bookings?pay=${next.id}`')).toBe(true);
    expect(read('server/marketplace-routes.ts').includes('`${promotionBaseUrl}/marketplace/my-bookings?pay=${first.id}`')).toBe(true);
    expect(read('server/guestSlotRefund.ts').includes('`${baseUrl}/marketplace/my-bookings?pay=${first.id}`')).toBe(true);
  });
  it('the "complete payment" notification tells the player where the Pay button is, at all three sites', () => {
    for (const f of ['server/scheduler.ts', 'server/marketplace-routes.ts', 'server/guestSlotRefund.ts']) {
      expect(read(f).includes('to secure your spot — open My games and tap Pay.'), f).toBe(true);
    }
  });
});

describe('source pins — My games wiring', () => {
  const my = read('client/src/pages/marketplace/MyBookings.tsx');
  it('the hero and the agenda row get the pay action and its busy state from the shared initiate-payment mutation', () => {
    expect(my.includes('onPay={() => initiatePaymentMutation.mutate(nextGame.id)}')).toBe(true);
    expect(my.includes('onPay={() => initiatePaymentMutation.mutate(b.id)}')).toBe(true);
  });
  it('the detail card pays an unpaid pending drop-in too, and the button says the amount', () => {
    expect(my.includes("const isPayable = !booking.packId && booking.paymentMethod === 'ziina' && (isPendingPayment || booking.status === 'pending');")).toBe(true);
    expect(my.includes('`Pay AED ${booking.amountAed}`')).toBe(true);
  });
  it('?pay=<bookingId> (the email link) starts that payment once, as soon as the booking is known', () => {
    expect(my.includes("new URLSearchParams(window.location.search).get('pay')")).toBe(true);
    expect(my.includes('autoPayFired.current = true;')).toBe(true);
  });
});
