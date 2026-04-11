import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal, Calendar, CalendarDays, CalendarRange, Percent, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player, PlayerTopTagEntry } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';

const TAG_CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  _default: 'bg-muted text-muted-foreground border-border',
};

type TimeFilter = 'all-time' | 'this-month' | 'this-week';
type SortMode = 'rank' | 'win-pct' | 'most-improved';

interface PlayerWithWeekStats extends Player {
  gamesPlayedThisWeek: number;
  winsThisWeek: number;
}

interface PlayerWithMonthStats extends Player {
  gamesPlayedInMonth: number;
  winsInMonth: number;
}

interface MostImprovedPlayer {
  id: string;
  name: string;
  level: string;
  skillScore: number;
  shuttleIqId: string | null;
  gender: string | null;
  wins: number;
  gamesPlayed: number;
  scoreGain: number;
  gamesInWindow: number;
}

type PlayerEntry = Player | PlayerWithWeekStats | PlayerWithMonthStats;

interface RankedEntry {
  player: PlayerEntry | MostImprovedPlayer;
  primaryStat: number;
  primaryLabel: string;
  secondaryLine: string;
}

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.05 } },
};

const levelColor = (level: string) => {
  switch (level) {
    case 'Professional':
      return 'text-[10px] font-bold tracking-[0.07em] uppercase rounded-[4px] bg-[#003E8C] text-white border-[#003E8C]';
    case 'Advanced':
    case 'upper_intermediate':
      return 'text-[10px] font-bold tracking-[0.07em] uppercase rounded-[4px] bg-[rgba(0,62,140,0.10)] text-[#003E8C] border-[rgba(0,62,140,0.20)] dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
    case 'lower_intermediate':
    case 'Intermediate':
      return 'text-[10px] font-bold tracking-[0.07em] uppercase rounded-[4px] bg-[rgba(0,107,95,0.10)] text-[#006B5F] border-[rgba(0,107,95,0.20)] dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800';
    case 'Beginner':
      return 'text-[10px] font-bold tracking-[0.07em] uppercase rounded-[4px] bg-[rgba(180,140,0,0.10)] text-[#7a5c00] border-[rgba(180,140,0,0.20)] dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800';
    default:
      return 'text-[10px] font-bold tracking-[0.07em] uppercase rounded-[4px] bg-[rgba(0,20,60,0.07)] text-[rgba(0,20,60,0.5)] border-[rgba(0,20,60,0.10)] dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
};

const podiumColors = [
  {
    borderClass: 'border-2 border-[#006B5F]',
    text: 'text-[#006B5F]',
    medal: 'text-[#006B5F]',
    medalBg: 'bg-[rgba(0,107,95,0.10)]',
  },
  {
    borderClass: 'border border-[rgba(0,20,60,0.10)]',
    text: 'text-[rgba(0,20,60,0.5)]',
    medal: 'text-[rgba(0,20,60,0.4)]',
    medalBg: 'bg-[rgba(0,20,60,0.06)]',
  },
  {
    borderClass: 'border border-[rgba(0,20,60,0.10)]',
    text: 'text-[rgba(0,20,60,0.5)]',
    medal: 'text-[rgba(0,20,60,0.4)]',
    medalBg: 'bg-[rgba(0,20,60,0.06)]',
  },
];

const timeFilters: { value: TimeFilter; label: string; icon: typeof Trophy }[] = [
  { value: 'all-time', label: 'All Time', icon: Calendar },
  { value: 'this-month', label: 'This Month', icon: CalendarDays },
  { value: 'this-week', label: 'This Week', icon: CalendarRange },
];

const sortModes: { value: SortMode; label: string; icon: typeof Trophy }[] = [
  { value: 'rank', label: 'Rank', icon: Trophy },
  { value: 'win-pct', label: 'Win %', icon: Percent },
  { value: 'most-improved', label: 'Most Improved', icon: TrendingUp },
];

function winPct(wins: number, games: number): number {
  return games > 0 ? Math.round((wins / games) * 100) : 0;
}

export default function Rankings() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all-time');
  const [sortMode, setSortMode] = useState<SortMode>('rank');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const isMostImproved = sortMode === 'most-improved';

  const { data: allTopTags = [] } = useQuery<PlayerTopTagEntry[]>({
    queryKey: ['/api/tags/players/top-tags'],
    staleTime: 5 * 60 * 1000,
  });
  const topTagMap = new Map<string, PlayerTopTagEntry>(allTopTags.map(e => [e.playerId, e]));

  const { data: allTimePlayers, isLoading: loadingAllTime } = useQuery<Player[]>({
    queryKey: ['/api/players'],
    enabled: !isMostImproved && timeFilter === 'all-time',
  });

  const { data: monthPlayers, isLoading: loadingMonth } = useQuery<PlayerWithMonthStats[]>({
    queryKey: ['/api/stats/month', currentYear, currentMonth],
    enabled: !isMostImproved && timeFilter === 'this-month',
  });

  const { data: weekPlayers, isLoading: loadingWeek } = useQuery<PlayerWithWeekStats[]>({
    queryKey: ['/api/stats/week'],
    enabled: !isMostImproved && timeFilter === 'this-week',
  });

  const { data: mostImprovedData, isLoading: loadingImproved } = useQuery<MostImprovedPlayer[]>({
    queryKey: ['/api/stats/most-improved'],
    enabled: isMostImproved,
  });

  const isLoading = isMostImproved
    ? loadingImproved
    : (timeFilter === 'all-time' && loadingAllTime) ||
      (timeFilter === 'this-month' && loadingMonth) ||
      (timeFilter === 'this-week' && loadingWeek);

  let ranked: RankedEntry[] = [];

  if (isMostImproved && mostImprovedData) {
    ranked = mostImprovedData.map(p => ({
      player: p,
      primaryStat: p.scoreGain,
      primaryLabel: p.scoreGain === 1 ? 'pt gained' : 'pts gained',
      secondaryLine: `${p.gamesInWindow} ${p.gamesInWindow === 1 ? 'game' : 'games'} in last 30 days`,
    }));
  } else if (!isMostImproved) {
    if (sortMode === 'rank') {
      // Always sort by skill score DESC across all time periods
      if (timeFilter === 'all-time' && allTimePlayers) {
        ranked = allTimePlayers
          .filter(p => p.gamesPlayed > 0)
          .sort((a, b) => b.skillScore - a.skillScore)
          .map(p => ({
            player: p,
            primaryStat: p.skillScore,
            primaryLabel: 'skill score',
            secondaryLine: `${p.wins}W / ${p.gamesPlayed - p.wins}L · ${winPct(p.wins, p.gamesPlayed)}% win rate`,
          }));
      } else if (timeFilter === 'this-month' && monthPlayers) {
        ranked = monthPlayers
          .filter(p => p.gamesPlayedInMonth > 0)
          .sort((a, b) => b.skillScore - a.skillScore)
          .map(p => ({
            player: p,
            primaryStat: p.skillScore,
            primaryLabel: 'skill score',
            secondaryLine: `${p.gamesPlayedInMonth} games this month · ${p.winsInMonth}W`,
          }));
      } else if (timeFilter === 'this-week' && weekPlayers) {
        ranked = weekPlayers
          .filter(p => p.gamesPlayedThisWeek > 0)
          .sort((a, b) => b.skillScore - a.skillScore)
          .map(p => ({
            player: p,
            primaryStat: p.skillScore,
            primaryLabel: 'skill score',
            secondaryLine: `${p.gamesPlayedThisWeek} games this week · ${p.winsThisWeek}W`,
          }));
      }
    } else {
      // win-pct mode — sort by win percentage for the selected time period
      if (timeFilter === 'all-time' && allTimePlayers) {
        ranked = allTimePlayers
          .filter(p => p.gamesPlayed > 0)
          .map(p => ({ player: p, pct: winPct(p.wins, p.gamesPlayed) }))
          .sort((a, b) => b.pct - a.pct || b.player.gamesPlayed - a.player.gamesPlayed)
          .map(({ player, pct }) => ({
            player,
            primaryStat: pct,
            primaryLabel: 'win %',
            secondaryLine: `${player.wins}W / ${player.gamesPlayed - player.wins}L (${player.gamesPlayed} games)`,
          }));
      } else if (timeFilter === 'this-month' && monthPlayers) {
        ranked = monthPlayers
          .filter(p => p.gamesPlayedInMonth > 0)
          .map(p => ({ player: p, pct: winPct(p.winsInMonth, p.gamesPlayedInMonth) }))
          .sort((a, b) => b.pct - a.pct || b.player.gamesPlayedInMonth - a.player.gamesPlayedInMonth)
          .map(({ player, pct }) => ({
            player,
            primaryStat: pct,
            primaryLabel: 'win %',
            secondaryLine: `${player.winsInMonth}W / ${player.gamesPlayedInMonth - player.winsInMonth}L (${player.gamesPlayedInMonth} games)`,
          }));
      } else if (timeFilter === 'this-week' && weekPlayers) {
        ranked = weekPlayers
          .filter(p => p.gamesPlayedThisWeek > 0)
          .map(p => ({ player: p, pct: winPct(p.winsThisWeek, p.gamesPlayedThisWeek) }))
          .sort((a, b) => b.pct - a.pct || b.player.gamesPlayedThisWeek - a.player.gamesPlayedThisWeek)
          .map(({ player, pct }) => ({
            player,
            primaryStat: pct,
            primaryLabel: 'win %',
            secondaryLine: `${player.winsThisWeek}W / ${player.gamesPlayedThisWeek - player.winsThisWeek}L (${player.gamesPlayedThisWeek} games)`,
          }));
      }
    }
  }

  const topThree = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const emptyLabel = isMostImproved
    ? 'No games recorded in the last 30 days.'
    : timeFilter === 'all-time'
    ? 'Players need to complete games to appear here.'
    : timeFilter === 'this-month'
    ? 'No games recorded this month yet.'
    : 'No games recorded this week yet.';

  const animationKey = `${timeFilter}-${sortMode}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Trophy className="h-6 w-6 text-secondary" /> Rankings
          </h1>
          <p className="text-muted-foreground mt-1">Global ShuttleIQ player leaderboard</p>
        </motion.div>

        <motion.div variants={fadeInUp} className="space-y-2 mb-6">
          <div className={`flex items-center gap-2 flex-wrap transition-opacity ${isMostImproved ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            {timeFilters.map(f => {
              const Icon = f.icon;
              const isActive = timeFilter === f.value;
              return (
                <Button
                  key={f.value}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeFilter(f.value)}
                  data-testid={`filter-${f.value}`}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {f.label}
                </Button>
              );
            })}
            {isMostImproved && (
              <span className="text-xs text-muted-foreground ml-1">Last 30 days</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide mr-1">Sort by</span>
            {sortModes.map(m => {
              const Icon = m.icon;
              const isActive = sortMode === m.value;
              return (
                <Button
                  key={m.value}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSortMode(m.value)}
                  data-testid={`sort-${m.value}`}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {m.label}
                </Button>
              );
            })}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={animationKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : ranked.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No ranked players yet</h3>
                  <p className="text-sm text-muted-foreground">{emptyLabel}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {topThree.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    {[1, 0, 2].map((podiumIdx) => {
                      const entry = topThree[podiumIdx];
                      if (!entry) return <div key={podiumIdx} />;
                      const colors = podiumColors[podiumIdx];
                      const rank = podiumIdx + 1;
                      const isMI = sortMode === 'most-improved';
                      const statDisplay = isMI && entry.primaryStat > 0
                        ? `+${entry.primaryStat}`
                        : `${entry.primaryStat}`;
                      return (
                        <motion.div key={entry.player.id} variants={fadeInUp}>
                          <Link href={`/marketplace/players/${entry.player.id}`}>
                            <Card
                              className={`text-center ${colors.borderClass} ${podiumIdx === 0 ? 'md:-mt-4' : ''} hover-elevate cursor-pointer`}
                              data-testid={`card-podium-${entry.player.id}`}
                            >
                              <CardContent className="p-4">
                                <div className={`w-10 h-10 rounded-full ${colors.medalBg} flex items-center justify-center mx-auto mb-2`}>
                                  <Medal className={`h-5 w-5 ${colors.medal}`} />
                                </div>
                                <div className={`text-[10px] font-bold tracking-[0.07em] uppercase ${colors.text} mb-1`}>#{rank}</div>
                                <p
                                  className="text-[14px] font-bold truncate"
                                  style={{ color: '#003E8C' }}
                                  data-testid={`text-player-name-${entry.player.id}`}
                                >
                                  {entry.player.name}
                                </p>
                                <p
                                  className="font-extrabold leading-none mt-1"
                                  style={{ fontSize: '32px', letterSpacing: '-0.04em', color: '#003E8C' }}
                                  data-testid={`text-player-score-${entry.player.id}`}
                                >
                                  {statDisplay}
                                </p>
                                <p className="text-[10px] -mt-0.5" style={{ color: 'rgba(0,20,60,0.5)' }}>{entry.primaryLabel}</p>
                                <Badge variant="outline" className={`mt-2 ${levelColor(entry.player.level)}`}>
                                  {getTierDisplayName(entry.player.level)}
                                </Badge>
                                {(() => {
                                  const topTag = topTagMap.get(entry.player.id);
                                  if (!topTag) return null;
                                  const cls = TAG_CATEGORY_COLOR[topTag.tag.category] ?? TAG_CATEGORY_COLOR._default;
                                  return (
                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border mt-1.5 ${cls}`} data-testid={`pill-tag-podium-${entry.player.id}`}>
                                      {topTag.tag.emoji} {topTag.tag.label}
                                    </div>
                                  );
                                })()}
                                <p className="text-[12px] mt-1.5" style={{ color: 'rgba(0,20,60,0.5)' }}>
                                  {entry.secondaryLine}
                                </p>
                              </CardContent>
                            </Card>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {rest.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {rest.map((entry, index) => {
                          const isMI = sortMode === 'most-improved';
                          const statDisplay = isMI && entry.primaryStat > 0
                            ? `+${entry.primaryStat}`
                            : `${entry.primaryStat}`;
                          return (
                            <Link key={entry.player.id} href={`/marketplace/players/${entry.player.id}`}>
                              <motion.div
                                variants={fadeInUp}
                                className="flex items-center gap-3 px-4 py-3 hover-elevate cursor-pointer"
                                data-testid={`row-player-${entry.player.id}`}
                              >
                                <div className="w-6 text-center shrink-0">
                                  <span className="text-sm text-muted-foreground font-medium">{index + 4}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate" data-testid={`text-player-name-${entry.player.id}`}>
                                    {entry.player.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground shrink-0">{entry.player.shuttleIqId}</span>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 no-default-hover-elevate no-default-active-elevate ${levelColor(entry.player.level)}`}>
                                      {getTierDisplayName(entry.player.level)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 space-y-1">
                                  <div className="font-semibold" data-testid={`text-player-score-${entry.player.id}`}>
                                    {statDisplay} <span className="text-xs font-normal text-muted-foreground">{entry.primaryLabel}</span>
                                  </div>
                                  {(() => {
                                    const topTag = topTagMap.get(entry.player.id);
                                    if (!topTag) return null;
                                    const cls = TAG_CATEGORY_COLOR[topTag.tag.category] ?? TAG_CATEGORY_COLOR._default;
                                    return (
                                      <div className="flex justify-end">
                                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cls}`} data-testid={`pill-tag-row-${entry.player.id}`}>
                                          {topTag.tag.emoji} {topTag.tag.label}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="text-right shrink-0 text-xs text-muted-foreground w-20">
                                  <div>{entry.secondaryLine}</div>
                                </div>
                              </motion.div>
                            </Link>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
