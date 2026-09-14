// IQ Pass — scheduler jobs. (1) Hold expiry: cancel holds whose 30 minutes
// are up, tell the player, offer each freed seat to the waitlist through the
// existing promotion helper. (2) Reconciliation: the missed-webhook safety
// net — re-check every pending pack intent at Ziina and confirm the paid ones
// through the canonical confirm path. Both run only when the flag is on
// (registered in startScheduler under isIqPassEnabled()).
import { storage } from "../storage";
import { promoteWaitlistForFreedSpots } from "../guestSlotRefund";
import { retrieveZiinaPaymentIntent, isZiinaPaymentSuccessful } from "../ziinaClient";
import { iqPassStore } from "./store";
import { confirmPackByIntentId } from "./confirm";
import { HOLD_MINUTES } from "./rules";

export const HOLD_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
export const PACK_RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type HoldExpiryDeps = {
  now(): Date;
  expireHolds(now: Date): Promise<Array<{ packId: string; userId: string; sessionIds: string[] }>>;
  notify(input: { userId: string; type: string; title: string; message: string }): Promise<unknown>;
  promote(sessionId: string, maxPromotions: number): Promise<number>;
};

export const defaultHoldExpiryDeps: HoldExpiryDeps = {
  now: () => new Date(),
  expireHolds: (now) => iqPassStore.expireHolds(now),
  notify: (input) => storage.createMarketplaceNotification(input),
  promote: (sessionId, max) => promoteWaitlistForFreedSpots(sessionId, max),
};

export async function runPackHoldExpiryJob(deps: HoldExpiryDeps = defaultHoldExpiryDeps): Promise<{ expired: number; promoted: number }> {
  let promoted = 0;
  let lapsed: Array<{ packId: string; userId: string; sessionIds: string[] }> = [];
  try {
    lapsed = await deps.expireHolds(deps.now());
  } catch (e) {
    console.error('[IQ Pass] hold expiry sweep failed:', e instanceof Error ? e.message : e);
    return { expired: 0, promoted: 0 };
  }
  for (const h of lapsed) {
    try {
      await deps.notify({
        userId: h.userId,
        type: 'iq_pass_hold_expired',
        title: 'IQ Pass hold released',
        message: `Your seats were released because payment was not completed within ${HOLD_MINUTES} minutes. You can pick again any time.`,
      });
    } catch (e) { console.error(`[IQ Pass] hold-expired notification failed for pack ${h.packId}:`, e instanceof Error ? e.message : e); }
    for (const sessionId of h.sessionIds) {
      try { promoted += await deps.promote(sessionId, 1); }
      catch (e) { console.error(`[IQ Pass] waitlist promotion after hold expiry failed for session ${sessionId}:`, e instanceof Error ? e.message : e); }
    }
    console.log(`[IQ Pass] hold expired: pack ${h.packId}, ${h.sessionIds.length} seat(s) released`);
  }
  return { expired: lapsed.length, promoted };
}

export type ReconcileDeps = {
  getPendingPacks(withinMs: number): Promise<Array<{ id: string; ziinaPaymentIntentId: string | null }>>;
  retrieveIntent(intentId: string): Promise<{ status: string }>;
  isSuccessful(status: string): boolean;
  confirm(intentId: string): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean }>;
};

export const defaultReconcileDeps: ReconcileDeps = {
  getPendingPacks: (withinMs) => iqPassStore.getPacksPendingReconciliation(withinMs),
  retrieveIntent: (intentId) => retrieveZiinaPaymentIntent(intentId),
  isSuccessful: (status) => isZiinaPaymentSuccessful(status),
  confirm: (intentId) => confirmPackByIntentId(intentId),
};

export async function runPackReconciliationJob(deps: ReconcileDeps = defaultReconcileDeps): Promise<{ checked: number; rescued: number }> {
  let checked = 0;
  let rescued = 0;
  let candidates: Array<{ id: string; ziinaPaymentIntentId: string | null }> = [];
  try {
    candidates = await deps.getPendingPacks(PACK_RECONCILE_WINDOW_MS);
  } catch (e) {
    console.error('[IQ Pass] reconciliation query failed:', e instanceof Error ? e.message : e);
    return { checked, rescued };
  }
  for (const p of candidates) {
    const intentId = p.ziinaPaymentIntentId;
    if (!intentId) continue;
    checked++;
    try {
      const intent = await deps.retrieveIntent(intentId);
      if (!deps.isSuccessful(intent.status)) continue;
      const r = await deps.confirm(intentId);
      if (r.confirmed && !r.alreadyConfirmed) {
        rescued++;
        console.log(`[IQ Pass] reconciliation rescued pack ${p.id} (intent ${intentId})`);
      }
    } catch (e) {
      console.error(`[IQ Pass] reconciliation failed for pack ${p.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return { checked, rescued };
}
