import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { players, referrals } from "@shared/schema";
import { sendReferralCreditEmail, sendReferralMilestoneEmail } from "./emailClient";

const REFERRAL_CREDIT_FILS = 1500;

export async function completeReferral(referralId: string): Promise<{ success: boolean; error?: string }> {
  const referral = await storage.getReferral(referralId);
  if (!referral) return { success: false, error: 'Referral not found' };
  if (referral.status !== 'pending') return { success: false, error: 'Referral already processed' };

  const [completedRef] = await db
    .update(referrals)
    .set({ status: 'completed', completedAt: new Date() })
    .where(and(eq(referrals.id, referralId), eq(referrals.status, 'pending')))
    .returning();
  if (!completedRef) return { success: false, error: 'Referral already completed (race)' };

  const [updatedReferrer] = await db
    .update(players)
    .set({ walletBalance: sql`${players.walletBalance} + ${REFERRAL_CREDIT_FILS}` })
    .where(eq(players.id, referral.referrerId))
    .returning();
  if (!updatedReferrer) return { success: false, error: 'Referrer player not found' };

  let refereeName = 'a friend';
  const refereeUser = await storage.getMarketplaceUser(referral.refereeUserId);
  if (refereeUser) {
    refereeName = refereeUser.name;
    if (refereeUser.linkedPlayerId && !referral.refereePlayerId) {
      await db.update(referrals).set({ refereePlayerId: refereeUser.linkedPlayerId }).where(eq(referrals.id, referralId));
    }
  }

  const completedCount = await storage.getCompletedReferralCount(referral.referrerId);

  if (completedCount === 5 && !updatedReferrer.leaderboardMention) {
    await storage.updatePlayer(referral.referrerId, { leaderboardMention: true });
    if (updatedReferrer.email) {
      sendReferralMilestoneEmail(updatedReferrer.email, updatedReferrer.name, 5).catch(() => {});
    }
  }
  if (completedCount === 10 && !updatedReferrer.ambassadorStatus) {
    await storage.updatePlayer(referral.referrerId, { ambassadorStatus: true });
    if (updatedReferrer.email) {
      sendReferralMilestoneEmail(updatedReferrer.email, updatedReferrer.name, 10).catch(() => {});
    }
  }

  if (updatedReferrer.email) {
    sendReferralCreditEmail(updatedReferrer.email, updatedReferrer.name, refereeName, updatedReferrer.walletBalance).catch(() => {});
  }

  return { success: true };
}
