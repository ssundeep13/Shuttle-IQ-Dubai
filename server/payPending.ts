// Paying a pending drop-in from My games (2026-09-15): reuse the booking's live Ziina intent — the page the player
// may already have open — and mint a fresh one only when there is none. A paid intent is never re-minted over: the
// caller confirms it through the canonical path instead. Pure over an injected retrieve so the rules are unit-testable.
import { ziinaIntentIsDead, ziinaIntentIsPaid } from "./rebookGuard";

export type IntentReuse =
  | { kind: 'mint' }
  | { kind: 'reuse'; redirectUrl: string }
  | { kind: 'paid'; intentId: string; intentStatus: string };

export async function decideIntentReuse(
  intentId: string | null | undefined,
  retrieve: (id: string) => Promise<{ status: string; redirect_url?: string }>,
): Promise<IntentReuse> {
  if (!intentId) return { kind: 'mint' };
  let intent: { status: string; redirect_url?: string };
  try { intent = await retrieve(intentId); }
  catch { return { kind: 'mint' }; }
  if (ziinaIntentIsPaid(intent.status)) return { kind: 'paid', intentId, intentStatus: intent.status };
  // Dead (declined / failed / expired…) or without a hosted page: nothing to send the player to — mint.
  if (ziinaIntentIsDead(intent.status) || !intent.redirect_url) return { kind: 'mint' };
  return { kind: 'reuse', redirectUrl: intent.redirect_url };
}
