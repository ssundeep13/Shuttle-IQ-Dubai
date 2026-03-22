import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'wouter';
import {
  Trophy, TrendingUp, TrendingDown, Swords, ChevronDown,
  BarChart3, Target, Flame, Users, ArrowLeft, Share2,
  CheckCircle2, XCircle, Zap, CalendarDays, Flag, Tag as TagIcon, Check
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { PlayerStats, OpponentStats, PartnerStats, ScoreDispute, PlayerTopTag } from '@shared/schema';
import TagPlayersDialog from '@/components/TagPlayersDialog';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

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

interface ChartDot {
  cx: number;
  cy: number;
  payload: { won: boolean };
}

function CustomDot(props: ChartDot) {
  const { cx, cy, payload } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.won ? '#059669' : '#ef4444'}
      stroke="white"
      strokeWidth={2}
    />
  );
}

export default function MyScores() {
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [flaggingGameId, setFlaggingGameId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [progressionFilter, setProgressionFilter] = useState<'last10' | 'monthly' | 'all'>('last10');
  const [taggingGameId, setTaggingGameId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShareProfile = async () => {
    if (!linkedPlayerId) return;
    const url = `${window.location.origin}/marketplace/players/${linkedPlayerId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My ShuttleIQ Profile', url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Link copied!', description: 'Profile link copied to clipboard.' });
    } catch {
      toast({ title: 'Could not copy', description: url, variant: 'destructive' });
    }
  };

  const { data: stats, isLoading } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  const { data: myDisputes = [] } = useQuery<ScoreDispute[]>({
    queryKey: ['/api/marketplace/my-disputes'],
    enabled: !!user,
  });

  const flaggedGameIds = useMemo(
    () => new Set(myDisputes.map(d => d.gameResultId)),
    [myDisputes]
  );

  const { data: communityTopTags = [] } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', linkedPlayerId],
    queryFn: () => fetch(`/api/tags/player/${linkedPlayerId}?limit=30`).then(r => r.json()),
    enabled: !!linkedPlayerId,
    staleTime: Infinity,
  });

  const { data: taggedGameIds = [] } = useQuery<string[]>({
    queryKey: ['/api/tags/tagged-games'],
    enabled: !!user?.linkedPlayerId,
    staleTime: 0,
  });

  const taggedGameSet = useMemo(() => new Set(taggedGameIds), [taggedGameIds]);

  const fileMutation = useMutation({
    mutationFn: async ({ gameResultId, note }: { gameResultId: string; note: string }) =>
      apiRequest('POST', `/api/marketplace/game-results/${gameResultId}/dispute`, { note: note.trim() || undefined }),
    onSuccess: () => {
      toast({ title: 'Dispute Filed', description: 'We\'ve notified the admin to review this game.' });
      setFlaggingGameId(null);
      setFlagNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-disputes'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to file dispute', variant: 'destructive' });
    },
  });

  if (!linkedPlayerId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-6">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-36 w-full mb-6 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const trendLabel = stats.performanceTrend === 'improving' ? 'Improving'
    : stats.performanceTrend === 'declining' ? 'Declining'
    : 'Stable';
  const trendIcon = stats.performanceTrend === 'declining' ? TrendingDown : TrendingUp;
  const TrendIcon = trendIcon;
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
    <>
    <div className="max-w-4xl mx-auto px-4 py-6">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="flex items-center justify-between gap-2 flex-wrap mb-5">
          <Link href="/marketplace/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleShareProfile} data-testid="button-share-profile">
            {copied
              ? <><Check className="h-4 w-4 mr-1" /> Copied!</>
              : <><Share2 className="h-4 w-4 mr-1" /> Share Profile</>
            }
          </Button>
        </motion.div>

        <motion.div variants={fadeInUp}>
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
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <motion.div variants={fadeInUp}>
            <Card className="h-full" data-testid="card-stat-games">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.totalGames}</div>
                <div className="text-xs text-muted-foreground">Games Played</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card className="h-full" data-testid="card-stat-wins">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.totalWins}</div>
                <div className="text-xs text-muted-foreground">Total Wins</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card className="h-full border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30" data-testid="card-stat-winrate">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center mb-3">
                  <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{stats.winRate}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card className="h-full" data-testid="card-stat-streak">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <Flame className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold text-[#0f2b46] dark:text-foreground">{streakDisplay}</div>
                <div className="text-xs text-muted-foreground">Current Streak</div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
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
          </motion.div>

          <motion.div variants={fadeInUp}>
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
          </motion.div>

          <motion.div variants={fadeInUp}>
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
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card className="h-full" data-testid="card-stat-tags-received">
              <CardContent className="p-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                  <TagIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags Received</div>
                {communityTopTags.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-snug">Play games and get tagged by teammates!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {communityTopTags.map(({ tag, count }) => (
                      <span
                        key={tag.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tagCategoryClass(tag.category)}`}
                        data-testid={`pill-tag-${tag.id}`}
                      >
                        {tag.emoji} {tag.label}
                        <span className="opacity-60">{count}×</span>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {allValidGames.length > 0 && (
          <motion.div variants={fadeInUp}>
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
                        <linearGradient id="skillGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        domain={['dataMin - 5', 'dataMax + 5']}
                      />
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
                        fill="url(#skillGradient)"
                        dot={(props: Record<string, unknown>) => <CustomDot {...(props as unknown as ChartDot)} />}
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
          </motion.div>
        )}

        {(stats.rivals.length > 0 || stats.frequentPartners.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {stats.rivals.length > 0 && (
              <motion.div variants={fadeInUp}>
                <Card className="h-full" data-testid="card-rivals">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Swords className="h-4 w-4 text-muted-foreground" /> Rivals
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Your most frequent opponents</p>
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
              </motion.div>
            )}

            {stats.frequentPartners.length > 0 && (
              <motion.div variants={fadeInUp}>
                <Card className="h-full" data-testid="card-partners">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" /> Partners
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Players you've teamed up with most</p>
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
                                <div className="text-[10px] text-muted-foreground">{partner.winsTogether} wins</div>
                              </div>
                              <Badge className={`text-xs shrink-0 no-default-hover-elevate no-default-active-elevate ${pBadgeColor} border-0`}>
                                {pWinRate}%
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${pBarColor}`} style={{ width: `${pWinRate}%` }} />
                              </div>
                              <span className={`text-[10px] font-medium shrink-0 ${chemistry.color}`}>{chemistry.label}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}

        {stats.recentGames.length > 0 && (
          <motion.div variants={fadeInUp}>
            <Card data-testid="card-recent-games">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" /> Recent Games
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {last5Results.map((won, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center text-white ${won ? 'bg-teal-600' : 'bg-red-500'}`}
                      >
                        {won ? 'W' : 'L'}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {stats.recentGames.slice(0, 10).map((game) => {
                    const eloChange = (game.skillScoreAfter != null && game.skillScoreBefore != null)
                      ? game.skillScoreAfter - game.skillScoreBefore
                      : null;
                    const gameDate = game.date ? format(new Date(game.date), 'M/d/yyyy') : '';
                    return (
                      <div
                        key={game.gameId}
                        className={`flex items-center gap-3 py-3.5 border-b last:border-0 pl-3 rounded-l-sm border-l-[3px] ${game.won ? 'border-l-teal-500' : 'border-l-red-400'}`}
                        data-testid={`row-game-${game.gameId}`}
                      >
                        <div className="shrink-0">
                          {game.won ? (
                            <CheckCircle2 className="h-5 w-5 text-teal-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold ${game.won ? 'text-teal-700 dark:text-teal-400' : 'text-red-600 dark:text-red-400'}`}>
                            {game.won ? 'Won' : 'Lost'} {game.score}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            Partner: <span className="font-medium text-foreground">{game.partnerName}</span> &middot; vs{' '}
                            <span className="font-medium text-foreground">{game.opponentNames.join(' & ')}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground">{gameDate}</div>
                          {eloChange !== null && eloChange !== 0 && (
                            <Badge
                              variant="outline"
                              className={`text-xs no-default-hover-elevate no-default-active-elevate ${eloChange > 0 ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}
                            >
                              {eloChange > 0 ? '+' : ''}{eloChange}
                            </Badge>
                          )}
                        </div>
                        {(() => {
                          const gameDate = game.date ? new Date(game.date) : null;
                          const withinWindow = !!linkedPlayerId && gameDate && gameDate >= thirtyDaysAgo;
                          const canTag = withinWindow && !taggedGameSet.has(game.gameId);
                          const alreadyTagged = taggedGameSet.has(game.gameId);
                          const expired = !!linkedPlayerId && gameDate && gameDate < thirtyDaysAgo && !alreadyTagged;
                          if (expired) {
                            return (
                              <UITooltip>
                                <UITooltipTrigger asChild>
                                  <span className="shrink-0 inline-flex" data-testid={`button-tag-game-${game.gameId}`}>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-muted-foreground/30 pointer-events-none"
                                      tabIndex={-1}
                                      aria-disabled="true"
                                    >
                                      <TagIcon className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </UITooltipTrigger>
                                <UITooltipContent side="left">Tagging closed after 30 days</UITooltipContent>
                              </UITooltip>
                            );
                          }
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`shrink-0 ${alreadyTagged ? 'text-teal-500' : canTag ? 'text-muted-foreground/60' : 'invisible'}`}
                              onClick={() => canTag && setTaggingGameId(game.gameId)}
                              disabled={!canTag && !alreadyTagged}
                              data-testid={`button-tag-game-${game.gameId}`}
                            >
                              {alreadyTagged ? <Check className="h-3.5 w-3.5" /> : <TagIcon className="h-3.5 w-3.5" />}
                            </Button>
                          );
                        })()}
                        {flaggedGameIds.has(game.gameId) ? (
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0 text-muted-foreground border-muted-foreground/30 no-default-hover-elevate no-default-active-elevate"
                            data-testid={`badge-flagged-${game.gameId}`}
                          >
                            <Flag className="h-3 w-3 mr-1" />
                            Flagged
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground/50"
                            onClick={() => { setFlaggingGameId(game.gameId); setFlagNote(''); }}
                            title="Flag incorrect score"
                            data-testid={`button-flag-game-${game.gameId}`}
                          >
                            <Flag className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>

    {/* Flag / Dispute Dialog */}
    <Dialog open={!!flaggingGameId} onOpenChange={(open) => { if (!open) setFlaggingGameId(null); }}>
      <DialogContent data-testid="dialog-flag-game">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-amber-500" />
            Flag Incorrect Score
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Tell us what was wrong with this score. An admin will review and correct it if needed.
          </p>
          <Textarea
            placeholder="e.g. The score was 21-15, not 21-12."
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
            maxLength={500}
            rows={3}
            data-testid="textarea-flag-note"
          />
          <p className="text-xs text-muted-foreground text-right">{flagNote.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFlaggingGameId(null)} data-testid="button-flag-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => { if (flaggingGameId) fileMutation.mutate({ gameResultId: flaggingGameId, note: flagNote }); }}
            disabled={fileMutation.isPending}
            data-testid="button-flag-submit"
          >
            {fileMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Tag Players Dialog */}
    {taggingGameId && linkedPlayerId && (
      <TagPlayersDialog
        gameResultId={taggingGameId}
        linkedPlayerId={linkedPlayerId}
        open={!!taggingGameId}
        onOpenChange={(open) => { if (!open) setTaggingGameId(null); }}
      />
    )}
    </>
  );
}
