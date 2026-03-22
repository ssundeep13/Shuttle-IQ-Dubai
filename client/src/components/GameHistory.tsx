import { useState } from "react";
import { History, Trophy, RotateCcw, Download, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSkillTierColor } from "@shared/utils/skillUtils";

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
  sessionId?: string;
}

const getLevelColor = (level: string) => getSkillTierColor(level);

export function GameHistory({ games, onResetGames, sessionId }: GameHistoryProps) {
  const { toast } = useToast();
  const [editingGame, setEditingGame] = useState<GameHistoryItem | null>(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);

  const updateGameMutation = useMutation({
    mutationFn: async ({ gameId, team1Score, team2Score }: { gameId: string; team1Score: number; team2Score: number }) => {
      return await apiRequest("PATCH", `/api/game-results/${gameId}`, { team1Score, team2Score });
    },
    onSuccess: () => {
      toast({
        title: "Game Updated",
        description: "The game score has been updated successfully.",
      });
      setEditingGame(null);
      // Invalidate game history queries with correct key format
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['/api/game-history', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId, 'game-history'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update game score",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (game: GameHistoryItem) => {
    setEditingGame(game);
    setTeam1Score(game.team1Score);
    setTeam2Score(game.team2Score);
  };

  const handleSaveEdit = () => {
    if (!editingGame) return;
    if (team1Score === team2Score) {
      toast({
        title: "Invalid Score",
        description: "Scores cannot be tied. One team must win.",
        variant: "destructive",
      });
      return;
    }
    updateGameMutation.mutate({
      gameId: editingGame.id,
      team1Score,
      team2Score,
    });
  };

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
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-foreground">
                    {game.team1Score} - {game.team2Score}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEditClick(game)}
                    data-testid={`button-edit-game-${game.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
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

      {/* Edit Game Score Modal */}
      <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Game Score</DialogTitle>
          </DialogHeader>
          {editingGame && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Team 1 Players</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {editingGame.participants
                      .filter(p => p.team === 1)
                      .map(p => p.playerName)
                      .join(', ')}
                  </div>
                </div>
                <div>
                  <Label>Team 2 Players</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {editingGame.participants
                      .filter(p => p.team === 2)
                      .map(p => p.playerName)
                      .join(', ')}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="team1Score">Team 1 Score</Label>
                  <Input
                    id="team1Score"
                    type="number"
                    min={0}
                    max={99}
                    value={team1Score}
                    onChange={(e) => setTeam1Score(parseInt(e.target.value) || 0)}
                    data-testid="input-team1-score"
                  />
                </div>
                <div>
                  <Label htmlFor="team2Score">Team 2 Score</Label>
                  <Input
                    id="team2Score"
                    type="number"
                    min={0}
                    max={99}
                    value={team2Score}
                    onChange={(e) => setTeam2Score(parseInt(e.target.value) || 0)}
                    data-testid="input-team2-score"
                  />
                </div>
              </div>
              {team1Score === team2Score && team1Score > 0 && (
                <p className="text-sm text-destructive">Scores cannot be tied. One team must win.</p>
              )}
              {team1Score !== editingGame.team1Score || team2Score !== editingGame.team2Score ? (
                <div className="text-sm text-muted-foreground">
                  {(team1Score > team2Score) !== (editingGame.team1Score > editingGame.team2Score) && (
                    <p className="text-warning">Note: This will change the winning team and recalculate skill scores.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGame(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateGameMutation.isPending || team1Score === team2Score}
              data-testid="button-save-edit"
            >
              {updateGameMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
