import { Plus, Minus } from "lucide-react";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { CourtCard } from "./CourtCard";

interface CourtManagementProps {
  courts: CourtWithPlayers[];
  queuePlayers: Player[];
  teamAssignments: Record<string, { team1: string[]; team2: string[] }>;
  onAddCourt: () => void;
  onRemoveCourt: (courtId: string) => void;
  onTogglePlayerSelection: (courtId: string, playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  onSelectWinningTeam: (courtId: string, teamNumber: number) => void;
  onEndGame: (courtId: string) => void;
}

export function CourtManagement({
  courts,
  queuePlayers,
  teamAssignments,
  onAddCourt,
  onRemoveCourt,
  onTogglePlayerSelection,
  onAssignPlayers,
  onSelectWinningTeam,
  onEndGame,
}: CourtManagementProps) {
  const lastCourt = courts[courts.length - 1];
  const canRemoveLastCourt = courts.length > 1 && lastCourt?.status === 'available';

  return (
    <div>
      <div className="bg-gradient-to-r from-chart-2/10 to-info/10 border-2 border-chart-2/30 rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-xl font-bold text-primary">Court Management Controls</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Currently managing{" "}
              <span className="font-bold text-lg text-foreground">{courts.length}</span> court
              {courts.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button
              onClick={() => lastCourt && onRemoveCourt(lastCourt.id)}
              disabled={!canRemoveLastCourt}
              variant="destructive"
              className="flex-1 md:flex-initial"
              data-testid="button-remove-last-court"
            >
              <Minus className="w-4 h-4 mr-2" />
              Remove Court
            </Button>
            <Button
              onClick={onAddCourt}
              className="flex-1 md:flex-initial bg-chart-2 hover:bg-chart-2/90 text-white border-none"
              data-testid="button-add-court"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add New Court
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courts.map((court) => {
          const courtTeams = teamAssignments[court.id] || { team1: [], team2: [] };
          const selectedPlayers = [...courtTeams.team1, ...courtTeams.team2];
          
          return (
            <CourtCard
              key={court.id}
              court={court}
              queuePlayers={queuePlayers}
              selectedPlayers={selectedPlayers}
              team1Players={courtTeams.team1}
              team2Players={courtTeams.team2}
              canRemoveCourt={courts.length > 1 && court.status === 'available'}
              onRemoveCourt={onRemoveCourt}
              onTogglePlayerSelection={(playerId, team) => onTogglePlayerSelection(court.id, playerId, team)}
              onAssignPlayers={onAssignPlayers}
              onSelectWinningTeam={onSelectWinningTeam}
              onEndGame={onEndGame}
            />
          );
        })}
      </div>
    </div>
  );
}
