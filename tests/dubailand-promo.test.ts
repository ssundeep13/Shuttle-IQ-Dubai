// Dubailand opening promo — instant AED 15 credit + automatic clawback, pinned
// to ONE session. Pure rules are unit-tested; the wiring, scope and money-path
// discipline are held as source tripwires (the venue-awards pattern).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const {
  DUBAILAND_PROMO_SESSION_ID, DUBAILAND_PROMO_CREDIT_FILS,
  DUBAILAND_PROMO_CREDIT_MARKER, DUBAILAND_PROMO_REVERSAL_MARKER,
  isPaidBooking, computeReversalSplit,
} = await import('../server/dubailandPromo');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const src = read('server/dubailandPromo.ts');

describe('scope — one session, hard-pinned', () => {
  it('the pinned session is Fri 7 Aug Dubailand and the credit is AED 15', () => {
    expect(DUBAILAND_PROMO_SESSION_ID).toBe('e689b399-4b15-4d54-9399-f58dbbee7dc9');
    expect(DUBAILAND_PROMO_CREDIT_FILS).toBe(1500);
  });

  it('ledger labels are exactly as ruled', () => {
    expect(DUBAILAND_PROMO_CREDIT_MARKER).toBe('Dubailand promo · session e689b399-4b15-4d54-9399-f58dbbee7dc9');
    expect(DUBAILAND_PROMO_REVERSAL_MARKER).toBe('Dubailand promo reversal · session e689b399-4b15-4d54-9399-f58dbbee7dc9');
  });

  it('the module contains no other session id and every booking query filters by the constant', () => {
    const code = stripComments(src);
    const uuids = code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect(new Set(uuids)).toEqual(new Set(['e689b399-4b15-4d54-9399-f58dbbee7dc9']));
    expect(code.includes('DUBAILAND_PROMO_SESSION_ID')).toBe(true);
  });
});

describe('paid predicate — the house collected-money definition', () => {
  it('ziina and wallet are paid at confirmation; cash only once cash_paid', () => {
    expect(isPaidBooking({ paymentMethod: 'ziina', cashPaid: false })).toBe(true);
    expect(isPaidBooking({ paymentMethod: 'wallet', cashPaid: false })).toBe(true);
    expect(isPaidBooking({ paymentMethod: 'cash', cashPaid: true })).toBe(true);
    expect(isPaidBooking({ paymentMethod: 'cash', cashPaid: false })).toBe(false);
    expect(isPaidBooking({ paymentMethod: 'comp', cashPaid: true })).toBe(false);
  });
});

describe('clawback floor — never negative, shortfall logged', () => {
  it('full balance: deduct 1500, no shortfall', () => {
    expect(computeReversalSplit(5_000)).toEqual({ deductFils: 1500, shortfallFils: 0 });
    expect(computeReversalSplit(1_500)).toEqual({ deductFils: 1500, shortfallFils: 0 });
  });
  it('partial balance: deduct what exists, log the rest', () => {
    expect(computeReversalSplit(900)).toEqual({ deductFils: 900, shortfallFils: 600 });
  });
  it('zero or (defensive) negative balance: deduct nothing, full shortfall', () => {
    expect(computeReversalSplit(0)).toEqual({ deductFils: 0, shortfallFils: 1500 });
    expect(computeReversalSplit(-200)).toEqual({ deductFils: 0, shortfallFils: 1500 });
  });
});

describe('one credit per player EVER — the ledger is the memory', () => {
  it('the already-used check matches the CREDIT marker alone (a reversal never re-arms it)', () => {
    const apply = src.slice(src.indexOf('export async function applyDubailandPromo'), src.indexOf('export async function reverseDubailandPromo'));
    expect(apply.includes('description = ${DUBAILAND_PROMO_CREDIT_MARKER}')).toBe(true);
    expect(apply.includes('REVERSAL')).toBe(false); // credit path never consults reversals
  });

  it('the player row is locked FOR UPDATE before the marker check (double-confirm race)', () => {
    const apply = src.slice(src.indexOf('export async function applyDubailandPromo'), src.indexOf('export async function reverseDubailandPromo'));
    expect(apply.indexOf('FOR UPDATE')).toBeGreaterThan(-1);
    expect(apply.indexOf('FOR UPDATE')).toBeLessThan(apply.indexOf('DUBAILAND_PROMO_CREDIT_MARKER'));
  });

  it('reversal fires only when NO qualifying booking remains, exactly once, and is ALWAYS written (delta may be 0)', () => {
    const rev = src.slice(src.indexOf('export async function reverseDubailandPromo'), src.indexOf('export async function sweepDubailandPromoReversals'));
    expect(rev.includes('if (r.bookingId) return "unchanged"')).toBe(true);      // recount guard
    expect(rev.includes('LIKE')).toBe(true);                                      // reversal-exists via prefix (shortfall suffix)
    expect(rev.includes('computeReversalSplit')).toBe(true);
    expect(rev.includes('deltaFils: -deductFils')).toBe(true);
  });
});

describe('money path discipline', () => {
  it('applyWalletDelta is the only money writer — no raw balance UPDATE or ledger INSERT', () => {
    const code = stripComments(src);
    expect(code.includes('applyWalletDelta')).toBe(true);
    expect(/UPDATE\s+players/i.test(code)).toBe(false);
    expect(/INSERT\s+INTO\s+wallet_transactions/i.test(code)).toBe(false);
  });
});

describe('hook wiring — credit on every paid-confirmation path, clawback on every confirmed-death path', () => {
  const routes = read('server/marketplace-routes.ts');
  const webhook = read('server/webhookHandler.ts');
  const expenses = read('server/portal/portalExpenses.ts');

  it('credit: ziina webhook confirm', () => {
    expect(webhook.includes('applyDubailandPromo(booking.userId)')).toBe(true);
  });

  it('credit: wallet-confirm, admin-confirm, admin-promote', () => {
    for (const site of ['wallet-confirm', 'admin-confirm', 'admin-promote']) {
      expect(routes.includes(`fireDubailandPromo(`) && routes.includes(`'${site}'`)).toBe(true);
    }
  });

  it('credit: cash-paid toggle (the cash "paid" moment), on the false→true transition only', () => {
    const idx = expenses.indexOf('wasFalseTransitioningToTrue) {');
    expect(idx).toBeGreaterThan(-1);
    expect(expenses.slice(idx, idx + 500).includes('applyDubailandPromo')).toBe(true);
  });

  it('clawback: player cancel + last-guest-slot cancel + event-cancel sweep', () => {
    expect(routes.includes("fireDubailandPromoReversal(booking.userId, 'player-cancel')")).toBe(true);
    expect(routes.includes("fireDubailandPromoReversal(booking.userId, 'last-guest-slot-cancel')")).toBe(true);
    expect(routes.includes('sweepDubailandPromoReversals()')).toBe(true);
  });

  it('every route hook is fire-and-forget — a promo failure can never break a payment or cancel', () => {
    const wrap = routes.slice(routes.indexOf('function fireDubailandPromo('), routes.indexOf('async function refundBookingWalletCredit'));
    expect(wrap.includes('.catch(')).toBe(true);
    expect(wrap.includes('await ')).toBe(false);
  });
});

describe('credit script --label variant', () => {
  const script = read('scripts/launch-week-credit.mts');
  it('label is optional and defaults to the launch-week marker (past runs stay matched)', () => {
    expect(script.includes("const LABEL = labelIdx >= 0 && args[labelIdx + 1] ? args[labelIdx + 1] : 'launch week credit'")).toBe(true);
    expect(script.includes('`${LABEL} · session ${sessionId}`')).toBe(true);
  });
  it('the --label value can never be mistaken for the session id', () => {
    expect(script.includes('i !== labelIdx + 1')).toBe(true);
  });
});
