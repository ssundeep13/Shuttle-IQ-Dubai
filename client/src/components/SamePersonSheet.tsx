import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PlayerCandidate } from "@shared/utils/playerMatching";

// P1 duplicate prevention: one-tap resolution sheet shown ONLY when a
// same-person candidate exists (or the single-name policy fires). Tapping a
// candidate uses the existing player; the secondary action creates anyway.
// Receipts show display tiers, never DB enums.

interface SamePersonSheetProps {
  open: boolean;
  title: string;
  description: string;
  candidates: PlayerCandidate[];
  onPick: (candidate: PlayerCandidate) => void;
  secondaryLabel: string;
  onSecondary: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

function receiptLine(c: PlayerCandidate): string {
  const games = c.gamesPlayed === 1 ? "1 game" : `${c.gamesPlayed} games`;
  const last = c.lastPlayedAt
    ? `last played ${new Date(c.lastPlayedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "never played";
  return `${games} · ${c.tier} · ${last}`;
}

export function SamePersonSheet({
  open,
  title,
  description,
  candidates,
  onPick,
  secondaryLabel,
  onSecondary,
  onDismiss,
  busy = false,
}: SamePersonSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onDismiss();
      }}
    >
      <SheetContent side="bottom" className="rounded-t-lg">
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-2">
          {candidates.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              disabled={busy}
              className="w-full h-14 justify-between px-4"
              onClick={() => onPick(c)}
              data-testid={`candidate-${c.id}`}
            >
              <span className="flex flex-col items-start min-w-0 text-left">
                <span className="font-semibold truncate max-w-full">{c.name}</span>
                <span className="text-xs text-muted-foreground">{receiptLine(c)}</span>
              </span>
              {c.matchType === "phone" && (
                <Badge variant="secondary" className="shrink-0">Same phone</Badge>
              )}
            </Button>
          ))}
          <Button
            variant={candidates.length === 0 ? "default" : "ghost"}
            disabled={busy}
            className={
              candidates.length === 0
                ? "w-full h-12"
                : "w-full h-12 text-muted-foreground"
            }
            onClick={onSecondary}
            data-testid="button-same-person-secondary"
          >
            {secondaryLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
