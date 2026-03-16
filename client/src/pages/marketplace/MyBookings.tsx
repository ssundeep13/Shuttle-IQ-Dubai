import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark, AlertTriangle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookingWithDetails } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  confirmed: { variant: 'default', label: 'Confirmed' },
  attended: { variant: 'secondary', label: 'Attended' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
  pending: { variant: 'outline', label: 'Pending' },
};

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

  const BookingCard = ({ booking, isPast }: { booking: BookingWithDetails; isPast?: boolean }) => {
    const status = statusConfig[booking.status] || { variant: 'outline' as const, label: booking.status };
    const canCancel = booking.status === 'confirmed' && new Date(booking.session.date) >= new Date();

    return (
      <Card className={isPast ? 'opacity-75' : ''} data-testid={`card-booking-${booking.id}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold truncate" data-testid={`text-booking-title-${booking.id}`}>
                {booking.session.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Booked {format(new Date(booking.createdAt || Date.now()), 'MMM d, yyyy')}
              </p>
            </div>
            <Badge variant={status.variant} data-testid={`badge-status-${booking.id}`}>
              {status.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{format(new Date(booking.session.date), 'EEE, MMM d')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{booking.session.startTime} - {booking.session.endTime}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{booking.session.venueName}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-semibold" data-testid={`text-booking-amount-${booking.id}`}>
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
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={cancelMutation.isPending}
                    data-testid={`button-cancel-${booking.id}`}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Cancel Booking
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel your booking for <strong>{booking.session.title}</strong> on {format(new Date(booking.session.date), 'MMMM d')}?
                      Cancellations within 12 hours of the session may be subject to full payment.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelMutation.mutate(booking.id)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Yes, Cancel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Bookmark className="h-6 w-6 text-secondary" /> My Bookings
          </h1>
          <p className="text-muted-foreground mt-1">Manage your session bookings</p>
        </motion.div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : bookings?.length === 0 ? (
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No bookings yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Browse sessions and book your first game.</p>
                <Link href="/marketplace/book">
                  <Button size="sm" className="gap-1" data-testid="button-browse-sessions">
                    Browse Sessions <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <motion.div variants={fadeInUp}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold" data-testid="text-upcoming-title">Upcoming</h2>
                  <Badge variant="secondary" className="text-xs">{upcoming.length}</Badge>
                </div>
                <div className="space-y-3">
                  {upcoming.map(b => (
                    <motion.div key={b.id} variants={fadeInUp}>
                      <BookingCard booking={b} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
            {past.length > 0 && (
              <motion.div variants={fadeInUp}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold" data-testid="text-past-title">Past & Cancelled</h2>
                  <Badge variant="outline" className="text-xs">{past.length}</Badge>
                </div>
                <div className="space-y-3">
                  {past.map(b => (
                    <motion.div key={b.id} variants={fadeInUp}>
                      <BookingCard booking={b} isPast />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
