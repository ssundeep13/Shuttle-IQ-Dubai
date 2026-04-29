import React, { useState } from 'react';
import './_group.css';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  MapPin,
  Clock,
  XCircle,
  Banknote,
  CreditCard,
  Timer,
  ListOrdered,
  Users,
  UserPlus,
  ChevronRight,
  AlertCircle,
  Inbox,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react';

type BookingStatus = 'confirmed' | 'waitlisted' | 'pending_payment' | 'cancelled';

interface MockBooking {
  id: string;
  title: string;
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
  actionRequired?: boolean;
}

const PENDING: MockBooking = {
  id: 'b-pp-1',
  title: 'Wednesday Smash Night',
  date: '2026-05-06',
  startTime: '19:00',
  endTime: '21:00',
  venue: 'Insportz Club Al Quoz',
  amountAed: 35,
  spots: 1,
  paymentMethod: 'card',
  status: 'pending_payment',
  paymentTimeRemaining: '2h 14m',
  relativeLabel: 'in 7 days',
  actionRequired: true,
};

const WAITLISTED: MockBooking = {
  id: 'b-wl-1',
  title: 'Friday Doubles League',
  date: '2026-05-08',
  startTime: '20:30',
  endTime: '22:30',
  venue: 'Shabab Al Ahli Hall',
  amountAed: 40,
  spots: 1,
  paymentMethod: 'card',
  status: 'waitlisted',
  waitlistPosition: 3,
  relativeLabel: 'in 9 days',
  actionRequired: true,
};

const CONFIRMED_1: MockBooking = {
  id: 'b-cf-1',
  title: 'Sunday Open Play (3 hrs)',
  date: '2026-05-03',
  startTime: '17:00',
  endTime: '20:00',
  venue: 'Dubai Sports World',
  amountAed: 90,
  spots: 2,
  paymentMethod: 'cash',
  cashPaid: false,
  status: 'confirmed',
  guests: [{ id: 'g1', name: 'Aarav Mehta', linked: true }],
  relativeLabel: 'in 4 days',
};

const CONFIRMED_2: MockBooking = {
  id: 'b-cf-2',
  title: 'Tuesday Smash & Skills',
  date: '2026-05-12',
  startTime: '20:00',
  endTime: '22:00',
  venue: 'Insportz Club Al Quoz',
  amountAed: 40,
  spots: 1,
  paymentMethod: 'card',
  status: 'confirmed',
};

const PAST: MockBooking = {
  id: 'b-ps-1',
  title: 'Tuesday Casual Drop-in',
  date: '2026-04-21',
  startTime: '19:00',
  endTime: '21:00',
  venue: 'Nad Al Sheba Sports Complex',
  amountAed: 30,
  spots: 1,
  paymentMethod: 'card',
  status: 'cancelled',
  isPast: true,
};

const NEEDS_YOU = [PENDING, WAITLISTED];
const SCHEDULE_UPCOMING = [CONFIRMED_1, CONFIRMED_2];
const SCHEDULE_PAST = [PAST];

function formatMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { day: '2-digit' });
}

function formatDateFull(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function NeedsYouCard({ b }: { b: MockBooking }) {
  const isWaitlisted = b.status === 'waitlisted';
  const isPendingPayment = b.status === 'pending_payment';

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 mb-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isPendingPayment && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                Payment Required
              </Badge>
            )}
            {isWaitlisted && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                Waitlisted #{b.waitlistPosition}
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-[15px] leading-snug">{b.title}</h3>
        </div>
        {isPendingPayment && (
          <div className="text-right shrink-0">
            <div className="text-xs font-medium text-orange-600 flex items-center justify-end gap-1">
              <Timer className="w-3.5 h-3.5" />
              {b.paymentTimeRemaining}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Expires soon</div>
          </div>
        )}
      </div>

      <div className="space-y-1.5 mb-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0" />
          <span>{formatDateFull(b.date)} • {b.startTime} - {b.endTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{b.venue}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t">
        {isPendingPayment && (
          <>
            <Button size="sm" className="flex-1">Pay AED {b.amountAed}</Button>
            <Button size="sm" variant="outline" className="flex-1 text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/20">Decline Spot</Button>
          </>
        )}
        {isWaitlisted && (
          <Button size="sm" variant="outline" className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/20">
            Leave Waitlist
          </Button>
        )}
      </div>
    </div>
  );
}

function ScheduleItem({ b }: { b: MockBooking }) {
  const isPast = b.isPast;
  const isConfirmed = b.status === 'confirmed';

  return (
    <div className={`group flex items-start gap-4 py-4 border-b last:border-0 ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex flex-col items-center justify-center shrink-0 w-12 pt-1">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{formatMonth(b.date)}</span>
        <span className="text-xl font-light tabular-nums leading-none mt-0.5">{formatDay(b.date)}</span>
      </div>
      
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className="font-medium text-[15px] truncate">{b.title}</h4>
          {!isPast && <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
        
        <div className="text-sm text-muted-foreground space-y-0.5 mb-2">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{b.startTime} - {b.endTime}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{b.venue}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          {!isPast && b.amountAed && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100 text-slate-700 hover:bg-slate-100">
              AED {b.amountAed}
            </Badge>
          )}
          {!isPast && b.paymentMethod && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100 text-slate-700 hover:bg-slate-100">
              {b.paymentMethod === 'cash' ? 'Cash' : 'Card'}
            </Badge>
          )}
          {b.guests && b.guests.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100 text-slate-700 hover:bg-slate-100 gap-1">
              <Users className="w-3 h-3" />
              +{b.guests.length} Guest
            </Badge>
          )}
        </div>

        {isPast && b.status === 'cancelled' && (
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-destructive">
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancelled</span>
          </div>
        )}

        {isConfirmed && !isPast && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Add Guest
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5">
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function VariantC() {
  const [scheduleTab, setScheduleTab] = useState<'upcoming' | 'past'>('upcoming');
  const actionCount = NEEDS_YOU.length;

  return (
    <div className="bookings-redesign-root min-h-screen bg-background text-foreground pb-12">
      {/* Header */}
      <div className="bg-white px-4 py-6 border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-primary">My Bookings</h1>
            {actionCount > 0 ? (
              <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600 gap-1.5 pl-1.5 pr-2.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {actionCount} action{actionCount > 1 ? 's' : ''} needed
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All caught up
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        {/* Needs You Zone */}
        {actionCount > 0 && (
          <div className="px-4 py-6 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Inbox className="w-5 h-5 text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-800 tracking-tight">Needs You</h2>
            </div>
            
            <div className="space-y-3">
              {NEEDS_YOU.map(booking => (
                <NeedsYouCard key={booking.id} b={booking} />
              ))}
            </div>
          </div>
        )}

        {/* Schedule Zone */}
        <div className="px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-primary tracking-tight">Your Schedule</h2>
            </div>
            
            <Tabs value={scheduleTab} onValueChange={(v) => setScheduleTab(v as any)} className="w-[160px]">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
                <TabsTrigger value="past" className="text-xs">Past</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-2 sm:p-4">
            {scheduleTab === 'upcoming' ? (
              <div className="divide-y">
                {SCHEDULE_UPCOMING.map(booking => (
                  <ScheduleItem key={booking.id} b={booking} />
                ))}
                {SCHEDULE_UPCOMING.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No upcoming sessions.
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {SCHEDULE_PAST.map(booking => (
                  <ScheduleItem key={booking.id} b={booking} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
