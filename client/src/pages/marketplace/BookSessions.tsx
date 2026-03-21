import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Calendar, MapPin, Clock, Users, CheckCircle, ArrowRight, Building2,
  ChevronLeft, ChevronRight, Search, SlidersHorizontal, List, LayoutGrid,
} from 'lucide-react';
import { format } from 'date-fns';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { motion } from 'framer-motion';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

function isoDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

interface SpotsBadgeProps {
  session: BookableSessionWithAvailability;
  isBooked: boolean;
}

function SpotsBadge({ session, isBooked }: SpotsBadgeProps) {
  if (isBooked) {
    return (
      <Badge className="bg-green-600 dark:bg-green-700 shrink-0" data-testid={`badge-booked-${session.id}`}>
        <CheckCircle className="h-3 w-3 mr-1" />Booked
      </Badge>
    );
  }
  if (session.spotsRemaining <= 0) {
    return <Badge variant="destructive" data-testid={`badge-spots-${session.id}`}>Full</Badge>;
  }
  if (session.spotsRemaining <= 3) {
    return (
      <Badge
        variant="secondary"
        className="bg-orange-500/10 text-orange-600 border-orange-500/20 shrink-0"
        data-testid={`badge-spots-${session.id}`}
      >
        {session.spotsRemaining} left
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0" data-testid={`badge-spots-${session.id}`}>
      {session.spotsRemaining} spots
    </Badge>
  );
}

interface SessionCardProps {
  session: BookableSessionWithAvailability;
  isBooked: boolean;
}

function ListCard({ session, isBooked }: SessionCardProps) {
  const iso = isoDate(session.date as unknown as string);
  const d = new Date(iso + 'T00:00:00');
  const dayAbbr = format(d, 'EEE');
  const dateNum = format(d, 'd');
  const monthAbbr = format(d, 'MMM');
  const capacityPercent = session.capacity > 0
    ? Math.round((session.totalBookings / session.capacity) * 100)
    : 0;

  return (
    <div
      className="flex rounded-md border bg-card overflow-hidden"
      data-testid={`card-session-${session.id}`}
    >
      <div className="w-16 shrink-0 bg-primary text-primary-foreground flex flex-col items-center justify-center py-4 gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{dayAbbr}</span>
        <span className="text-2xl font-bold leading-tight">{dateNum}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{monthAbbr}</span>
      </div>

      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-base leading-snug" data-testid={`text-session-title-${session.id}`}>
            {session.title}
          </h3>
          <SpotsBadge session={session} isBooked={isBooked} />
        </div>

        <div className="space-y-1 text-sm text-muted-foreground mb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{session.startTime} – {session.endTime}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="block">
                <span className="font-medium text-foreground">{session.venueName}</span>
                {session.venueLocation ? (
                  <span className="text-muted-foreground"> · {session.venueLocation}</span>
                ) : null}
              </span>
              {session.venueMapUrl && (
                <a
                  href={session.venueMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-session-map-card-${session.id}`}
                >
                  View on Map
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>{session.courtCount} courts</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{session.totalBookings} / {session.capacity} booked</span>
            <span>{capacityPercent}%</span>
          </div>
          <Progress value={capacityPercent} className="h-1.5" />
        </div>

        {session.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{session.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-lg" data-testid={`text-price-${session.id}`}>
            AED {session.priceAed}
          </span>
          <Link href={`/marketplace/sessions/${session.id}`}>
            <Button
              size="sm"
              variant={isBooked ? 'outline' : 'default'}
              className="gap-1"
              disabled={!isBooked && session.spotsRemaining <= 0}
              data-testid={isBooked ? `button-view-booking-${session.id}` : `button-view-session-${session.id}`}
            >
              {isBooked ? 'View Booking' : session.spotsRemaining > 0 ? 'View & Book' : 'Join the Waitlist'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function GridCard({ session, isBooked }: SessionCardProps) {
  const capacityPercent = session.capacity > 0
    ? Math.round((session.totalBookings / session.capacity) * 100)
    : 0;
  const levelBandColor = session.title.toLowerCase().includes('advanced') || session.title.toLowerCase().includes('pro')
    ? 'bg-purple-500'
    : session.title.toLowerCase().includes('intermediate')
    ? 'bg-blue-500'
    : session.title.toLowerCase().includes('beginner') || session.title.toLowerCase().includes('novice')
    ? 'bg-green-500'
    : 'bg-secondary';

  return (
    <Card className="h-full flex flex-col overflow-hidden" data-testid={`card-session-${session.id}`}>
      <div className={`h-1 w-full ${levelBandColor}`} />
      <div className="h-28 bg-muted/50 flex items-center justify-center relative">
        {session.imageUrl ? (
          <img src={session.imageUrl} alt={session.title} className="w-full h-full object-cover" />
        ) : (
          <Building2 className="h-10 w-10 text-muted-foreground/30" />
        )}
        <div className="absolute top-2 right-2">
          <SpotsBadge session={session} isBooked={isBooked} />
        </div>
      </div>
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="mb-3">
          <h3 className="font-semibold text-lg truncate" data-testid={`text-session-title-${session.id}`}>
            {session.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(session.date as unknown as string), 'EEEE, MMM d')}
          </p>
        </div>
        <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{session.startTime} – {session.endTime}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="truncate block">
                {session.venueName}{session.venueLocation ? ` · ${session.venueLocation}` : ''}
              </span>
              {session.venueMapUrl && (
                <a
                  href={session.venueMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-session-map-card-${session.id}`}
                >
                  View on Map
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>{session.courtCount} courts</span>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{session.totalBookings} / {session.capacity} booked</span>
            <span>{capacityPercent}%</span>
          </div>
          <Progress value={capacityPercent} className="h-1.5" />
        </div>
        {session.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{session.description}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t flex-wrap">
          <span className="font-bold text-lg" data-testid={`text-price-${session.id}`}>
            AED {session.priceAed}
          </span>
          <Link href={`/marketplace/sessions/${session.id}`}>
            <Button
              size="sm"
              variant={isBooked ? 'outline' : 'default'}
              className="gap-1"
              disabled={!isBooked && session.spotsRemaining <= 0}
              data-testid={isBooked ? `button-view-booking-${session.id}` : `button-view-session-${session.id}`}
            >
              {isBooked ? 'View Booking' : session.spotsRemaining > 0 ? 'View & Book' : 'Join the Waitlist'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookSessions() {
  const { isAuthenticated } = useMarketplaceAuth();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const { data: myBookings } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  const bookedSessionIds = useMemo(() => {
    if (!myBookings) return new Set<string>();
    return new Set(
      myBookings
        .filter(b => b.status === 'confirmed' || b.status === 'attended')
        .map(b => b.sessionId)
    );
  }, [myBookings]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayIso = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);

  const upcomingSessions = useMemo(() => {
    return sessions?.filter(s => {
      if (s.status !== 'upcoming') return false;
      const d = new Date(isoDate(s.date as unknown as string) + 'T00:00:00');
      return d >= today;
    }) ?? [];
  }, [sessions, today]);

  const dateTiles = useMemo(() => {
    const sessionDates = new Set(upcomingSessions.map(s => isoDate(s.date as unknown as string)));
    sessionDates.add(todayIso);
    return Array.from(sessionDates)
      .sort()
      .map(iso => {
        const d = new Date(iso + 'T00:00:00');
        return {
          iso,
          dayAbbr: format(d, 'EEE'),
          dateNum: format(d, 'd'),
          monthAbbr: format(d, 'MMM'),
          isToday: iso === todayIso,
          hasSession: upcomingSessions.some(s => isoDate(s.date as unknown as string) === iso),
        };
      });
  }, [upcomingSessions, todayIso]);

  const filteredSessions = useMemo(() => {
    let result = upcomingSessions;
    if (selectedDate) {
      result = result.filter(s => isoDate(s.date as unknown as string) === selectedDate);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.venueName?.toLowerCase().includes(q) ||
        s.venueLocation?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [upcomingSessions, selectedDate, search]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, BookableSessionWithAvailability[]>();
    for (const s of filteredSessions) {
      const iso = isoDate(s.date as unknown as string);
      if (!groups.has(iso)) groups.set(iso, []);
      groups.get(iso)!.push(s);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSessions]);

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        {/* Header */}
        <motion.div variants={fadeInUp} className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Calendar className="h-6 w-6 text-secondary" /> Sessions
          </h1>
          <p className="text-muted-foreground mt-1">Browse and book upcoming badminton sessions across Dubai</p>
        </motion.div>

        {/* Date strip */}
        <motion.div variants={fadeInUp} className="mb-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-secondary" />
                Select Date
              </div>
              <button
                className="text-sm text-primary hover:underline font-medium"
                onClick={() => setSelectedDate(null)}
                data-testid="button-all-dates"
              >
                All Dates
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={scrollLeft}
                data-testid="button-date-scroll-left"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto flex-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {dateTiles.map((tile) => {
                  const isSelected = selectedDate === tile.iso;
                  return (
                    <button
                      key={tile.iso}
                      onClick={() => setSelectedDate(isSelected ? null : tile.iso)}
                      data-testid={`button-date-${tile.iso}`}
                      className={[
                        'flex flex-col items-center justify-center rounded-md border px-3 py-2 min-w-[60px] shrink-0 transition-colors cursor-pointer',
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : tile.isToday
                          ? 'border-secondary/60 bg-secondary/10 hover-elevate'
                          : 'border-border bg-background hover-elevate',
                        !tile.hasSession ? 'opacity-40' : '',
                      ].join(' ')}
                    >
                      <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-primary/70' : 'text-muted-foreground'}`}>
                        {tile.dayAbbr}
                      </span>
                      <span className={`text-xl font-bold leading-tight ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {tile.dateNum}
                      </span>
                      <span className={`text-[10px] uppercase ${isSelected ? 'text-primary/70' : 'text-muted-foreground'}`}>
                        {tile.monthAbbr}
                      </span>
                      {tile.isToday && (
                        <span className={`text-[9px] font-bold mt-0.5 uppercase tracking-wide ${isSelected ? 'text-primary' : 'text-secondary'}`}>
                          Today
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={scrollRight}
                data-testid="button-date-scroll-right"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Search + filters + view toggle */}
        <motion.div variants={fadeInUp} className="flex items-center gap-2 mb-6 flex-wrap">
          <div className="flex-1 relative min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search venues or locations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              data-testid="input-search-sessions"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" data-testid="button-filters">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
          <div className="flex border rounded-md overflow-hidden shrink-0">
            <Button
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setViewMode('list')}
              data-testid="button-view-list"
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setViewMode('grid')}
              data-testid="button-view-grid"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        {/* Content */}
        {isLoading ? (
          viewMode === 'list' ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex rounded-md border bg-card overflow-hidden">
                  <Skeleton className="w-16 min-h-[120px] rounded-none" />
                  <div className="flex-1 p-4 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-2 w-full mt-2" />
                    <Skeleton className="h-8 w-28 mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-3/4 mb-3" />
                    <Skeleton className="h-4 w-1/2 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-2 w-full mb-3" />
                    <Skeleton className="h-9 w-28 mt-4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No sessions found</h3>
              <p className="text-sm text-muted-foreground">
                {search || selectedDate
                  ? 'Try adjusting your filters or selecting a different date.'
                  : 'Check back soon for new sessions.'}
              </p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="space-y-8">
            {groupedSessions.map(([iso, dateSessions]) => {
              const d = new Date(iso + 'T00:00:00');
              const headerLabel = format(d, 'EEEE, MMMM d');
              return (
                <div key={iso}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-secondary" />
                      <h2 className="font-semibold text-base" data-testid={`text-date-header-${iso}`}>
                        {headerLabel}
                      </h2>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      {dateSessions.length} {dateSessions.length === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {dateSessions.map(session => (
                      <ListCard
                        key={session.id}
                        session={session}
                        isBooked={bookedSessionIds.has(session.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSessions.map((session) => (
              <GridCard
                key={session.id}
                session={session}
                isBooked={bookedSessionIds.has(session.id)}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
