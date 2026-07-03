import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Phase 6 — the extracted expense endpoints. The registration test drives the REAL
// register function against a recording fake app and asserts every single route
// carries BOTH portal guards (auth, then owner) — a runner can never reach any of it.

describe('registerPortalExpenseRoutes — every route is portal-auth + OWNER-ONLY', () => {
  it('all routes live under /api/portal/expenses and carry [auth, owner] in order', async () => {
    const { registerPortalExpenseRoutes } = await import('../server/portal/portalExpenses');
    const authGuard = () => {};
    const ownerGuard = () => {};
    const routes: Array<{ method: string; path: string; handlers: unknown[] }> = [];
    const record = (method: string) => (path: string, ...handlers: unknown[]) =>
      routes.push({ method, path, handlers });
    const fakeApp = { get: record('GET'), post: record('POST'), patch: record('PATCH'), delete: record('DELETE') } as any;

    registerPortalExpenseRoutes(fakeApp, authGuard as any, ownerGuard as any);

    expect(routes.length).toBe(10); // 4 category + 4 expense + pending list + cash-paid
    for (const r of routes) {
      expect(r.path.startsWith('/api/portal/expenses')).toBe(true);
      expect(r.handlers[0]).toBe(authGuard);   // portal auth first
      expect(r.handlers[1]).toBe(ownerGuard);  // owner wall second — runner 403s here
      expect(typeof r.handlers[2]).toBe('function'); // then the handler
    }
    const paths = routes.map((r) => `${r.method} ${r.path}`).sort();
    expect(paths).toEqual([
      'DELETE /api/portal/expenses/:id',
      'DELETE /api/portal/expenses/categories/:id',
      'GET /api/portal/expenses',
      'GET /api/portal/expenses/categories',
      'GET /api/portal/expenses/pending-payments',
      'PATCH /api/portal/expenses/:id',
      'PATCH /api/portal/expenses/categories/:id',
      'PATCH /api/portal/expenses/pending-payments/:id/cash-paid',
      'POST /api/portal/expenses',
      'POST /api/portal/expenses/categories',
    ]);
  });
});

describe('expense validation schemas — ported semantics intact', () => {
  it('amountAed must be a positive whole-AED integer; date must be a real date shape', async () => {
    const { expenseCreateSchema } = await import('../server/portal/portalExpenses');
    const base = { categoryId: 'c1', description: 'shuttles', date: '2026-07-03' };
    expect(expenseCreateSchema.safeParse({ ...base, amountAed: 70 }).success).toBe(true);
    expect(expenseCreateSchema.safeParse({ ...base, amountAed: 70.5 }).success).toBe(false); // fils don't belong here
    expect(expenseCreateSchema.safeParse({ ...base, amountAed: -5 }).success).toBe(false);
    expect(expenseCreateSchema.safeParse({ ...base, amountAed: 70, date: 'not-a-date' }).success).toBe(false);
    expect(expenseCreateSchema.safeParse({ ...base, amountAed: 70, paidBy: 'Nobody' }).success).toBe(false);
  });

  it('category colour must be a hex code', async () => {
    const { categoryCreateSchema } = await import('../server/portal/portalExpenses');
    expect(categoryCreateSchema.safeParse({ name: 'Ice packs', color: '#12AB34' }).success).toBe(true);
    expect(categoryCreateSchema.safeParse({ name: 'Ice packs', color: 'teal' }).success).toBe(false);
  });
});
