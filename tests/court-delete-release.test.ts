// Gate 1 — court-delete claim leak. The scenario under test: a court with a
// pending PINNED suggestion is deleted → its players must be claimable by
// another court's suggestion immediately.
//
// The mechanism that makes that true has two halves, and each is pinned:
//   1. The delete route releases every open row BEFORE deleteCourt.
//   2. "Released" means dismissed out of EXACTLY the status set the claim
//      query treats as claim-holding — so a released player is, by
//      construction, absent from every other court's claimedElsewhere set on
//      the very next suggestions request. (Claims are computed fresh per
//      request from open-status rows; there is no cached claim state.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

// The single source of truth for "these statuses hold player claims" — the
// claim query in auto-matchmaking. If this set ever changes, the release
// method must change with it, and this test forces that conversation.
const CLAIM_HOLDING_STATUSES = ['pending', 'approved', 'playing', 'queued'];

describe('court-delete releases ALL open suggestion claims (auto + pinned)', () => {
  const routes = read('server/routes.ts');
  const storage = read('server/storage.ts');
  const autoMm = read('server/auto-matchmaking.ts');

  it('the delete route releases open rows BEFORE deleting the court', () => {
    const del = routes.slice(
      routes.indexOf('Cannot delete occupied court'),
      routes.indexOf('Cannot delete occupied court') + 1200,
    );
    const releaseIdx = del.indexOf('releaseOpenSuggestionsForCourt');
    const deleteIdx = del.indexOf('storage.deleteCourt');
    expect(releaseIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeLessThan(deleteIdx); // release FIRST — order is the fix
  });

  it('release covers the FULL claim-holding status set — pinned rows included, no source filter', () => {
    const body = storage.slice(
      storage.indexOf('async releaseOpenSuggestionsForCourt'),
      storage.indexOf('async releaseOpenSuggestionsForCourt') + 800,
    );
    for (const status of CLAIM_HOLDING_STATUSES) {
      expect(body.includes(`'${status}'`)).toBe(true);
    }
    // No source discrimination: auto and captain-pinned rows release alike.
    expect(body.includes('source')).toBe(false);
    expect(body.includes("set({ status: 'dismissed' })")).toBe(true);
    expect(body.includes('eq(matchSuggestions.courtId, courtId)')).toBe(true); // court-scoped, nothing wider
  });

  it("the released set matches the claim query's own status set (drift tripwire)", () => {
    // getPlayersOnOpenSuggestions* in auto-matchmaking computes claims from
    // these statuses. Releasing exactly this set is what makes deleted-court
    // players claimable elsewhere on the next request.
    const claimSets = autoMm.match(/inArray\(matchSuggestions\.status, \[([^\]]+)\]\)/g) ?? [];
    expect(claimSets.length).toBeGreaterThan(0);
    const widest = claimSets.map(s => (s.match(/'/g) ?? []).length / 2).sort((a, b) => b - a)[0];
    expect(widest).toBe(CLAIM_HOLDING_STATUSES.length); // claim query's widest set is these 4
  });

  it('ride-along: the courts grid polls at 10s (two-captain staleness)', () => {
    const home = read('client/src/pages/Home.tsx');
    const q = home.slice(home.indexOf("['/api/courts', session.id]"), home.indexOf("['/api/courts', session.id]") + 600);
    expect(q.includes('refetchInterval: 10_000')).toBe(true);
  });
});
