// Weekly recurring sessions — the pure logic.
//
// Every date here is a 'YYYY-MM-DD' STRING. The whole point of these helpers is
// that a session's calendar day never round-trips through a local-timezone JS
// Date: sessions.date is a naive timestamp, and a UTC+4 reader turns it into
// the previous UTC day (the bug that cost the Dubailand analysis).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const {
  weekdayName, addWeeksToISODate, seriesDates, formatPreviewDate,
  SERIES_WEEKS_MIN, SERIES_WEEKS_MAX, SERIES_WEEKS_DEFAULT,
} = await import('../shared/utils/seriesDates');
const { planSeriesStop } = await import('../server/sessionSeries');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('weekdayName — derived from the string, never from a local Date', () => {
  it('names the weekday of the anchor date', () => {
    expect(weekdayName('2026-08-25')).toBe('Tuesday');
    expect(weekdayName('2026-08-26')).toBe('Wednesday');
    expect(weekdayName('2026-08-27')).toBe('Thursday');
    expect(weekdayName('2026-08-30')).toBe('Sunday');
  });

  it('is stable for a date that a UTC+4 reader would shift to the previous day', () => {
    // 2026-08-14 00:00 naive, read as Asia/Dubai, becomes 2026-08-13T20:00Z.
    // The helper must still say Friday, not Thursday.
    expect(weekdayName('2026-08-14')).toBe('Friday');
  });

  it('rejects anything that is not a plain ISO date', () => {
    for (const bad of ['25-08-2026', '2026-8-25', '', '2026-08-25T00:00:00Z', 'tuesday']) {
      expect(() => weekdayName(bad)).toThrow();
    }
  });
});

describe('addWeeksToISODate — calendar arithmetic on the string', () => {
  it('adds seven days', () => {
    expect(addWeeksToISODate('2026-08-25', 1)).toBe('2026-09-01');
    expect(addWeeksToISODate('2026-08-25', 4)).toBe('2026-09-22');
  });

  it('crosses a month boundary', () => {
    expect(addWeeksToISODate('2026-08-26', 1)).toBe('2026-09-02');
  });

  it('crosses a year boundary', () => {
    expect(addWeeksToISODate('2026-12-29', 1)).toBe('2027-01-05');
  });

  it('crosses a leap day', () => {
    expect(addWeeksToISODate('2028-02-22', 1)).toBe('2028-02-29');
    expect(addWeeksToISODate('2028-02-29', 1)).toBe('2028-03-07');
  });

  it('keeps the weekday across a DST changeover in other regions', () => {
    // Late Oct/early Nov is where a naive +168h slips an hour in DST zones.
    // Dubai has no DST, but the helper must not depend on that.
    for (let w = 1; w <= 4; w++) {
      expect(weekdayName(addWeeksToISODate('2026-10-27', w))).toBe('Tuesday');
    }
  });

  it('never drifts over a long run', () => {
    let d = '2026-01-06'; // a Tuesday
    for (let i = 0; i < 52; i++) d = addWeeksToISODate(d, 1);
    expect(weekdayName(d)).toBe('Tuesday');
    expect(d).toBe('2027-01-05');
  });
});

describe('seriesDates — the future dates a series will create', () => {
  it('returns exactly N dates, starting one week after the anchor', () => {
    expect(seriesDates('2026-08-25', 4)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']);
  });

  it('the anchor itself is never in the list (it already exists)', () => {
    expect(seriesDates('2026-08-25', 8)).not.toContain('2026-08-25');
    expect(seriesDates('2026-08-25', 8)).toHaveLength(8);
  });

  it('every generated date falls on the anchor weekday', () => {
    for (const d of seriesDates('2026-08-26', 8)) expect(weekdayName(d)).toBe('Wednesday');
  });

  it('the allowed range is 4 to 8, defaulting to 4', () => {
    expect([SERIES_WEEKS_MIN, SERIES_WEEKS_MAX, SERIES_WEEKS_DEFAULT]).toEqual([4, 8, 4]);
    expect(() => seriesDates('2026-08-25', 3)).toThrow();
    expect(() => seriesDates('2026-08-25', 9)).toThrow();
  });
});

describe('formatPreviewDate — what the admin reads before confirming', () => {
  it('renders the short form used in the "Creates:" line', () => {
    expect(formatPreviewDate('2026-08-26')).toBe('26 Aug');
    expect(formatPreviewDate('2026-09-02')).toBe('2 Sep');
    expect(formatPreviewDate('2027-01-05')).toBe('5 Jan');
  });
});

describe('purity — no local-timezone Date anywhere in the helper', () => {
  const src = stripComments(read('shared/utils/seriesDates.ts'));

  it('uses UTC component math only — no local getters, no Date parsing of the string', () => {
    expect(src).not.toMatch(/\.getFullYear\(|\.getMonth\(|\.getDate\(|\.getDay\(/);
    expect(src).not.toMatch(/new Date\(\s*iso|new Date\(\s*dateStr|toLocaleDateString/);
    expect(src).toContain('Date.UTC');
  });
});

describe('planSeriesStop — booked sessions survive, the DB will not protect them', () => {
  const TODAY = '2026-08-25';
  const row = (id: string, dateIso: string, bookingCount: number, isOrigin = false) =>
    ({ opsId: `ops-${id}`, bookableId: `bk-${id}`, dateIso, bookingCount, isOrigin });

  // Caught in Gate 4 verification: the originating session is back-linked into
  // the series so the list can count it, which made it look like just another
  // future unbooked row and put it on the removal list. Stopping a SERIES must
  // never delete the session the admin deliberately created — and the
  // session_series.origin_session_id foreign key would reject it anyway.
  it('NEVER removes the originating session, even when future and unbooked', () => {
    const plan = planSeriesStop([row('origin', '2026-08-26', 0, true), row('w1', '2026-09-02', 0)], TODAY);
    expect(plan.remove.map(r => r.opsId)).toEqual(['ops-w1']);
    expect(plan.keep.map(r => r.opsId)).toEqual(['ops-origin']);
    expect(plan.keep[0].reason).toBe('is_origin');
  });

  it('origin protection wins over every other rule', () => {
    const plan = planSeriesStop([row('origin', '2026-12-01', 0, true)], TODAY);
    expect(plan.remove).toEqual([]);
  });

  it('removes future sessions with no bookings', () => {
    const plan = planSeriesStop([row('a', '2026-09-01', 0), row('b', '2026-09-08', 0)], TODAY);
    expect(plan.remove.map(r => r.opsId)).toEqual(['ops-a', 'ops-b']);
    expect(plan.keep).toEqual([]);
  });

  it('KEEPS any session holding at least one booking', () => {
    const plan = planSeriesStop([row('a', '2026-09-01', 1), row('b', '2026-09-08', 0)], TODAY);
    expect(plan.remove.map(r => r.opsId)).toEqual(['ops-b']);
    expect(plan.keep.map(r => r.opsId)).toEqual(['ops-a']);
    expect(plan.keep[0].reason).toBe('has_bookings');
  });

  it('a single booking is enough to save a session', () => {
    const plan = planSeriesStop([row('a', '2026-09-01', 1)], TODAY);
    expect(plan.remove).toEqual([]);
  });

  it('never touches a session in the past, booked or not', () => {
    const plan = planSeriesStop([row('past', '2026-08-18', 0), row('today', TODAY, 0), row('fut', '2026-09-01', 0)], TODAY);
    expect(plan.remove.map(r => r.opsId)).toEqual(['ops-fut']);
    expect(plan.keep.map(r => r.reason).sort()).toEqual(['already_started', 'already_started']);
  });

  it('an empty series plans nothing', () => {
    expect(planSeriesStop([], TODAY)).toEqual({ remove: [], keep: [] });
  });
});

describe('stop-series write order — costs, then bookable, then sessions', () => {
  const src = stripComments(read('server/sessionSeries.ts'));

  it('deletes in the order the one real foreign key demands', () => {
    const costs = src.indexOf('sessionCosts');
    const bookable = src.indexOf('bookableSessions');
    const ops = src.lastIndexOf('sessions)');
    expect(costs).toBeGreaterThan(-1);
    expect(bookable).toBeGreaterThan(costs);   // bookable_sessions.linked_session_id FK blocks the reverse
    expect(ops).toBeGreaterThan(bookable);
  });

  it('the whole stop runs in one transaction', () => {
    expect(src).toContain('db.transaction');
  });

  it('generation writes the date as an explicit SQL cast, never a JS Date', () => {
    expect(src).toContain('::timestamp');
    expect(src).not.toMatch(/date:\s*new Date\(/);
  });

  it('generated sessions are always upcoming, never active and never sandbox', () => {
    expect(src).toContain("status: 'upcoming'");
    expect(src).not.toContain("status: 'active'");
    expect(src).toMatch(/isSandbox:\s*false/);
  });
});
