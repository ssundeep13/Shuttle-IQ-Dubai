import { Trophy, Trash2, Calendar, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, CalendarDays } from "lucide-react";
import { Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
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
import { formatSkillLevel, getSkillTierColor, getTierDisplayName } from "@shared/utils/skillUtils";
import { format, subMonths } from "date-fns";

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

interface MonthlyPlayer extends Player {
  gamesPlayedInMonth?: number;
  winsInMonth?: number;
}

type MonthFilter = 'all-time' | string; // string format: "YYYY-MM"

// Using getSkillTierColor from skillUtils instead of local function

type SortBy = 'skill' | 'wins' | 'games' | 'winRate' | 'name';
type SortOrder = 'asc' | 'desc';

export function Leaderboard({ players, onResetStats, onClearAllPlayers, showAdminActions = true, showTodayTab = true }: LeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'all-time' | 'today'>('all-time');
  const [sortBy, setSortBy] = useState<SortBy>('skill');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all-time');
  
  // Generate month options (current month + past 11 months)
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = subMonths(now, i);
      const value = format(date, 'yyyy-MM');
      const label = format(date, 'MMMM yyyy');
      options.push({ value, label });
    }
    
    return options;
  }, []);
  
  // Parse month filter for API call
  const monthParts = monthFilter !== 'all-time' ? monthFilter.split('-') : null;
  const selectedYear = monthParts ? parseInt(monthParts[0]) : null;
  const selectedMonth = monthParts ? parseInt(monthParts[1]) : null;
  
  // Fetch today's stats (only if today tab is enabled and active)
  const { data: todayPlayers = [] } = useQuery<TodayPlayer[]>({
    queryKey: ['/api/stats/today'],
    enabled: showTodayTab && activeTab === 'today',
  });
  
  // Fetch monthly stats (only when a month is selected)
  const { data: monthlyPlayers = [], isLoading: isLoadingMonthly } = useQuery<MonthlyPlayer[]>({
    queryKey: ['/api/stats/month', selectedYear, selectedMonth],
    enabled: monthFilter !== 'all-time' && selectedYear !== null && selectedMonth !== null,
  });
  
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };
  
  type FilterMode = 'all-time' | 'today' | 'monthly';
  
  const getPlayerStats = (player: Player | TodayPlayer | MonthlyPlayer, mode: FilterMode) => {
    if (mode === 'today' && 'gamesPlayedToday' in player) {
      return {
        games: player.gamesPlayedToday || 0,
        wins: player.winsToday || 0,
      };
    }
    if (mode === 'monthly' && 'gamesPlayedInMonth' in player) {
      return {
        games: player.gamesPlayedInMonth || 0,
        wins: player.winsInMonth || 0,
      };
    }
    return {
      games: player.gamesPlayed,
      wins: player.wins,
    };
  };
  
  const sortPlayers = (playersToSort: (Player | TodayPlayer | MonthlyPlayer)[], mode: FilterMode) => {
    return [...playersToSort].sort((a, b) => {
      const statsA = getPlayerStats(a, mode);
      const statsB = getPlayerStats(b, mode);
      
      const skillA = a.skillScore || 90;
      const skillB = b.skillScore || 90;
      const winRateA = statsA.games === 0 ? 0 : (statsA.wins / statsA.games) * 100;
      const winRateB = statsB.games === 0 ? 0 : (statsB.wins / statsB.games) * 100;
      
      let comparison = 0;
      
      switch (sortBy) {
        case 'skill':
          comparison = skillB - skillA;
          break;
        case 'wins':
          comparison = statsB.wins - statsA.wins;
          break;
        case 'games':
          comparison = statsB.games - statsA.games;
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

  const getWinRate = (player: Player | TodayPlayer | MonthlyPlayer, mode: FilterMode = 'all-time') => {
    const stats = getPlayerStats(player, mode);
    if (stats.games === 0) return 0;
    return Math.round((stats.wins / stats.games) * 100);
  };

  const getEmptyMessage = (mode: FilterMode) => {
    switch (mode) {
      case 'today':
        return "No games played today yet.";
      case 'monthly':
        return "No games played this month yet.";
      default:
        return "No players yet. Add players to see the leaderboard.";
    }
  };
  
  const renderPlayerList = (playersToRender: (Player | TodayPlayer | MonthlyPlayer)[], mode: FilterMode) => {
    const sortedPlayers = sortPlayers(playersToRender, mode);
    
    if (sortedPlayers.length === 0) {
      return (
        <div className="text-center py-12 bg-muted rounded-md">
          <p className="text-muted-foreground">
            {getEmptyMessage(mode)}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const stats = getPlayerStats(player, mode);
          
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
                  {index < 3 ? <Trophy className="w-4 h-4" /> : index + 1}
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
                    {player.tierCandidate && (
                      <span className="text-xs text-muted-foreground">
                        → {getTierDisplayName(player.tierCandidate)} {player.tierCandidateGames}/3
                      </span>
                    )}
                    {player.status === 'playing' && (
                      <Badge className="bg-info/10 text-info border-info/20">Playing</Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Games: <span className="font-semibold text-foreground">{stats.games}</span></span>
                    <span>Wins: <span className="font-semibold text-success">{stats.wins}</span></span>
                    <span>Win Rate: <span className="font-semibold text-foreground">{getWinRate(player, mode)}%</span></span>
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
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-sort-by">
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
        
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Select value={monthFilter} onValueChange={(value) => setMonthFilter(value as MonthFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-month-filter">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All Time</SelectItem>
              {monthOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {monthFilter === 'all-time' 
              ? renderPlayerList(players, 'all-time')
              : isLoadingMonthly 
                ? <div className="text-center py-12 bg-muted rounded-md"><p className="text-muted-foreground">Loading...</p></div>
                : renderPlayerList(monthlyPlayers, 'monthly')
            }
          </TabsContent>

          <TabsContent value="today" className="mt-0">
            {renderPlayerList(todayPlayers, 'today')}
          </TabsContent>
        </Tabs>
      ) : (
        <div>
          {monthFilter === 'all-time' 
            ? renderPlayerList(players, 'all-time')
            : isLoadingMonthly 
              ? <div className="text-center py-12 bg-muted rounded-md"><p className="text-muted-foreground">Loading...</p></div>
              : renderPlayerList(monthlyPlayers, 'monthly')
          }
        </div>
      )}
    </div>
  );
}
