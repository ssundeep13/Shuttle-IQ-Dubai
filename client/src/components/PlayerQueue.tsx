import { Plus, Minus, Trash2, RefreshCw, ArrowUpDown } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TodayPlayer extends Player {
  gamesPlayedToday?: number;
  winsToday?: number;
}

interface PlayerQueueProps {
  players: Player[];
  queuePlayerIds: string[];
  onAddPlayer: () => void;
  onRemoveFromQueue: (playerId: string) => void;
  onClearQueue: () => void;
}

const getLevelColor = (level: string) => {
  if (level.includes('Novice') || level.includes('Beginner')) {
    return 'border-success/20 bg-success/10 text-success';
  } else if (level.includes('Intermediate')) {
    return 'border-warning/20 bg-warning/10 text-warning';
  } else if (level.includes('Advanced') || level.includes('Professional')) {
    return 'border-destructive/20 bg-destructive/10 text-destructive';
  }
  return 'border-muted bg-muted text-muted-foreground';
};

export function PlayerQueue({
  players,
  queuePlayerIds,
  onAddPlayer,
  onRemoveFromQueue,
  onClearQueue,
}: PlayerQueueProps) {
  const [sortBy, setSortBy] = useState<'skill' | 'games'>('skill');

  // Fetch today's stats for all players
  const { data: todayPlayers = [] } = useQuery<TodayPlayer[]>({
    queryKey: ['/api/stats/today'],
  });

  // Map queue player IDs to players with today's stats
  const queuePlayers = queuePlayerIds
    .map((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return undefined;
      
      // Find today's stats for this player
      const todayStats = todayPlayers.find((tp) => tp.id === id);
      if (todayStats) {
        return {
          ...player,
          gamesPlayedToday: todayStats.gamesPlayedToday || 0,
          winsToday: todayStats.winsToday || 0,
        } as TodayPlayer;
      }
      
      // If no stats found, return player with 0 today stats
      return {
        ...player,
        gamesPlayedToday: 0,
        winsToday: 0,
      } as TodayPlayer;
    })
    .filter((p): p is TodayPlayer => p !== undefined);

  // Sort players based on selected criteria
  const sortedQueuePlayers = [...queuePlayers].sort((a, b) => {
    if (sortBy === 'skill') {
      // Sort by skill score directly (10-200 scale already represents the hierarchy)
      // Professional (190/200) → Advanced+ (170/180) → ... → Novice (10/20)
      return (b.skillScore || 100) - (a.skillScore || 100);
    } else {
      // Sort by games played TODAY: highest to lowest
      return (b.gamesPlayedToday || 0) - (a.gamesPlayedToday || 0);
    }
  });

  return (
    <div className="bg-card rounded-lg shadow-md p-4 sm:p-6 border border-card-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-primary">Player Queue</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={onAddPlayer} size="sm" className="flex-1 sm:flex-initial min-h-12 sm:min-h-9" data-testid="button-add-player-queue">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          {queuePlayers.length > 0 && (
            <Button onClick={onClearQueue} variant="outline" size="sm" className="flex-1 sm:flex-initial min-h-12 sm:min-h-9" data-testid="button-clear-queue">
              <RefreshCw className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground" data-testid="text-queue-player-count">{queuePlayers.length}</span> player
          {queuePlayers.length !== 1 ? 's' : ''} waiting
        </p>
        
        {queuePlayers.length > 0 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Select value={sortBy} onValueChange={(value: 'skill' | 'games') => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[180px] min-h-12 sm:min-h-9" data-testid="select-queue-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skill" data-testid="option-sort-skill">Sort by Skill Level</SelectItem>
                <SelectItem value="games" data-testid="option-sort-games">Sort by Games Played</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {queuePlayers.length > 0 ? (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {sortedQueuePlayers.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-3 sm:p-3 bg-muted rounded-md border border-transparent hover:border-border transition-all hover-elevate min-h-[4rem]"
              data-testid={`queue-player-${player.id}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 sm:w-8 sm:h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{player.name}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge className={cn("text-xs", getLevelColor(player.level))}>
                      {player.gender && player.gender === 'Male' ? 'M' : 'F'} {player.level}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {player.gamesPlayedToday || 0} games · {player.winsToday || 0} wins
                    </span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => onRemoveFromQueue(player.id)}
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive ml-2 flex-shrink-0 min-w-12 min-h-12 sm:min-w-9 sm:min-h-9"
                data-testid={`button-remove-queue-${player.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-muted rounded-md">
          <p className="text-muted-foreground mb-4">Queue is empty</p>
          <Button onClick={onAddPlayer} className="min-h-12 sm:min-h-10" data-testid="button-add-player-empty">
            <Plus className="w-4 h-4 mr-2" />
            Add First Player
          </Button>
        </div>
      )}
    </div>
  );
}
