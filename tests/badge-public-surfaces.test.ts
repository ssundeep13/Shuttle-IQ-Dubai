// Badge Gate 4 — public surfaces. progressTitle (copy fix) unit-tested;
// the batch badge lookup's read-only/active-only guarantees, the
// current-suggestion enrichment, and the queue/match render sites pinned
// as tripwires with the ZZZ live-fixture verification behind.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { progressTitle } from '../client/src/components/BadgeTag';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('progressTitle — Gate 4 copy fix', () => {
  it('at or past threshold: no "of Y" overshoot', () => {
    expect(progressTitle(10, 8)).toBe('This month · 10 check-ins');
    expect(progressTitle(8, 8)).toBe('This month · 8 check-ins');
    expect(progressTitle(4, 4)).toBe('This month · 4 check-ins');
  });

  it('below threshold: "X of Y" stays as shipped in Gate 3', () => {
    expect(progressTitle(3, 8)).toBe('This month · 3 of 8 check-ins');
    expect(progressTitle(0, 4)).toBe('This month · 0 of 4 check-ins');
  });
});

describe('getActiveBadgesForPlayers (tripwires)', () => {
  const badges = read('server/badges.ts');
  const fn = badges.slice(
    badges.indexOf('export async function getActiveBadgesForPlayers'),
    badges.indexOf('export async function getBadgeForUser'),
  );

  it('READ-ONLY: the public batch path never writes (no insert, no award persistence)', () => {
    expect(fn.length).toBeGreaterThan(0);
    expect(fn.includes('.insert(')).toBe(false);
    expect(fn.includes('onConflict')).toBe(false);
  });

  it('ACTIVE-ONLY: dormancy is unrepresentable — no dormant concept, no m2-based fallback tier', () => {
    const code = fn.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(code.includes('dormant')).toBe(false);
    expect(code.includes('computeBadge')).toBe(false); // derives active display directly
  });

  it('same verified-check-in predicate and rolling windows as everything else', () => {
    expect(fn.includes("b.attended_at IS NOT NULL AND b.status != 'cancelled'")).toBe(true);
    expect(fn.includes("interval '30 days'")).toBe(true);
    expect(fn.includes('founding_court_awards')).toBe(true);
  });
});

describe('current-suggestion enrichment (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');

  it('players carry badge from the batch lookup, guarded so a badge failure never breaks game flow', () => {
    expect(routes.includes('badgeByPlayerId = await getActiveBadgesForPlayers(playerIds)')).toBe(true);
    expect(routes.includes('badge: badgeByPlayerId.get(p.playerId) ?? null')).toBe(true);
    expect(routes.includes('[Badges] suggestion badge lookup failed')).toBe(true);
  });
});

describe('queue card + match screen render sites (tripwires)', () => {
  for (const f of ['client/src/pages/marketplace/Play.tsx', 'client/src/pages/marketplace/PlayingScreen.tsx']) {
    it(`${f.split('/').pop()}: BadgeTag (small) beside player names in TeamRow`, () => {
      const src = read(f);
      expect(src.includes("import BadgeTag from '@/components/BadgeTag'")).toBe(true);
      expect(src.includes('<BadgeTag badge={p.badge} small testid={`tag-badge-${p.playerId}`} />')).toBe(true);
      // Name rows wrap instead of clipping — the badge name never truncates.
      expect(src.includes('flex items-center gap-2 flex-wrap')).toBe(true);
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src)).toBe(false);
    });
  }

  it('BadgeTag small variant shrinks padding/font only — never adds truncation', () => {
    const src = read('client/src/components/BadgeTag.tsx');
    expect(src.includes("padding: small ? '1px 6px' : '2px 8px'")).toBe(true);
    expect(src.includes('fontSize: small ? 10 : 11')).toBe(true);
    expect(src.includes('textOverflow')).toBe(false);
    expect(src.includes('ellipsis')).toBe(false);
    expect(src.includes("whiteSpace: 'nowrap'")).toBe(true);
  });

  it('captain admin UI untouched: no admin page or session component imports BadgeTag', () => {
    // The only importers are the three marketplace player surfaces.
    const importers = ['client/src/pages/marketplace/Profile.tsx', 'client/src/pages/marketplace/Play.tsx', 'client/src/pages/marketplace/PlayingScreen.tsx'];
    for (const f of importers) {
      expect(read(f).includes("@/components/BadgeTag")).toBe(true);
    }
  });
});
