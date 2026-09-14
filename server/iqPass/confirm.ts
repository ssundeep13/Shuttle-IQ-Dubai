// IQ Pass — confirm orchestration around the atomic transaction in store.ts.
// After a successful commit: the same hooks a paid booking fires (referral
// once, founding member once, goodwill per seat), one in-app notification and
// one email — all fire-and-forget, never inside the transaction, never able
// to fail the confirmation.
import { fireReferralOnPayment } from "../referrals";
import { syncFoundingMemberForUser } from "../venueAwards";
import { fireGoodwillCredit } from "../goodwillCredit";
import { sendIqPassConfirmationEmail } from "../emailClient";
import { storage } from "../storage";
import { iqPassStore, type ConfirmTxResult, type SeatSession } from "./store";
import { IQ_PASS_TIERS, type PackTier } from "./rules";
import { iqPassOpeningLine } from "../iqPassEmail";
import type { IqPassConfirmationEmailInput } from "../iqPassEmail";

export type ConfirmDeps = {
  now(): Date;
  confirmTx(intentId: string, now: Date): Promise<ConfirmTxResult>;
  getUser(userId: string): Promise<{ id: string; name: string; email: string } | undefined>;
  getPackSeatSessions(packId: string): Promise<SeatSession[]>;
  fireReferral(userId: string, bookingId: string): void;
  syncFoundingMember(userId: string): Promise<unknown>;
  fireGoodwill(bookingId: string, site: string): void;
  notify(input: { userId: string; type: string; title: string; message: string }): Promise<unknown>;
  sendConfirmationEmail(to: string, input: IqPassConfirmationEmailInput): Promise<void>;
};

export const defaultConfirmDeps: ConfirmDeps = {
  now: () => new Date(),
  confirmTx: (intentId, now) => iqPassStore.confirmTx(intentId, now),
  getUser: (userId) => iqPassStore.getUser(userId),
  getPackSeatSessions: (packId) => iqPassStore.getPackSeatSessions(packId),
  fireReferral: (userId, bookingId) => fireReferralOnPayment(userId, bookingId),
  syncFoundingMember: (userId) => syncFoundingMemberForUser(userId),
  fireGoodwill: (bookingId, site) => fireGoodwillCredit(bookingId, site),
  notify: (input) => storage.createMarketplaceNotification(input),
  sendConfirmationEmail: (to, input) => sendIqPassConfirmationEmail(to, input),
};

export async function confirmPackByIntentId(
  intentId: string,
  deps: ConfirmDeps = defaultConfirmDeps,
): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean; error?: string }> {
  const result = await deps.confirmTx(intentId, deps.now());
  if (result.kind === 'not_found') return { confirmed: false, error: 'pack_not_found' };
  if (result.kind === 'already') return { confirmed: true, alreadyConfirmed: true };
  if (result.kind === 'hold_gone') {
    console.warn(`[IQ Pass] payment for pack ${result.pack.id} landed after its hold lapsed — recorded, refund queued (intent ${intentId})`);
    return { confirmed: false, error: 'pack_hold_expired' };
  }

  const { pack, bookingIds } = result;
  const label = IQ_PASS_TIERS[pack.tier as PackTier]?.label ?? pack.tier;

  // Hooks — the same ones a paid drop-in booking fires. Referral keys on the
  // first paid booking (idempotent per user); founding member is user-scoped;
  // goodwill is per booking (flagged sessions only).
  try { deps.fireReferral(pack.userId, bookingIds[0]); } catch (e) { console.error('[IQ Pass] referral hook failed:', e instanceof Error ? e.message : e); }
  try { await deps.syncFoundingMember(pack.userId); } catch (e) { console.error('[IQ Pass] founding-member sync failed:', e instanceof Error ? e.message : e); }
  for (const bookingId of bookingIds) {
    try { deps.fireGoodwill(bookingId, 'iq-pass-confirm'); } catch (e) { console.error('[IQ Pass] goodwill hook failed:', e instanceof Error ? e.message : e); }
  }

  try {
    await deps.notify({
      userId: pack.userId,
      type: 'iq_pass_active',
      title: 'Your IQ Pass is active',
      message: `${iqPassOpeningLine(label, pack.gamesTotal)} See your games under My Bookings.`,
    });
  } catch (e) { console.error('[IQ Pass] notification failed:', e instanceof Error ? e.message : e); }

  try {
    const [user, seats] = await Promise.all([deps.getUser(pack.userId), deps.getPackSeatSessions(pack.id)]);
    if (user?.email) {
      await deps.sendConfirmationEmail(user.email, {
        packId: pack.id,
        name: user.name,
        tierLabel: label,
        gamesTotal: pack.gamesTotal,
        priceAed: pack.priceAed,
        sessions: seats.map((s) => s.session),
      });
    }
  } catch (e) { console.error('[IQ Pass] confirmation email failed:', e instanceof Error ? e.message : e); }

  console.log(`[IQ Pass] pack ${pack.id} active — ${bookingIds.length} seats confirmed (intent ${intentId})`);
  return { confirmed: true };
}
