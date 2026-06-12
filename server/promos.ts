import { eq, sql, and } from "drizzle-orm";
import { db } from "./db";
import { marketplaceUsers } from "@shared/schema";
import { applyWalletDelta } from "./walletLedger";

/**
 * Drain any pending wallet credit staged on a marketplace user onto a linked
 * player wallet. Used by the referral flow: when a referred friend is still
 * unlinked at completion time, their AED 15 credit is staged on
 * marketplaceUsers.pendingSignupCreditFils and lands here the moment they
 * link a player.
 *
 * Idempotent: zeros the pending field after credit, so repeated calls are
 * safe.
 */
export async function applyPendingWalletCredit(
  marketplaceUserId: string,
  playerId: string,
): Promise<number> {
  const [user] = await db
    .select({ pending: marketplaceUsers.pendingSignupCreditFils })
    .from(marketplaceUsers)
    .where(eq(marketplaceUsers.id, marketplaceUserId));
  if (!user || user.pending <= 0) return 0;

  const credit = user.pending;

  // Atomic: zero the pending field AND credit the wallet in one
  // transaction. The compare-and-swap on pending guards against
  // concurrent duplicate calls, and the transaction rolls back any
  // partial writes if either step fails.
  const applied = await db.transaction(async (tx) => {
    const [updatedUser] = await tx
      .update(marketplaceUsers)
      .set({ pendingSignupCreditFils: 0 })
      .where(
        and(
          eq(marketplaceUsers.id, marketplaceUserId),
          sql`${marketplaceUsers.pendingSignupCreditFils} = ${credit}`,
        ),
      )
      .returning();
    if (!updatedUser) return 0;

    // Ledger site #4 (signup_credit): same tx as the pending-field CAS.
    const delta = await applyWalletDelta(tx, {
      playerId,
      deltaFils: credit,
      type: 'signup_credit',
      description: 'Staged signup credit applied at player link',
      createdBy: 'system',
    });
    if (!delta) {
      throw new Error(`Player ${playerId} not found while applying pending wallet credit`);
    }
    return credit;
  });

  if (applied > 0) {
    console.log(
      `[Wallet] Applied ${applied} fils pending credit to player ${playerId} from marketplace user ${marketplaceUserId}`,
    );
  }
  return applied;
}
