import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Calendar, MapPin, Clock, XCircle, Banknote, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import type { BookingWithDetails } from '@shared/schema';

export default function MyBookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/cancel`);
    },
    onSuccess: () => {
      toast({ title: 'Booking cancelled' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to cancel', description: error.error, variant: 'destructive' });
    },
  });

  const upcoming = bookings?.filter(b => b.status !== 'cancelled' && new Date(b.session.date) >= new Date()) || [];
  const past = bookings?.filter(b => b.status === 'cancelled' || new Date(b.session.date) < new Date()) || [];

  const statusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="default" data-testid="badge-status-confirmed">Confirmed</Badge>;
      case 'attended': return <Badge variant="secondary" data-testid="badge-status-attended">Attended</Badge>;
      case 'cancelled': return <Badge variant="destructive" data-testid="badge-status-cancelled">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const BookingCard = ({ booking }: { booking: BookingWithDetails }) => (
    <Card key={booking.id} data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-semibold" data-testid={`text-booking-title-${booking.id}`}>
            {booking.session.title}
          </h3>
          {statusBadge(booking.status)}
        </div>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{format(new Date(booking.session.date), 'EEE, MMM d, yyyy')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{booking.session.startTime} - {booking.session.endTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{booking.session.venueName}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-medium" data-testid={`text-booking-amount-${booking.id}`}>
              AED {booking.amountAed}
            </span>
            <Badge variant="outline" className="text-xs" data-testid={`badge-method-${booking.id}`}>
              {booking.paymentMethod === 'cash' ? (
                <><Banknote className="h-3 w-3 mr-1" /> {booking.cashPaid ? 'Cash Paid' : 'Pay at Venue'}</>
              ) : (
                <><CreditCard className="h-3 w-3 mr-1" /> Card</>
              )}
            </Badge>
          </div>
          {booking.status === 'confirmed' && new Date(booking.session.date) >= new Date() && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => cancelMutation.mutate(booking.id)}
              disabled={cancelMutation.isPending}
              data-testid={`button-cancel-${booking.id}`}
            >
              <XCircle className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Bookings</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : bookings?.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No bookings yet</h3>
            <p className="text-sm text-muted-foreground">Browse sessions and book your first game.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" data-testid="text-upcoming-title">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map(b => <BookingCard key={b.id} booking={b} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" data-testid="text-past-title">Past & Cancelled</h2>
              <div className="space-y-3">
                {past.map(b => <BookingCard key={b.id} booking={b} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
