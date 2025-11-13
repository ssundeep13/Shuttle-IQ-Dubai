import { History, Trophy, RotateCcw, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface GameParticipant {
  gameId: string;
  playerId: string;
  team: number;
  skillScoreBefore: number;
  skillScoreAfter: number;
  playerName: string;
  playerLevel: string;
}

interface GameHistoryItem {
  id: string;
  courtId: string;
  team1Score: number;
  team2Score: number;
  winningTeam: number;
  createdAt: string;
  participants: GameParticipant[];
}

interface GameHistoryProps {
  games: GameHistoryItem[];
  onResetGames: () => void;
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

export function GameHistory({ games, onResetGames }: GameHistoryProps) {
  const escapeCSVField = (field: string | number): string => {
    // Convert to string
    const str = String(field);
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    // Always quote fields to handle commas and special characters
    return `"${escaped}"`;
  };

  const downloadCSV = () => {
    // Create CSV data
    const headers = ['Game #', 'Date', 'Team 1 Players', 'Team 2 Players', 'Score', 'Winning Team'];
    const csvRows = [headers.map(h => escapeCSVField(h)).join(',')];

    games.forEach((game, index) => {
      const gameNumber = games.length - index;
      const date = format(new Date(game.createdAt), 'yyyy-MM-dd HH:mm');
      const team1Players = game.participants
        .filter(p => p.team === 1)
        .map(p => `${p.playerName} (${p.playerLevel})`)
        .join('; ');
      const team2Players = game.participants
        .filter(p => p.team === 2)
        .map(p => `${p.playerName} (${p.playerLevel})`)
        .join('; ');
      const score = `${game.team1Score}-${game.team2Score}`;
      const winningTeam = `Team ${game.winningTeam}`;

      const row = [
        escapeCSVField(gameNumber),
        escapeCSVField(date),
        escapeCSVField(team1Players),
        escapeCSVField(team2Players),
        escapeCSVField(score),
        escapeCSVField(winningTeam)
      ].join(',');
      
      csvRows.push(row);
    });

    const csvContent = csvRows.join('\n');
    
    // Create blob and download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `game-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (games.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-md p-6 border border-card-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
            <History className="w-6 h-6" />
            Game History
          </h2>
        </div>
        <div className="text-center py-12 bg-muted rounded-md">
          <p className="text-muted-foreground">No games have been played yet. Start a game to see history here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-md p-6 border border-card-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-primary flex items-center gap-2">
          <History className="w-5 h-5 sm:w-6 sm:h-6" />
          Game History
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={downloadCSV}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial min-h-12 sm:min-h-9"
            data-testid="button-download-csv"
          >
            <Download className="w-4 h-4 mr-1" />
            <span className="sm:inline">Download CSV</span>
          </Button>
          <Button
            onClick={onResetGames}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial min-h-12 sm:min-h-9 text-destructive hover:text-destructive"
            data-testid="button-reset-games"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            <span className="sm:inline">Reset</span>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {games.map((game, index) => {
          const team1Players = game.participants.filter(p => p.team === 1);
          const team2Players = game.participants.filter(p => p.team === 2);
          const isTeam1Winner = game.winningTeam === 1;

          return (
            <div
              key={game.id}
              className="border border-card-border rounded-lg p-4 hover-elevate transition-all"
              data-testid={`game-history-${game.id}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-muted">
                    Game #{games.length - index}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(game.createdAt), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {game.team1Score} - {game.team2Score}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={cn(
                    "p-3 rounded-md border-2 transition-all",
                    isTeam1Winner
                      ? "bg-success/10 border-success"
                      : "bg-muted/50 border-border"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-primary">TEAM 1</h4>
                    {isTeam1Winner && (
                      <Trophy className="w-4 h-4 text-success" />
                    )}
                  </div>
                  <div className="space-y-2">
                    {team1Players.map((player) => {
                      const skillChange = (player.skillScoreAfter - player.skillScoreBefore) / 10;
                      const displaySkillBefore = (player.skillScoreBefore / 10).toFixed(1);
                      const displaySkillAfter = (player.skillScoreAfter / 10).toFixed(1);

                      return (
                        <div key={player.playerId} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-foreground">{player.playerName}</p>
                            <Badge className={cn("text-xs", getLevelColor(player.playerLevel))}>
                              {player.playerLevel}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              {displaySkillBefore} → {displaySkillAfter}
                            </div>
                            <div
                              className={cn(
                                "text-xs font-semibold",
                                skillChange > 0 ? "text-success" : skillChange < 0 ? "text-destructive" : "text-muted-foreground"
                              )}
                            >
                              {skillChange > 0 ? "+" : ""}{skillChange.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  className={cn(
                    "p-3 rounded-md border-2 transition-all",
                    !isTeam1Winner
                      ? "bg-success/10 border-success"
                      : "bg-muted/50 border-border"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-chart-2">TEAM 2</h4>
                    {!isTeam1Winner && (
                      <Trophy className="w-4 h-4 text-success" />
                    )}
                  </div>
                  <div className="space-y-2">
                    {team2Players.map((player) => {
                      const skillChange = (player.skillScoreAfter - player.skillScoreBefore) / 10;
                      const displaySkillBefore = (player.skillScoreBefore / 10).toFixed(1);
                      const displaySkillAfter = (player.skillScoreAfter / 10).toFixed(1);

                      return (
                        <div key={player.playerId} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-foreground">{player.playerName}</p>
                            <Badge className={cn("text-xs", getLevelColor(player.playerLevel))}>
                              {player.playerLevel}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              {displaySkillBefore} → {displaySkillAfter}
                            </div>
                            <div
                              className={cn(
                                "text-xs font-semibold",
                                skillChange > 0 ? "text-success" : skillChange < 0 ? "text-destructive" : "text-muted-foreground"
                              )}
                            >
                              {skillChange > 0 ? "+" : ""}{skillChange.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
