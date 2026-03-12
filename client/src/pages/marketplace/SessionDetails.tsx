import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Calendar, MapPin, Clock, Users, CreditCard, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';
import type { BookableSessionWithAvailability } from '@shared/schema';

export default function SessionDetails() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery<BookableSessionWithAvailability>({
    queryKey: ['/api/marketplace/sessions', id],
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/marketplace/bookings', { sessionId: id });
    },
    onSuccess: () => {
      toast({ title: 'Booking confirmed!', description: 'Your spot has been reserved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      setLocation('/marketplace/my-bookings');
    },
    onError: (error: any) => {
      toast({ title: 'Booking failed', description: error.error || 'Something went wrong', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-1/2 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Session not found</h2>
        <Link href="/marketplace/book">
          <Button variant="ghost">Back to sessions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/marketplace/book">
        <Button variant="ghost" size="sm" className="mb-4 gap-1" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" /> Back to sessions
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle className="text-2xl" data-testid="text-session-title">{session.title}</CardTitle>
            <Badge variant={session.spotsRemaining > 0 ? 'secondary' : 'destructive'}>
              {session.spotsRemaining > 0 ? `${session.spotsRemaining} spots left` : 'Full'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm text-muted-foreground">Date</div>
                <div className="font-medium">{format(new Date(session.date), 'EEEE, MMMM d, yyyy')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm text-muted-foreground">Time</div>
                <div className="font-medium">{session.startTime} - {session.endTime}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm text-muted-foreground">Venue</div>
                <div className="font-medium">{session.venueName}</div>
                {session.venueLocation && <div className="text-sm text-muted-foreground">{session.venueLocation}</div>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm text-muted-foreground">Capacity</div>
                <div className="font-medium">{session.courtCount} courts, {session.totalBookings}/{session.capacity} booked</div>
              </div>
            </div>
          </div>

          {session.description && (
            <div>
              <h3 className="font-semibold mb-2">About this session</h3>
              <p className="text-muted-foreground">{session.description}</p>
            </div>
          )}

          <div className="border-t pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-muted-foreground">Price per player</div>
                <div className="text-2xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
              </div>
              {isAuthenticated ? (
                <Button
                  size="lg"
                  className="gap-2"
                  disabled={session.spotsRemaining <= 0 || bookMutation.isPending}
                  onClick={() => bookMutation.mutate()}
                  data-testid="button-book-now"
                >
                  <CreditCard className="h-5 w-5" />
                  {bookMutation.isPending ? 'Booking...' : session.spotsRemaining <= 0 ? 'Session Full' : 'Book Now'}
                </Button>
              ) : (
                <Link href="/marketplace/login">
                  <Button size="lg" className="gap-2" data-testid="button-login-to-book">
                    Log in to book
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
