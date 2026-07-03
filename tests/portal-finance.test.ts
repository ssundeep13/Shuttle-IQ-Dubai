import { describe, it, expect } from 'vitest';
import { isoWeekOf } from '../shared/isoWeek';
import {
  aggregateMonthlyPnl,
  aggregateWeeklyPnl,
  aggregateRunnerPay,
  type SessionFinanceRow,
} from '../server/portalFinance';

// Pure aggregation tests — the DB assembly is exercised by the live June trace; here we
// pin the bucketing rules and the 25% zero-floor-PER-SESSION pay behaviour.

const row = (over: Partial<SessionFinanceRow>): SessionFinanceRow => ({
  sessionId: 's',
  dateIso: '2026-06-02',
  venue: 'Bright Riders',
  captainId: 'shannon-id',
  captainName: 'Shannon',
  revenueFils: 0,
  courtCostFils: 0,
  shuttleCostFils: 0,
  waterCostFils: 0,
  profitFils: 0,
  ...over,
});

describe('isoWeekOf — ISO-8601 weeks (Mon–Sun)', () => {
  it('June 2026: Mon Jun 1 opens 2026-W23; Tue/Thu/Sat cluster in one week; Sun closes it', () => {
    expect(isoWeekOf('2026-06-01')).toMatchObject({ label: '2026-W23', weekStart: '2026-06-01', weekEnd: '2026-06-07' });
    expect(isoWeekOf('2026-06-02').label).toBe('2026-W23'); // Tue
    expect(isoWeekOf('2026-06-04').label).toBe('2026-W23'); // Thu
    expect(isoWeekOf('2026-06-06').label).toBe('2026-W23'); // Sat
    expect(isoWeekOf('2026-06-07').label).toBe('2026-W23'); // Sun still same week
    expect(isoWeekOf('2026-06-08').label).toBe('2026-W24'); // next Monday rolls over
  });

  it('year boundaries: late-Dec days can be next isoYear; early-Jan can be previous', () => {
    // Jan 1 2026 is a Thursday → its week IS 2026-W01, starting Mon 2025-12-29...
    expect(isoWeekOf('2026-01-01')).toMatchObject({ isoYear: 2026, isoWeek: 1, weekStart: '2025-12-29' });
    // ...so Mon 2025-12-29 (calendar year 2025!) already belongs to 2026-W01.
    expect(isoWeekOf('2025-12-29')).toMatchObject({ isoYear: 2026, isoWeek: 1 });
    // Jan 1 2027 is a Friday → still in 2026's final week (W53).
    expect(isoWeekOf('2027-01-01')).toMatchObject({ isoYear: 2026, isoWeek: 53 });
  });
});

describe('aggregateMonthlyPnl — June 2026 onwards, formula not floored', () => {
  it('emits every month from the epoch through throughMonth, zeros included, net = rev − costs − expenses', () => {
    const rows = [
      row({ sessionId: 'a', dateIso: '2026-06-13', revenueFils: 166_600, courtCostFils: 60_000, shuttleCostFils: 21_000, waterCostFils: 3_600, profitFils: 82_000 }),
      row({ sessionId: 'b', dateIso: '2026-08-01', revenueFils: 10_000 }), // future month inside range
    ];
    const expensesRows = [{ dateIso: '2026-07-15', amountFils: 50_000 }]; // July general expense
    const months = aggregateMonthlyPnl(rows, expensesRows, '2026-08');

    expect(months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    const june = months[0];
    expect(june.collectedRevenueFils).toBe(166_600);
    expect(june.sessionCostsFils).toBe(84_600);
    expect(june.generalExpensesFils).toBe(0);
    expect(june.netProfitFils).toBe(82_000);
    // July: no sessions, one general expense → NEGATIVE net (monthly net is not floored)
    expect(months[1]).toMatchObject({ collectedRevenueFils: 0, generalExpensesFils: 50_000, netProfitFils: -50_000 });
    expect(months[2].collectedRevenueFils).toBe(10_000);
  });
});

describe('aggregateWeeklyPnl — ISO buckets, sessions + expenses combine', () => {
  it('a session and an expense in the same ISO week land in one row', () => {
    const weeks = aggregateWeeklyPnl(
      [row({ dateIso: '2026-06-02', revenueFils: 100_000, courtCostFils: 30_000 })],
      [{ dateIso: '2026-06-05', amountFils: 10_000 }],
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      label: '2026-W23',
      collectedRevenueFils: 100_000,
      sessionCostsFils: 30_000,
      generalExpensesFils: 10_000,
      netProfitFils: 60_000,
    });
  });
});

describe('aggregateRunnerPay — 25% per session, zero-floor per session, Unassigned visible', () => {
  it('applies the 25% share PER SESSION (rounding per session, not on the weekly sum)', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', profitFils: 333 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', profitFils: 333 }),
    ]);
    const shannon = weeks[0].runners[0];
    // per-session: round(333×0.25)=83 each → 166. Sum-then-share would give round(666×0.25)=167.
    expect(shannon.sessions.map((s) => s.payFils)).toEqual([83, 83]);
    expect(shannon.totalPayFils).toBe(166);
  });

  it('a zero-profit (floored) session contributes 0 — it never drags the weekly total negative', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', profitFils: 40_000 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', profitFils: 0 }), // loss-maker, floored upstream
    ]);
    expect(weeks[0].runners[0].totalPayFils).toBe(10_000); // 25% of 40,000 only
    expect(weeks[0].runners[0].sessions).toHaveLength(2);  // but the session is still listed
  });

  it('captainId null lands in an Unassigned bucket, listed after named runners', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', profitFils: 10_000 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', captainId: null, captainName: null, profitFils: 20_000 }),
    ]);
    expect(weeks[0].runners.map((r) => r.runnerName)).toEqual(['Shannon', 'Unassigned']);
    expect(weeks[0].runners[1].totalPayFils).toBe(5_000);
  });

  it('weeks split on ISO boundaries, most recent first', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-07', profitFils: 1_000 }), // Sun, W23
      row({ sessionId: 'b', dateIso: '2026-06-08', profitFils: 2_000 }), // Mon, W24
    ]);
    expect(weeks.map((w) => w.label)).toEqual(['2026-W24', '2026-W23']);
  });
});
