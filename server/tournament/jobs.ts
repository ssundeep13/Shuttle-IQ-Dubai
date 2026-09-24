// Tournament registration — scheduler jobs, registered in startScheduler only
// under isTournamentEnabled(). Every run that does work is ledgered in job_runs.
//  (1) Hold expiry, every 5 min: Ziina first, the clock second — a lapsed hold
//      whose intent was paid is confirmed, never expired; if Ziina cannot be
//      reached the hold waits for the next run. Unpaid holds are expired by a
//      status-guarded claim and the freed seat goes to the waitlist.
//  (2) Reconciliation, every 10 min: the missed-webhook safety net.
//  (3) "Registration open" in-app notices: members at the members instant,
//      everyone at the open, each claimed exactly once on the tournaments row.
import { storage } from "../storage";
import { retrieveZiinaPaymentIntent, isZiinaPaymentSuccessful } from "../ziinaClient";
import { formatDubaiDeadline } from "@shared/dubaiTime";
import type { Tournament, TournamentRegistration } from "@shared/schema";
import { tournamentStore, type Account } from "./store";
import { confirmRegistrationByIntentId } from "./confirm";
import { registrationPhase } from "./rules";
import { displayVenue, eventLine, sendTournamentPromotionEmail } from "./email";

export const TOURNAMENT_HOLD_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
export const TOURNAMENT_RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
export const TOURNAMENT_OPEN_NOTIFY_INTERVAL_MS = 5 * 60 * 1000;
/** Longer than the 24 h hold, so money that lands just after expiry is still looked for. */
export const TOURNAMENT_RECONCILE_WINDOW_MS = 26 * 60 * 60 * 1000;

type Notify = (input: { userId: string; type: string; title: string; message: string }) => Promise<unknown>;
type Ledger = {
  startRun(jobName: string): Promise<string>;
  finishRun(id: string, status: 'ok' | 'error', details: Record<string, number>, error?: string): Promise<void>;
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─── Promotion notices (also used after a withdrawal) ─────────────────────

export type PromotionNoticeDeps = {
  now(): Date;
  notify: Notify;
  getAccount(userId: string): Promise<Account | undefined>;
  getTournament(id: string): Promise<Tournament | undefined>;
  sendPromotionEmail(to: string, input: { registration: TournamentRegistration; name: string; tournament: Tournament }): Promise<void>;
  markPromotionNotified(registrationId: string, at: Date): Promise<void>;
};

export const defaultPromotionNoticeDeps: PromotionNoticeDeps = {
  now: () => new Date(),
  notify: (input) => storage.createMarketplaceNotification(input),
  getAccount: (userId) => tournamentStore.getAccount(userId),
  getTournament: (id) => tournamentStore.getTournament(id),
  sendPromotionEmail: (to, input) => sendTournamentPromotionEmail(to, input),
  markPromotionNotified: (id, at) => tournamentStore.markPromotionNotified(id, at),
};

export async function notifyPromotedRegistrations(promoted: TournamentRegistration[], deps: PromotionNoticeDeps = defaultPromotionNoticeDeps): Promise<void> {
  for (const r of promoted) {
    const payBy = r.holdExpiresAt ? formatDubaiDeadline(r.holdExpiresAt) : 'the deadline';
    try {
      await deps.notify({
        userId: r.userId,
        type: 'tournament_promoted',
        title: 'A ShuttleIQ League spot opened up',
        message: `A ${r.tier} spot in the ShuttleIQ League is yours if you pay AED ${r.amountAed} by ${payBy}. Open the ShuttleIQ League page to pay.`,
      });
    } catch (e) { console.error(`[Tournament] promotion notification failed for ${r.id}:`, errMsg(e)); }
    try {
      const [account, tournament] = await Promise.all([deps.getAccount(r.userId), deps.getTournament(r.tournamentId)]);
      if (account?.email && tournament) {
        await deps.sendPromotionEmail(account.email, { registration: r, name: account.name, tournament });
        await deps.markPromotionNotified(r.id, deps.now());
      }
    } catch (e) { console.error(`[Tournament] promotion email failed for ${r.id} (not stamped):`, errMsg(e)); }
  }
}

// ─── (1) Hold expiry ──────────────────────────────────────────────────────

export type HoldExpiryDeps = Ledger & {
  now(): Date;
  getLapsedHolds(now: Date): Promise<TournamentRegistration[]>;
  retrieveIntent(intentId: string): Promise<{ status: string }>;
  isSuccessful(status: string): boolean;
  confirm(intentId: string): Promise<{ confirmed: boolean }>;
  expireAndPromote(registrationId: string, now: Date): Promise<{ expired: boolean; promoted: TournamentRegistration[] }>;
  notify: Notify;
  onPromoted(promoted: TournamentRegistration[]): Promise<void>;
};

export const defaultHoldExpiryDeps: HoldExpiryDeps = {
  now: () => new Date(),
  startRun: (name) => tournamentStore.startJobRun(name),
  finishRun: (id, status, details, error) => tournamentStore.finishJobRun(id, status, details, error),
  getLapsedHolds: (now) => tournamentStore.getLapsedHolds(now),
  retrieveIntent: (intentId) => retrieveZiinaPaymentIntent(intentId),
  isSuccessful: (status) => isZiinaPaymentSuccessful(status),
  confirm: (intentId) => confirmRegistrationByIntentId(intentId),
  expireAndPromote: (id, now) => tournamentStore.expireAndPromote(id, now),
  notify: (input) => storage.createMarketplaceNotification(input),
  onPromoted: (promoted) => notifyPromotedRegistrations(promoted),
};

export async function runTournamentHoldExpiryJob(deps: HoldExpiryDeps = defaultHoldExpiryDeps) {
  const out = { lapsed: 0, expired: 0, rescued: 0, skipped: 0, promoted: 0 };
  let runId: string | null = null;
  try {
    runId = await deps.startRun('tournament_hold_expiry');
    const now = deps.now();
    const lapsed = await deps.getLapsedHolds(now);
    out.lapsed = lapsed.length;
    for (const h of lapsed) {
      try {
        if (h.ziinaPaymentIntentId) {
          let status: string;
          try { status = (await deps.retrieveIntent(h.ziinaPaymentIntentId)).status; }
          catch (e) {
            out.skipped++;
            console.warn(`[Tournament] hold ${h.id}: Ziina unreachable, left for the next run:`, errMsg(e));
            continue;
          }
          if (deps.isSuccessful(status)) {
            const r = await deps.confirm(h.ziinaPaymentIntentId);
            if (r.confirmed) out.rescued++;
            continue;
          }
        }
        const r = await deps.expireAndPromote(h.id, now);
        if (!r.expired) continue;
        out.expired++;
        out.promoted += r.promoted.length;
        try {
          await deps.notify({
            userId: h.userId,
            type: 'tournament_hold_expired',
            title: 'ShuttleIQ League spot released',
            message: 'Your ShuttleIQ League spot was released because payment was not completed within 24 hours. You can register again while spots remain.',
          });
        } catch (e) { console.error(`[Tournament] hold-expired notification failed for ${h.id}:`, errMsg(e)); }
        if (r.promoted.length > 0) {
          try { await deps.onPromoted(r.promoted); }
          catch (e) { console.error(`[Tournament] promotion notices failed after ${h.id}:`, errMsg(e)); }
        }
        console.log(`[Tournament] hold expired: registration ${h.id} (${h.tier}); promoted ${r.promoted.length}`);
      } catch (e) {
        console.error(`[Tournament] hold expiry failed for ${h.id}:`, errMsg(e));
      }
    }
    await deps.finishRun(runId, 'ok', out);
  } catch (e) {
    console.error('[Tournament] hold expiry run failed:', errMsg(e));
    if (runId) await deps.finishRun(runId, 'error', out, errMsg(e)).catch(() => {});
  }
  return out;
}

// ─── (2) Reconciliation ───────────────────────────────────────────────────

export type ReconcileDeps = Ledger & {
  now(): Date;
  getReconcileCandidates(now: Date, windowMs: number): Promise<Array<{ id: string; ziinaPaymentIntentId: string | null }>>;
  retrieveIntent(intentId: string): Promise<{ status: string }>;
  isSuccessful(status: string): boolean;
  confirm(intentId: string): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean }>;
};

export const defaultReconcileDeps: ReconcileDeps = {
  now: () => new Date(),
  startRun: (name) => tournamentStore.startJobRun(name),
  finishRun: (id, status, details, error) => tournamentStore.finishJobRun(id, status, details, error),
  getReconcileCandidates: (now, windowMs) => tournamentStore.getReconcileCandidates(now, windowMs),
  retrieveIntent: (intentId) => retrieveZiinaPaymentIntent(intentId),
  isSuccessful: (status) => isZiinaPaymentSuccessful(status),
  confirm: (intentId) => confirmRegistrationByIntentId(intentId),
};

export async function runTournamentReconciliationJob(deps: ReconcileDeps = defaultReconcileDeps) {
  const out = { checked: 0, rescued: 0, failed: 0 };
  let runId: string | null = null;
  try {
    runId = await deps.startRun('tournament_reconcile');
    const candidates = await deps.getReconcileCandidates(deps.now(), TOURNAMENT_RECONCILE_WINDOW_MS);
    for (const c of candidates) {
      if (!c.ziinaPaymentIntentId) continue;
      out.checked++;
      try {
        const intent = await deps.retrieveIntent(c.ziinaPaymentIntentId);
        if (!deps.isSuccessful(intent.status)) continue;
        const r = await deps.confirm(c.ziinaPaymentIntentId);
        if (r.confirmed && !r.alreadyConfirmed) {
          out.rescued++;
          console.log(`[Tournament] reconciliation confirmed registration ${c.id} (intent ${c.ziinaPaymentIntentId})`);
        }
      } catch (e) {
        out.failed++;
        console.error(`[Tournament] reconciliation failed for ${c.id}:`, errMsg(e));
      }
    }
    await deps.finishRun(runId, 'ok', out);
  } catch (e) {
    console.error('[Tournament] reconciliation run failed:', errMsg(e));
    if (runId) await deps.finishRun(runId, 'error', out, errMsg(e)).catch(() => {});
  }
  return out;
}

// ─── (3) "Registration open" notices ──────────────────────────────────────

type CopyFields = Pick<Tournament, 'name' | 'startsAt' | 'venueName' | 'entryFeeAed' | 'registrationOpensAt'> & { tierCaps?: unknown };

/** In-app copy only (Q8). Never the deck link. */
export function openNotificationCopy(t: CopyFields, stage: 'members' | 'everyone'): { title: string; message: string } {
  const event = `${t.name}: ${eventLine(t)}`;
  const caps = t.tierCaps && typeof t.tierCaps === 'object' ? Object.values(t.tierCaps as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0) : 48;
  if (stage === 'members') {
    return {
      title: 'ShuttleIQ League: early access is open',
      message: `As an IQ Pass member you can register now, before registration opens to everyone at ${formatDubaiDeadline(t.registrationOpensAt)}. ${event}. AED ${t.entryFeeAed} entry.`,
    };
  }
  return {
    title: 'ShuttleIQ League registration is open',
    message: `Register for the ${event}. ${caps} spots across four tiers, AED ${t.entryFeeAed} entry.`,
  };
}

export type OpenNotifyDeps = Ledger & {
  now(): Date;
  getCurrentTournament(): Promise<Tournament | undefined>;
  notifyMembersOpen(tournamentId: string, now: Date, copy: { title: string; message: string }): Promise<number | null>;
  notifyEveryoneOpen(tournamentId: string, now: Date, copy: { title: string; message: string }): Promise<number | null>;
};

export const defaultOpenNotifyDeps: OpenNotifyDeps = {
  now: () => new Date(),
  startRun: (name) => tournamentStore.startJobRun(name),
  finishRun: (id, status, details, error) => tournamentStore.finishJobRun(id, status, details, error),
  getCurrentTournament: () => tournamentStore.getCurrentTournament(),
  notifyMembersOpen: (id, now, copy) => tournamentStore.notifyMembersOpen(id, now, copy),
  notifyEveryoneOpen: (id, now, copy) => tournamentStore.notifyEveryoneOpen(id, now, copy),
};

export async function runTournamentOpenNotificationsJob(deps: OpenNotifyDeps = defaultOpenNotifyDeps) {
  const out = { members: 0, everyone: 0 };
  try {
    const t = await deps.getCurrentTournament();
    if (!t || t.status !== 'published') return out;
    const now = deps.now();
    const phase = registrationPhase(t, now);
    const membersDue = phase === 'members_only' && !t.membersOpenNotifiedAt;
    const everyoneDue = phase === 'open' && !t.openNotifiedAt;
    if (!membersDue && !everyoneDue) return out;
    const runId = await deps.startRun('tournament_open_notify');
    try {
      if (membersDue) out.members = (await deps.notifyMembersOpen(t.id, now, openNotificationCopy(t, 'members'))) ?? 0;
      if (everyoneDue) out.everyone = (await deps.notifyEveryoneOpen(t.id, now, openNotificationCopy(t, 'everyone'))) ?? 0;
      await deps.finishRun(runId, 'ok', out);
      if (out.members || out.everyone) console.log(`[Tournament] "registration open" notices sent — members ${out.members}, everyone ${out.everyone} (${displayVenue(t.venueName)})`);
    } catch (e) {
      await deps.finishRun(runId, 'error', out, errMsg(e)).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('[Tournament] open notifications failed:', errMsg(e));
  }
  return out;
}
