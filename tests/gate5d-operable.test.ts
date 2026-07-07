import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Gate 5d — the single "may matchmaking operate on this session" predicate,
// shared by tryAutoMatchmaking and tryQueuedBuildForSession. It mirrors the
// admin UI's enablement rule: the ACTIVE session, or ANY sandbox session
// (owners run sandbox tests as status='upcoming' so they never collide with
// the one-active-session constraint — the live incident this pins).

describe('isSessionOperable — matchmaking mirrors what the admin UI lets you operate', () => {
  it('active real session → operable', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable({ status: 'active', isSandbox: false })).toBe(true);
  });

  it('UPCOMING real session → NOT operable (UI renders it read-only)', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable({ status: 'upcoming', isSandbox: false })).toBe(false);
  });

  it('draft / ended real sessions → NOT operable', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable({ status: 'draft', isSandbox: false })).toBe(false);
    expect(isSessionOperable({ status: 'ended', isSandbox: false })).toBe(false);
  });

  it('UPCOMING sandbox session → operable (the owner-incident case)', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable({ status: 'upcoming', isSandbox: true })).toBe(true);
  });

  it('active sandbox session → operable (the smoke-test shape)', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable({ status: 'active', isSandbox: true })).toBe(true);
  });

  it('missing session → NOT operable', async () => {
    const { isSessionOperable } = await import('../server/auto-matchmaking');
    expect(isSessionOperable(undefined)).toBe(false);
  });
});
