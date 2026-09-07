// Player Challenges — Gate C3: feed cards on accept and settle.
//
// Builders are pure (payload = display names + display tiers only). The
// settled card is inserted INSIDE the settlement savepoint; a score edit
// supersedes it with a corrected card. Copy lives in one shared helper so the
// server headline and the client card can never disagree.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const fake = vi.hoisted(() => ({
  writes: [] as Array<{ op: string; table: string; values: any }>,
  savepoints: 0,
  challengeRows: [] as any[],
  playersRows: [] as any[],
  usersRows: [] as any[],
  makeTx(): any {
    const name = (t: any) => t[Symbol.for('drizzle:Name')];
    const stx: any = {
      select: () => ({ from: (t: any) => ({ where: async () => name(t) === 'challenges' ? fake.challengeRows : name(t) === 'players' ? fake.playersRows : name(t) === 'marketplace_users' ? fake.usersRows : [] }) }),
      update: (t: any) => ({ set: (v: any) => {
        const done = async () => { fake.writes.push({ op: 'update', table: name(t), values: v }); const target = fake.challengeRows[0]; return target ? [{ ...target, ...v }] : []; };
        const where = () => ({ returning: done, then: (r: any, j: any) => done().then(r, j) });
        return { where };
      } }),
      insert: (t: any) => ({ values: (v: any) => {
        const rows = Array.isArray(v) ? v : [v];
        const done = async () => { for (const r of rows) fake.writes.push({ op: 'insert', table: name(t), values: r }); return rows.map((r: any) => ({ id: r.id ?? 'evt', type: r.type, subjectPlayerId: r.subjectPlayerId ?? null })); };
        const chain: any = { onConflictDoNothing: () => ({ returning: done }), returning: done, then: (r: any, j: any) => done().then(r, j) };
        return chain;
      } }),
    };
    return { ...stx, transaction: async (fn: any) => { fake.savepoints++; return fn(stx); } };
  },
}));
vi.mock('../server/db', () => ({ db: { transaction: vi.fn(async (fn: any) => fn(fake.makeTx())) } }));

const { buildChallengeAcceptedEvent, buildChallengeSettledEvent, feedEventHeadline } = await import('../server/feedEvents');
const { challengeAcceptedHeadline, challengeSettledHeadline } = await import('../shared/utils/challengeCopy');
const { settleChallengesInTx, supersedeChallengeCardsForGame } = await import('../server/challenges');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('builders — payloads carry display names + display tiers only', () => {
  it('accepted: subject = challenger, dedupe ca:<id>, no game/session anchor', () => {
    const ev = buildChallengeAcceptedEvent({
      challengeId: 'c1',
      challenger: { id: 'A', name: 'Dev', tier: 'Competitive' },
      challenged: { id: 'B', name: 'Reena', tier: 'Intermediate' },
    });
    expect(ev).toEqual({
      type: 'challenge_accepted', subjectPlayerId: 'A', gameResultId: null, sessionId: null, relatedTagId: null,
      dedupeKey: 'ca:c1',
      payload: { challengeId: 'c1', challengerName: 'Dev', challengedName: 'Reena', challengerTier: 'Competitive', challengedTier: 'Intermediate' },
    });
    expect(JSON.stringify(ev.payload)).not.toMatch(/upper_intermediate|lower_intermediate/);
  });

  it('settled: subject = winner, anchored to the game (so corrections supersede it), dedupe cs:<id>', () => {
    const ev = buildChallengeSettledEvent({
      challengeId: 'c1', gameResultId: 'g1', sessionId: 's1',
      winner: { id: 'A', name: 'Dev' }, loser: { id: 'B', name: 'Reena' }, score: { winner: 21, loser: 17 },
    });
    expect(ev).toEqual({
      type: 'challenge_settled', subjectPlayerId: 'A', gameResultId: 'g1', sessionId: 's1', relatedTagId: null,
      dedupeKey: 'cs:c1',
      payload: { challengeId: 'c1', winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17 },
    });
  });

  it('settled correction gets its own dedupe key so the replacement can land beside the superseded card', () => {
    const ev = buildChallengeSettledEvent({
      challengeId: 'c1', gameResultId: 'g1', sessionId: 's1',
      winner: { id: 'B', name: 'Reena' }, loser: { id: 'A', name: 'Dev' }, score: { winner: 22, loser: 20 }, correction: true,
    });
    expect(ev.dedupeKey).toBe('cs:c1:corr:B');
    expect(ev.subjectPlayerId).toBe('B');
  });
});

describe('copy — one source for headline + client card', () => {
  it('accepted: "Dev challenged Reena"', () => {
    expect(challengeAcceptedHeadline({ challengerName: 'Dev', challengedName: 'Reena' })).toBe('Dev challenged Reena');
    expect(feedEventHeadline('challenge_accepted', { challengerName: 'Dev', challengedName: 'Reena' })).toBe('Dev challenged Reena');
  });
  it('settled: "Dev beat Reena 21–17 · Challenge settled" (en dash, middle dot)', () => {
    expect(challengeSettledHeadline({ winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17 })).toBe('Dev beat Reena 21–17 · Challenge settled');
    expect(feedEventHeadline('challenge_settled', { winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17 })).toBe('Dev beat Reena 21–17 · Challenge settled');
  });
  it('no emoji anywhere in the copy helper', () => {
    expect(read('shared/utils/challengeCopy.ts')).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('emission — settled card inside the settlement savepoint', () => {
  beforeEach(() => {
    fake.writes.length = 0; fake.savepoints = 0;
    fake.challengeRows = [{ id: 'c1', challengerPlayerId: 'A', challengedPlayerId: 'B', status: 'accepted' }];
    fake.playersRows = [{ id: 'A', name: 'Dev' }, { id: 'B', name: 'Reena' }];
    fake.usersRows = [];
  });

  it('settleChallengesInTx inserts one challenge_settled event with the score from the winning side', async () => {
    const tx = fake.makeTx();
    const settled = await settleChallengesInTx(tx, {
      gameResultId: 'g1', sessionId: 's1', isSandbox: false, team1Score: 21, team2Score: 17,
      perPlayer: [{ playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false }],
    });
    expect(settled).toHaveLength(1);
    const cards = fake.writes.filter(w => w.op === 'insert' && w.table === 'feed_events').map(w => w.values);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: 'challenge_settled', subjectPlayerId: 'A', gameResultId: 'g1', sessionId: 's1', dedupeKey: 'cs:c1',
      payload: { challengeId: 'c1', winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17 } });
    expect(fake.savepoints).toBe(1); // same savepoint as the settlement write
  });

  it('sandbox: no card', async () => {
    const tx = fake.makeTx();
    await settleChallengesInTx(tx, { gameResultId: 'g1', sessionId: 's1', isSandbox: true, team1Score: 21, team2Score: 17,
      perPlayer: [{ playerId: 'A', team: 1, isWinner: true }, { playerId: 'B', team: 2, isWinner: false }] });
    expect(fake.writes.filter(w => w.table === 'feed_events')).toHaveLength(0);
  });

  it('score edit: supersedes the settled card and inserts the corrected one (self-guarded)', async () => {
    fake.challengeRows = [{ id: 'c1', challengerPlayerId: 'A', challengedPlayerId: 'B', status: 'settled', gameResultId: 'g1', winnerPlayerId: 'B' }];
    const n = await supersedeChallengeCardsForGame('g1', { sessionId: 's1', newWinningTeam: 2, team1Score: 20, team2Score: 22,
      participants: [{ playerId: 'A', team: 1 }, { playerId: 'B', team: 2 }] });
    expect(n).toBe(1);
    const sup = fake.writes.find(w => w.op === 'update' && w.table === 'feed_events');
    expect(sup?.values).toMatchObject({ status: 'superseded' });
    const card = fake.writes.find(w => w.op === 'insert' && w.table === 'feed_events')?.values;
    expect(card).toMatchObject({ type: 'challenge_settled', subjectPlayerId: 'B', dedupeKey: 'cs:c1:corr:B',
      payload: { winnerName: 'Reena', loserName: 'Dev', winnerScore: 22, loserScore: 20 } });
  });
});

describe('C3 pins — wiring + client cards', () => {
  it('accept route emits the accepted card; decline emits nothing', () => {
    const r = stripComments(read('server/marketplace-routes.ts'));
    const accept = r.slice(r.indexOf('"/api/marketplace/challenges/:id/accept"'), r.indexOf('"/api/marketplace/challenges/:id/decline"'));
    expect(accept).toMatch(/buildChallengeAcceptedEvent\(/);
    expect(accept).toMatch(/insertFeedEvents\(/);
    const decline = r.slice(r.indexOf('"/api/marketplace/challenges/:id/decline"'), r.indexOf('"/api/marketplace/challenges/mine"'));
    expect(decline).not.toMatch(/insertFeedEvents|buildChallenge/);
  });
  it('PATCH /api/game-results/:id supersedes challenge cards when the winner changed', () => {
    const r = stripComments(read('server/routes.ts'));
    const patch = r.slice(r.indexOf('app.patch("/api/game-results/:id"'), r.indexOf('app.get("/api/players"'));
    expect(patch).toMatch(/if \(winnerChanged\) \{[\s\S]{0,700}supersedeChallengeCardsForGame\(gameId/);
  });
  it('feedEvents type comment lists both new types; like route stays type-agnostic', () => {
    expect(read('server/feedEvents.ts')).toMatch(/challenge_accepted.*challenge_settled|challenge_settled.*challenge_accepted/);
    const r = stripComments(read('server/marketplace-routes.ts'));
    const like = r.slice(r.indexOf('"/api/marketplace/feed/:eventId/like", requireAuth'), r.indexOf('app.delete("/api/marketplace/feed/:eventId/like"'));
    expect(like).not.toMatch(/feedEvents\.type/);
  });
  it('CommunityFeed renders both types via the shared copy, brand tokens only, likes on both', () => {
    const c = read('client/src/pages/marketplace/CommunityFeed.tsx');
    expect(c).toMatch(/case 'challenge_accepted':/);
    expect(c).toMatch(/case 'challenge_settled':/);
    expect(c).toMatch(/import \{[^}]*challengeAcceptedHeadline[^}]*\} from '@shared\/utils\/challengeCopy'/);
    expect(c).toMatch(/challengeSettledHeadline\(/);
    const from = c.indexOf('function ChallengeAcceptedCard'); const to = c.indexOf('function FeedEventCard');
    expect(from).toBeGreaterThan(0);
    const cards = c.slice(from, to);
    expect(cards).toMatch(/function ChallengeSettledCard/);
    expect((cards.match(/<LikeBar ev=/g) ?? []).length).toBe(2);
    expect(cards).toMatch(/MKT\.navy/); expect(cards).toMatch(/MKT\.tealText/);
    expect(cards).toMatch(/challengerTier/); expect(cards).toMatch(/challengedTier/);
    expect(cards).not.toMatch(/gradient|boxShadow|shadow-|#[0-9a-fA-F]{6}\b/);
    expect(cards).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(cards).not.toMatch(/fontWeight:\s*9\d\d/);
  });
});
