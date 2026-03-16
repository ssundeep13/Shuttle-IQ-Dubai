import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal, Calendar, CalendarDays, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@shared/schema';

type TimeFilter = 'all-time' | 'this-month' | 'today';

interface PlayerWithTodayStats extends Player {
  gamesPlayedToday: number;
  winsToday: number;
}

interface PlayerWithMonthStats extends Player {
  gamesPlayedInMonth: number;
  winsInMonth: number;
}

interface RankedEntry {
  player: Player;
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
    case 'Professional': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
    case 'Advanced': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    case 'Intermediate': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    case 'Beginner': return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
    default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
  }
};

const podiumColors = [
  { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-600 dark:text-yellow-400', medal: 'text-yellow-500' },
  { bg: 'bg-gray-200/50 dark:bg-gray-700/50', border: 'border-gray-300/50 dark:border-gray-600/50', text: 'text-gray-500 dark:text-gray-400', medal: 'text-gray-400' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', medal: 'text-amber-600 dark:text-amber-400' },
];

const filters: { value: TimeFilter; label: string; icon: typeof Trophy }[] = [
  { value: 'all-time', label: 'All Time', icon: Calendar },
  { value: 'this-month', label: 'This Month', icon: CalendarDays },
  { value: 'today', label: 'Today', icon: Clock },
];

export default function Rankings() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all-time');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data: allTimePlayers, isLoading: loadingAllTime } = useQuery<Player[]>({
    queryKey: ['/api/players'],
    enabled: timeFilter === 'all-time',
  });

  const { data: monthPlayers, isLoading: loadingMonth } = useQuery<PlayerWithMonthStats[]>({
    queryKey: ['/api/stats/month', currentYear, currentMonth],
    enabled: timeFilter === 'this-month',
  });

  const { data: todayPlayers, isLoading: loadingToday } = useQuery<PlayerWithTodayStats[]>({
    queryKey: ['/api/stats/today'],
    enabled: timeFilter === 'today',
  });

  const isLoading =
    (timeFilter === 'all-time' && loadingAllTime) ||
    (timeFilter === 'this-month' && loadingMonth) ||
    (timeFilter === 'today' && loadingToday);

  let ranked: RankedEntry[] = [];

  if (timeFilter === 'all-time' && allTimePlayers) {
    ranked = allTimePlayers
      .filter(p => p.gamesPlayed > 0)
      .sort((a, b) => b.skillScore - a.skillScore)
      .map(p => ({
        player: p,
        primaryStat: p.skillScore,
        primaryLabel: 'pts',
        secondaryLine: `${p.wins}W / ${p.gamesPlayed - p.wins}L (${p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0}%)`,
      }));
  } else if (timeFilter === 'this-month' && monthPlayers) {
    ranked = monthPlayers
      .filter(p => p.gamesPlayedInMonth > 0)
      .sort((a, b) => b.winsInMonth - a.winsInMonth || b.gamesPlayedInMonth - a.gamesPlayedInMonth)
      .map(p => ({
        player: p,
        primaryStat: p.winsInMonth,
        primaryLabel: p.winsInMonth === 1 ? 'win' : 'wins',
        secondaryLine: `${p.gamesPlayedInMonth} games (${p.gamesPlayedInMonth > 0 ? Math.round((p.winsInMonth / p.gamesPlayedInMonth) * 100) : 0}%)`,
      }));
  } else if (timeFilter === 'today' && todayPlayers) {
    ranked = todayPlayers
      .filter(p => p.gamesPlayedToday > 0)
      .sort((a, b) => b.winsToday - a.winsToday || b.gamesPlayedToday - a.gamesPlayedToday)
      .map(p => ({
        player: p,
        primaryStat: p.winsToday,
        primaryLabel: p.winsToday === 1 ? 'win' : 'wins',
        secondaryLine: `${p.gamesPlayedToday} games (${p.gamesPlayedToday > 0 ? Math.round((p.winsToday / p.gamesPlayedToday) * 100) : 0}%)`,
      }));
  }

  const topThree = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const emptyLabel = timeFilter === 'all-time'
    ? 'Players need to complete games to appear here.'
    : timeFilter === 'this-month'
    ? 'No games recorded this month yet.'
    : 'No games recorded today yet.';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Trophy className="h-6 w-6 text-secondary" /> Rankings
          </h1>
          <p className="text-muted-foreground mt-1">Global ShuttleIQ player leaderboard</p>
        </motion.div>

        <motion.div variants={fadeInUp} className="flex items-center gap-2 mb-6 flex-wrap">
          {filters.map(f => {
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
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={timeFilter}
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
                      return (
                        <motion.div key={entry.player.id} variants={fadeInUp}>
                          <Card
                            className={`text-center border ${colors.border} ${podiumIdx === 0 ? 'md:-mt-4' : ''}`}
                            data-testid={`card-podium-${entry.player.id}`}
                          >
                            <CardContent className="p-4">
                              <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center mx-auto mb-2`}>
                                <Medal className={`h-5 w-5 ${colors.medal}`} />
                              </div>
                              <div className={`text-xs font-bold ${colors.text} mb-1`}>#{rank}</div>
                              <p className="font-semibold text-sm truncate" data-testid={`text-player-name-${entry.player.id}`}>
                                {entry.player.name}
                              </p>
                              <p className="text-2xl font-extrabold mt-1" data-testid={`text-player-score-${entry.player.id}`}>
                                {entry.primaryStat}
                              </p>
                              <p className="text-[10px] text-muted-foreground -mt-0.5">{entry.primaryLabel}</p>
                              <Badge variant="outline" className={`text-xs mt-2 ${levelColor(entry.player.level)}`}>
                                {entry.player.level}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1.5">
                                {entry.secondaryLine}
                              </p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {rest.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {rest.map((entry, index) => (
                          <motion.div
                            key={entry.player.id}
                            variants={fadeInUp}
                            className="flex items-center gap-3 px-4 py-3"
                            data-testid={`row-player-${entry.player.id}`}
                          >
                            <div className="w-8 text-center shrink-0">
                              <span className="text-sm text-muted-foreground font-medium">{index + 4}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate" data-testid={`text-player-name-${entry.player.id}`}>
                                {entry.player.name}
                              </div>
                              <div className="text-xs text-muted-foreground">{entry.player.shuttleIqId}</div>
                            </div>
                            <div className="text-right shrink-0 space-y-1">
                              <div className="font-semibold" data-testid={`text-player-score-${entry.player.id}`}>
                                {entry.primaryStat} <span className="text-xs font-normal text-muted-foreground">{entry.primaryLabel}</span>
                              </div>
                              <Badge variant="outline" className={`text-xs ${levelColor(entry.player.level)}`}>
                                {entry.player.level}
                              </Badge>
                            </div>
                            <div className="text-right shrink-0 text-sm text-muted-foreground w-24">
                              <div>{entry.secondaryLine}</div>
                            </div>
                          </motion.div>
                        ))}
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
