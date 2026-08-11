/**
 * Option A Gate 2 — money correctness + guards for primary-spot self-cancel.
 * Unit layer mocks storage/db (referrals-primitives pattern) and drives
 * settleCancelledGuestSlot directly; pin layer asserts guard placement,
 * token-path escalation, and copy variants in the route/helper source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../server/db', () => ({ db: { transaction: vi.fn(async (fn: any) => fn({})) } }));
vi.mock('../server/walletLedger', () => ({ applyWalletDelta: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../server/emailClient', () => ({ sendWaitlistPromotionEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../server/storage', () => ({
  storage: {
    updateBooking: vi.fn().mockResolvedValue(undefined),
    getBookableSession: vi.fn(),
    getMarketplaceUser: vi.fn(),
    createMarketplaceNotification: vi.fn().mockResolvedValue(undefined),
    getRefundNotificationByBooking: vi.fn().mockResolvedValue(undefined),
    updateNotificationRefundAmount: vi.fn().mockResolvedValue(undefined),
    getWaitlistedBookingsForSession: vi.fn().mockResolvedValue([]),
    getBookingCountForSession: vi.fn().mockResolvedValue(0),
  },
}));

import { storage } from '../server/storage';
import { applyWalletDelta } from '../server/walletLedger';
import { settleCancelledGuestSlot } from '../server/guestSlotRefund';

const farFutureSession = {
  // far outside the 5h window, so charged slots take the refund path
  date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  startTime: '20:00',
};

const birthdayBooking = (over: Partial<any> = {}) => ({
  id: 'bk-bday',
  userId: 'user-primary',
  sessionId: 'sess-1',
  status: 'confirmed',
  paymentMethod: 'ziina',
  ziinaPaymentIntentId: 'intent-1',
  amountAed: 49,
  walletAmountUsed: 0,
  spotsBooked: 2,
  birthdayDiscountApplied: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getBookableSession as any).mockResolvedValue(farFutureSession);
  (storage.getMarketplaceUser as any).mockResolvedValue({ id: 'user-primary', linkedPlayerId: 'player-1' });
  (storage.getRefundNotificationByBooking as any).mockResolvedValue(undefined);
});

describe('Fix 1 — birthday proration for a free slot', () => {
  it('primary (free slot) cancels on a 2-spot AED 49 birthday booking → 0 fils moves, spots only decrement', async () => {
    const res = await settleCancelledGuestSlot(birthdayBooking() as any, {
      newSpotsBooked: 1,
      allowWallet: true,
      cancelledSlotWasFree: true,
      isPrimarySlot: true,
    });
    expect(res).toEqual({ proratedAed: 0, settledToWallet: false, pendingFlagged: false, forfeited: false, manualReview: false });
    expect(storage.updateBooking).toHaveBeenCalledTimes(1);
    const [, patch] = (storage.updateBooking as any).mock.calls[0];
    expect(patch.spotsBooked).toBe(1);
    // money keys absent entirely — a stale re-write could clobber a concurrent
    // charged-slot decrement, so the free path must not touch them at all
    expect('amountAed' in patch).toBe(false);
    expect('walletAmountUsed' in patch).toBe(false);
    expect(storage.createMarketplaceNotification).not.toHaveBeenCalled();
    expect(applyWalletDelta).not.toHaveBeenCalled();
  });

  it('guest (charged slot) cancels on the same booking → full AED 49 share, unchanged math', async () => {
    const res = await settleCancelledGuestSlot(birthdayBooking() as any, {
      newSpotsBooked: 1,
      allowWallet: false,
      cancelledSlotWasFree: false,
      isPrimarySlot: false,
    });
    expect(res.proratedAed).toBe(49);
    expect(res.pendingFlagged).toBe(true);
    const [, patch] = (storage.updateBooking as any).mock.calls[0];
    expect(patch.amountAed).toBe(0); // 49 - 49
    const note = (storage.createMarketplaceNotification as any).mock.calls[0][0];
    expect(note.type).toBe('refund_required');
    expect(note.refundAmountFils).toBe(4900);
  });

  it('order-independence: guest first (49), then primary (0) on the decremented booking', async () => {
    await settleCancelledGuestSlot(
      birthdayBooking({ amountAed: 0, spotsBooked: 1 }) as any, // state after the guest already cancelled
      { newSpotsBooked: 0, allowWallet: true, cancelledSlotWasFree: true, isPrimarySlot: true },
    );
    const [, patch] = (storage.updateBooking as any).mock.calls[0];
    expect('amountAed' in patch).toBe(false);
    expect(storage.createMarketplaceNotification).not.toHaveBeenCalled();
  });

  it('non-birthday charged slot math untouched: 2 spots, AED 100 → AED 50 share', async () => {
    const res = await settleCancelledGuestSlot(
      birthdayBooking({ amountAed: 100, birthdayDiscountApplied: false }) as any,
      { newSpotsBooked: 1, allowWallet: false },
    );
    expect(res.proratedAed).toBe(50);
  });
});

describe('Fix 2 — checked-in guard (source pins)', () => {
  const routes = readFileSync(join(__dirname, '..', 'server/marketplace-routes.ts'), 'utf8');
  const GUARD_MSG = "You're already checked in — speak to the Court Captain to make changes.";

  it('authenticated delete endpoint guards before the atomic claim', () => {
    const ep = routes.slice(
      routes.indexOf("app.delete(\"/api/marketplace/bookings/:bookingId/guests/:guestId\""),
      routes.indexOf('// Authenticated: reassign a guest slot'),
    );
    expect(ep.includes(GUARD_MSG)).toBe(true);
    expect(ep.indexOf(GUARD_MSG)).toBeLessThan(ep.indexOf('markGuestSlotCancelled'));
  });

  it('token self-cancel path guards before the atomic claim', () => {
    const ep = routes.slice(
      routes.indexOf('app.post("/api/marketplace/guests/cancel"'),
      routes.indexOf('// Public: lookup guest by token'),
    );
    expect(ep.includes(GUARD_MSG)).toBe(true);
    expect(ep.indexOf(GUARD_MSG)).toBeLessThan(ep.indexOf('markGuestSlotCancelled'));
  });
});

describe('Fix 3 — token-path escalation (source pins)', () => {
  const routes = readFileSync(join(__dirname, '..', 'server/marketplace-routes.ts'), 'utf8');

  it('token path cancels the whole booking when no active slots remain', () => {
    const ep = routes.slice(
      routes.indexOf('app.post("/api/marketplace/guests/cancel"'),
      routes.indexOf('// Public: lookup guest by token'),
    );
    // counts live slots after the claim, mirrors the authenticated sequence
    expect(/status\s*!==\s*'cancelled'/.test(ep)).toBe(true);
    expect(ep.includes('maybeCreateRefundNotification')).toBe(true);
    expect(ep.includes('bookingCancelled: true')).toBe(true);
    // the escalation must run BEFORE the settle path (the floor that remains
    // is only a drift guard for the non-empty case)
    expect(ep.indexOf('activeSlots === 0')).toBeLessThan(ep.indexOf('settleCancelledGuestSlot'));
  });
});

describe('Fix 4 — copy generalisation', () => {
  const helper = readFileSync(join(__dirname, '..', 'server/guestSlotRefund.ts'), 'utf8');

  it('primary variants exist alongside untouched guest wording', () => {
    expect(helper.includes('isPrimarySlot')).toBe(true);
    expect(helper.includes('your cancelled spot')).toBe(true);
    expect(helper.includes('Your spot was cancelled')).toBe(true);
    // guest wording retained
    expect(helper.includes('the cancelled guest spot')).toBe(true);
    expect(helper.includes('Guest slot cancelled')).toBe(true);
  });

  it('wallet-credit message says "your spot" for the primary', async () => {
    const res = await settleCancelledGuestSlot(
      birthdayBooking({ amountAed: 100, birthdayDiscountApplied: false, walletAmountUsed: 0 }) as any,
      { newSpotsBooked: 1, allowWallet: true, refundPreference: 'wallet', isPrimarySlot: true },
    );
    expect(res.settledToWallet).toBe(true);
    const note = (storage.createMarketplaceNotification as any).mock.calls.find(
      (c: any[]) => c[0].type === 'wallet_refund_credited',
    )[0];
    expect(note.message.includes('your cancelled spot')).toBe(true);
    expect(note.message.includes('guest spot')).toBe(false);
  });
});
