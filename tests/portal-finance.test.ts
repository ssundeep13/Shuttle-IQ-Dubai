import { describe, it, expect } from 'vitest';
import { isoWeekOf } from '../shared/isoWeek';
import { computeRevenueBasesFils, type BookingForRevenueFils } from '../server/portal/sessionProfit';
import {
  aggregateMonthlyPnl,
  aggregateWeeklyPnl,
  aggregateRunnerPay,
  accruedSocialMediaPayFils,
  SOCIAL_MEDIA_PROFIT_SHARE,
  type SessionFinanceRow,
} from '../server/portal/portalFinance';
import { computeProfitFils } from '../server/portal/sessionProfit';

// Pure aggregation tests — the DB assembly is exercised by the live June trace; here we
// pin the bucketing rules, the two revenue bases, and the 25% zero-floor-PER-SESSION
// pay behaviour (VALUE basis since the Phase-3 follow-up rule change).

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
  walletPaidFils: 0,
  valueFils: 0,
  valueProfitFils: 0,
  unpaidCashFils: 0,
  ...over,
});

const booking = (over: Partial<BookingForRevenueFils>): BookingForRevenueFils => ({
  id: 'b1',
  amountAed: 49,
  paymentMethod: 'ziina',
  cashPaid: false,
  ...over,
});

describe('computeRevenueBasesFils — collected vs value bases from one classification', () => {
  it('wallet counts in VALUE but not in collected; ziina + paid cash count in both', () => {
    const bases = computeRevenueBasesFils([
      booking({ id: 'z', paymentMethod: 'ziina', amountAed: 49 }),
      booking({ id: 'c', paymentMethod: 'cash', cashPaid: true, amountAed: 49 }),
      booking({ id: 'w', paymentMethod: 'wallet', amountAed: 98 }),
    ], new Map());
    expect(bases.revenueFils).toBe(9_800);       // ziina + paid cash only
    expect(bases.walletPaidFils).toBe(9_800);
    expect(bases.valueFils).toBe(19_600);        // collected + wallet
    expect(bases.unpaidCashFils).toBe(0);
  });

  it('unpaid cash is in NEITHER basis, but is surfaced', () => {
    const bases = computeRevenueBasesFils([
      booking({ id: 'z', paymentMethod: 'ziina', amountAed: 49 }),
      booking({ id: 'u', paymentMethod: 'cash', cashPaid: false, amountAed: 98 }),
    ], new Map());
    expect(bases.revenueFils).toBe(4_900);
    expect(bases.valueFils).toBe(4_900);   // unpaid cash NOT added
    expect(bases.unpaidCashFils).toBe(9_800); // ...but visible
  });

  it('refund netting is identical on both bases: a collected refund nets both; a wallet refund nets value only', () => {
    const refunds = new Map([['z', 2_000], ['w', 1_000]]); // fils
    const bases = computeRevenueBasesFils([
      booking({ id: 'z', paymentMethod: 'ziina', amountAed: 49 }),
      booking({ id: 'w', paymentMethod: 'wallet', amountAed: 49 }),
    ], refunds);
    expect(bases.revenueFils).toBe(2_900);      // 4900 − 2000
    expect(bases.walletPaidFils).toBe(3_900);   // 4900 − 1000
    expect(bases.valueFils).toBe(6_800);        // both nettings flow into value
  });

  it('unknown payment methods stay excluded everywhere (unchanged behaviour)', () => {
    const bases = computeRevenueBasesFils([booking({ id: 'x', paymentMethod: 'comp' })], new Map());
    expect(bases).toEqual({ revenueFils: 0, walletPaidFils: 0, valueFils: 0, unpaidCashFils: 0 });
  });
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
      row({ sessionId: 'a', dateIso: '2026-06-13', revenueFils: 166_600, courtCostFils: 60_000, shuttleCostFils: 21_000, waterCostFils: 3_600, profitFils: 82_000, walletPaidFils: 19_600 }),
      row({ sessionId: 'b', dateIso: '2026-08-01', revenueFils: 10_000 }), // future month inside range
    ];
    const expensesRows = [{ dateIso: '2026-07-15', amountFils: 50_000 }]; // July general expense
    const months = aggregateMonthlyPnl(rows, expensesRows, '2026-08');

    expect(months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    const june = months[0];
    expect(june.collectedRevenueFils).toBe(166_600);
    expect(june.sessionCostsFils).toBe(84_600);
    expect(june.generalExpensesFils).toBe(0);
    expect(june.netProfitFils).toBe(82_000);       // wallet info does NOT change net
    expect(june.walletPaidFils).toBe(19_600);      // ...but is reported
    // July: no sessions, one general expense → NEGATIVE net (monthly net is not floored)
    expect(months[1]).toMatchObject({ collectedRevenueFils: 0, generalExpensesFils: 50_000, netProfitFils: -50_000 });
    expect(months[2].collectedRevenueFils).toBe(10_000);
  });

  it('runner-pay line: Σ assigned-runner accrued pay (Unassigned excluded); management = net − pay, may go negative', () => {
    const rows = [
      // assigned: accrues round(40,000 × 25%) = 10,000
      row({ sessionId: 'a', dateIso: '2026-06-13', revenueFils: 100_000, courtCostFils: 20_000, valueProfitFils: 40_000 }),
      // assigned: per-session rounding — round(333 × 25%) = 83 (not part of a summed base)
      row({ sessionId: 'b', dateIso: '2026-06-16', revenueFils: 10_000, valueProfitFils: 333 }),
      // UNASSIGNED: valueProfit 99,999 but captainId null → contributes ZERO to the line
      row({ sessionId: 'c', dateIso: '2026-06-20', captainId: null, captainName: null, revenueFils: 5_000, valueProfitFils: 99_999 }),
    ];
    const months = aggregateMonthlyPnl(rows, [], '2026-06');
    const june = months[0];
    expect(june.runnerPayFils).toBe(10_083); // 10,000 + 83; the 99,999-profit unassigned session pays nobody
    expect(june.netProfitFils).toBe(95_000); // (100k+10k+5k) − 20k — net formula itself unchanged
    expect(june.managementProfitFils).toBe(95_000 - 10_083);

    // management profit is NOT clamped: pay can exceed net (wallet is in the pay base, not in net)
    const negMonths = aggregateMonthlyPnl(
      [row({ sessionId: 'd', dateIso: '2026-06-02', revenueFils: 1_000, valueProfitFils: 40_000 })],
      [], '2026-06',
    );
    expect(negMonths[0].netProfitFils).toBe(1_000);
    expect(negMonths[0].runnerPayFils).toBe(10_000);
    expect(negMonths[0].managementProfitFils).toBe(-9_000); // negative, shown as-is
  });
});

describe('social media pay — 15% of COLLECTED profit per session, monthly only', () => {
  it('the share is 15% and is applied per session with per-session rounding', () => {
    expect(SOCIAL_MEDIA_PROFIT_SHARE).toBe(0.15);
    expect(accruedSocialMediaPayFils(82_000)).toBe(12_300);
    expect(accruedSocialMediaPayFils(333)).toBe(50); // round(49.95)
    expect(accruedSocialMediaPayFils(0)).toBe(0);
  });

  it('normal month: sums per-session accruals across the month', () => {
    const months = aggregateMonthlyPnl([
      row({ sessionId: 'a', dateIso: '2026-06-13', revenueFils: 100_000, courtCostFils: 20_000, profitFils: 80_000 }),
      row({ sessionId: 'b', dateIso: '2026-06-16', revenueFils: 50_000, courtCostFils: 10_000, profitFils: 40_000 }),
    ], [], '2026-06');
    expect(months[0].socialMediaPayFils).toBe(12_000 + 6_000);
    expect(months[0].managementProfitFils).toBe(months[0].netProfitFils - months[0].runnerPayFils - 18_000);
  });

  it('zero-revenue month: the line is zero, never negative', () => {
    const months = aggregateMonthlyPnl(
      [row({ sessionId: 'a', dateIso: '2026-06-13', revenueFils: 0, courtCostFils: 30_000, profitFils: 0 })],
      [{ dateIso: '2026-06-14', amountFils: 5_000 }], '2026-06',
    );
    expect(months[0].netProfitFils).toBe(-35_000);       // net itself may be negative...
    expect(months[0].socialMediaPayFils).toBe(0);        // ...the pay line never is
  });

  it('a losing session contributes ZERO while profitable sessions in the same month still pay', () => {
    // The floor lives upstream in computeProfitFils — build the loser through it so the
    // chain is pinned end-to-end, not just assumed.
    const loserProfit = computeProfitFils({ revenueFils: 1_000, courtCostFils: 50_000, shuttleCostFils: 0, waterCostFils: 0 });
    expect(loserProfit).toBe(0); // floored per session, upstream
    const months = aggregateMonthlyPnl([
      row({ sessionId: 'loss', dateIso: '2026-06-02', revenueFils: 1_000, courtCostFils: 50_000, profitFils: loserProfit }),
      row({ sessionId: 'win', dateIso: '2026-06-04', revenueFils: 40_000, courtCostFils: 20_000, profitFils: 20_000 }),
    ], [], '2026-06');
    expect(months[0].socialMediaPayFils).toBe(3_000); // 15% of the winner only
  });

  it('rounds PER SESSION, not on the monthly sum', () => {
    // Two sessions of 3 fils profit: per-session round(0.45)=0 twice → 0.
    // A monthly-sum basis would give round(6 × 0.15) = 1. Pin the difference.
    const months = aggregateMonthlyPnl([
      row({ sessionId: 'a', dateIso: '2026-06-02', profitFils: 3 }),
      row({ sessionId: 'b', dateIso: '2026-06-03', profitFils: 3 }),
    ], [], '2026-06');
    expect(months[0].socialMediaPayFils).toBe(0);
  });

  it('BASIS: reads profitFils (collected), NOT valueProfitFils — wallet revenue splits the two pay lines', () => {
    // 10,000 collected + 20,000 wallet, 5,000 costs:
    //   profitFils      = 5,000  → social  = 750
    //   valueProfitFils = 25,000 → runner  = 6,250
    const months = aggregateMonthlyPnl([row({
      sessionId: 'a', dateIso: '2026-06-13',
      revenueFils: 10_000, walletPaidFils: 20_000, valueFils: 30_000, courtCostFils: 5_000,
      profitFils: 5_000, valueProfitFils: 25_000,
    })], [], '2026-06');
    expect(months[0].socialMediaPayFils).toBe(750);
    expect(months[0].runnerPayFils).toBe(6_250);
    expect(months[0].socialMediaPayFils).not.toBe(months[0].runnerPayFils);
    expect(months[0].managementProfitFils).toBe(months[0].netProfitFils - 6_250 - 750);
  });

  it('UNLIKE runner pay, an unassigned session still accrues the social line', () => {
    const months = aggregateMonthlyPnl([
      row({ sessionId: 'a', dateIso: '2026-06-02', captainId: null, captainName: null, profitFils: 10_000, valueProfitFils: 10_000 }),
    ], [], '2026-06');
    expect(months[0].runnerPayFils).toBe(0);          // unassigned pays no runner
    expect(months[0].socialMediaPayFils).toBe(1_500); // ...but she is still paid
  });

  it('weekly view leaves the line at zero (deliberate, mirrors runner pay)', () => {
    const weeks = aggregateWeeklyPnl(
      [row({ dateIso: '2026-06-02', revenueFils: 100_000, courtCostFils: 30_000, profitFils: 70_000 })],
      [],
    );
    expect(weeks[0].socialMediaPayFils).toBe(0);
    expect(weeks[0].managementProfitFils).toBe(weeks[0].netProfitFils); // nothing subtracted weekly
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

describe('aggregateRunnerPay — 25% of VALUE profit per session, zero-floor per session, Unassigned visible', () => {
  it('pay reads the VALUE basis, not collected: wallet-heavy session pays on value profit', () => {
    const weeks = aggregateRunnerPay([
      row({
        sessionId: 'a', dateIso: '2026-06-30',
        revenueFils: 98_000, profitFils: 45_600,            // collected basis (ignored by pay)
        walletPaidFils: 19_600, valueFils: 117_600, valueProfitFils: 65_200,
      }),
    ]);
    const s = weeks[0].runners[0].sessions[0];
    expect(s.payFils).toBe(16_300); // 25% of VALUE profit 65,200 — not 25% of 45,600 (=11,400)
    expect(s.valueFils).toBe(117_600);
    expect(s.walletPaidFils).toBe(19_600);
  });

  it('applies the 25% share PER SESSION (rounding per session, not on the weekly sum)', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', valueProfitFils: 333 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', valueProfitFils: 333 }),
    ]);
    const shannon = weeks[0].runners[0];
    // per-session: round(333×0.25)=83 each → 166. Sum-then-share would give round(666×0.25)=167.
    expect(shannon.sessions.map((s) => s.payFils)).toEqual([83, 83]);
    expect(shannon.totalPayFils).toBe(166);
  });

  it('a zero-profit (floored) session contributes 0 — it never drags the weekly total negative', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', valueProfitFils: 40_000 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', valueProfitFils: 0 }), // loss-maker, floored upstream
    ]);
    expect(weeks[0].runners[0].totalPayFils).toBe(10_000); // 25% of 40,000 only
    expect(weeks[0].runners[0].sessions).toHaveLength(2);  // but the session is still listed
  });

  it('unpaid cash never enters the basis but is carried through for the flag', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', valueFils: 49_00 * 100, valueProfitFils: 10_000, unpaidCashFils: 9_800 }),
    ]);
    const s = weeks[0].runners[0].sessions[0];
    expect(s.unpaidCashFils).toBe(9_800); // visible to the UI flag
    expect(s.payFils).toBe(2_500);        // 25% of valueProfit only
  });

  it('captainId null lands in an Unassigned bucket, listed after named runners', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-02', valueProfitFils: 10_000 }),
      row({ sessionId: 'b', dateIso: '2026-06-04', captainId: null, captainName: null, valueProfitFils: 20_000 }),
    ]);
    expect(weeks[0].runners.map((r) => r.runnerName)).toEqual(['Shannon', 'Unassigned']);
    expect(weeks[0].runners[1].totalPayFils).toBe(5_000);
  });

  it('weeks split on ISO boundaries, most recent first', () => {
    const weeks = aggregateRunnerPay([
      row({ sessionId: 'a', dateIso: '2026-06-07', valueProfitFils: 1_000 }), // Sun, W23
      row({ sessionId: 'b', dateIso: '2026-06-08', valueProfitFils: 2_000 }), // Mon, W24
    ]);
    expect(weeks.map((w) => w.label)).toEqual(['2026-W24', '2026-W23']);
  });
});
