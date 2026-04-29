import React, { useState } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, MapPin, Clock, XCircle, Banknote, CreditCard, Bookmark,
  Timer, ListOrdered, Users, UserPlus, UserCheck, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import './_group.css';

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
  waitlistPosition?: number;
  paymentTimeRemaining?: string;
  guests?: { id: string; name: string; linked?: boolean }[];
  isPastSession?: boolean;
}

const MOCK_DATA: MockBooking[] = [
  {
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
  },
  {
    id: 'b-pp-1',
    title: 'Wednesday Smash Night',
    date: '2026-05-06',
    startTime: '19:00',
    endTime: '21:00',
    venue: 'Insportz Club, Al Quoz',
    amountAed: 35,
    spots: 1,
    paymentMethod: 'card',
    status: 'pending_payment',
    paymentTimeRemaining: '2h 14m',
  },
  {
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
  },
  {
    id: 'b-cf-2',
    title: 'Tuesday Smash & Skills',
    date: '2026-05-12',
    startTime: '20:00',
    endTime: '22:00',
    venue: 'Insportz Club, Al Quoz',
    amountAed: 40,
    spots: 1,
    paymentMethod: 'card',
    status: 'confirmed',
  },
  {
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
    isPastSession: true,
  },
];

const STATUS_PRIORITY = {
  pending_payment: 3,
  waitlisted: 2,
  confirmed: 1,
  cancelled: 0,
};

function getStatusColor(status: BookingStatus) {
  switch (status) {
    case 'pending_payment': return 'bg-orange-500';
    case 'waitlisted': return 'bg-amber-500';
    case 'confirmed': return 'bg-secondary';
    case 'cancelled': return 'bg-muted-foreground';
  }
}

function getStatusBorder(status: BookingStatus) {
  switch (status) {
    case 'pending_payment': return 'border-l-orange-500';
    case 'waitlisted': return 'border-l-amber-500';
    case 'confirmed': return 'border-l-transparent';
    case 'cancelled': return 'border-l-transparent';
  }
}

export function VariantA() {
  // Pre-expand the most urgent cancellable row so action affordances are visible
  // on first paint (calendar/agenda apps reveal the soonest item by default).
  const initialExpanded = MOCK_DATA
    .filter(b => !b.isPastSession && (b.status === 'pending_payment' || b.status === 'waitlisted' || b.status === 'confirmed'))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]?.id ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(initialExpanded);

  // Group bookings by date
  const upcomingBookings = MOCK_DATA.filter(b => !b.isPastSession).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const pastBookings = MOCK_DATA.filter(b => b.isPastSession).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const groupedBookings = upcomingBookings.reduce((acc, booking) => {
    if (!acc[booking.date]) {
      acc[booking.date] = [];
    }
    acc[booking.date].push(booking);
    return acc;
  }, {} as Record<string, MockBooking[]>);

  const pendingCount = MOCK_DATA.filter(b => b.status === 'pending_payment').length;

  return (
    <div className="bookings-redesign-root min-h-[100dvh] bg-background text-foreground pb-24">
      {/* Header */}
      <header className="px-4 pt-12 pb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 border-b border-border/40">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Bookings</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">Your upcoming itinerary</p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className="bg-orange-50/50 text-orange-600 border-orange-200 gap-1.5 px-2.5 py-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {pendingCount} action needed
            </Badge>
          )}
        </div>
      </header>

      <main className="px-4 mt-6 space-y-8">
        {/* Upcoming Groups */}
        {Object.entries(groupedBookings).map(([date, bookings]) => {
          // Determine highest priority status for the day dot
          const maxPriorityStatus = bookings.reduce((prev, curr) => {
            return STATUS_PRIORITY[curr.status] > STATUS_PRIORITY[prev] ? curr.status : prev;
          }, 'confirmed' as BookingStatus);

          return (
            <div key={date} className="relative">
              {/* Sticky Day Header */}
              <div className="sticky top-[89px] z-10 bg-background/95 backdrop-blur-sm py-2 mb-3 flex items-center justify-between border-b border-border/40">
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
                  {format(parseISO(date), 'EEE · MMM d')}
                </h2>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(maxPriorityStatus)}`} />
              </div>

              {/* Bookings List */}
              <div className="space-y-3">
                {bookings.map(booking => {
                  const isExpanded = expandedId === booking.id;
                  
                  return (
                    <Card 
                      key={booking.id} 
                      className={`overflow-hidden transition-all duration-200 border-l-[3px] ${getStatusBorder(booking.status)} ${isExpanded ? 'shadow-md border-border' : 'shadow-none border-border/60 hover:border-border cursor-pointer'}`}
                      onClick={() => !isExpanded && setExpandedId(booking.id)}
                    >
                      {/* Compact Row */}
                      <div className="p-4 flex gap-4">
                        {/* Time Column */}
                        <div className="w-14 shrink-0 flex flex-col pt-0.5">
                          <span className="text-sm font-semibold leading-none">{booking.startTime}</span>
                          <span className="text-xs text-muted-foreground mt-1">{booking.endTime}</span>
                        </div>
                        
                        {/* Details Column */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-[15px] leading-tight truncate text-card-foreground">
                              {booking.title}
                            </h3>
                            {booking.status === 'pending_payment' && (
                              <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider bg-orange-50 border-orange-200 text-orange-600 h-5 px-1.5 font-bold">
                                Pay
                              </Badge>
                            )}
                            {booking.status === 'waitlisted' && (
                              <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider border-amber-200 text-amber-600 h-5 px-1.5 font-bold">
                                Wait
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground mt-1.5 gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{booking.venue}</span>
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <div className="shrink-0 pt-1">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setExpandedId(null); }} />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden bg-muted/20"
                          >
                            <div className="p-4 pt-0 border-t border-border/40 mt-1">
                              
                              {/* Guests Section */}
                              {booking.guests && booking.guests.length > 0 && (
                                <div className="mt-4 mb-4">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                    <Users className="w-3.5 h-3.5" /> Guests ({booking.guests.length})
                                  </div>
                                  <div className="space-y-2 pl-5">
                                    {booking.guests.map(g => (
                                      <div key={g.id} className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{g.name}</span>
                                        {g.linked && <Badge variant="secondary" className="text-[10px] h-4 font-medium px-1.5">Linked</Badge>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Pending Payment Alert */}
                              {booking.status === 'pending_payment' && (
                                <div className="mt-4 bg-orange-50/50 border border-orange-100 rounded-lg p-3 flex flex-col gap-3">
                                  <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
                                    <Timer className="w-4 h-4 text-orange-500" />
                                    Spot reserved for {booking.paymentTimeRemaining}
                                  </div>
                                  <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white border-transparent">
                                    Pay AED {booking.amountAed} Now
                                  </Button>
                                </div>
                              )}

                              {/* Waitlist info */}
                              {booking.status === 'waitlisted' && (
                                <div className="mt-4 bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                                    <ListOrdered className="w-4 h-4 text-amber-500" />
                                    Position #{booking.waitlistPosition} in queue
                                  </div>
                                  <p className="text-xs text-amber-600/80 mt-1 pl-6">You'll be notified if a spot opens up. No payment required yet.</p>
                                </div>
                              )}

                              {/* Confirmed Metadata */}
                              {booking.status === 'confirmed' && (
                                <div className="mt-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                                  <div>
                                    <span className="text-xs text-muted-foreground block mb-0.5">Amount</span>
                                    <span className="font-medium">AED {booking.amountAed}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs text-muted-foreground block mb-0.5">Payment</span>
                                    <span className="font-medium flex items-center gap-1.5">
                                      {booking.paymentMethod === 'cash' ? <Banknote className="w-3.5 h-3.5 text-muted-foreground" /> : <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
                                      {booking.paymentMethod === 'cash' ? 'At Venue' : 'Card Paid'}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Actions Row */}
                              <div className="mt-5 pt-4 flex items-center justify-between border-t border-border/40">
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive px-2 -ml-2 h-8 text-xs font-semibold">
                                  {booking.status === 'waitlisted' ? 'Leave Waitlist' : booking.status === 'pending_payment' ? 'Decline Spot' : 'Cancel Spot'}
                                </Button>
                                
                                {booking.status === 'confirmed' && (
                                  <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5">
                                    <UserPlus className="w-3.5 h-3.5" /> Add Guest
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Past Bookings */}
        {pastBookings.length > 0 && (
          <div className="pt-6">
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2 mb-4">
              Earlier
            </h2>
            <div className="space-y-3 opacity-60 grayscale-[0.3]">
              {pastBookings.map(booking => (
                <Card key={booking.id} className="p-4 flex gap-4 shadow-none border-border/40">
                  <div className="w-14 shrink-0 flex flex-col pt-0.5">
                    <span className="text-sm font-medium leading-none text-muted-foreground">{booking.startTime}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[14px] font-medium truncate text-muted-foreground">{booking.title}</h3>
                      {booking.status === 'cancelled' && (
                        <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider border-destructive/30 text-destructive h-5 px-1.5 font-bold">
                          Cancelled
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70">
                      {format(parseISO(booking.date), 'MMM d')} • {booking.venue}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
