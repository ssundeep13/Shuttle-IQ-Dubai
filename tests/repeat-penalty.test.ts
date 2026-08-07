// Gate 5 — repeat-partner (and lighter repeat-opponent) penalty in the
// LOCAL matchmaker. Ranking priority is pinned throughout: rotation decides
// WHO plays (untouched here); balance decides HOW they're arranged; the
// repeat penalty only ever orders arrangements the balance sort already
// scored as equal (±0.01 gap) — it never outbids a fairer game.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// All matchmaking state here is in-memory (sessionId-keyed maps); no DB is
// touched — the dummy DATABASE_URL only satisfies the module-load guard.
async function mm() {
  return await import('../server/matchmaking');
}
async function rp() {
  return await import('../server/rotation-planner');
}

const P = (id: string) => ({
  id, name: id.toUpperCase(), skillScore: 90, level: 'intermediate', gender: 'Male',
}) as any;
const [A, B, C, D] = [P('a'), P('b'), P('c'), P('d')];

const game = (gameId: string, t1: string[], t2: string[]) => [
  ...t1.map(playerId => ({ gameId, playerId, team: 1, createdAt: new Date('2026-08-07T18:00:00Z') })),
  ...t2.map(playerId => ({ gameId, playerId, team: 2, createdAt: new Date('2026-08-07T18:00:00Z') })),
] as any[];

const pairOf = (team: Array<{ id: string }>) => team.map(p => p.id).sort().join('+');

describe('Gate 5 — repeat penalty in the local arrangement score', () => {
  it('(a) the top arrangement splits a just-played pair when gaps are equal', async () => {
    const { buildPartnerHistoryFromHistory, findBalancedTeams } = await mm();
    const sid = 't-g5-split';
    buildPartnerHistoryFromHistory(sid, game('g1', ['a', 'b'], ['c', 'd']));
    // All four at skill 90 → every permutation has gap 0 → the penalty decides.
    const ranked = findBalancedTeams([A, B, C, D], 3, true, sid);
    expect(pairOf(ranked[0].team1)).not.toBe('a+b');
    expect(pairOf(ranked[0].team1)).not.toBe('c+d');
    expect(pairOf(ranked[0].team2)).not.toBe('a+b');
    expect(pairOf(ranked[0].team2)).not.toBe('c+d');
    // and the exact-repeat arrangement carries the biggest penalty
    const repeatArr = ranked.find(r => pairOf(r.team1) === 'a+b' || pairOf(r.team2) === 'a+b');
    expect(repeatArr && repeatArr.splitPenalty).toBeGreaterThan(ranked[0].splitPenalty);
  });

  it('(a-cross) rankByBalance breaks equal-gap ties on the penalty — but NEVER overrides a lower gap', async () => {
    const { rankByBalance } = await rp();
    const tie = rankByBalance([
      { skillGap: 2, splitPenalty: 30, tag: 'repeat' },
      { skillGap: 2, splitPenalty: 0, tag: 'fresh' },
    ] as any[]);
    expect((tie[0] as any).tag).toBe('fresh');
    const gapWins = rankByBalance([
      { skillGap: 1, splitPenalty: 60, tag: 'closer-but-repeat' },
      { skillGap: 2, splitPenalty: 0, tag: 'fresh' },
    ] as any[]);
    expect((gapWins[0] as any).tag).toBe('closer-but-repeat'); // gap is primary, always
  });

  it('(b) exactly 4 eligible with maximum repeat history still produces a lineup — the penalty never blocks', async () => {
    const { buildPartnerHistoryFromHistory, findBalancedTeams } = await mm();
    const { pickArrangement } = await rp();
    const sid = 't-g5-small';
    buildPartnerHistoryFromHistory(sid, [
      ...game('g1', ['a', 'b'], ['c', 'd']),
      ...game('g2', ['a', 'b'], ['c', 'd']),
      ...game('g3', ['a', 'c'], ['b', 'd']),
      ...game('g4', ['a', 'd'], ['b', 'c']),
    ]);
    const ranked = findBalancedTeams([A, B, C, D], 3, true, sid);
    expect(ranked.length).toBe(3);
    expect(pickArrangement(ranked, null)).toBeDefined();
  });

  it('(c) repeat-opponent weighs less than repeat-partner — pinned constant AND behavior', async () => {
    const { buildPartnerHistoryFromHistory, findBalancedTeams, PARTNER_REPEAT_WEIGHT, OPPONENT_REPEAT_WEIGHT } = await mm();
    expect(OPPONENT_REPEAT_WEIGHT).toBeLessThan(PARTNER_REPEAT_WEIGHT);
    const sid = 't-g5-weights';
    buildPartnerHistoryFromHistory(sid, game('g1', ['a', 'b'], ['c', 'd']));
    const ranked = findBalancedTeams([A, B, C, D], 3, true, sid);
    // exact repeat (partners + opponents re-run) must rank last of the three
    expect(pairOf(ranked[2].team1) === 'a+b' || pairOf(ranked[2].team2) === 'a+b').toBe(true);
    // the two remix arrangements carry only opponent-repeat weight — strictly
    // lighter than any arrangement containing a repeated partnership
    expect(ranked[0].splitPenalty).toBeLessThan(ranked[2].splitPenalty);
    expect(ranked[0].splitPenalty).toBeLessThan(PARTNER_REPEAT_WEIGHT); // opponent-only stays under one partner hit
  });

  it('receipts: unavoidable repeat vs avoided repeat vs fresh session', async () => {
    const { buildPartnerHistoryFromHistory, repeatReceipt } = await mm();
    const sid = 't-g5-receipts';
    buildPartnerHistoryFromHistory(sid, game('g1', ['a', 'b'], ['c', 'd']));
    expect(repeatReceipt(['a', 'b'], ['c', 'd'], sid)).toBe('played together this session');
    expect(repeatReceipt(['a', 'c'], ['b', 'd'], sid)).toBe('no repeat partners');
    expect(repeatReceipt(['a', 'c'], ['b', 'd'], 't-g5-nobody-played')).toBeNull();
  });

  it('wiring: the suggestions GET carries splitPenalty + local receipts into the options', () => {
    const routes = readFileSync(join(__dirname, '..', 'server/routes.ts'), 'utf8');
    const get = routes.slice(
      routes.indexOf('app.get("/api/courts/:courtId/suggestions"'),
      routes.indexOf('app.post("/api/courts/:courtId/queued-suggestion"'),
    );
    expect(get.includes('splitPenalty: c.splitPenalty')).toBe(true);
    expect(get.includes('repeatReceipt(')).toBe(true);
    // AI path untouched: the AI merge still ranks through the same rankByBalance
    expect(get.includes('rankByBalance([...aiOptions, ...backfill])')).toBe(true);
  });
});
