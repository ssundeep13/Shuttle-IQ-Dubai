// IQ Pass Gate 1 — the pure rules module. Tier table, 50% cap, rolling
// 4-week window, pick validation, the 5-hour move cutoff, jersey eligibility.
// No DB, no HTTP.
import { describe, it, expect } from 'vitest';
import {
  IQ_PASS_TIERS, PACK_TIER_ORDER, isPackTier, HOLD_MINUTES, PACK_CAP_RATIO, packSeatCap, isPlusOrAbove,
  WINDOW_DAYS, addDaysDubai, todayDubai, windowFor, validatePicks, MOVE_CUTOFF_MS, canMoveSeat, jerseyEligible,
  type CalendarSession,
} from '../server/iqPass/rules';

describe('tier table (locked product spec)', () => {
  it('Club 4 / 188, Club Plus 8 / 360, Club Elite 12 / 516 — labels never mention price', () => {
    expect(IQ_PASS_TIERS.club).toEqual({ label: 'Club', games: 4, priceAed: 188, allocationAed: 47 });
    expect(IQ_PASS_TIERS.club_plus).toEqual({ label: 'Club Plus', games: 8, priceAed: 360, allocationAed: 45 });
    expect(IQ_PASS_TIERS.club_elite).toEqual({ label: 'Club Elite', games: 12, priceAed: 516, allocationAed: 43 });
    expect(PACK_TIER_ORDER).toEqual(['club', 'club_plus', 'club_elite']);
  });

  it('allocation × games reproduces the pack price exactly (no rounding drift)', () => {
    for (const t of PACK_TIER_ORDER) expect(IQ_PASS_TIERS[t].allocationAed * IQ_PASS_TIERS[t].games).toBe(IQ_PASS_TIERS[t].priceAed);
  });

  it('isPackTier guards unknown strings; Plus and Elite are "Plus or above"', () => {
    expect(isPackTier('club')).toBe(true);
    expect(isPackTier('gold')).toBe(false);
    expect(isPackTier(undefined)).toBe(false);
    expect(isPlusOrAbove('club')).toBe(false);
    expect(isPlusOrAbove('club_plus')).toBe(true);
    expect(isPlusOrAbove('club_elite')).toBe(true);
  });

  it('constants: 30-minute hold, 50% cap, 28-day window, 5-hour move cutoff', () => {
    expect(HOLD_MINUTES).toBe(30);
    expect(PACK_CAP_RATIO).toBe(0.5);
    expect(WINDOW_DAYS).toBe(28);
    expect(MOVE_CUTOFF_MS).toBe(5 * 60 * 60 * 1000);
  });
});

describe('packSeatCap — computed live from each session capacity', () => {
  it('18 → 9, 24 → 12, 36 → 18, odd capacities floor', () => {
    expect(packSeatCap(18)).toBe(9);
    expect(packSeatCap(24)).toBe(12);
    expect(packSeatCap(36)).toBe(18);
    expect(packSeatCap(17)).toBe(8);
    expect(packSeatCap(0)).toBe(0);
  });
});

describe('Dubai calendar helpers', () => {
  it('addDaysDubai does plain YYYY-MM-DD arithmetic across month ends', () => {
    expect(addDaysDubai('2026-09-14', 1)).toBe('2026-09-15');
    expect(addDaysDubai('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysDubai('2026-09-14', 27)).toBe('2026-10-11');
    expect(addDaysDubai('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('todayDubai uses Asia/Dubai, not the server clock', () => {
    // 21:30 UTC on 14 Sep is already 01:30 on 15 Sep in Dubai.
    expect(todayDubai(new Date('2026-09-14T21:30:00.000Z'))).toBe('2026-09-15');
    expect(todayDubai(new Date('2026-09-14T19:59:00.000Z'))).toBe('2026-09-14');
  });
});

describe('windowFor — rolling 4 weeks, next pass opens the day after the current last game', () => {
  it('no current pass → starts today, 28 days inclusive', () => {
    expect(windowFor('2026-09-14', null)).toEqual({ start: '2026-09-14', end: '2026-10-11' });
  });

  it('current pass ending in the future → starts the day after its last picked game', () => {
    expect(windowFor('2026-09-14', '2026-09-30')).toEqual({ start: '2026-10-01', end: '2026-10-28' });
  });

  it('current pass whose last game is already past → starts today (never in the past)', () => {
    expect(windowFor('2026-09-14', '2026-09-10')).toEqual({ start: '2026-09-14', end: '2026-10-11' });
  });
});

const window = { start: '2026-09-14', end: '2026-10-11' };
const S = (id: string, over: Partial<CalendarSession> = {}): CalendarSession => ({
  id, dateDubai: '2026-09-20', status: 'upcoming', linked: true, capacity: 24, spotsRemaining: 20, packSeats: 0, ...over,
});
const base = () => ({ tier: 'club' as const, window, sessions: [S('a'), S('b'), S('c'), S('d'), S('e')], alreadyBookedSessionIds: new Set<string>() });

describe('validatePicks — every purchase-time rule in one place', () => {
  it('exactly games_total distinct sessions inside the window → ok', () => {
    expect(validatePicks({ ...base(), picks: ['a', 'b', 'c', 'd'] })).toEqual({ ok: true });
  });

  it('wrong count → 400 pick_count (3 or 5 for Club)', () => {
    expect(validatePicks({ ...base(), picks: ['a', 'b', 'c'] })).toMatchObject({ ok: false, status: 400, error: 'pick_count' });
    expect(validatePicks({ ...base(), picks: ['a', 'b', 'c', 'd', 'e'] })).toMatchObject({ ok: false, status: 400, error: 'pick_count' });
  });

  it('duplicate session → 400 duplicate_pick', () => {
    expect(validatePicks({ ...base(), picks: ['a', 'a', 'b', 'c'] })).toMatchObject({ ok: false, status: 400, error: 'duplicate_pick', sessionId: 'a' });
  });

  it('unknown session id → 400 unknown_session', () => {
    expect(validatePicks({ ...base(), picks: ['a', 'b', 'c', 'zz'] })).toMatchObject({ ok: false, status: 400, error: 'unknown_session', sessionId: 'zz' });
  });

  it('not upcoming or not linked → 400 session_unavailable', () => {
    const b = base(); b.sessions[1] = S('b', { status: 'cancelled' });
    expect(validatePicks({ ...b, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 400, error: 'session_unavailable', sessionId: 'b' });
    const c = base(); c.sessions[2] = S('c', { linked: false });
    expect(validatePicks({ ...c, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 400, error: 'session_unavailable', sessionId: 'c' });
  });

  it('outside the window (either side) → 400 out_of_window', () => {
    const b = base(); b.sessions[0] = S('a', { dateDubai: '2026-09-13' });
    expect(validatePicks({ ...b, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 400, error: 'out_of_window', sessionId: 'a' });
    const c = base(); c.sessions[3] = S('d', { dateDubai: '2026-10-12' });
    expect(validatePicks({ ...c, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 400, error: 'out_of_window', sessionId: 'd' });
    const edge = base(); edge.sessions[3] = S('d', { dateDubai: '2026-10-11' });
    expect(validatePicks({ ...edge, picks: ['a', 'b', 'c', 'd'] })).toEqual({ ok: true });
  });

  it('player already holds an active booking on the session → 409 already_booked', () => {
    expect(validatePicks({ ...base(), picks: ['a', 'b', 'c', 'd'], alreadyBookedSessionIds: new Set(['c']) }))
      .toMatchObject({ ok: false, status: 409, error: 'already_booked', sessionId: 'c' });
  });

  it('session full → 409 session_full', () => {
    const b = base(); b.sessions[0] = S('a', { spotsRemaining: 0 });
    expect(validatePicks({ ...b, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 409, error: 'session_full', sessionId: 'a' });
  });

  it('pack seats at the 50% cap → 409 pack_cap_reached; one below the cap is fine', () => {
    const b = base(); b.sessions[0] = S('a', { capacity: 18, packSeats: 9 });
    expect(validatePicks({ ...b, picks: ['a', 'b', 'c', 'd'] })).toMatchObject({ ok: false, status: 409, error: 'pack_cap_reached', sessionId: 'a' });
    const c = base(); c.sessions[0] = S('a', { capacity: 18, packSeats: 8 });
    expect(validatePicks({ ...c, picks: ['a', 'b', 'c', 'd'] })).toEqual({ ok: true });
  });

  it('Club Plus needs 8 picks; Elite 12', () => {
    const many = Array.from({ length: 12 }, (_, i) => S(`s${i}`));
    expect(validatePicks({ tier: 'club_plus', window, sessions: many, alreadyBookedSessionIds: new Set(), picks: many.slice(0, 8).map(s => s.id) })).toEqual({ ok: true });
    expect(validatePicks({ tier: 'club_elite', window, sessions: many, alreadyBookedSessionIds: new Set(), picks: many.map(s => s.id) })).toEqual({ ok: true });
    expect(validatePicks({ tier: 'club_elite', window, sessions: many, alreadyBookedSessionIds: new Set(), picks: many.slice(0, 8).map(s => s.id) })).toMatchObject({ ok: false, error: 'pick_count' });
  });
});

describe('canMoveSeat — 5 hours before the session being vacated (ruling E3a)', () => {
  // Session 20 Sep 2026 20:00 Dubai = 16:00Z. Cutoff = 11:00Z.
  const date = '2026-09-20'; const start = '20:00';
  it('one millisecond before the cutoff → allowed; at the cutoff → refused', () => {
    expect(canMoveSeat(date, start, new Date('2026-09-20T10:59:59.999Z'))).toBe(true);
    expect(canMoveSeat(date, start, new Date('2026-09-20T11:00:00.000Z'))).toBe(false);
    expect(canMoveSeat(date, start, new Date('2026-09-21T00:00:00.000Z'))).toBe(false);
  });
});

describe('jerseyEligible — first Club Elite purchase only', () => {
  it('true for Elite with no prior Elite pack; false otherwise', () => {
    expect(jerseyEligible('club_elite', 0)).toBe(true);
    expect(jerseyEligible('club_elite', 1)).toBe(false);
    expect(jerseyEligible('club_plus', 0)).toBe(false);
    expect(jerseyEligible('club', 0)).toBe(false);
  });
});
