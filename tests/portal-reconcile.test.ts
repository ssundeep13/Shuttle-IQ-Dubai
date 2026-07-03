import { describe, it, expect } from 'vitest';
import {
  parseZiinaCsv,
  reconcileZiinaCsv,
  type DbPaymentRow,
  type ReconcileDbInput,
} from '../server/portalReconcile';

// Fixtures — the CSV shape mirrors the real Ziina export (STEP 0/1 findings).
const HEADER = 'Time,Transaction ID,Type,Currency,Amount,Amount Received,Fee,Message,Performed By,Customer,Customer Card Number';
const csvLine = (o: { time?: string; id: string; type?: string; cur?: string; amount: number; fee?: number; msg?: string; by?: string; customer?: string }) =>
  [o.time ?? '15/06/2026 12:00:00', o.id, o.type ?? 'Invoice', o.cur ?? 'AED', o.amount, o.amount - (o.fee ?? 0), o.fee ?? 0, o.msg ?? '', o.by ?? '', o.customer ?? 'Test Person', '**** **** **** 1234'].join(',');
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');

// CSV Time is parsed as-if Dubai (+4): '15/06/2026 12:00:00' → 08:00Z. Setting
// completedAt to the same instant makes the empirical offset 0 and STABLE.
const utcOf = (t: string) => {
  const [d, rest] = [t.slice(0, 10), t.slice(11)];
  const [dd, mm, yy] = d.split('/').map(Number);
  const [h, mi, s] = rest.split(':').map(Number);
  return new Date(Date.UTC(yy, mm - 1, dd, h - 4, mi, s));
};

const pay = (o: Partial<DbPaymentRow> & { intent: string }): DbPaymentRow => ({
  paymentId: 'p-' + o.intent,
  bookingId: 'bk-' + o.intent,
  payAed: 49,
  status: 'completed',
  completedAt: utcOf('15/06/2026 12:00:00'),
  createdAt: utcOf('15/06/2026 12:00:00'),
  ziinaRefundId: null,
  refundedAmountFils: null,
  refundStatus: null,
  refundedAt: null,
  bookingAmountAed: 49,
  walletAmountUsedFils: 0,
  bookingStatus: 'confirmed',
  sessionDate: '2026-06-16',
  userName: 'Some Player',
  ...o,
});
const dbInput = (payments: DbPaymentRow[]): ReconcileDbInput => ({ payments, bookingIntents: [] });

// Five matched anchor rows so the offset calibration always has enough pairs.
const anchors = ['a1', 'a2', 'a3', 'a4', 'a5'];
const anchorCsv = anchors.map((id, i) => csvLine({ id, amount: 49, time: `1${i}/06/2026 12:00:00` }));
const anchorPays = anchors.map((id, i) => pay({ intent: id, completedAt: utcOf(`1${i}/06/2026 12:00:00`), createdAt: utcOf(`1${i}/06/2026 12:00:00`) }));

describe('parseZiinaCsv — format guards', () => {
  it('parses quoted fields and masks customers to initials + card last-4', () => {
    const rows = parseZiinaCsv(csv('15/06/2026 12:00:00,x1,Invoice,AED,49,46.62,2.38,"Hello, world",,"Divya Raj",**** **** **** 0587'));
    expect(rows[0].message).toBe('Hello, world');
    expect(rows[0].customerMasked).toBe('D.R. ····0587'); // no raw PII survives parsing
    expect(rows[0].grossFils).toBe(4_900);
    expect(rows[0].feeFils).toBe(238);
  });
  it('rejects a CSV missing required columns', () => {
    expect(() => parseZiinaCsv('Foo,Bar\n1,2')).toThrow(/missing/i);
  });
  it('rejects non-AED rows', () => {
    expect(() => parseZiinaCsv(csv(csvLine({ id: 'x', cur: 'USD', amount: 49 })))).toThrow(/AED/);
  });
});

describe('reconcileZiinaCsv — matching + buckets', () => {
  it('aggregates multiple CSV charges per booking before the amount check (add-guest)', () => {
    const text = csv(
      ...anchorCsv,
      csvLine({ id: 'g1', amount: 49 }),
      csvLine({ id: 'g2', amount: 98 }),
    );
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'g1', bookingId: 'bk-guest', bookingAmountAed: 147 }),
      pay({ intent: 'g2', bookingId: 'bk-guest', bookingAmountAed: 147 }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.overCapture.count).toBe(0);
    expect(r.underCollection.count).toBe(0);
    // 5 anchors + 1 aggregated booking = 6 consistent BOOKINGS
    expect(r.matchedConsistent.count).toBe(6);
  });

  it('splits over-capture and under-collection as distinct flags', () => {
    const text = csv(
      ...anchorCsv,
      csvLine({ id: 'ov', amount: 98 }),  // booking says 49
      csvLine({ id: 'un', amount: 49 }),  // booking says 196
    );
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'ov', bookingAmountAed: 49 }),
      pay({ intent: 'un', bookingAmountAed: 196 }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.overCapture.count).toBe(1);
    expect(r.overCapture.totalAed).toBe(49);
    expect(r.underCollection.count).toBe(1);
    expect(r.underCollection.totalAed).toBe(147);
  });

  it('compares against amountAed − wallet, never payments.amount (partial-wallet hazard)', () => {
    const text = csv(...anchorCsv, csvLine({ id: 'w1', amount: 49 }));
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'w1', bookingAmountAed: 98, walletAmountUsedFils: 4_900, payAed: 98 }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.overCapture.count).toBe(0);
    expect(r.underCollection.count).toBe(0); // 49 CSV = 98 − 49 wallet ✓
  });

  it('phantom detection: in-window absent intents flag; after-cutoff never flags', () => {
    const text = csv(...anchorCsv); // window: Jun 10 → Jun 14 (offset 0)
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'ph1', completedAt: utcOf('12/06/2026 12:00:00'), sessionDate: '2026-06-13' }), // in-window, absent
      pay({ intent: 'late', completedAt: utcOf('14/06/2026 15:00:00'), sessionDate: '2026-07-04' }), // after csv_max
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.phantoms).not.toBeNull();
    expect(r.phantoms!.inWindow.count).toBe(1);
    expect(r.phantoms!.inWindow.totalAed).toBe(49);
    expect(r.phantoms!.afterCutoff.count).toBe(1);
    // advisory carries the phantom by session month + the 25% runner-pay delta
    expect(r.advisory).toEqual([{ month: '2026-06', phantomAed: 49, runnerPayDeltaAed: 12.25 }]);
  });

  it('UNSTABLE clock offset disables time-based logic instead of guessing', () => {
    // Same five anchors but completedAt drifts 0..4h → p10–p90 spread ≫ 15 min.
    const drifted = anchors.map((id, i) =>
      pay({ intent: id, completedAt: new Date(utcOf(`1${i}/06/2026 12:00:00`).getTime() - i * 3600e3) }));
    const r = reconcileZiinaCsv(csv(...anchorCsv), dbInput([
      ...drifted,
      pay({ intent: 'ph1', completedAt: utcOf('12/06/2026 12:00:00') }),
    ]));
    expect(r.meta.offset?.stable).toBe(false);
    expect(r.phantoms).toBeNull(); // no phantom bucket without a trustworthy clock
    expect(r.meta.warnings.join(' ')).toMatch(/UNSTABLE/);
  });

  it('no-app-record grouping: manual performer = off-app collections; tests classified', () => {
    const text = csv(
      ...anchorCsv,
      csvLine({ id: 'm1', amount: 49, by: 'Sandeep Surendra' }),
      csvLine({ id: 't1', amount: 49, msg: 'TestMALE1 - 5th Jun' }),
    );
    const r = reconcileZiinaCsv(text, dbInput(anchorPays));
    const labels = r.noAppRecord.map((g) => g.label);
    expect(labels).toContain('off-app collections (performed by Sandeep Surendra)');
    expect(labels).toContain('test bookings');
    expect(r.noAppRecord.every((g) => g.informational)).toBe(true);
  });

  it('withdrawals are excluded from matching and reported as a footnote', () => {
    const text = csv(...anchorCsv, csvLine({ id: 'wd', type: 'Withdrawal', amount: 5000 }));
    const r = reconcileZiinaCsv(text, dbInput(anchorPays));
    expect(r.meta.withdrawals).toEqual({ count: 1, totalAed: 5000 });
    expect(r.noAppRecord.flatMap((g) => g.rows)).toHaveLength(0); // never enters buckets
  });

  it('refund gap rows get a READ-ONLY candidate proposal from CSV refunds', () => {
    const text = csv(
      ...anchorCsv,
      csvLine({ id: 'rf1', type: 'Refund', amount: 98, time: '13/06/2026 09:00:00', by: 'Sandeep Surendra' }),
    );
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'gap1', payAed: 98, refundStatus: 'completed', refundedAmountFils: null, refundedAt: utcOf('13/06/2026 10:00:00') }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.refundLeg.gapProposals).toHaveLength(1);
    expect(r.refundLeg.gapProposals[0].candidate?.amountAed).toBe(98);
    expect(r.refundLeg.gapProposals[0].candidate?.deltaDays).toBeLessThan(0.2);
  });
});
