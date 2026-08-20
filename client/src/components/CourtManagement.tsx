import { Plus, Minus } from "lucide-react";
import { CourtWithPlayers } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { CourtCard } from "./CourtCard";
import { sortCourts } from "@/lib/courtOrder";

// Gate 2 (deck-lite): the grid is the LIVE-GAME zone — assignment and
// next-game controls moved to the NEXT GAMES deck above it, so the props
// that only fed those flows moved out with them.

interface CourtManagementProps {
  courts: CourtWithPlayers[];
  onAddCourt: () => void;
  onRemoveCourt: (courtId: string) => void;
  onRecordGame: (courtId: string, winningTeam: number, team1Score: number, team2Score: number) => void;
  onCancelGame: (courtId: string) => void;
  onOpenAssign: (courtId: string) => void;
  // Gate 3 (3.5): which court's record/cancel mutation is in flight (null = none).
  recordPendingCourtId: string | null;
  cancelPendingCourtId: string | null;
}

export function CourtManagement({
  courts: courtsProp,
  onAddCourt,
  onRemoveCourt,
  recordPendingCourtId,
  cancelPendingCourtId,
  onRecordGame,
  onCancelGame,
  onOpenAssign,
}: CourtManagementProps) {
  const courts = sortCourts(courtsProp);
  const lastCourt = courts[courts.length - 1];
  const canRemoveLastCourt = courts.length > 1 && lastCourt?.status === "available";

  return (
    <div className="space-y-4">
      {/* Lean control row */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-medium text-muted-foreground">
          {courts.length} court{courts.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => lastCourt && onRemoveCourt(lastCourt.id)}
            disabled={!canRemoveLastCourt}
            variant="outline"
            size="sm"
            data-testid="button-remove-last-court"
          >
            <Minus className="w-4 h-4 mr-1.5" />
            Remove
          </Button>
          <Button
            onClick={onAddCourt}
            size="sm"
            data-testid="button-add-court"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Court
          </Button>
        </div>
      </div>

      {/* Court grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            canRemoveCourt={courts.length > 1 && court.status === "available"}
            onRemoveCourt={onRemoveCourt}
            onRecordGame={onRecordGame}
            onCancelGame={onCancelGame}
            onOpenAssign={onOpenAssign}
            recordPending={recordPendingCourtId === court.id}
            cancelPending={cancelPendingCourtId === court.id}
          />
        ))}
      </div>
    </div>
  );
}
