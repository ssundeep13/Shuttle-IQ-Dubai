// Player Challenges — Gate C2: settlement on score entry + winner flip on edit.
//
// The decision ("which accepted challenges does this game settle, and who
// won") is a pure function. The DB write runs inside a SAVEPOINT with its
// own try/catch, mirroring emitGameFeedEventsInTx — a failure here must
// never fail score entry.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

vi.mock('../server/db', () => ({ db: { transaction: vi.fn(async (fn: any) => fn({})) } }));

const {
  pickSettlements, flipWinnerFor, settleChallengesInTx, flipSettledWinnersForGame,
} = await import('../server/challenges');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const accepted = (id: string, a: string, b: string) => ({ id, challengerPlayerId: a, challengedPlayerId: b, status: 'accepted' });

describe('pickSettlements — pure: opposite teams + accepted → settled, winner = the winning side', () => {
  it('singles: A (team 1, won) vs B (team 2) settles with A as winner', () => {
    const picks = pickSettlements([accepted('c1', 'A', 'B')], [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false },
    ]);
    expect(picks).toEqual([{ challengeId: 'c1', winnerPlayerId: 'A', loserPlayerId: 'B' }]);
  });

  it('doubles, opposite teams: settles; winner is whichever of the pair won', () => {
    const picks = pickSettlements([accepted('c1', 'A', 'C')], [
      { playerId: 'A', team: 1, isWinner: false }, { playerId: 'B', team: 1, isWinner: false },
      { playerId: 'C', team: 2, isWinner: true }, { playerId: 'D', team: 2, isWinner: true },
    ]);
    expect(picks).toEqual([{ challengeId: 'c1', winnerPlayerId: 'C', loserPlayerId: 'A' }]);
  });

  it('doubles, SAME team: not settled — the challenge stays open', () => {
    const picks = pickSettlements([accepted('c1', 'A', 'B')], [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 1, isWinner: true },
      { playerId: 'C', team: 2, isWinner: false }, { playerId: 'D', team: 2, isWinner: false },
    ]);
    expect(picks).toEqual([]);
  });

  it('only ACCEPTED challenges settle; a pending one between opponents is ignored', () => {
    const picks = pickSettlements([{ ...accepted('c1', 'A', 'B'), status: 'pending' }], [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false },
    ]);
    expect(picks).toEqual([]);
  });

  it('a challenge whose other player is not in this game is ignored', () => {
    const picks = pickSettlements([accepted('c1', 'A', 'Z')], [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false },
    ]);
    expect(picks).toEqual([]);
  });

  it('several challenges in one game each settle independently', () => {
    const picks = pickSettlements([accepted('c1', 'A', 'C'), accepted('c2', 'B', 'D'), accepted('c3', 'A', 'B')], [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 1, isWinner: true },
      { playerId: 'C', team: 2, isWinner: false }, { playerId: 'D', team: 2, isWinner: false },
    ]);
    expect(picks.map(p => p.challengeId).sort()).toEqual(['c1', 'c2']); // c3 = same team
  });
});

describe('flipWinnerFor — pure: a score edit that changes the winning team flips the settled winner', () => {
  const teamOf = new Map([['A', 1], ['B', 2]]);
  it('returns the new winner when the winning team changed', () => {
    expect(flipWinnerFor({ challengerPlayerId: 'A', challengedPlayerId: 'B', winnerPlayerId: 'A' }, 2, teamOf)).toBe('B');
  });
  it('returns null when the winner is unchanged', () => {
    expect(flipWinnerFor({ challengerPlayerId: 'A', challengedPlayerId: 'B', winnerPlayerId: 'A' }, 1, teamOf)).toBeNull();
  });
  it('returns null when a participant is missing from the game', () => {
    expect(flipWinnerFor({ challengerPlayerId: 'A', challengedPlayerId: 'Z', winnerPlayerId: 'A' }, 2, teamOf)).toBeNull();
  });
});

// ── DB behaviour against a routing fake tx ───────────────────────────────────

const fake = vi.hoisted(() => ({
  writes: [] as Array<{ op: string; table: string; values: any }>,
  savepoints: 0,
  openChallenges: [] as any[],
  playersRows: [] as any[],
  usersRows: [] as any[],
  throwOnUpdate: false,
}));

function makeTx() {
  const stx: any = {
    select: (_cols?: any) => ({
      from: (t: any) => ({
        where: async () => {
          const name = t[Symbol.for('drizzle:Name')];
          if (name === 'challenges') return fake.openChallenges;
          if (name === 'players') return fake.playersRows;
          if (name === 'marketplace_users') return fake.usersRows;
          return [];
        },
      }),
    }),
    update: (t: any) => ({
      set: (v: any) => ({
        where: () => ({
          returning: async () => {
            if (fake.throwOnUpdate) throw new Error('boom: simulated update failure');
            fake.writes.push({ op: 'update', table: t[Symbol.for('drizzle:Name')], values: v });
            const target = fake.openChallenges.find((c) => c.status === 'accepted' || c.status === 'settled');
            return target ? [{ ...target, ...v }] : [];
          },
        }),
      }),
    }),
    // Models drizzle's insert chain: `.values()` is awaitable directly (the
    // notification inserts) AND supports `.onConflictDoNothing().returning()`
    // (insertFeedEvents, C3). Rows are recorded when the chain resolves.
    insert: (t: any) => ({
      values: (v: any) => {
        const rows = Array.isArray(v) ? v : [v];
        const done = async () => {
          for (const r of rows) fake.writes.push({ op: 'insert', table: t[Symbol.for('drizzle:Name')], values: r });
          return rows.map((r: any) => ({ id: r.id ?? 'evt', type: r.type, subjectPlayerId: r.subjectPlayerId ?? null }));
        };
        return { onConflictDoNothing: () => ({ returning: done }), returning: done, then: (res: any, rej: any) => done().then(res, rej) };
      },
    }),
  };
  const tx: any = {
    ...stx,
    transaction: async (fn: any) => { fake.savepoints++; return fn(stx); },
  };
  return tx;
}

beforeEach(() => {
  fake.writes.length = 0; fake.savepoints = 0; fake.throwOnUpdate = false;
  fake.openChallenges = [accepted('c1', 'A', 'B')];
  fake.playersRows = [{ id: 'A', name: 'Dev' }, { id: 'B', name: 'Reena' }];
  fake.usersRows = [{ id: 'uA', linkedPlayerId: 'A' }, { id: 'uB', linkedPlayerId: 'B' }];
});

describe('settleChallengesInTx — savepoint-guarded write', () => {
  const game = { gameResultId: 'g1', sessionId: 's1', isSandbox: false, perPlayer: [
    { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false },
  ] };

  it('settles inside a savepoint: status/gameResultId/winner/settledAt written, both players notified', async () => {
    const tx = makeTx();
    const settled = await settleChallengesInTx(tx, game);
    expect(fake.savepoints).toBe(1);
    expect(settled).toEqual([{ id: 'c1', challengerPlayerId: 'A', challengedPlayerId: 'B', winnerPlayerId: 'A', loserPlayerId: 'B', winnerName: 'Dev', loserName: 'Reena' }]);
    const upd = fake.writes.find(w => w.op === 'update' && w.table === 'challenges')!;
    expect(upd.values).toMatchObject({ status: 'settled', gameResultId: 'g1', winnerPlayerId: 'A' });
    expect(upd.values.settledAt).toBeInstanceOf(Date);
    const notes = fake.writes.filter(w => w.op === 'insert' && w.table === 'marketplace_notifications').map(w => w.values);
    expect(notes.map(n => n.userId).sort()).toEqual(['uA', 'uB']);
    for (const n of notes) expect(n).toMatchObject({ type: 'challenge_settled', message: 'Dev beat Reena — challenge settled' });
  });

  it('sandbox: returns immediately — no savepoint, no reads, no writes', async () => {
    const tx = makeTx();
    const settled = await settleChallengesInTx(tx, { ...game, isSandbox: true });
    expect(settled).toEqual([]);
    expect(fake.savepoints).toBe(0);
    expect(fake.writes).toHaveLength(0);
  });

  it('same team in doubles: nothing written, challenge untouched', async () => {
    const tx = makeTx();
    const settled = await settleChallengesInTx(tx, { ...game, perPlayer: [
      { playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 1, isWinner: true },
      { playerId: 'C', team: 2, isWinner: false }, { playerId: 'D', team: 2, isWinner: false },
    ] });
    expect(settled).toEqual([]);
    expect(fake.writes).toHaveLength(0);
  });

  it('a failure inside is swallowed — returns [] and never throws into score entry', async () => {
    fake.throwOnUpdate = true;
    const tx = makeTx();
    await expect(settleChallengesInTx(tx, game)).resolves.toEqual([]);
  });
});

describe('flipSettledWinnersForGame — score edit path', () => {
  it('flips winnerPlayerId when the winning team changed; self-guarded', async () => {
    fake.openChallenges = [{ id: 'c1', challengerPlayerId: 'A', challengedPlayerId: 'B', status: 'settled', gameResultId: 'g1', winnerPlayerId: 'A' }];
    const tx = makeTx();
    const n = await flipSettledWinnersForGame('g1', 2, [{ playerId: 'A', team: 1 }, { playerId: 'B', team: 2 }], tx);
    expect(n).toBe(1);
    const upd = fake.writes.find(w => w.op === 'update' && w.table === 'challenges')!;
    expect(upd.values).toMatchObject({ winnerPlayerId: 'B' });
  });
  it('no-op when the winner is unchanged', async () => {
    fake.openChallenges = [{ id: 'c1', challengerPlayerId: 'A', challengedPlayerId: 'B', status: 'settled', gameResultId: 'g1', winnerPlayerId: 'A' }];
    const tx = makeTx();
    expect(await flipSettledWinnersForGame('g1', 1, [{ playerId: 'A', team: 1 }, { playerId: 'B', team: 2 }], tx)).toBe(0);
    expect(fake.writes).toHaveLength(0);
  });
});

describe('C2 pins — wired into the real paths, without touching rating math', () => {
  it('completeGameTransaction settles in the SAME tx, right before the feed emitter', () => {
    const s = stripComments(read('server/storage.ts'));
    const settle = s.indexOf('await settleChallengesInTx(tx, {');
    const feed = s.indexOf('await emitGameFeedEventsInTx(tx, {');
    expect(settle).toBeGreaterThan(0);
    expect(feed).toBeGreaterThan(settle);
    expect(feed - settle).toBeLessThan(900);
    expect(s).toMatch(/import \{ settleChallengesInTx \} from "\.\/challenges"/);
  });
  it('PATCH /api/game-results/:id flips settled winners only when the winner changed', () => {
    const r = stripComments(read('server/routes.ts'));
    const patch = r.slice(r.indexOf('app.patch("/api/game-results/:id"'), r.indexOf('app.get("/api/players"'));
    expect(patch).toMatch(/if \(winnerChanged\) \{[\s\S]{0,400}flipSettledWinnersForGame\(gameId, newWinningTeam/);
    expect(r).toMatch(/import \{[^}]*flipSettledWinnersForGame[^}]*\} from "\.\/challenges"/);
  });
  it('challenges.ts never imports storage (no import cycle with storage.ts)', () => {
    expect(stripComments(read('server/challenges.ts'))).not.toMatch(/from ["']\.\/storage["']/);
  });
});
