import { Clock, X, Trophy } from "lucide-react";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CourtCardProps {
  court: CourtWithPlayers;
  queuePlayers: Player[];
  selectedPlayers: string[];
  canRemoveCourt: boolean;
  onRemoveCourt: (courtId: string) => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onAssignPlayers: (courtId: string) => void;
  onSelectWinningTeam: (courtId: string, teamNumber: number) => void;
  onEndGame: (courtId: string) => void;
}

const getLevelColor = (level: string) => {
  switch (level) {
    case 'Beginner':
      return 'text-success';
    case 'Intermediate':
      return 'text-warning';
    case 'Advanced':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
};

const formatTime = (minutes: number) => {
  if (minutes === 0) return "Time's up!";
  return `${minutes} min${minutes !== 1 ? 's' : ''} remaining`;
};

export function CourtCard({
  court,
  queuePlayers,
  selectedPlayers,
  canRemoveCourt,
  onRemoveCourt,
  onTogglePlayerSelection,
  onAssignPlayers,
  onSelectWinningTeam,
  onEndGame,
}: CourtCardProps) {
  const isAvailable = court.status === 'available';
  const team1 = court.players.slice(0, Math.ceil(court.players.length / 2));
  const team2 = court.players.slice(Math.ceil(court.players.length / 2));

  return (
    <div className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow relative border border-card-border" data-testid={`card-court-${court.id}`}>
      {canRemoveCourt && isAvailable && (
        <button
          onClick={() => onRemoveCourt(court.id)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover-elevate"
          data-testid={`button-remove-court-${court.id}`}
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-bold text-foreground" data-testid={`text-court-name-${court.id}`}>{court.name}</h3>
          <Badge
            className={cn(
              "mt-2",
              isAvailable
                ? "bg-success/10 text-success hover:bg-success/20 border-success/20"
                : "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20"
            )}
            data-testid={`badge-court-status-${court.id}`}
          >
            {isAvailable ? 'AVAILABLE' : 'OCCUPIED'}
          </Badge>
        </div>
        {!isAvailable && (
          <div className="text-right">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span
                className={cn(
                  "font-semibold",
                  court.timeRemaining <= 5 ? "text-destructive" : "text-muted-foreground"
                )}
                data-testid={`text-court-timer-${court.id}`}
              >
                {formatTime(court.timeRemaining)}
              </span>
            </div>
          </div>
        )}
      </div>

      {!isAvailable ? (
        <div>
          <h4 className="font-semibold text-foreground mb-3 text-center">Current Match</h4>
          <div className="relative mb-4">
            <div className="grid grid-cols-2 gap-2">
              <div
                className={cn(
                  "p-3 rounded-md border-2 transition-all",
                  court.winningTeam === 1
                    ? "bg-success/10 border-success"
                    : "bg-primary/5 border-primary/20"
                )}
              >
                <h5 className="text-center font-bold mb-2 text-primary">TEAM 1</h5>
                {team1.map((player) => (
                  <div key={player.id} className="text-center mb-1">
                    <p className="font-medium text-sm text-foreground">{player.name}</p>
                    <p className={cn("text-xs", getLevelColor(player.level))}>{player.level}</p>
                  </div>
                ))}
              </div>
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="bg-card rounded-full w-12 h-12 flex items-center justify-center shadow-lg border-2 border-border">
                  <span className="font-bold text-muted-foreground">VS</span>
                </div>
              </div>
              <div
                className={cn(
                  "p-3 rounded-md border-2 transition-all",
                  court.winningTeam === 2
                    ? "bg-success/10 border-success"
                    : "bg-chart-2/5 border-chart-2/20"
                )}
              >
                <h5 className="text-center font-bold mb-2 text-chart-2">TEAM 2</h5>
                {team2.map((player) => (
                  <div key={player.id} className="text-center mb-1">
                    <p className="font-medium text-sm text-foreground">{player.name}</p>
                    <p className={cn("text-xs", getLevelColor(player.level))}>{player.level}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-sm text-muted-foreground text-center mb-2">Select Winner:</p>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map((team) => (
                <Button
                  key={team}
                  onClick={() => onSelectWinningTeam(court.id, team)}
                  variant={court.winningTeam === team ? "default" : "outline"}
                  className={cn(
                    court.winningTeam === team && "bg-success hover:bg-success/90 border-success"
                  )}
                  data-testid={`button-select-team-${team}-${court.id}`}
                >
                  {court.winningTeam === team ? `🏆 Team ${team} Wins` : `Team ${team}`}
                </Button>
              ))}
            </div>
          </div>
          {court.winningTeam && (
            <Button
              onClick={() => onEndGame(court.id)}
              variant="destructive"
              className="w-full"
              data-testid={`button-end-game-${court.id}`}
            >
              <Trophy className="w-4 h-4 mr-2" />
              End Game & Record Result
            </Button>
          )}
        </div>
      ) : (
        <div>
          <h4 className="font-semibold text-foreground mb-3">Assign Players from Queue</h4>
          {queuePlayers.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 mb-4">
                {queuePlayers.map((player) => {
                  const isSelected = selectedPlayers.includes(player.id);
                  return (
                    <div
                      key={player.id}
                      onClick={() => onTogglePlayerSelection(player.id)}
                      className={cn(
                        "p-2 rounded-md border-2 cursor-pointer transition-all hover-elevate",
                        isSelected
                          ? "bg-info/10 border-info"
                          : "bg-muted border-transparent hover:border-border"
                      )}
                      data-testid={`player-select-${player.id}`}
                    >
                      <p className="font-semibold text-sm text-foreground">{player.name}</p>
                      <p className={cn("text-xs", getLevelColor(player.level))}>{player.level}</p>
                    </div>
                  );
                })}
              </div>
              <Button
                onClick={() => onAssignPlayers(court.id)}
                disabled={selectedPlayers.length < 2}
                className="w-full"
                data-testid={`button-assign-players-${court.id}`}
              >
                Assign {selectedPlayers.length > 0 && `(${selectedPlayers.length})`} Player
                {selectedPlayers.length !== 1 ? 's' : ''}
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 bg-muted rounded-md">
              <p className="text-muted-foreground">No players in the queue.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
