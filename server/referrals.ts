import { storage } from "./storage";
import {
  sendReferralCreditEmail,
  sendReferralFriendCreditEmail,
  sendReferralMilestoneEmail,
} from "./emailClient";

const REFERRAL_CREDIT_FILS = 1500;

// PR4: post-signup referral entry. A user may add a referral code after signing
// up, but only within 30 days of account creation. Exported so route handlers
// and the referral-status endpoint compute the same eligibility window.
export const REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// PR1 (railway-migration): both referrer AND referred friend get 1500 fils
// on the friend's first confirmed payment. Idempotent CAS on referral status.
// Atomic DB work lives in storage so this module stays pure orchestration.
//
// These primitives are DORMANT in PR1 — no trigger calls them yet. PR2 wires
// them into the Ziina webhook, cash-paid PATCH, admin force-confirm, and the
// full-wallet booking path; clawbackReferralForBooking wires into /cancel.

export type CompleteOutcome =
  | {
      applied: true;
      referrerCreditFils: number;
      refereeCreditFils: number;
      refereeWasUnlinked: boolean;
      milestoneAwarded?: 5 | 10;
    }
  | {
      applied: false;
      reason: 'no_referral' | 'not_pending' | 'race' | 'self_referral_blocked';
    };

export type ClawbackOutcome = {
  clawedBack: boolean;
  reason?: 'no_referral' | 'not_completed' | 'race';
  milestoneRevoked?: 5 | 10;
};

// ─────────────────────────────────────────────────────────────────────────
// Post-atomic milestone handling (used by both completion paths).
//
// C-2 rule: a milestone congrats email NEVER sends twice. We track that on
// the player via referralMilestone5Emailed / referralMilestone10Emailed
// (sticky-true once sent). If a clawback drops the count below 5/10, the
// status flag flips off; if a later completion re-crosses the threshold,
// the flag flips back on but the email-sent flag remains true so no second
// email goes out.
// ─────────────────────────────────────────────────────────────────────────

async function handleMilestoneAfterCompletion(
  referrerId: string,
  updatedReferrer: {
    name: string;
    email: string | null;
    leaderboardMention: boolean;
    ambassadorStatus: boolean;
    referralMilestone5Emailed: boolean;
    referralMilestone10Emailed: boolean;
  },
): Promise<5 | 10 | undefined> {
  const completedCount = await storage.getCompletedReferralCount(referrerId);

  // 10 takes precedence so a single completion that crosses both thresholds
  // (e.g. after a backfill) reports the higher milestone.
  if (completedCount >= 10 && !updatedReferrer.ambassadorStatus) {
    const sendEmail = !updatedReferrer.referralMilestone10Emailed;
    await storage.updatePlayer(referrerId, {
      ambassadorStatus: true,
      ...(sendEmail ? { referralMilestone10Emailed: true } : {}),
    });
    if (sendEmail && updatedReferrer.email) {
      sendReferralMilestoneEmail(
        updatedReferrer.email,
        updatedReferrer.name,
        10,
      ).catch(() => {});
    }
    return 10;
  }

  if (completedCount >= 5 && !updatedReferrer.leaderboardMention) {
    const sendEmail = !updatedReferrer.referralMilestone5Emailed;
    await storage.updatePlayer(referrerId, {
      leaderboardMention: true,
      ...(sendEmail ? { referralMilestone5Emailed: true } : {}),
    });
    if (sendEmail && updatedReferrer.email) {
      sendReferralMilestoneEmail(
        updatedReferrer.email,
        updatedReferrer.name,
        5,
      ).catch(() => {});
    }
    return 5;
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared completion flow — called by both the first-payment trigger and the
// admin force-complete endpoint. Calls the atomic storage primitive, then
// fires milestone evaluation + emails outside the transaction.
// ─────────────────────────────────────────────────────────────────────────

async function applyCompletion(params: {
  referralId: string;
  referrerId: string;
  refereeUserId: string;
  refereeLinkedPlayerId: string | null;
  refereeName: string;
  refereeEmail: string;
  triggeringBookingId: string | null;
  completionMethod: 'first_payment' | 'admin' | 'first_payment_revived' | 'admin_revived';
  expectedStatus: 'pending' | 'clawed_back';
}): Promise<CompleteOutcome> {
  const atomic = await storage.applyReferralCompletionAtomic({
    referralId: params.referralId,
    refereeUserId: params.refereeUserId,
    refereeLinkedPlayerId: params.refereeLinkedPlayerId,
    triggeringBookingId: params.triggeringBookingId,
    completionMethod: params.completionMethod,
    creditFils: REFERRAL_CREDIT_FILS,
    expectedStatus: params.expectedStatus,
  });

  if (!atomic.applied) {
    return { applied: false, reason: 'race' };
  }

  const milestoneAwarded = await handleMilestoneAfterCompletion(
    params.referrerId,
    atomic.updatedReferrer as any,
  );

  // Referrer credit email — fire-and-forget.
  if (atomic.updatedReferrer.email) {
    sendReferralCreditEmail(
      atomic.updatedReferrer.email,
      atomic.updatedReferrer.name,
      params.refereeName,
      atomic.updatedReferrer.walletBalance,
    ).catch(() => {});
  }

  // Friend (referee) credit email — fire-and-forget. Sent even when the
  // friend is unlinked: their AED 15 was staged on pendingSignupCreditFils
  // and will land in their wallet the moment they link a player.
  sendReferralFriendCreditEmail(
    params.refereeEmail,
    params.refereeName,
    atomic.updatedReferrer.name,
    REFERRAL_CREDIT_FILS,
  ).catch(() => {});

  return {
    applied: true,
    referrerCreditFils: REFERRAL_CREDIT_FILS,
    refereeCreditFils: REFERRAL_CREDIT_FILS,
    refereeWasUnlinked: atomic.refereeWasUnlinked,
    milestoneAwarded,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: first-payment trigger (the PR2 wiring target).
// ─────────────────────────────────────────────────────────────────────────

export async function completeReferralOnPayment(
  refereeUserId: string,
  triggeringBookingId: string,
): Promise<CompleteOutcome> {
  const referral = await storage.getReferralByRefereeUserId(refereeUserId);
  if (!referral) return { applied: false, reason: 'no_referral' };
  // Revival (2026-07-10): clawed_back is no longer terminal. A referee who
  // cancelled (clawback reversed both credits) and later completes a genuine
  // qualifying booking earns the reward again — the clawback exists to stop
  // cancel-refund gaming, not to punish someone who came back.
  if (referral.status !== 'pending' && referral.status !== 'clawed_back') {
    return { applied: false, reason: 'not_pending' };
  }

  const refereeUser = await storage.getMarketplaceUser(refereeUserId);
  if (!refereeUser) return { applied: false, reason: 'no_referral' };

  // Defense in depth: signup also blocks this, but a self-referral path
  // could still exist via post-signup /referrals/link if the user later
  // linked the referrer's player. Block at completion too.
  if (
    refereeUser.linkedPlayerId &&
    refereeUser.linkedPlayerId === referral.referrerId
  ) {
    return { applied: false, reason: 'self_referral_blocked' };
  }

  const reviving = referral.status === 'clawed_back';
  return await applyCompletion({
    referralId: referral.id,
    referrerId: referral.referrerId,
    refereeUserId,
    refereeLinkedPlayerId: refereeUser.linkedPlayerId,
    refereeName: refereeUser.name,
    refereeEmail: refereeUser.email,
    triggeringBookingId,
    completionMethod: reviving ? 'first_payment_revived' : 'first_payment',
    expectedStatus: reviving ? 'clawed_back' : 'pending',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: post-signup referral linking (PR4). A user adds a referral code
// after signing up — from the Dashboard nudge or the Profile field. Enforces
// the same rules as the signup path (one referral per user, no self-referral)
// plus the 30-day window. On success, if the user already has a confirmed
// booking (decision E backfill — e.g. they paid on day 5 and add the code on
// day 10), the first-payment trigger is fired immediately so credit lands now.
// ─────────────────────────────────────────────────────────────────────────

export type LinkOutcome =
  | { ok: true; referralId: string; backfilled: boolean; backfillBookingId?: string }
  | {
      ok: false;
      code: 'ALREADY_LINKED' | 'WINDOW_CLOSED' | 'INVALID_CODE' | 'SELF_REFERRAL' | 'USER_NOT_FOUND';
    };

export async function linkReferralPostSignup(params: {
  userId: string;
  referralCode: string;
}): Promise<LinkOutcome> {
  const { userId, referralCode } = params;

  const user = await storage.getMarketplaceUser(userId);
  if (!user) return { ok: false, code: 'USER_NOT_FOUND' };

  // One referral per user — mirrors the signup path and the link route's 409.
  const existing = await storage.getReferralByRefereeUserId(userId);
  if (existing) return { ok: false, code: 'ALREADY_LINKED' };

  // 30-day window from account creation.
  const createdAtMs = new Date(user.createdAt).getTime();
  if (Date.now() > createdAtMs + REFERRAL_WINDOW_MS) {
    return { ok: false, code: 'WINDOW_CLOSED' };
  }

  const referrer = await storage.getPlayerByReferralCode(referralCode.toUpperCase());
  if (!referrer) return { ok: false, code: 'INVALID_CODE' };

  // Self-referral block — also enforced again at completion time.
  if (user.linkedPlayerId && user.linkedPlayerId === referrer.id) {
    return { ok: false, code: 'SELF_REFERRAL' };
  }

  const referral = await storage.createReferral({
    referrerId: referrer.id,
    refereeUserId: userId,
    refereePlayerId: user.linkedPlayerId ?? null,
    status: 'pending',
  });

  // Backfill (decision E): if the user already has a confirmed/attended
  // booking, the first-payment trigger has effectively already happened. Fire
  // the completion now against the earliest qualifying booking so the credit
  // lands immediately. completeReferralOnPayment is idempotent (pending→
  // completed CAS), so this is safe.
  let backfilled = false;
  let backfillBookingId: string | undefined;
  const earliest = await storage.getEarliestConfirmedBookingForUser(userId);
  if (earliest) {
    const outcome = await completeReferralOnPayment(userId, earliest.id);
    if (outcome.applied) {
      backfilled = true;
      backfillBookingId = earliest.id;
    }
  }

  return { ok: true, referralId: referral.id, backfilled, backfillBookingId };
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: admin force-complete (existing endpoint at routes.ts:3699). Now
// credits both sides via the shared primitive. Marked completionMethod='admin'
// (or 'admin_revived' when reviving a clawed_back row). triggeringBookingId
// defaults to null (cancel never claws back); pass the real qualifying
// booking id to keep the clawback story intact for that booking.
// ─────────────────────────────────────────────────────────────────────────

export async function completeReferral(
  referralId: string,
  // Optional: ties the admin completion to the real qualifying booking so the
  // ledger/clawback story stays truthful (a cancel of that booking can claw
  // this back). Omitted → null, preserving the original admin semantics.
  triggeringBookingId: string | null = null,
): Promise<{ success: boolean; error?: string }> {
  const referral = await storage.getReferral(referralId);
  if (!referral) return { success: false, error: 'Referral not found' };
  // Admin may also revive a clawed_back referral — admin action is deliberate.
  if (referral.status !== 'pending' && referral.status !== 'clawed_back') {
    return { success: false, error: 'Referral already processed' };
  }

  const refereeUser = await storage.getMarketplaceUser(referral.refereeUserId);
  if (!refereeUser) {
    return { success: false, error: 'Referee user not found' };
  }

  const reviving = referral.status === 'clawed_back';
  const outcome = await applyCompletion({
    referralId: referral.id,
    referrerId: referral.referrerId,
    refereeUserId: referral.refereeUserId,
    refereeLinkedPlayerId: refereeUser.linkedPlayerId,
    refereeName: refereeUser.name,
    refereeEmail: refereeUser.email,
    triggeringBookingId,
    completionMethod: reviving ? 'admin_revived' : 'admin',
    expectedStatus: reviving ? 'clawed_back' : 'pending',
  });

  if (!outcome.applied) {
    return {
      success: false,
      error:
        outcome.reason === 'race'
          ? 'Referral already completed (race)'
          : outcome.reason,
    };
  }
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: clawback (the PR2 wiring target on the /cancel non-late-fee path).
//
// Strict milestone revoke (silent — no email). Re-crossing the threshold
// later flips the status flag back on without re-sending the email
// (handleMilestoneAfterCompletion honors the sticky email flag).
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// PR2 wiring helpers — fire-and-forget wrappers used by every payment-
// confirmation and cancel call site. Internal try/catch guarantees a
// referral failure never breaks the surrounding payment / booking flow.
// Both helpers are async (so tests can await them) but they NEVER reject —
// callers should invoke them without `await` for true fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────

export async function fireReferralOnPayment(
  userId: string,
  bookingId: string,
): Promise<void> {
  try {
    const outcome = await completeReferralOnPayment(userId, bookingId);
    if (outcome.applied) {
      console.log(
        `[Referral] Completed on payment: user=${userId} booking=${bookingId}` +
          (outcome.milestoneAwarded ? ` milestone=${outcome.milestoneAwarded}` : '') +
          (outcome.refereeWasUnlinked ? ' (referee unlinked — credit staged)' : ''),
      );
    } else if (outcome.reason !== 'no_referral' && outcome.reason !== 'not_pending') {
      // 'no_referral' and 'not_pending' are the common quiet cases: the user
      // wasn't referred, or their referral already completed on an earlier
      // booking. Log the non-trivial bail reasons (race, self-referral) for
      // visibility.
      console.log(
        `[Referral] Not applied on payment: user=${userId} booking=${bookingId} reason=${outcome.reason}`,
      );
    }
  } catch (err) {
    console.error('[Referral] fireReferralOnPayment failed:', err);
  }
}

export async function fireReferralClawback(bookingId: string): Promise<void> {
  try {
    const outcome = await clawbackReferralForBooking(bookingId);
    if (outcome.clawedBack) {
      console.log(
        `[Referral] Clawed back on cancel: booking=${bookingId}` +
          (outcome.milestoneRevoked ? ` milestoneRevoked=${outcome.milestoneRevoked}` : ''),
      );
    }
    // Silent skip for 'no_referral' / 'not_completed' — booking cancels
    // that did not trigger a referral (the overwhelming majority) are not
    // worth logging.
  } catch (err) {
    console.error('[Referral] fireReferralClawback failed:', err);
  }
}

export async function clawbackReferralForBooking(
  bookingId: string,
): Promise<ClawbackOutcome> {
  const referral = await storage.findCompletedReferralForBooking(bookingId);
  if (!referral) return { clawedBack: false, reason: 'no_referral' };
  if (referral.status !== 'completed') {
    return { clawedBack: false, reason: 'not_completed' };
  }

  const atomic = await storage.applyReferralClawbackAtomic({
    referralId: referral.id,
    referrerId: referral.referrerId,
    refereePlayerId: referral.refereePlayerId,
    refereeUserId: referral.refereeUserId,
    creditFils: REFERRAL_CREDIT_FILS,
  });

  if (!atomic.clawedBack) {
    return { clawedBack: false, reason: 'race' };
  }

  // Strict milestone re-evaluation. Look up the referrer's current state
  // and unset whichever flags the new (lower) count no longer earns.
  const referrer = await storage.getPlayer(referral.referrerId);
  let milestoneRevoked: 5 | 10 | undefined;
  if (referrer) {
    const completedCount = await storage.getCompletedReferralCount(referral.referrerId);
    if (completedCount < 10 && referrer.ambassadorStatus) {
      await storage.updatePlayer(referral.referrerId, { ambassadorStatus: false });
      milestoneRevoked = 10;
    }
    if (completedCount < 5 && referrer.leaderboardMention) {
      await storage.updatePlayer(referral.referrerId, { leaderboardMention: false });
      milestoneRevoked = milestoneRevoked ?? 5;
    }
  }

  return { clawedBack: true, milestoneRevoked };
}
