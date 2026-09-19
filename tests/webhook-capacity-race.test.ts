// Gate 0 (IQ Pass prerequisite) — the webhook capacity race.
//
// A booking whose Ziina payment completes AFTER the session filled used to be
// re-waitlisted with NO payments row, and every promotion site then treated it
// as unpaid (4-hour hold + "complete payment" email) while initiate-payment
// minted a second intent over the paid one. Reviewed 3 Sep 2026, never
// shipped. This file is the RED set for that fix: the race branch records the
// payment, promotion honours a recorded payment, and initiate-payment refuses
// to re-charge. The unit tests run the real webhook module against a mocked
// storage; the route wiring is pinned at source.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET = 'test-main-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const storageMock = vi.hoisted(() => ({
  getBookingByZiinaPaymentIntentId: vi.fn(),
  getBookableSessionWithAvailability: vi.fn(),
  getWaitlistCountForSession: vi.fn(),
  getPaymentsByBookingId: vi.fn(),
  createPayment: vi.fn(),
  updateBooking: vi.fn(),
  claimBookingConfirmed: vi.fn(),
  getBookingGuestByPendingPaymentIntentId: vi.fn(),
  getBooking: vi.fn(),
  getMarketplaceUser: vi.fn(),
  getBookableSession: vi.fn(),
  getBookingGuests: vi.fn(),
  updateMarketplaceUser: vi.fn(),
  updateBookingGuest: vi.fn(),
  createMarketplaceNotification: vi.fn(),
}));
vi.mock('../server/storage', () => ({ storage: storageMock }));
vi.mock('../server/referrals', () => ({ fireReferralOnPayment: vi.fn() }));
vi.mock('../server/venueAwards', () => ({ syncFoundingMemberForUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../server/dubailandPromo', () => ({ applyDubailandPromo: vi.fn().mockResolvedValue('skipped') }));
vi.mock('../server/goodwillCredit', () => ({ fireGoodwillCredit: vi.fn() }));
vi.mock('../server/emailClient', () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendGuestBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendRefundProcessedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { confirmZiinaBookingByIntentId, confirmPromotedBookingIfPaid } = await import('../server/webhookHandler');
const { hasCompletedPayment } = await import('../server/paidBookingGuard');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const INTENT = 'pi_race_0001';
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina',
  ziinaPaymentIntentId: INTENT, amountAed: 49, spotsBooked: 1, cancelledAt: null,
  birthdayDiscountApplied: false, promotedAt: null, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(storageMock)) fn.mockReset();
  storageMock.getBookingGuests.mockResolvedValue([]);
  storageMock.getMarketplaceUser.mockResolvedValue(undefined);
  storageMock.getBookableSession.mockResolvedValue(undefined);
  storageMock.updateBooking.mockResolvedValue(undefined);
  storageMock.claimBookingConfirmed.mockResolvedValue(true);
  storageMock.createPayment.mockResolvedValue(undefined);
});

describe('confirmZiinaBookingByIntentId — paid booking loses the capacity race', () => {
  it('records the captured payment, re-waitlists the booking and reports paid: true', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking());
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 0 });
    storageMock.getWaitlistCountForSession.mockResolvedValue(3);
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: false, waitlisted: true, paid: true });
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, amount: 49, currency: 'aed', status: 'completed',
    }));
    expect(storageMock.createPayment.mock.calls[0][0].completedAt).toBeInstanceOf(Date);
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-1', { status: 'waitlisted', waitlistPosition: 4 });
    // Never confirmed in this branch.
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-1', { status: 'confirmed' });
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
  });

  it('is idempotent on webhook retry — a payment row already tied to the intent is not duplicated', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking());
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 0 });
    storageMock.getWaitlistCountForSession.mockResolvedValue(0);
    storageMock.getPaymentsByBookingId.mockResolvedValue([{ id: 'p-1', bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, status: 'completed' }]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: false, waitlisted: true, paid: true });
    expect(storageMock.createPayment).not.toHaveBeenCalled();
  });

  it('unchanged happy path: room left → confirmed, no paid flag in the result', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking());
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 2 });
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: true });
    expect(storageMock.claimBookingConfirmed).toHaveBeenCalledWith('bk-1');
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
  });
});

describe('confirmPromotedBookingIfPaid — promotion honours a recorded payment', () => {
  it('no completed payment → false, nothing written', async () => {
    storageMock.getPaymentsByBookingId.mockResolvedValue([{ id: 'p-0', bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, status: 'pending' }]);

    expect(await confirmPromotedBookingIfPaid(booking({ status: 'pending_payment', promotedAt: new Date() }) as any)).toBe(false);
    expect(storageMock.updateBooking).not.toHaveBeenCalled();
  });

  it('completed payment on a pending_payment hold → confirms through the normal pipeline and returns true', async () => {
    const held = booking({ status: 'pending_payment', promotedAt: new Date() });
    storageMock.getPaymentsByBookingId.mockResolvedValue([{ id: 'p-1', bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, status: 'completed' }]);
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(held);

    expect(await confirmPromotedBookingIfPaid(held as any)).toBe(true);
    // pending_payment skips the capacity re-check (the spot is already reserved).
    expect(storageMock.getBookableSessionWithAvailability).not.toHaveBeenCalled();
    expect(storageMock.claimBookingConfirmed).toHaveBeenCalledWith('bk-1');
    // The payment is already on file — no second row.
    expect(storageMock.createPayment).not.toHaveBeenCalled();
  });

  it('a refunded payment does not count as paid', async () => {
    storageMock.getPaymentsByBookingId.mockResolvedValue([{ id: 'p-1', bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, status: 'completed', refundStatus: 'completed' }]);

    expect(await confirmPromotedBookingIfPaid(booking({ status: 'pending_payment' }) as any)).toBe(false);
  });
});

describe('hasCompletedPayment — the one predicate for "this booking is paid"', () => {
  it('true only for a completed row with no completed refund', () => {
    expect(hasCompletedPayment([])).toBe(false);
    expect(hasCompletedPayment([{ status: 'pending', refundStatus: null }])).toBe(false);
    expect(hasCompletedPayment([{ status: 'completed', refundStatus: null }])).toBe(true);
    expect(hasCompletedPayment([{ status: 'completed', refundStatus: 'pending' }])).toBe(true);
    expect(hasCompletedPayment([{ status: 'completed', refundStatus: 'completed' }])).toBe(false);
    expect(hasCompletedPayment([{ status: 'completed', refundStatus: 'failed' }])).toBe(true);
  });
});

describe('promotion sites + initiate-payment wiring (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');
  const guest = read('server/guestSlotRefund.ts');
  const sched = read('server/scheduler.ts');

  const cancelCascade = routes.slice(
    routes.indexOf('app.post("/api/marketplace/bookings/:id/cancel"'),
    routes.indexOf('app.post("/api/marketplace/bookings/:id/attend"'),
  );
  const promoteFn = guest.slice(
    guest.indexOf('export async function promoteFirstFittingWaitlisted'),
    guest.indexOf('export async function promoteWaitlistForFreedSpots'),
  );
  const expiryJob = sched.slice(
    sched.indexOf('async function runExpiredPaymentJob'),
    sched.indexOf('let walletAuditRunning'),
  );

  const assertSite = (src: string, holdWrite: string, label: string) => {
    const hold = src.indexOf(holdWrite);
    const check = src.indexOf('confirmPromotedBookingIfPaid(');
    const payNow = src.indexOf('Spot available — complete payment!'); // quote style differs per file
    const email = src.indexOf('sendWaitlistPromotionEmail(');
    expect(hold, `${label}: hold write`).toBeGreaterThan(-1);
    expect(check, `${label}: helper call`).toBeGreaterThan(hold);
    expect(payNow, `${label}: pay-now notification stays, now inside the else`).toBeGreaterThan(check);
    expect(email, `${label}: promotion email after the helper`).toBeGreaterThan(check);
    expect(src.includes("title: 'Your spot is confirmed'"), `${label}: paid-branch notification`).toBe(true);
  };

  it('cancel cascade (marketplace-routes) confirms an already-paid promotion instead of asking for payment', () => {
    assertSite(cancelCascade, "status: 'pending_payment',", 'cancel cascade');
  });

  it('promoteFirstFittingWaitlisted (guestSlotRefund) does the same', () => {
    assertSite(promoteFn, 'status: "pending_payment",', 'promoteFirstFittingWaitlisted');
  });

  it('expiry cascade (scheduler) does the same', () => {
    assertSite(expiryJob, "status: 'pending_payment',", 'expiry cascade');
  });

  it('initiate-payment refuses (409 already_paid) before any Ziina call when a completed payment exists', () => {
    const ip = routes.slice(
      routes.indexOf('app.post("/api/marketplace/bookings/:id/initiate-payment"'),
      routes.indexOf('app.post("/api/marketplace/guests/cancel"'),
    );
    const deadline = ip.indexOf('Payment window has expired');
    const guard = ip.indexOf('hasCompletedPayment(');
    const refuse = ip.indexOf('res.status(409).json({ error: "already_paid"');
    const mint = ip.indexOf('createZiinaPaymentIntent(');
    expect(deadline).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(deadline);
    expect(refuse).toBeGreaterThan(guard);
    expect(mint).toBeGreaterThan(refuse);
  });

  it('the race branch itself records the payment before re-waitlisting', () => {
    const wh = read('server/webhookHandler.ts');
    const fn = wh.slice(wh.indexOf('export async function confirmZiinaBookingByIntentId'), wh.indexOf('export function registerZiinaWebhookRoute'));
    const raceCheck = fn.indexOf('!capacityAllowsConfirm(booking, sessionForCapacity.spotsRemaining)'); // the own-seat-aware re-check (hotfix 2026-09-19)
    const record = fn.indexOf('await storage.createPayment(', raceCheck);
    const waitlist = fn.indexOf('status: "waitlisted"', raceCheck);
    expect(raceCheck).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(raceCheck);
    expect(record).toBeLessThan(waitlist);
    expect(fn.includes('return { confirmed: false, waitlisted: true, paid: true };')).toBe(true);
  });
});
