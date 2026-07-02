import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { shouldBlockCrossHost, isPortalHost } from '../server/portal/hostGate';

// Set BOTH secrets before any dynamic import of the portal token module (it reads
// PORTAL_JWT_SECRET at load). These are throwaway test values.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = 'test-portal-secret';

const PORTAL = 'finance.shuttleiq.ai';
const MAIN = 'shuttleiq.ai';

describe('host wall (Phase 2) — the portal is unreachable from main paths and vice versa', () => {
  it('isPortalHost matches only the finance subdomain, case-insensitively', () => {
    expect(isPortalHost('finance.shuttleiq.ai')).toBe(true);
    expect(isPortalHost('FINANCE.ShuttleIQ.ai')).toBe(true);
    expect(isPortalHost('shuttleiq.ai')).toBe(false);
    expect(isPortalHost(undefined)).toBe(false);
  });

  it('/api/health is exempt on every host (Railway healthcheck must pass)', () => {
    expect(shouldBlockCrossHost(PORTAL, '/api/health')).toBe(false);
    expect(shouldBlockCrossHost(MAIN, '/api/health')).toBe(false);
  });

  it('on the PORTAL host: main-app APIs + uploads are 404, portal API + SPA pass', () => {
    expect(shouldBlockCrossHost(PORTAL, '/api/finance/summary')).toBe(true);   // main route on portal host → 404
    expect(shouldBlockCrossHost(PORTAL, '/api/marketplace/sessions')).toBe(true);
    expect(shouldBlockCrossHost(PORTAL, '/uploads/x.png')).toBe(true);
    expect(shouldBlockCrossHost(PORTAL, '/api/portal/auth/login')).toBe(false); // portal API allowed
    expect(shouldBlockCrossHost(PORTAL, '/api/portal/finance/summary')).toBe(false);
    expect(shouldBlockCrossHost(PORTAL, '/')).toBe(false);                      // SPA
    expect(shouldBlockCrossHost(PORTAL, '/assets/index-abc.js')).toBe(false);   // asset
  });

  it('on a MAIN host: portal APIs are 404, main routes pass', () => {
    expect(shouldBlockCrossHost(MAIN, '/api/portal/auth/login')).toBe(true);    // portal route on main host → 404
    expect(shouldBlockCrossHost(MAIN, '/api/portal/finance/summary')).toBe(true);
    expect(shouldBlockCrossHost(MAIN, '/api/finance/summary')).toBe(false);     // main app unchanged
    expect(shouldBlockCrossHost(MAIN, '/api/marketplace/sessions')).toBe(false);
    expect(shouldBlockCrossHost(MAIN, '/')).toBe(false);
  });
});

describe('token wall (Phase 2) — portal and main-app JWTs are mutually unverifiable', () => {
  it('a main-app JWT does NOT verify as a portal token', async () => {
    const { verifyPortalToken } = await import('../server/portal/portalAuth');
    const mainToken = jwt.sign(
      { userId: 'u1', email: 'a@b.co', role: 'super_admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '4h' },
    );
    expect(verifyPortalToken(mainToken)).toBeNull(); // wrong secret → 401 at the guard
  });

  it('a portal JWT does NOT verify with the main-app secret, but does with the portal verifier', async () => {
    const { signPortalToken, verifyPortalToken } = await import('../server/portal/portalAuth');
    const portalToken = signPortalToken({ portalUserId: 'p1', email: 'a@b.co' });
    // The main app verifies with JWT_SECRET — the portal token fails there.
    expect(() => jwt.verify(portalToken, process.env.JWT_SECRET!)).toThrow();
    // The portal verifier accepts its own token and exposes the identity + aud.
    const decoded = verifyPortalToken(portalToken);
    expect(decoded?.portalUserId).toBe('p1');
    expect(decoded?.email).toBe('a@b.co');
    expect(decoded?.aud).toBe('portal');
  });
});

describe('fail-closed (Phase 2) — no PORTAL_JWT_SECRET means login cannot succeed', () => {
  it('with the secret unset: not configured, signing throws, verification returns null', async () => {
    vi.resetModules();
    const saved = process.env.PORTAL_JWT_SECRET;
    delete process.env.PORTAL_JWT_SECRET;
    try {
      const mod = await import('../server/portal/portalAuth');
      expect(mod.isPortalConfigured()).toBe(false);       // login route → 500 "not configured"
      expect(mod.verifyPortalToken('anything.at.all')).toBeNull();
      expect(() => mod.signPortalToken({ portalUserId: 'x', email: 'y@z.co' })).toThrow();
    } finally {
      process.env.PORTAL_JWT_SECRET = saved;
      vi.resetModules();
    }
  });
});
