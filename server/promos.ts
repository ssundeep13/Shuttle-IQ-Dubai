import { eq, sql, and } from "drizzle-orm";
import { db } from "./db";
import { marketplaceUsers, players } from "@shared/schema";

export const JERSEY_PROMO_SLUG = "jersey15";
export const JERSEY_PROMO_CREDIT_FILS = 1500;

export function creditForPromo(promo: string | undefined | null): number {
  if (!promo) return 0;
  if (promo.trim().toLowerCase() === JERSEY_PROMO_SLUG) {
    return JERSEY_PROMO_CREDIT_FILS;
  }
  return 0;
}

/**
 * Apply any pending signup credit on a marketplace user to a player wallet.
 * Idempotent: zeros the pending field after credit, so repeated calls are
 * safe.
 */
export async function applyPendingSignupCredit(
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

    const [updatedPlayer] = await tx
      .update(players)
      .set({ walletBalance: sql`${players.walletBalance} + ${credit}` })
      .where(eq(players.id, playerId))
      .returning();
    if (!updatedPlayer) {
      throw new Error(`Player ${playerId} not found while applying signup credit`);
    }
    return credit;
  });

  if (applied > 0) {
    console.log(
      `[Promo] Applied ${applied} fils signup credit to player ${playerId} from marketplace user ${marketplaceUserId}`,
    );
  }
  return applied;
}
