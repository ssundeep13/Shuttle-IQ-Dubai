import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Gate 4 — Rotation Planner. Inverted selection: waiters strictly first
// (gamesWaited desc, queue position), remaining slots to the court's own
// most-rested current players (fewest games this session, oldest last game
// end — from the participants join), arrangement by the existing balance
// machinery. Plus the flip-ordering tripwire that keeps same-court repeats
// safe at promotion time.

type AnyPlayer = any;
const mkPlayer = (id: string, level = 'lower_intermediate', skillScore = 80): AnyPlayer =>
  ({ id, name: `P ${id}`, level, skillScore });

const waiter = (id: string, gamesWaited: number, queueIndex: number, level = 'lower_intermediate', score = 80) => ({
  player: mkPlayer(id, level, score), kind: 'waiter' as const,
  gamesWaited, queueIndex, gamesThisSession: 0, lastGameEndedAt: null,
});
const current = (id: string, gamesThisSession: number, lastEnd: Date | null, level = 'lower_intermediate', score = 80) => ({
  player: mkPlayer(id, level, score), kind: 'current' as const,
  gamesWaited: 0, queueIndex: Number.MAX_SAFE_INTEGER, gamesThisSession, lastGameEndedAt: lastEnd,
});
const ids = (seat: Array<{ player: AnyPlayer }>) => seat.map(c => c.player.id);

describe('orderRotationCandidates — waiters strictly before currents', () => {
  it('every waiter precedes every current player, regardless of counters', async () => {
    const { orderRotationCandidates } = await import('../server/rotation-planner');
    const ordered = orderRotationCandidates(
      [waiter('w1', 0, 5)], // barely-waiting waiter
      [current('c1', 0, null)], // never-played current (most rested possible)
    );
    expect(ordered.map(c => c.kind)).toEqual(['waiter', 'current']);
  });

  it('waiter tiebreak: gamesWaited desc, then queue position asc', async () => {
    const { orderRotationCandidates } = await import('../server/rotation-planner');
    const ordered = orderRotationCandidates(
      [waiter('a', 1, 0), waiter('b', 3, 7), waiter('c', 3, 2), waiter('d', 0, 1)],
      [],
    );
    expect(ids(ordered)).toEqual(['c', 'b', 'a', 'd']); // 3-waited ties break on position 2 < 7
  });

  it('current tiebreak: fewest games this session, then oldest last game end', async () => {
    const { orderRotationCandidates } = await import('../server/rotation-planner');
    const t1 = new Date('2026-07-07T10:00:00Z');
    const t2 = new Date('2026-07-07T11:00:00Z');
    const ordered = orderRotationCandidates(
      [],
      [current('x', 2, t2), current('y', 1, t2), current('z', 2, t1)],
    );
    expect(ids(ordered)).toEqual(['y', 'z', 'x']); // fewest games first; 2-game tie → older end first
  });
});

describe('buildRotationSeatings — the waiters-first invariant', () => {
  it('waiters >= 4: every option is all-waiters and option #1 is the strict rotation pick', async () => {
    const { orderRotationCandidates, buildRotationSeatings } = await import('../server/rotation-planner');
    const ordered = orderRotationCandidates(
      [waiter('w1', 5, 0), waiter('w2', 4, 1), waiter('w3', 3, 2), waiter('w4', 2, 3), waiter('w5', 1, 4)],
      [current('c1', 0, null), current('c2', 0, null)],
    );
    const seatings = buildRotationSeatings(ordered, 6);
    expect(seatings.length).toBeGreaterThan(0);
    for (const seat of seatings) {
      expect(seat.every(c => c.kind === 'waiter')).toBe(true); // no current player while a waiter stands
    }
    expect(ids(seatings[0])).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('waiters < 4: EVERY option contains ALL waiters; fills follow rotation order', async () => {
    const { orderRotationCandidates, buildRotationSeatings } = await import('../server/rotation-planner');
    const t = (h: number) => new Date(`2026-07-07T0${h}:00:00Z`);
    const ordered = orderRotationCandidates(
      [waiter('w1', 2, 0), waiter('w2', 1, 1)],
      [current('c1', 1, t(1)), current('c2', 2, t(2)), current('c3', 3, t(3))],
    );
    const seatings = buildRotationSeatings(ordered, 6);
    expect(seatings.length).toBe(3); // C(3,2) fills
    for (const seat of seatings) {
      expect(ids(seat)).toContain('w1');
      expect(ids(seat)).toContain('w2');
    }
    // primary fill = the two most-rested currents
    expect(ids(seatings[0])).toEqual(['w1', 'w2', 'c1', 'c2']);
  });

  it('fewer than 4 total candidates → no seatings', async () => {
    const { orderRotationCandidates, buildRotationSeatings } = await import('../server/rotation-planner');
    const ordered = orderRotationCandidates([waiter('w1', 1, 0)], [current('c1', 0, null)]);
    expect(buildRotationSeatings(ordered, 6)).toEqual([]);
  });
});

describe('deriveSessionPlayFromHistory — restart-safe rotation data from the join', () => {
  it('counts games per player and keeps the newest end time', async () => {
    const { deriveSessionPlayFromHistory } = await import('../server/rotation-planner');
    const t1 = new Date('2026-07-07T10:00:00Z');
    const t2 = new Date('2026-07-07T11:00:00Z');
    const row = (playerId: string, createdAt: Date) =>
      ({ gameId: 'g', playerId, team: 1, skillScoreBefore: 80, skillScoreAfter: 82, createdAt } as any);
    const byPlayer = deriveSessionPlayFromHistory([row('a', t2), row('a', t1), row('b', t1)]);
    expect(byPlayer.get('a')).toEqual({ gamesThisSession: 2, lastGameEndedAt: t2 });
    expect(byPlayer.get('b')).toEqual({ gamesThisSession: 1, lastGameEndedAt: t1 });
    expect(byPlayer.get('missing')).toBeUndefined();
  });
});

describe('balance preserved — arrangement of a chosen seating uses the existing machinery', () => {
  it('findBalancedTeams pairs strong-with-weak to minimise the gap for the fixed four', async () => {
    const { findBalancedTeams } = await import('../server/matchmaking');
    const four = [mkPlayer('s1', 'lower_intermediate', 100), mkPlayer('s2', 'lower_intermediate', 96),
                  mkPlayer('s3', 'lower_intermediate', 64), mkPlayer('s4', 'lower_intermediate', 60)];
    const best = findBalancedTeams(four, 1, true)[0];
    const teamOf = (id: string) => (best.team1.some((p: AnyPlayer) => p.id === id) ? 1 : 2);
    expect(teamOf('s1')).not.toBe(teamOf('s2')); // the two strongest split
    expect(best.skillGap).toBeLessThanOrEqual(2); // 100+60 vs 96+64 → gap 0
  });
});

describe('pairingKey + pickArrangement — the identical-repeat guard', () => {
  it('pairingKey is insensitive to team order and within-team order', async () => {
    const { pairingKey } = await import('../server/rotation-planner');
    const k = pairingKey(['a', 'b'], ['c', 'd']);
    expect(pairingKey(['b', 'a'], ['d', 'c'])).toBe(k); // within-team order
    expect(pairingKey(['c', 'd'], ['a', 'b'])).toBe(k); // team order
    expect(pairingKey(['a', 'c'], ['b', 'd'])).not.toBe(k); // a real remix differs
  });

  it('the exact current pairing is skipped when a remix exists', async () => {
    const { pairingKey, pickArrangement } = await import('../server/rotation-planner');
    const arr = (t1: string[], t2: string[], tag: string) =>
      ({ team1: t1.map(id => ({ id })), team2: t2.map(id => ({ id })), tag });
    const identical = arr(['a', 'b'], ['c', 'd'], 'identical');
    const remix = arr(['a', 'c'], ['b', 'd'], 'remix');
    const currentKey = pairingKey(['a', 'b'], ['c', 'd']);
    // identical ranks best — the guard must pick the remix anyway
    expect((pickArrangement([identical, remix], currentKey) as any).tag).toBe('remix');
    // no current pairing (free court) → best rank wins
    expect((pickArrangement([identical, remix], null) as any).tag).toBe('identical');
    // identical is literally the only arrangement → allowed
    expect((pickArrangement([identical], currentKey) as any).tag).toBe('identical');
  });

  it('end to end: findBalancedTeams(3) + pickArrangement never re-serves the on-court split', async () => {
    const { findBalancedTeams } = await import('../server/matchmaking');
    const { pairingKey, pickArrangement } = await import('../server/rotation-planner');
    const four = [mkPlayer('x1', 'lower_intermediate', 100), mkPlayer('x2', 'lower_intermediate', 60),
                  mkPlayer('x3', 'lower_intermediate', 96), mkPlayer('x4', 'lower_intermediate', 64)];
    const ranked = findBalancedTeams(four, 3, true);
    // pretend the CURRENT game is exactly the best-balanced split
    const best = ranked[0];
    const currentKey = pairingKey(best.team1.map((p: AnyPlayer) => p.id), best.team2.map((p: AnyPlayer) => p.id));
    const picked = pickArrangement(ranked, currentKey)!;
    expect(pairingKey(picked.team1.map((p: AnyPlayer) => p.id), picked.team2.map((p: AnyPlayer) => p.id))).not.toBe(currentKey);
  });
});

describe('flip-ordering tripwire — same-court repeats stay safe at promotion', () => {
  // The court-scoped exemption relies on end-game running in this order:
  // complete the game → re-append players to queue → free the court → THEN
  // flip the queued row (whose re-validation sees the players back in the
  // queue with their playing suggestion completed). If a refactor moves the
  // flip before the re-append, queued lineups containing the court's own
  // players would be dismissed as 'not-in-queue' instead of promoted.
  const orderedInSource = (file: string, routeMarker: string) => {
    const src = readFileSync(join(__dirname, '..', 'server', file), 'utf8');
    const start = src.indexOf(routeMarker);
    expect(start, `${routeMarker} not found in ${file}`).toBeGreaterThan(-1);
    const append = src.indexOf('appendPlayersToQueue(', start);
    const flip = src.indexOf('tryFlipQueuedToPendingForCourt(', start);
    expect(append, `appendPlayersToQueue call missing after ${routeMarker} in ${file}`).toBeGreaterThan(-1);
    expect(flip, `tryFlipQueuedToPendingForCourt call missing after ${routeMarker} in ${file}`).toBeGreaterThan(-1);
    return { append, flip };
  };

  it('admin end-game: players re-appended to the queue BEFORE the queued→pending flip', () => {
    const { append, flip } = orderedInSource('routes.ts', '[END-GAME]');
    expect(append).toBeLessThan(flip);
  });

  it('player submit-score path: same ordering in marketplace-routes.ts', () => {
    const { append, flip } = orderedInSource('marketplace-routes.ts', 'appendPlayersToQueue(');
    expect(append).toBeLessThan(flip);
  });

  it('behavioural: post-re-append state produces zero conflicts for a repeat lineup', async () => {
    const { findLineupConflicts } = await import('../server/auto-matchmaking');
    // At flip time the four repeats are back in the queue, their 'playing'
    // suggestion is completed (terminal → not in any open set), and they sit
    // on no other court's lineup.
    const repeats = ['r1', 'r2', 'r3', 'r4'];
    const conflicts = findLineupConflicts(repeats, {
      queueSet: new Set(['r1', 'r2', 'r3', 'r4', 'other']),
      sittingOutSet: new Set(),
      onOtherOpenSet: new Set(),
    });
    expect(conflicts).toEqual([]);
  });
});
