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
import { Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark, AlertTriangle, ArrowRight, ListOrdered, Users, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookingWithDetails, BookingGuest } from '@shared/schema';

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
  waitlisted: { variant: 'outline', label: 'Waitlisted' },
};

function isWithin5Hours(sessionDate: Date | string, startTime: string): boolean {
  const [hours, minutes] = startTime.split(':').map(Number);
  const sessionStartAt = new Date(sessionDate);
  sessionStartAt.setHours(hours, minutes, 0, 0);
  const cutoff = new Date(sessionStartAt.getTime() - 5 * 60 * 60 * 1000);
  return new Date() >= cutoff;
}

export default function MyBookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
    refetchOnMount: true,
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/cancel`);
    },
    onSuccess: (data: any) => {
      if (data?.lateFeeApplied) {
        toast({
          title: 'Booking cancelled — fee applied',
          description: 'You cancelled within 5 hours of the session. Your full payment has been retained.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Booking cancelled' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/notifications'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to cancel', description: error.message, variant: 'destructive' });
    },
  });

  const upcoming = bookings?.filter(b => b.status !== 'cancelled' && new Date(b.session.date) >= new Date()) || [];
  const waitlisted = upcoming.filter(b => b.status === 'waitlisted');
  const active = upcoming.filter(b => b.status !== 'waitlisted');
  const past = bookings?.filter(b => b.status === 'cancelled' || new Date(b.session.date) < new Date()) || [];

  const BookingCard = ({ booking, isPast }: { booking: BookingWithDetails; isPast?: boolean }) => {
    const status = statusConfig[booking.status] || { variant: 'outline' as const, label: booking.status };
    const isWaitlisted = booking.status === 'waitlisted';
    const canCancel = (booking.status === 'confirmed' || booking.status === 'waitlisted') && new Date(booking.session.date) >= new Date();
    const lateFee = !isWaitlisted && canCancel && isWithin5Hours(booking.session.date, booking.session.startTime);

    const stripColor = isWaitlisted ? 'bg-amber-500'
      : booking.status === 'confirmed' ? 'bg-secondary'
      : booking.status === 'attended' ? 'bg-green-500'
      : booking.status === 'cancelled' ? 'bg-muted-foreground/30'
      : 'bg-muted-foreground/20';

    return (
      <Card className={`overflow-hidden ${isPast ? 'opacity-75' : ''}`} data-testid={`card-booking-${booking.id}`}>
        <div className="flex">
          <div className={`w-1 shrink-0 ${stripColor}`} />
          <CardContent className="p-5 flex-1">
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate" data-testid={`text-booking-title-${booking.id}`}>
                  {booking.session.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Booked {format(new Date(booking.createdAt || Date.now()), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isWaitlisted && booking.waitlistPosition && (
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 gap-1" data-testid={`badge-waitlist-position-${booking.id}`}>
                    <ListOrdered className="h-3 w-3" />
                    #{booking.waitlistPosition}
                  </Badge>
                )}
                <Badge variant={status.variant} data-testid={`badge-status-${booking.id}`}>
                  {status.label}
                </Badge>
              </div>
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

            {/* Guests section */}
            {booking.guests && booking.guests.filter(g => g.status === 'confirmed').length > 0 && (
              <div className="mb-3 p-3 rounded-md bg-muted/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                  Guests ({booking.guests.filter(g => g.status === 'confirmed').length})
                </div>
                {booking.guests.filter(g => g.status === 'confirmed').map((guest: BookingGuest) => (
                  <div key={guest.id} className="flex items-center gap-1.5 text-xs" data-testid={`text-guest-name-${guest.id}`}>
                    <UserCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span>{guest.name}</span>
                    {guest.email && <span className="text-muted-foreground">({guest.email})</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {!isWaitlisted && (
                  <span className="font-semibold" data-testid={`text-booking-amount-${booking.id}`}>
                    AED {booking.amountAed}
                  </span>
                )}
                {!isWaitlisted && booking.spotsBooked > 1 && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    {booking.spotsBooked} spots
                  </Badge>
                )}
                {!isWaitlisted && (
                  <Badge variant="outline" className="text-xs" data-testid={`badge-method-${booking.id}`}>
                    {booking.paymentMethod === 'cash' ? (
                      <><Banknote className="h-3 w-3 mr-1" /> {booking.cashPaid ? 'Cash Paid' : 'Pay at Venue'}</>
                    ) : (
                      <><CreditCard className="h-3 w-3 mr-1" /> Card</>
                    )}
                  </Badge>
                )}
                {isWaitlisted && (
                  <span className="text-xs text-muted-foreground">No payment until confirmed</span>
                )}
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
                      <XCircle className="h-3.5 w-3.5" />
                      {isWaitlisted ? 'Leave Waitlist' : 'Cancel'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        {isWaitlisted ? 'Leave Waitlist' : 'Cancel Booking'}
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            {isWaitlisted
                              ? `Remove yourself from the waitlist for "${booking.session.title}" on ${format(new Date(booking.session.date), 'MMMM d')}?`
                              : `Are you sure you want to cancel your booking for "${booking.session.title}" on ${format(new Date(booking.session.date), 'MMMM d')}?`}
                          </p>
                          {lateFee && !isWaitlisted && (
                            <div className="flex gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                              <p className="text-sm text-destructive font-medium">
                                This cancellation is within 5 hours of the session start. Your full payment of AED {booking.amountAed} will be retained. This cannot be undone.
                              </p>
                            </div>
                          )}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{isWaitlisted ? 'Stay on Waitlist' : 'Keep Booking'}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate(booking.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        {isWaitlisted ? 'Leave Waitlist' : lateFee ? 'Cancel & Forfeit Payment' : 'Yes, Cancel'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </div>
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
            {waitlisted.length > 0 && (
              <motion.div variants={fadeInUp}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-waitlist-title">
                    <ListOrdered className="h-5 w-5 text-amber-500" />
                    Waitlisted
                  </h2>
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">{waitlisted.length}</Badge>
                </div>
                <div className="space-y-3">
                  {waitlisted.map(b => (
                    <motion.div key={b.id} variants={fadeInUp}>
                      <BookingCard booking={b} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
            {active.length > 0 && (
              <motion.div variants={fadeInUp}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold" data-testid="text-upcoming-title">Upcoming</h2>
                  <Badge variant="secondary" className="text-xs">{active.length}</Badge>
                </div>
                <div className="space-y-3">
                  {active.map(b => (
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
