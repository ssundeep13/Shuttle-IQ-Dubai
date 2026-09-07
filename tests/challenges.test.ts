// Player Challenges — Gate C1: pure rules + route/schema pins.
//
// The rules live in server/challenges.ts as pure functions so the route is a
// thin shell over `checkCreateGuards` — every 4xx the spec names is decided
// here and unit-tested here, not re-derived inside the handler.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const {
  TIER_ORDER, OPEN_STATUSES, MAX_OUTGOING, EXPIRY_DAYS,
  canChallenge, pairKey, expiresAtFrom, isExpired, checkCreateGuards, challengeDirection,
} = await import('../server/challenges');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('canChallenge — |tierIndex diff| <= 1 on TIER_ORDER', () => {
  it('TIER_ORDER is the feed ladder, re-exported not duplicated', () => {
    expect(TIER_ORDER).toEqual(['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional']);
    const src = stripComments(read('server/challenges.ts'));
    expect(src).toMatch(/TIER_ORDER[^;]*from ["']\.\/feedEvents["']/);
    expect(src).not.toMatch(/\[\s*["']Novice["']\s*,/);
  });

  it('full matrix: same or adjacent tier → true, two or more apart → false, symmetric', () => {
    for (let i = 0; i < TIER_ORDER.length; i++) {
      for (let j = 0; j < TIER_ORDER.length; j++) {
        const expected = Math.abs(i - j) <= 1;
        expect(canChallenge(TIER_ORDER[i], TIER_ORDER[j]), `${TIER_ORDER[i]} vs ${TIER_ORDER[j]}`).toBe(expected);
        expect(canChallenge(TIER_ORDER[j], TIER_ORDER[i])).toBe(expected);
      }
    }
  });

  it('the spec examples', () => {
    expect(canChallenge('Beginner', 'Professional')).toBe(false);
    expect(canChallenge('upper_intermediate', 'Advanced')).toBe(true);
  });

  it('an unknown level is never in range', () => {
    expect(canChallenge('Beginner', 'Intermediate')).toBe(false); // display label, not a DB enum
    expect(canChallenge('', 'Beginner')).toBe(false);
  });
});

describe('pairKey — one key per unordered pair', () => {
  it('is symmetric, sorted, joined by ":"', () => {
    expect(pairKey('b', 'a')).toBe('a:b');
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
    expect(pairKey('009cd6d8', '25fb2a60')).toBe('009cd6d8:25fb2a60');
  });
});

describe('checkCreateGuards — the exact 4xx ladder from the spec', () => {
  const base = {
    challengerId: 'p1', challengedId: 'p2',
    challengerLevel: 'Beginner', challengedLevel: 'Beginner',
    challengedExists: true, openOutgoingCount: 0, existingOpenForPair: null as null | { id: string; status: string },
  };
  it('ok when everything lines up', () => {
    expect(checkCreateGuards(base)).toEqual({ ok: true });
  });
  it('400 self-challenge', () => {
    expect(checkCreateGuards({ ...base, challengedId: 'p1' })).toEqual({ ok: false, status: 400, error: 'You cannot challenge yourself' });
  });
  it('404 missing player', () => {
    expect(checkCreateGuards({ ...base, challengedExists: false })).toEqual({ ok: false, status: 404, error: 'Player not found' });
  });
  it('403 out of range', () => {
    expect(checkCreateGuards({ ...base, challengedLevel: 'Advanced' })).toEqual({ ok: false, status: 403, error: 'Out of range' });
  });
  it('409 open challenge already exists for the pair (either direction)', () => {
    expect(checkCreateGuards({ ...base, existingOpenForPair: { id: 'c1', status: 'pending' } })).toEqual({ ok: false, status: 409, error: 'Open challenge already exists' });
    expect(checkCreateGuards({ ...base, existingOpenForPair: { id: 'c1', status: 'accepted' } })).toEqual({ ok: false, status: 409, error: 'Open challenge already exists' });
  });
  it('MAX_OUTGOING boundary: 2 open → ok, 3 open → 409', () => {
    expect(MAX_OUTGOING).toBe(3);
    expect(checkCreateGuards({ ...base, openOutgoingCount: 2 })).toEqual({ ok: true });
    expect(checkCreateGuards({ ...base, openOutgoingCount: 3 })).toEqual({ ok: false, status: 409, error: 'You have 3 open challenges' });
    expect(checkCreateGuards({ ...base, openOutgoingCount: 7 })).toEqual({ ok: false, status: 409, error: 'You have 3 open challenges' });
  });
  it('precedence: self beats everything, then missing, then range, then pair, then cap', () => {
    expect(checkCreateGuards({ ...base, challengedId: 'p1', challengedExists: false, openOutgoingCount: 9 }).status).toBe(400);
    expect(checkCreateGuards({ ...base, challengedExists: false, challengedLevel: 'Professional' }).status).toBe(404);
    expect(checkCreateGuards({ ...base, challengedLevel: 'Professional', existingOpenForPair: { id: 'c', status: 'pending' } }).status).toBe(403);
    expect(checkCreateGuards({ ...base, existingOpenForPair: { id: 'c', status: 'pending' }, openOutgoingCount: 3 }).status).toBe(409);
  });
});

describe('expiry — pending challenges lapse after 7 days', () => {
  it('constants', () => {
    expect(EXPIRY_DAYS).toBe(7);
    expect(OPEN_STATUSES).toEqual(['pending', 'accepted']);
  });
  it('expiresAtFrom adds exactly 7 days', () => {
    const created = new Date('2026-09-05T10:00:00Z');
    expect(expiresAtFrom(created).toISOString()).toBe('2026-09-12T10:00:00.000Z');
  });
  it('only PENDING challenges expire; accepted ones never do', () => {
    const past = new Date('2026-09-01T00:00:00Z'), now = new Date('2026-09-13T00:00:00Z');
    expect(isExpired({ status: 'pending', expiresAt: past }, now)).toBe(true);
    expect(isExpired({ status: 'pending', expiresAt: new Date('2026-09-20T00:00:00Z') }, now)).toBe(false);
    expect(isExpired({ status: 'accepted', expiresAt: past }, now)).toBe(false);
    expect(isExpired({ status: 'settled', expiresAt: past }, now)).toBe(false);
  });
});

describe('challengeDirection', () => {
  it('incoming when the viewer is the challenged player, outgoing when the challenger', () => {
    const c = { challengerPlayerId: 'p1', challengedPlayerId: 'p2' };
    expect(challengeDirection(c, 'p2')).toBe('incoming');
    expect(challengeDirection(c, 'p1')).toBe('outgoing');
  });
});

describe('C1 pins — schema + routes', () => {
  it('challenges table with the three composite indexes and the partial unique index on open pairs', () => {
    const s = read('shared/schema.ts');
    expect(s).toMatch(/export const challenges = pgTable\("challenges"/);
    for (const col of ['challenger_player_id', 'challenged_player_id', 'pair_key', 'game_result_id', 'winner_player_id', 'expires_at', 'responded_at', 'settled_at']) expect(s).toContain(`"${col}"`);
    expect(s).toMatch(/uniqueIndex\('uq_challenges_open_pair'\)[\s\S]{0,120}\.where\(sql`status IN \('pending', 'accepted'\)`\)/);
    expect(s).toMatch(/index\('idx_challenges_challenger_status'\)/);
    expect(s).toMatch(/index\('idx_challenges_challenged_status'\)/);
    expect(s).toMatch(/index\('idx_challenges_pair_status'\)/);
  });
  it('five marketplace routes, all player-auth, with the profile-link 403 and expiry sweep', () => {
    const r = read('server/marketplace-routes.ts');
    for (const path of ['"/api/marketplace/challenges"', '"/api/marketplace/challenges/:id/accept"', '"/api/marketplace/challenges/:id/decline"', '"/api/marketplace/challenges/mine"', '"/api/marketplace/challenges/status/:playerId"']) {
      expect(r, path).toMatch(new RegExp(`app\\.(get|post)\\(${path.replace(/[/:]/g, (m) => '\\' + m)}, requireAuth, requireMarketplaceAuth,`));
    }
    const block = r.slice(r.indexOf('"/api/marketplace/challenges"'), r.indexOf('"/api/marketplace/challenges/status/:playerId"') + 2000);
    expect((block.match(/expireStaleChallenges\(\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((block.match(/Link your player profile first/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(block).toContain("type: 'challenge_received'");
    expect(block).toContain("type: 'challenge_accepted'");
    expect(block).not.toMatch(/type: 'challenge_declined'/); // decline is private
  });
  it('TIER_ORDER is exported from feedEvents', () => {
    expect(read('server/feedEvents.ts')).toMatch(/export const TIER_ORDER = \[/);
  });
});
