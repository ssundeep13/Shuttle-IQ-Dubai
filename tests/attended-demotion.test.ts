// Hotfix 2026-09-19 — the reconciliation sweep demoted a paid, CHECKED-IN player.
//
// A paid, confirmed booking was checked in early (status 'attended'). The
// 10-minute Ziina reconciliation sweep selects "status <> 'confirmed' OR no
// completed payment", so 'attended' qualified. confirmZiinaBookingByIntentId
// returned early only for 'confirmed'; 'attended' fell into the capacity
// re-check, which counts the booking's OWN seat. On a full session
// spotsRemaining was 0 < 1, so the paid player was written 'waitlisted' and
// silently lost the seat.
//
// The fix is three changes, each pinned here:
//   1. confirm path: 'attended' answers exactly like 'confirmed' and writes nothing;
//   2. sweep query: 'attended' is not a reconciliation candidate;
//   3. capacity re-check: a booking whose status already counts toward the
//      session total never loses the check to its own seat (capacityAllowsConfirm).
// Mocking follows tests/webhook-capacity-race.test.ts — the real webhook module
// against a mocked storage; the storage query is pinned at source.
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

const webhook = await import('../server/webhookHandler');
const { confirmZiinaBookingByIntentId } = webhook;
// Looked up by name so a missing export fails each helper test on its own line
// (RED) instead of breaking the whole file at import.
const capacityAllowsConfirm = (webhook as Record<string, unknown>).capacityAllowsConfirm as
  (booking: { status: string; spotsBooked: number | null }, spotsRemaining: number) => boolean;

// Server files are CRLF in the working tree — normalise before matching.
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const INTENT = 'pi_attended_0001';
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina',
  ziinaPaymentIntentId: INTENT, amountAed: 49, spotsBooked: 1, cancelledAt: null,
  birthdayDiscountApplied: false, promotedAt: null, ...over,
});
const waitlistWrites = () =>
  storageMock.updateBooking.mock.calls.filter(([, patch]) => (patch as { status?: string } | undefined)?.status === 'waitlisted');

beforeEach(() => {
  for (const fn of Object.values(storageMock)) fn.mockReset();
  storageMock.getBookingGuests.mockResolvedValue([]);
  storageMock.getMarketplaceUser.mockResolvedValue(undefined);
  storageMock.getBookableSession.mockResolvedValue(undefined);
  storageMock.updateBooking.mockResolvedValue(undefined);
  storageMock.claimBookingConfirmed.mockResolvedValue(true);
  storageMock.createPayment.mockResolvedValue(undefined);
});

describe('confirmZiinaBookingByIntentId — an attended booking is a confirmed booking that has checked in', () => {
  it('attended + completed intent + FULL session → already confirmed, nothing written (the production case: payment on file)', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking({ status: 'attended' }));
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 0 });
    storageMock.getWaitlistCountForSession.mockResolvedValue(2);
    storageMock.getPaymentsByBookingId.mockResolvedValue([{ id: 'p-1', bookingId: 'bk-1', ziinaPaymentIntentId: INTENT, status: 'completed' }]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: true, alreadyConfirmed: true });
    // The seat is never taken away.
    expect(waitlistWrites()).toEqual([]);
    expect(storageMock.updateBooking).not.toHaveBeenCalled();
    // 'attended' must not be flipped back to 'confirmed' either — check-in survives.
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
    expect(storageMock.createPayment).not.toHaveBeenCalled();
  });

  it('attended + FULL session with no payment row on file → same answer, still no payment created and no demotion', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking({ status: 'attended' }));
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 0 });
    storageMock.getWaitlistCountForSession.mockResolvedValue(0);
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(waitlistWrites()).toEqual([]);
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
    expect(storageMock.createPayment).not.toHaveBeenCalled();
  });

  it('attended with room left → still the already-confirmed no-op (no re-confirm, no second confirmation email path)', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking({ status: 'attended' }));
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 5 });
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
    expect(storageMock.createPayment).not.toHaveBeenCalled();
    expect(storageMock.getMarketplaceUser).not.toHaveBeenCalled();
  });
});

describe('confirmZiinaBookingByIntentId — the genuine capacity race is untouched (guard against over-fixing)', () => {
  it("status 'pending' + FULL session → still re-waitlisted with the payment recorded, paid: true", async () => {
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
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-1', { status: 'confirmed' });
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
  });

  it("status 'pending' needing 2 spots with 1 left → still re-waitlisted", async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking({ spotsBooked: 2, amountAed: 98 }));
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 1 });
    storageMock.getWaitlistCountForSession.mockResolvedValue(0);
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: false, waitlisted: true, paid: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-1', { status: 'waitlisted', waitlistPosition: 1 });
    expect(storageMock.claimBookingConfirmed).not.toHaveBeenCalled();
  });

  it("status 'pending' with exactly enough room → confirmed through the normal pipeline", async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(booking());
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', spotsRemaining: 1 });
    storageMock.getPaymentsByBookingId.mockResolvedValue([]);

    const result = await confirmZiinaBookingByIntentId(INTENT, 'completed');

    expect(result).toEqual({ confirmed: true });
    expect(storageMock.claimBookingConfirmed).toHaveBeenCalledWith('bk-1');
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
    expect(waitlistWrites()).toEqual([]);
  });
});

describe('capacityAllowsConfirm — a counted booking never loses the check to its own seat', () => {
  it('is exported from server/webhookHandler', () => {
    expect(typeof capacityAllowsConfirm).toBe('function');
  });

  it("uncounted status ('pending') behaves exactly like the old bare comparison", () => {
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: 1 }, 0)).toBe(false);
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: 1 }, 1)).toBe(true);
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: 2 }, 1)).toBe(false);
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: 2 }, 2)).toBe(true);
    // Byte-identical to !(spotsRemaining < needed) across a small grid.
    for (const needed of [1, 2, 3]) {
      for (const remaining of [0, 1, 2, 3, 4]) {
        expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: needed }, remaining)).toBe(!(remaining < needed));
      }
    }
  });

  it("counted statuses ('confirmed', 'attended', 'pending_payment') already hold their seats — a full session still allows them", () => {
    expect(capacityAllowsConfirm({ status: 'attended', spotsBooked: 1 }, 0)).toBe(true);
    expect(capacityAllowsConfirm({ status: 'confirmed', spotsBooked: 2 }, 0)).toBe(true);
    expect(capacityAllowsConfirm({ status: 'pending_payment', spotsBooked: 1 }, 0)).toBe(true);
  });

  it('null spotsBooked counts as 1', () => {
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: null }, 0)).toBe(false);
    expect(capacityAllowsConfirm({ status: 'pending', spotsBooked: null }, 1)).toBe(true);
    expect(capacityAllowsConfirm({ status: 'attended', spotsBooked: null }, 0)).toBe(true);
  });

  it("other statuses ('waitlisted', 'cancelled') hold no seat and get no allowance", () => {
    expect(capacityAllowsConfirm({ status: 'waitlisted', spotsBooked: 1 }, 0)).toBe(false);
    expect(capacityAllowsConfirm({ status: 'cancelled', spotsBooked: 1 }, 0)).toBe(false);
  });
});

describe('source pins', () => {
  it("storage.getBookingsPendingZiinaReconciliation excludes status 'attended' from the sweep candidates", () => {
    const st = read('server/storage.ts');
    const start = st.indexOf('async getBookingsPendingZiinaReconciliation(');
    const fn = st.slice(start, st.indexOf('async createPayment(', start));
    expect(start).toBeGreaterThan(-1);
    expect(fn).toMatch(/\$\{bookings\.status\}\s*<>\s*'attended'/);
    // The existing exclusions stay.
    expect(fn).toMatch(/\$\{bookings\.status\}\s*<>\s*'waitlisted'/);
  });

  it("webhookHandler early return treats 'attended' like 'confirmed', ahead of the capacity re-check, which uses the helper", () => {
    const wh = read('server/webhookHandler.ts');
    const fn = wh.slice(wh.indexOf('export async function confirmZiinaBookingByIntentId'), wh.indexOf('export function registerZiinaWebhookRoute'));
    const earlyReturn = fn.indexOf('return { confirmed: true, alreadyConfirmed: true };');
    expect(earlyReturn).toBeGreaterThan(-1);
    const guard = fn.slice(fn.lastIndexOf('if (', earlyReturn), earlyReturn);
    expect(guard).toContain('"confirmed"');
    expect(guard).toContain('"attended"');
    const recheck = fn.indexOf('getBookableSessionWithAvailability(');
    const helperUse = fn.indexOf('capacityAllowsConfirm(');
    expect(recheck).toBeGreaterThan(earlyReturn);
    expect(helperUse).toBeGreaterThan(recheck);
    expect(helperUse).toBeLessThan(fn.indexOf('status: "waitlisted"'));
  });
});
