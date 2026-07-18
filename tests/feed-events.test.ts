// Gate F2 — feed event generators. Pure builders are unit-tested directly;
// the transactional guarantees (savepoint guard, dedupe index no-op, hook
// placement, merge re-point) are locked as source tripwires and proven live
// by the ZZZ-FEED-VERIFY fixture.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Dynamic import so the env fallback above runs BEFORE server/db.ts loads
// (static imports hoist past the assignment).
import type { GameFeedInput } from '../server/feedEvents';
const {
  buildGameFeedEvents,
  buildTagFeedEvents,
  buildCorrectionReplacements,
  MILESTONE_GAMES,
  STREAK_MIN,
  RANK_MOVE_MIN,
  RANK_TOP_N,
} = await import('../server/feedEvents');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const basePlayer = {
  playerId: 'p1',
  name: 'Rakesh Nair',
  prevLevel: 'Beginner',
  newLevel: 'Beginner',
  prevWins: 5,
  prevGames: 10,
  newGames: 11,
  isWinner: false,
};

const baseInput = (overrides: Partial<GameFeedInput> = {}): GameFeedInput => ({
  gameResultId: 'game-1',
  sessionId: 'sess-1',
  isSandbox: false,
  perPlayer: [basePlayer],
  streaks: new Map(),
  ranks: new Map(),
  ...overrides,
});

describe('buildGameFeedEvents — tier_promotion', () => {
  it('fires on promotion with DISPLAY tiers, never DB enums', () => {
    const events = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, prevLevel: 'lower_intermediate', newLevel: 'upper_intermediate' }],
    }));
    const promo = events.find(e => e.type === 'tier_promotion');
    expect(promo).toBeDefined();
    expect(promo!.payload).toEqual({ playerName: 'Rakesh Nair', fromTier: 'Intermediate', toTier: 'Competitive' });
    expect(promo!.dedupeKey).toBe('game-1:p1');
    expect(promo!.subjectPlayerId).toBe('p1');
    expect(promo!.gameResultId).toBe('game-1');
    expect(promo!.sessionId).toBe('sess-1');
    expect(JSON.stringify(promo!.payload)).not.toContain('_intermediate');
  });

  it('never fires on a demotion', () => {
    const events = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, prevLevel: 'Advanced', newLevel: 'upper_intermediate' }],
    }));
    expect(events.filter(e => e.type === 'tier_promotion')).toHaveLength(0);
  });

  it('never fires when the level is unchanged', () => {
    const events = buildGameFeedEvents(baseInput());
    expect(events.filter(e => e.type === 'tier_promotion')).toHaveLength(0);
  });
});

describe('buildGameFeedEvents — milestone', () => {
  it('first game: pre-update gamesPlayed === 0', () => {
    const events = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, prevGames: 0, newGames: 1 }],
    }));
    const m = events.find(e => e.type === 'milestone');
    expect(m).toBeDefined();
    expect(m!.payload).toMatchObject({ playerName: 'Rakesh Nair', milestone: 'first_game' });
    expect(m!.dedupeKey).toBe('first_game:p1');
  });

  it('first win: pre-update wins === 0 AND this game was won', () => {
    const won = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, prevWins: 0, isWinner: true }],
    }));
    expect(won.some(e => e.type === 'milestone' && e.dedupeKey === 'first_win:p1')).toBe(true);

    const lost = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, prevWins: 0, isWinner: false }],
    }));
    expect(lost.some(e => e.type === 'milestone' && (e.payload as any).milestone === 'first_win')).toBe(false);
  });

  it('50th and 100th game fire exactly at the boundary', () => {
    expect(MILESTONE_GAMES).toEqual([50, 100]);
    for (const n of MILESTONE_GAMES) {
      const at = buildGameFeedEvents(baseInput({ perPlayer: [{ ...basePlayer, prevGames: n - 1, newGames: n }] }));
      expect(at.some(e => e.type === 'milestone' && e.dedupeKey === `game_${n}:p1`)).toBe(true);
      const past = buildGameFeedEvents(baseInput({ perPlayer: [{ ...basePlayer, prevGames: n, newGames: n + 1 }] }));
      expect(past.some(e => e.type === 'milestone' && (e.payload as any).milestone === `game_${n}`)).toBe(false);
    }
  });

  it('milestone dedupe key is per-player, not per-game — a stat rebuild cannot double-post', () => {
    const events = buildGameFeedEvents(baseInput({
      gameResultId: 'another-game',
      perPlayer: [{ ...basePlayer, prevGames: 0, newGames: 1 }],
    }));
    const m = events.find(e => e.type === 'milestone');
    expect(m!.dedupeKey).toBe('first_game:p1'); // no game id in the key
  });
});

describe('buildGameFeedEvents — win_streak', () => {
  it(`fires at ${STREAK_MIN}+ for winners only`, () => {
    const streaking = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, isWinner: true }],
      streaks: new Map([['p1', 3]]),
    }));
    const s = streaking.find(e => e.type === 'win_streak');
    expect(s).toBeDefined();
    expect(s!.payload).toEqual({ playerName: 'Rakesh Nair', streak: 3 });

    const below = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, isWinner: true }],
      streaks: new Map([['p1', 2]]),
    }));
    expect(below.some(e => e.type === 'win_streak')).toBe(false);

    const loser = buildGameFeedEvents(baseInput({
      perPlayer: [{ ...basePlayer, isWinner: false }],
      streaks: new Map([['p1', 5]]),
    }));
    expect(loser.some(e => e.type === 'win_streak')).toBe(false);
  });
});

describe('buildGameFeedEvents — leaderboard_move', () => {
  it(`fires only for ${RANK_MOVE_MIN}+ places landing inside the top ${RANK_TOP_N}, both positions frozen`, () => {
    const bigMove = buildGameFeedEvents(baseInput({
      ranks: new Map([['p1', { before: 18, after: 14 }]]),
    }));
    const mv = bigMove.find(e => e.type === 'leaderboard_move');
    expect(mv).toBeDefined();
    expect(mv!.payload).toEqual({ playerName: 'Rakesh Nair', fromRank: 18, toRank: 14 });

    const smallMove = buildGameFeedEvents(baseInput({
      ranks: new Map([['p1', { before: 15, after: 13 }]]),
    }));
    expect(smallMove.some(e => e.type === 'leaderboard_move')).toBe(false);

    const outsideTop = buildGameFeedEvents(baseInput({
      ranks: new Map([['p1', { before: 40, after: 25 }]]),
    }));
    expect(outsideTop.some(e => e.type === 'leaderboard_move')).toBe(false);

    const dropped = buildGameFeedEvents(baseInput({
      ranks: new Map([['p1', { before: 5, after: 12 }]]),
    }));
    expect(dropped.some(e => e.type === 'leaderboard_move')).toBe(false);
  });
});

describe('buildGameFeedEvents — sandbox', () => {
  it('a sandbox game produces ZERO events regardless of what happened in it', () => {
    const events = buildGameFeedEvents(baseInput({
      isSandbox: true,
      perPlayer: [{ ...basePlayer, prevGames: 0, prevWins: 0, isWinner: true, prevLevel: 'Beginner', newLevel: 'lower_intermediate' }],
      streaks: new Map([['p1', 10]]),
      ranks: new Map([['p1', { before: 30, after: 1 }]]),
    }));
    expect(events).toHaveLength(0);
  });
});

describe('buildTagFeedEvents', () => {
  it('freezes receiver/giver names + tag label, and carries player IDs (F4 forward-fix); receiver-led', () => {
    const events = buildTagFeedEvents({
      gameResultId: 'game-1',
      sessionId: 'sess-1',
      isSandbox: false,
      entries: [{ receiverId: 'p2', receiverName: 'Anita Menon', giverId: 'p1', giverName: 'Rakesh Nair', tagId: 'tag-net', tagLabel: 'Net Ninja' }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tag_received');
    expect(events[0].subjectPlayerId).toBe('p2');
    expect(events[0].relatedTagId).toBe('tag-net');
    expect(events[0].payload).toEqual({
      receiverName: 'Anita Menon', giverName: 'Rakesh Nair', tagLabel: 'Net Ninja',
      giverPlayerId: 'p1', receiverPlayerId: 'p2',
    });
    expect(events[0].dedupeKey).toBe('game-1:Rakesh Nair:p2:tag-net');
  });

  it('sandbox games emit nothing', () => {
    const events = buildTagFeedEvents({
      gameResultId: 'game-1',
      sessionId: 'sess-1',
      isSandbox: true,
      entries: [{ receiverId: 'p2', receiverName: 'Anita Menon', giverId: 'p1', giverName: 'Rakesh Nair', tagId: 't', tagLabel: 'L' }],
    });
    expect(events).toHaveLength(0);
  });
});

describe('buildCorrectionReplacements', () => {
  it('emits replacement tier_promotion marked corrected, keyed to the corrected outcome', () => {
    const events = buildCorrectionReplacements({
      gameResultId: 'game-1',
      sessionId: 'sess-1',
      newWinningTeam: 2,
      perPlayer: [
        { playerId: 'p1', name: 'Rakesh Nair', prevLevel: 'Beginner', newLevel: 'lower_intermediate' },
        { playerId: 'p2', name: 'Anita Menon', prevLevel: 'Advanced', newLevel: 'Advanced' },
        { playerId: 'p3', name: 'Vikram Shetty', prevLevel: 'Advanced', newLevel: 'upper_intermediate' }, // demotion → no post
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].dedupeKey).toBe('corr:game-1:p1:2');
    expect(events[0].payload).toEqual({ playerName: 'Rakesh Nair', fromTier: 'Beginner', toTier: 'Intermediate', corrected: true });
  });

  it('re-running the SAME correction produces the same dedupe key (idempotent by index)', () => {
    const args = {
      gameResultId: 'game-1',
      sessionId: 'sess-1',
      newWinningTeam: 2,
      perPlayer: [{ playerId: 'p1', name: 'R', prevLevel: 'Beginner', newLevel: 'lower_intermediate' }],
    };
    expect(buildCorrectionReplacements(args)[0].dedupeKey).toBe(buildCorrectionReplacements(args)[0].dedupeKey);
  });
});

// ── Source tripwires: transactional guarantees + hook placement ────────────

describe('feed emission — transaction safety (tripwires)', () => {
  const feedSrc = read('server/feedEvents.ts');

  it('inserts dedupe via onConflictDoNothing on the (type, dedupeKey) unique index', () => {
    expect(feedSrc.includes('onConflictDoNothing({ target: [feedEvents.type, feedEvents.dedupeKey] })')).toBe(true);
  });

  it('game emission runs in a NESTED transaction (savepoint) wrapped in try/catch — a feed bug cannot fail score entry', () => {
    const emitStart = feedSrc.indexOf('export async function emitGameFeedEventsInTx');
    const body = feedSrc.slice(emitStart, feedSrc.indexOf('export async function supersedeGameFeedEvents'));
    expect(body.includes('try {')).toBe(true);
    expect(body.includes('tx.transaction(')).toBe(true);
    expect(body.includes('catch')).toBe(true);
    // and it must not rethrow
    expect(/catch\s*\([^)]*\)\s*\{[^}]*throw/.test(body)).toBe(false);
  });

  it('supersede marks only PUBLISHED game-anchored events and is self-guarded', () => {
    const s = feedSrc.slice(feedSrc.indexOf('export async function supersedeGameFeedEvents'));
    expect(s.includes(`eq(feedEvents.status, "published")`)).toBe(true);
    expect(s.includes(`"superseded"`)).toBe(true);
    expect(s.includes('try {')).toBe(true);
  });

  it('completeGameTransaction emits INSIDE the same transaction, after the core writes', () => {
    const storageSrc = read('server/storage.ts');
    const txStart = storageSrc.indexOf('async completeGameTransaction');
    const body = storageSrc.slice(txStart);
    const participantsInsert = body.indexOf('.insert(gameParticipants)');
    const emit = body.indexOf('emitGameFeedEventsInTx(tx');
    expect(participantsInsert).toBeGreaterThan(-1);
    expect(emit, 'feed emission hook missing from completeGameTransaction').toBeGreaterThan(-1);
    expect(emit, 'emission must come after the participants insert').toBeGreaterThan(participantsInsert);
  });
});

describe('feed hooks — routes (tripwires)', () => {
  const routesSrc = read('server/routes.ts');

  it('score correction supersedes + replaces when the winner or a tier changed', () => {
    const patch = routesSrc.slice(routesSrc.indexOf('app.patch("/api/game-results/:id"'));
    const handler = patch.slice(0, patch.indexOf('app.get('));
    expect(handler.includes('supersedeGameFeedEvents(')).toBe(true);
    expect(handler.includes('buildCorrectionReplacements(')).toBe(true);
    expect(handler.includes('winnerChanged || tierChanged')).toBe(true);
  });

  it('tag handler emits tag_received AFTER tags are created, inside its own try/catch', () => {
    const post = routesSrc.slice(routesSrc.indexOf('app.post("/api/tags/game/:gameResultId"'));
    const created = post.indexOf('createPlayerTags(entries)');
    const emit = post.indexOf('buildTagFeedEvents(');
    expect(created).toBeGreaterThan(-1);
    expect(emit, 'tag feed hook missing').toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(created);
    const between = post.slice(created, emit);
    expect(between.includes('try {'), 'tag emission must be guarded so it cannot fail the submission').toBe(true);
  });
});

describe('feed events in player merge/undo (tripwires)', () => {
  const mergeSrc = read('server/playerMerge.ts');

  it('merge re-points feed_events.subject_player_id and feed_event_likes.player_id, recorded in the log', () => {
    expect(mergeSrc.includes('feed_events_subject:')).toBe(true);
    expect(mergeSrc.includes('feed_event_likes:')).toBe(true);
    expect(mergeSrc.includes('.update(feedEvents).set({ subjectPlayerId: survivorId })')).toBe(true);
    expect(mergeSrc.includes('.update(feedEventLikes).set({ playerId: survivorId })')).toBe(true);
  });

  it('undo reverses both re-points and restores dedupe-deleted likes verbatim', () => {
    const undo = mergeSrc.slice(mergeSrc.indexOf('export async function undoPlayerMerge'));
    expect(undo.includes('rp.feed_events_subject')).toBe(true);
    expect(undo.includes('rp.feed_event_likes')).toBe(true);
    expect(undo.includes('rr.feed_event_likes')).toBe(true);
    expect(undo.includes('INSERT INTO feed_event_likes')).toBe(true);
  });

  it('likes dedupe on the (event, player) PK — absorbed duplicate deleted, kept for undo', () => {
    expect(mergeSrc.includes('feed_event_likes b')).toBe(true);
    expect(mergeSrc.includes('a.event_id = b.event_id AND a.player_id')).toBe(true);
  });
});

describe('feed schema + migration (tripwires)', () => {
  it('migration is additive only and uses timestamptz', () => {
    const src = read('scripts/migrate-feed-events.mjs');
    expect(src.includes('CREATE TABLE IF NOT EXISTS feed_events')).toBe(true);
    expect(src.includes('CREATE TABLE IF NOT EXISTS feed_event_likes')).toBe(true);
    expect(src.includes('timestamptz')).toBe(true);
    expect(/ALTER TABLE|DROP TABLE|DROP COLUMN|timestamp without/i.test(src)).toBe(false);
  });

  it('schema declares the dedupe unique index and timestamptz created_at', () => {
    const src = read('shared/schema.ts');
    expect(src.includes(`uniqueIndex('uq_feed_event_dedupe').on(t.type, t.dedupeKey)`)).toBe(true);
    const feedBlock = src.slice(src.indexOf('export const feedEvents'), src.indexOf('export const feedEventLikes'));
    expect(feedBlock.includes('withTimezone: true')).toBe(true);
  });
});
