/**
 * Gate 1 (D4) — occupied-court manual compose. CLIENT-ONLY: a server file in
 * this gate's diff is a tripwire.
 *
 * Rules pinned:
 *  - free court  → existing POST /assign, byte-identical
 *  - occupied    → POST /api/courts/:id/queued-suggestion (the hardened path)
 *  - the picker never offers live-elsewhere / sitting-out / claimed players
 *  - 409 conflicts render IN-SHEET with names (not a bare toast)
 *  - the stale-at-promotion caveat is stated verbatim
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { composeCandidates, composePreflightNames } from '../client/src/lib/composeEligibility';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const P = (id: string, name = id) => ({ id, name, level: 'lower_intermediate', skillScore: 80 } as any);

describe('composeCandidates — never offers an ineligible player', () => {
  const base = {
    queuePlayers: [P('a'), P('b'), P('c')],
    ownCourtPlayers: [P('own1'), P('own2')],
    sittingOut: new Set<string>(),
    playing: new Set<string>(),
    claimedElsewhere: new Set<string>(),
    alreadyPicked: new Set<string>(),
    ownCourtIds: new Set(['own1', 'own2']),
  };

  it('offers queue + own-court currents (same-court repeat is legal)', () => {
    const ids = composeCandidates(base).map((p) => p.id);
    expect(ids).toEqual(['a', 'b', 'c', 'own1', 'own2']);
  });

  it('excludes sitting-out, live-elsewhere, claimed-elsewhere and already-picked', () => {
    const ids = composeCandidates({
      ...base,
      sittingOut: new Set(['a']),
      playing: new Set(['b', 'own1']), // own1 is live ON THIS court — still offered
      claimedElsewhere: new Set(['c']),
      alreadyPicked: new Set(['own2']),
    }).map((p) => p.id);
    expect(ids).toEqual(['own1']);
  });

  it('a player live on ANOTHER court is never offered', () => {
    const ids = composeCandidates({ ...base, playing: new Set(['a']) }).map((p) => p.id);
    expect(ids).not.toContain('a');
  });
});

describe('composePreflightNames — names only, mirrors the strip', () => {
  const nameOfId = (id: string) => ({ x: 'Alan', y: 'Bea' } as Record<string, string>)[id];
  it('flags claimed + live-elsewhere, never own-court live players', () => {
    const names = composePreflightNames(['x', 'y', 'z'], {
      claimedElsewhere: new Set(['y']),
      playing: new Set(['x', 'z']),
      ownCourtIds: new Set(['z']),
      nameOfId,
    });
    expect(names.sort()).toEqual(['Alan', 'Bea']);
  });
});

describe('wiring pins', () => {
  it('AssignSheet takes a mode and branches the endpoint by it', () => {
    const s = read('client/src/components/NextGamesDeck.tsx');
    expect(s.includes("mode: 'assign' | 'compose'")).toBe(true);
    // sheet mounts for occupied courts too
    expect(s.includes('assignCourt.status === "available"')).toBe(false);
  });

  it('compose submits to queued-suggestion; free flow still posts to assign', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home.includes('queued-suggestion')).toBe(true);
    expect(home.includes("apiRequest('POST', `/api/courts/${courtId}/assign`")).toBe(true);
  });

  it('409 conflicts render in-sheet (deck) with names resolved in Home', () => {
    const deck = read('client/src/components/NextGamesDeck.tsx');
    expect(deck.includes('composeError')).toBe(true);
    expect(deck.includes('text-compose-error-')).toBe(true);
    expect(deck.includes('If any of these four gets placed elsewhere')).toBe(true);
    // names come off the 409 payload where the mutation lives
    const home = read('client/src/pages/Home.tsx');
    expect(home.includes('conflictNames(error')).toBe(true);
    expect(home.includes('setComposeError')).toBe(true);
  });

  it('occupied compose link exists, is occupied-only, and sits INSIDE Edit on a locked panel', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    expect(s.includes('button-compose-lineup-')).toBe(true);
    // one definition, gated on occupancy
    expect(s.includes('court.status === "occupied"')).toBe(true);
    // locked branch: the link renders within the {expanded && ( ... )} block
    const locked = s.slice(s.indexOf('// ── LOCKED IN'), s.indexOf('// ── LOCKED IN') + 12000);
    const expandedIdx = locked.indexOf('{expanded && (');
    const linkIdx = locked.indexOf('<ComposeLink />');
    expect(expandedIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(expandedIdx);
  });

  it('uses the shared helper — no second copy of the rule', () => {
    const deck = read('client/src/components/NextGamesDeck.tsx');
    expect(deck.includes('composeCandidates')).toBe(true);
  });
});
