// Gate 2b — consistency badge rules. computeBadge is pure and fully
// unit-tested; the DB read path and /auth/me wiring are pinned as
// tripwires with live production spot-checks behind.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const { computeBadge, BADGE_THRESHOLDS, BADGE_WINDOW_DAYS } = await import('../server/badges');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('computeBadge — active ladder', () => {
  it('no badge below 4 check-ins; progress targets Insider (4)', () => {
    const b = computeBadge(3, 0, 0, false);
    expect(b.badge).toBeNull();
    expect(b.badgeStatus).toBeNull();
    expect(b.progress).toEqual({ currentCheckins: 3, threshold: 4, windowDays: 30 });
  });

  it('Insider at 4-7; progress targets Inner Circle (8)', () => {
    for (const n of [4, 7]) {
      const b = computeBadge(n, 0, 0, false);
      expect(b.badge).toBe('Insider');
      expect(b.badgeStatus).toBe('active');
      expect(b.progress.threshold).toBe(8);
    }
  });

  it('Inner Circle at 8+; maintenance threshold 8', () => {
    const b = computeBadge(9, 2, 0, false);
    expect(b.badge).toBe('Inner Circle');
    expect(b.badgeStatus).toBe('active');
    expect(b.progress).toEqual({ currentCheckins: 9, threshold: 8, windowDays: 30 });
  });

  it('constants match the calibrated thresholds', () => {
    expect(BADGE_THRESHOLDS).toEqual({ insider: 4, inner_circle: 8 });
    expect(BADGE_WINDOW_DAYS).toBe(30);
  });
});

describe('computeBadge — Founding Court permanence', () => {
  it('detected on 3 consecutive qualifying windows (8/8/8)', () => {
    const b = computeBadge(8, 8, 8, false);
    expect(b.badge).toBe('Founding Court');
    expect(b.badgeStatus).toBe('active');
    expect(b.qualifiesFoundingNow).toBe(true);
  });

  it('two windows are not enough', () => {
    expect(computeBadge(10, 10, 7, false).badge).toBe('Inner Circle');
    expect(computeBadge(10, 10, 7, false).qualifiesFoundingNow).toBe(false);
  });

  it('once awarded, NEVER dormant and never lost — even at zero check-ins', () => {
    const b = computeBadge(0, 0, 0, true);
    expect(b.badge).toBe('Founding Court');
    expect(b.badgeStatus).toBe('active');
    expect(b.sessionsToReactivate).toBeUndefined();
  });

  it('Suchitha shape (10/11/9 post-backfill) qualifies on first read', () => {
    const b = computeBadge(10, 11, 9, false);
    expect(b.badge).toBe('Founding Court');
    expect(b.qualifiesFoundingNow).toBe(true);
  });
});

describe('computeBadge — dormancy', () => {
  it('below threshold now, Insider last window → dormant Insider, reactivate = 4 - current', () => {
    const b = computeBadge(1, 5, 0, false);
    expect(b.badge).toBe('Insider');
    expect(b.badgeStatus).toBe('dormant');
    expect(b.sessionsToReactivate).toBe(3);
    expect(b.progress.threshold).toBe(4); // dormant tier's own threshold — bar and reactivate agree
  });

  it('Inner Circle last window → dormant Inner Circle, reactivate = 8 - current', () => {
    const b = computeBadge(2, 9, 4, false);
    expect(b.badge).toBe('Inner Circle');
    expect(b.badgeStatus).toBe('dormant');
    expect(b.sessionsToReactivate).toBe(6);
    expect(b.progress.threshold).toBe(8);
  });

  it('an ACTIVE Insider who was Inner Circle last window stays active Insider (no dormant downgrade)', () => {
    const b = computeBadge(5, 10, 0, false);
    expect(b.badge).toBe('Insider');
    expect(b.badgeStatus).toBe('active');
    expect(b.sessionsToReactivate).toBeUndefined();
  });

  it('nothing last window either → plain no-badge, not dormant', () => {
    const b = computeBadge(0, 3, 8, false);
    expect(b.badge).toBeNull();
    expect(b.badgeStatus).toBeNull();
  });
});

describe('display names only — internal enum values never surface', () => {
  it('every badge output is a display name', () => {
    const outputs = [
      computeBadge(4, 0, 0, false), computeBadge(8, 0, 0, false),
      computeBadge(8, 8, 8, false), computeBadge(0, 0, 0, true),
      computeBadge(0, 5, 0, false), computeBadge(0, 9, 0, false),
    ].map(b => b.badge);
    expect(outputs).toEqual(['Insider', 'Inner Circle', 'Founding Court', 'Founding Court', 'Insider', 'Inner Circle']);
    for (const o of outputs) expect(['insider', 'inner_circle', 'founding_court']).not.toContain(o);
  });
});

describe('DB read path + wiring (tripwires)', () => {
  const badges = read('server/badges.ts');
  const routes = read('server/marketplace-routes.ts');

  it('verified check-in predicate: attended_at NOT NULL and status != cancelled', () => {
    expect(badges.includes("attended_at IS NOT NULL AND status != 'cancelled'")).toBe(true);
  });

  it('three rolling windows match the Gate 1 calibration methodology', () => {
    expect(badges.includes("attended_at >  now() - interval '30 days'")).toBe(true);
    expect(badges.includes("attended_at <= now() - interval '30 days' AND attended_at > now() - interval '60 days'")).toBe(true);
    expect(badges.includes("attended_at <= now() - interval '60 days' AND attended_at > now() - interval '90 days'")).toBe(true);
  });

  it('award write is idempotent (onConflictDoNothing) and never revoked (no delete anywhere)', () => {
    expect(badges.includes('.onConflictDoNothing()')).toBe(true);
    expect(badges.toLowerCase().includes('delete')).toBe(false);
    expect(routes.includes('foundingCourtAwards')).toBe(false); // awards written ONLY via badges.ts
  });

  it('/auth/me carries the badge block, guarded so badge failure never breaks the profile', () => {
    const at = routes.indexOf('"/api/marketplace/auth/me"');
    const handler = routes.slice(at, at + 2200);
    expect(handler.includes('badgeInfo = await getBadgeForUser(user.id)')).toBe(true);
    expect(handler.includes('badge: badgeInfo?.badge ?? null')).toBe(true);
    expect(handler.includes('badgeProgress: badgeInfo?.progress ?? null')).toBe(true);
    expect(handler.includes('foundingCourtEarnedDate: badgeInfo?.foundingCourtEarnedDate')).toBe(true);
    expect(handler.includes('[Badges] profile badge lookup failed')).toBe(true);
  });
});
