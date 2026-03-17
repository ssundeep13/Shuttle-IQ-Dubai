import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Calendar, MapPin, Clock, Users, CheckCircle, ArrowRight, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { motion } from 'framer-motion';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';
import { useMemo } from 'react';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

export default function BookSessions() {
  const { isAuthenticated } = useMarketplaceAuth();

  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const { data: myBookings } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  const bookedSessionIds = useMemo(() => {
    if (!myBookings) return new Set<string>();
    return new Set(
      myBookings
        .filter(b => b.status === 'confirmed' || b.status === 'attended')
        .map(b => b.sessionId)
    );
  }, [myBookings]);

  const upcomingSessions = sessions?.filter(s => s.status === 'upcoming') || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Calendar className="h-6 w-6 text-secondary" /> Sessions
          </h1>
          <p className="text-muted-foreground mt-1">Browse and book upcoming badminton sessions across Dubai</p>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-3" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-2 w-full mb-3" />
                  <Skeleton className="h-9 w-28 mt-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : upcomingSessions.length === 0 ? (
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No upcoming sessions</h3>
                <p className="text-sm text-muted-foreground">Check back soon for new sessions.</p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {upcomingSessions.map((session) => {
              const isBooked = bookedSessionIds.has(session.id);
              const capacityPercent = session.capacity > 0
                ? Math.round((session.totalBookings / session.capacity) * 100)
                : 0;
              const spotsLow = session.spotsRemaining > 0 && session.spotsRemaining <= 3;

              const levelBandColor = session.title.toLowerCase().includes('advanced') || session.title.toLowerCase().includes('pro')
                ? 'bg-purple-500'
                : session.title.toLowerCase().includes('intermediate')
                ? 'bg-blue-500'
                : session.title.toLowerCase().includes('beginner') || session.title.toLowerCase().includes('novice')
                ? 'bg-green-500'
                : 'bg-secondary';

              return (
                <motion.div key={session.id} variants={fadeInUp}>
                  <Card className="h-full flex flex-col overflow-hidden" data-testid={`card-session-${session.id}`}>
                    <div className={`h-1 w-full ${levelBandColor}`} />
                    <div className="h-28 bg-muted/50 flex items-center justify-center relative">
                      {session.imageUrl ? (
                        <img src={session.imageUrl} alt={session.title} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-10 w-10 text-muted-foreground/30" />
                      )}
                      <div className="absolute top-2 right-2">
                        {isBooked ? (
                          <Badge variant="default" className="bg-green-600 dark:bg-green-700" data-testid={`badge-booked-${session.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Booked
                          </Badge>
                        ) : session.spotsRemaining <= 0 ? (
                          <Badge variant="destructive" data-testid={`badge-spots-${session.id}`}>Full</Badge>
                        ) : spotsLow ? (
                          <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-500/20" data-testid={`badge-spots-${session.id}`}>
                            {session.spotsRemaining} left
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-spots-${session.id}`}>
                            {session.spotsRemaining} spots
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardContent className="p-5 flex flex-col flex-1">
                      <div className="mb-3">
                        <h3 className="font-semibold text-lg truncate" data-testid={`text-session-title-${session.id}`}>
                          {session.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(session.date), 'EEEE, MMM d')}
                        </p>
                      </div>

                      <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>{session.startTime} - {session.endTime}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="truncate block">{session.venueName}{session.venueLocation ? ` · ${session.venueLocation}` : ''}</span>
                            {session.venueMapUrl && (
                              <a
                                href={session.venueMapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`link-session-map-card-${session.id}`}
                              >
                                View on Map
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{session.courtCount} courts</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{session.totalBookings} / {session.capacity} booked</span>
                          <span>{capacityPercent}%</span>
                        </div>
                        <Progress value={capacityPercent} className="h-1.5" />
                      </div>

                      {session.description && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{session.description}</p>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t flex-wrap">
                        <span className="font-bold text-lg" data-testid={`text-price-${session.id}`}>
                          AED {session.priceAed}
                        </span>
                        <Link href={`/marketplace/sessions/${session.id}`}>
                          <Button
                            size="sm"
                            variant={isBooked ? 'outline' : 'default'}
                            className="gap-1"
                            disabled={!isBooked && session.spotsRemaining <= 0}
                            data-testid={isBooked ? `button-view-booking-${session.id}` : `button-view-session-${session.id}`}
                          >
                            {isBooked ? 'View Booking' : session.spotsRemaining > 0 ? 'View & Book' : 'View Details'}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
