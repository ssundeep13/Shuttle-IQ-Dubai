/**
 * Option A Gate 4 — "Cancel my spot" UI. Unit-tests the visibility/proration
 * helper (mirrors the server settle); pins the MyBookings wiring: mirrored
 * refundPreference mechanism, three dialog variants, verbatim server error
 * in-dialog, cancel-first order.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { primaryCancelInfo } from '../client/src/lib/primaryCancel';

const src = () => readFileSync(join(__dirname, '..', 'client/src/pages/marketplace/MyBookings.tsx'), 'utf8');

const base = {
  status: 'confirmed',
  attendedAt: null,
  isGuestBooking: false,
  amountAed: 98,
  spotsBooked: 2,
  birthdayDiscountApplied: false,
  session: { date: '2030-01-01', startTime: '20:00' },
  guests: [
    { id: 'p1', isPrimary: true, status: 'confirmed' },
    { id: 'g1', isPrimary: false, status: 'confirmed' },
  ],
};
const NOW_FAR = new Date('2029-12-25T12:00:00Z');
const NOW_INSIDE = new Date('2030-01-01T14:00:00Z'); // < 5h before 20:00 Dubai

describe('primaryCancelInfo — visibility matrix', () => {
  it('happy path: confirmed, active primary row, active guest → visible with slot id', () => {
    const r = primaryCancelInfo(base as any, NOW_FAR);
    expect(r.visible).toBe(true);
    expect(r.primarySlotId).toBe('p1');
  });
  it('legacy no-primary-row booking → NEVER visible', () => {
    const r = primaryCancelInfo({ ...base, guests: [{ id: 'g1', isPrimary: false, status: 'confirmed' }] } as any, NOW_FAR);
    expect(r.visible).toBe(false);
  });
  it('no rows at all (admin-cash) → not visible', () => {
    expect(primaryCancelInfo({ ...base, guests: [] } as any, NOW_FAR).visible).toBe(false);
  });
  it('primary already cancelled → not visible', () => {
    const r = primaryCancelInfo({ ...base, guests: [{ id: 'p1', isPrimary: true, status: 'cancelled' }, { id: 'g1', isPrimary: false, status: 'confirmed' }] } as any, NOW_FAR);
    expect(r.visible).toBe(false);
  });
  it('all guests cancelled → not visible (whole-booking Cancel is the tool)', () => {
    const r = primaryCancelInfo({ ...base, guests: [{ id: 'p1', isPrimary: true, status: 'confirmed' }, { id: 'g1', isPrimary: false, status: 'cancelled' }] } as any, NOW_FAR);
    expect(r.visible).toBe(false);
  });
  it('single-spot booking (no guest rows beyond primary) → not visible', () => {
    const r = primaryCancelInfo({ ...base, spotsBooked: 1, guests: [{ id: 'p1', isPrimary: true, status: 'confirmed' }] } as any, NOW_FAR);
    expect(r.visible).toBe(false);
  });
  it('checked-in booking → not visible', () => {
    expect(primaryCancelInfo({ ...base, attendedAt: '2030-01-01T10:00:00Z' } as any, NOW_FAR).visible).toBe(false);
  });
});

describe('primaryCancelInfo — money mirrors the server settle', () => {
  it('non-birthday 2-spot AED 98 → AED 49 share', () => {
    expect(primaryCancelInfo(base as any, NOW_FAR).refundAed).toBe(49);
  });
  it('birthday 2-spot AED 49 → free slot, AED 0', () => {
    const r = primaryCancelInfo({ ...base, amountAed: 49, birthdayDiscountApplied: true } as any, NOW_FAR);
    expect(r.freeSlot).toBe(true);
    expect(r.refundAed).toBe(0);
  });
  it('5h window flips inside the cutoff (Dubai clock)', () => {
    expect(primaryCancelInfo(base as any, NOW_FAR).within5h).toBe(false);
    expect(primaryCancelInfo(base as any, NOW_INSIDE).within5h).toBe(true);
  });
});

describe('MyBookings wiring pins', () => {
  it('action + dialog exist with the three copy variants', () => {
    const s = src();
    expect(s.includes('button-cancel-my-spot-')).toBe(true);
    expect(s.includes('Your guests keep theirs.')).toBe(true);
    expect(s.includes('will be refunded')).toBe(true);
    expect(s.includes('within 5 hours of start — no refund')).toBe(true);
    expect(s.includes('Your spot was free — AED 0 refund')).toBe(true);
  });
  it('mirrors the guest-cancel refundPreference mechanism on the same endpoint', () => {
    const s = src();
    const block = s.slice(s.indexOf('cancelMySpotMutation'), s.indexOf('cancelMySpotMutation') + 700);
    expect(block.includes("refundPreference ? { refundPreference } : undefined")).toBe(true);
    expect(block.includes('/guests/')).toBe(true);
  });
  it('server 400 (checked-in) surfaces verbatim inside the dialog', () => {
    const s = src();
    expect(s.includes('setMySpotError(serverErrorMessage(')).toBe(true);
    expect(s.includes('mySpotError')).toBe(true);
  });
  it('defensive: bookingCancelled response flag handled', () => {
    const s = src();
    expect(s.includes('bookingCancelled')).toBe(true);
  });
});
