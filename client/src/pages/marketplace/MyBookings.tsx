import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
import { Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark, AlertTriangle, ArrowRight, ListOrdered, Users, Timer, UserCheck, Pencil, Check, X, UserPlus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getRelativeTimeLabel } from '@/lib/timeUtils';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookingWithDetails, BookingGuest } from '@shared/schema';
import { usePageTitle } from '@/hooks/usePageTitle';

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
  pending_payment: { variant: 'outline', label: 'Payment Due' },
};

const PAYMENT_WINDOW_MS = 4 * 60 * 60 * 1000;

function usePaymentCountdown(promotedAt: string | Date | null): { label: string; expired: boolean } {
  const [state, setState] = useState<{ label: string; expired: boolean }>({ label: '', expired: false });

  useEffect(() => {
    if (!promotedAt) return;
    const deadline = new Date(promotedAt).getTime() + PAYMENT_WINDOW_MS;

    const update = () => {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        setState({ label: 'Expired', expired: true });
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setState({ label: `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`, expired: false });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [promotedAt]);

  return state;
}

function isWithin5Hours(sessionDate: Date | string, startTime: string): boolean {
  const [hours, minutes] = startTime.split(':').map(Number);
  const sessionStartAt = new Date(sessionDate);
  sessionStartAt.setHours(hours, minutes, 0, 0);
  const cutoff = new Date(sessionStartAt.getTime() - 5 * 60 * 60 * 1000);
  return new Date() >= cutoff;
}

function GuestList({ booking, canManage, onCancelGuest, onEditGuest, isEditPending }: {
  booking: BookingWithDetails;
  canManage: boolean;
  onCancelGuest: (guestId: string) => void;
  onEditGuest: (guestId: string, name: string, email: string) => void;
  isEditPending: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // Filter out primary booker slot — it's represented by the booking itself, not a guest row
  const confirmedGuests = (booking.guests ?? []).filter(g => g.status === 'confirmed' && !g.isPrimary);
  if (confirmedGuests.length === 0) return null;

  const startEdit = (guest: BookingGuest) => {
    setEditingId(guest.id);
    setEditName(guest.name);
    setEditEmail(guest.email ?? '');
  };

  const saveEdit = (guestId: string) => {
    if (!editName.trim()) return;
    onEditGuest(guestId, editName.trim(), editEmail.trim());
    setEditingId(null);
  };

  return (
    <div className="mb-3 p-3 rounded-md bg-muted/40 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        <Users className="h-3.5 w-3.5" />
        Guests ({confirmedGuests.length})
      </div>
      {confirmedGuests.map((guest: BookingGuest) => (
        <div key={guest.id} data-testid={`text-guest-name-${guest.id}`}>
          {editingId === guest.id ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Guest name"
                className="h-7 text-xs px-2 flex-1"
                data-testid={`input-edit-guest-name-${guest.id}`}
              />
              <Input
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="Email (optional)"
                className="h-7 text-xs px-2 flex-1"
                data-testid={`input-edit-guest-email-${guest.id}`}
              />
              <Button size="icon" variant="ghost" disabled={isEditPending} onClick={() => saveEdit(guest.id)} data-testid={`button-save-guest-${guest.id}`}>
                <Check className="h-3.5 w-3.5 text-secondary" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-guest-${guest.id}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <UserCheck className={`h-3 w-3 shrink-0 ${guest.linkedUserId ? 'text-secondary' : 'text-muted-foreground'}`} />
                <span className="truncate">{guest.name}</span>
                {guest.linkedUserId && (
                  <Badge variant="secondary" className="text-xs h-4 px-1" data-testid={`badge-guest-linked-${guest.id}`}>
                    linked
                  </Badge>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEdit(guest)} data-testid={`button-edit-guest-${guest.id}`}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-5 w-5" data-testid={`button-cancel-guest-${guest.id}`}>
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Guest Spot?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove <strong>{guest.name}</strong>'s spot from the booking. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Spot</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onCancelGuest(guest.id)}>Cancel Spot</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MyBookings() {
  usePageTitle('My Bookings');
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

  const cancelGuestMutation = useMutation({
    mutationFn: async ({ bookingId, guestId }: { bookingId: string; guestId: string }) => {
      return apiRequest('DELETE', `/api/marketplace/bookings/${bookingId}/guests/${guestId}`);
    },
    onSuccess: () => {
      toast({ title: 'Guest spot cancelled' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to cancel guest spot', description: error.message, variant: 'destructive' });
    },
  });

  const editGuestMutation = useMutation({
    mutationFn: async ({ bookingId, guestId, name, email }: { bookingId: string; guestId: string; name: string; email: string }) => {
      return apiRequest('PATCH', `/api/marketplace/bookings/${bookingId}/guests/${guestId}`, { name, email: email || null });
    },
    onSuccess: () => {
      toast({ title: 'Guest details updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update guest', description: error.message, variant: 'destructive' });
    },
  });

  const initiatePaymentMutation = useMutation({
    mutationFn: async (bookingId: string): Promise<{ redirectUrl: string }> => {
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/initiate-payment`);
    },
    onSuccess: (data) => {
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to start payment', description: error.message, variant: 'destructive' });
    },
  });

  const [addGuestBooking, setAddGuestBooking] = useState<BookingWithDetails | null>(null);
  const [addGuestName, setAddGuestName] = useState('');
  const [addGuestEmail, setAddGuestEmail] = useState('');
  const [addGuestPaymentMethod, setAddGuestPaymentMethod] = useState<'cash' | 'ziina'>('cash');

  const addGuestMutation = useMutation({
    mutationFn: async ({ bookingId, guestName, guestEmail, paymentMethod }: {
      bookingId: string; guestName: string; guestEmail: string; paymentMethod: 'cash' | 'ziina';
    }) => {
      return apiRequest<{ success?: boolean; redirectUrl?: string }>(
        'POST',
        `/api/marketplace/bookings/${bookingId}/add-guest`,
        { guestName, guestEmail: guestEmail || null, paymentMethod }
      );
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      toast({ title: 'Guest added successfully' });
      setAddGuestBooking(null);
      setAddGuestName('');
      setAddGuestEmail('');
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add guest', description: error.message, variant: 'destructive' });
    },
  });

  const sessionEndTime = (b: BookingWithDetails) => new Date(`${String(b.session.date).slice(0, 10)}T${b.session.endTime || '23:59'}`);
  const upcoming = bookings?.filter(b => b.status !== 'cancelled' && sessionEndTime(b) >= new Date()) || [];
  const waitlisted = upcoming.filter(b => b.status === 'waitlisted');
  const pendingPayment = upcoming.filter(b => b.status === 'pending_payment');
  const active = upcoming.filter(b => b.status !== 'waitlisted' && b.status !== 'pending_payment');
  const past = bookings?.filter(b => b.status === 'cancelled' || sessionEndTime(b) < new Date()) || [];

  const BookingCard = ({ booking, isPast }: { booking: BookingWithDetails; isPast?: boolean }) => {
    const status = statusConfig[booking.status] || { variant: 'outline' as const, label: booking.status };
    const isWaitlisted = booking.status === 'waitlisted';
    const isPendingPayment = booking.status === 'pending_payment';
    const countdown = usePaymentCountdown(isPendingPayment ? booking.promotedAt : null);
    const isLinkedGuest = booking.isGuestBooking && !!booking.myGuestId;
    const canCancel = !booking.isGuestBooking && (booking.status === 'confirmed' || booking.status === 'waitlisted' || booking.status === 'pending_payment') && sessionEndTime(booking) >= new Date();
    const canCancelAsGuest = isLinkedGuest && booking.status !== 'cancelled' && sessionEndTime(booking) >= new Date();
    const lateFee = !isWaitlisted && !isPendingPayment && canCancel && isWithin5Hours(booking.session.date, booking.session.startTime);

    const stripColor = isWaitlisted ? 'bg-amber-500'
      : isPendingPayment ? 'bg-orange-500'
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
                  {booking.isGuestBooking && booking.bookedByName
                    ? `Guest spot — booked by ${booking.bookedByName}`
                    : `Booked ${format(new Date(booking.createdAt || Date.now()), 'MMM d, yyyy')}`
                  }
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

            {(() => {
              const relTime = !isPast
                ? getRelativeTimeLabel(booking.session.date as unknown as string, booking.session.startTime)
                : '';
              return relTime ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-secondary mb-2" data-testid={`text-booking-relative-${booking.id}`}>
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  {relTime}
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{format(new Date(booking.session.date), 'EEE, MMM d')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{booking.session.startTime}{booking.session.endTime ? ` – ${booking.session.endTime}` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{booking.session.venueName}</span>
              </div>
            </div>

            {/* Guests section */}
            {!booking.isGuestBooking && booking.guests && booking.guests.filter(g => g.status === 'confirmed').length > 0 && (
              <GuestList
                booking={booking}
                canManage={canCancel}
                onCancelGuest={(guestId) => cancelGuestMutation.mutate({ bookingId: booking.id, guestId })}
                onEditGuest={(guestId, name, email) => editGuestMutation.mutate({ bookingId: booking.id, guestId, name, email })}
                isEditPending={editGuestMutation.isPending}
              />
            )}
            {!booking.isGuestBooking && booking.status === 'confirmed' && !isPast && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 mt-2"
                onClick={() => {
                  setAddGuestBooking(booking);
                  setAddGuestName('');
                  setAddGuestEmail('');
                  setAddGuestPaymentMethod('cash');
                }}
                data-testid={`button-add-guest-${booking.id}`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Guest
              </Button>
            )}

            {/* Pending payment banner */}
            {isPendingPayment && (
              <div className={`mb-4 flex items-start gap-3 rounded-md border p-3 ${countdown.expired ? 'bg-muted/40 border-muted' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40'}`} data-testid={`banner-payment-due-${booking.id}`}>
                <Timer className={`h-4 w-4 shrink-0 mt-0.5 ${countdown.expired ? 'text-muted-foreground' : 'text-orange-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${countdown.expired ? 'text-muted-foreground' : 'text-orange-700 dark:text-orange-300'}`}>
                    {countdown.expired ? 'Payment window expired — spot will be released shortly' : 'Payment required to secure your spot'}
                  </p>
                  <p className={`text-xs mt-0.5 font-mono tabular-nums ${countdown.expired ? 'text-muted-foreground' : 'text-orange-600 dark:text-orange-400'}`}>
                    {countdown.expired ? 'Expired' : `Time remaining: ${countdown.label}`}
                  </p>
                </div>
                {!countdown.expired && (
                  <Button
                    size="sm"
                    onClick={() => initiatePaymentMutation.mutate(booking.id)}
                    disabled={initiatePaymentMutation.isPending}
                    data-testid={`button-complete-payment-${booking.id}`}
                    className="shrink-0"
                  >
                    {initiatePaymentMutation.isPending ? 'Loading...' : 'Pay Now'}
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {!isWaitlisted && !isPendingPayment && (
                  <span className="font-semibold" data-testid={`text-booking-amount-${booking.id}`}>
                    AED {booking.amountAed}
                  </span>
                )}
                {!isWaitlisted && !isPendingPayment && booking.spotsBooked > 1 && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    {booking.spotsBooked} spots
                  </Badge>
                )}
                {!isWaitlisted && !isPendingPayment && (
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
                {isPendingPayment && (
                  <span className="text-xs text-muted-foreground">AED {booking.amountAed} — payment required</span>
                )}
              </div>
              {canCancelAsGuest && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={cancelGuestMutation.isPending}
                      data-testid={`button-cancel-guest-spot-${booking.id}`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel My Spot
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Your Guest Spot?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your guest spot from "{booking.session.title}" on {format(new Date(booking.session.date), 'MMMM d')}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Spot</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelGuestMutation.mutate({ bookingId: booking.id, guestId: booking.myGuestId! })}
                      >
                        Cancel Spot
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
                      {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : 'Cancel'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : 'Cancel Booking'}
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            {isWaitlisted
                              ? `Remove yourself from the waitlist for "${booking.session.title}" on ${format(new Date(booking.session.date), 'MMMM d')}?`
                              : isPendingPayment
                              ? `Decline this spot for "${booking.session.title}" on ${format(new Date(booking.session.date), 'MMMM d')}? The spot will be offered to the next person on the waitlist.`
                              : `Are you sure you want to cancel your booking for "${booking.session.title}" on ${format(new Date(booking.session.date), 'MMMM d')}?`}
                          </p>
                          {lateFee && (
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
                      <AlertDialogCancel>{isWaitlisted ? 'Stay on Waitlist' : isPendingPayment ? 'Keep Spot' : 'Keep Booking'}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate(booking.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : lateFee ? 'Cancel & Forfeit Payment' : 'Yes, Cancel'}
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
    <>
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
            {pendingPayment.length > 0 && (
              <motion.div variants={fadeInUp}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-pending-payment-title">
                    <Timer className="h-5 w-5 text-orange-500" />
                    Payment Required
                  </h2>
                  <Badge variant="outline" className="text-xs border-orange-400/40 text-orange-600 dark:text-orange-400">{pendingPayment.length}</Badge>
                </div>
                <div className="space-y-3">
                  {pendingPayment.map(b => (
                    <motion.div key={b.id} variants={fadeInUp}>
                      <BookingCard booking={b} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
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

    <Dialog open={!!addGuestBooking} onOpenChange={(open) => { if (!open) setAddGuestBooking(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Guest</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Adding a guest to: <strong>{addGuestBooking?.session.title}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="add-guest-name">Guest name <span className="text-destructive">*</span></Label>
            <Input
              id="add-guest-name"
              placeholder="Full name"
              value={addGuestName}
              onChange={e => setAddGuestName(e.target.value)}
              data-testid="input-add-guest-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-guest-email">Guest email <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="add-guest-email"
              type="email"
              placeholder="They'll receive a booking notification"
              value={addGuestEmail}
              onChange={e => setAddGuestEmail(e.target.value)}
              data-testid="input-add-guest-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddGuestPaymentMethod('cash')}
                className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-sm transition-colors ${
                  addGuestPaymentMethod === 'cash'
                    ? 'border-secondary bg-secondary/10 text-secondary font-medium'
                    : 'border-border text-muted-foreground hover-elevate'
                }`}
                data-testid="button-add-guest-cash"
              >
                <Banknote className="h-4 w-4" />
                Pay at Venue
              </button>
              <button
                type="button"
                onClick={() => setAddGuestPaymentMethod('ziina')}
                className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-sm transition-colors ${
                  addGuestPaymentMethod === 'ziina'
                    ? 'border-secondary bg-secondary/10 text-secondary font-medium'
                    : 'border-border text-muted-foreground hover-elevate'
                }`}
                data-testid="button-add-guest-ziina"
              >
                <CreditCard className="h-4 w-4" />
                Pay Online
              </button>
            </div>
            {addGuestBooking && (
              <p className="text-xs text-muted-foreground pt-1">
                AED {addGuestBooking.session.priceAed} per additional spot
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAddGuestBooking(null)}
            data-testid="button-add-guest-cancel"
          >
            Cancel
          </Button>
          <Button
            disabled={!addGuestName.trim() || addGuestMutation.isPending}
            onClick={() => {
              if (!addGuestBooking || !addGuestName.trim()) return;
              addGuestMutation.mutate({
                bookingId: addGuestBooking.id,
                guestName: addGuestName.trim(),
                guestEmail: addGuestEmail.trim(),
                paymentMethod: addGuestPaymentMethod,
              });
            }}
            data-testid="button-add-guest-submit"
          >
            {addGuestMutation.isPending
              ? 'Please wait...'
              : addGuestPaymentMethod === 'ziina'
                ? 'Pay & Add Guest'
                : 'Add Guest'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
