import { Plus, Trash2, RefreshCw, ArrowUpDown, Coffee } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSkillLevel, getSkillTierColor } from "@shared/utils/skillUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  sessionId?: string;
}

export function PlayerQueue({
  players,
  queuePlayerIds,
  onAddPlayer,
  onRemoveFromQueue,
  onClearQueue,
  sessionId,
}: PlayerQueueProps) {
  const [sortBy, setSortBy] = useState<'skill' | 'games'>('skill');

  const { data: todayPlayers = [] } = useQuery<TodayPlayer[]>({
    queryKey: ['/api/stats/today'],
  });

  const { data: sittingOutData } = useQuery<{ sittingOut: string[] }>({
    queryKey: ['/api/sessions', sessionId, 'queue', 'sitting-out'],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/queue/sitting-out`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (!res.ok) return { sittingOut: [] };
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 5000,
  });

  const sittingOutSet = new Set(sittingOutData?.sittingOut ?? []);

  const toggleSitOutMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return await apiRequest('POST', `/api/sessions/${sessionId}/queue/players/${playerId}/sit-out`, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId, 'queue', 'sitting-out'] });
    },
  });

  const queuePlayers = queuePlayerIds
    .map((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return undefined;
      const todayStats = todayPlayers.find((tp) => tp.id === id);
      return {
        ...player,
        gamesPlayedToday: todayStats?.gamesPlayedToday ?? 0,
        winsToday: todayStats?.winsToday ?? 0,
      } as TodayPlayer;
    })
    .filter((p): p is TodayPlayer => p !== undefined);

  const sortedQueuePlayers = [...queuePlayers].sort((a, b) => {
    if (sortBy === 'skill') {
      return (b.skillScore || 90) - (a.skillScore || 90);
    } else {
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
          {sittingOutSet.size > 0 && (
            <span className="ml-1 text-muted-foreground">
              · <span className="font-medium">{sittingOutSet.size}</span> sitting out
            </span>
          )}
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
          {sortedQueuePlayers.map((player, index) => {
            const isSittingOut = sittingOutSet.has(player.id);
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center justify-between p-3 sm:p-3 rounded-md border border-transparent hover:border-border transition-all hover-elevate min-h-[4rem]",
                  isSittingOut
                    ? "bg-muted/40 opacity-60"
                    : "bg-muted"
                )}
                data-testid={`queue-player-${player.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 sm:w-8 sm:h-8 rounded-full font-bold text-sm flex-shrink-0",
                    isSittingOut ? "bg-muted-foreground/20 text-muted-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("font-semibold truncate", isSittingOut ? "text-muted-foreground" : "text-foreground")}>
                        {player.name}
                      </p>
                      {player.shuttleIqId && (
                        <Badge variant="outline" className="text-xs">
                          {player.shuttleIqId}
                        </Badge>
                      )}
                      {isSittingOut && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Sitting out
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge className={cn("text-xs", getSkillTierColor(player.level))}>
                        {player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {player.gamesPlayedToday || 0} games · {player.winsToday || 0} wins
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {sessionId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => toggleSitOutMutation.mutate(player.id)}
                          variant="ghost"
                          size="icon"
                          disabled={toggleSitOutMutation.isPending}
                          className={cn(
                            "min-w-12 min-h-12 sm:min-w-9 sm:min-h-9",
                            isSittingOut
                              ? "text-amber-500"
                              : "text-muted-foreground"
                          )}
                          data-testid={`button-sit-out-${player.id}`}
                        >
                          <Coffee className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isSittingOut ? "Resume — player will be eligible again" : "Sit out next round"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    onClick={() => onRemoveFromQueue(player.id)}
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive min-w-12 min-h-12 sm:min-w-9 sm:min-h-9"
                    data-testid={`button-remove-queue-${player.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
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
