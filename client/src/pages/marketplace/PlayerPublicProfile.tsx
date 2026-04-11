import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy, TrendingUp, TrendingDown, Swords,
  BarChart3, Target, Flame, Users, ArrowLeft,
  CheckCircle2, XCircle, Zap, Tag as TagIcon, ExternalLink,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer
} from 'recharts';
import type { PlayerStats, OpponentStats, PartnerStats, PlayerTopTag } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  _default: 'bg-muted text-muted-foreground border-border',
};
function tagCategoryClass(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR._default;
}

function getTeamChemistry(winRate: number): { label: string; color: string } {
  if (winRate >= 65) return { label: 'Great', color: 'text-green-600' };
  if (winRate >= 50) return { label: 'Good', color: 'text-blue-600' };
  if (winRate >= 40) return { label: 'Average', color: 'text-yellow-600' };
  return { label: 'Needs Work', color: 'text-red-500' };
}

function getChemistryBarColor(winRate: number): string {
  if (winRate >= 65) return 'bg-green-500';
  if (winRate >= 50) return 'bg-blue-500';
  if (winRate >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function CustomDot(props: Record<string, unknown>) {
  const cx = props.cx as number;
  const cy = props.cy as number;
  const payload = props.payload as { won: boolean };
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload?.won ? '#059669' : '#ef4444'}
      stroke="white"
      strokeWidth={2}
    />
  );
}

export default function PlayerPublicProfile() {
  const { playerId } = useParams<{ playerId: string }>();

  const { data: stats, isLoading } = useQuery<PlayerStats>({
    queryKey: ['/api/players', playerId, 'stats'],
    enabled: !!playerId,
  });

  const { data: communityTags = [] } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', playerId],
    queryFn: () => fetch(`/api/tags/player/${playerId}?limit=30`).then(r => r.json()),
    enabled: !!playerId,
  });

  const [progressionFilter, setProgressionFilter] = useState<'last10' | 'monthly' | 'all'>('last10');

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-36 w-full mb-6 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-xl font-semibold mb-2">Player not found</h2>
        <p className="text-sm text-muted-foreground mb-4">This player profile doesn't exist or has no recorded games yet.</p>
        <Link href="/marketplace/rankings">
          <Button variant="outline" data-testid="button-back-to-rankings">Back to Rankings</Button>
        </Link>
      </div>
    );
  }

  const trendLabel = stats.performanceTrend === 'improving' ? 'Improving'
    : stats.performanceTrend === 'declining' ? 'Declining'
    : 'Stable';
  const TrendIcon = stats.performanceTrend === 'declining' ? TrendingDown : TrendingUp;
  const trendBgColor = stats.performanceTrend === 'improving'
    ? 'bg-green-500/20 text-green-300'
    : stats.performanceTrend === 'declining'
    ? 'bg-red-500/20 text-red-300'
    : 'bg-white/20 text-white/80';

  const recentWinPct = Math.round(stats.recentWinRate);
  const streakDisplay = stats.currentStreak.count > 0
    ? `${stats.currentStreak.count}${stats.currentStreak.type === 'win' ? 'W' : 'L'}`
    : '0';

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allValidGames = stats.recentGames.filter(g => g.skillScoreAfter != null);
  const chartGames = progressionFilter === 'last10'
    ? allValidGames.slice(0, 10)
    : progressionFilter === 'monthly'
    ? allValidGames.filter(g => new Date(g.date) >= thirtyDaysAgo)
    : allValidGames;
  const chartData = chartGames
    .slice()
    .reverse()
    .map((g, i) => ({
      name: `G${i + 1}`,
      score: g.skillScoreAfter ?? g.skillScoreBefore ?? stats.player.skillScore,
      won: g.won,
    }));

  const startingScore = chartGames.length > 0
    ? (chartGames[chartGames.length - 1].skillScoreBefore ?? chartData[0]?.score ?? stats.player.skillScore)
    : stats.player.skillScore;
  const endingScore = chartData.length > 0
    ? chartData[chartData.length - 1].score
    : stats.player.skillScore;
  const totalChange = endingScore - startingScore;

  const last5Results = stats.recentGames.slice(0, 5).map(g => g.won);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div>
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Link href="/marketplace/rankings">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Rankings
              </Button>
            </Link>
            <Link href={`/marketplace/players/${stats.player.id}/personality-card`}>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-share-personality">
                <ExternalLink className="h-3.5 w-3.5" /> Share Personality
              </Button>
            </Link>
          </div>
        </div>

        <div>
          <div
            className="rounded-xl p-5 md:p-6 mb-6 flex items-center gap-4 md:gap-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0f2b46 0%, #163a5f 50%, #1a4a6e 100%)' }}
            data-testid="hero-banner"
          >
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white text-xl md:text-2xl font-bold shrink-0">
              {getInitial(stats.player.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-white truncate" data-testid="text-player-name">
                {stats.player.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {stats.player.shuttleIqId && (
                  <Badge className="bg-teal-600/80 text-white text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                    {stats.player.shuttleIqId}
                  </Badge>
                )}
                <span className="text-white/70 text-sm">
                  {stats.player.gender === 'Male' ? 'M' : 'F'} &middot; {getTierDisplayName(stats.player.level)} ({stats.player.skillScore})
                </span>
              </div>
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${trendBgColor}`}>
                  <TrendIcon className="h-3 w-3" />
                  {trendLabel} ({recentWinPct}% recent)
                </span>
              </div>
            </div>
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-teal-600 border-2 border-teal-400 flex flex-col items-center justify-center shrink-0">
              <span className="text-white font-bold text-lg md:text-2xl leading-none">{stats.player.skillScore}</span>
              <span className="text-teal-200 text-[10px] md:text-xs">pts</span>
            </div>
          </div>
        </div>

        {communityTags.length > 0 && (
          <div className="mb-6">
            <Card data-testid="card-community-personality">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TagIcon className="h-4 w-4 text-muted-foreground" /> Community Personality
                  </CardTitle>
                  <Link href={`/marketplace/players/${stats.player.id}/personality-card`}>
                    <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" data-testid="link-personality-card">
                      <ExternalLink className="h-3 w-3" /> Share card
                    </button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  {communityTags.slice(0, 6).map(({ tag, count }) => (
                    <span
                      key={tag.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${tagCategoryClass(tag.category)}`}
                      data-testid={`pill-tag-elevated-${tag.id}`}
                    >
                      {tag.emoji} {tag.label}
                      <span className="opacity-60 text-xs">{count}×</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div>
            <Card className="h-full" data-testid="card-stat-games">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.totalGames}</div>
                <div className="text-xs text-muted-foreground">Games Played</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full" data-testid="card-stat-wins">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.totalWins}</div>
                <div className="text-xs text-muted-foreground">Total Wins</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30" data-testid="card-stat-winrate">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center mb-3">
                  <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.winRate}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full" data-testid="card-stat-streak">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Flame className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{streakDisplay}</div>
                <div className="text-xs text-muted-foreground">Current Streak</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full" data-testid="card-stat-rank">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">#{stats.rankBySkillScore}</div>
                <div className="text-xs text-muted-foreground">Skill Rank</div>
                <div className="text-[10px] text-muted-foreground">of {stats.totalPlayersRanked}</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full" data-testid="card-stat-diff">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">
                  {stats.avgScoreDifferential > 0 ? '+' : ''}{stats.avgScoreDifferential}
                </div>
                <div className="text-xs text-muted-foreground">Avg Differential</div>
                <div className="text-[10px] text-muted-foreground">
                  {stats.avgPointsFor} for / {stats.avgPointsAgainst} against
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30" data-testid="card-stat-beststreak">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center mb-3">
                  <Zap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.longestWinStreak}W</div>
                <div className="text-xs text-muted-foreground">Best Streak</div>
                <div className="text-[10px] text-muted-foreground">Worst: {stats.longestLossStreak}L</div>
              </CardContent>
            </Card>
          </div>

        </div>

        {last5Results.length > 0 && (
          <div className="mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">Last {last5Results.length} results</p>
                  <div className="flex gap-1.5">
                    {last5Results.map((won, i) => (
                      won
                        ? <CheckCircle2 key={i} className="h-5 w-5 text-green-500" />
                        : <XCircle key={i} className="h-5 w-5 text-red-400" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {allValidGames.length > 0 && (
          <div>
            <Card className="mb-6" data-testid="card-skill-progression">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" /> Skill Score Progression
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {totalChange !== 0 && chartData.length > 0 && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${totalChange > 0 ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}
                      >
                        {totalChange > 0 ? '+' : ''}{totalChange} pts
                      </Badge>
                    )}
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
                </div>
                <p className="text-xs text-muted-foreground">
                  {progressionFilter === 'last10' ? 'Last 10 games' : progressionFilter === 'monthly' ? 'Last 30 days' : 'All games'}
                </p>
              </CardHeader>
              <CardContent className="pt-2">
                {chartData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                    No games in this period
                  </div>
                ) : (
                <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="skillGradientPublic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`${value}`, 'Skill Score']}
                      />
                      <ReferenceLine
                        y={startingScore}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        label={{ value: 'Start', position: 'left', fontSize: 10, fill: '#94a3b8' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#0d9488"
                        strokeWidth={2}
                        fill="url(#skillGradientPublic)"
                        dot={(props: Record<string, unknown>) => <CustomDot {...props} />}
                        activeDot={{ r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" /> Win
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Loss
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-6 border-t-2 border-dashed border-slate-400 inline-block" /> Starting Point
                  </span>
                </div>
                </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {(stats.rivals.length > 0 || stats.frequentPartners.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {stats.rivals.length > 0 && (
              <div>
                <Card className="h-full" data-testid="card-rivals">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Swords className="h-4 w-4 text-muted-foreground" /> Rivals
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Most frequent opponents</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.rivals.slice(0, 4).map((rival: OpponentStats) => {
                      const rWinRate = Math.round(rival.winRate);
                      const rBarColor = rWinRate >= 50 ? 'bg-teal-500' : 'bg-red-400';
                      const rBadgeColor = rWinRate >= 50
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
                      return (
                        <Link key={rival.player.id} href={`/marketplace/players/${rival.player.id}`}>
                        <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid={`rival-${rival.player.id}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                              {getInitial(rival.player.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{rival.player.name}</div>
                              <div className="text-xs text-muted-foreground">{getTierDisplayName(rival.player.level)} ({rival.player.skillScore})</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold">
                                <span className="text-teal-600 dark:text-teal-400">{rival.winsAgainst}W</span>
                                {' - '}
                                <span className="text-red-500">{rival.lossesAgainst}L</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">{rival.gamesAgainst} games</div>
                            </div>
                            <Badge className={`text-xs shrink-0 no-default-hover-elevate no-default-active-elevate ${rBadgeColor} border-0`}>
                              ~ {rWinRate}%
                            </Badge>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${rBarColor}`} style={{ width: `${rWinRate}%` }} />
                          </div>
                        </div>
                        </Link>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            )}

            {stats.frequentPartners.length > 0 && (
              <div>
                <Card className="h-full" data-testid="card-partners">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" /> Partners
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Players they've teamed up with most</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.frequentPartners.slice(0, 4).map((partner: PartnerStats, idx: number) => {
                      const pWinRate = Math.round(partner.winRate);
                      const chemistry = getTeamChemistry(partner.winRate);
                      const pBarColor = getChemistryBarColor(partner.winRate);
                      const pBadgeColor = pWinRate >= 50
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
                      const isBestPartner = idx === 0 && stats.bestPartner?.player.id === partner.player.id;
                      return (
                        <Link key={partner.player.id} href={`/marketplace/players/${partner.player.id}`}>
                        <div className="rounded-lg border p-3 hover-elevate cursor-pointer" data-testid={`partner-${partner.player.id}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0 relative">
                              {getInitial(partner.player.name)}
                              {isBestPartner && (
                                <span className="absolute -top-1 -right-1 text-yellow-500 text-xs">
                                  <Zap className="h-3 w-3 fill-yellow-500" />
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{partner.player.name}</div>
                              <div className="text-xs text-muted-foreground">{getTierDisplayName(partner.player.level)} ({partner.player.skillScore})</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold">{partner.gamesTogether} games</div>
                              <div className={`text-xs font-medium ${chemistry.color}`}>{chemistry.label}</div>
                            </div>
                            <Badge className={`text-xs shrink-0 no-default-hover-elevate no-default-active-elevate ${pBadgeColor} border-0`}>
                              ~ {pWinRate}%
                            </Badge>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pBarColor}`} style={{ width: `${pWinRate}%` }} />
                          </div>
                        </div>
                        </Link>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
