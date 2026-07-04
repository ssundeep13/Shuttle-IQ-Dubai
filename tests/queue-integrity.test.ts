import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Gate 2 — queue integrity. appendPlayersToQueue serializes writers with a per-session
// pg advisory lock, so the CONCURRENT behaviour equals sequential composition of the
// pure computeAppendedQueue. These tests pin that computation and its composition.

describe('computeAppendedQueue — the end-of-game re-append', () => {
  it('losers land before winners, after everyone still waiting', async () => {
    const { computeAppendedQueue } = await import('../server/storage');
    expect(computeAppendedQueue(['w1', 'w2'], ['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b']))
      .toEqual(['w1', 'w2', 'c', 'd', 'a', 'b']);
  });

  it('a played player somehow still in the queue is NEVER duplicated (the admin-path bug)', async () => {
    const { computeAppendedQueue } = await import('../server/storage');
    // 'a' was left in the queue while playing (historical race residue)
    const out = computeAppendedQueue(['w1', 'a', 'w2'], ['a', 'b'], ['b', 'a']);
    expect(out).toEqual(['w1', 'w2', 'b', 'a']);
    expect(out.filter((id) => id === 'a')).toHaveLength(1);
  });

  it('SERIALIZED double end-game (what the advisory lock guarantees): both games’ players land, nobody lost', async () => {
    const { computeAppendedQueue } = await import('../server/storage');
    const waiting = ['w1', 'w2', 'w3'];
    // Court 1 ends: players a-d; Court 2 ends right after: players e-h.
    const afterCourt1 = computeAppendedQueue(waiting, ['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b']);
    const afterCourt2 = computeAppendedQueue(afterCourt1, ['e', 'f', 'g', 'h'], ['g', 'h', 'e', 'f']);
    expect(afterCourt2).toEqual(['w1', 'w2', 'w3', 'c', 'd', 'a', 'b', 'g', 'h', 'e', 'f']);
    // the pre-fix failure mode: court 2's write clobbering court 1's four players
    for (const id of ['a', 'b', 'c', 'd']) expect(afterCourt2).toContain(id);
    expect(new Set(afterCourt2).size).toBe(afterCourt2.length); // no duplicates anywhere
  });

  it('reorder racing an end-game (serialized): the reorder is preserved, the game players still land', async () => {
    const { computeAppendedQueue } = await import('../server/storage');
    // Captain reorders to [w3, w1, w2] (setQueue, lock held) then end-game appends —
    // the append reads the FRESH post-reorder queue inside its own lock.
    const afterReorder = ['w3', 'w1', 'w2'];
    const after = computeAppendedQueue(afterReorder, ['a', 'b', 'c', 'd'], ['c', 'd', 'a', 'b']);
    expect(after).toEqual(['w3', 'w1', 'w2', 'c', 'd', 'a', 'b']);
  });

  it('empty queue: players simply become the queue', async () => {
    const { computeAppendedQueue } = await import('../server/storage');
    expect(computeAppendedQueue([], ['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});

// Double-join dedupe (addToQueue) is enforced at the SQL layer: a single
// INSERT…SELECT…WHERE NOT EXISTS under the session advisory lock, plus the
// uq_queue_entries_session_player unique index from the Gate 2 migration —
// the same double-tap can never create a second row. Not reachable from the
// unit harness; covered by the migration's index + a live double-tap check.
