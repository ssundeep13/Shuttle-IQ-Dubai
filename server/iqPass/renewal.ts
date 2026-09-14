// IQ Pass — the daily renewal job (09:00 Dubai = 05:00 UTC, flag on only).
//  • Renewal email in the window [last game − 7 days, last game − 1 day] so a
//    missed run still sends; idempotent through packs.renewal_email_sent_at.
//  • Follow-up email once the last game is 7+ days past, only when the player
//    has no newer pass; idempotent through packs.followup_email_sent_at.
//  • A pack whose last picked game is past becomes `completed`.
//  • Every run writes a job_runs row (running → ok | error) with the counts.
// Orchestration over injected deps; the queries live in store.ts.
import { storage } from "../storage";
import { sendIqPassRenewalEmail, sendIqPassFollowupEmail } from "../emailClient";
import type { IqPassRenewalEmailInput } from "../iqPassEmail";
import { iqPassStore } from "./store";
import { IQ_PASS_TIERS, addDaysDubai, todayDubai, isPackTier } from "./rules";

export const IQ_PASS_RENEWAL_UTC_HOUR = 5; // 09:00 Asia/Dubai
export const RENEWAL_LEAD_DAYS = 7;
export const FOLLOWUP_LAG_DAYS = 7;

export type RenewalCandidate = {
  id: string;
  userId: string;
  tier: string;
  status: string;
  renewalEmailSentAt: Date | null;
  followupEmailSentAt: Date | null;
};

export type RenewalDeps = {
  now(): Date;
  listRenewalCandidates(): Promise<RenewalCandidate[]>;
  getLastGameDate(packId: string): Promise<string | null>;
  hasNewerPack(userId: string, packId: string): Promise<boolean>;
  getUser(userId: string): Promise<{ id: string; name: string; email: string } | undefined>;
  sendRenewal(to: string, input: IqPassRenewalEmailInput): Promise<void>;
  sendFollowup(to: string, input: IqPassRenewalEmailInput): Promise<void>;
  markRenewalSent(packId: string, at: Date): Promise<unknown>;
  markFollowupSent(packId: string, at: Date): Promise<unknown>;
  markCompleted(packId: string, at: Date): Promise<unknown>;
  startRun(jobName: string): Promise<string>;
  finishRun(runId: string, status: 'ok' | 'error', details: Record<string, number>, error?: string): Promise<unknown>;
};

export const defaultRenewalDeps: RenewalDeps = {
  now: () => new Date(),
  listRenewalCandidates: () => iqPassStore.listRenewalCandidates(),
  getLastGameDate: (packId) => iqPassStore.getLastPickedGameDate(packId),
  hasNewerPack: (userId, packId) => iqPassStore.hasNewerPack(userId, packId),
  getUser: (userId) => iqPassStore.getUser(userId),
  sendRenewal: (to, input) => sendIqPassRenewalEmail(to, input),
  sendFollowup: (to, input) => sendIqPassFollowupEmail(to, input),
  markRenewalSent: (packId, at) => iqPassStore.markRenewalSent(packId, at),
  markFollowupSent: (packId, at) => iqPassStore.markFollowupSent(packId, at),
  markCompleted: (packId, at) => iqPassStore.markCompleted(packId, at),
  startRun: (jobName) => iqPassStore.startJobRun(jobName),
  finishRun: (runId, status, details, error) => iqPassStore.finishJobRun(runId, status, details, error),
};

// storage is imported so a future notification hook has it in scope; unused today.
void storage;

export async function runIqPassRenewalJob(deps: RenewalDeps = defaultRenewalDeps): Promise<{ renewals: number; followups: number; completed: number }> {
  const now = deps.now();
  const today = todayDubai(now);
  const counts = { renewals: 0, followups: 0, completed: 0 };
  let candidates = 0;
  let runId: string | null = null;
  try {
    runId = await deps.startRun('iq_pass_renewal');
  } catch (e) {
    console.error('[IQ Pass] renewal: could not open a job_runs row:', e instanceof Error ? e.message : e);
  }

  try {
    const packs = await deps.listRenewalCandidates();
    candidates = packs.length;
    for (const p of packs) {
      try {
        const last = await deps.getLastGameDate(p.id);
        if (!last) continue; // a pack with no seats has nothing to renew
        const tierLabel = isPackTier(p.tier) ? IQ_PASS_TIERS[p.tier].label : p.tier;

        if (!p.renewalEmailSentAt && today >= addDaysDubai(last, -RENEWAL_LEAD_DAYS) && today <= addDaysDubai(last, -1)) {
          const user = await deps.getUser(p.userId);
          if (user?.email) {
            await deps.sendRenewal(user.email, { packId: p.id, name: user.name, tierLabel, lastGameDate: last });
            await deps.markRenewalSent(p.id, now);
            counts.renewals += 1;
          }
        }

        if (p.status === 'active' && last < today) {
          await deps.markCompleted(p.id, now);
          counts.completed += 1;
        }

        if (!p.followupEmailSentAt && today >= addDaysDubai(last, FOLLOWUP_LAG_DAYS) && !(await deps.hasNewerPack(p.userId, p.id))) {
          const user = await deps.getUser(p.userId);
          if (user?.email) {
            await deps.sendFollowup(user.email, { packId: p.id, name: user.name, tierLabel, lastGameDate: last });
            await deps.markFollowupSent(p.id, now);
            counts.followups += 1;
          }
        }
      } catch (e) {
        // One pack's failure never stops the sweep; its stamp stays unset so the next run retries.
        console.error(`[IQ Pass] renewal: pack ${p.id} failed:`, e instanceof Error ? e.message : e);
      }
    }
    if (runId) await deps.finishRun(runId, 'ok', { ...counts, candidates });
    if (counts.renewals + counts.followups + counts.completed > 0) console.log('[IQ Pass] renewal run:', JSON.stringify({ ...counts, candidates }));
  } catch (e) {
    console.error('[IQ Pass] renewal run failed:', e instanceof Error ? e.message : e);
    if (runId) {
      try { await deps.finishRun(runId, 'error', { ...counts, candidates }, e instanceof Error ? e.message : String(e)); } catch { /* logged above */ }
    }
  }
  return counts;
}
