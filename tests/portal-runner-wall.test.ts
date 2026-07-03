import { describe, it, expect, vi } from 'vitest';
import { aggregateRunnerPay, filterRunnerPayWeeksForRunner, type SessionFinanceRow } from '../server/portalFinance';

// Build B — the server wall. The 403 middleware and the runner-pay response filter are
// the two pieces that keep a 'runner' login inside their own data; both are pinned here.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
// portalRoutes → storage → db.ts, which requires DATABASE_URL at import. A dummy is fine:
// pg pools connect lazily and requirePortalOwner never touches the DB.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const row = (over: Partial<SessionFinanceRow>): SessionFinanceRow => ({
  sessionId: 's', dateIso: '2026-06-02', venue: 'Bright Riders',
  captainId: 'shannon-id', captainName: 'Shannon',
  revenueFils: 0, courtCostFils: 0, shuttleCostFils: 0, waterCostFils: 0,
  profitFils: 0, walletPaidFils: 0, valueFils: 0, valueProfitFils: 0, unpaidCashFils: 0,
  ...over,
});

// 2-runner + unassigned fixture across two ISO weeks.
const FIXTURE = [
  row({ sessionId: 'a', dateIso: '2026-06-02', valueProfitFils: 40_000 }),                                    // Shannon W23
  row({ sessionId: 'b', dateIso: '2026-06-04', captainId: 'akhila-id', captainName: 'Akhila', valueProfitFils: 20_000 }), // Akhila W23
  row({ sessionId: 'c', dateIso: '2026-06-09', captainId: 'akhila-id', captainName: 'Akhila', valueProfitFils: 8_000 }),  // Akhila W24 (Shannon absent this week)
  row({ sessionId: 'd', dateIso: '2026-06-06', captainId: null, captainName: null, valueProfitFils: 99_999 }),            // Unassigned W23
];

describe('filterRunnerPayWeeksForRunner — the runner sees ONLY their own bucket', () => {
  it("Shannon's view: her buckets only; Akhila and Unassigned ABSENT from the whole body; empty weeks dropped", () => {
    const weeks = filterRunnerPayWeeksForRunner(aggregateRunnerPay(FIXTURE), 'shannon-id');
    expect(weeks).toHaveLength(1); // W24 (Akhila-only) disappears entirely
    expect(weeks[0].runners).toHaveLength(1);
    expect(weeks[0].runners[0].runnerName).toBe('Shannon');
    expect(weeks[0].runners[0].totalPayFils).toBe(10_000);
    // the strongest assertion: NOTHING about anyone else survives serialization
    const body = JSON.stringify(weeks);
    expect(body).not.toContain('Akhila');
    expect(body).not.toContain('akhila-id');
    expect(body).not.toContain('Unassigned');
    expect(body).not.toContain('unassigned');
  });

  it('owner path is unfiltered: both runners AND Unassigned present', () => {
    const weeks = aggregateRunnerPay(FIXTURE); // the route uses this as-is for role=owner
    const body = JSON.stringify(weeks);
    expect(body).toContain('Shannon');
    expect(body).toContain('Akhila');
    expect(body).toContain('Unassigned');
  });

  it('a runner login with NO runner_id sees nothing (never everything)', () => {
    expect(filterRunnerPayWeeksForRunner(aggregateRunnerPay(FIXTURE), null)).toEqual([]);
  });
});

describe('requirePortalOwner — 403 for runners on every owner endpoint', () => {
  const fakeRes = () => {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: unknown) => { res.body = b; return res; };
    return res;
  };

  it("role='runner' → 403, handler never runs (pnl/weekly/sessions/summary/reconcile all use this guard)", async () => {
    const { requirePortalOwner } = await import('../server/portalRoutes');
    const res = fakeRes();
    const next = vi.fn();
    requirePortalOwner({ portalUser: { portalUserId: 'p', email: 'e', role: 'runner', runnerId: 'shannon-id' } } as any, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("role='owner' → passes through unchanged", async () => {
    const { requirePortalOwner } = await import('../server/portalRoutes');
    const res = fakeRes();
    const next = vi.fn();
    requirePortalOwner({ portalUser: { portalUserId: 'p', email: 'e', role: 'owner', runnerId: null } } as any, res, next);
    expect(res.statusCode).toBe(0); // untouched
    expect(next).toHaveBeenCalledOnce();
  });

  it('missing portalUser (misuse without requirePortalAuth) → 403, fail closed', async () => {
    const { requirePortalOwner } = await import('../server/portalRoutes');
    const res = fakeRes();
    const next = vi.fn();
    requirePortalOwner({} as any, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
