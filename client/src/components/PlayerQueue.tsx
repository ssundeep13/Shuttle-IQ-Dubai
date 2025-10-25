import { Plus, Minus, Trash2, RefreshCw, ArrowUpDown } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlayerQueueProps {
  players: Player[];
  queuePlayerIds: string[];
  onAddPlayer: () => void;
  onRemoveFromQueue: (playerId: string) => void;
  onClearQueue: () => void;
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

export function PlayerQueue({
  players,
  queuePlayerIds,
  onAddPlayer,
  onRemoveFromQueue,
  onClearQueue,
}: PlayerQueueProps) {
  const [sortBy, setSortBy] = useState<'skill' | 'games'>('skill');

  const queuePlayers = queuePlayerIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  // Sort players based on selected criteria
  const sortedQueuePlayers = [...queuePlayers].sort((a, b) => {
    if (sortBy === 'skill') {
      // Sort by skill level first: Advanced → Intermediate → Beginner
      // Then by skillScore within same level
      const levelPriority: Record<string, number> = {
        'Advanced': 3,
        'Intermediate': 2,
        'Beginner': 1,
      };
      
      const aLevel = levelPriority[a.level] || 0;
      const bLevel = levelPriority[b.level] || 0;
      
      // Compare level first
      if (bLevel !== aLevel) {
        return bLevel - aLevel;
      }
      
      // If same level, compare by skillScore
      return (b.skillScore || 0) - (a.skillScore || 0);
    } else {
      // Sort by games played: highest to lowest
      return (b.gamesPlayed || 0) - (a.gamesPlayed || 0);
    }
  });

  return (
    <div className="bg-card rounded-lg shadow-md p-6 border border-card-border">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-primary">Player Queue</h2>
        <div className="flex gap-2">
          <Button onClick={onAddPlayer} size="sm" data-testid="button-add-player-queue">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          {queuePlayers.length > 0 && (
            <Button onClick={onClearQueue} variant="outline" size="sm" data-testid="button-clear-queue">
              <RefreshCw className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground" data-testid="text-queue-player-count">{queuePlayers.length}</span> player
          {queuePlayers.length !== 1 ? 's' : ''} waiting
        </p>
        
        {queuePlayers.length > 0 && (
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(value: 'skill' | 'games') => setSortBy(value)}>
              <SelectTrigger className="w-[180px] h-8" data-testid="select-queue-sort">
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
              className="flex items-center justify-between p-3 bg-muted rounded-md border border-transparent hover:border-border transition-all hover-elevate"
              data-testid={`queue-player-${player.id}`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{player.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge className={cn("text-xs", getLevelColor(player.level))}>
                      {player.level}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {player.gamesPlayed} games · {player.wins} wins
                    </span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => onRemoveFromQueue(player.id)}
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
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
          <Button onClick={onAddPlayer} data-testid="button-add-player-empty">
            <Plus className="w-4 h-4 mr-2" />
            Add First Player
          </Button>
        </div>
      )}
    </div>
  );
}
