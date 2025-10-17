import { Trophy, Trash2 } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LeaderboardProps {
  players: Player[];
  onResetStats: () => void;
  onClearAllPlayers: () => void;
}

const getLevelColor = (level: string) => {
  switch (level) {
    case 'Beginner':
      return 'border-success/20 bg-success/10 text-success';
    case 'Intermediate':
      return 'border-warning/20 bg-warning/10 text-warning';
    case 'Advanced':
      return 'border-destructive/20 bg-destructive/10 text-destructive';
    default:
      return 'border-muted bg-muted text-muted-foreground';
  }
};

export function Leaderboard({ players, onResetStats, onClearAllPlayers }: LeaderboardProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    // First by wins
    if (b.wins !== a.wins) return b.wins - a.wins;
    // Then by games played
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  const getWinRate = (player: Player) => {
    if (player.gamesPlayed === 0) return 0;
    return Math.round((player.wins / player.gamesPlayed) * 100);
  };

  return (
    <div className="bg-card rounded-lg shadow-md p-6 border border-card-border">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          Leaderboard
        </h2>
        <div className="flex gap-2">
          <Button
            onClick={onResetStats}
            variant="outline"
            size="sm"
            data-testid="button-reset-stats"
          >
            Reset Stats
          </Button>
          <Button
            onClick={onClearAllPlayers}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            data-testid="button-clear-all-players"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear All
          </Button>
        </div>
      </div>

      {players.length > 0 ? (
        <div className="space-y-3">
          {sortedPlayers.map((player, index) => (
            <div
              key={player.id}
              className={cn(
                "flex items-center justify-between p-4 rounded-md border transition-all hover-elevate",
                index < 3 ? "bg-muted border-border" : "bg-card border-card-border"
              )}
              data-testid={`leaderboard-player-${player.id}`}
            >
              <div className="flex items-center gap-4 flex-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full font-bold",
                    index === 0 && "bg-warning/20 text-warning",
                    index === 1 && "bg-muted-foreground/20 text-muted-foreground",
                    index === 2 && "bg-destructive/20 text-destructive",
                    index > 2 && "bg-muted text-muted-foreground"
                  )}
                >
                  {index < 3 ? "🏆" : index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-foreground text-lg">{player.name}</p>
                    <Badge className={cn("text-xs", getLevelColor(player.level))}>
                      {player.level}
                    </Badge>
                    {player.status === 'playing' && (
                      <Badge className="bg-info/10 text-info border-info/20">Playing</Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Games: <span className="font-semibold text-foreground">{player.gamesPlayed}</span></span>
                    <span>Wins: <span className="font-semibold text-success">{player.wins}</span></span>
                    <span>Win Rate: <span className="font-semibold text-foreground">{getWinRate(player)}%</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-muted rounded-md">
          <p className="text-muted-foreground">No players yet. Add players to see the leaderboard.</p>
        </div>
      )}
    </div>
  );
}
