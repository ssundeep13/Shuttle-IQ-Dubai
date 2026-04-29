import type { MarketplaceUser, Player, Referral, InsertReferral } from "@shared/schema";

// Window (in days) within which a marketplace user can apply a friend's
// referral code after their account was created. Outside this window, the
// post-signup "Apply referral code" entry point is hidden in the UI and the
// `POST /api/referrals/link` endpoint rejects the request. Tune here.
export const REFERRAL_APPLY_WINDOW_DAYS = 30;

export const REFERRAL_APPLY_WINDOW_MS =
  REFERRAL_APPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const REFERRAL_WINDOW_EXPIRED_MESSAGE =
  `Referral codes can only be applied within ${REFERRAL_APPLY_WINDOW_DAYS} days of signup.`;

/**
 * Returns true when `now` is within REFERRAL_APPLY_WINDOW_DAYS of `createdAt`
 * (inclusive of the boundary). Defaults `now` to the current time so callers
 * in route handlers can omit it; tests pass an explicit clock.
 */
export function canApplyReferralCode(createdAt: Date, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - createdAt.getTime();
  return elapsed >= 0 && elapsed <= REFERRAL_APPLY_WINDOW_MS;
}

// ─── linkReferralForUser ─────────────────────────────────────────────────────
// Pulled out of POST /api/referrals/link so it can be exercised in unit/route
// tests without spinning up Express + DB. The route handler is now a thin
// adapter around this function.

export type LinkReferralStorage = {
  getReferralByRefereeUserId(userId: string): Promise<Referral | undefined>;
  getMarketplaceUser(id: string): Promise<MarketplaceUser | undefined>;
  getPlayerByReferralCode(code: string): Promise<Player | undefined>;
  createReferral(input: InsertReferral): Promise<Referral>;
};

export type LinkReferralResult =
  | { ok: true; referral: Referral }
  | { ok: false; status: number; error: string };

export async function linkReferralForUser(
  storage: LinkReferralStorage,
  input: { userId: string; referralCode: string; now?: Date }
): Promise<LinkReferralResult> {
  const { userId, referralCode } = input;
  const now = input.now ?? new Date();

  const existing = await storage.getReferralByRefereeUserId(userId);
  if (existing) {
    return { ok: false, status: 409, error: 'You have already used a referral code' };
  }

  const user = await storage.getMarketplaceUser(userId);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  // Stale-account guard: only allow applying a code within
  // REFERRAL_APPLY_WINDOW_DAYS of signup so a long-dormant account can't
  // suddenly attribute itself to a freshly created "referrer".
  if (!canApplyReferralCode(user.createdAt, now)) {
    return { ok: false, status: 403, error: REFERRAL_WINDOW_EXPIRED_MESSAGE };
  }

  const referrer = await storage.getPlayerByReferralCode(referralCode.toUpperCase());
  if (!referrer) {
    return { ok: false, status: 404, error: 'Invalid referral code' };
  }

  if (user.linkedPlayerId === referrer.id) {
    return { ok: false, status: 400, error: 'You cannot refer yourself' };
  }

  const referral = await storage.createReferral({
    referrerId: referrer.id,
    refereeUserId: userId,
    refereePlayerId: user.linkedPlayerId ?? null,
    status: 'pending',
  });

  return { ok: true, referral };
}
