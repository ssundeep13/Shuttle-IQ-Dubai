// Gate 6 — local-first async AI enrichment. The mandatory race: a late AI
// result must NEVER overwrite a lineup the captain locked, edited, or
// confirmed. The adoption rule is a pure helper; the wiring pins hold the
// server split (instant base + aiOnly follow-up) and the untouched
// timeout/validation/fallback core.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { shouldAdoptAiResult } from '../client/src/lib/aiAdoption';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const routes = read('server/routes.ts');
const strip = read('client/src/components/UpNextStrip.tsx');
const getBlock = routes.slice(
  routes.indexOf('app.get("/api/courts/:courtId/suggestions"'),
  routes.indexOf('app.post("/api/courts/:courtId/queued-suggestion"'),
);

describe('Gate 6 — locked-while-pending race (mandatory)', () => {
  const base = { hasPersistedRow: false, hasComposedEdit: false, swapSlotOpen: false, cycledIndex: 0 };

  it('LOCKED while AI pending: the AI result is never adopted', () => {
    expect(shouldAdoptAiResult({ ...base, hasPersistedRow: true })).toBe(false);
  });

  it('CONFIRMED (pending/approved row) while AI pending: never adopted', () => {
    // confirm states are persisted rows too — same guard, first in priority
    expect(shouldAdoptAiResult({ ...base, hasPersistedRow: true, hasComposedEdit: false })).toBe(false);
  });

  it('EDITED (composed swap / open picker / cycled option): held, not overwritten', () => {
    expect(shouldAdoptAiResult({ ...base, hasComposedEdit: true })).toBe(false);
    expect(shouldAdoptAiResult({ ...base, swapSlotOpen: true })).toBe(false);
    expect(shouldAdoptAiResult({ ...base, cycledIndex: 2 })).toBe(false);
  });

  it('untouched: the AI result adopts in place', () => {
    expect(shouldAdoptAiResult(base)).toBe(true);
  });

  it('the strip wires the guard exactly: persisted rows + all three edit signals', () => {
    expect(strip.includes('hasPersistedRow: !!queued || !!confirmRow')).toBe(true);
    expect(strip.includes('hasComposedEdit: composed !== null')).toBe(true);
    expect(strip.includes('swapSlotOpen: ephemeralSwapSlot !== null')).toBe(true);
    expect(strip.includes('cycledIndex: optionIdx')).toBe(true);
    // adoption only ever swaps the DISPLAY value; persisted-row branches
    // return before the ephemeral render, structurally
    expect(strip.indexOf('if (queued)')).toBeLessThan(strip.indexOf('const baseOption = options['));
    // one-tap adoption = clearing the edits (no force flag to go stale)
    expect(strip.includes('button-up-next-use-ai-')).toBe(true);
  });
});

describe('Gate 6 — server split: instant base + aiOnly follow-up', () => {
  it('the base request never runs the AI block; aiOnly does; eligibility mirrors the block', () => {
    expect(getBlock.includes("const aiOnly = req.query.aiOnly === 'true'")).toBe(true);
    expect(getBlock.includes('const aiEligible = aiMode && !!process.env.ANTHROPIC_API_KEY && orderedWaiters.length >= 4')).toBe(true);
    expect(getBlock.includes('if (aiEligible && aiOnly) {')).toBe(true);
    expect(getBlock.includes('...(aiEligible && !aiOnly ? { aiPending: true } : {})')).toBe(true);
  });

  it('timeout, validation, local fallback, and the model env are byte-untouched', () => {
    expect(getBlock.includes('timeoutMs: 10_000')).toBe(true);
    expect(getBlock.includes('outside pool')).toBe(true);
    expect(getBlock.includes('duplicate pairing')).toBe(true);
    expect(getBlock.includes('identical to current game')).toBe(true);
    expect(getBlock.includes('aiMatchmakingModel()')).toBe(true);
    expect(getBlock.includes('rankByBalance([...aiOptions, ...backfill])')).toBe(true);
  });
});

describe('Gate 6 — client wiring', () => {
  it('the follow-up query fires on aiPending and hits aiOnly=true with exclude seeding', () => {
    expect(strip.includes('aiMode=true&aiOnly=true')).toBe(true);
    expect(strip.includes('!!sugPrimary?.aiPending')).toBe(true);
    expect((strip.match(/earlierEphemeralExcludes\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the redundant free-court instant query is gone (the base is instant now)', () => {
    expect(strip.includes('instant: true')).toBe(false);
    expect(strip.includes('sugInstant')).toBe(false);
  });

  it('Regenerate goes straight to the AI path when AI is on, with the spinner', () => {
    expect(strip.includes('if (aiModeEnabled) refetchAi(); else refetchSuggestion();')).toBe(true);
    expect(strip.includes('Improving with AI…')).toBe(true);
    expect(strip.includes('disabled={sugLoading || aiFetching}')).toBe(true);
  });

  it('the why-line renders under the lineup in the teal token at 12px', () => {
    const whyIdx = strip.indexOf('text-up-next-reason-');
    const teamsIdx = strip.indexOf('{suggestionTeam(current.team2, 2, "Team 2")}');
    expect(whyIdx).toBeGreaterThan(teamsIdx); // under the lineup, not in the meta row
    const why = strip.slice(whyIdx - 300, whyIdx + 100);
    expect(why.includes('text-secondary')).toBe(true); // teal token
    expect(why.includes('text-xs')).toBe(true);        // 12px floor
  });
});
