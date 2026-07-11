import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// auth/utils throws at import when JWT secrets are unset — the middleware
// only needs verifyAccessToken for requireAuth, which these tests don't hit.
vi.mock('../server/auth/utils', () => ({ verifyAccessToken: vi.fn() }));

import { requireAdmin, requireCaptain, requireSuperAdmin } from '../server/auth/middleware';

// Gate C2 — captain role. requireAdmin stays the default guard and rejects
// captains, so every endpoint NOT explicitly re-tagged with requireCaptain is
// closed to captains by construction (default-deny).

const call = (mw: any, role: string | null) => {
  const req: any = role ? { user: { userId: 'u', email: 'e', role } } : {};
  let status = 0;
  const res: any = { status: (s: number) => { status = s; return { json: () => {} }; } };
  const next = vi.fn();
  mw(req, res, next);
  return { allowed: next.mock.calls.length === 1, status };
};

describe('captain role - middleware matrix', () => {
  it('requireCaptain: captain, admin, super_admin pass; others rejected', () => {
    expect(call(requireCaptain, 'captain').allowed).toBe(true);
    expect(call(requireCaptain, 'admin').allowed).toBe(true);
    expect(call(requireCaptain, 'super_admin').allowed).toBe(true);
    expect(call(requireCaptain, 'marketplace_player')).toEqual({ allowed: false, status: 403 });
    expect(call(requireCaptain, null)).toEqual({ allowed: false, status: 401 });
  });

  it('requireAdmin REJECTS captains — the default-deny linchpin', () => {
    expect(call(requireAdmin, 'captain')).toEqual({ allowed: false, status: 403 });
    expect(call(requireAdmin, 'admin').allowed).toBe(true);
    expect(call(requireAdmin, 'super_admin').allowed).toBe(true);
  });

  it('requireSuperAdmin rejects captains and admins', () => {
    expect(call(requireSuperAdmin, 'captain').allowed).toBe(false);
    expect(call(requireSuperAdmin, 'admin').allowed).toBe(false);
    expect(call(requireSuperAdmin, 'super_admin').allowed).toBe(true);
  });
});

describe('captain role - allow-list tripwires', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

  it('requireAdmin source never accepts captain (code, not comments)', () => {
    const src = read('server/auth/middleware.ts');
    const adminFn = src.slice(src.indexOf('export function requireAdmin'), src.indexOf('export function requireCaptain'));
    const codeOnly = adminFn.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly.includes("'captain'"), 'requireAdmin must not accept captain').toBe(false);
  });

  it('the captain allow-list is exactly the audited 34 endpoints — additions must be deliberate', () => {
    const counts: Record<string, number> = {
      'server/routes.ts': 30,
      'server/marketplace-routes.ts': 1,
      'server/sessionCostRoutes.ts': 2,
      'server/venueRoutes.ts': 1,
    };
    for (const [file, expected] of Object.entries(counts)) {
      // Route registrations only — import lines also contain the token pair.
      const uses = (read(file).match(/app\.(get|post|patch|delete|put)\([^;]*?requireAuth, requireCaptain/g) ?? []).length;
      expect(uses, `${file}: captain-tagged endpoint count changed — re-audit the allow-list`).toBe(expected);
    }
  });

  it('the admin tab bar has ONE source of truth — no hardcoded TabsTrigger can bypass the captain filter', () => {
    // The C1 render check caught the desktop TabsList hardcoding all tabs
    // while only the mobile drawer used the role-filtered tabConfig.
    const src = read('client/src/pages/SessionsManagement.tsx');
    const hardcoded = src.match(/<TabsTrigger value="/g) ?? [];
    expect(hardcoded.length, 'render admin tabs only via tabConfig.map').toBe(0);
    expect(src.includes('tabConfig.map')).toBe(true);
  });

  it('the forbidden surfaces still carry requireAdmin (or stricter)', () => {
    const routes = read('server/routes.ts');
    const mkt = read('server/marketplace-routes.ts');
    const venue = read('server/venueRoutes.ts');
    const stillAdmin = (src: string, sig: string) => {
      const at = src.indexOf(sig);
      expect(at, `${sig} not found`).toBeGreaterThan(-1);
      const line = src.slice(at, at + sig.length + 80);
      expect(/requireAdmin|requireSuperAdmin/.test(line), `${sig} lost its admin guard`).toBe(true);
      expect(line.includes('requireCaptain'), `${sig} must NOT be captain-accessible`).toBe(false);
    };
    stillAdmin(routes, '"/api/admin/players/:survivorId/merge/:absorbedId"');
    stillAdmin(routes, '"/api/admin/player-merges/:logId/undo"');
    stillAdmin(routes, '"/api/admin/recalculate-player-stats"');
    stillAdmin(routes, 'app.delete("/api/players/:id"');
    stillAdmin(routes, '"/api/players/import"');
    stillAdmin(routes, 'app.delete("/api/sessions/:id"');
    stillAdmin(routes, 'app.delete("/api/game-history"');
    stillAdmin(routes, "'/api/referrals/all'");
    stillAdmin(routes, "'/api/referrals/:id/complete'");
    stillAdmin(mkt, '"/api/marketplace/admin/link-player"');
    stillAdmin(mkt, 'refunds/:notificationId/process');
    stillAdmin(venue, 'app.post("/api/venues"');
  });
});
