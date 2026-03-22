import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Trophy, Target, Users, TrendingUp, TrendingDown, 
  Calendar, CheckCircle2, XCircle, Flame, Medal, Minus, 
  Swords, Heart, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatSkillLevel, getTierDisplayName } from "@shared/utils/skillUtils";
import type { PlayerStats } from "@shared/schema";

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: stats, isLoading, error } = useQuery<PlayerStats>({
    queryKey: ['/api/players', id, 'stats'],
    queryFn: () => apiRequest('GET', `/api/players/${id}/stats`),
    enabled: !!id,
  });

  const [progressionFilter, setProgressionFilter] = useState<'last10' | 'monthly' | 'all'>('last10');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-32" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Player not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { 
    player, winRate, totalGames, totalWins, bestPartner, recentGames,
    currentStreak, longestWinStreak, longestLossStreak,
    rankBySkillScore, rankByWins, rankByWinRate, totalPlayersRanked,
    performanceTrend, recentWinRate,
    avgScoreDifferential, avgPointsFor, avgPointsAgainst,
    frequentPartners, rivals, favoriteOpponents
  } = stats;

  // Build chart data from game history showing skill score progression
  // Filter out games with missing skill scores
  const validGames = recentGames.filter(
    game => game.skillScoreBefore !== undefined && game.skillScoreAfter !== undefined
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filteredGames = progressionFilter === 'last10'
    ? validGames.slice(0, 10)
    : progressionFilter === 'monthly'
    ? validGames.filter(g => new Date(g.date) >= thirtyDaysAgo)
    : validGames;
  
  const chartData = filteredGames.length > 0
    ? filteredGames
        .slice()
        .reverse()
        .map((game, index) => ({
          gameNumber: index + 1,
          skillScore: index === 0 
            ? (game.skillScoreBefore ?? player.skillScore) 
            : (game.skillScoreAfter ?? player.skillScore),
        }))
    : [];

  const getTrendIcon = () => {
    if (performanceTrend === 'improving') return <TrendingUp className="h-5 w-5 text-green-500" />;
    if (performanceTrend === 'declining') return <TrendingDown className="h-5 w-5 text-red-500" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  const getTrendText = () => {
    if (performanceTrend === 'improving') return 'Improving';
    if (performanceTrend === 'declining') return 'Declining';
    return 'Stable';
  };

  const getTrendColor = () => {
    if (performanceTrend === 'improving') return 'text-green-500';
    if (performanceTrend === 'declining') return 'text-red-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Button>
        </Link>

        {/* Player Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl md:text-3xl" data-testid="text-player-name">
                  {player.name}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="outline" data-testid="badge-shuttle-iq-id">
                    {player.shuttleIqId || 'No ID'}
                  </Badge>
                  <span className="text-muted-foreground">
                    {player.gender === 'Male' ? 'M' : 'F'} • {formatSkillLevel(player.skillScore)}
                  </span>
                  {player.tierCandidate && (
                    <span className="text-xs text-muted-foreground">
                      → {getTierDisplayName(player.tierCandidate)} {player.tierCandidateGames}/3
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-lg px-4 py-2" data-testid="badge-skill-score">
                  {player.skillScore} pts
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Core Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold" data-testid="text-total-games">{totalGames}</div>
              <div className="text-sm text-muted-foreground">Games Played</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
              <div className="text-2xl font-bold" data-testid="text-total-wins">{totalWins}</div>
              <div className="text-sm text-muted-foreground">Total Wins</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <div className="text-2xl font-bold" data-testid="text-win-rate">{winRate}%</div>
              <div className="text-sm text-muted-foreground">Win Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              {currentStreak.type === 'win' ? (
                <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              ) : currentStreak.type === 'loss' ? (
                <TrendingDown className="h-8 w-8 mx-auto mb-2 text-red-500" />
              ) : (
                <Minus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              )}
              <div className="text-2xl font-bold" data-testid="text-current-streak">
                {currentStreak.count > 0 ? `${currentStreak.count}${currentStreak.type === 'win' ? 'W' : 'L'}` : '-'}
              </div>
              <div className="text-sm text-muted-foreground">Current Streak</div>
            </CardContent>
          </Card>
        </div>

        {/* Extended Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Medal className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold" data-testid="text-skill-rank">
                #{rankBySkillScore}
              </div>
              <div className="text-sm text-muted-foreground">Skill Rank</div>
              <div className="text-xs text-muted-foreground">of {totalPlayersRanked}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              {getTrendIcon()}
              <div className={`text-2xl font-bold ${getTrendColor()}`} data-testid="text-trend">
                {getTrendText()}
              </div>
              <div className="text-sm text-muted-foreground">Performance</div>
              <div className="text-xs text-muted-foreground">Recent: {recentWinRate}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              {avgScoreDifferential >= 0 ? (
                <ArrowUpRight className="h-8 w-8 mx-auto mb-2 text-green-500" />
              ) : (
                <ArrowDownRight className="h-8 w-8 mx-auto mb-2 text-red-500" />
              )}
              <div className={`text-2xl font-bold ${avgScoreDifferential >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-score-diff">
                {avgScoreDifferential >= 0 ? '+' : ''}{avgScoreDifferential}
              </div>
              <div className="text-sm text-muted-foreground">Avg Differential</div>
              <div className="text-xs text-muted-foreground">{avgPointsFor} for / {avgPointsAgainst} against</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <div className="text-2xl font-bold" data-testid="text-longest-streak">
                {longestWinStreak}W
              </div>
              <div className="text-sm text-muted-foreground">Best Streak</div>
              <div className="text-xs text-muted-foreground">Worst: {longestLossStreak}L</div>
            </CardContent>
          </Card>
        </div>

        {/* Partners Section */}
        {frequentPartners && frequentPartners.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Partners
              </CardTitle>
              <CardDescription>Players you've teamed up with most</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {frequentPartners.map((partner, index) => (
                  <div
                    key={partner.player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`partner-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      {index === 0 && <Heart className="h-5 w-5 text-pink-500" />}
                      <div>
                        <Link href={`/player/${partner.player.id}`}>
                          <span className="font-medium hover:underline cursor-pointer">
                            {partner.player.name}
                          </span>
                        </Link>
                        <div className="text-sm text-muted-foreground">
                          {formatSkillLevel(partner.player.skillScore)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-medium">{partner.gamesTogether} games</div>
                        <div className="text-sm text-muted-foreground">
                          {partner.winsTogether} wins
                        </div>
                      </div>
                      <Badge 
                        variant={partner.winRate >= 50 ? "default" : "secondary"}
                        className={partner.winRate >= 60 ? "bg-green-500" : ""}
                      >
                        {partner.winRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rivals Section */}
        {rivals && rivals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Swords className="h-5 w-5" />
                Rivals
              </CardTitle>
              <CardDescription>Your most frequent opponents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rivals.map((rival, index) => (
                  <div
                    key={rival.player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`rival-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <Link href={`/player/${rival.player.id}`}>
                          <span className="font-medium hover:underline cursor-pointer">
                            {rival.player.name}
                          </span>
                        </Link>
                        <div className="text-sm text-muted-foreground">
                          {formatSkillLevel(rival.player.skillScore)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-medium">
                          <span className="text-green-500">{rival.winsAgainst}W</span>
                          <span className="text-muted-foreground"> - </span>
                          <span className="text-red-500">{rival.lossesAgainst}L</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {rival.gamesAgainst} games
                        </div>
                      </div>
                      <Badge 
                        variant={rival.winRate >= 50 ? "default" : "secondary"}
                        className={rival.winRate >= 60 ? "bg-green-500" : rival.winRate < 40 ? "bg-red-500" : ""}
                      >
                        {rival.winRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Favorite Opponents */}
        {favoriteOpponents && favoriteOpponents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Favorite Opponents
              </CardTitle>
              <CardDescription>Players you beat most often (min 2 games)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {favoriteOpponents.map((opponent, index) => (
                  <div
                    key={opponent.player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`favorite-opponent-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <Link href={`/player/${opponent.player.id}`}>
                          <span className="font-medium hover:underline cursor-pointer">
                            {opponent.player.name}
                          </span>
                        </Link>
                        <div className="text-sm text-muted-foreground">
                          {formatSkillLevel(opponent.player.skillScore)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-medium text-green-500">
                          {opponent.winsAgainst} wins
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {opponent.gamesAgainst} games
                        </div>
                      </div>
                      <Badge className="bg-green-500">
                        {opponent.winRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Skill Score Progression Chart */}
        {(validGames.length > 0) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Skill Score Progression
                </CardTitle>
                <div className="flex gap-1" data-testid="filter-progression">
                  {(['last10', 'monthly', 'all'] as const).map(f => (
                    <Button
                      key={f}
                      size="sm"
                      variant={progressionFilter === f ? 'default' : 'ghost'}
                      onClick={() => setProgressionFilter(f)}
                      data-testid={`filter-progression-${f}`}
                    >
                      {f === 'last10' ? 'Last 10' : f === 'monthly' ? 'This Month' : 'All Time'}
                    </Button>
                  ))}
                </div>
              </div>
              <CardDescription>
                {progressionFilter === 'last10' ? 'Last 10 games' : progressionFilter === 'monthly' ? 'Last 30 days' : 'All games'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                  No games in this period
                </div>
              ) : (
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis 
                        dataKey="gameNumber" 
                        label={{ value: 'Game #', position: 'insideBottomRight', offset: -5 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis 
                        label={{ value: 'Skill Score', angle: -90, position: 'insideLeft' }}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => `${value} pts`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="skillScore" 
                        stroke="var(--primary)" 
                        dot={{ fill: 'var(--primary)', r: 4 }}
                        activeDot={{ r: 6 }}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Games */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentGames.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No games recorded yet</p>
            ) : (
              <div className="space-y-3">
                {recentGames.map((game, index) => (
                  <div
                    key={game.gameId}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`game-history-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      {game.won ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <div className="font-medium">
                          {game.won ? 'Won' : 'Lost'} {game.score}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Partner: {game.partnerName} • vs {game.opponentNames.join(' & ')}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-sm text-muted-foreground">
                        {new Date(game.date).toLocaleDateString()}
                      </div>
                      <div className="flex gap-2">
                        {game.pointsGained ? (
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            +{game.pointsGained}
                          </span>
                        ) : null}
                        {game.pointsLost ? (
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            -{game.pointsLost}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
