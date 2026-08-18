// Finishing tier — the panel's provisional voice.
//
// When every free player is already seated, the server widens a panel's pool
// with players mid-game on OTHER courts (soonest-ending first). That lineup is
// real but provisional: it starts as those players free up. The panel must
// say so in plain words — no engine vocabulary, no emoji, brand tokens only.
// Confirm still follows the existing occupied-court path; the 409 action
// layer stays the arbiter if the captain acts while they are still on court.
import { Badge } from "@/components/ui/badge";

/** "ends in ~6 min" — replaces the wait count for a finishing player.
 *  Null for everyone else, so the existing receipt logic keeps its voice. */
export function finishingReceipt(finishingInMin: number | undefined): string | null {
  if (finishingInMin === undefined || finishingInMin === null) return null;
  const n = Math.round(finishingInMin);
  if (n < 1) return "ends in under a minute";
  return `ends in ~${n} min`;
}

export function finishingChipCopy(): string {
  return "Starts as players free up";
}

export function finishingConfirmCopy(): string {
  return "Confirm — starts as players free up";
}

/** The meta-row chip. Secondary (teal) tokens — the brand accent for
 *  "planned, not yet live"; never amber (that's the warning register). */
export function FinishingChip({ courtId }: { courtId: string }) {
  return (
    <Badge
      variant="outline"
      className="text-xs text-secondary border-secondary/40 shrink-0"
      data-testid={`badge-finishing-${courtId}`}
    >
      {finishingChipCopy()}
    </Badge>
  );
}
