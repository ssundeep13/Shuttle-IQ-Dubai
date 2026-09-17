// Finance portal — IQ Pass per session (Sessions tab card). The revenue bases seam
// also counts the pass seats and their per-seat allocation so the Sessions tab can
// show, per session, how many seats a pass paid for and the AED that landed in
// Collected for them (which is why runner pay includes them). Same status filter,
// same refund netting as Collected — the figures reconcile by construction.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeRevenueBasesFils, seatAllocationAed } from '../server/portal/sessionProfit';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const b = (id: string, amountAed: number, paymentMethod: string, cashPaid = false, packAllocationAed?: number) =>
  ({ id, amountAed, paymentMethod, cashPaid, ...(packAllocationAed !== undefined ? { packAllocationAed } : {}) });

describe('computeRevenueBasesFils — IQ Pass seats and their allocation per session', () => {
  it('counts the iq_pass seats and sums the TIER allocation per seat, gross — a guest on the seat inflates amountAed and a guest refund nets collected, never the allocation', () => {
    const bases = computeRevenueBasesFils(
      // s2 is a Club seat (allocation 47) carrying a AED 49 guest: amountAed 96, and that guest was refunded (4,900 fils)
      [b('s1', 47, 'iq_pass', false, 47), b('s2', 96, 'iq_pass', false, 47), b('d1', 49, 'ziina'), b('w1', 49, 'wallet'), b('c1', 49, 'cash', false)],
      new Map([['s2', 4_900]]),
    );
    expect(bases.iqPassSeats).toBe(2);
    expect(bases.iqPassFils).toBe(4_700 + 4_700);
    expect(bases.revenueFils).toBe(4_700 + (9_600 - 4_900) + 4_900); // pass seats are inside collected — nothing double counts
  });

  it('a legacy iq_pass row with no pack allocation falls back to its own amount', () => {
    expect(computeRevenueBasesFils([b('s9', 47, 'iq_pass')], new Map()).iqPassFils).toBe(4_700);
  });

  it('seatAllocationAed: the tier table first (allocation × games === price), price ÷ games for an unknown tier, nothing without a pack', () => {
    expect(seatAllocationAed('club', 188, 4)).toBe(47);
    expect(seatAllocationAed('club_plus', 360, 8)).toBe(45);
    expect(seatAllocationAed('club_elite', 516, 12)).toBe(43);
    expect(seatAllocationAed('mystery', 200, 5)).toBe(40);
    expect(seatAllocationAed(null, null, null)).toBeUndefined();
  });

  it('a session with no pass seats reports zero seats and zero allocation', () => {
    const bases = computeRevenueBasesFils([b('d1', 49, 'ziina'), b('c1', 49, 'cash', true)], new Map());
    expect(bases.iqPassSeats).toBe(0);
    expect(bases.iqPassFils).toBe(0);
  });

  it('no bookings at all → zeros (the batch default entry shape)', () => {
    expect(computeRevenueBasesFils([], new Map())).toEqual({
      revenueFils: 0, walletPaidFils: 0, valueFils: 0, unpaidCashFils: 0, iqPassSeats: 0, iqPassFils: 0,
    });
  });
});

describe('the figures reach the Sessions endpoint, owner-only', () => {
  const sp = read('server/portal/sessionProfit.ts');
  const pf = read('server/portal/portalFinance.ts');
  const pr = read('server/portal/portalRoutes.ts');

  it('the batch joins the pack for the tier allocation and carries iqPassSeats / iqPassFils per session (zero default included)', () => {
    expect(sp).toMatch(/\.leftJoin\(packs, eq\(packs\.id, bookings\.packId\)\)/);
    expect(sp).toMatch(/packAllocationAed: seatAllocationAed\(/);
    expect(sp).toMatch(/iqPassSeats: 0, iqPassFils: 0/);
    expect(sp).toMatch(/iqPassSeats: bases\.iqPassSeats/);
    expect(sp).toMatch(/iqPassFils: bases\.iqPassFils/);
  });

  it('SessionFinanceRow carries both and loadSessionFinanceRows copies them from the batch', () => {
    expect(pf).toMatch(/iqPassSeats: number;/);
    expect(pf).toMatch(/iqPassFils: number;/);
    expect(pf).toMatch(/iqPassSeats: p\.iqPassSeats/);
    expect(pf).toMatch(/iqPassFils: p\.iqPassFils/);
  });

  it('GET /api/portal/finance/sessions returns iqPassSeats + iqPassAed per session and stays behind requirePortalOwner', () => {
    const start = pr.indexOf('app.get("/api/portal/finance/sessions"');
    expect(start).toBeGreaterThan(-1);
    const handler = pr.slice(start, pr.indexOf('app.get(', start + 10));
    expect(pr.slice(start, start + 120)).toMatch(/requirePortalAuth, requirePortalOwner/);
    expect(handler).toMatch(/iqPassSeats: r\.iqPassSeats/);
    expect(handler).toMatch(/iqPassAed: filsToAed\(r\.iqPassFils\)/);
  });
});
