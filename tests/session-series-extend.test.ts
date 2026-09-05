// Extend series — adds N weekly sessions to the END of an existing series.
//
// Layered like the feature: pure date maths first, then the server module
// against a recording fake of the drizzle transaction (writes are buffered
// and only "committed" when the transaction callback resolves, so a mid-
// failure must leave zero orphans), then source pins for the route.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// ── Fake DB (hoisted so the vi.mock factories can reach it) ──────────────────
// Writes go into a per-transaction buffer and reach `committed` only if the
// transaction callback resolves — a throw discards them, like a real rollback.
const fake = vi.hoisted(() => ({
  uuidN: 0,
  txCalls: 0,
  committed: [] as Array<{ op: string; table: string; values: any }>,
  failOnWrite: -1,
  seedDates: [] as string[],
  series: null as null | { id: string; stopped_at: string | null },
  template: null as null | Record<string, unknown>,
  // drizzle's sql`` keeps StringChunks ({ value: string[] }), nested SQL, and
  // interpolated primitives RAW in queryChunks — flatten all three.
  sqlText(q: any): string {
    const chunks = q?.queryChunks ?? [];
    return chunks.map((c: any) =>
      (typeof c === 'string' || typeof c === 'number') ? String(c)
      : Array.isArray(c?.value) ? c.value.join('')
      : c?.queryChunks ? fake.sqlText(c)
      : (c?.value !== undefined ? String(c.value) : '')).join('');
  },
  dateOf(v: any): string { return fake.sqlText(v).slice(0, 10); },
  lastDate(): string {
    const all = [...fake.seedDates, ...fake.committed.filter(w => w.table === 'sessions' && w.op === 'insert').map(w => fake.dateOf(w.values.date))];
    return all.sort()[all.length - 1];
  },
}));

// Deterministic ids: the server module resolves `randomUUID` off the builtin
// module object at call time, so a spy on that object reaches it. (A vi.mock of
// 'crypto' does NOT — the first snapshot run proved it with real uuids.)
import nodeCrypto from 'crypto';
vi.spyOn(nodeCrypto, 'randomUUID').mockImplementation((() => `uuid-${++fake.uuidN}`) as any);

vi.mock('../server/db', async () => {
  const { getTableName } = await import('drizzle-orm');
  const route = async (q: any) => {
    const text = fake.sqlText(q);
    if (text.includes('FOR UPDATE')) return { rows: fake.series ? [fake.series] : [] };
    if (text.includes('ORDER BY s.date DESC')) return { rows: fake.template ? [{ ...fake.template, last_date_iso: fake.lastDate() }] : [] };
    return { rows: [] };
  };
  const makeTx = (buffer: any[]) => {
    let n = 0;
    const record = (op: string, table: any, values: any) => {
      n++;
      if (n === fake.failOnWrite) throw new Error('boom: simulated write failure');
      buffer.push({ op, table: getTableName(table), values });
    };
    return {
      insert: (t: any) => ({ values: async (v: any) => { record('insert', t, v); } }),
      update: (t: any) => ({ set: (v: any) => ({ where: async () => { record('update', t, v); } }) }),
      delete: (t: any) => ({ where: async () => { record('delete', t, null); } }),
      execute: route,
    };
  };
  return {
    db: {
      transaction: async (fn: any) => {
        fake.txCalls++;
        const buffer: any[] = [];
        const r = await fn(makeTx(buffer));
        fake.committed.push(...buffer);
        return r;
      },
      execute: route,
    },
  };
});

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const {
  extensionDates, weekdayName, seriesEndLabel,
  EXTEND_WEEKS_MIN, EXTEND_WEEKS_MAX, EXTEND_WEEKS_DEFAULT,
  SERIES_WEEKS_MIN, SERIES_WEEKS_MAX, SERIES_WEEKS_DEFAULT,
} = await import('../shared/utils/seriesDates');

// ── 1–3: pure date maths ─────────────────────────────────────────────────────

describe('extensionDates — weeks AFTER the series\' current last date', () => {
  it('1. returns exactly N dates, 7 days apart, starting one week after the last date', () => {
    const out = extensionDates('2026-09-21', 4);
    expect(out).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(out).not.toContain('2026-09-21');
    const gaps = out.map((d, i) => (i === 0
      ? (Date.UTC(2026, 8, 28) - Date.UTC(2026, 8, 21))
      : (Date.parse(d + 'T00:00:00Z') - Date.parse(out[i - 1] + 'T00:00:00Z'))) / 86400000);
    expect(gaps).toEqual([7, 7, 7, 7]);
  });

  it('2. allows 1..8 and nothing else; constants are 1/8/4 and separate from the wizard\'s 4/8/4', () => {
    expect(extensionDates('2026-09-21', 1)).toEqual(['2026-09-28']);
    expect(extensionDates('2026-09-21', 8)).toHaveLength(8);
    for (const bad of [0, 9, 2.5, -1, NaN]) expect(() => extensionDates('2026-09-21', bad)).toThrow();
    expect([EXTEND_WEEKS_MIN, EXTEND_WEEKS_MAX, EXTEND_WEEKS_DEFAULT]).toEqual([1, 8, 4]);
    expect([SERIES_WEEKS_MIN, SERIES_WEEKS_MAX, SERIES_WEEKS_DEFAULT]).toEqual([4, 8, 4]); // untouched
  });

  it('3. every extension date keeps the weekday of the last date, across month and year ends', () => {
    for (const last of ['2026-09-21', '2026-09-30', '2026-12-28', '2028-02-22']) {
      const wd = weekdayName(last);
      for (const d of extensionDates(last, 8)) expect(weekdayName(d)).toBe(wd);
    }
  });
});

// ── 13: the card's meta label, pure ───────────────────────────────────────────

describe('seriesEndLabel — "ends" from rows, "stopped" when stopped', () => {
  it('13. a 5-row series reports its 5th date; after +4 the 9th; a stopped series reports the stop date', () => {
    const fiveRows = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
    expect(seriesEndLabel(fiveRows[4], null)).toBe('ends 21 Sep');
    const extended = [...fiveRows, ...extensionDates(fiveRows[4], 4)];
    expect(extended).toHaveLength(9);
    expect(seriesEndLabel(extended[8], null)).toBe('ends 19 Oct');
    expect(seriesEndLabel('2026-09-21', '2026-09-05')).toBe('stopped 5 Sep');
    expect(seriesEndLabel(null, null)).toBe('');
  });
});

// ── 4–12: server module against the fake transaction ─────────────────────────

const seriesMod = await import('../server/sessionSeries');
const { extendSeries, generateSeriesWeeks, planSeriesStop, SeriesStoppedError } = seriesMod as any;

const FIVE = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
const TEMPLATE = {
  venue_name: 'Smash Sports Academy', venue_location: 'Al Quoz', venue_map_url: null, court_count: 3,
  title: 'Smash Sports Academy Session', description: null, start_time: '20:00', end_time: '22:00',
  capacity: 18, price_aed: 49,
  has_costs: true, court_cost_fils: 30000, shuttle_cost_fils: 5000, water_cost_fils: 1000,
  court_cost_overridden: false, captain_id: 'runner-1',
};
const inserts = (table: string) => fake.committed.filter(w => w.op === 'insert' && w.table === table).map(w => w.values);
const gapsOf = (dates: string[]) => dates.slice(1).map((d, i) => (Date.parse(d + 'T00:00:00Z') - Date.parse(dates[i] + 'T00:00:00Z')) / 86400000);

beforeEach(() => {
  fake.uuidN = 0; fake.txCalls = 0; fake.committed.length = 0; fake.failOnWrite = -1;
  fake.seedDates = [...FIVE];
  fake.series = { id: 'series-1', stopped_at: null };
  fake.template = { ...TEMPLATE };
});

describe('extendSeries — adds N weeks to the END of the series, all-or-nothing', () => {
  it('4. adds exactly N ops + bookable + costs rows, 7 days apart, upcoming, never sandbox, same series', async () => {
    const r = await extendSeries('series-1', 4, 'admin-1');
    expect(r).toMatchObject({ seriesId: 'series-1', endsDate: '2026-10-19', costsCopied: true });
    expect(r.dates).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);

    const ops = inserts('sessions'), bk = inserts('bookable_sessions'), costs = inserts('session_costs');
    expect([ops.length, bk.length, costs.length]).toEqual([4, 4, 4]);
    expect(gapsOf(ops.map(o => fake.dateOf(o.date)))).toEqual([7, 7, 7]);
    for (const o of ops) expect(o).toMatchObject({ status: 'upcoming', isSandbox: false, seriesId: 'series-1', venueName: 'Smash Sports Academy', courtCount: 3 });
    for (let i = 0; i < 4; i++) {
      expect(bk[i]).toMatchObject({ linkedSessionId: ops[i].id, title: 'Smash Sports Academy Session', startTime: '20:00', endTime: '22:00', capacity: 18, priceAed: 49, status: 'upcoming' });
      expect(fake.dateOf(bk[i].date)).toBe(fake.dateOf(ops[i].date));
      expect(costs[i]).toMatchObject({ sessionId: bk[i].id, courtCostFils: 30000, shuttleCostFils: 5000, waterCostFils: 1000, captainId: 'runner-1', capturedBy: 'admin-1' });
    }
    // the title is a raw copy of the template — it carries no date text
    expect(bk[0].title).not.toMatch(/\d/);
    expect(fake.committed.some(w => w.table === 'session_series')).toBe(false); // no new series row
  });

  it('5. extending twice continues from the NEW last date — no duplicates', async () => {
    const first = await extendSeries('series-1', 4, 'admin-1');
    const second = await extendSeries('series-1', 2, 'admin-1');
    expect(second.dates).toEqual(['2026-10-26', '2026-11-02']);
    expect(second.endsDate).toBe('2026-11-02');
    const all = [...FIVE, ...inserts('sessions').map(o => fake.dateOf(o.date))].sort();
    expect(new Set(all).size).toBe(all.length);
    expect(gapsOf(all)).toEqual(Array(10).fill(7));
    expect(first.dates.every(d => !second.dates.includes(d))).toBe(true);
  });

  it('6. refuses a stopped series — nothing inserted', async () => {
    fake.series = { id: 'series-1', stopped_at: '2026-09-05 08:00:00' };
    await expect(extendSeries('series-1', 4, 'admin-1')).rejects.toBeInstanceOf(SeriesStoppedError);
    expect(fake.committed).toHaveLength(0);
  });

  it('7. template without a costs row → still succeeds, no cost rows, costsCopied false', async () => {
    fake.template = { ...TEMPLATE, has_costs: false, court_cost_fils: null, shuttle_cost_fils: null, water_cost_fils: null, court_cost_overridden: null, captain_id: null };
    const r = await extendSeries('series-1', 3, 'admin-1');
    expect(r.costsCopied).toBe(false);
    expect([inserts('sessions').length, inserts('bookable_sessions').length, inserts('session_costs').length]).toEqual([3, 3, 0]);
  });

  it('8. a write failing mid-way rolls the whole extension back — zero orphans', async () => {
    fake.failOnWrite = 5; // second week's bookable row
    await expect(extendSeries('series-1', 4, 'admin-1')).rejects.toThrow(/boom/);
    expect(fake.committed).toHaveLength(0);
    expect(fake.txCalls).toBe(1);
  });

  it('10. stop-series after an extension still keeps origin, booked and past sessions', () => {
    const rows = [...FIVE, ...extensionDates('2026-09-21', 4)].map((dateIso, i) => ({
      opsId: `o${i}`, bookableId: `b${i}`, dateIso, isOrigin: i === 0,
      bookingCount: i === 2 || i === 6 ? 1 : 0, // one original + one EXTENDED session booked
    }));
    const plan = planSeriesStop(rows, '2026-09-08'); // 24 Aug, 31 Aug, 7 Sep already happened
    // index 6 is the second EXTENDED session (28 Sep, 5 Oct, 12 Oct, 19 Oct)
    expect(plan.keep.map(k => [k.dateIso, k.reason])).toEqual([
      ['2026-08-24', 'is_origin'], ['2026-08-31', 'already_started'], ['2026-09-07', 'already_started'],
      ['2026-10-05', 'has_bookings'],
    ]);
    expect(plan.remove.map(r => r.dateIso)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-12', '2026-10-19']);
  });
});

describe('9. generateSeriesWeeks — unchanged by the refactor', () => {
  const INPUT = {
    originSessionId: 'origin-1', anchorDateIso: '2026-08-24', weeksAhead: 4, createdBy: 'admin-1',
    venueName: 'Smash Sports Academy', venueLocation: 'Al Quoz', venueMapUrl: null, courtCount: 3,
    title: 'Smash Sports Academy Session', description: null, startTime: '20:00', endTime: '22:00',
    capacity: 18, priceAed: 49,
    costs: { courtCostFils: 30000, shuttleCostFils: 5000, waterCostFils: 1000, courtCostOverridden: false, captainId: 'runner-1' },
  };

  it('9a. return shape + every write are byte-identical to the pre-refactor snapshot', async () => {
    const r = await generateSeriesWeeks(INPUT);
    expect(r.seriesId).toBe('uuid-1'); // determinism guard — a real uuid here means the spy failed
    expect(r).toMatchSnapshot('generateSeriesWeeks return');
    const writes = fake.committed.map(w => ({ op: w.op, table: w.table, values: w.values && Object.fromEntries(Object.entries(w.values).map(([k, v]) => [k, k === 'date' ? fake.dateOf(v) : v])) }));
    expect(writes).toMatchSnapshot('generateSeriesWeeks writes');
    expect(writes.map(w => `${w.op}:${w.table}`)).toEqual([
      'insert:session_series', 'update:sessions',
      ...Array(4).fill(['insert:sessions', 'insert:bookable_sessions', 'insert:session_costs']).flat(),
    ]);
  });

  it('9b. the per-week body lives in insertSeriesWeeks and exists exactly once', () => {
    const src = stripComments(read('server/sessionSeries.ts'));
    expect(src).toMatch(/export async function insertSeriesWeeks\(/);
    const gen = src.slice(src.indexOf('export async function generateSeriesWeeks'), src.indexOf('export async function insertSeriesWeeks'));
    expect(gen).toMatch(/insertSeriesWeeks\(tx, seriesId, dates, input\)/);
    expect((src.match(/isSandbox:\s*false/g) ?? []).length).toBe(1);
  });
});

describe('11–12. list query + route pins', () => {
  it('11. listSeries computes ends_date from rows and stopped_date as the Dubai day; includeStopped still gates', () => {
    const src = stripComments(read('server/sessionSeries.ts'));
    expect(src).toContain("to_char(max(s.date), 'YYYY-MM-DD')");
    expect(src).toContain('AS ends_date');
    expect(src).toContain("AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dubai'");
    expect(src).toContain('AS stopped_date');
    expect(src).toMatch(/includeStopped \? sql`TRUE` : sql`ss\.stopped_at IS NULL`/);
    expect(src).toMatch(/endsDate: r\.ends_date/);
    expect(src).toMatch(/stoppedDate: r\.stopped_date/);
  });

  it('12. the extend route is admin-only on the series path, with the agreed 409 and 400 messages', () => {
    const src = read('server/routes.ts');
    expect(src).toMatch(/app\.post\("\/api\/sessions\/series\/:id\/extend", requireAuth, requireAdmin,/);
    expect(src).toContain('"This series is stopped. Start a new series instead."');
    expect(src).toContain('weeks must be a whole number between 1 and 8');
    expect(src).toMatch(/import \{[^}]*extendSeries[^}]*\} from "\.\/sessionSeries"/);
    expect(src).toMatch(/EXTEND_WEEKS_MIN/);
  });
});
