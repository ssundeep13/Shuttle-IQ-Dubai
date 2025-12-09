import { Trophy, Trash2, Calendar, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSkillLevel, getSkillTierColor } from "@shared/utils/skillUtils";

interface LeaderboardProps {
  players: Player[];
  onResetStats?: () => void;
  onClearAllPlayers?: () => void;
  showAdminActions?: boolean;
  showTodayTab?: boolean;
}

interface TodayPlayer extends Player {
  gamesPlayedToday?: number;
  winsToday?: number;
}

// Using getSkillTierColor from skillUtils instead of local function

type SortBy = 'skill' | 'wins' | 'games' | 'winRate' | 'name';
type SortOrder = 'asc' | 'desc';

export function Leaderboard({ players, onResetStats, onClearAllPlayers, showAdminActions = true, showTodayTab = true }: LeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'all-time' | 'today'>('all-time');
  const [sortBy, setSortBy] = useState<SortBy>('skill');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Fetch today's stats (only if today tab is enabled and active)
  const { data: todayPlayers = [] } = useQuery<TodayPlayer[]>({
    queryKey: ['/api/stats/today'],
    enabled: showTodayTab && activeTab === 'today',
  });
  
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };
  
  const sortPlayers = (playersToSort: (Player | TodayPlayer)[], isToday: boolean) => {
    return [...playersToSort].sort((a, b) => {
      const playerA = isToday ? a as TodayPlayer : a;
      const playerB = isToday ? b as TodayPlayer : b;
      
      const gamesA = isToday ? (playerA as TodayPlayer).gamesPlayedToday || 0 : a.gamesPlayed;
      const gamesB = isToday ? (playerB as TodayPlayer).gamesPlayedToday || 0 : b.gamesPlayed;
      const winsA = isToday ? (playerA as TodayPlayer).winsToday || 0 : a.wins;
      const winsB = isToday ? (playerB as TodayPlayer).winsToday || 0 : b.wins;
      const skillA = a.skillScore || 90;
      const skillB = b.skillScore || 90;
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

  const getWinRate = (player: Player | TodayPlayer, isToday: boolean = false) => {
    if (isToday && 'gamesPlayedToday' in player) {
      const games = player.gamesPlayedToday || 0;
      if (games === 0) return 0;
      return Math.round(((player.winsToday || 0) / games) * 100);
    }
    if (player.gamesPlayed === 0) return 0;
    return Math.round((player.wins / player.gamesPlayed) * 100);
  };

  const renderPlayerList = (playersToRender: (Player | TodayPlayer)[], isToday: boolean) => {
    const sortedPlayers = sortPlayers(playersToRender, isToday);
    
    if (sortedPlayers.length === 0) {
      return (
        <div className="text-center py-12 bg-muted rounded-md">
          <p className="text-muted-foreground">
            {isToday ? "No games played today yet." : "No players yet. Add players to see the leaderboard."}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const todayPlayer = player as TodayPlayer;
          const gamesCount = isToday ? (todayPlayer.gamesPlayedToday || 0) : player.gamesPlayed;
          const winsCount = isToday ? (todayPlayer.winsToday || 0) : player.wins;
          
          return (
            <div
              key={player.id}
              className={cn(
                "flex items-center justify-between p-3 sm:p-4 rounded-md border transition-all hover-elevate min-h-[5rem]",
                index < 3 ? "bg-muted border-border" : "bg-card border-card-border"
              )}
              data-testid={`leaderboard-player-${player.id}`}
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
                    <Link href={`/player/${player.id}`}>
                      <span className="font-semibold text-foreground text-base sm:text-lg truncate hover:underline cursor-pointer">
                        {player.name}
                      </span>
                    </Link>
                    {player.shuttleIqId && (
                      <Badge variant="outline" className="text-xs">
                        {player.shuttleIqId}
                      </Badge>
                    )}
                    <Badge className={cn("text-xs", getSkillTierColor(player.level))}>
                      {player.gender && player.gender === 'Male' ? 'M' : 'F'} {formatSkillLevel(player.skillScore || 90)}
                    </Badge>
                    {player.status === 'playing' && (
                      <Badge className="bg-info/10 text-info border-info/20">Playing</Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Games: <span className="font-semibold text-foreground">{gamesCount}</span></span>
                    <span>Wins: <span className="font-semibold text-success">{winsCount}</span></span>
                    <span>Win Rate: <span className="font-semibold text-foreground">{getWinRate(player, isToday)}%</span></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-lg shadow-md p-6 border border-card-border">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          Leaderboard
        </h2>
        {showAdminActions && onResetStats && onClearAllPlayers && (
          <div className="flex gap-2">
            <Button
              onClick={onResetStats}
              variant="outline"
              size="sm"
              className="min-h-12 sm:min-h-9"
              data-testid="button-reset-stats"
            >
              Reset Stats
            </Button>
            <Button
              onClick={onClearAllPlayers}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive min-h-12 sm:min-h-9"
              data-testid="button-clear-all-players"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Sort by:</label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-sort-by">
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
            data-testid="button-toggle-sort-order"
          >
            {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {showTodayTab ? (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all-time' | 'today')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 min-h-12 sm:min-h-10">
            <TabsTrigger value="all-time" className="flex items-center gap-2 min-h-12 sm:min-h-9" data-testid="tab-all-time">
              <TrendingUp className="w-4 h-4" />
              All Time
            </TabsTrigger>
            <TabsTrigger value="today" className="flex items-center gap-2 min-h-12 sm:min-h-9" data-testid="tab-today">
              <Calendar className="w-4 h-4" />
              Today
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all-time" className="mt-0">
            {renderPlayerList(players, false)}
          </TabsContent>

          <TabsContent value="today" className="mt-0">
            {renderPlayerList(todayPlayers, true)}
          </TabsContent>
        </Tabs>
      ) : (
        <div>
          {renderPlayerList(players, false)}
        </div>
      )}
    </div>
  );
}
