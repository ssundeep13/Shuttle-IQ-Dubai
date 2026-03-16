import { useQuery } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Link } from 'wouter';
import { Trophy, Target, TrendingUp, Swords, ArrowUp, ArrowDown, BarChart3, Flame, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PlayerStats } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

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
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats) return null;

  const scorePercent = Math.min((stats.player.skillScore / 200) * 100, 100);

  const trendLabel = stats.performanceTrend === 'improving' ? 'Improving'
    : stats.performanceTrend === 'declining' ? 'Declining'
    : 'Stable';
  const trendColor = stats.performanceTrend === 'improving' ? 'text-green-600'
    : stats.performanceTrend === 'declining' ? 'text-red-500'
    : 'text-muted-foreground';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp}>
          <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Scores</h1>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <motion.div variants={fadeInUp}>
            <Card data-testid="card-stat-skill">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Award className="h-4 w-4 text-secondary" />
                  </div>
                </div>
                <div className="text-2xl font-bold" data-testid="text-skill-score">{stats.player.skillScore}</div>
                <div className="text-xs text-muted-foreground mb-2">Skill Score</div>
                <Progress value={scorePercent} className="h-1.5 mb-1.5" />
                <Badge variant="secondary" className="text-xs">{stats.player.level}</Badge>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card data-testid="card-stat-games">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold">{stats.totalGames}</div>
                <div className="text-xs text-muted-foreground">Games Played</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card data-testid="card-stat-wins">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold">{stats.totalWins}</div>
                <div className="text-xs text-muted-foreground">Wins</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card data-testid="card-stat-winrate">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.performanceTrend === 'improving' ? 'bg-green-500/10' : stats.performanceTrend === 'declining' ? 'bg-red-500/10' : 'bg-muted'}`}>
                    <TrendingUp className={`h-4 w-4 ${trendColor} ${stats.performanceTrend === 'declining' ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold">{stats.winRate}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
                <p className={`text-xs font-medium mt-1 ${trendColor}`}>{trendLabel}</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-secondary" /> Rankings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">By Skill Score</span>
                  <Badge variant="outline">#{stats.rankBySkillScore} of {stats.totalPlayersRanked}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">By Wins</span>
                  <Badge variant="outline">#{stats.rankByWins} of {stats.totalPlayersRanked}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">By Win Rate</span>
                  <Badge variant="outline">#{stats.rankByWinRate} of {stats.totalPlayersRanked}</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-secondary" /> Streaks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium">
                    {stats.currentStreak.count > 0 ? (
                      <Badge variant={stats.currentStreak.type === 'win' ? 'default' : 'outline'}>
                        {stats.currentStreak.count} {stats.currentStreak.type === 'win' ? 'wins' : 'losses'}
                      </Badge>
                    ) : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Best Win Streak</span>
                  <span className="font-semibold">{stats.longestWinStreak}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Avg Score Diff</span>
                  <span className="font-medium">{stats.avgScoreDifferential > 0 ? '+' : ''}{stats.avgScoreDifferential}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {stats.recentGames.length > 0 && (
          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Swords className="h-4 w-4 text-secondary" /> Recent Games
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {stats.recentGames.map((game) => (
                    <div
                      key={game.gameId}
                      className={`flex items-center justify-between gap-2 py-3 border-b last:border-0 pl-3 border-l-2 ${game.won ? 'border-l-green-500' : 'border-l-red-400'}`}
                      data-testid={`row-game-${game.gameId}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={game.won ? 'default' : 'outline'} className="text-xs">
                            {game.won ? 'WIN' : 'LOSS'}
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
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                                <ArrowUp className="h-3 w-3 mr-0.5" />+{game.skillScoreAfter - game.skillScoreBefore}
                              </Badge>
                            ) : game.skillScoreAfter < game.skillScoreBefore ? (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                                <ArrowDown className="h-3 w-3 mr-0.5" />{game.skillScoreAfter - game.skillScoreBefore}
                              </Badge>
                            ) : null}
                            <span className="font-semibold ml-1">{game.skillScoreAfter}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
