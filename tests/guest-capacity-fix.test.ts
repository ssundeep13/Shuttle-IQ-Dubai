// Gate G1 — guest-add capacity fix. The 2026-07-25 Al Manara incident:
// Akhila's 10:35 add-guest for Reena reserved the last spot (pending row +
// Ziina intent), and her 10:39 retry was refused by the capacity guard
// counting that very reservation — the reuse path sat unreachable below
// it. Pure decision logic unit-tested here; route order, confirm-time
// gates and the toast fix pinned as tripwires.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { capacityBlocksGuestAdd } from '../server/guestAddGuards';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('capacityBlocksGuestAdd — the 10:35/10:39 regression, named', () => {
  it('10:35 first attempt: last spot free, no reservations → allowed', () => {
    expect(capacityBlocksGuestAdd({ spotsRemaining: 1, sessionInflight: 0, reusesOwnRow: false })).toBe(false);
  });

  it('10:39 retry: same spot now reserved BY THIS GUEST\'S own row → allowed (the fix)', () => {
    expect(capacityBlocksGuestAdd({ spotsRemaining: 1, sessionInflight: 1, reusesOwnRow: true })).toBe(false);
  });

  it('control: a DIFFERENT guest against the same reserved last spot → blocked', () => {
    expect(capacityBlocksGuestAdd({ spotsRemaining: 1, sessionInflight: 1, reusesOwnRow: false })).toBe(true);
  });

  it('a genuinely full session blocks everyone — even the retry (its money path is confirm-time refusal, not a new hold)', () => {
    expect(capacityBlocksGuestAdd({ spotsRemaining: 0, sessionInflight: 0, reusesOwnRow: false })).toBe(true);
    expect(capacityBlocksGuestAdd({ spotsRemaining: 0, sessionInflight: 1, reusesOwnRow: true })).toBe(true);
  });

  it('exemption is exactly ONE row — other guests\' reservations still count', () => {
    expect(capacityBlocksGuestAdd({ spotsRemaining: 2, sessionInflight: 2, reusesOwnRow: true })).toBe(false);
    expect(capacityBlocksGuestAdd({ spotsRemaining: 1, sessionInflight: 2, reusesOwnRow: true })).toBe(true);
  });
});

describe('add-guest route order (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');
  const route = routes.slice(
    routes.indexOf('add-guest", requireAuth'),
    routes.indexOf('// BOOKINGS'),
  );

  it('duplicate lookup runs BEFORE the capacity guard; 409 ceiling stays after it', () => {
    const dupAt = route.indexOf('findReusableInflightGuest(existingGuests');
    const capAt = route.indexOf('capacityBlocksGuestAdd({');
    const ceilAt = route.indexOf('canAddGuest({');
    expect(dupAt).toBeGreaterThan(-1);
    expect(capAt).toBeGreaterThan(dupAt);
    expect(ceilAt).toBeGreaterThan(capAt);
  });

  it('capacity guard receives the reuse exemption and keeps the same 400 copy', () => {
    expect(route.includes('reusesOwnRow: !!duplicate')).toBe(true);
    expect(route.includes('This session is full — no spots available')).toBe(true);
    expect(route.includes('You already have a guest payment in progress')).toBe(true);
  });
});

describe('confirm-time gates in confirmGuestByIntentId (tripwires)', () => {
  const wh = read('server/webhookHandler.ts');
  const fn = wh.slice(wh.indexOf('export async function confirmGuestByIntentId'), wh.indexOf('export function registerZiinaWebhookRoute'));

  it('both refusal reasons exist and run BEFORE the confirmed write', () => {
    const parentAt = fn.indexOf('guest_confirm_parent_cancelled');
    const fullAt = fn.indexOf('guest_confirm_session_full');
    const confirmWriteAt = fn.indexOf('status: "confirmed"');
    expect(parentAt).toBeGreaterThan(-1);
    expect(fullAt).toBeGreaterThan(-1);
    expect(confirmWriteAt).toBeGreaterThan(parentAt);
    expect(confirmWriteAt).toBeGreaterThan(fullAt);
  });

  it('refusal cancels the row AND clears the intent linkage (the G0 lesson — status-only cancel is re-confirmable)', () => {
    const refuse = fn.slice(fn.indexOf('const refuseConfirm'), fn.indexOf('if (parentBooking.status === "cancelled")'));
    expect(refuse.includes('status: "cancelled"')).toBe(true);
    expect(refuse.includes('pendingPaymentIntentId: null')).toBe(true);
  });

  it('captured money is audited (payment row) and queued for admin refund — no automatic Ziina refund call', () => {
    const refuse = fn.slice(fn.indexOf('const refuseConfirm'), fn.indexOf('if (parentBooking.status === "cancelled")'));
    expect(refuse.includes('createPayment')).toBe(true);
    expect(refuse.includes('type: "refund_required"')).toBe(true);
    expect(refuse.includes('refundAmountFils: priceAed * 100')).toBe(true);
    expect(fn.includes('createZiinaRefund')).toBe(false);
  });

  it('capacity check uses live availability, refusing at zero spots', () => {
    expect(fn.includes('getBookableSessionWithAvailability(parentBooking.sessionId)')).toBe(true);
    expect(fn.includes('session.spotsRemaining < 1')).toBe(true);
  });
});

describe('MyBookings toasts (tripwire)', () => {
  it('every error toast reads the thrown { error } shape via serverErrorMessage — no empty-description .message reads remain', () => {
    const src = read('client/src/pages/marketplace/MyBookings.tsx');
    expect(src.includes("(error as { error?: string })?.error")).toBe(true);
    expect((src.match(/serverErrorMessage\(error\)/g) ?? []).length).toBe(5);
    expect(src.includes('description: error.message')).toBe(false);
  });
});
