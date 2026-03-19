import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Calendar, MapPin, Clock, BarChart3, TrendingUp, ArrowRight, ChevronRight, Target, Bookmark, Download, Users, Tag as TagIcon } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookingWithDetails, PlayerStats, TrendingTag, PlayerTopTag } from '@shared/schema';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import TagTrendingModal from '@/components/TagTrendingModal';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

export default function Dashboard() {
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;
  const { canInstall, install } = useInstallPrompt();
  const [showTrendingModal, setShowTrendingModal] = useState(false);

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
  });

  const { data: stats } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  const { data: trending = [], isLoading: trendingLoading } = useQuery<TrendingTag[]>({
    queryKey: ['/api/tags/trending'],
    staleTime: Infinity,
  });

  const { data: myTopTag } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', linkedPlayerId],
    queryFn: () => fetch(`/api/tags/player/${linkedPlayerId}?limit=1`).then(r => r.json()),
    enabled: !!linkedPlayerId,
    staleTime: Infinity,
  });

  const { data: taggedGameIds = [] } = useQuery<string[]>({
    queryKey: ['/api/tags/tagged-games'],
    enabled: !!linkedPlayerId,
    staleTime: 0,
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const taggedSet = new Set(taggedGameIds);
  const untaggedCount = (stats?.recentGames ?? [])
    .filter(g => g.date && new Date(g.date) >= sevenDaysAgo && !taggedSet.has(g.gameId))
    .length;

  const upcomingBookings = (bookings || [])
    .filter(b => b.status === 'confirmed' && new Date(b.session.date) >= new Date())
    .sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime());
  const nextBooking = upcomingBookings[0];

  const firstTopTag = myTopTag?.[0];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <>
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-lg">
                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-dashboard-greeting">
                {greeting()}, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-muted-foreground text-sm">Here's your ShuttleIQ overview</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {linkedPlayerId && untaggedCount > 0 && (
              <motion.div variants={fadeInUp}>
                <Link href="/marketplace/my-scores">
                  <div
                    className="flex items-center gap-3 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 hover-elevate cursor-pointer"
                    data-testid="card-tag-nudge"
                  >
                    <div className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-secondary/20">
                      <TagIcon className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug">
                        {untaggedCount === 1
                          ? '1 game waiting — tag your teammates!'
                          : `${untaggedCount} games waiting — tag your teammates!`}
                      </p>
                      <p className="text-xs text-muted-foreground">Recognise great play from your recent games</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              </motion.div>
            )}

            <motion.div variants={fadeInUp}>
              <Card data-testid="card-next-session">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-secondary" />
                    Your Next Session
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {bookingsLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : nextBooking ? (
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1.5">
                        <p className="font-semibold" data-testid="text-next-session-title">{nextBooking.session.title}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(nextBooking.session.date), 'EEE, MMM d')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {nextBooking.session.startTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {nextBooking.session.venueName}
                          </span>
                        </div>
                      </div>
                      <Badge variant="default" data-testid="badge-next-status">
                        {nextBooking.status === 'confirmed' ? 'Confirmed' : nextBooking.status}
                      </Badge>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-3">No upcoming sessions booked</p>
                      <Link href="/marketplace/book">
                        <Button size="sm" variant="outline" className="gap-1" data-testid="button-browse-from-dashboard">
                          Browse Sessions <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {stats ? (
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-stats">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-secondary" />
                        Your Stats
                      </CardTitle>
                      <Link href="/marketplace/my-scores">
                        <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="link-view-all-stats">
                          View All <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold" data-testid="text-stat-score">{stats.player.skillScore}</div>
                        <div className="text-xs text-muted-foreground">Skill Score</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">#{stats.rankBySkillScore}</div>
                        <div className="text-xs text-muted-foreground">Rank</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{stats.totalWins}</div>
                        <div className="text-xs text-muted-foreground">Wins</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{stats.winRate}%</div>
                        <div className="text-xs text-muted-foreground">Win Rate</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div variants={fadeInUp}>
                <Card>
                  <CardContent className="p-6 text-center">
                    <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="font-medium mb-1">Link your player profile</p>
                    <p className="text-sm text-muted-foreground mb-3">Connect your account to see your stats, rankings, and match history.</p>
                    <Link href="/marketplace/profile">
                      <Button size="sm" variant="outline" data-testid="button-link-profile">Go to Profile</Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {upcomingBookings.length > 1 && (
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-upcoming-bookings">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bookmark className="h-4 w-4 text-secondary" />
                        Upcoming Bookings
                      </CardTitle>
                      <Link href="/marketplace/my-bookings">
                        <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="link-view-all-bookings">
                          View All <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {upcomingBookings.slice(1, 4).map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0" data-testid={`row-booking-${b.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{b.session.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(b.session.date), 'EEE, MMM d')} at {b.session.startTime}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {b.status === 'confirmed' ? 'Confirmed' : b.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          <div className="space-y-6">
            <motion.div variants={fadeInUp}>
              <Card data-testid="card-player-personalities">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-secondary" />
                      Player Personalities
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => setShowTrendingModal(true)}
                      data-testid="button-explore-personalities"
                    >
                      Explore <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {firstTopTag && (
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">Your Top Tag</p>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-medium border ${CATEGORY_COLOR[firstTopTag.tag.category]}`}>
                          {firstTopTag.tag.emoji} {firstTopTag.tag.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Community Tag &middot; {firstTopTag.count}×
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5 font-medium">Trending This Week</p>
                    {trendingLoading ? (
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
                      </div>
                    ) : trending.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tags yet. Tag players after your games!</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {trending.slice(0, 5).map(({ tag, count }) => (
                          <button
                            key={tag.id}
                            onClick={() => setShowTrendingModal(true)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border hover-elevate cursor-pointer ${CATEGORY_COLOR[tag.category]}`}
                            data-testid={`btn-personality-tag-${tag.id}`}
                          >
                            {tag.emoji} {tag.label}
                            <span className="opacity-60 ml-0.5">{count}×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!linkedPlayerId && (
                    <div className="text-center pt-1">
                      <Link href="/marketplace/profile">
                        <Button variant="outline" size="sm" className="gap-1 text-xs" data-testid="button-link-for-tags">
                          Link profile to earn tags <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <Card>
                <CardContent className="p-6 text-center">
                  <TrendingUp className="h-8 w-8 text-secondary mx-auto mb-2" />
                  <p className="font-medium mb-1">Find your next game</p>
                  <p className="text-sm text-muted-foreground mb-4">Book sessions across Dubai venues</p>
                  <Link href="/marketplace/book">
                    <Button size="sm" className="gap-1 w-full" data-testid="button-find-session">
                      Browse Sessions <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>

            {canInstall && (
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-install-app">
                  <CardContent className="p-6 text-center">
                    <Download className="h-8 w-8 text-secondary mx-auto mb-2" />
                    <p className="font-medium mb-1">Get the App</p>
                    <p className="text-sm text-muted-foreground mb-4">Install ShuttleIQ on your home screen for quick access</p>
                    <Button size="sm" className="gap-1 w-full" onClick={install} data-testid="button-install-app-dashboard">
                      Install Now <Download className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>

    <TagTrendingModal
      open={showTrendingModal}
      onOpenChange={setShowTrendingModal}
      linkedPlayerId={linkedPlayerId}
    />
    </>
  );
}
