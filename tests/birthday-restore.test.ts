// Birthday free game — restore on cancel (Sandeep, 2026-09-25; docs: scratchpad PLAN.md, approved with one amendment).
// Pure layer: the Dubai calendar date, the window key, the restore rules, and the server seam that offers, consumes and
// restores the free game over injected deps (the storage helpers in production, an in-memory store here).
import { describe, it, expect, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const bday = await import('../shared/birthday');
const seam = await import('../server/birthdayRestore');

const Z = (s: string) => new Date(s);
// Yash Parwani's shape: birthday 24 Sep → window 20–28 Sep (Dubai days).
const yash = { birthDay: 24, birthMonth: 9, birthdayDiscountUsedAt: null as Date | string | null };
const IN_WINDOW = Z('2026-09-25T08:00:00Z'); // Fri 25 Sep 12:00 Dubai

describe('dubaiCalendarDate — the Asia/Dubai calendar day as the UTC midnight the module expects', () => {
  it('00:30 Dubai (20:30Z the day before) → the Dubai day', () => {
    expect(bday.dubaiCalendarDate(Z('2026-09-27T20:30:00Z')).toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });
  it('23:30 Dubai → the same Dubai day', () => {
    expect(bday.dubaiCalendarDate(Z('2026-09-28T19:30:00Z')).toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });
  it('closes the 4-hour edge: 01:00 Dubai on 29 Sep is outside a 20–28 Sep window (the raw instant still reads 28 Sep)', () => {
    const now = Z('2026-09-28T21:00:00Z');
    expect(bday.isInBirthdayWindow(yash, now)).toBe(true);
    expect(bday.isInBirthdayWindow(yash, bday.dubaiCalendarDate(now))).toBe(false);
  });
});

describe('birthdayWindowKey — the anchor birthday of the window a date falls in', () => {
  it('inside the window → the anchor birthday as YYYY-MM-DD', () => {
    expect(bday.birthdayWindowKey(yash, Z('2026-09-25T00:00:00Z'))).toBe('2026-09-24');
    expect(bday.birthdayWindowKey(yash, Z('2026-09-20T00:00:00Z'))).toBe('2026-09-24');
  });
  it('outside the window, or no birthday on the account → null', () => {
    expect(bday.birthdayWindowKey(yash, Z('2026-09-29T00:00:00Z'))).toBeNull();
    expect(bday.birthdayWindowKey({ birthDay: null, birthMonth: null }, IN_WINDOW)).toBeNull();
  });
  it('the Dec/Jan wrap: 30 Dec for a 1 Jan birthday belongs to next year; 3 Jan to the same key', () => {
    const jan1 = { birthDay: 1, birthMonth: 1 };
    expect(bday.birthdayWindowKey(jan1, Z('2026-12-30T00:00:00Z'))).toBe('2027-01-01');
    expect(bday.birthdayWindowKey(jan1, Z('2027-01-03T00:00:00Z'))).toBe('2027-01-01');
  });
});

describe('canRestoreBirthdayDiscount — rules 1–3 in one place', () => {
  const base = { bookingFlagged: true, slotIsPrimary: true, withinLateWindow: false, user: yash, now: IN_WINDOW };
  it('the free primary slot, outside the 5-hour cutoff, window open → true', () => {
    expect(bday.canRestoreBirthdayDiscount(base)).toBe(true);
  });
  it('inside the 5-hour cutoff → false (forfeit territory)', () => {
    expect(bday.canRestoreBirthdayDiscount({ ...base, withinLateWindow: true })).toBe(false);
  });
  it('the window has closed (29 Sep Dubai) → false', () => {
    expect(bday.canRestoreBirthdayDiscount({ ...base, now: Z('2026-09-29T08:00:00Z') })).toBe(false);
  });
  it('closing is judged on the Dubai date: 01:00 Dubai on 29 Sep → false', () => {
    expect(bday.canRestoreBirthdayDiscount({ ...base, now: Z('2026-09-28T21:00:00Z') })).toBe(false);
  });
  it('a guest slot, or a booking that was never free → false', () => {
    expect(bday.canRestoreBirthdayDiscount({ ...base, slotIsPrimary: false })).toBe(false);
    expect(bday.canRestoreBirthdayDiscount({ ...base, bookingFlagged: false })).toBe(false);
  });
});

describe('decideBirthdayOffer — free only in window, marker clear, and no live free booking holding this window', () => {
  const user = { id: 'u-1', ...yash };
  it('in window, marker empty, nothing live → applied, with the window key; the lookup is by user + key', async () => {
    const deps = { hasLiveBirthdayBooking: vi.fn().mockResolvedValue(false) };
    expect(await seam.decideBirthdayOffer(user, IN_WINDOW, deps)).toEqual({ applied: true, windowKey: '2026-09-24' });
    expect(deps.hasLiveBirthdayBooking).toHaveBeenCalledWith('u-1', '2026-09-24');
  });
  it('a live free booking (e.g. a pending one with guests) already holds this window → not applied', async () => {
    const deps = { hasLiveBirthdayBooking: vi.fn().mockResolvedValue(true) };
    expect(await seam.decideBirthdayOffer(user, IN_WINDOW, deps)).toEqual({ applied: false, windowKey: null });
  });
  it('the marker is set (used 4 days ago) → not applied, no lookup', async () => {
    const deps = { hasLiveBirthdayBooking: vi.fn() };
    expect(await seam.decideBirthdayOffer({ ...user, birthdayDiscountUsedAt: Z('2026-09-21T18:42:36Z') }, IN_WINDOW, deps)).toEqual({ applied: false, windowKey: null });
    expect(deps.hasLiveBirthdayBooking).not.toHaveBeenCalled();
  });
  it('outside the window → not applied; judged on the Dubai date (01:00 Dubai on 29 Sep)', async () => {
    const deps = { hasLiveBirthdayBooking: vi.fn().mockResolvedValue(false) };
    expect(await seam.decideBirthdayOffer(user, Z('2026-09-28T21:00:00Z'), deps)).toEqual({ applied: false, windowKey: null });
  });
});

describe('restoreBirthdayDiscount — conditional on this booking having consumed the marker', () => {
  const deps = () => ({ clearMarker: vi.fn().mockResolvedValue(true), releaseWindowKey: vi.fn().mockResolvedValue(undefined) });
  const input = (over: Record<string, unknown> = {}) => ({
    booking: { id: 'bk-1', userId: 'u-1', birthdayDiscountApplied: true },
    slotIsPrimary: true, withinLateWindow: false, bookingStaysLive: false, user: yash, now: IN_WINDOW, ...over,
  });
  it('whole cancel outside 5 h, window open → the marker is cleared for THIS booking; the (cancelled) booking keeps its key', async () => {
    const d = deps();
    expect(await seam.restoreBirthdayDiscount(input(), d)).toEqual({ restored: true, reason: 'restored' });
    expect(d.clearMarker).toHaveBeenCalledWith('u-1', 'bk-1');
    expect(d.releaseWindowKey).not.toHaveBeenCalled();
  });
  it('(amendment) the primary cancels only their own free slot and guests stay → marker cleared AND the booking key released', async () => {
    const d = deps();
    expect(await seam.restoreBirthdayDiscount(input({ bookingStaysLive: true }), d)).toEqual({ restored: true, reason: 'restored' });
    expect(d.releaseWindowKey).toHaveBeenCalledWith('bk-1');
  });
  it('inside the 5-hour cutoff → late; nothing is touched', async () => {
    const d = deps();
    expect(await seam.restoreBirthdayDiscount(input({ withinLateWindow: true }), d)).toEqual({ restored: false, reason: 'late' });
    expect(d.clearMarker).not.toHaveBeenCalled();
  });
  it('window closed → window_closed; a guest slot or an unflagged booking → not_free_slot', async () => {
    expect(await seam.restoreBirthdayDiscount(input({ now: Z('2026-09-29T08:00:00Z') }), deps())).toEqual({ restored: false, reason: 'window_closed' });
    expect(await seam.restoreBirthdayDiscount(input({ slotIsPrimary: false }), deps())).toEqual({ restored: false, reason: 'not_free_slot' });
    expect(await seam.restoreBirthdayDiscount(input({ booking: { id: 'bk-1', userId: 'u-1', birthdayDiscountApplied: false } }), deps())).toEqual({ restored: false, reason: 'not_free_slot' });
  });
  it('the marker belongs to another booking (the conditional clear matched nothing) → not_this_booking; the key is NOT released', async () => {
    const d = { clearMarker: vi.fn().mockResolvedValue(false), releaseWindowKey: vi.fn() };
    expect(await seam.restoreBirthdayDiscount(input({ bookingStaysLive: true }), d)).toEqual({ restored: false, reason: 'not_this_booking' });
    expect(d.releaseWindowKey).not.toHaveBeenCalled();
  });
});

describe('consumeBirthdayDiscount — every confirm path marks the free game used, tied to the booking', () => {
  it('a flagged booking → marker set with this booking id and the given instant', async () => {
    const d = { setMarker: vi.fn().mockResolvedValue(undefined) };
    const at = Z('2026-09-25T08:00:00Z');
    await seam.consumeBirthdayDiscount({ id: 'bk-1', userId: 'u-1', birthdayDiscountApplied: true }, at, d);
    expect(d.setMarker).toHaveBeenCalledWith('u-1', 'bk-1', at);
  });
  it('an unflagged booking → nothing', async () => {
    const d = { setMarker: vi.fn() };
    await seam.consumeBirthdayDiscount({ id: 'bk-1', userId: 'u-1', birthdayDiscountApplied: false }, IN_WINDOW, d);
    expect(d.setMarker).not.toHaveBeenCalled();
  });
});

describe('the race loser — a 409, never a charge (decision 2)', () => {
  it('only a 23505 on uq_bookings_one_live_birthday counts as the birthday conflict', () => {
    expect(seam.BIRTHDAY_UNIQUE_INDEX).toBe('uq_bookings_one_live_birthday');
    expect(seam.isBirthdayConflict({ code: '23505', constraint: 'uq_bookings_one_live_birthday' })).toBe(true);
    expect(seam.isBirthdayConflict({ code: '23505', constraint: 'unique_active_booking_per_session' })).toBe(false);
    expect(seam.isBirthdayConflict(new Error('boom'))).toBe(false);
  });
  it('the copy is stable', () => {
    expect(seam.BIRTHDAY_ALREADY_BOOKED).toBe('Your free birthday game is already booked');
  });
});

describe('(amendment) end to end over the seam — primary cancels own free slot, guests stay → a new free booking in the same window succeeds', () => {
  it('marker cleared, the old booking stays live for its guests with its key released, and the next offer is free (no 409)', async () => {
    // An in-memory store with the same rules as the database: the marker is tied to a booking; the partial unique rule
    // is "one live flagged booking per (user, window key)", and a NULL key is outside it.
    const user = { id: 'u-1', ...yash, birthdayDiscountUsedAt: null as Date | null, bookingId: null as string | null };
    const bookings = [{ id: 'bk-1', userId: 'u-1', birthdayDiscountApplied: true, key: '2026-09-24' as string | null, status: 'confirmed', amountAed: 49, spotsBooked: 2 }];
    const store = {
      setMarker: async (_u: string, bk: string, at: Date) => { user.birthdayDiscountUsedAt = at; user.bookingId = bk; },
      clearMarker: async (_u: string, bk: string) => { if (user.bookingId !== bk) return false; user.birthdayDiscountUsedAt = null; user.bookingId = null; return true; },
      releaseWindowKey: async (bk: string) => { const b = bookings.find((x) => x.id === bk)!; b.key = null; },
      hasLiveBirthdayBooking: async (u: string, key: string) => bookings.some((b) => b.userId === u && b.birthdayDiscountApplied && b.key === key && b.status !== 'cancelled'),
    };
    await seam.consumeBirthdayDiscount(bookings[0], Z('2026-09-21T18:42:36Z'), store);
    expect((await seam.decideBirthdayOffer(user, IN_WINDOW, store)).applied).toBe(false);

    const r = await seam.restoreBirthdayDiscount({ booking: bookings[0], slotIsPrimary: true, withinLateWindow: false, bookingStaysLive: true, user, now: IN_WINDOW }, store);
    expect(r.restored).toBe(true);
    expect(bookings[0]).toMatchObject({ status: 'confirmed', birthdayDiscountApplied: true, key: null, amountAed: 49, spotsBooked: 2 });

    const offer = await seam.decideBirthdayOffer({ ...user, birthdayDiscountUsedAt: user.birthdayDiscountUsedAt }, IN_WINDOW, store);
    expect(offer).toEqual({ applied: true, windowKey: '2026-09-24' });
  });
});
