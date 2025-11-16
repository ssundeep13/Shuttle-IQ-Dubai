import { Trophy, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
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

interface SessionLeaderboardProps {
  sessionId: string;
}

interface SessionPlayer extends Player {
  gamesPlayedInSession: number;
  winsInSession: number;
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

type SortBy = 'skill' | 'wins' | 'games' | 'winRate' | 'name';
type SortOrder = 'asc' | 'desc';

export function SessionLeaderboard({ sessionId }: SessionLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortBy>('games');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Fetch session-specific stats
  const { data: players = [], isLoading } = useQuery<SessionPlayer[]>({
    queryKey: ['/api/stats/session', sessionId],
    enabled: !!sessionId,
  });
  
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };
  
  const sortPlayers = (playersToSort: SessionPlayer[]) => {
    return [...playersToSort].sort((a, b) => {
      const gamesA = a.gamesPlayedInSession || 0;
      const gamesB = b.gamesPlayedInSession || 0;
      const winsA = a.winsInSession || 0;
      const winsB = b.winsInSession || 0;
      const skillA = a.skillScore || 100;
      const skillB = b.skillScore || 100;
      const winRateA = gamesA === 0 ? 0 : (winsA / gamesA) * 100;
      const winRateB = gamesB === 0 ? 0 : (winsB / gamesB) * 100;
      
      let comparison = 0;
      
      switch (sortBy) {
        case 'skill':
          comparison = skillB - skillA;
          break;
        case 'wins':
          comparison = winsB - winsA;
          break;
        case 'games':
          comparison = gamesB - gamesA;
          break;
        case 'winRate':
          comparison = winRateB - winRateA;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }
      
      // Apply sort order
      const result = sortOrder === 'desc' ? comparison : -comparison;
      
      // If equal, use name as tiebreaker
      if (result === 0) {
        return a.name.localeCompare(b.name);
      }
      
      return result;
    });
  };

  const getWinRate = (player: SessionPlayer) => {
    const games = player.gamesPlayedInSession || 0;
    if (games === 0) return 0;
    return Math.round(((player.winsInSession || 0) / games) * 100);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 bg-muted rounded-md">
        <p className="text-muted-foreground">Loading session leaderboard...</p>
      </div>
    );
  }

  const sortedPlayers = sortPlayers(players);
  
  if (sortedPlayers.length === 0) {
    return (
      <div className="text-center py-12 bg-muted rounded-md">
        <p className="text-muted-foreground">
          No players in this session yet. Add players to see the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="session-leaderboard">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Session Leaderboard</h3>
        <Badge variant="outline" className="ml-auto">
          <TrendingUp className="w-3 h-3 mr-1" />
          {sortedPlayers.length} Players
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Sort by:</label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-session-sort-by">
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
            className="flex-shrink-0"
            data-testid="button-session-toggle-sort"
          >
            {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const gamesCount = player.gamesPlayedInSession || 0;
          const winsCount = player.winsInSession || 0;
          
          return (
            <div
              key={player.id}
              className={cn(
                "flex items-center justify-between p-3 sm:p-4 rounded-md border transition-all hover-elevate min-h-[5rem]",
                index < 3 ? "bg-muted border-border" : "bg-card border-card-border"
              )}
              data-testid={`session-leaderboard-player-${player.id}`}
            >
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div
                  className={cn(
                    "flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold flex-shrink-0",
                    index === 0 && "bg-warning/20 text-warning",
                    index === 1 && "bg-muted-foreground/20 text-muted-foreground",
                    index === 2 && "bg-destructive/20 text-destructive",
                    index > 2 && "bg-muted text-muted-foreground"
                  )}
                >
                  {index < 3 ? "🏆" : index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-foreground text-base sm:text-lg truncate">{player.name}</p>
                    <Badge className={cn("text-xs", getLevelColor(player.level))}>
                      {player.gender && player.gender === 'Male' ? 'M' : 'F'} {player.level}
                    </Badge>
                    {player.status === 'playing' && (
                      <Badge className="bg-info/10 text-info border-info/20">Playing</Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Skill: <span className="font-bold text-accent text-base">{player.skillScore || 100}</span></span>
                    <span>Games: <span className="font-semibold text-foreground">{gamesCount}</span></span>
                    <span>Wins: <span className="font-semibold text-success">{winsCount}</span></span>
                    <span>Win Rate: <span className="font-semibold text-foreground">{getWinRate(player)}%</span></span>
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
