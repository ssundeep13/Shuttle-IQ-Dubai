import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'wouter';
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
import { sessionStartEpochMs } from '@shared/sessionTime';
import { openCheckoutRedirect, nativeReturnFields, nativeReturnBody } from '@/lib/nativeAuth';
import { Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark, AlertTriangle, ArrowRight, ListOrdered, Users, Timer, UserCheck, Pencil, Check, X, UserPlus, Wallet } from 'lucide-react';
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
import { useReducedMotion } from 'framer-motion';
import type { BookingWithDetails, BookingGuest } from '@shared/schema';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

const WIN_GREEN = '#1F8A5B';
const LOSS_RED = '#B23A2E';
const AMBER = '#C97B17';

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  confirmed: { variant: 'default', label: 'Confirmed' },
  attended: { variant: 'secondary', label: 'Attended' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
  pending: { variant: 'outline', label: 'Pending' },
  waitlisted: { variant: 'outline', label: 'Waitlisted' },
  pending_payment: { variant: 'outline', label: 'Payment Due' },
};

// Brand tone per status — used for the status badge + left strip.
const statusTone: Record<string, { strip: string; badgeBg: string; badgeFg: string }> = {
  confirmed: { strip: MKT.teal, badgeBg: MKT.tealMist, badgeFg: MKT.tealD },
  attended: { strip: WIN_GREEN, badgeBg: '#DDEEE2', badgeFg: '#1A6A45' },
  cancelled: { strip: 'rgba(0,30,70,0.25)', badgeBg: '#F1D7D2', badgeFg: '#8E2C22' },
  pending: { strip: 'rgba(0,30,70,0.2)', badgeBg: 'rgba(0,30,70,0.06)', badgeFg: MKT.inkSub },
  waitlisted: { strip: AMBER, badgeBg: '#F6E6CC', badgeFg: '#7A4A0E' },
  pending_payment: { strip: AMBER, badgeBg: '#F6E6CC', badgeFg: '#7A4A0E' },
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
  // Same shared, timezone-explicit (Asia/Dubai) helper the server uses, so the
  // forfeit warning shown here matches server enforcement exactly (fixes P0-3).
  const cutoffMs = sessionStartEpochMs(sessionDate, startTime) - 5 * 60 * 60 * 1000;
  return Date.now() >= cutoffMs;
}

// ── Shared styled primitives (look only) ─────────────────────────────────────
const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${MKT.navy}12` };
function navyBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
function ghostBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}33`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
function pill(bg: string, fg: string): CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' };
}

function GuestList({ booking, canManage, onCancelGuest, onEditGuest, isEditPending }: {
  booking: BookingWithDetails;
  canManage: boolean;
  onCancelGuest: (guestId: string, refundPreference?: 'wallet' | 'bank') => void;
  onEditGuest: (guestId: string, name: string, email: string) => void;
  isEditPending: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

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
    <div className="mb-3 p-3 rounded-xl space-y-1.5" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}10` }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: 12, fontWeight: 600, color: MKT.inkSub }}>
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
                <Check className="h-3.5 w-3.5" style={{ color: MKT.teal }} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-guest-${guest.id}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0" style={{ fontSize: 12 }}>
                <UserCheck className="h-3 w-3 shrink-0" style={{ color: guest.linkedUserId ? MKT.teal : MKT.inkMute }} />
                <span className="truncate" style={{ color: MKT.ink }}>{guest.name}</span>
                {guest.linkedUserId && (
                  <span style={{ ...pill(MKT.tealMist, MKT.tealD), fontSize: 10, padding: '1px 6px' }} data-testid={`badge-guest-linked-${guest.id}`}>
                    linked
                  </span>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEdit(guest)} data-testid={`button-edit-guest-${guest.id}`}>
                    <Pencil className="h-3 w-3" style={{ color: MKT.inkSub }} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-5 w-5" data-testid={`button-cancel-guest-${guest.id}`}>
                        <XCircle className="h-3.5 w-3.5" style={{ color: MKT.inkSub }} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      {booking.paymentMethod === 'ziina' && booking.ziinaPaymentIntentId && booking.amountAed > 0 ? (
                        <>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Guest Spot?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove <strong>{guest.name}</strong>'s spot from the booking and cannot be undone. Choose how you'd like the spot's refund.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid={`button-keep-guest-${guest.id}`}>Keep Spot</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onCancelGuest(guest.id, 'wallet')} data-testid={`button-cancel-guest-wallet-${guest.id}`}>
                              Refund to wallet
                            </AlertDialogAction>
                            <AlertDialogAction onClick={() => onCancelGuest(guest.id, 'bank')} data-testid={`button-cancel-guest-bank-${guest.id}`}>
                              Refund to bank
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
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
  const reduce = useReducedMotion();

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: walletData } = useQuery<{ walletBalance: number }>({
    queryKey: ['/api/marketplace/me/wallet'],
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ bookingId, refundMethod }: { bookingId: string; refundMethod?: 'wallet' | 'ziina' }) => {
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/cancel`, refundMethod ? { refundMethod } : {});
    },
    onSuccess: (data: any) => {
      if (data?.lateFeeApplied) {
        toast({
          title: 'Booking cancelled — fee applied',
          description: 'You cancelled within 5 hours of the session. Your full payment has been retained.',
          variant: 'destructive',
        });
      } else if (data?.refundMethod === 'wallet') {
        toast({ title: 'Booking cancelled', description: `AED ${data.walletRefundAmount} added to your ShuttleIQ wallet.` });
      } else if (data?.refundMethod === 'ziina') {
        toast({ title: 'Booking cancelled', description: `Your refund of AED ${data.refundAmount} will be returned to your bank within 2-3 business days.` });
      } else {
        toast({ title: 'Booking cancelled' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/wallet'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to cancel', description: error.message, variant: 'destructive' });
    },
  });

  const cancelGuestMutation = useMutation({
    mutationFn: async ({ bookingId, guestId, refundPreference }: { bookingId: string; guestId: string; refundPreference?: 'wallet' | 'bank' }) => {
      return apiRequest('DELETE', `/api/marketplace/bookings/${bookingId}/guests/${guestId}`, refundPreference ? { refundPreference } : undefined);
    },
    onSuccess: (data: any) => {
      if (data?.walletCredited && data?.refundAmountAed) {
        toast({ title: 'Guest spot cancelled', description: `AED ${Number(data.refundAmountAed).toFixed(2)} added to your ShuttleIQ wallet.` });
      } else if (data?.refundFlaggedForAdmin && data?.refundAmountAed) {
        toast({ title: 'Guest spot cancelled', description: `Your refund of AED ${Number(data.refundAmountAed).toFixed(2)} will be returned to your bank within 2-3 business days.` });
      } else {
        toast({ title: 'Guest spot cancelled' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/wallet'] });
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
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/initiate-payment`, nativeReturnBody());
    },
    onSuccess: (data) => {
      if (data?.redirectUrl) {
        void openCheckoutRedirect(data.redirectUrl);
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to start payment', description: error.message, variant: 'destructive' });
    },
  });

  const [addGuestBooking, setAddGuestBooking] = useState<BookingWithDetails | null>(null);
  const [addGuestName, setAddGuestName] = useState('');
  const [addGuestEmail, setAddGuestEmail] = useState('');
  // Player-facing cash option removed — add-guest is card-only now. The 'cash'
  // union member and the server cash path are retained for admin/SaaS use.
  const [addGuestPaymentMethod, setAddGuestPaymentMethod] = useState<'cash' | 'ziina'>('ziina');

  const addGuestMutation = useMutation({
    mutationFn: async ({ bookingId, guestName, guestEmail, paymentMethod }: {
      bookingId: string; guestName: string; guestEmail: string; paymentMethod: 'cash' | 'ziina';
    }) => {
      return apiRequest<{ success?: boolean; redirectUrl?: string }>(
        'POST',
        `/api/marketplace/bookings/${bookingId}/add-guest`,
        { guestName, guestEmail: guestEmail || null, paymentMethod, ...nativeReturnFields() }
      );
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        void openCheckoutRedirect(data.redirectUrl);
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
    const tone = statusTone[booking.status] || { strip: 'rgba(0,30,70,0.2)', badgeBg: 'rgba(0,30,70,0.06)', badgeFg: MKT.inkSub };
    const isWaitlisted = booking.status === 'waitlisted';
    const isPendingPayment = booking.status === 'pending_payment';
    const countdown = usePaymentCountdown(isPendingPayment ? booking.promotedAt : null);
    const isLinkedGuest = booking.isGuestBooking && !!booking.myGuestId;
    const canCancel = !booking.isGuestBooking && (booking.status === 'confirmed' || booking.status === 'waitlisted' || booking.status === 'pending_payment') && sessionEndTime(booking) >= new Date();
    const canCancelAsGuest = isLinkedGuest && booking.status !== 'cancelled' && sessionEndTime(booking) >= new Date();
    const lateFee = !isWaitlisted && !isPendingPayment && canCancel && isWithin5Hours(booking.session.date, booking.session.startTime);
    // Cash refund choice: only confirmed Ziina bookings outside the late window
    // with card-captured cash to return. Forces a conscious wallet-vs-bank choice.
    const cashRefundFils = booking.amountAed * 100 - (booking.walletAmountUsed ?? 0);
    const showRefundChoice = canCancel && !isWaitlisted && !isPendingPayment && !lateFee
      && booking.status === 'confirmed' && booking.paymentMethod === 'ziina' && cashRefundFils > 0;
    const cashRefundAed = cashRefundFils / 100;
    const [refundChoice, setRefundChoice] = useState<'wallet' | 'ziina' | null>(null);

    return (
      <div style={{ ...cardStyle, overflow: 'hidden', opacity: isPast ? 0.75 : 1 }} data-testid={`card-booking-${booking.id}`}>
        <div className="flex">
          <div style={{ width: 4, flex: 'none', background: tone.strip }} />
          <div style={{ padding: 20, flex: 1, minWidth: 0 }}>
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid={`text-booking-title-${booking.id}`}>
                  {booking.session.title}
                </h3>
                <p style={{ fontSize: 12, color: MKT.inkSub, marginTop: 2 }}>
                  {booking.isGuestBooking && booking.bookedByName
                    ? `Guest spot — booked by ${booking.bookedByName}`
                    : `Booked ${format(new Date(booking.createdAt || Date.now()), 'MMM d, yyyy')}`
                  }
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isWaitlisted && booking.waitlistPosition && (
                  <span style={pill('#F6E6CC', '#7A4A0E')} data-testid={`badge-waitlist-position-${booking.id}`}>
                    <ListOrdered className="h-3 w-3" />
                    #{booking.waitlistPosition}
                  </span>
                )}
                <span style={pill(tone.badgeBg, tone.badgeFg)} data-testid={`badge-status-${booking.id}`}>
                  {status.label}
                </span>
              </div>
            </div>

            {(() => {
              const relTime = !isPast
                ? getRelativeTimeLabel(booking.session.date as unknown as string, booking.session.startTime)
                : '';
              return relTime ? (
                <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 14, fontWeight: 600, color: MKT.tealD }} data-testid={`text-booking-relative-${booking.id}`}>
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  {relTime}
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4" style={{ fontSize: 14, color: MKT.inkSub }}>
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
                onCancelGuest={(guestId, refundPreference) => cancelGuestMutation.mutate({ bookingId: booking.id, guestId, refundPreference })}
                onEditGuest={(guestId, name, email) => editGuestMutation.mutate({ bookingId: booking.id, guestId, name, email })}
                isEditPending={editGuestMutation.isPending}
              />
            )}
            {!booking.isGuestBooking && booking.status === 'confirmed' && !isPast && (
              <button
                type="button"
                className="mt-2"
                onClick={() => {
                  setAddGuestBooking(booking);
                  setAddGuestName('');
                  setAddGuestEmail('');
                  setAddGuestPaymentMethod('ziina');
                }}
                data-testid={`button-add-guest-${booking.id}`}
                style={ghostBtn('sm')}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Guest
              </button>
            )}

            {/* Pending payment banner */}
            {isPendingPayment && (
              <div
                className="mb-4 mt-3 flex items-start gap-3 rounded-xl p-3"
                style={countdown.expired
                  ? { background: MKT.cream, border: `1px solid ${MKT.navy}12` }
                  : { background: '#F6E6CC55', border: `1px solid ${AMBER}33` }}
                data-testid={`banner-payment-due-${booking.id}`}
              >
                <Timer className="h-4 w-4 shrink-0 mt-0.5" style={{ color: countdown.expired ? MKT.inkSub : AMBER }} />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 600, color: countdown.expired ? MKT.inkSub : '#7A4A0E' }}>
                    {countdown.expired ? 'Payment window expired — spot will be released shortly' : 'Payment required to secure your spot'}
                  </p>
                  <p style={{ fontFamily: FF_MONO, fontSize: 12, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: countdown.expired ? MKT.inkSub : AMBER }}>
                    {countdown.expired ? 'Expired' : `Time remaining: ${countdown.label}`}
                  </p>
                </div>
                {!countdown.expired && (
                  <button
                    type="button"
                    onClick={() => initiatePaymentMutation.mutate(booking.id)}
                    disabled={initiatePaymentMutation.isPending}
                    data-testid={`button-complete-payment-${booking.id}`}
                    style={{ ...navyBtn('sm'), flex: 'none' }}
                  >
                    {initiatePaymentMutation.isPending ? 'Loading...' : 'Pay Now'}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 flex-wrap" style={{ borderTop: `1px solid ${MKT.line}` }}>
              <div className="flex items-center gap-3 flex-wrap">
                {!isWaitlisted && !isPendingPayment && (
                  <span style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.01em' }} data-testid={`text-booking-amount-${booking.id}`}>
                    AED {booking.totalPaidAed ?? booking.amountAed}
                  </span>
                )}
                {!isWaitlisted && !isPendingPayment && booking.spotsBooked > 1 && (
                  <span style={pill('rgba(0,30,70,0.06)', MKT.inkSub)}>
                    <Users className="h-3 w-3" />
                    {booking.spotsBooked} spots
                  </span>
                )}
                {!isWaitlisted && !isPendingPayment && (
                  <span style={pill('rgba(0,30,70,0.06)', MKT.inkSub)} data-testid={`badge-method-${booking.id}`}>
                    {booking.paymentMethod === 'cash' ? (
                      <><Banknote className="h-3 w-3" /> {booking.cashPaid ? 'Cash Paid' : 'Pay at Venue'}</>
                    ) : (
                      <><CreditCard className="h-3 w-3" /> Ziina</>
                    )}
                  </span>
                )}
                {isWaitlisted && (
                  <span style={{ fontSize: 12, color: MKT.inkSub }}>No payment until confirmed</span>
                )}
                {isPendingPayment && (
                  <span style={{ fontSize: 12, color: MKT.inkSub }}>AED {booking.amountAed} — payment required</span>
                )}
              </div>
              {canCancelAsGuest && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={cancelGuestMutation.isPending}
                      data-testid={`button-cancel-guest-spot-${booking.id}`}
                      style={{ ...ghostBtn('sm'), opacity: cancelGuestMutation.isPending ? 0.6 : 1 }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel My Spot
                    </button>
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
                    <button
                      type="button"
                      disabled={cancelMutation.isPending}
                      data-testid={`button-cancel-${booking.id}`}
                      style={{ ...ghostBtn('sm'), opacity: cancelMutation.isPending ? 0.6 : 1 }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : 'Cancel'}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" style={{ color: LOSS_RED }} />
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
                            <div className="flex gap-2 p-3 rounded-md" style={{ background: '#F1D7D2', border: `1px solid ${LOSS_RED}33` }}>
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: LOSS_RED }} />
                              <p style={{ fontSize: 14, color: '#8E2C22', fontWeight: 600 }}>
                                This cancellation is within 5 hours of the session start. Your full payment of AED {booking.amountAed} will be retained. This cannot be undone.
                              </p>
                            </div>
                          )}
                          {showRefundChoice && (
                            <div className="space-y-2 p-3 rounded-md" style={{ background: 'rgba(0,30,70,0.04)', border: '1px solid rgba(0,30,70,0.10)' }}>
                              <p style={{ fontSize: 14, fontWeight: 600, color: MKT.navy }}>
                                AED {cashRefundAed.toLocaleString('en-US', { maximumFractionDigits: 2 })} refund — how would you like it?
                              </p>
                              <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 14 }}>
                                <input type="radio" name={`refund-${booking.id}`} checked={refundChoice === 'wallet'} onChange={() => setRefundChoice('wallet')} data-testid={`radio-refund-wallet-${booking.id}`} />
                                <span>Add to my ShuttleIQ wallet — instant</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 14 }}>
                                <input type="radio" name={`refund-${booking.id}`} checked={refundChoice === 'ziina'} onChange={() => setRefundChoice('ziina')} data-testid={`radio-refund-ziina-${booking.id}`} />
                                <span>Refund to my bank account — takes 2-3 business days</span>
                              </label>
                            </div>
                          )}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{isWaitlisted ? 'Stay on Waitlist' : isPendingPayment ? 'Keep Spot' : 'Keep Booking'}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate({ bookingId: booking.id, refundMethod: showRefundChoice ? refundChoice ?? undefined : undefined })}
                        disabled={showRefundChoice && !refundChoice}
                        className="bg-destructive text-destructive-foreground"
                      >
                        {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : lateFee ? 'Cancel & Forfeit Payment' : 'Yes, Cancel'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const sectionHeader = (title: string, count: number, icon: ReactNode, testid: string, countTone: CSSProperties) => (
    <div className="flex items-center gap-2 mb-4">
      <h2 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }} data-testid={testid}>
        {icon}
        {title}
      </h2>
      <span style={countTone}>{count}</span>
    </div>
  );

  return (
    <>
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      <div className="max-w-3xl mx-auto" style={{ padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px) clamp(48px, 6vw, 64px)' }}>
        <Reveal>
          <div style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10 }} data-testid="text-page-title">
                <Bookmark className="h-7 w-7" style={{ color: MKT.teal }} /> My Bookings
              </h1>
              <p style={{ color: MKT.inkSub, fontSize: 14, marginTop: 4 }}>Manage your session bookings</p>
            </div>
            {walletData !== undefined && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12,
                  ...(walletData.walletBalance > 0
                    ? { background: MKT.tealMist, border: `1px solid ${MKT.teal}33`, color: MKT.tealD }
                    : { background: `${MKT.navy}06`, border: `1px solid ${MKT.navy}14`, color: MKT.inkSub }),
                }}
                data-testid="card-wallet-balance"
              >
                <Wallet className="h-4 w-4 shrink-0" />
                <div>
                  <p style={{ fontSize: 11, lineHeight: 1, marginBottom: 3, opacity: 0.7 }}>Wallet credit</p>
                  <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }} data-testid="text-wallet-balance">
                    AED {(walletData.walletBalance / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Reveal>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-[14px]" />)}
          </div>
        ) : bookings?.length === 0 ? (
          <Reveal>
            <div style={{ ...cardStyle, padding: 32, textAlign: 'center' }}>
              <Calendar className="h-12 w-12 mx-auto mb-3" style={{ color: MKT.inkMute }} />
              <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, marginBottom: 6 }}>No bookings yet</h3>
              <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 20 }}>Browse sessions and book your first game.</p>
              <Link href="/marketplace/book" style={{ ...navyBtn('md'), textDecoration: 'none' }} data-testid="button-browse-sessions">
                Browse Sessions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="space-y-8">
            {pendingPayment.length > 0 && (
              <div>
                <Reveal>{sectionHeader('Payment Required', pendingPayment.length, <Timer className="h-5 w-5" style={{ color: AMBER }} />, 'text-pending-payment-title', pill('#F6E6CC', '#7A4A0E'))}</Reveal>
                <div className="space-y-3">
                  {pendingPayment.map((b, i) => (
                    <Reveal key={b.id} delay={reduce ? 0 : Math.min(i * 0.05, 0.3)}><BookingCard booking={b} /></Reveal>
                  ))}
                </div>
              </div>
            )}
            {waitlisted.length > 0 && (
              <div>
                <Reveal>{sectionHeader('Waitlisted', waitlisted.length, <ListOrdered className="h-5 w-5" style={{ color: AMBER }} />, 'text-waitlist-title', pill('#F6E6CC', '#7A4A0E'))}</Reveal>
                <div className="space-y-3">
                  {waitlisted.map((b, i) => (
                    <Reveal key={b.id} delay={reduce ? 0 : Math.min(i * 0.05, 0.3)}><BookingCard booking={b} /></Reveal>
                  ))}
                </div>
              </div>
            )}
            {active.length > 0 && (
              <div>
                <Reveal>{sectionHeader('Upcoming', active.length, <span style={{ width: 0 }} />, 'text-upcoming-title', pill(MKT.tealMist, MKT.tealD))}</Reveal>
                <div className="space-y-3">
                  {active.map((b, i) => (
                    <Reveal key={b.id} delay={reduce ? 0 : Math.min(i * 0.05, 0.3)}><BookingCard booking={b} /></Reveal>
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <Reveal>{sectionHeader('Past & Cancelled', past.length, <span style={{ width: 0 }} />, 'text-past-title', pill('rgba(0,30,70,0.06)', MKT.inkSub))}</Reveal>
                <div className="space-y-3">
                  {past.map((b, i) => (
                    <Reveal key={b.id} delay={reduce ? 0 : Math.min(i * 0.05, 0.3)}><BookingCard booking={b} isPast /></Reveal>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
            {/* Player-facing "Pay at Venue" (cash) option removed; card-only.
                The cash path is retained server-side for admin/SaaS use. */}
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setAddGuestPaymentMethod('ziina')}
                className="flex flex-col items-center gap-1.5 rounded-md border p-3 text-sm transition-colors"
                style={addGuestPaymentMethod === 'ziina'
                  ? { borderColor: MKT.teal, background: MKT.tealMist, color: MKT.tealD, fontWeight: 600 }
                  : { borderColor: `${MKT.navy}1F`, background: '#fff', color: MKT.inkSub }}
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
          <button
            type="button"
            onClick={() => setAddGuestBooking(null)}
            data-testid="button-add-guest-cancel"
            style={ghostBtn('md')}
          >
            Cancel
          </button>
          <button
            type="button"
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
            style={{ ...navyBtn('md'), opacity: (!addGuestName.trim() || addGuestMutation.isPending) ? 0.6 : 1 }}
          >
            {addGuestMutation.isPending
              ? 'Please wait...'
              : addGuestPaymentMethod === 'ziina'
                ? 'Pay & Add Guest'
                : 'Add Guest'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
