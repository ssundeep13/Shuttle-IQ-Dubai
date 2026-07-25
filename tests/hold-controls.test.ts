// Gate H1 — pending_payment hold controls. Admin release (widened
// payment-not-received) + player-visible pay-by deadline. Pure time helpers
// unit-tested; route ordering, race guards, the pending-branch no-change
// pin and UI placements held as tripwires.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { formatDubaiTime, formatDubaiDeadline, paymentDeadline, PAYMENT_WINDOW_MS } from '../shared/dubaiTime';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const routes = read('server/marketplace-routes.ts');
const pnr = routes.slice(
  routes.indexOf('app.post("/api/admin/bookings/:id/payment-not-received"'),
  routes.indexOf('app.post("/api/marketplace/bookings/:id/admin-confirm"'),
);

describe('Dubai deadline helpers', () => {
  it('formats in Asia/Dubai regardless of the server clock (UTC on Railway)', () => {
    // 13:28 UTC === 17:28 Dubai (UTC+4, no DST).
    expect(formatDubaiTime('2026-07-25T13:28:00.000Z')).toBe('5:28 pm');
  });

  it('paymentDeadline is promotedAt + exactly 4 hours', () => {
    const promoted = new Date('2026-07-25T09:28:00.000Z');
    expect(paymentDeadline(promoted).toISOString()).toBe('2026-07-25T13:28:00.000Z');
    expect(PAYMENT_WINDOW_MS).toBe(4 * 60 * 60 * 1000);
  });

  it('full deadline phrase carries the Dubai day, not the UTC one', () => {
    // 21:00 UTC is already the NEXT day in Dubai (01:00).
    expect(formatDubaiDeadline('2026-07-25T21:00:00.000Z')).toBe('1:00 am on Sun 26 Jul');
  });
});

describe('admin hold release — widened payment-not-received (tripwires)', () => {
  it('accepts pending AND pending_payment, rejects everything else', () => {
    expect(pnr.includes("const isHold = booking.status === 'pending_payment'")).toBe(true);
    expect(pnr.includes("if (booking.status !== 'pending' && !isHold)")).toBe(true);
  });

  it('BOTH money race guards still run BEFORE any write', () => {
    const guard1 = pnr.indexOf("existingPayments.some((p) => p.status === 'completed')");
    const guard2 = pnr.indexOf('isZiinaPaymentSuccessful(intent.status)');
    const write = pnr.indexOf('await storage.updateBooking(booking.id, {');
    expect(guard1).toBeGreaterThan(-1);
    expect(guard2).toBeGreaterThan(guard1);
    expect(write).toBeGreaterThan(guard2);
  });

  it('hold branch gets the sweep treatment: refund backstop, hold_cancelled notification, cascade', () => {
    const holdBranch = pnr.slice(pnr.indexOf('if (isHold) {'), pnr.indexOf('return res.json({ booking: updated })'));
    expect(holdBranch.includes('maybeCreateRefundNotification(booking.id)')).toBe(true);
    expect(holdBranch.includes("type: 'hold_cancelled'")).toBe(true);
    expect(holdBranch.includes("title: 'Spot hold released'")).toBe(true);
    expect(holdBranch.includes('No charge was made')).toBe(true);
    expect(holdBranch.includes('promoteFirstFittingWaitlisted(booking.sessionId)')).toBe(true);
    // Distinct from the sweep's timed-out notification.
    expect(holdBranch.includes('payment_expired')).toBe(false);
  });

  it('PENDING BRANCH UNCHANGED: same cancellationReason, same log, no notification/cascade/refund additions', () => {
    expect(pnr.includes("isHold ? 'hold_cancelled_by_admin' : 'payment_not_received'")).toBe(true);
    const elseBranch = pnr.slice(pnr.indexOf('} else {'), pnr.indexOf('return res.json({ booking: updated })'));
    expect(elseBranch.includes('marked payment_not_received by admin (no refund, no email)')).toBe(true);
    expect(elseBranch.includes('createMarketplaceNotification')).toBe(false);
    expect(elseBranch.includes('promoteFirstFittingWaitlisted')).toBe(false);
    expect(elseBranch.includes('maybeCreateRefundNotification')).toBe(false);
  });

  it('cascade failure never fails the release', () => {
    expect(pnr.includes('(hold still released)')).toBe(true);
  });
});

describe('payment-vs-cancel race backstops (tripwires)', () => {
  it('the confirm webhook refuses to resurrect a cancelled booking', () => {
    const wh = read('server/webhookHandler.ts');
    expect(wh.includes('if (booking.cancelledAt)')).toBe(true);
    expect(wh.includes('not resurrecting')).toBe(true);
  });

  it('the reconciliation sweep excludes cancelled rows at the QUERY, before any Ziina check', () => {
    const s = read('server/storage.ts');
    const q = s.slice(s.indexOf('async getBookingsPendingZiinaReconciliation'), s.indexOf('async getBookingsPendingZiinaReconciliation') + 1400);
    expect(q.includes('isNull(bookings.cancelledAt)')).toBe(true);
    expect(q.includes("NOT IN ('cancelled', 'waitlisted')")).toBe(true);
  });
});

describe('player pay-by deadline (tripwires)', () => {
  const my = read('client/src/pages/marketplace/MyBookings.tsx');

  it('absolute Dubai deadline rendered on the hold banner, Inter, no emoji', () => {
    expect(my.includes('Pay by {formatDubaiTime(paymentDeadline(booking.promotedAt))}')).toBe(true);
    expect(my.includes("fontFamily: \"'Inter', system-ui, sans-serif\"")).toBe(true);
    expect(my.includes('text-pay-by-')).toBe(true);
  });

  it('deadline hidden once expired — the expired banner already tells the real story', () => {
    expect(my.includes('booking.promotedAt && !countdown.expired')).toBe(true);
  });

  it('initiate-payment keeps its hard past-window 410 (removing it would let players pay into a dead hold)', () => {
    const ip = routes.slice(routes.indexOf('/initiate-payment'), routes.indexOf('/initiate-payment') + 1600);
    expect(ip.includes('Date.now() > paymentDeadline')).toBe(true);
    expect(ip.includes('res.status(410)')).toBe(true);
  });
});

describe('promotion notifications carry the explicit Dubai deadline (all three sites)', () => {
  for (const f of ['server/guestSlotRefund.ts', 'server/scheduler.ts', 'server/marketplace-routes.ts']) {
    it(`${f.split('/').pop()} states a wall-clock deadline, not "4 hours"`, () => {
      const src = read(f);
      expect(src.includes('Complete payment by ${formatDubaiDeadline(paymentDeadline(promotedAt))} to secure your spot.')).toBe(true);
      expect(src.includes('You have 4 hours to complete payment')).toBe(false);
    });
  }
});

describe('admin UI hold control (tripwires)', () => {
  const admin = read('client/src/pages/SessionsManagement.tsx');

  it('action renders for pending AND pending_payment with hold-specific copy', () => {
    expect(admin.includes("(booking.status === 'pending' || booking.status === 'pending_payment')")).toBe(true);
    expect(admin.includes("'Release Hold' : 'Payment Not Received'")).toBe(true);
    expect(admin.includes("'Release this hold?' : 'Payment not received?'")).toBe(true);
    expect(admin.includes("'Keep hold' : 'Keep booking'")).toBe(true);
    expect(admin.includes('No charge was made')).toBe(true);
  });
});
