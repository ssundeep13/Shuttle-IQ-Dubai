// Tournament registration — confirm orchestration around store.confirmTx. The
// Ziina webhook, the return-page poll and the reconciliation job all land here.
// After a successful commit: one in-app "You're in" and one email (stamped only
// after a send that went out). Hooks never fail the confirmation.
import { storage } from "../storage";
import { tournamentStore, type Account, type ConfirmTxResult } from "./store";
import { sendTournamentConfirmationEmail } from "./email";
import { formatDubaiDeadline } from "@shared/dubaiTime";
import type { Tournament, TournamentRegistration } from "@shared/schema";

export type ConfirmDeps = {
  now(): Date;
  confirmTx(intentId: string, now: Date): Promise<ConfirmTxResult>;
  getAccount(userId: string): Promise<Account | undefined>;
  getTournament(id: string): Promise<Tournament | undefined>;
  notify(input: { userId: string; type: string; title: string; message: string }): Promise<unknown>;
  sendConfirmationEmail(to: string, input: { registration: TournamentRegistration; name: string; tournament: Tournament }): Promise<void>;
  markConfirmationEmailed(registrationId: string, at: Date): Promise<void>;
};

export const defaultConfirmDeps: ConfirmDeps = {
  now: () => new Date(),
  confirmTx: (intentId, now) => tournamentStore.confirmTx(intentId, now),
  getAccount: (userId) => tournamentStore.getAccount(userId),
  getTournament: (id) => tournamentStore.getTournament(id),
  notify: (input) => storage.createMarketplaceNotification(input),
  sendConfirmationEmail: (to, input) => sendTournamentConfirmationEmail(to, input),
  markConfirmationEmailed: (id, at) => tournamentStore.markConfirmationEmailed(id, at),
};

export type ConfirmOutcome = { confirmed: boolean; alreadyConfirmed?: boolean; restored?: boolean; error?: string };

export async function confirmRegistrationByIntentId(intentId: string, deps: ConfirmDeps = defaultConfirmDeps): Promise<ConfirmOutcome> {
  const now = deps.now();
  const result = await deps.confirmTx(intentId, now);
  if (result.kind === 'not_found') return { confirmed: false, error: 'registration_not_found' };
  if (result.kind === 'already') return { confirmed: true, alreadyConfirmed: true };
  if (result.kind === 'refund_owed') {
    console.warn(`[Tournament] payment for registration ${result.registration.id} could not take a seat — recorded, refund queued (intent ${intentId})`);
    return { confirmed: false, error: 'registration_refund_owed' };
  }

  const reg = result.registration;
  const tournament = await deps.getTournament(reg.tournamentId).catch(() => undefined);
  const when = tournament ? ` See you at ${formatDubaiDeadline(tournament.startsAt)}.` : '';
  try {
    await deps.notify({
      userId: reg.userId,
      type: 'tournament_confirmed',
      title: "You're in the ShuttleIQ League",
      message: `Your ${reg.tier} spot in the ShuttleIQ League is confirmed.${when} Teams are drafted on Sun 11 Oct.`,
    });
  } catch (e) { console.error('[Tournament] confirmation notification failed:', e instanceof Error ? e.message : e); }

  if (!reg.confirmationEmailSentAt && tournament) {
    try {
      const account = await deps.getAccount(reg.userId);
      if (account?.email) {
        await deps.sendConfirmationEmail(account.email, { registration: reg, name: account.name, tournament });
        await deps.markConfirmationEmailed(reg.id, now);
      }
    } catch (e) { console.error('[Tournament] confirmation email failed (not stamped):', e instanceof Error ? e.message : e); }
  }

  console.log(`[Tournament] registration ${reg.id} confirmed${result.kind === 'restored' ? ' (restored after a lapsed hold)' : ''} (intent ${intentId})`);
  return result.kind === 'restored' ? { confirmed: true, restored: true } : { confirmed: true };
}
