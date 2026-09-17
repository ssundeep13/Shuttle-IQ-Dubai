// IQ Pass Gate 3 — finance. Amendment 1: ONE shared classifier replaces the
// five "collected revenue" predicates (sessionProfit ×2, getPublicAnalytics ×3,
// getFinanceSummary ×2) and a test asserts every call site uses it; pack seats
// (payment_method 'iq_pass', amount = allocation) count as collected; the
// portal P&L gains an informational "IQ Pass sales" line by tier; reconcile
// understands pack intents and pack-seat guest charges.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyRevenue, isCollected, isUnpaidCash, isCardTender, isIqPassTender, COLLECTED_METHODS } from '../server/revenueClassifier';
import { computeRevenueBasesFils } from '../server/portal/sessionProfit';
import { aggregatePackRevenueByMonth, type PackRevenueRow } from '../server/portal/portalFinance';
import { reconcileZiinaCsv, expectedCardFilsForBooking, type DbPaymentRow, type ReconcileDbInput } from '../server/portal/portalReconcile';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const t = (paymentMethod: string, cashPaid = false) => ({ paymentMethod, cashPaid });

describe('classifyRevenue — the single collected-vs-value rule', () => {
  it('ziina, bank_transfer, iq_pass and PAID cash are collected; wallet is wallet; unpaid cash is unpaid_cash; anything else is excluded', () => {
    expect(COLLECTED_METHODS).toEqual(['ziina', 'bank_transfer', 'iq_pass']);
    expect(classifyRevenue(t('ziina'))).toBe('collected');
    expect(classifyRevenue(t('bank_transfer'))).toBe('collected');
    expect(classifyRevenue(t('iq_pass'))).toBe('collected');
    expect(classifyRevenue(t('cash', true))).toBe('collected');
    expect(classifyRevenue(t('cash', false))).toBe('unpaid_cash');
    expect(classifyRevenue(t('wallet'))).toBe('wallet');
    expect(classifyRevenue(t('comp'))).toBe('excluded');
    expect(classifyRevenue(t('birthday_free'))).toBe('excluded');
  });

  it('helpers: isCollected / isUnpaidCash / card (ziina + bank transfer only) / iq_pass', () => {
    expect(isCollected(t('iq_pass'))).toBe(true);
    expect(isCollected(t('cash'))).toBe(false);
    expect(isUnpaidCash(t('cash'))).toBe(true);
    expect(isUnpaidCash(t('cash', true))).toBe(false);
    expect(isCardTender(t('ziina'))).toBe(true);
    expect(isCardTender(t('bank_transfer'))).toBe(true);
    expect(isCardTender(t('iq_pass'))).toBe(false); // packs get their own public bucket
    expect(isIqPassTender(t('iq_pass'))).toBe(true);
    expect(isIqPassTender(t('ziina'))).toBe(false);
  });
});

describe('computeRevenueBasesFils through the classifier', () => {
  it('an iq_pass seat at the Club allocation is collected revenue (4,700 fils), refund-netted like any other', () => {
    const bases = computeRevenueBasesFils(
      [{ id: 's1', amountAed: 47, paymentMethod: 'iq_pass', cashPaid: false }, { id: 's2', amountAed: 96, paymentMethod: 'iq_pass', cashPaid: false }],
      new Map([['s2', 4_900]]), // the seat's extra guest was refunded
    );
    expect(bases).toEqual({ revenueFils: 4_700 + 4_700, walletPaidFils: 0, valueFils: 9_400, unpaidCashFils: 0, iqPassSeats: 2, iqPassFils: 4_700 + 9_600 /* no pack allocation on these rows → the seat amount, gross */ });
  });

  it('bank_transfer and unknown methods behave as before (collected / excluded)', () => {
    expect(computeRevenueBasesFils([{ id: 'x', amountAed: 49, paymentMethod: 'bank_transfer', cashPaid: false }], new Map()).revenueFils).toBe(4_900);
    expect(computeRevenueBasesFils([{ id: 'x', amountAed: 49, paymentMethod: 'comp', cashPaid: false }], new Map())).toEqual({ revenueFils: 0, walletPaidFils: 0, valueFils: 0, unpaidCashFils: 0, iqPassSeats: 0, iqPassFils: 0 });
  });
});

describe('every call site uses the classifier (amendment 1)', () => {
  const sp = read('server/portal/sessionProfit.ts');
  const st = read('server/storage.ts');
  // each method body: from its signature to the next `  async name(` in the class
  const method = (name: string) => { const a = st.indexOf(`async ${name}(`); const rest = st.slice(a + 10); const m = rest.match(/\n  async \w+\(/); return st.slice(a, a + 10 + (m ? m.index! : rest.length)); };
  const analytics = method('getPublicAnalytics');
  const finance = method('getFinanceSummary');
  const noComments = (s: string) => s.replace(/\/\/.*$/gm, '');

  it('sessionProfit.ts: classifier imported; the bucket switch and the refund lookup both go through it; no ziina literal remains', () => {
    expect(sp.includes("from '../revenueClassifier'") || sp.includes('from "../revenueClassifier"')).toBe(true);
    expect((sp.match(/classifyRevenue\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(noComments(sp)).not.toMatch(/'ziina'/);
    expect(noComments(sp)).not.toMatch(/'bank_transfer'/);
  });

  it('storage.ts getPublicAnalytics: per-session, monthly and totals use isCollected / isUnpaidCash; card = isCardTender; a separate iqPass bucket', () => {
    expect(st.includes('from "./revenueClassifier"') || st.includes("from './revenueClassifier'")).toBe(true);
    expect((analytics.match(/\bisCollected\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((analytics.match(/\bisUnpaidCash\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(analytics.includes('confirmed.filter(isCardTender)')).toBe(true);
    expect(analytics.includes('confirmed.filter(isIqPassTender)')).toBe(true);
    expect(analytics.includes('iqPass: {')).toBe(true);
    expect(noComments(analytics)).not.toMatch(/'ziina'/);
    expect(noComments(analytics)).not.toMatch(/'bank_transfer'/);
  });

  it('storage.ts getFinanceSummary: collected + pending cash + monthly through the classifier; no ziina literal', () => {
    expect((finance.match(/\bisCollected\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((finance.match(/\bisUnpaidCash\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(noComments(finance)).not.toMatch(/'ziina'/);
  });

  it('the public analytics type declares the iqPass bucket', () => {
    const typeBlock = st.slice(st.indexOf('byPaymentMethod: {'), st.indexOf('byPaymentMethod: {') + 400);
    expect(typeBlock.includes('iqPass: { bookings: number; spotsBooked: number; amountAed: number }')).toBe(true);
  });
});

describe('aggregatePackRevenueByMonth — informational "IQ Pass sales" line, by purchase month, by tier', () => {
  const rows: PackRevenueRow[] = [
    { paidDateIso: '2026-09-14', tier: 'club', priceFils: 18_800 },
    { paidDateIso: '2026-09-20', tier: 'club_plus', priceFils: 36_000 },
    { paidDateIso: '2026-10-02', tier: 'club_elite', priceFils: 51_600 },
    { paidDateIso: '2026-10-05', tier: 'mystery', priceFils: 1 }, // unknown tier still counts in the total, no tier column
  ];
  it('sums per month and per tier', () => {
    const m = aggregatePackRevenueByMonth(rows);
    expect(m['2026-09']).toEqual({ totalFils: 54_800, byTierFils: { club: 18_800, club_plus: 36_000, club_elite: 0 } });
    expect(m['2026-10']).toEqual({ totalFils: 51_601, byTierFils: { club: 0, club_plus: 0, club_elite: 51_600 } });
    expect(m['2026-08']).toBeUndefined();
  });
  it('empty input → empty map', () => {
    expect(aggregatePackRevenueByMonth([])).toEqual({});
  });
});

describe('portal wiring (tripwires)', () => {
  it('the pnl route emits iqPassRevenueAed + iqPassByTierAed from loadPackRevenueRows, on the same guarded route line', () => {
    const src = read('server/portal/portalRoutes.ts');
    const line = src.split('\n').find((l) => l.includes('"/api/portal/finance/pnl"'))!;
    expect(line.includes('requirePortalAuth')).toBe(true);
    expect(line.includes('requirePortalOwner')).toBe(true);
    const route = src.slice(src.indexOf('"/api/portal/finance/pnl"'), src.indexOf('"/api/portal/finance/weekly"'));
    expect(route.includes('loadPackRevenueRows(')).toBe(true);
    expect(route.includes('aggregatePackRevenueByMonth(')).toBe(true);
    expect(route.includes('iqPassRevenueAed:')).toBe(true);
    expect(route.includes('iqPassByTierAed:')).toBe(true);
  });

  it('loadPackRevenueRows reads paid packs only, attributed to the Dubai day of paid_at, from the portal epoch', () => {
    const pf = read('server/portal/portalFinance.ts');
    const fn = pf.slice(pf.indexOf('export async function loadPackRevenueRows'), pf.indexOf('export async function loadPackRevenueRows') + 1500);
    expect(fn.includes("IN ('active', 'completed')")).toBe(true);
    expect(fn.includes("at time zone 'Asia/Dubai'")).toBe(true);
    expect(fn.includes('PORTAL_EPOCH_ISO')).toBe(true);
  });

  it('the portal P&L page shows the info column and explains it', () => {
    const pages = read('client/portal/pages.tsx');
    expect(pages.includes('iqPassRevenueAed?: number;')).toBe(true);
    expect(pages.includes('IQ Pass (info)')).toBe(true); // header shortened so the ten P&L columns fit at 1280
    expect(pages).toMatch(/text-iqpass-tiers-/);           // the split by tier is a caption row, not a hover tooltip
    expect(pages).toMatch(/IQ Pass sales are informational/);
  });

  it('the admin bookings panel labels a pack seat "IQ Pass" instead of "Ziina"', () => {
    const sm = read('client/src/pages/SessionsManagement.tsx');
    const badge = sm.slice(sm.indexOf('data-testid={`badge-method-${booking.id}`}') - 200, sm.indexOf('data-testid={`badge-method-${booking.id}`}') + 400);
    expect(badge.includes('booking.packId')).toBe(true);
    expect(badge.includes('IQ Pass')).toBe(true);
  });
});

// ── Reconcile: pack intents + pack-seat guest charges ─────────────────────────
const HEADER = 'Time,Transaction ID,Type,Currency,Amount,Amount Received,Fee,Message,Performed By,Customer,Customer Card Number';
const csvLine = (o: { time?: string; id: string; amount: number; msg?: string }) =>
  [o.time ?? '15/06/2026 12:00:00', o.id, 'Invoice', 'AED', o.amount, o.amount, 0, o.msg ?? '', '', 'Test Person', '**** **** **** 1234'].join(',');
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');
const utcOf = (t: string) => { const [dd, mm, yy] = t.slice(0, 10).split('/').map(Number); const [h, mi, s] = t.slice(11).split(':').map(Number); return new Date(Date.UTC(yy, mm - 1, dd, h - 4, mi, s)); };
const pay = (o: Partial<DbPaymentRow> & { intent: string }): DbPaymentRow => ({
  paymentId: 'p-' + o.intent, bookingId: 'bk-' + o.intent, payAed: 49, status: 'completed',
  completedAt: utcOf('15/06/2026 12:00:00'), createdAt: utcOf('15/06/2026 12:00:00'),
  ziinaRefundId: null, refundedAmountFils: null, refundStatus: null, refundedAt: null,
  bookingAmountAed: 49, walletAmountUsedFils: 0, bookingStatus: 'confirmed', sessionDate: '2026-06-16', userName: 'Some Player', ...o,
});
const anchors = ['a1', 'a2', 'a3', 'a4', 'a5'];
const anchorCsv = anchors.map((id, i) => csvLine({ id, amount: 49, time: `1${i}/06/2026 12:00:00` }));
const anchorPays = anchors.map((id, i) => pay({ intent: id, completedAt: utcOf(`1${i}/06/2026 12:00:00`), createdAt: utcOf(`1${i}/06/2026 12:00:00`) }));
const dbInput = (payments: DbPaymentRow[]): ReconcileDbInput => ({ payments, bookingIntents: [] });

describe('expectedCardFilsForBooking', () => {
  it('drop-in: amount − wallet; pack seat: (amount − allocation) − wallet, so a AED 49 guest on a Club seat expects 4,900', () => {
    expect(expectedCardFilsForBooking({ bookingAmountAed: 49, walletAmountUsedFils: 0 })).toBe(4_900);
    expect(expectedCardFilsForBooking({ bookingAmountAed: 98, walletAmountUsedFils: 4_900 })).toBe(4_900);
    expect(expectedCardFilsForBooking({ bookingAmountAed: 96, walletAmountUsedFils: 0, seatPackTier: 'club' })).toBe(4_900);
    expect(expectedCardFilsForBooking({ bookingAmountAed: 94, walletAmountUsedFils: 0, seatPackTier: 'club_plus' })).toBe(4_900);
    expect(expectedCardFilsForBooking({ bookingAmountAed: 47, walletAmountUsedFils: 0, seatPackTier: 'club' })).toBe(0);
  });
});

describe('reconcileZiinaCsv — packs', () => {
  it('a pack payment (no booking_id, pack_id set) is matched against the pack price and lands in consistent', () => {
    const text = csv(...anchorCsv, csvLine({ id: 'pk-int', amount: 188, msg: 'ShuttleIQ IQ Pass · Club' }));
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'pk-int', bookingId: null, packId: 'pack-1', packPriceAed: 188, payAed: 188, bookingAmountAed: null, sessionDate: null, userName: 'Pack Buyer' }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.matchedConsistent.count).toBe(6);
    expect(r.overCapture.count).toBe(0);
    expect(r.underCollection.count).toBe(0);
    expect(r.noAppRecord.reduce((s, g) => s + g.count, 0)).toBe(0);
    expect(r.matchedConsistent.rows.some((x) => /IQ Pass/.test(x.detail))).toBe(true);
  });

  it('a pack seat that later added a AED 49 guest reconciles the guest charge against amount − allocation', () => {
    const text = csv(...anchorCsv, csvLine({ id: 'gs', amount: 49 }));
    const db = dbInput([
      ...anchorPays,
      pay({ intent: 'gs', bookingId: 'bk-seat', bookingAmountAed: 96, walletAmountUsedFils: 0, seatPackTier: 'club' }),
    ]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.underCollection.count).toBe(0);
    expect(r.overCapture.count).toBe(0);
    expect(r.matchedConsistent.count).toBe(6);
  });

  it('a short-paid pack still flags under-collection (expected = pack price)', () => {
    const text = csv(...anchorCsv, csvLine({ id: 'pk-short', amount: 100 }));
    const db = dbInput([...anchorPays, pay({ intent: 'pk-short', bookingId: null, packId: 'pack-2', packPriceAed: 188, payAed: 100, bookingAmountAed: null })]);
    const r = reconcileZiinaCsv(text, db);
    expect(r.underCollection.count).toBe(1);
    expect(r.underCollection.totalAed).toBe(88);
  });

  it('loadReconcileInput joins packs for both the pack payment and the seat (tripwire)', () => {
    const src = read('server/portal/portalReconcile.ts');
    const fn = src.slice(src.indexOf('export async function loadReconcileInput'), src.indexOf('// ── Result shape'));
    expect(fn.includes('LEFT JOIN packs pk ON pk.id = p.pack_id')).toBe(true);
    expect(fn.includes('LEFT JOIN packs spk ON spk.id = b.pack_id')).toBe(true);
    expect(fn.includes('packId: r.pack_id')).toBe(true);
    expect(fn.includes('seatPackTier: r.seat_pack_tier')).toBe(true);
  });
});
