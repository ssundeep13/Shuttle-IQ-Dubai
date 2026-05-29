/**
 * PR1 primitive tests — verify orchestration of completeReferralOnPayment,
 * clawbackReferralForBooking, and the updated completeReferral (admin path).
 *
 * The atomic DB work lives inside storage methods so these tests can mock
 * storage cleanly without wrestling with db.transaction chains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Short-circuit the db module so importing server/referrals doesn't try to
// open a real DB connection — these tests only exercise orchestration.
vi.mock('../server/db', () => ({ db: {} }));

vi.mock('../server/storage', () => ({
  storage: {
    getReferralByRefereeUserId: vi.fn(),
    getMarketplaceUser: vi.fn(),
    getReferral: vi.fn(),
    getPlayer: vi.fn(),
    getPlayerByReferralCode: vi.fn(),
    createReferral: vi.fn(),
    getEarliestConfirmedBookingForUser: vi.fn(),
    getCompletedReferralCount: vi.fn(),
    updatePlayer: vi.fn(),
    applyReferralCompletionAtomic: vi.fn(),
    findCompletedReferralForBooking: vi.fn(),
    applyReferralClawbackAtomic: vi.fn(),
  },
}));

vi.mock('../server/emailClient', () => ({
  // Async fns — return resolved promises so `.catch(...)` chains in the
  // primitive work in tests.
  sendReferralCreditEmail: vi.fn().mockResolvedValue(undefined),
  sendReferralMilestoneEmail: vi.fn().mockResolvedValue(undefined),
  sendReferralFriendCreditEmail: vi.fn().mockResolvedValue(undefined),
}));

import { storage } from '../server/storage';
import * as email from '../server/emailClient';
import {
  completeReferralOnPayment,
  clawbackReferralForBooking,
  completeReferral,
  fireReferralOnPayment,
  fireReferralClawback,
  linkReferralPostSignup,
  REFERRAL_WINDOW_MS,
} from '../server/referrals';

const REFERRER = {
  id: 'player-referrer',
  name: 'Ahmed',
  email: 'ahmed@example.com',
  walletBalance: 1500,
  leaderboardMention: false,
  ambassadorStatus: false,
  referralMilestone5Emailed: false,
  referralMilestone10Emailed: false,
} as any;

const REFEREE_USER_LINKED = {
  id: 'mp-user-friend',
  name: 'Bilal',
  email: 'bilal@example.com',
  linkedPlayerId: 'player-friend',
} as any;

const REFEREE_USER_UNLINKED = {
  id: 'mp-user-friend',
  name: 'Bilal',
  email: 'bilal@example.com',
  linkedPlayerId: null,
} as any;

const PENDING_REFERRAL = {
  id: 'ref-1',
  referrerId: 'player-referrer',
  refereeUserId: 'mp-user-friend',
  refereePlayerId: 'player-friend',
  status: 'pending',
  completedAt: null,
  triggeringBookingId: null,
  completionMethod: null,
  clawedBackAt: null,
  createdAt: new Date(),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// completeReferralOnPayment — bail cases (no atomic work)
// ─────────────────────────────────────────────────────────────────────

describe('completeReferralOnPayment — bail cases', () => {
  it('returns applied:false / reason:"no_referral" when the user has no referral row', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('no_referral');
    expect(storage.applyReferralCompletionAtomic).not.toHaveBeenCalled();
  });

  it('returns applied:false / reason:"not_pending" when the referral is already completed', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue({ ...PENDING_REFERRAL, status: 'completed' });

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('not_pending');
    expect(storage.applyReferralCompletionAtomic).not.toHaveBeenCalled();
  });

  it('returns applied:false / reason:"not_pending" when the referral is clawed_back', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue({ ...PENDING_REFERRAL, status: 'clawed_back' });

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('not_pending');
  });

  it('blocks a self-referral when refereeUser.linkedPlayerId equals referrerId', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue({ ...REFEREE_USER_LINKED, linkedPlayerId: 'player-referrer' });

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('self_referral_blocked');
    expect(storage.applyReferralCompletionAtomic).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// completeReferralOnPayment — happy paths
// ─────────────────────────────────────────────────────────────────────

describe('completeReferralOnPayment — happy paths', () => {
  it('credits both wallets and stamps triggeringBookingId on a linked referee', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: REFERRER,
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(1);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.referrerCreditFils).toBe(1500);
      expect(result.refereeCreditFils).toBe(1500);
      expect(result.refereeWasUnlinked).toBe(false);
    }
    expect(storage.applyReferralCompletionAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        referralId: 'ref-1',
        triggeringBookingId: 'booking-1',
        completionMethod: 'first_payment',
        creditFils: 1500,
      }),
    );
    expect(email.sendReferralCreditEmail).toHaveBeenCalledTimes(1);
    expect(email.sendReferralFriendCreditEmail).toHaveBeenCalledTimes(1);
    expect(email.sendReferralMilestoneEmail).not.toHaveBeenCalled();
  });

  it('flags refereeWasUnlinked when the friend has no linked player', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_UNLINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: REFERRER,
      refereeWasUnlinked: true,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(1);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(true);
    if (result.applied) expect(result.refereeWasUnlinked).toBe(true);
    expect(email.sendReferralFriendCreditEmail).toHaveBeenCalledTimes(1); // still email the friend
  });

  it('treats a CAS race (applied:false from atomic) as not_pending', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({ applied: false });

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(false);
    if (!result.applied) expect(result.reason).toBe('race');
    expect(email.sendReferralCreditEmail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Milestone email guard (C-2)
// ─────────────────────────────────────────────────────────────────────

describe('completeReferralOnPayment — milestone email guard', () => {
  it('sends the 5-referral milestone email and stamps referralMilestone5Emailed=true on first cross', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: { ...REFERRER, leaderboardMention: false, referralMilestone5Emailed: false },
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(5);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(true);
    if (result.applied) expect(result.milestoneAwarded).toBe(5);
    expect(storage.updatePlayer).toHaveBeenCalledWith(
      'player-referrer',
      expect.objectContaining({ leaderboardMention: true, referralMilestone5Emailed: true }),
    );
    expect(email.sendReferralMilestoneEmail).toHaveBeenCalledWith('ahmed@example.com', 'Ahmed', 5);
  });

  it('does NOT re-send the 5-referral email when re-crossing after a clawback (referralMilestone5Emailed already true)', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: { ...REFERRER, leaderboardMention: false, referralMilestone5Emailed: true },
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(5);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(true);
    // Flag still flips back ON (we re-cross the threshold) but no email goes out
    expect(storage.updatePlayer).toHaveBeenCalledWith(
      'player-referrer',
      expect.objectContaining({ leaderboardMention: true }),
    );
    const updateCall = (storage.updatePlayer as any).mock.calls.find((c: any[]) => c[1].leaderboardMention === true);
    expect(updateCall[1].referralMilestone5Emailed).not.toBe(true); // not re-stamped
    expect(email.sendReferralMilestoneEmail).not.toHaveBeenCalled();
  });

  it('sends the 10-referral milestone email and stamps referralMilestone10Emailed=true on first cross', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: { ...REFERRER, ambassadorStatus: false, referralMilestone10Emailed: false },
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(10);

    const result = await completeReferralOnPayment('mp-user-friend', 'booking-1');

    expect(result.applied).toBe(true);
    if (result.applied) expect(result.milestoneAwarded).toBe(10);
    expect(email.sendReferralMilestoneEmail).toHaveBeenCalledWith('ahmed@example.com', 'Ahmed', 10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// clawbackReferralForBooking
// ─────────────────────────────────────────────────────────────────────

describe('clawbackReferralForBooking — bail cases', () => {
  it('returns clawedBack:false when no referral was triggered by the booking', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue(undefined);

    const result = await clawbackReferralForBooking('booking-1');

    expect(result.clawedBack).toBe(false);
    expect(result.reason).toBe('no_referral');
    expect(storage.applyReferralClawbackAtomic).not.toHaveBeenCalled();
  });

  it('returns clawedBack:false when the referral row was already clawed back (terminal)', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'clawed_back',
      triggeringBookingId: 'booking-1',
    });

    const result = await clawbackReferralForBooking('booking-1');

    expect(result.clawedBack).toBe(false);
    expect(result.reason).toBe('not_completed');
  });
});

describe('clawbackReferralForBooking — happy paths', () => {
  it('reverses both 1500-fils credits and flips status to clawed_back', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'completed',
      triggeringBookingId: 'booking-1',
      refereePlayerId: 'player-friend',
    });
    (storage.applyReferralClawbackAtomic as any).mockResolvedValue({ clawedBack: true });
    (storage.getPlayer as any).mockResolvedValue({ ...REFERRER, leaderboardMention: false, ambassadorStatus: false });
    (storage.getCompletedReferralCount as any).mockResolvedValue(0);

    const result = await clawbackReferralForBooking('booking-1');

    expect(result.clawedBack).toBe(true);
    expect(storage.applyReferralClawbackAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        referralId: 'ref-1',
        referrerId: 'player-referrer',
        refereePlayerId: 'player-friend',
        refereeUserId: 'mp-user-friend',
        creditFils: 1500,
      }),
    );
  });

  it('silently revokes leaderboardMention when completed count drops below 5', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'completed',
      triggeringBookingId: 'booking-1',
    });
    (storage.applyReferralClawbackAtomic as any).mockResolvedValue({ clawedBack: true });
    (storage.getPlayer as any).mockResolvedValue({ ...REFERRER, leaderboardMention: true });
    (storage.getCompletedReferralCount as any).mockResolvedValue(4);

    const result = await clawbackReferralForBooking('booking-1');

    expect(result.clawedBack).toBe(true);
    expect(result.milestoneRevoked).toBe(5);
    expect(storage.updatePlayer).toHaveBeenCalledWith(
      'player-referrer',
      expect.objectContaining({ leaderboardMention: false }),
    );
    expect(email.sendReferralMilestoneEmail).not.toHaveBeenCalled();
  });

  it('silently revokes ambassadorStatus when completed count drops below 10', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'completed',
      triggeringBookingId: 'booking-1',
    });
    (storage.applyReferralClawbackAtomic as any).mockResolvedValue({ clawedBack: true });
    (storage.getPlayer as any).mockResolvedValue({ ...REFERRER, leaderboardMention: true, ambassadorStatus: true });
    (storage.getCompletedReferralCount as any).mockResolvedValue(9);

    const result = await clawbackReferralForBooking('booking-1');

    expect(result.clawedBack).toBe(true);
    expect(result.milestoneRevoked).toBe(10);
    expect(storage.updatePlayer).toHaveBeenCalledWith(
      'player-referrer',
      expect.objectContaining({ ambassadorStatus: false }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// completeReferral (admin force-complete) — now credits both sides
// ─────────────────────────────────────────────────────────────────────

describe('completeReferral (admin path)', () => {
  it('credits both sides and tags completionMethod="admin" with triggeringBookingId=null', async () => {
    (storage.getReferral as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: REFERRER,
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(1);

    const result = await completeReferral('ref-1');

    expect(result.success).toBe(true);
    expect(storage.applyReferralCompletionAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        referralId: 'ref-1',
        triggeringBookingId: null,
        completionMethod: 'admin',
        creditFils: 1500,
      }),
    );
    expect(email.sendReferralCreditEmail).toHaveBeenCalledTimes(1);
    expect(email.sendReferralFriendCreditEmail).toHaveBeenCalledTimes(1);
  });

  it('returns success:false when the referral is missing', async () => {
    (storage.getReferral as any).mockResolvedValue(undefined);

    const result = await completeReferral('ref-missing');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns success:false when the referral was already processed', async () => {
    (storage.getReferral as any).mockResolvedValue({ ...PENDING_REFERRAL, status: 'completed' });

    const result = await completeReferral('ref-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PR2 wiring helpers — fire-and-forget wrappers that callers can invoke
// at payment-confirmation / cancel sites without worrying about referral
// internals breaking payment flow.
// ─────────────────────────────────────────────────────────────────────────

describe('fireReferralOnPayment', () => {
  it('forwards (userId, bookingId) to completeReferralOnPayment via storage', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);

    await fireReferralOnPayment('user-1', 'booking-1');

    expect(storage.getReferralByRefereeUserId).toHaveBeenCalledWith('user-1');
  });

  it('never rejects, even when the underlying primitive throws', async () => {
    (storage.getReferralByRefereeUserId as any).mockRejectedValue(new Error('db down'));

    await expect(fireReferralOnPayment('user-1', 'booking-1')).resolves.toBeUndefined();
  });

  it('never rejects on the no-referral happy-bail case', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);

    await expect(fireReferralOnPayment('user-no-ref', 'booking-1')).resolves.toBeUndefined();
  });

  it('drives the full happy path through to credit emails', async () => {
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);
    (storage.getMarketplaceUser as any).mockResolvedValue(REFEREE_USER_LINKED);
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: REFERRER,
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(1);

    await fireReferralOnPayment('mp-user-friend', 'booking-1');

    expect(storage.applyReferralCompletionAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ triggeringBookingId: 'booking-1', completionMethod: 'first_payment' }),
    );
    expect(email.sendReferralCreditEmail).toHaveBeenCalledTimes(1);
    expect(email.sendReferralFriendCreditEmail).toHaveBeenCalledTimes(1);
  });
});

describe('fireReferralClawback', () => {
  it('forwards bookingId to clawbackReferralForBooking via storage', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue(undefined);

    await fireReferralClawback('booking-1');

    expect(storage.findCompletedReferralForBooking).toHaveBeenCalledWith('booking-1');
  });

  it('never rejects when the underlying primitive throws', async () => {
    (storage.findCompletedReferralForBooking as any).mockRejectedValue(new Error('db down'));

    await expect(fireReferralClawback('booking-1')).resolves.toBeUndefined();
  });

  it('is a no-op when the booking did not trigger any referral', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue(undefined);

    await fireReferralClawback('booking-no-ref');

    expect(storage.applyReferralClawbackAtomic).not.toHaveBeenCalled();
  });

  it('is a no-op when the referral is already clawed_back (terminal)', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'clawed_back',
      triggeringBookingId: 'booking-1',
    });

    await fireReferralClawback('booking-1');

    expect(storage.applyReferralClawbackAtomic).not.toHaveBeenCalled();
  });

  it('drives the full happy path when the booking really did trigger a referral', async () => {
    (storage.findCompletedReferralForBooking as any).mockResolvedValue({
      ...PENDING_REFERRAL,
      status: 'completed',
      triggeringBookingId: 'booking-1',
      refereePlayerId: 'player-friend',
    });
    (storage.applyReferralClawbackAtomic as any).mockResolvedValue({ clawedBack: true });
    (storage.getPlayer as any).mockResolvedValue({ ...REFERRER, leaderboardMention: false });
    (storage.getCompletedReferralCount as any).mockResolvedValue(0);

    await fireReferralClawback('booking-1');

    expect(storage.applyReferralClawbackAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ referralId: 'ref-1', creditFils: 1500 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PR4 — linkReferralPostSignup (post-signup referral entry)
//   • 30-day window enforcement (WINDOW_CLOSED)
//   • backfill (decision E): fire completion now if a confirmed booking exists
// ─────────────────────────────────────────────────────────────────────────

const REFERRER_PLAYER = { id: 'player-referrer', name: 'Ahmed' } as any;

// A freshly-signed-up referee, well within the 30-day window, linked to a
// player that is NOT the referrer (so no self-referral).
const FRESH_REFEREE = {
  id: 'mp-user-friend',
  name: 'Bilal',
  email: 'bilal@example.com',
  linkedPlayerId: 'player-friend',
  createdAt: new Date(),
} as any;

describe('linkReferralPostSignup — guard cases', () => {
  it('returns USER_NOT_FOUND when the marketplace user does not exist', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(undefined);

    const result = await linkReferralPostSignup({ userId: 'nope', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: false, code: 'USER_NOT_FOUND' });
    expect(storage.createReferral).not.toHaveBeenCalled();
  });

  it('returns ALREADY_LINKED when the user already has a referral row', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(PENDING_REFERRAL);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: false, code: 'ALREADY_LINKED' });
    expect(storage.createReferral).not.toHaveBeenCalled();
  });

  it('returns WINDOW_CLOSED when more than 30 days past account creation', async () => {
    const stale = {
      ...FRESH_REFEREE,
      createdAt: new Date(Date.now() - REFERRAL_WINDOW_MS - 60_000),
    };
    (storage.getMarketplaceUser as any).mockResolvedValue(stale);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: false, code: 'WINDOW_CLOSED' });
    expect(storage.getPlayerByReferralCode).not.toHaveBeenCalled();
    expect(storage.createReferral).not.toHaveBeenCalled();
  });

  it('allows linking on the last day inside the window', async () => {
    const edge = {
      ...FRESH_REFEREE,
      createdAt: new Date(Date.now() - REFERRAL_WINDOW_MS + 60_000),
    };
    (storage.getMarketplaceUser as any).mockResolvedValue(edge);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);
    (storage.createReferral as any).mockResolvedValue({ id: 'ref-new' });
    (storage.getEarliestConfirmedBookingForUser as any).mockResolvedValue(undefined);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: true, referralId: 'ref-new', backfilled: false, backfillBookingId: undefined });
  });

  it('returns INVALID_CODE when the referral code resolves to no player', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(undefined);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'BAD' });

    expect(result).toEqual({ ok: false, code: 'INVALID_CODE' });
    expect(storage.createReferral).not.toHaveBeenCalled();
  });

  it('returns SELF_REFERRAL when the user is linked to the referrer player', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue({ ...FRESH_REFEREE, linkedPlayerId: 'player-referrer' });
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: false, code: 'SELF_REFERRAL' });
    expect(storage.createReferral).not.toHaveBeenCalled();
  });

  it('uppercases the referral code before resolving it', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);
    (storage.createReferral as any).mockResolvedValue({ id: 'ref-new' });
    (storage.getEarliestConfirmedBookingForUser as any).mockResolvedValue(undefined);

    await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'siq-ahmed-9' });

    expect(storage.getPlayerByReferralCode).toHaveBeenCalledWith('SIQ-AHMED-9');
  });
});

describe('linkReferralPostSignup — happy path + backfill (decision E)', () => {
  it('creates a pending referral and does NOT backfill when no confirmed booking exists', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    (storage.getReferralByRefereeUserId as any).mockResolvedValue(undefined);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);
    (storage.createReferral as any).mockResolvedValue({ id: 'ref-new' });
    (storage.getEarliestConfirmedBookingForUser as any).mockResolvedValue(undefined);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: true, referralId: 'ref-new', backfilled: false, backfillBookingId: undefined });
    expect(storage.createReferral).toHaveBeenCalledWith(
      expect.objectContaining({
        referrerId: 'player-referrer',
        refereeUserId: 'mp-user-friend',
        refereePlayerId: 'player-friend',
        status: 'pending',
      }),
    );
    expect(storage.applyReferralCompletionAtomic).not.toHaveBeenCalled();
  });

  it('backfills immediately when the user already has a confirmed booking (paid day 5, code added day 10)', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    // First call (ALREADY_LINKED check) → none; second call (inside
    // completeReferralOnPayment) → the freshly-created pending referral.
    (storage.getReferralByRefereeUserId as any)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(PENDING_REFERRAL);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);
    (storage.createReferral as any).mockResolvedValue({ id: 'ref-1' });
    (storage.getEarliestConfirmedBookingForUser as any).mockResolvedValue({ id: 'booking-early' });
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({
      applied: true,
      updatedReferrer: REFERRER,
      refereeWasUnlinked: false,
    });
    (storage.getCompletedReferralCount as any).mockResolvedValue(1);

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: true, referralId: 'ref-1', backfilled: true, backfillBookingId: 'booking-early' });
    expect(storage.applyReferralCompletionAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        triggeringBookingId: 'booking-early',
        completionMethod: 'first_payment',
        creditFils: 1500,
      }),
    );
    expect(email.sendReferralCreditEmail).toHaveBeenCalledTimes(1);
    expect(email.sendReferralFriendCreditEmail).toHaveBeenCalledTimes(1);
  });

  it('reports backfilled:false if the completion CAS loses a race', async () => {
    (storage.getMarketplaceUser as any).mockResolvedValue(FRESH_REFEREE);
    (storage.getReferralByRefereeUserId as any)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(PENDING_REFERRAL);
    (storage.getPlayerByReferralCode as any).mockResolvedValue(REFERRER_PLAYER);
    (storage.createReferral as any).mockResolvedValue({ id: 'ref-1' });
    (storage.getEarliestConfirmedBookingForUser as any).mockResolvedValue({ id: 'booking-early' });
    (storage.applyReferralCompletionAtomic as any).mockResolvedValue({ applied: false });

    const result = await linkReferralPostSignup({ userId: 'mp-user-friend', referralCode: 'SIQ-X-1' });

    expect(result).toEqual({ ok: true, referralId: 'ref-1', backfilled: false, backfillBookingId: undefined });
  });
});
