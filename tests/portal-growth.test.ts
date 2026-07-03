import { describe, it, expect } from 'vitest';
import {
  computeRepeatRate,
  computeThirdSessionRetention,
  computeLapsed,
  computeGrowth,
  computeReferrals,
  computeWomens,
  computeFillRate,
  computeLtv,
  type AttendanceRow,
} from '../server/portalGrowth';

const att = (over: Partial<AttendanceRow>): AttendanceRow => ({
  userId: 'u1', userName: 'Priya', gender: 'Female',
  sessionId: 's1', sessionDate: '2026-06-02', spotsBooked: 1,
  ...over,
});

describe('computeRepeatRate — distinct attended sessions per player', () => {
  it('thresholds + distribution; multiple bookings on ONE session count once', () => {
    const rows = [
      att({ userId: 'a', sessionId: 's1' }), att({ userId: 'a', sessionId: 's1' }), // same session twice (extra-guest booking)
      att({ userId: 'a', sessionId: 's2' }), att({ userId: 'a', sessionId: 's3' }),
      att({ userId: 'b', sessionId: 's1' }), att({ userId: 'b', sessionId: 's2' }),
      att({ userId: 'c', sessionId: 's1' }),
    ];
    const r = computeRepeatRate(rows);
    expect(r.playersWithAttendance).toBe(3);
    expect(r.ge2).toBe(2); expect(r.ge3).toBe(1); expect(r.ge5).toBe(0);
    expect(r.pct3).toBe(33.3);
    expect(r.distribution).toEqual([{ sessions: 1, players: 1 }, { sessions: 2, players: 1 }, { sessions: 3, players: 1 }]);
  });
});

describe('computeThirdSessionRetention — cohort by first attended month', () => {
  it('cohorts on first-session month; reached3 counts lifetime sessions', () => {
    const rows = [
      // u1: first June, 3 sessions (2 in July) → June cohort, reached 3rd
      att({ userId: 'u1', sessionId: 'a', sessionDate: '2026-06-02' }),
      att({ userId: 'u1', sessionId: 'b', sessionDate: '2026-07-02' }),
      att({ userId: 'u1', sessionId: 'c', sessionDate: '2026-07-04' }),
      // u2: first June, 1 session → June cohort, not reached
      att({ userId: 'u2', sessionId: 'a', sessionDate: '2026-06-02' }),
      // u3: first July → July cohort
      att({ userId: 'u3', sessionId: 'c', sessionDate: '2026-07-04' }),
    ];
    expect(computeThirdSessionRetention(rows)).toEqual([
      { month: '2026-06', cohortSize: 2, reached3: 1, pct: 50 },
      { month: '2026-07', cohortSize: 1, reached3: 0, pct: 0 },
    ]);
  });
});

describe('computeLapsed — cutoff boundary', () => {
  it('lapsed = last session strictly before today − N days; sorted oldest first', () => {
    const rows = [
      att({ userId: 'old', userName: 'Meera', sessionId: 'a', sessionDate: '2026-06-02' }),
      att({ userId: 'edge', userName: 'Rahul', sessionId: 'b', sessionDate: '2026-06-03' }), // exactly 30d before Jul 3 → NOT lapsed
      att({ userId: 'fresh', userName: 'Zara', sessionId: 'c', sessionDate: '2026-07-02' }),
    ];
    const lapsed = computeLapsed(rows, '2026-07-03', 30);
    expect(lapsed).toEqual([{ name: 'Meera', lastSessionDate: '2026-06-02', lifetimeSessions: 1 }]);
  });
});

describe('computeGrowth — ISO week + month bucketing', () => {
  it('buckets signups and bookings independently', () => {
    const g = computeGrowth(
      [{ dateIso: '2026-06-02' }, { dateIso: '2026-06-03' }, { dateIso: '2026-07-01' }],
      [{ dateIso: '2026-06-02' }],
    );
    expect(g.signups.monthly).toEqual([{ month: '2026-06', count: 2 }, { month: '2026-07', count: 1 }]);
    expect(g.signups.weekly[0]).toEqual({ label: '2026-W23', count: 2 });
    expect(g.bookings.monthly).toEqual([{ month: '2026-06', count: 1 }]);
  });
});

describe('computeReferrals — completed trend excludes pre-June', () => {
  it('totals cover all statuses; monthly trend only completed June+', () => {
    const r = computeReferrals([
      { status: 'completed', completedIso: '2026-05-20' }, // pre-June — excluded from trend
      { status: 'completed', completedIso: '2026-06-10' },
      { status: 'completed', completedIso: '2026-06-20' },
      { status: 'pending', completedIso: null },
    ]);
    expect(r.totals).toContainEqual({ status: 'completed', count: 3 });
    expect(r.completedMonthly).toEqual([{ month: '2026-06', count: 2 }]);
  });
});

describe("computeWomens — players % excludes unknown gender; attendances count seats", () => {
  it('percentages per month', () => {
    const rows = [
      att({ userId: 'f1', gender: 'Female', spotsBooked: 2 }), // 2 seats (guest to a woman booker)
      att({ userId: 'm1', gender: 'Male', spotsBooked: 1 }),
      att({ userId: 'x1', gender: null, spotsBooked: 1 }),     // no linked profile
    ];
    const w = computeWomens(rows);
    expect(w.unknownGenderPlayers).toBe(1);
    expect(w.monthly[0]).toMatchObject({
      month: '2026-06', uniquePlayers: 3, femalePlayers: 1,
      pctPlayers: 50,        // 1 of 2 KNOWN-gender players
      attendances: 4, femaleAttendances: 2, pctAttendances: 50,
    });
  });
});

describe('computeFillRate — past sessions only, null capacity excluded but counted', () => {
  it('per-session, weekly, monthly', () => {
    const f = computeFillRate([
      { sessionId: 'a', dateIso: '2026-06-02', capacity: 24, bookedSpots: 23, isPast: true },
      { sessionId: 'b', dateIso: '2026-06-04', capacity: 24, bookedSpots: 24, isPast: true },
      { sessionId: 'c', dateIso: '2026-06-06', capacity: null, bookedSpots: 10, isPast: true }, // excluded, counted
      { sessionId: 'd', dateIso: '2026-07-30', capacity: 24, bookedSpots: 2, isPast: false },   // future — ignored
    ]);
    expect(f.excludedNullCapacity).toBe(1);
    expect(f.perSession).toHaveLength(2);
    expect(f.monthly).toEqual([{ month: '2026-06', sessions: 2, booked: 47, capacity: 48, pct: 97.9 }]);
    expect(f.weekly[0].label).toBe('2026-W23');
  });
});

describe('computeLtv — BOOKING basis: per-seat over paid spots, guest seats to the booker', () => {
  it('splits session value-profit across booked seats (attendance plays no role)', () => {
    // session s1: value profit 120.00 AED (12,000 fils), booked seats: A×2 + B×1 = 3
    // per-seat 4,000 fils → A 8,000, B 4,000
    const rows = [
      att({ userId: 'A', userName: 'Anita', sessionId: 's1', spotsBooked: 2 }),
      att({ userId: 'B', userName: 'Bilal', sessionId: 's1', spotsBooked: 1 }),
      // session s2: only A, 1 seat, profit 5,000 → A +5,000
      att({ userId: 'A', userName: 'Anita', sessionId: 's2', spotsBooked: 1, sessionDate: '2026-06-04' }),
    ];
    const ltv = computeLtv(rows, new Map([['s1', 12_000], ['s2', 5_000]]));
    expect(ltv.players).toEqual([
      { name: 'Anita', sessions: 2, ltvFils: 13_000 },
      { name: 'Bilal', sessions: 1, ltvFils: 4_000 },
    ]);
  });

  it('a session with no profit row contributes nothing (never guessed)', () => {
    const ltv = computeLtv([att({ userId: 'A', sessionId: 'unknown' })], new Map());
    expect(ltv.players).toEqual([]);
  });
});
