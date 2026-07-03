import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { isTokenStale } from '../server/portal/portalAuth';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

describe('change-password schema — min 12 chars', () => {
  it('rejects short new passwords; accepts 12+', async () => {
    const { changePasswordSchema } = await import('../server/portal/portalRoutes');
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short11chars' }).success).toBe(true); // exactly 12
    const bad = changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'elevenchars' }); // 11
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toMatch(/12 characters/);
    expect(changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'long-enough-pw' }).success).toBe(false);
  });
});

describe('performPasswordChange — verify current, hash new with the existing algorithm', () => {
  it('wrong current password is rejected; nothing produced', async () => {
    const { performPasswordChange } = await import('../server/portal/portalRoutes');
    const hash = await bcrypt.hash('the-real-password', 10);
    const r = await performPasswordChange(hash, 'not-the-password', 'a-new-long-password');
    expect(r).toEqual({ error: 'Current password is incorrect.' });
  });

  it('correct current → new bcrypt cost-10 hash that verifies; old password stops verifying', async () => {
    const { performPasswordChange } = await import('../server/portal/portalRoutes');
    const oldHash = await bcrypt.hash('the-real-password', 10);
    const r = await performPasswordChange(oldHash, 'the-real-password', 'brand-new-password!');
    if ('error' in r) throw new Error('unexpected rejection');
    expect(r.newHash).not.toBe(oldHash);
    expect(r.newHash.split('$')[2]).toBe('10'); // same cost factor as every existing hash
    expect(await bcrypt.compare('brand-new-password!', r.newHash)).toBe(true);
    expect(await bcrypt.compare('the-real-password', r.newHash)).toBe(false);
    expect(Math.abs(r.changedAt.getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('isTokenStale — token invalidation on password change', () => {
  const t0 = new Date('2026-07-03T12:00:00Z');
  it('never-changed password (NULL) invalidates nothing', () => {
    expect(isTokenStale(Math.floor(t0.getTime() / 1000), null)).toBe(false);
  });
  it('a token issued BEFORE the change is stale; issued AFTER is fresh', () => {
    const beforeIat = Math.floor((t0.getTime() - 3600e3) / 1000); // 1h before
    const afterIat = Math.floor((t0.getTime() + 60e3) / 1000);    // 1min after
    expect(isTokenStale(beforeIat, t0)).toBe(true);
    expect(isTokenStale(afterIat, t0)).toBe(false);
  });
  it('a token with no iat cannot prove freshness → stale once a change exists', () => {
    expect(isTokenStale(undefined, t0)).toBe(true);
    expect(isTokenStale(undefined, null)).toBe(false);
  });
});
