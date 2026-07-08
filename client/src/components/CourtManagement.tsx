import { Plus, Minus } from "lucide-react";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { CourtCard } from "./CourtCard";

interface CourtManagementProps {
  courts: CourtWithPlayers[];
  queuePlayers: Player[];
  isSandboxSession: boolean;
  aiModeEnabled: boolean;
  teamAssignments: Record<string, { team1: string[]; team2: string[] }>;
  onAddCourt: () => void;
  onRemoveCourt: (courtId: string) => void;
  onTogglePlayerSelection: (courtId: string, playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  onSelectWinningTeam: (courtId: string, teamNumber: number) => void;
  onEndGame: (courtId: string) => void;
  onCancelGame: (courtId: string) => void;
}

// Fixed court order: cards NEVER move — status changes card contents, not
// card position. Server orders too; this is the belt-and-braces.
function courtNumber(name: string): number {
  const n = parseInt(name.replace(/\D+/g, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

export function CourtManagement({
  courts: courtsProp,
  queuePlayers,
  isSandboxSession,
  aiModeEnabled,
  teamAssignments,
  onAddCourt,
  onRemoveCourt,
  onTogglePlayerSelection,
  onAssignPlayers,
  onSelectWinningTeam,
  onEndGame,
  onCancelGame,
}: CourtManagementProps) {
  const courts = [...courtsProp].sort(
    (a, b) => courtNumber(a.name) - courtNumber(b.name) || a.name.localeCompare(b.name),
  );
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
        {courts.map((court) => {
          const courtTeams = teamAssignments[court.id] || { team1: [], team2: [] };
          const selectedPlayers = [...courtTeams.team1, ...courtTeams.team2];

          return (
            <CourtCard
              key={court.id}
              court={court}
              queuePlayers={queuePlayers}
              playingPlayerIds={courts.flatMap((c) => c.players.map((p) => p.id))}
              isSandboxSession={isSandboxSession}
              aiModeEnabled={aiModeEnabled}
              selectedPlayers={selectedPlayers}
              team1Players={courtTeams.team1}
              team2Players={courtTeams.team2}
              canRemoveCourt={courts.length > 1 && court.status === "available"}
              onRemoveCourt={onRemoveCourt}
              onTogglePlayerSelection={(playerId, team) =>
                onTogglePlayerSelection(court.id, playerId, team)
              }
              onAssignPlayers={onAssignPlayers}
              onSelectWinningTeam={onSelectWinningTeam}
              onEndGame={onEndGame}
              onCancelGame={onCancelGame}
            />
          );
        })}
      </div>
    </div>
  );
}
