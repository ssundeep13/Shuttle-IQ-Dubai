import { Trophy, TrendingUp, ArrowUp, ArrowDown, Medal } from "lucide-react";
import { Player } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatSkillLevel,
  getSkillTierColor,
  getTierDisplayName,
} from "@shared/utils/skillUtils";

interface SessionLeaderboardProps {
  sessionId: string;
}

interface SessionPlayer extends Player {
  gamesPlayedInSession: number;
  winsInSession: number;
}

type SortBy = "skill" | "wins" | "games" | "winRate" | "name";
type SortOrder = "asc" | "desc";

// ─── rank decoration ─────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  // Rank is 1-based (first place = 1)
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 shrink-0">
        <Trophy className="w-4 h-4 text-amber-600" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 shrink-0">
        <Medal className="w-4 h-4 text-slate-500" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-100 shrink-0">
        <Medal className="w-4 h-4 text-orange-600" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted shrink-0">
      <span className="text-sm font-bold text-muted-foreground">{rank}</span>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function SessionLeaderboard({ sessionId }: SessionLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortBy>("games");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const { data: players = [], isLoading } = useQuery<SessionPlayer[]>({
    queryKey: ["/api/stats/session", sessionId],
    enabled: !!sessionId,
  });

  const toggleSortOrder = () =>
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const sortPlayers = (list: SessionPlayer[]) =>
    [...list].sort((a, b) => {
      const gA = a.gamesPlayedInSession || 0;
      const gB = b.gamesPlayedInSession || 0;
      const wA = a.winsInSession || 0;
      const wB = b.winsInSession || 0;
      const sA = a.skillScore || 90;
      const sB = b.skillScore || 90;
      const wrA = gA === 0 ? 0 : (wA / gA) * 100;
      const wrB = gB === 0 ? 0 : (wB / gB) * 100;

      let cmp = 0;
      switch (sortBy) {
        case "skill":    cmp = sB - sA; break;
        case "wins":     cmp = wB - wA; break;
        case "games":    cmp = gB - gA; break;
        case "winRate":  cmp = wrB - wrA; break;
        case "name":     cmp = a.name.localeCompare(b.name); break;
      }
      const result = sortOrder === "desc" ? cmp : -cmp;
      return result === 0 ? a.name.localeCompare(b.name) : result;
    });

  const getWinRate = (p: SessionPlayer) => {
    const g = p.gamesPlayedInSession || 0;
    return g === 0 ? 0 : Math.round(((p.winsInSession || 0) / g) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 rounded-lg bg-muted/40 border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Loading session leaderboard…</p>
      </div>
    );
  }

  const sortedPlayers = sortPlayers(players);

  if (sortedPlayers.length === 0) {
    return (
      <div className="flex items-center justify-center py-14 rounded-lg bg-muted/40 border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No players in this session yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="session-leaderboard">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Session Leaderboard</h3>
        </div>
        <Badge variant="outline">
          <TrendingUp className="w-3 h-3 mr-1" />
          {sortedPlayers.length} Players
        </Badge>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground shrink-0">Sort by</span>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[160px] h-9" data-testid="select-session-sort-by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skill">Skill Score</SelectItem>
            <SelectItem value="wins">Wins</SelectItem>
            <SelectItem value="games">Games Played</SelectItem>
            <SelectItem value="winRate">Win Rate</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSortOrder}
          className="h-9 w-9 shrink-0"
          data-testid="button-session-toggle-sort"
        >
          {sortOrder === "desc" ? (
            <ArrowDown className="w-4 h-4" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Player rows */}
      <div className="space-y-2">
        {sortedPlayers.map((player, index) => {
          const rank = index + 1;
          const gamesCount = player.gamesPlayedInSession || 0;
          const winsCount = player.winsInSession || 0;
          const isTopThree = rank <= 3;

          return (
            <div
              key={player.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover-elevate min-h-[64px]",
                rank === 1
                  ? "bg-amber-50 border-amber-200"
                  : rank === 2
                    ? "bg-slate-50 border-slate-200"
                    : rank === 3
                      ? "bg-orange-50 border-orange-200"
                      : "bg-card border-border",
              )}
              data-testid={`session-leaderboard-player-${player.id}`}
            >
              {/* Rank badge */}
              <RankBadge rank={rank} />

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-foreground truncate">{player.name}</p>
                  {player.shuttleIqId && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {player.shuttleIqId}
                    </Badge>
                  )}
                  <Badge
                    className={cn("text-xs shrink-0", getSkillTierColor(player.level))}
                  >
                    {player.gender === "Male" ? "M" : "F"}{" "}
                    {formatSkillLevel(player.skillScore || 90)}
                  </Badge>
                  {player.tierCandidate && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      → {getTierDisplayName(player.tierCandidate)}{" "}
                      {player.tierCandidateGames}/3
                    </span>
                  )}
                  {player.status === "playing" && (
                    <Badge className="bg-info/10 text-info border-info/20 text-xs shrink-0">
                      Playing
                    </Badge>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Games{" "}
                    <span className="font-semibold text-foreground">{gamesCount}</span>
                  </span>
                  <span>
                    Wins{" "}
                    <span className="font-semibold text-emerald-600">{winsCount}</span>
                  </span>
                  <span>
                    Win rate{" "}
                    <span className="font-semibold text-foreground">
                      {getWinRate(player)}%
                    </span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
