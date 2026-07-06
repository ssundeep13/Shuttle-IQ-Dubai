import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Gate 5 — captain court controls. findLineupConflicts is THE eligibility
// definition shared by the pin route, the edit route, and (owner ruling) the
// unified flip-time re-validation: stale lineups dismiss and rebuild, never
// promote — identically for auto and captain rows.

const ctx = (over: Partial<{ queue: string[]; sitting: string[]; other: string[] }> = {}) => ({
  queueSet: new Set(over.queue ?? ['a', 'b', 'c', 'd', 'e']),
  sittingOutSet: new Set(over.sitting ?? []),
  onOtherOpenSet: new Set(over.other ?? []),
});

describe('findLineupConflicts — the edit/pin/flip conflict matrix', () => {
  it('all four eligible → no conflicts', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    expect(findLineupConflicts(['a', 'b', 'c', 'd'], ctx())).toEqual([]);
  });

  it('player who left the queue → not-in-queue', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    expect(findLineupConflicts(['a', 'b', 'c', 'x'], ctx())).toEqual([
      { playerId: 'x', reason: 'not-in-queue' },
    ]);
  });

  it('sitting-out player → sitting-out (queue membership alone is not enough)', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    expect(findLineupConflicts(['a', 'b', 'c', 'd'], ctx({ sitting: ['d'] }))).toEqual([
      { playerId: 'd', reason: 'sitting-out' },
    ]);
  });

  it('player on another open lineup (incl. currently PLAYING) → on-another-lineup', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    expect(findLineupConflicts(['a', 'b', 'c', 'd'], ctx({ other: ['b'] }))).toEqual([
      { playerId: 'b', reason: 'on-another-lineup' },
    ]);
  });

  it('multiple conflicts reported per-player, most specific reason first', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    const out = findLineupConflicts(
      ['a', 'x', 'c', 'd'],
      ctx({ sitting: ['c'], other: ['d'] }),
    );
    expect(out).toEqual([
      { playerId: 'x', reason: 'not-in-queue' },
      { playerId: 'c', reason: 'sitting-out' },
      { playerId: 'd', reason: 'on-another-lineup' },
    ]);
  });

  it('a player off the queue who is ALSO sitting out reports not-in-queue (one reason each)', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    expect(findLineupConflicts(['x'], ctx({ sitting: ['x'] }))).toEqual([
      { playerId: 'x', reason: 'not-in-queue' },
    ]);
  });
});

describe('orchestrator captain-skip (courts with ANY queued row are never built for)', () => {
  it('a court holding a queued lineup — captain-pinned or auto — is excluded', async () => {
    const { selectCourtsNeedingQueued } = await import('../server/auto-matchmaking');
    const courts = [
      { id: 'c1', status: 'occupied' }, // captain pin lives here
      { id: 'c2', status: 'occupied' }, // auto queued row lives here
      { id: 'c3', status: 'occupied' }, // bare — the only build target
      { id: 'c4', status: 'available' },
    ];
    // courtsWithQueued is derived from status='queued' rows with NO source
    // filter — captain and auto rows protect their courts identically.
    const out = selectCourtsNeedingQueued(courts, new Set(['c1', 'c2']));
    expect(out.map(c => c.id)).toEqual(['c3']);
  });
});
