/**
 * Gate B (suggestions D2) — two S-shape fixes, evidence-driven:
 *  1. ROOT PATH: the queue endpoints refuse a player who is currently in a
 *     live game (repro: POST /api/queue/:playerId returned 200 for a player
 *     on an occupied court — the Sunday anchor-pair entry path).
 *  2. SPREAD: chooseSuggestionPool's fallback honours excludeIds when doing
 *     so still leaves a full lineup — the same anchor pair must not repeat
 *     across panels unless mathematically unavoidable.
 * The STRICT claim tier is load-bearing and byte-identical (pinned).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chooseSuggestionPool } from '../server/suggestionPool';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const base = {
  queue: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  sittingOut: new Set<string>(),
  ownCourtPlayerIds: [] as string[],
  strictClaimed: new Set<string>(),
  legacyClaimed: new Set<string>(),
  excludeIds: new Set<string>(),
  passesBand: () => true,
};

describe('Gate B — fallback spread (chooseSuggestionPool)', () => {
  it('strict tier unchanged: enough strict-eligible players → excludes honoured, no sharedPool', () => {
    const r = chooseSuggestionPool({ ...base, excludeIds: new Set(['a', 'b']) });
    expect(r.sharedPool).toBe(false);
    expect(r.waiterIds).not.toContain('a');
    expect(r.waiterIds).not.toContain('b');
  });

  it('NEW: strict starves but legacy-with-excludes fills a lineup → excludes SURVIVE the fallback', () => {
    // strict claims knock out c..h (6), leaving a,b (<4). Legacy frees them
    // all again; excludes a,b (the earlier panel's anchors) must stay out
    // because c..h still make 4+.
    const r = chooseSuggestionPool({
      ...base,
      strictClaimed: new Set(['c', 'd', 'e', 'f', 'g', 'h']),
      legacyClaimed: new Set<string>(),
      excludeIds: new Set(['a', 'b']),
    });
    expect(r.sharedPool).toBe(true);
    expect(r.waiterIds).not.toContain('a');
    expect(r.waiterIds).not.toContain('b');
    expect(r.waiterIds.length).toBeGreaterThanOrEqual(4);
    // strict applies excludes too: a,b excluded AND c..h claimed → 0 survive
    expect(r.strictEligibleCount).toBe(0);
  });

  it('last resort unchanged: even legacy-with-excludes cannot fill → excludes drop (duplicate beats dead panel)', () => {
    // only 5 players total; excludes cover 2 → keeping them leaves 3 (<4),
    // so the old drop-everything tier must still fire.
    const r = chooseSuggestionPool({
      ...base,
      queue: ['a', 'b', 'c', 'd', 'e'],
      strictClaimed: new Set(['c', 'd', 'e']),
      legacyClaimed: new Set<string>(),
      excludeIds: new Set(['a', 'b']),
    });
    expect(r.sharedPool).toBe(true);
    expect(r.waiterIds).toContain('a'); // re-admitted — unavoidable
  });

  it('strict build stays byte-identical (load-bearing)', () => {
    const s = read('server/suggestionPool.ts');
    expect(s.includes('const strict = build(input.strictClaimed, true);')).toBe(true);
    expect(s.includes('claimed.has(id) || (useExcludes && input.excludeIds.has(id))')).toBe(true);
  });
});

describe('Gate B — queue guards (root path)', () => {
  it('POST /api/queue/:playerId refuses a player in a live game', () => {
    const s = read('server/routes.ts');
    const ep = s.slice(s.indexOf('app.post("/api/queue/:playerId"'), s.indexOf('app.post("/api/queue/:playerId"') + 2200);
    expect(ep.includes('getCourtsWithPlayers')).toBe(true);
    expect(ep.includes('in a live game')).toBe(true);
    expect(ep.includes('409')).toBe(true);
  });

  it('PUT /api/queue refuses NEWLY-ADDED playing players (reorders stay legal)', () => {
    const s = read('server/routes.ts');
    const ep = s.slice(s.indexOf('app.put("/api/queue"'), s.indexOf('app.put("/api/queue"') + 2600);
    expect(ep.includes('in a live game')).toBe(true);
    expect(/addedIds|newlyAdded/.test(ep)).toBe(true);
    expect(ep.includes('409')).toBe(true);
  });
});
