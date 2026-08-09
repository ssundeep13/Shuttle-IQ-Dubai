import { Plus, Trash2, RefreshCw, ArrowUpDown, Coffee } from "lucide-react";
import { apiUrl } from '@/lib/queryClient';
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
import { formatSkillLevel, getSkillTierColor, getTierDisplayName } from "@shared/utils/skillUtils";
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
  const [sortBy, setSortBy] = useState<"skill" | "games">("skill");

  const { data: todayPlayers = [] } = useQuery<TodayPlayer[]>({
    queryKey: ["/api/stats/today"],
  });

  const { data: sittingOutData } = useQuery<{ sittingOut: string[] }>({
    queryKey: ["/api/sessions", sessionId, "queue", "sitting-out"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/queue/sitting-out`), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
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
    mutationFn: async (playerId: string) =>
      apiRequest(
        "POST",
        `/api/sessions/${sessionId}/queue/players/${playerId}/sit-out`,
        null,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/sessions", sessionId, "queue", "sitting-out"],
      });
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

  const sortedQueuePlayers = [...queuePlayers].sort((a, b) =>
    sortBy === "skill"
      ? (b.skillScore || 90) - (a.skillScore || 90)
      : (b.gamesPlayedToday || 0) - (a.gamesPlayedToday || 0),
  );

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-semibold text-foreground">
          Player Queue
          {queuePlayers.length > 0 && (
            <span
              className="ml-2 text-sm font-normal text-muted-foreground"
              data-testid="text-queue-player-count"
            >
              {queuePlayers.length}{" "}
              {queuePlayers.length === 1 ? "player" : "players"}
              {sittingOutSet.size > 0 && ` · ${sittingOutSet.size} sitting out`}
            </span>
          )}
        </h2>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={onAddPlayer}
            size="sm"
            className="min-h-10"
            data-testid="button-add-player-queue"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add
          </Button>
          {queuePlayers.length > 0 && (
            <Button
              onClick={onClearQueue}
              variant="outline"
              size="sm"
              className="min-h-10"
              data-testid="button-clear-queue"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Sort row */}
      {queuePlayers.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select
            value={sortBy}
            onValueChange={(v: "skill" | "games") => setSortBy(v)}
          >
            <SelectTrigger
              className="w-[180px] h-9"
              data-testid="select-queue-sort"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skill" data-testid="option-sort-skill">
                Sort by Skill Level
              </SelectItem>
              <SelectItem value="games" data-testid="option-sort-games">
                Sort by Games Played
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Player list */}
      {queuePlayers.length > 0 ? (
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto -mx-1 px-1">
          {sortedQueuePlayers.map((player) => {
            const isSittingOut = sittingOutSet.has(player.id);
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors min-h-[60px]",
                  isSittingOut
                    ? "bg-muted/40 border-border opacity-60"
                    : "bg-card border-border hover-elevate",
                )}
                data-testid={`queue-player-${player.id}`}
              >
                {/* Position badge — the player's REAL queue position (server
                    order), not their row number in the sorted display list */}
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0",
                    isSittingOut
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {queuePlayerIds.indexOf(player.id) + 1}
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={cn(
                        "font-semibold text-sm truncate",
                        isSittingOut ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {player.name}
                    </p>
                    {player.shuttleIqId && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {player.shuttleIqId}
                      </Badge>
                    )}
                    {isSittingOut && (
                      <Badge
                        variant="outline"
                        className="text-xs text-amber-600 border-amber-300 shrink-0"
                      >
                        Sitting out
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <Badge
                      className={cn("text-xs", getSkillTierColor(player.level))}
                    >
                      {player.gender === "Male" ? "M" : "F"}{" "}
                      {formatSkillLevel(player.skillScore || 90)}
                    </Badge>
                    {player.tierCandidate && (
                      <span className="text-xs text-muted-foreground">
                        → {getTierDisplayName(player.tierCandidate)}{" "}
                        {player.tierCandidateGames}/3
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {player.gamesPlayedToday || 0}g · {player.winsToday || 0}W
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {sessionId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => toggleSitOutMutation.mutate(player.id)}
                          variant="ghost"
                          size="icon"
                          disabled={toggleSitOutMutation.isPending}
                          className={cn(
                            "h-10 w-10",
                            isSittingOut
                              ? "text-amber-500 hover:text-amber-600"
                              : "text-muted-foreground hover:text-amber-500",
                          )}
                          data-testid={`button-sit-out-${player.id}`}
                        >
                          <Coffee className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isSittingOut
                          ? "Resume — player will be eligible again"
                          : "Sit out — until resumed"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    onClick={() => onRemoveFromQueue(player.id)}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
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
        <div className="flex flex-col items-center justify-center py-14 rounded-xl bg-muted/40 border border-dashed border-border">
          <p className="text-sm text-muted-foreground mb-4">Queue is empty</p>
          <Button
            onClick={onAddPlayer}
            size="sm"
            className="min-h-10"
            data-testid="button-add-player-empty"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add First Player
          </Button>
        </div>
      )}
    </div>
  );
}
