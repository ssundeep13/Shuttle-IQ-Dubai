import { describe, it, expect } from 'vitest';

// Gate 1 — the queued orchestrator's court selection. The original filter checked
// courts.status === 'playing', a value courts never take ('available'|'occupied' per
// shared/schema.ts), so the "Up Next" pre-build never fired in production. These tests
// pin the corrected semantics.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const court = (id: string, status: string) => ({ id, status });

describe('selectCourtsNeedingQueued — Gate 1 court selection', () => {
  it('selects OCCUPIED courts (the real mid-game status) — the bug made this set always empty', async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    const picked = selectCourtsNeedingQueued(
      [court('c1', 'occupied'), court('c2', 'available'), court('c3', 'occupied')],
      new Set(),
    );
    expect(picked.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it("never selects 'available' courts (they get regular pending suggestions, not queued)", async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    expect(selectCourtsNeedingQueued([court('c1', 'available')], new Set())).toEqual([]);
  });

  it("the legacy 'playing' value (which courts never hold) does not match either", async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    expect(selectCourtsNeedingQueued([court('c1', 'playing')], new Set())).toEqual([]);
  });

  it('per-court dedupe: a court that already has a queued suggestion is skipped', async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    const picked = selectCourtsNeedingQueued(
      [court('c1', 'occupied'), court('c2', 'occupied')],
      new Set(['c1']),
    );
    expect(picked.map((c) => c.id)).toEqual(['c2']);
  });

  it('empty selection when every occupied court already has a queued lineup', async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    expect(selectCourtsNeedingQueued(
      [court('c1', 'occupied')],
      new Set(['c1']),
    )).toEqual([]);
  });
});
