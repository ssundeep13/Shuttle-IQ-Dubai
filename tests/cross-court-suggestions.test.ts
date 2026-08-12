// Gate 3 — kill duplicate/stale suggestions across courts.
//
// Part 1 (cross-court invalidation): swap + undo were the two mutation
// paths still invalidating only pending-suggestions — content pins hold the
// ["/api/courts"] prefix invalidation on every claim-moving mutation.
// Part 2 (exclude-seeding): chooseSuggestionPool is the pure core — strict
// claims (auto-locked INCLUDED) + client excludes, with the small-pool
// fallback that prefers a duplicate suggestion over a false "no players".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chooseSuggestionPool } from '../server/suggestionPool';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const P = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const anyBand = () => true;
const base = (over: Partial<Parameters<typeof chooseSuggestionPool>[0]> = {}) => ({
  queue: P(8),
  sittingOut: new Set<string>(),
  ownCourtPlayerIds: [] as string[],
  strictClaimed: new Set<string>(),
  legacyClaimed: new Set<string>(),
  excludeIds: new Set<string>(),
  passesBand: anyBand,
  ...over,
});

describe('Gate 3 — chooseSuggestionPool (exclude-seeding + small-pool fallback)', () => {
  it('(a) two free courts, 8 eligible: court B excludes court A\'s displayed four → different lineups', () => {
    // Court A asked first (no earlier courts) and displays p1-p4.
    const courtA = chooseSuggestionPool(base());
    expect(courtA.waiterIds).toEqual(P(8));
    expect(courtA.sharedPool).toBe(false);
    // Court B's request is seeded with A's displayed four.
    const courtB = chooseSuggestionPool(base({ excludeIds: new Set(['p1', 'p2', 'p3', 'p4']) }));
    expect(courtB.waiterIds).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(courtB.sharedPool).toBe(false); // 4 remain — no fallback needed
  });

  it('(b) two free courts, exactly 4 eligible: both get the SAME four via fallback — never insufficientEligible', () => {
    const courtA = chooseSuggestionPool(base({ queue: P(4) }));
    expect(courtA.waiterIds).toEqual(P(4));
    // Court B excludes all four → strict pool empty → fallback re-admits them.
    const courtB = chooseSuggestionPool(base({ queue: P(4), excludeIds: new Set(P(4)) }));
    expect(courtB.waiterIds).toEqual(P(4)); // duplicate beats false "no players"
    expect(courtB.sharedPool).toBe(true);   // and the receipts chip says so
  });

  it('(d) a LOCKED lineup on court A blocks those four from siblings — auto and captain rows alike', () => {
    // strictClaimed models the server's no-exemption tier: an auto-locked
    // row's players are claimed here even though legacyClaimed frees them.
    const locked = new Set(['p1', 'p2', 'p3', 'p4']);
    const sibling = chooseSuggestionPool(base({ strictClaimed: locked }));
    expect(sibling.waiterIds).toEqual(['p5', 'p6', 'p7', 'p8']);
    expect(sibling.sharedPool).toBe(false);
  });

  it('(d-fallback) locked four + only 3 others → fallback re-admits the auto-freed players, flagged sharedPool', () => {
    const locked = new Set(['p1', 'p2', 'p3', 'p4']);
    const r = chooseSuggestionPool(base({
      queue: P(7),
      strictClaimed: locked,
      legacyClaimed: new Set<string>(), // legacy tier frees the auto-locked four
    }));
    expect(r.waiterIds).toEqual(P(7));
    expect(r.sharedPool).toBe(true);
  });

  it('genuinely insufficient pools stay insufficient — fallback that re-admits nobody is NOT flagged sharedPool', () => {
    // 3 players total, nothing claimed, nothing excluded: strict === legacy.
    const r = chooseSuggestionPool(base({ queue: P(3) }));
    expect(r.waiterIds).toEqual(P(3));
    expect(r.sharedPool).toBe(false); // route returns insufficientEligible without the chip
  });

  it('sitting-out and own-court current players behave unchanged through both tiers', () => {
    const r = chooseSuggestionPool(base({
      queue: P(5),
      sittingOut: new Set(['p5']),
      ownCourtPlayerIds: ['c1', 'c2'],
    }));
    expect(r.waiterIds).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(r.currentIds).toEqual(['c1', 'c2']);
  });
});

describe('Gate 3 — wiring pins', () => {
  const routes = read('server/routes.ts');
  const strip = read('client/src/components/UpNextStrip.tsx');
  const deck = read('client/src/components/NextGamesDeck.tsx');

  it('the suggestions GET runs BOTH claim tiers and feeds them to chooseSuggestionPool', () => {
    const get = routes.slice(
      routes.indexOf('app.get("/api/courts/:courtId/suggestions"'),
      // window widened (Gate A inserted the session-wide playingNow block
      // above the claim tiers — same assertions, larger slice)
      routes.indexOf('app.get("/api/courts/:courtId/suggestions"') + 8000,
    );
    // strict tier: no options object; legacy tier keeps the auto exemption
    expect(get.includes('getPlayersOnOpenSuggestionsForOtherCourts(sessionId, court.id, claimCheckIds, {})')).toBe(true);
    expect(get.includes("{ treatAutoQueuedAsFree: true }")).toBe(true);
    expect(get.includes('chooseSuggestionPool(')).toBe(true);
    expect(get.includes("req.query.exclude")).toBe(true);
    expect(get.includes('sharedPool')).toBe(true);
  });

  it('(c) swap and undo now invalidate the ["/api/courts"] prefix (sibling suggestion queries refetch)', () => {
    for (const mutation of ['const swapMutation', 'const removeMutation']) {
      const start = strip.indexOf(mutation);
      expect(start).toBeGreaterThan(-1);
      const block = strip.slice(start, strip.indexOf('onError', start));
      expect(
        block.includes('queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false })'),
        `${mutation} missing the /api/courts prefix invalidation`,
      ).toBe(true);
    }
  });

  it('both ephemeral queryFns seed the exclude param from earlier courts', () => {
    expect((strip.match(/earlierEphemeralExcludes\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(strip.includes('&exclude=')).toBe(true);
  });

  it('the deck seeds earlierCourtIds from the SHARED fixed order (courts before this one)', () => {
    expect(deck.includes('earlierCourtIds={courts.slice(0, courtIdx).map((c) => c.id)}')).toBe(true);
  });

  it('the sharedPool chip renders in the receipts row', () => {
    expect(strip.includes('badge-shared-pool-')).toBe(true);
    expect(strip.includes('Shared pool')).toBe(true);
  });

  it('conflict validation is untouched: pin/assign still treat auto-queued claims as free (captain outranks)', () => {
    // The exemption must survive at the ACTION layer — only the planning
    // view dropped it. The pin route's conflict check still passes the flag.
    const pinStart = routes.indexOf('app.post("/api/courts/:courtId/queued-suggestion"');
    const pin = routes.slice(pinStart, routes.indexOf('app.patch("/api/sessions/:sessionId/suggestions', pinStart));
    expect(pin.length).toBeGreaterThan(0);
    expect(pin.includes('treatAutoQueuedAsFree: true')).toBe(true);
  });
});
