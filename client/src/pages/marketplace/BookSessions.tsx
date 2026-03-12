import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import type { BookableSessionWithAvailability } from '@shared/schema';

export default function BookSessions() {
  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const upcomingSessions = sessions?.filter(s => s.status === 'upcoming') || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Book a Session</h1>
        <p className="text-muted-foreground mt-1">Browse upcoming badminton sessions across Dubai</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-3/4 mb-3" />
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-9 w-28 mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : upcomingSessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No upcoming sessions</h3>
            <p className="text-sm text-muted-foreground">Check back soon for new sessions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {upcomingSessions.map((session) => (
            <Card key={session.id} className="hover-elevate" data-testid={`card-session-${session.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-lg" data-testid={`text-session-title-${session.id}`}>
                    {session.title}
                  </h3>
                  <Badge variant={session.spotsRemaining > 0 ? 'secondary' : 'destructive'} data-testid={`badge-spots-${session.id}`}>
                    {session.spotsRemaining > 0 ? `${session.spotsRemaining} spots` : 'Full'}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{format(new Date(session.date), 'EEEE, MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{session.startTime} - {session.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{session.venueName}{session.venueLocation ? ` — ${session.venueLocation}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>{session.courtCount} courts, {session.capacity} max players</span>
                  </div>
                </div>

                {session.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{session.description}</p>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-lg" data-testid={`text-price-${session.id}`}>
                    AED {session.priceAed}
                  </span>
                  <Link href={`/marketplace/sessions/${session.id}`}>
                    <Button size="sm" disabled={session.spotsRemaining <= 0} data-testid={`button-view-session-${session.id}`}>
                      {session.spotsRemaining > 0 ? 'View & Book' : 'View Details'}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
