import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Calendar, MapPin, Clock, Trophy, BarChart3, TrendingUp, ArrowRight, Medal, ChevronRight, Target, Bookmark } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookingWithDetails, Player, PlayerStats } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function Dashboard() {
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
  });

  const { data: stats } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  const { data: players } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const upcomingBookings = bookings?.filter(b => b.status !== 'cancelled' && new Date(b.session.date) >= new Date()) || [];
  const nextBooking = upcomingBookings[0];

  const ranked = (players || [])
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => b.skillScore - a.skillScore)
    .slice(0, 5);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
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
                        <div className="text-2xl font-bold">{stats.totalGames}</div>
                        <div className="text-xs text-muted-foreground">Games</div>
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
              <Card data-testid="card-leaderboard-preview">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-secondary" />
                      Top Players
                    </CardTitle>
                    <Link href="/marketplace/rankings">
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="link-view-rankings">
                        View All <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ranked.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No ranked players yet</p>
                  ) : ranked.map((player, i) => (
                    <div key={player.id} className="flex items-center gap-3 py-1.5" data-testid={`row-top-player-${player.id}`}>
                      <div className="w-6 text-center shrink-0">
                        {i < 3 ? (
                          <Medal className={`h-4 w-4 mx-auto ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-amber-600'}`} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{i + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.name}</p>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{player.skillScore}</span>
                    </div>
                  ))}
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
          </div>
        </div>
      </motion.div>
    </div>
  );
}
