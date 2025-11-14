import { Trophy, TrendingUp } from "lucide-react";
import { Player } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

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

export function SessionLeaderboard({ sessionId }: SessionLeaderboardProps) {
  // Fetch session-specific stats
  const { data: players = [], isLoading } = useQuery<SessionPlayer[]>({
    queryKey: ['/api/stats/session', sessionId],
    enabled: !!sessionId,
  });
  
  const sortPlayers = (playersToSort: SessionPlayer[]) => {
    return [...playersToSort].sort((a, b) => {
      // Sort by games played in session, then wins in session
      const gamesA = a.gamesPlayedInSession || 0;
      const gamesB = b.gamesPlayedInSession || 0;
      const winsA = a.winsInSession || 0;
      const winsB = b.winsInSession || 0;
      
      if (gamesB !== gamesA) return gamesB - gamesA;
      if (winsB !== winsA) return winsB - winsA;
      // Then by skill score
      const skillA = a.skillScore || 50;
      const skillB = b.skillScore || 50;
      if (skillB !== skillA) return skillB - skillA;
      return a.name.localeCompare(b.name);
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
