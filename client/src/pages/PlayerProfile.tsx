import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, Target, Users, TrendingUp, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatSkillLevel } from "@shared/utils/skillUtils";
import type { PlayerStats } from "@shared/schema";

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: stats, isLoading, error } = useQuery<PlayerStats>({
    queryKey: ['/api/players', id, 'stats'],
    queryFn: () => apiRequest('GET', `/api/players/${id}/stats`),
    enabled: !!id,
  });

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

  const { player, winRate, totalGames, totalWins, bestPartner, recentGames } = stats;

  // Build chart data from recent games (oldest first for chronological order)
  const chartData = recentGames
    .slice()
    .reverse()
    .map((game, index) => ({
      gameNumber: index + 1,
      score: game.pointsLost ? game.pointsLost * -1 : game.pointsGained || 0,
      // Note: We don't have skillScoreBefore directly, but we can track it from the points changes
      // Starting from current score and working backwards
    }));

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl md:text-3xl" data-testid="text-player-name">
                  {player.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" data-testid="badge-shuttle-iq-id">
                    {player.shuttleIqId || 'No ID'}
                  </Badge>
                  <span className="text-muted-foreground">
                    {player.gender === 'Male' ? 'M' : 'F'} • {formatSkillLevel(player.skillScore)}
                  </span>
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
              <Users className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold" data-testid="text-best-partner">
                {bestPartner ? bestPartner.winsTogether : 0}
              </div>
              <div className="text-sm text-muted-foreground">
                {bestPartner ? `with ${bestPartner.player.name}` : 'No Partner Yet'}
              </div>
            </CardContent>
          </Card>
        </div>

        {bestPartner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Best Partner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/player/${bestPartner.player.id}`}>
                    <span className="font-medium hover:underline cursor-pointer" data-testid="link-best-partner">
                      {bestPartner.player.name}
                    </span>
                  </Link>
                  <div className="text-sm text-muted-foreground">
                    {formatSkillLevel(bestPartner.player.skillScore)}
                  </div>
                </div>
                <Badge variant="secondary" data-testid="badge-partner-wins">
                  {bestPartner.winsTogether} wins together
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {recentGames.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Skill Score Progression
              </CardTitle>
              <CardDescription>
                Points gained and lost over recent games
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                      label={{ value: 'Points Change', angle: -90, position: 'insideLeft' }}
                      stroke="var(--muted-foreground)"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px'
                      }}
                      formatter={(value: number) => value > 0 ? `+${value}` : `${value}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="var(--primary)" 
                      dot={{ fill: 'var(--primary)', r: 4 }}
                      activeDot={{ r: 6 }}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

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
