import { describe, it, expect } from 'vitest';
import {
  canApplyReferralCode,
  REFERRAL_APPLY_WINDOW_DAYS,
  REFERRAL_APPLY_WINDOW_MS,
  REFERRAL_WINDOW_EXPIRED_MESSAGE,
  linkReferralForUser,
  type LinkReferralStorage,
} from '../server/referralPolicy';
import type { MarketplaceUser, Player, Referral, InsertReferral } from '../shared/schema';

describe('referral apply window — canApplyReferralCode', () => {
  const NOW = new Date('2026-04-29T12:00:00.000Z');

  it('allows applying immediately after signup', () => {
    expect(canApplyReferralCode(NOW, NOW)).toBe(true);
  });

  it('allows applying one minute before the boundary (in-window)', () => {
    const createdAt = new Date(NOW.getTime() - REFERRAL_APPLY_WINDOW_MS + 60_000);
    expect(canApplyReferralCode(createdAt, NOW)).toBe(true);
  });

  it('allows applying exactly on the boundary (inclusive)', () => {
    const createdAt = new Date(NOW.getTime() - REFERRAL_APPLY_WINDOW_MS);
    expect(canApplyReferralCode(createdAt, NOW)).toBe(true);
  });

  it('rejects applying one minute past the boundary (out-of-window)', () => {
    const createdAt = new Date(NOW.getTime() - REFERRAL_APPLY_WINDOW_MS - 60_000);
    expect(canApplyReferralCode(createdAt, NOW)).toBe(false);
  });

  it('rejects long-dormant accounts (e.g. 2 years old)', () => {
    const twoYearsAgo = new Date(NOW.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    expect(canApplyReferralCode(twoYearsAgo, NOW)).toBe(false);
  });

  it('rejects createdAt timestamps in the future (clock-skew safety)', () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(canApplyReferralCode(future, NOW)).toBe(false);
  });

  it('exposes the documented 30-day constant', () => {
    expect(REFERRAL_APPLY_WINDOW_DAYS).toBe(30);
  });

  it('exposes a user-facing message that names the window', () => {
    expect(REFERRAL_WINDOW_EXPIRED_MESSAGE).toBe(
      'Referral codes can only be applied within 30 days of signup.'
    );
  });
});

// ─── Route-level: linkReferralForUser is the unit POST /api/referrals/link ───
// invokes (the route handler is now a thin status-code adapter around it).
// Locks the in-window vs out-of-window contract end-to-end through the same
// code path the API uses.

function makeUser(overrides: Partial<MarketplaceUser> = {}): MarketplaceUser {
  return {
    id: 'user-1',
    email: 'me@example.com',
    passwordHash: null,
    name: 'Test User',
    phone: null,
    linkedPlayerId: null,
    role: 'player',
    createdAt: new Date('2026-04-29T12:00:00.000Z'),
    lastLoginAt: null,
    resetToken: null,
    resetTokenExpiry: null,
    googleId: null,
    pendingSignupCreditFils: 0,
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiry: null,
    photoUrl: null,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-referrer',
    shuttleIqId: 1,
    name: 'Ahmed',
    referralCode: 'SIQ-AHMED0-00001',
    walletBalance: 0,
    ambassadorStatus: false,
    jerseyDispatched: false,
    leaderboardMention: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as unknown as Player;
}

function makeStorage(opts: {
  user: MarketplaceUser | undefined;
  referrer?: Player | undefined;
  existingReferral?: Referral | undefined;
}): LinkReferralStorage & { created: InsertReferral[] } {
  const created: InsertReferral[] = [];
  return {
    created,
    async getReferralByRefereeUserId() {
      return opts.existingReferral;
    },
    async getMarketplaceUser() {
      return opts.user;
    },
    async getPlayerByReferralCode() {
      return opts.referrer;
    },
    async createReferral(input: InsertReferral) {
      created.push(input);
      return {
        id: 'referral-new',
        referrerId: input.referrerId,
        refereeUserId: input.refereeUserId,
        refereePlayerId: input.refereePlayerId ?? null,
        status: input.status ?? 'pending',
        createdAt: new Date(),
        completedAt: null,
      } as unknown as Referral;
    },
  };
}

describe('referral apply window — linkReferralForUser (route logic)', () => {
  const NOW = new Date('2026-04-29T12:00:00.000Z');

  it('creates the referral when the user is in-window (1 day after signup)', async () => {
    const user = makeUser({
      createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    const storage = makeStorage({ user, referrer: makePlayer() });

    const result = await linkReferralForUser(storage, {
      userId: user.id,
      referralCode: 'SIQ-AHMED0-00001',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.referral.referrerId).toBe('player-referrer');
      expect(result.referral.refereeUserId).toBe('user-1');
    }
    expect(storage.created).toHaveLength(1);
  });

  it('creates the referral on the exact 30-day boundary (inclusive)', async () => {
    const user = makeUser({
      createdAt: new Date(NOW.getTime() - REFERRAL_APPLY_WINDOW_MS),
    });
    const storage = makeStorage({ user, referrer: makePlayer() });

    const result = await linkReferralForUser(storage, {
      userId: user.id,
      referralCode: 'SIQ-AHMED0-00001',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(storage.created).toHaveLength(1);
  });

  it('returns 403 with the documented message when out-of-window (31 days)', async () => {
    const user = makeUser({
      createdAt: new Date(NOW.getTime() - REFERRAL_APPLY_WINDOW_MS - 24 * 60 * 60 * 1000),
    });
    const storage = makeStorage({ user, referrer: makePlayer() });

    const result = await linkReferralForUser(storage, {
      userId: user.id,
      referralCode: 'SIQ-AHMED0-00001',
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe(REFERRAL_WINDOW_EXPIRED_MESSAGE);
    }
    // Critically: no referral row was created for the stale account.
    expect(storage.created).toHaveLength(0);
  });

  it('still rejects already-used codes with 409 (window check does not bypass other guards)', async () => {
    const user = makeUser({
      createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    const storage = makeStorage({
      user,
      referrer: makePlayer(),
      existingReferral: { id: 'r-existing' } as unknown as Referral,
    });

    const result = await linkReferralForUser(storage, {
      userId: user.id,
      referralCode: 'SIQ-AHMED0-00001',
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it('still rejects self-referral with 400 even when in-window', async () => {
    const referrer = makePlayer({ id: 'player-self' });
    const user = makeUser({
      createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
      linkedPlayerId: 'player-self',
    });
    const storage = makeStorage({ user, referrer });

    const result = await linkReferralForUser(storage, {
      userId: user.id,
      referralCode: 'SIQ-AHMED0-00001',
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe('You cannot refer yourself');
    }
  });
});
