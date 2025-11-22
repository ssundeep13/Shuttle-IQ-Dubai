import { Clock, X, Trophy, Calendar } from "lucide-react";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatSkillLevel, getSkillTierColor } from "@shared/utils/skillUtils";

interface CourtCardProps {
  court: CourtWithPlayers;
  queuePlayers: Player[];
  selectedPlayers: string[];
  team1Players: string[];
  team2Players: string[];
  canRemoveCourt: boolean;
  onRemoveCourt: (courtId: string) => void;
  onTogglePlayerSelection: (playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  onSelectWinningTeam: (courtId: string, teamNumber: number) => void;
  onEndGame: (courtId: string) => void;
  onCancelGame: (courtId: string) => void;
}

// Using getSkillTierColor from skillUtils instead of local function
const getLevelTextColor = (level: string) => {
  if (level.includes('Novice') || level.includes('Beginner')) {
    return 'text-success';
  } else if (level.includes('Intermediate')) {
    return 'text-warning';
  } else if (level.includes('Advanced') || level.includes('Professional')) {
    return 'text-destructive';
  }
  return 'text-muted-foreground';
};

const formatTime = (minutes: number) => {
  if (minutes === 0) return "Time's up!";
  return `${minutes} min${minutes !== 1 ? 's' : ''} remaining`;
};

export function CourtCard({
  court,
  queuePlayers,
  selectedPlayers,
  team1Players,
  team2Players,
  canRemoveCourt,
  onRemoveCourt,
  onTogglePlayerSelection,
  onAssignPlayers,
  onSelectWinningTeam,
  onEndGame,
  onCancelGame,
}: CourtCardProps) {
  const isAvailable = court.status === 'available';
  const team1 = court.players.filter(p => p.team === 1);
  const team2 = court.players.filter(p => p.team === 2);

  return (
    <div className="bg-card rounded-lg shadow-md p-4 sm:p-6 hover:shadow-lg transition-shadow relative border border-card-border min-h-[400px] sm:min-h-[500px] flex flex-col" data-testid={`card-court-${court.id}`}>
      {canRemoveCourt && isAvailable && (
        <button
          onClick={() => onRemoveCourt(court.id)}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-muted-foreground hover:text-destructive transition-colors p-2 rounded hover-elevate min-h-12 min-w-12"
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
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 justify-end">
                <Clock className="w-4 h-4" />
                <span
                  className={cn(
                    "font-semibold text-sm",
                    court.timeRemaining <= 5 ? "text-destructive" : "text-muted-foreground"
                  )}
                  data-testid={`text-court-timer-${court.id}`}
                >
                  {formatTime(court.timeRemaining)}
                </span>
              </div>
              {court.startedAt && (
                <div className="flex items-center gap-2 justify-end">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground" data-testid={`text-court-start-time-${court.id}`}>
                    {format(new Date(court.startedAt), 'h:mm a')}
                  </span>
                </div>
              )}
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
                  "p-3 rounded-md border-2 transition-colors duration-200",
                  court.winningTeam === 1
                    ? "bg-success/10 border-success"
                    : "bg-primary/5 border-primary/20"
                )}
              >
                <h5 className="text-center font-bold mb-2 text-primary">TEAM 1</h5>
                {team1.map((player) => (
                  <div key={player.id} className="text-center mb-1">
                    <p className="font-medium text-sm text-foreground">{player.name}</p>
                    <div className="flex items-center justify-center gap-1">
                      <p className={cn("text-xs", getLevelTextColor(player.level))}>{player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}</p>
                    </div>
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
                  "p-3 rounded-md border-2 transition-colors duration-200",
                  court.winningTeam === 2
                    ? "bg-success/10 border-success"
                    : "bg-chart-2/5 border-chart-2/20"
                )}
              >
                <h5 className="text-center font-bold mb-2 text-chart-2">TEAM 2</h5>
                {team2.map((player) => (
                  <div key={player.id} className="text-center mb-1">
                    <p className="font-medium text-sm text-foreground">{player.name}</p>
                    <div className="flex items-center justify-center gap-1">
                      <p className={cn("text-xs", getLevelTextColor(player.level))}>{player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-3">
            <Button
              onClick={() => onCancelGame(court.id)}
              variant="outline"
              className="w-full border-warning/30 text-warning hover:bg-warning/10 min-h-12 sm:min-h-10"
              data-testid={`button-cancel-game-${court.id}`}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Game (No Record)
            </Button>
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
                    "min-h-12 sm:min-h-10",
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
              className="w-full min-h-12 sm:min-h-10"
              data-testid={`button-end-game-${court.id}`}
            >
              <Trophy className="w-4 h-4 mr-2" />
              End Game & Record Result
            </Button>
          )}
        </div>
      ) : (
        <div>
          <h4 className="font-semibold text-foreground mb-2">Assign Players to Teams</h4>
          <p className="text-sm text-muted-foreground mb-3 text-center">Select exactly 2 players per team (4 total)</p>
          {queuePlayers.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border-2 border-primary/20 rounded-md p-3 bg-primary/5">
                  <h5 className="text-sm font-bold text-primary mb-2 text-center">TEAM 1 ({team1Players.length}/2)</h5>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {queuePlayers.map((player) => {
                      const isInTeam1 = team1Players.includes(player.id);
                      const isInTeam2 = team2Players.includes(player.id);
                      const isUnassigned = !isInTeam1 && !isInTeam2;
                      const team1Full = team1Players.length >= 2;
                      
                      // Only show if: assigned to THIS team OR unassigned
                      if (!isInTeam1 && !isUnassigned) return null;
                      
                      // Disable selection if team is full and player is not already in this team
                      const isDisabled = team1Full && !isInTeam1;
                      
                      return (
                        <div
                          key={player.id}
                          onClick={() => !isDisabled && onTogglePlayerSelection(player.id, 1)}
                          className={cn(
                            "p-3 sm:p-2 rounded-md border transition-all min-h-12 flex flex-col justify-center",
                            isInTeam1
                              ? "bg-primary/20 border-primary cursor-pointer hover-elevate"
                              : isDisabled
                              ? "bg-muted/50 border-muted cursor-not-allowed opacity-50"
                              : "bg-background border-border cursor-pointer hover-elevate hover:border-primary/50"
                          )}
                          data-testid={`player-team1-${player.id}`}
                        >
                          <p className="font-semibold text-xs sm:text-xs text-foreground">{player.name}</p>
                          <div className="flex items-center gap-1">
                            <p className={cn("text-xs", getLevelTextColor(player.level))}>{player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="border-2 border-chart-2/20 rounded-md p-3 bg-chart-2/5">
                  <h5 className="text-sm font-bold text-chart-2 mb-2 text-center">TEAM 2 ({team2Players.length}/2)</h5>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {queuePlayers.map((player) => {
                      const isInTeam1 = team1Players.includes(player.id);
                      const isInTeam2 = team2Players.includes(player.id);
                      const isUnassigned = !isInTeam1 && !isInTeam2;
                      const team2Full = team2Players.length >= 2;
                      
                      // Only show if: assigned to THIS team OR unassigned
                      if (!isInTeam2 && !isUnassigned) return null;
                      
                      // Disable selection if team is full and player is not already in this team
                      const isDisabled = team2Full && !isInTeam2;
                      
                      return (
                        <div
                          key={player.id}
                          onClick={() => !isDisabled && onTogglePlayerSelection(player.id, 2)}
                          className={cn(
                            "p-3 sm:p-2 rounded-md border transition-all min-h-12 flex flex-col justify-center",
                            isInTeam2
                              ? "bg-chart-2/30 border-chart-2 cursor-pointer hover-elevate"
                              : isDisabled
                              ? "bg-muted/50 border-muted cursor-not-allowed opacity-50"
                              : "bg-background border-border cursor-pointer hover-elevate hover:border-chart-2/50"
                          )}
                          data-testid={`player-team2-${player.id}`}
                        >
                          <p className="font-semibold text-xs sm:text-xs text-foreground">{player.name}</p>
                          <div className="flex items-center gap-1">
                            <p className={cn("text-xs", getLevelTextColor(player.level))}>{player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              <div className="text-center mb-2">
                <span className={cn(
                  "text-sm font-semibold",
                  team1Players.length === 2 && team2Players.length === 2
                    ? "text-success"
                    : "text-muted-foreground"
                )}>
                  {team1Players.length === 2 && team2Players.length === 2 
                    ? "✓ Ready to start! (4 players assigned)"
                    : `${team1Players.length + team2Players.length}/4 players assigned`
                  }
                </span>
              </div>
              
              <Button
                onClick={() => onAssignPlayers(court.id)}
                disabled={team1Players.length !== 2 || team2Players.length !== 2}
                className="w-full min-h-12 sm:min-h-10"
                data-testid={`button-assign-players-${court.id}`}
              >
                Start Game
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
