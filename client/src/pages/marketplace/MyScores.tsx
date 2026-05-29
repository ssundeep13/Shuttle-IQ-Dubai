import { useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'wouter';
import {
  Trophy, TrendingUp, TrendingDown, Swords, BarChart3, Target, Flame, Users, ArrowLeft, Share2,
  CheckCircle2, XCircle, Zap, CalendarDays, Flag, Tag as TagIcon, Check, ChevronRight, History,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { PlayerStats, OpponentStats, PartnerStats, ScoreDispute, PlayerTopTag } from '@shared/schema';
import TagPlayersDialog from '@/components/TagPlayersDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

const WIN_GREEN = '#1F8A5B';
const LOSS_RED = '#B23A2E';

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
  if (winRate >= 65) return WIN_GREEN;
  if (winRate >= 50) return '#2A6FDB';
  if (winRate >= 40) return MKT.amber;
  return LOSS_RED;
}
function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ── Shared styled primitives (look only) ─────────────────────────────────────
const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${MKT.navy}12` };
function DashCard({ children, testid, style }: { children: ReactNode; testid?: string; style?: CSSProperties }) {
  return <div data-testid={testid} style={{ ...cardStyle, padding: '18px 20px', ...style }}>{children}</div>;
}
function navyBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
function ghostBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}33`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
const eyebrow: CSSProperties = { fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' };
const bigNum: CSSProperties = { fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(34px, 5vw, 44px)', color: MKT.navy, letterSpacing: '-0.04em', lineHeight: 1 };

function StatTile({ icon, value, label, sub, testid, accent }: { icon: ReactNode; value: ReactNode; label: string; sub?: ReactNode; testid: string; accent?: boolean }) {
  return (
    <DashCard testid={testid} style={accent ? { background: MKT.tealMist, borderColor: `${MKT.teal}33` } : undefined}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: accent ? 'rgba(0,107,95,0.15)' : MKT.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: accent ? MKT.tealD : MKT.inkSub }}>
        {icon}
      </div>
      <div style={bigNum}>{value}</div>
      <div style={{ fontSize: 11, color: MKT.inkSub, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: MKT.inkMute, marginTop: 2 }}>{sub}</div>}
    </DashCard>
  );
}

interface ChartDot {
  cx: number;
  cy: number;
  payload: { won: boolean };
}
function CustomDot(props: ChartDot) {
  const { cx, cy, payload } = props;
  return (
    <circle cx={cx} cy={cy} r={4} fill={payload.won ? WIN_GREEN : LOSS_RED} stroke="white" strokeWidth={2} />
  );
}

export default function MyScores() {
  usePageTitle('My Scores');
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

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

  const pageWrap = (children: ReactNode) => (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>{children}</div>
  );

  if (!linkedPlayerId) {
    return pageWrap(
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', marginBottom: 24 }} data-testid="text-page-title">My Scores</h1>
        <DashCard style={{ padding: 32, textAlign: 'center' }}>
          <Trophy className="h-12 w-12 mx-auto mb-3" style={{ color: MKT.inkSub }} />
          <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, marginBottom: 8 }}>Link your ShuttleIQ profile to see your scores</h3>
          <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 12, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            Connect your account to unlock your stats, rankings, and full match history.
          </p>
          <div style={{ borderRadius: 12, border: `1px solid ${MKT.navy}12`, background: MKT.cream, padding: 12, fontSize: 14, color: MKT.inkSub, marginBottom: 20, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
            <span style={{ fontWeight: 600, color: MKT.ink }}>What's a ShuttleIQ ID?</span> It's a unique code (e.g. SIQ-00081) assigned to you by your session organiser. Ask them if you don't have one yet.
          </div>
          <Link href="/marketplace/profile" style={{ ...navyBtn('md'), textDecoration: 'none' }} data-testid="button-link-profile">Go to Profile Settings</Link>
        </DashCard>
      </div>
    );
  }

  if (isLoading) {
    return pageWrap(
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
  const TrendIcon = stats.performanceTrend === 'declining' ? TrendingDown : TrendingUp;
  const recentWinPct = Math.round(stats.recentWinRate);

  const streakDisplay = stats.currentStreak.count > 0
    ? `${stats.currentStreak.count}${stats.currentStreak.type === 'win' ? 'W' : 'L'}`
    : '0';

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const untaggedRecentGames = stats.recentGames.filter(g => {
    const d = g.date ? new Date(g.date) : null;
    return d && d >= sevenDaysAgo && !taggedGameSet.has(g.gameId);
  });
  const untaggedCount = untaggedRecentGames.length;
  const firstUntaggedGameId = untaggedRecentGames[0]?.gameId ?? null;
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
    {pageWrap(
    <div className="max-w-5xl mx-auto" style={{ padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px) clamp(48px, 6vw, 64px)' }}>
      {/* Top bar */}
      <Reveal>
        <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 18 }}>
          <Link href="/marketplace/dashboard" data-testid="button-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <button type="button" onClick={handleShareProfile} data-testid="button-share-profile" style={ghostBtn('sm')}>
            {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Share2 className="h-4 w-4" /> Share Profile</>}
          </button>
        </div>
      </Reveal>

      {/* Hero — flat brand navy identity block */}
      <Reveal>
        <div
          className="flex items-center gap-4 md:gap-6"
          style={{ background: MKT.navy, color: '#fff', borderRadius: 16, padding: 'clamp(18px, 3vw, 24px)', marginBottom: 24, position: 'relative', overflow: 'hidden' }}
          data-testid="hero-banner"
        >
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24, flex: 'none' }}>
            {getInitial(stats.player.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(20px, 3vw, 28px)', color: '#fff', letterSpacing: '-0.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="text-player-name">
              {stats.player.name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {stats.player.shuttleIqId && (
                <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, background: 'rgba(0,107,95,0.9)', color: '#fff', padding: '3px 8px', borderRadius: 6, letterSpacing: '0.02em' }}>
                  {stats.player.shuttleIqId}
                </span>
              )}
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                {stats.player.gender === 'Male' ? 'M' : 'F'} &middot; {getTierDisplayName(stats.player.level)} ({stats.player.skillScore})
              </span>
            </div>
            <div className="mt-2">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 999, background: stats.performanceTrend === 'improving' ? 'rgba(31,138,91,0.25)' : stats.performanceTrend === 'declining' ? 'rgba(178,58,46,0.25)' : 'rgba(255,255,255,0.18)', color: '#fff' }}>
                <TrendIcon className="h-3 w-3" />
                {trendLabel} ({recentWinPct}% recent)
              </span>
            </div>
          </div>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: MKT.teal, border: '2px solid #2A8D81', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <span style={{ fontFamily: FF_DISPLAY, color: '#fff', fontWeight: 700, fontSize: 'clamp(18px, 3vw, 24px)', lineHeight: 1 }}>{stats.player.skillScore}</span>
            <span style={{ color: '#C7E5D3', fontSize: 11 }}>pts</span>
          </div>
        </div>
      </Reveal>

      {/* Stat tiles */}
      <Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: 24 }}>
          <StatTile testid="card-stat-games" icon={<Target className="h-4 w-4" />} value={stats.totalGames} label="Games Played" />
          <StatTile testid="card-stat-wins" icon={<Trophy className="h-4 w-4" />} value={stats.totalWins} label="Total Wins" />
          <StatTile testid="card-stat-winrate" icon={<TrendingUp className="h-4 w-4" />} value={`${stats.winRate}%`} label="Win Rate" accent />
          <StatTile testid="card-stat-streak" icon={<Flame className="h-4 w-4" />} value={streakDisplay} label="Current Streak" />
          <StatTile testid="card-stat-rank" icon={<BarChart3 className="h-4 w-4" />} value={`#${stats.rankBySkillScore}`} label="Skill Rank" sub={`of ${stats.totalPlayersRanked}`} />
          <StatTile testid="card-stat-diff" icon={<BarChart3 className="h-4 w-4" />} value={`${stats.avgScoreDifferential > 0 ? '+' : ''}${stats.avgScoreDifferential}`} label="Avg Differential" sub={`${stats.avgPointsFor} for / ${stats.avgPointsAgainst} against`} />
          <StatTile testid="card-stat-beststreak" icon={<Zap className="h-4 w-4" />} value={`${stats.longestWinStreak}W`} label="Best Streak" sub={`Worst: ${stats.longestLossStreak}L`} accent />
          <DashCard testid="card-stat-tags-received">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: MKT.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: MKT.inkSub }}>
              <TagIcon className="h-4 w-4" />
            </div>
            <div style={{ ...eyebrow, marginBottom: 8 }}>Tags Received</div>
            {communityTopTags.length === 0 ? (
              <p style={{ fontSize: 11, color: MKT.inkSub, lineHeight: 1.4 }}>Play games and get tagged by teammates!</p>
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
          </DashCard>
        </div>
      </Reveal>

      {/* Skill Score Progression (recharts kept, brand-recolored) */}
      {allValidGames.length > 0 && (
        <Reveal>
          <DashCard testid="card-skill-progression" style={{ marginBottom: 24 }}>
            <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 4 }}>
              <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp className="h-4 w-4" style={{ color: MKT.teal }} /> Skill Score Progression
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {totalChange !== 0 && chartData.length > 0 && (
                  <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: totalChange > 0 ? '#DDEEE2' : '#F1D7D2', color: totalChange > 0 ? '#1A6A45' : '#8E2C22' }}>
                    {totalChange > 0 ? '+' : ''}{totalChange} pts
                  </span>
                )}
                <div className="flex gap-1" data-testid="filter-progression" style={{ background: 'rgba(0,30,70,0.06)', borderRadius: 10, padding: 4 }}>
                  {(['last10', 'monthly', 'all'] as const).map(f => {
                    const active = progressionFilter === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setProgressionFilter(f)}
                        data-testid={`filter-progression-${f}`}
                        style={{ padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? MKT.navy : MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 12, boxShadow: active ? `0 0 0 1px ${MKT.navy}14` : 'none' }}
                      >
                        {f === 'last10' ? 'Last 10' : f === 'monthly' ? 'This Month' : 'All Time'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: MKT.inkSub, marginBottom: 8 }}>
              {progressionFilter === 'last10' ? 'Last 10 games' : progressionFilter === 'monthly' ? 'Last 30 days' : 'All games'}
            </p>
            {chartData.length === 0 ? (
              <div className="h-32 flex items-center justify-center" style={{ color: MKT.inkSub, fontSize: 14 }}>
                No games in this period
              </div>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="skillGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={MKT.teal} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={MKT.teal} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: `1px solid ${MKT.navy}1F`, background: '#fff', fontSize: '12px' }}
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
                        stroke={MKT.teal}
                        strokeWidth={2}
                        fill="url(#skillGradient)"
                        dot={(props: Record<string, unknown>) => <CustomDot {...(props as unknown as ChartDot)} />}
                        activeDot={{ r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs" style={{ color: MKT.inkSub }}>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: WIN_GREEN, display: 'inline-block' }} /> Win
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: LOSS_RED, display: 'inline-block' }} /> Loss
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-6 border-t-2 border-dashed border-slate-400 inline-block" /> Starting Point
                  </span>
                </div>
              </>
            )}
          </DashCard>
        </Reveal>
      )}

      {/* Rivals + Partners */}
      {(stats.rivals.length > 0 || stats.frequentPartners.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: 24 }}>
          {stats.rivals.length > 0 && (
            <Reveal>
              <DashCard testid="card-rivals" style={{ height: '100%' }}>
                <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Swords className="h-4 w-4" style={{ color: MKT.teal }} /> Rivals
                </h3>
                <p style={{ fontSize: 12, color: MKT.inkSub, margin: '2px 0 12px' }}>Your most frequent opponents</p>
                <div className="space-y-3">
                  {stats.rivals.slice(0, 4).map((rival: OpponentStats) => {
                    const rWinRate = Math.round(rival.winRate);
                    const rBarColor = rWinRate >= 50 ? MKT.teal : LOSS_RED;
                    return (
                      <Link key={rival.player.id} href={`/marketplace/players/${rival.player.id}`}>
                        <div style={{ borderRadius: 12, border: `1px solid ${MKT.navy}10`, padding: 12, cursor: 'pointer', background: MKT.cream }} data-testid={`rival-${rival.player.id}`}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: MKT.navy, flex: 'none' }}>
                              {getInitial(rival.player.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div style={{ fontWeight: 600, fontSize: 14, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rival.player.name}</div>
                              <div style={{ fontSize: 12, color: MKT.inkSub }}>{getTierDisplayName(rival.player.level)} ({rival.player.skillScore})</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div style={{ fontSize: 12, fontWeight: 700 }}>
                                <span style={{ color: MKT.tealD }}>{rival.winsAgainst}W</span>{' - '}<span style={{ color: LOSS_RED }}>{rival.lossesAgainst}L</span>
                              </div>
                              <div style={{ fontSize: 10, color: MKT.inkSub }}>{rival.gamesAgainst} games</div>
                            </div>
                            <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: rWinRate >= 50 ? MKT.tealMist : '#F1D7D2', color: rWinRate >= 50 ? MKT.tealD : '#8E2C22' }}>~ {rWinRate}%</span>
                          </div>
                          <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 999, background: rBarColor, width: `${rWinRate}%`, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </DashCard>
            </Reveal>
          )}

          {stats.frequentPartners.length > 0 && (
            <Reveal>
              <DashCard testid="card-partners" style={{ height: '100%' }}>
                <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Users className="h-4 w-4" style={{ color: MKT.teal }} /> Partners
                </h3>
                <p style={{ fontSize: 12, color: MKT.inkSub, margin: '2px 0 12px' }}>Players you've teamed up with most</p>
                <div className="space-y-3">
                  {stats.frequentPartners.slice(0, 4).map((partner: PartnerStats, idx: number) => {
                    const pWinRate = Math.round(partner.winRate);
                    const chemistry = getTeamChemistry(partner.winRate);
                    const pBarColor = getChemistryBarColor(partner.winRate);
                    const isBestPartner = idx === 0 && stats.bestPartner?.player.id === partner.player.id;
                    return (
                      <Link key={partner.player.id} href={`/marketplace/players/${partner.player.id}`}>
                        <div style={{ borderRadius: 12, border: `1px solid ${MKT.navy}10`, padding: 12, cursor: 'pointer', background: MKT.cream }} data-testid={`partner-${partner.player.id}`}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: MKT.navy, flex: 'none', position: 'relative' }}>
                              {getInitial(partner.player.name)}
                              {isBestPartner && (
                                <span style={{ position: 'absolute', top: -4, right: -4, color: MKT.amber }}>
                                  <Zap className="h-3 w-3" style={{ fill: MKT.amber }} />
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div style={{ fontWeight: 600, fontSize: 14, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner.player.name}</div>
                              <div style={{ fontSize: 12, color: MKT.inkSub }}>{getTierDisplayName(partner.player.level)} ({partner.player.skillScore})</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div style={{ fontSize: 12, fontWeight: 700, color: MKT.ink }}>{partner.gamesTogether} games</div>
                              <div style={{ fontSize: 10, color: MKT.inkSub }}>{partner.winsTogether} wins</div>
                            </div>
                            <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: pWinRate >= 50 ? MKT.tealMist : '#F1D7D2', color: pWinRate >= 50 ? MKT.tealD : '#8E2C22' }}>{pWinRate}%</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 999, background: pBarColor, width: `${pWinRate}%`, transition: 'width 0.4s ease' }} />
                            </div>
                            <span className={`text-[10px] font-medium shrink-0 ${chemistry.color}`}>{chemistry.label}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </DashCard>
            </Reveal>
          )}
        </div>
      )}

      {/* Untagged nudge */}
      {untaggedCount > 0 && linkedPlayerId && (
        <Reveal>
          <div style={{ borderRadius: 12, border: `1px solid ${MKT.amber}33`, background: '#F6E6CC55', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }} data-testid="banner-untagged-nudge">
            <TagIcon className="h-4 w-4 shrink-0" style={{ color: MKT.amber }} />
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, fontWeight: 600, color: '#7A4A0E' }}>
                {untaggedCount === 1 ? '1 game from this week needs tags' : `${untaggedCount} games from this week need tags`}
              </p>
              <p style={{ fontSize: 12, color: MKT.inkSub }}>Recognise great play — scroll down to tag</p>
            </div>
            {firstUntaggedGameId && (
              <button type="button" onClick={() => setTaggingGameId(firstUntaggedGameId)} data-testid="button-nudge-tag-now" style={{ ...ghostBtn('sm'), borderColor: `${MKT.amber}66`, color: '#7A4A0E' }}>
                Tag now
              </button>
            )}
          </div>
        </Reveal>
      )}

      {/* Recent Games */}
      {stats.recentGames.length > 0 && (
        <Reveal>
          <DashCard testid="card-recent-games">
            <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 12 }}>
              <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <CalendarDays className="h-4 w-4" style={{ color: MKT.teal }} /> Recent Games
              </h3>
              <div className="flex items-center gap-1">
                {last5Results.map((won, i) => (
                  <span key={i} style={{ width: 24, height: 24, borderRadius: 6, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: won ? MKT.teal : LOSS_RED }}>
                    {won ? 'W' : 'L'}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-0">
              {stats.recentGames.slice(0, 10).map((game, gi) => {
                const eloChange = (game.skillScoreAfter != null && game.skillScoreBefore != null)
                  ? game.skillScoreAfter - game.skillScoreBefore
                  : null;
                const gameDate = game.date ? format(new Date(game.date), 'M/d/yyyy') : '';
                const tagGameDate = game.date ? new Date(game.date) : null;
                const withinWindow = !!linkedPlayerId && tagGameDate && tagGameDate >= thirtyDaysAgo;
                const canTag = withinWindow && !taggedGameSet.has(game.gameId);
                const alreadyTagged = taggedGameSet.has(game.gameId);
                const expired = !!linkedPlayerId && tagGameDate && tagGameDate < thirtyDaysAgo && !alreadyTagged;

                return (
                  <Reveal key={game.gameId} delay={reduce ? 0 : Math.min(gi * 0.04, 0.3)}>
                    <div
                      style={{ padding: '12px 0 12px 12px', borderBottom: `1px solid ${MKT.line}`, borderLeft: `3px solid ${game.won ? MKT.teal : LOSS_RED}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }}
                      data-testid={`row-game-${game.gameId}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {game.won ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: MKT.tealD }} /> : <XCircle className="h-4 w-4 shrink-0" style={{ color: LOSS_RED }} />}
                          <span style={{ fontSize: 14, fontWeight: 600, color: game.won ? MKT.tealD : '#8E2C22' }}>
                            {game.won ? 'Won' : 'Lost'} {game.score}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: MKT.inkSub }} className="shrink-0">{gameDate}</span>
                      </div>

                      <div style={{ marginTop: 4, fontSize: 12, color: MKT.inkSub, paddingLeft: 24 }}>
                        Partner:{' '}
                        {game.partnerId ? (
                          <Link href={`/marketplace/players/${game.partnerId}`} style={{ fontWeight: 600, color: MKT.ink, textDecoration: 'none' }} data-testid={`link-partner-${game.partnerId}`}>
                            {game.partnerName}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: 600, color: MKT.ink }}>{game.partnerName}</span>
                        )}
                      </div>

                      <div style={{ marginTop: 2, fontSize: 12, color: MKT.inkSub, paddingLeft: 24 }}>
                        vs{' '}
                        {game.opponentNames.map((name, idx) => {
                          const opId = game.opponentIds?.[idx];
                          return (
                            <span key={opId || idx}>
                              {idx > 0 && <span style={{ margin: '0 2px', color: MKT.inkMute }}>&amp;</span>}
                              {opId ? (
                                <Link href={`/marketplace/players/${opId}`} style={{ fontWeight: 600, color: MKT.ink, textDecoration: 'none' }} data-testid={`link-opponent-${opId}`}>
                                  {name}
                                </Link>
                              ) : (
                                <span style={{ fontWeight: 600, color: MKT.ink }}>{name}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between gap-2" style={{ marginTop: 6, paddingLeft: 24 }}>
                        <div>
                          {eloChange !== null && eloChange !== 0 && (
                            <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: eloChange > 0 ? '#DDEEE2' : '#F1D7D2', color: eloChange > 0 ? '#1A6A45' : '#8E2C22' }}>
                              {eloChange > 0 ? '+' : ''}{eloChange}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {expired ? (
                            <UITooltip>
                              <UITooltipTrigger asChild>
                                <span className="inline-flex" data-testid={`button-tag-game-${game.gameId}`}>
                                  <button type="button" tabIndex={-1} aria-disabled="true" style={{ background: 'transparent', border: 'none', padding: 8, color: 'rgba(0,30,70,0.25)', cursor: 'default' }}>
                                    <TagIcon className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              </UITooltipTrigger>
                              <UITooltipContent side="left">Tagging closed after 30 days</UITooltipContent>
                            </UITooltip>
                          ) : (
                            <button
                              type="button"
                              onClick={() => canTag && setTaggingGameId(game.gameId)}
                              disabled={!canTag && !alreadyTagged}
                              data-testid={`button-tag-game-${game.gameId}`}
                              style={{ background: 'transparent', border: 'none', padding: 8, cursor: canTag ? 'pointer' : 'default', color: alreadyTagged ? MKT.teal : canTag ? MKT.inkSub : 'transparent', visibility: (!canTag && !alreadyTagged) ? 'hidden' : 'visible' }}
                            >
                              {alreadyTagged ? <Check className="h-3.5 w-3.5" /> : <TagIcon className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {flaggedGameIds.has(game.gameId) ? (
                            <span style={{ fontSize: 11, color: MKT.inkSub, border: `1px solid ${MKT.navy}22`, padding: '2px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }} data-testid={`badge-flagged-${game.gameId}`}>
                              <Flag className="h-3 w-3" /> Flagged
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setFlaggingGameId(game.gameId); setFlagNote(''); }}
                              title="Flag incorrect score"
                              data-testid={`button-flag-game-${game.gameId}`}
                              style={{ background: 'transparent', border: 'none', padding: 8, cursor: 'pointer', color: 'rgba(0,30,70,0.4)' }}
                            >
                              <Flag className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </DashCard>
        </Reveal>
      )}

      {/* Full game history link */}
      {linkedPlayerId && (
        <Reveal>
          <Link href="/marketplace/game-history" data-testid="link-full-game-history">
            <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${MKT.navy}12`, background: '#fff', cursor: 'pointer', marginTop: 24 }}>
              <div className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600, color: MKT.ink }}>
                <History className="h-4 w-4" style={{ color: MKT.inkSub }} />
                View full game history
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: MKT.inkSub }} />
            </div>
          </Link>
        </Reveal>
      )}
    </div>
    )}

    {/* Flag / Dispute Dialog */}
    <Dialog open={!!flaggingGameId} onOpenChange={(open) => { if (!open) setFlaggingGameId(null); }}>
      <DialogContent data-testid="dialog-flag-game">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" style={{ color: MKT.amber }} />
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
          <button type="button" onClick={() => setFlaggingGameId(null)} data-testid="button-flag-cancel" style={ghostBtn('md')}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (flaggingGameId) fileMutation.mutate({ gameResultId: flaggingGameId, note: flagNote }); }}
            disabled={fileMutation.isPending}
            data-testid="button-flag-submit"
            style={{ ...navyBtn('md'), opacity: fileMutation.isPending ? 0.6 : 1 }}
          >
            {fileMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
          </button>
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
