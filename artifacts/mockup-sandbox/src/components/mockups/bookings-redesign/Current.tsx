import './_group.css';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark,
  Timer, ListOrdered, Users, UserPlus, UserCheck,
} from 'lucide-react';

type BookingStatus = 'confirmed' | 'waitlisted' | 'pending_payment' | 'cancelled';

interface MockBooking {
  id: string;
  title: string;
  bookedOn: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  amountAed: number;
  spots: number;
  paymentMethod: 'cash' | 'card';
  cashPaid?: boolean;
  status: BookingStatus;
  isPast?: boolean;
  isGuestBooking?: boolean;
  bookedByName?: string;
  waitlistPosition?: number;
  paymentTimeRemaining?: string;
  guests?: { id: string; name: string; linked?: boolean }[];
  relativeLabel?: string;
}

const PENDING: MockBooking = {
  id: 'b-pp-1', title: 'Wednesday Smash Night', bookedOn: 'Apr 26, 2026',
  date: '2026-05-06', startTime: '19:00', endTime: '21:00',
  venue: 'Insportz Club, Al Quoz', amountAed: 35, spots: 1, paymentMethod: 'card',
  status: 'pending_payment', paymentTimeRemaining: '2h 14m 03s',
  relativeLabel: 'in 7 days',
};

const WAITLISTED: MockBooking = {
  id: 'b-wl-1', title: 'Friday Doubles League', bookedOn: 'Apr 24, 2026',
  date: '2026-05-08', startTime: '20:30', endTime: '22:30',
  venue: 'Shabab Al Ahli Hall', amountAed: 40, spots: 1, paymentMethod: 'card',
  status: 'waitlisted', waitlistPosition: 3,
  relativeLabel: 'in 9 days',
};

const CONFIRMED: MockBooking = {
  id: 'b-cf-1', title: 'Sunday Open Play (3 hrs)', bookedOn: 'Apr 18, 2026',
  date: '2026-05-03', startTime: '17:00', endTime: '20:00',
  venue: 'Dubai Sports World', amountAed: 90, spots: 2, paymentMethod: 'cash', cashPaid: false,
  status: 'confirmed',
  guests: [{ id: 'g1', name: 'Aarav Mehta', linked: true }],
  relativeLabel: 'in 4 days',
};

const PAST: MockBooking = {
  id: 'b-ps-1', title: 'Tuesday Casual Drop-in', bookedOn: 'Apr 12, 2026',
  date: '2026-04-21', startTime: '19:00', endTime: '21:00',
  venue: 'Nad Al Sheba Sports Complex', amountAed: 30, spots: 1, paymentMethod: 'card',
  status: 'cancelled', isPast: true,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function statusPill(status: BookingStatus) {
  switch (status) {
    case 'confirmed':       return <Badge>Confirmed</Badge>;
    case 'waitlisted':      return <Badge variant="outline">Waitlisted</Badge>;
    case 'pending_payment': return <Badge variant="outline">Payment Due</Badge>;
    case 'cancelled':       return <Badge variant="destructive">Cancelled</Badge>;
  }
}

function stripColor(b: MockBooking) {
  if (b.status === 'pending_payment') return 'bg-orange-500';
  if (b.status === 'waitlisted')      return 'bg-amber-500';
  if (b.status === 'confirmed')       return 'bg-secondary';
  if (b.status === 'cancelled')       return 'bg-muted-foreground/30';
  return 'bg-muted-foreground/20';
}

function BookingCard({ b }: { b: MockBooking }) {
  const isWaitlisted = b.status === 'waitlisted';
  const isPendingPayment = b.status === 'pending_payment';
  const canCancel = !b.isPast && (b.status === 'confirmed' || isWaitlisted || isPendingPayment);

  return (
    <Card className={`overflow-hidden ${b.isPast ? 'opacity-75' : ''}`}>
      <div className="flex">
        <div className={`w-1 shrink-0 ${stripColor(b)}`} />
        <CardContent className="p-5 flex-1">
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold truncate">{b.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {b.isGuestBooking && b.bookedByName
                  ? `Guest spot — booked by ${b.bookedByName}`
                  : `Booked ${b.bookedOn}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {isWaitlisted && b.waitlistPosition && (
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 gap-1">
                  <ListOrdered className="h-3 w-3" />#{b.waitlistPosition}
                </Badge>
              )}
              {statusPill(b.status)}
            </div>
          </div>

          {b.relativeLabel && !b.isPast && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-secondary mb-2">
              <Timer className="h-3.5 w-3.5 shrink-0" />
              {b.relativeLabel}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{formatDate(b.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{b.startTime} – {b.endTime}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{b.venue}</span>
            </div>
          </div>

          {b.guests && b.guests.length > 0 && (
            <div className="mb-3 p-3 rounded-md bg-muted/40 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                <Users className="h-3.5 w-3.5" />
                Guests ({b.guests.length})
              </div>
              {b.guests.map(g => (
                <div key={g.id} className="flex items-center gap-1.5 text-xs">
                  <UserCheck className={`h-3 w-3 ${g.linked ? 'text-secondary' : 'text-muted-foreground'}`} />
                  <span className="truncate">{g.name}</span>
                  {g.linked && (
                    <Badge variant="secondary" className="text-xs h-4 px-1">linked</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {b.status === 'confirmed' && !b.isPast && (
            <Button size="sm" variant="outline" className="gap-1.5 mt-2">
              <UserPlus className="h-3.5 w-3.5" />
              Add Guest
            </Button>
          )}

          {isPendingPayment && (
            <div className="mb-4 mt-2 flex items-start gap-3 rounded-md border p-3 bg-orange-50 border-orange-200">
              <Timer className="h-4 w-4 shrink-0 mt-0.5 text-orange-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-orange-700">
                  Payment required to secure your spot
                </p>
                <p className="text-xs mt-0.5 font-mono tabular-nums text-orange-600">
                  Time remaining: {b.paymentTimeRemaining}
                </p>
              </div>
              <Button size="sm" className="shrink-0">Pay Now</Button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-3 border-t flex-wrap">
            {!isWaitlisted && !isPendingPayment && (
              <span className="font-semibold">AED {b.amountAed}</span>
            )}
            {!isWaitlisted && !isPendingPayment && b.spots > 1 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Users className="h-3 w-3" />{b.spots} spots
              </Badge>
            )}
            {!isWaitlisted && !isPendingPayment && (
              <Badge variant="outline" className="text-xs">
                {b.paymentMethod === 'cash' ? (
                  <><Banknote className="h-3 w-3 mr-1" /> {b.cashPaid ? 'Cash Paid' : 'Pay at Venue'}</>
                ) : (
                  <><CreditCard className="h-3 w-3 mr-1" /> Card</>
                )}
              </Badge>
            )}
            {isWaitlisted && (
              <span className="text-xs text-muted-foreground">No payment until confirmed</span>
            )}
            {isPendingPayment && (
              <span className="text-xs text-muted-foreground">AED {b.amountAed} — payment required</span>
            )}
          </div>

          {canCancel && (
            <div className="mt-3 flex sm:justify-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto gap-1.5 border-destructive/50 text-destructive"
              >
                <XCircle className="h-4 w-4" />
                {isWaitlisted ? 'Leave Waitlist' : isPendingPayment ? 'Decline Spot' : 'Cancel'}
              </Button>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

export function Current() {
  return (
    <div className="bookings-redesign-root min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bookmark className="h-6 w-6 text-secondary" /> My Bookings
          </h1>
          <p className="text-muted-foreground mt-1">Manage your session bookings</p>
        </div>

        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Timer className="h-5 w-5 text-orange-500" />
                Payment Required
              </h2>
              <Badge variant="outline" className="text-xs border-orange-400/40 text-orange-600">1</Badge>
            </div>
            <div className="space-y-3">
              <BookingCard b={PENDING} />
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-amber-500" />
                Waitlisted
              </h2>
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600">1</Badge>
            </div>
            <div className="space-y-3">
              <BookingCard b={WAITLISTED} />
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">Upcoming</h2>
              <Badge variant="secondary" className="text-xs">1</Badge>
            </div>
            <div className="space-y-3">
              <BookingCard b={CONFIRMED} />
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">Past &amp; Cancelled</h2>
              <Badge variant="outline" className="text-xs">1</Badge>
            </div>
            <div className="space-y-3">
              <BookingCard b={PAST} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
