/**
 * Finishing tier (diagnosis D3+D5 — owner ruling R1: with >=4 players in the
 * session, every panel ALWAYS proposes).
 *
 * Sunday c7963b15: 12 players, 3 courts occupied, 0 in the queue. The strict
 * claim pool refused, and every panel died with "All players are in games or
 * already lined up". Right fact, wrong conclusion — those games END. The
 * finishing tier widens the pool with players mid-game on OTHER courts of the
 * session, soonest-ending first, and runs them through the unchanged balance
 * pipeline. Ephemeral display only: no claim rows, no state-machine change; the
 * 409 action layer stays the arbiter if the captain acts before the game ends.
 *
 * Load-bearing and PINNED byte-identical here: the strict claim tier, and both
 * existing comparators inside orderRotationCandidates. The finishing tier sits
 * BESIDE them, never inside.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

type AnyPlayer = any;
const mkPlayer = (id: string, level = 'lower_intermediate', skillScore = 80): AnyPlayer =>
  ({ id, name: `P ${id}`, level, skillScore });
const waiter = (id: string, gamesWaited: number, queueIndex: number, score = 80) => ({
  player: mkPlayer(id, 'lower_intermediate', score), kind: 'waiter' as const,
  gamesWaited, queueIndex, gamesThisSession: 0, lastGameEndedAt: null,
});
const current = (id: string, gamesThisSession: number, lastEnd: Date | null, score = 80) => ({
  player: mkPlayer(id, 'lower_intermediate', score), kind: 'current' as const,
  gamesWaited: 0, queueIndex: Number.MAX_SAFE_INTEGER, gamesThisSession, lastGameEndedAt: lastEnd,
});
const finishing = (id: string, finishingInMin: number, gamesThisSession = 0, lastEnd: Date | null = null, score = 80) => ({
  player: mkPlayer(id, 'lower_intermediate', score), kind: 'finishing' as const,
  gamesWaited: 0, queueIndex: Number.MAX_SAFE_INTEGER, gamesThisSession, lastGameEndedAt: lastEnd,
  finishingInMin,
});
const ids = (seat: Array<{ player: AnyPlayer }>) => seat.map(c => c.player.id);
const T = (min: number) => new Date(Date.UTC(2026, 7, 16, 16, min));

describe('finishingBand — 3-minute buckets over a 60s countdown tick', () => {
  it('buckets minutes-remaining into 3-minute bands (0-2 → 0, 3-5 → 1, 6-8 → 2, ...)', async () => {
    const { finishingBand } = await import('../server/rotation-planner');
    expect([0, 1, 2].map(finishingBand)).toEqual([0, 0, 0]);
    expect([3, 4, 5].map(finishingBand)).toEqual([1, 1, 1]);
    expect([6, 7, 8].map(finishingBand)).toEqual([2, 2, 2]);
    expect(finishingBand(15)).toBe(5);
  });

  it('a missing countdown sorts LAST, never first', async () => {
    const { finishingBand } = await import('../server/rotation-planner');
    expect(finishingBand(undefined)).toBeGreaterThan(finishingBand(15));
  });
});

describe('orderFinishingCandidates — soonest band first, then the currents comparator', () => {
  it('orders by band, and a 40-second edge does NOT outrank three rotations of rest', async () => {
    const { orderFinishingCandidates } = await import('../server/rotation-planner');
    // 4.6 min vs 4.0 min are the SAME band; rest history decides.
    const rested = finishing('rested', 4.6, 1, T(0));
    const tired = finishing('tired', 4.0, 4, T(30));
    expect(ids(orderFinishingCandidates([tired, rested]))).toEqual(['rested', 'tired']);
  });

  it('a genuinely sooner band beats rest history', async () => {
    const { orderFinishingCandidates } = await import('../server/rotation-planner');
    const soonTired = finishing('soon-tired', 1, 5, T(30));
    const lateRested = finishing('late-rested', 12, 0, T(0));
    expect(ids(orderFinishingCandidates([lateRested, soonTired]))).toEqual(['soon-tired', 'late-rested']);
  });

  it('inside a band: fewer games first, then oldest last-game end (the existing currents comparator)', async () => {
    const { orderFinishingCandidates } = await import('../server/rotation-planner');
    const a = finishing('a', 7, 2, T(20));
    const b = finishing('b', 8, 2, T(5));   // same games, older end → first
    const c = finishing('c', 6, 1, T(40));  // fewer games → before both
    expect(ids(orderFinishingCandidates([a, b, c]))).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate its input', async () => {
    const { orderFinishingCandidates } = await import('../server/rotation-planner');
    const list = [finishing('z', 9), finishing('a', 1)];
    orderFinishingCandidates(list);
    expect(ids(list)).toEqual(['z', 'a']);
  });
});

describe('composition — finishing candidates APPENDED after waiters and currents', () => {
  it('orderRotationCandidates output is the prefix; finishing follows, in its own order', async () => {
    const { orderRotationCandidates, orderFinishingCandidates, withFinishingTier } = await import('../server/rotation-planner');
    const base = orderRotationCandidates([waiter('w1', 2, 0), waiter('w2', 1, 1)], [current('c1', 1, T(0))]);
    const fin = orderFinishingCandidates([finishing('f-late', 10), finishing('f-soon', 2)]);
    const all = withFinishingTier(base, fin);
    expect(ids(all)).toEqual(['w1', 'w2', 'c1', 'f-soon', 'f-late']);
  });

  it('seating window stays at its existing bound — the LOWEST-priority finishing candidates are dropped, never a waiter or current', async () => {
    const { orderRotationCandidates, orderFinishingCandidates, withFinishingTier, buildRotationSeatings } = await import('../server/rotation-planner');
    // 1 waiter + 2 currents + 9 finishing = 12 non-... the fill window is 8 non-waiters
    const base = orderRotationCandidates([waiter('w1', 3, 0)], [current('c1', 0, null), current('c2', 1, T(0))]);
    const fin = orderFinishingCandidates(Array.from({ length: 9 }, (_, i) => finishing(`f${i}`, i)));
    const seatings = buildRotationSeatings(withFinishingTier(base, fin));
    const seen = new Set(seatings.flat().map(c => c.player.id));
    // every seating contains the waiter; both currents are in the window
    expect(seatings.every(s => ids(s).includes('w1'))).toBe(true);
    expect(seen.has('c1') && seen.has('c2')).toBe(true);
    // window = 8 non-waiters: c1, c2 + f0..f5 → f6, f7, f8 (latest-ending) never seated
    expect(seen.has('f5')).toBe(true);
    expect(seen.has('f6') || seen.has('f7') || seen.has('f8')).toBe(false);
    // and combinatorics did not grow: C(8,3) = 56 seatings max
    expect(seatings.length).toBeLessThanOrEqual(56);
  });

  it('a pool of ONLY finishing candidates still seats — this is the Sunday shape', async () => {
    const { orderFinishingCandidates, withFinishingTier, buildRotationSeatings } = await import('../server/rotation-planner');
    const fin = orderFinishingCandidates(Array.from({ length: 8 }, (_, i) => finishing(`f${i}`, i * 2)));
    const seatings = buildRotationSeatings(withFinishingTier([], fin));
    expect(seatings.length).toBeGreaterThan(0);
    expect(seatings.every(s => s.length === 4)).toBe(true);
  });
});

describe('PINNED byte-identical — the parts this tier must not touch', () => {
  it('orderRotationCandidates: both existing comparators and the [...w, ...c] return are unchanged', () => {
    const s = read('server/rotation-planner.ts');
    // The function body ends at the finishing-tier section that follows it.
    const fn = s.slice(s.indexOf('export function orderRotationCandidates'), s.indexOf('// ── Finishing tier'));
    expect(fn.includes('(a, b) => b.gamesWaited - a.gamesWaited || a.queueIndex - b.queueIndex')).toBe(true);
    expect(fn.includes('a.gamesThisSession - b.gamesThisSession ||')).toBe(true);
    expect(fn.includes('(a.lastGameEndedAt?.getTime() ?? 0) - (b.lastGameEndedAt?.getTime() ?? 0)')).toBe(true);
    expect(fn.includes('return [...w, ...c];')).toBe(true);
    expect(fn.includes('finishing')).toBe(false); // the tier lives BESIDE, not inside
  });

  it('buildRotationSeatings window bounds are unchanged (10 waiters / 8 fill)', () => {
    const s = read('server/rotation-planner.ts');
    const fn = s.slice(s.indexOf('export function buildRotationSeatings'), s.indexOf('export const FAIR_GAME_GAP'));
    expect(fn.includes('Math.min(10, waiterCount)')).toBe(true);
    expect(fn.includes('waiterCount + 8')).toBe(true);
  });

  it('strict claim tier in chooseSuggestionPool is unchanged', () => {
    const s = stripComments(read('server/suggestionPool.ts'));
    expect(s.includes('const strict = build(input.strictClaimed, true)')).toBe(true);
    expect(s.includes('finishing')).toBe(false);
  });

  it('the finishing comparator reuses the currents comparator verbatim (no drift between tiers)', () => {
    const s = read('server/rotation-planner.ts');
    const fn = s.slice(s.indexOf('export function orderFinishingCandidates'), s.indexOf('export function withFinishingTier'));
    expect(fn.includes('a.gamesThisSession - b.gamesThisSession ||')).toBe(true);
    expect(fn.includes('(a.lastGameEndedAt?.getTime() ?? 0) - (b.lastGameEndedAt?.getTime() ?? 0)')).toBe(true);
    expect(fn.includes('finishingBand(a.finishingInMin) - finishingBand(b.finishingInMin)')).toBe(true);
  });
});

describe('route wiring — GET /api/courts/:courtId/suggestions', () => {
  const src = read('server/routes.ts');
  const route = src.slice(src.indexOf('const inBand = basePool.filter'), src.indexOf('const seatings = buildRotationSeatings'));

  it('finishing is admitted ONLY when strict+own yields <4 (never widens a healthy pool)', () => {
    const code = stripComments(route);
    // the only writes to finishingIds / finishingMinutes sit INSIDE the (<4 && !relax) branch
    const branchStart = code.indexOf('if (inBand.length < 4 && !relax)');
    expect(branchStart).toBeGreaterThan(-1);
    const before = code.slice(0, branchStart);
    expect(before.includes('finishingIds.push')).toBe(false);
    expect(before.includes('finishingMinutes.set')).toBe(false);
    const branch = code.slice(branchStart);
    expect(branch.includes('finishingIds.push(p.id)')).toBe(true);
    // and the healthy path leaves both empty: declared as [] / new Map()
    expect(before).toMatch(/let finishingIds: string\[\] = \[\]/);
  });

  it('candidates come from OTHER occupied courts of this session, never this court', () => {
    // Either spelling of the predicate: keep-if (occupied AND other) or skip-if (not occupied OR self).
    expect(route).toMatch(/c\.status === 'occupied' && c\.id !== court\.id|c\.status !== 'occupied' \|\| c\.id === court\.id\) continue/);
  });

  it('insufficientEligible fires only when the session has fewer than 4 players in total', () => {
    // the dead state is now reached only if in-band + finishing together are still short
    expect(route).toMatch(/inBand\.length \+ finishingIds\.length < 4/);
    // and there is NO remaining unconditional dead-state return on the (< 4 && !relax) branch
    const deadReturns = (route.match(/insufficientEligible: true/g) ?? []).length;
    expect(deadReturns).toBe(2); // one on the finishing-short branch, one on the relax branch
  });

  it('finishing candidates enter the same ordering + seating pipeline, appended last', () => {
    expect(route.includes('withFinishingTier(')).toBe(true);
    expect(route.includes('orderFinishingCandidates(')).toBe(true);
    expect(route).toMatch(/kind: 'finishing'/);
  });

  it('the response surfaces the tier and per-player countdown so the panel can be honest', () => {
    // From the seating build to the end of the handler's res.json.
    const start = src.indexOf('const seatings = buildRotationSeatings');
    const tail = src.slice(start, src.indexOf("app.get(\"/api/courts/:courtId/current-suggestion\"", start) > 0
      ? src.indexOf("app.get(\"/api/courts/:courtId/current-suggestion\"", start)
      : start + 30000);
    expect(tail.includes('finishingTier: true')).toBe(true);
    expect(tail.includes('finishingInMin: finishingMinutes.get(p.id)')).toBe(true);
  });

  it('EPHEMERAL: the tier writes nothing — no claim row, no queue write, no state change', () => {
    expect(route.includes('createMatchSuggestion')).toBe(false);
    expect(route.includes('storage.update')).toBe(false);
    expect(route.includes('storage.create')).toBe(false);
  });
});

describe('Sunday c7963b15 regression — 12 players / 3 courts occupied / 0 queue', () => {
  // The exact shape that produced three dead panels. Driven through the real
  // planner functions: strict pool refuses (nobody free), the finishing tier
  // must still yield a full, balanced, seat-able set for EVERY court.
  it('every panel proposes: from a court\'s view, the other two courts\' 8 players seat 4-of-8', async () => {
    const { orderFinishingCandidates, withFinishingTier, buildRotationSeatings, rankByBalance } = await import('../server/rotation-planner');
    const courts = [
      { id: 'A', timeRemaining: 4, players: ['a1', 'a2', 'a3', 'a4'] },
      { id: 'B', timeRemaining: 9, players: ['b1', 'b2', 'b3', 'b4'] },
      { id: 'C', timeRemaining: 13, players: ['c1', 'c2', 'c3', 'c4'] },
    ];
    const scores: Record<string, number> = { a1: 70, a2: 90, a3: 80, a4: 100, b1: 75, b2: 85, b3: 95, b4: 65, c1: 88, c2: 72, c3: 92, c4: 78 };
    for (const me of courts) {
      const others = courts.filter(c => c.id !== me.id);
      const fin = orderFinishingCandidates(
        others.flatMap(c => c.players.map(p => finishing(p, c.timeRemaining, 0, null, scores[p]))));
      const seatings = buildRotationSeatings(withFinishingTier([], fin));
      expect(seatings.length, `court ${me.id} must have seatings`).toBeGreaterThan(0);
      // soonest-ending court's players lead the window
      const soonest = others.sort((x, y) => x.timeRemaining - y.timeRemaining)[0];
      expect(soonest.players.every(p => seatings.some(s => ids(s).includes(p)))).toBe(true);
      // and a balanced arrangement exists (sane gap)
      const arranged = seatings.map(s => {
        const sc = s.map(c => c.player.skillScore as number);
        const t1 = (sc[0] + sc[3]) / 2, t2 = (sc[1] + sc[2]) / 2;
        return { skillGap: Math.abs(t1 - t2), seat: s };
      });
      const best = rankByBalance(arranged)[0];
      expect(best.skillGap).toBeLessThanOrEqual(8);
    }
  });
});
