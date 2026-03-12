import { useQuery } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { Trophy, Target, TrendingUp, Swords, ArrowUp, ArrowDown } from 'lucide-react';
import type { PlayerStats } from '@shared/schema';

export default function MyScores() {
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;

  const { data: stats, isLoading } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  if (!linkedPlayerId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Scores</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Link your ShuttleIQ profile</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your marketplace account to your ShuttleIQ player profile to view your scores and rankings.
            </p>
            <Link href="/marketplace/profile">
              <Button data-testid="button-link-profile">Go to Profile Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">My Scores</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats) return null;

  const trendIcon = stats.performanceTrend === 'improving' ? <TrendingUp className="h-4 w-4 text-green-500" />
    : stats.performanceTrend === 'declining' ? <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Scores</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card data-testid="card-stat-skill">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold" data-testid="text-skill-score">{stats.player.skillScore}</div>
            <div className="text-sm text-muted-foreground">Skill Score</div>
            <Badge variant="secondary" className="mt-1">{stats.player.level}</Badge>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-games">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.totalGames}</div>
            <div className="text-sm text-muted-foreground">Games Played</div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-wins">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.totalWins}</div>
            <div className="text-sm text-muted-foreground">Wins</div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-winrate">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.winRate}%</div>
            <div className="text-sm text-muted-foreground">Win Rate</div>
            {trendIcon && <div className="flex items-center justify-center gap-1 mt-1">{trendIcon}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> Rankings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">By Skill Score</span>
              <span className="font-medium">#{stats.rankBySkillScore} of {stats.totalPlayersRanked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">By Wins</span>
              <span className="font-medium">#{stats.rankByWins} of {stats.totalPlayersRanked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">By Win Rate</span>
              <span className="font-medium">#{stats.rankByWinRate} of {stats.totalPlayersRanked}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Swords className="h-4 w-4" /> Streaks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current</span>
              <span className="font-medium">
                {stats.currentStreak.count > 0 ? `${stats.currentStreak.count} ${stats.currentStreak.type}` : 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best Win Streak</span>
              <span className="font-medium">{stats.longestWinStreak}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Score Diff</span>
              <span className="font-medium">{stats.avgScoreDifferential > 0 ? '+' : ''}{stats.avgScoreDifferential}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.recentGames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Games</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentGames.map((game) => (
                <div key={game.gameId} className="flex items-center justify-between gap-2 py-2 border-b last:border-0" data-testid={`row-game-${game.gameId}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={game.won ? 'default' : 'outline'} className="text-xs">
                        {game.won ? 'W' : 'L'}
                      </Badge>
                      <span className="text-sm font-medium">{game.score}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      w/ {game.partnerName} vs {game.opponentNames.join(', ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {game.skillScoreBefore != null && game.skillScoreAfter != null && (
                      <div className="flex items-center gap-1 text-sm">
                        {game.skillScoreAfter > game.skillScoreBefore ? (
                          <ArrowUp className="h-3 w-3 text-green-500" />
                        ) : game.skillScoreAfter < game.skillScoreBefore ? (
                          <ArrowDown className="h-3 w-3 text-red-500" />
                        ) : null}
                        <span className="font-medium">{game.skillScoreAfter}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
