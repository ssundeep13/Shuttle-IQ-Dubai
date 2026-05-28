import { useState, useRef, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin, Clock, Users, CheckCircle, ArrowRight,
  ChevronLeft, ChevronRight, Search, SlidersHorizontal, List, LayoutGrid,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

function isoDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

// ── Level tones (band colour by title keyword; matches existing derivation) ──
type Tone = { band: string; soft: string; fg: string; label: string; hasLevel: boolean };
function levelTone(title: string): Tone {
  const t = (title || '').toLowerCase();
  const P = { band: '#7A4FBF', soft: '#EEE6F8', fg: '#4A2B85' };
  const B = { band: '#2A6FDB', soft: '#E3ECF8', fg: '#1B4A99' };
  const G = { band: '#1F8A5B', soft: '#DDEEE2', fg: '#1A6A45' };
  if (t.includes('advanced')) return { ...P, label: 'Advanced', hasLevel: true };
  if (t.includes('pro')) return { ...P, label: 'Pro', hasLevel: true };
  if (t.includes('intermediate')) return { ...B, label: 'Intermediate', hasLevel: true };
  if (t.includes('beginner')) return { ...G, label: 'Beginner', hasLevel: true };
  if (t.includes('novice')) return { ...G, label: 'Novice', hasLevel: true };
  // Default: neutral teal band, NO text level chip (avoids fake "General" label).
  return { band: MKT.teal, soft: MKT.tealMist, fg: MKT.tealD, label: 'General', hasLevel: false };
}

// ── Small primitives ────────────────────────────────────────────────────────
function LevelTag({ tone, small }: { tone: Tone; small?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '3px 8px' : '4px 10px', borderRadius: 999,
        background: tone.soft, color: tone.fg,
        fontFamily: FF_MONO, fontWeight: 700, fontSize: small ? 10 : 11,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}
    >
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: '50%', background: tone.band }} />
      {tone.label}
    </span>
  );
}

function AvailabilityPill({ session, isBooked, small }: { session: BookableSessionWithAvailability; isBooked: boolean; small?: boolean }) {
  let toneKey: 'green' | 'amber' | 'red' | 'mute';
  let label: string;
  if (isBooked) { toneKey = 'green'; label = 'Booked'; }
  else if (session.spotsRemaining <= 0) { toneKey = 'red'; label = 'Full'; }
  else if (session.spotsRemaining <= 3) { toneKey = 'amber'; label = `${session.spotsRemaining} left`; }
  else { toneKey = 'mute'; label = `${session.spotsRemaining} spots`; }

  const palette = {
    green: { bg: '#DDEEE2', fg: '#1A6A45', dot: MKT.green },
    amber: { bg: '#F6E6CC', fg: '#7A4A0E', dot: MKT.amber },
    red: { bg: '#F1D7D2', fg: '#8E2C22', dot: MKT.red },
    mute: { bg: 'rgba(0,30,70,0.06)', fg: MKT.inkSub, dot: MKT.inkMute },
  }[toneKey];

  return (
    <span
      data-testid={isBooked ? `badge-booked-${session.id}` : `badge-spots-${session.id}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '4px 8px' : '5px 10px', borderRadius: 999,
        background: palette.bg, color: palette.fg,
        fontFamily: FF_MONO, fontWeight: 700, fontSize: small ? 10 : 11,
        letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}
    >
      {isBooked
        ? <CheckCircle style={{ width: small ? 11 : 12, height: small ? 11 : 12 }} />
        : <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: '50%', background: palette.dot }} />}
      {label}
    </span>
  );
}

function CapacityBar({ session, dense }: { session: BookableSessionWithAvailability; dense?: boolean }) {
  const pct = session.capacity > 0 ? Math.round((session.totalBookings / session.capacity) * 100) : 0;
  const left = session.spotsRemaining;
  const tone = left <= 0 ? MKT.red : left <= 3 ? MKT.amber : MKT.teal;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: MKT.inkSub, textTransform: 'uppercase' }}>
          {session.totalBookings}/{session.capacity} booked
        </span>
        <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: tone, letterSpacing: '0.04em' }}>{pct}%</span>
      </div>
      <div style={{ height: dense ? 4 : 6, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: tone }} />
      </div>
    </div>
  );
}

function DateBlock({ iso, small }: { iso: string; small?: boolean }) {
  const d = new Date(iso + 'T00:00:00');
  return (
    <div
      style={{
        flex: 'none', width: small ? 64 : 76, padding: small ? '10px 6px' : '12px 8px',
        borderRadius: 12, background: MKT.cream, border: `1px solid ${MKT.navy}1A`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: FF_MONO, fontSize: small ? 10 : 11, fontWeight: 700, color: MKT.tealD, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{format(d, 'EEE')}</div>
      <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: small ? 28 : 34, lineHeight: 1, color: MKT.navy, letterSpacing: '-0.03em' }}>{format(d, 'd')}</div>
      <div style={{ fontFamily: FF_MONO, fontSize: small ? 9 : 10, fontWeight: 600, color: MKT.inkSub, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{format(d, 'MMM')}</div>
    </div>
  );
}

function MapLink({ url, sessionId, small }: { url: string; sessionId: string; small?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid={`link-session-map-card-${sessionId}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: small ? 12 : 13, fontWeight: 600, color: MKT.tealD, textDecoration: 'none' }}
    >
      <MapPin style={{ width: small ? 12 : 14, height: small ? 12 : 14 }} />
      View on Map
    </a>
  );
}

// ── Action button — preserves exact states + testids + Link target ───────────
function ActionButton({ session, isBooked, fullWidth, compact }: { session: BookableSessionWithAvailability; isBooked: boolean; fullWidth?: boolean; compact?: boolean }) {
  const disabled = !isBooked && session.spotsRemaining <= 0;
  const label = isBooked ? 'View Booking' : session.spotsRemaining > 0 ? 'View & Book' : 'Join the Waitlist';
  const testid = isBooked ? `button-view-booking-${session.id}` : `button-view-session-${session.id}`;

  const common: CSSProperties = {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: compact ? 12 : 14, letterSpacing: '-0.005em',
    padding: compact ? '8px 12px' : '11px 18px', borderRadius: 10, border: '1.5px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', width: fullWidth ? '100%' : 'auto',
  };
  let kindStyle: CSSProperties;
  if (disabled) kindStyle = { background: 'rgba(0,30,70,0.05)', color: MKT.inkMute, borderColor: 'transparent' };
  else if (isBooked) kindStyle = { background: '#fff', color: MKT.navy, borderColor: `${MKT.navy}55` };
  else kindStyle = { background: MKT.navy, color: '#fff', borderColor: MKT.navy };

  return (
    <Link href={`/marketplace/sessions/${session.id}`} style={{ width: fullWidth ? '100%' : 'auto', textDecoration: 'none' }}>
      <button type="button" disabled={disabled} data-testid={testid} style={{ ...common, ...kindStyle }}>
        {label}
        {!disabled && <ArrowRight style={{ width: 14, height: 14 }} />}
      </button>
    </Link>
  );
}

function PriceBlock({ session, large }: { session: BookableSessionWithAvailability; large?: boolean }) {
  return (
    <div>
      <div data-testid={`text-price-${session.id}`} style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: large ? 32 : 22, color: MKT.navy, letterSpacing: '-0.025em', lineHeight: 1 }}>
        AED {session.priceAed}
      </div>
      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MKT.inkSub, marginTop: 2 }}>per player</div>
    </div>
  );
}

const cardShell: CSSProperties = {
  position: 'relative', background: '#fff', borderRadius: 14,
  border: `1px solid ${MKT.navy}14`, overflow: 'hidden',
};

function HoverCard({ children, reduce, style }: { children: ReactNode; reduce: boolean; style?: CSSProperties }) {
  if (reduce) return <div style={{ ...cardShell, ...style }}>{children}</div>;
  return (
    <motion.div style={{ ...cardShell, ...style }} whileHover={{ y: -3 }} transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

// ── List card (wide on desktop, stacked on phone) ────────────────────────────
function ListCard({ session, isBooked, reduce }: { session: BookableSessionWithAvailability; isBooked: boolean; reduce: boolean }) {
  const tone = levelTone(session.title);
  const iso = isoDate(session.date as unknown as string);
  return (
    <HoverCard reduce={reduce} style={{ display: 'flex' }}>
      <div data-testid={`card-session-${session.id}`} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
        {/* accent band */}
        <div style={{ width: 6, flex: 'none', background: tone.band }} />

        <div className="flex-1 flex flex-col lg:flex-row min-w-0">
          {/* desktop date column */}
          <div className="hidden lg:flex" style={{ alignItems: 'center', padding: '20px 4px 20px 22px' }}>
            <DateBlock iso={iso} />
          </div>

          {/* content */}
          <div className="flex-1 min-w-0" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div className="lg:hidden"><DateBlock iso={iso} small /></div>
              <div className="min-w-0" style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {tone.hasLevel && <LevelTag tone={tone} />}
                <AvailabilityPill session={session} isBooked={isBooked} />
                <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.inkSub, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Users style={{ width: 12, height: 12 }} />
                  {session.courtCount} court{session.courtCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <h3 data-testid={`text-session-title-${session.id}`} style={{ margin: '2px 0 0', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 'clamp(18px, 2vw, 24px)', color: MKT.navy, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {session.title}
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 14, color: MKT.ink, letterSpacing: '-0.005em' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FF_MONO, fontWeight: 700, fontSize: 14, color: MKT.navy }}>
                <Clock style={{ width: 14, height: 14 }} />
                {session.startTime} – {session.endTime}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin style={{ width: 14, height: 14, color: MKT.inkSub }} />
                <span>
                  <b style={{ color: MKT.ink, fontWeight: 600 }}>{session.venueName}</b>
                  {session.venueLocation ? <span style={{ color: MKT.inkSub }}> · {session.venueLocation}</span> : null}
                </span>
              </span>
              {session.venueMapUrl && <MapLink url={session.venueMapUrl} sessionId={session.id} />}
            </div>

            {session.description && (
              <p className="line-clamp-2" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.55, color: MKT.inkSub, maxWidth: 620, letterSpacing: '-0.005em' }}>
                {session.description}
              </p>
            )}
          </div>

          {/* right rail: capacity + price + action */}
          <div
            className="lg:w-[280px] lg:flex-none"
            style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, borderTop: `1px dashed ${MKT.line}` }}
          >
            <div className="lg:border-l-0" style={{}}>
              <CapacityBar session={session} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }} className="lg:flex-col lg:items-stretch lg:gap-3">
              <PriceBlock session={session} large />
              <ActionButton session={session} isBooked={isBooked} />
            </div>
          </div>
        </div>
      </div>
    </HoverCard>
  );
}

// ── Grid card (compact, top-banded; no venue image per locked design) ────────
function GridCard({ session, isBooked, reduce }: { session: BookableSessionWithAvailability; isBooked: boolean; reduce: boolean }) {
  const tone = levelTone(session.title);
  const iso = isoDate(session.date as unknown as string);
  return (
    <HoverCard reduce={reduce} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div data-testid={`card-session-${session.id}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ height: 5, background: tone.band }} />
        <div style={{ padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <DateBlock iso={iso} small />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tone.hasLevel && <LevelTag tone={tone} small />}
                <AvailabilityPill session={session} isBooked={isBooked} small />
              </div>
              <div style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 13, color: MKT.navy, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock style={{ width: 13, height: 13 }} />
                {session.startTime} – {session.endTime}
              </div>
            </div>
          </div>

          <h3 data-testid={`text-session-title-${session.id}`} style={{ margin: '2px 0 0', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {session.title}
          </h3>

          <div style={{ fontSize: 13, color: MKT.ink, letterSpacing: '-0.005em', lineHeight: 1.4 }}>
            <b style={{ fontWeight: 600 }}>{session.venueName}</b>
            {session.venueLocation ? <span style={{ color: MKT.inkSub }}> · {session.venueLocation}</span> : null}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {session.venueMapUrl && <MapLink url={session.venueMapUrl} sessionId={session.id} small />}
              <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.inkSub, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Users style={{ width: 11, height: 11 }} />
                {session.courtCount} court{session.courtCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {session.description && (
            <p className="line-clamp-2" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: MKT.inkSub, letterSpacing: '-0.005em' }}>
              {session.description}
            </p>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px dashed ${MKT.line}` }}>
            <CapacityBar session={session} dense />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <PriceBlock session={session} />
            <ActionButton session={session} isBooked={isBooked} compact />
          </div>
        </div>
      </div>
    </HoverCard>
  );
}

// ── Day group (used by both list + grid) ─────────────────────────────────────
function DayGroup({ iso, sessions, view, reduce, bookedSessionIds, isToday }: {
  iso: string; sessions: BookableSessionWithAvailability[]; view: 'list' | 'grid'; reduce: boolean; bookedSessionIds: Set<string>; isToday: boolean;
}) {
  const d = new Date(iso + 'T00:00:00');
  const label = `${isToday ? 'Today · ' : ''}${format(d, 'EEEE, MMM d')}`;
  return (
    <Reveal>
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <h2 data-testid={`text-date-header-${iso}`} style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 'clamp(18px, 2vw, 22px)', color: MKT.navy, letterSpacing: '-0.02em' }}>
            {label}
          </h2>
          <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </span>
          <div style={{ flex: 1, height: 1, background: MKT.line }} />
        </div>

        {view === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sessions.map((s) => <ListCard key={s.id} session={s} isBooked={bookedSessionIds.has(s.id)} reduce={reduce} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 16 }}>
            {sessions.map((s) => <GridCard key={s.id} session={s} isBooked={bookedSessionIds.has(s.id)} reduce={reduce} />)}
          </div>
        )}
      </div>
    </Reveal>
  );
}

// ── Date chip ─────────────────────────────────────────────────────────────────
function DateChip({ active, onClick, isAll, allCount, day, num, month, count, isToday, testid }: {
  active: boolean; onClick: () => void; isAll?: boolean; allCount?: number;
  day?: string; num?: string; month?: string; count?: number; isToday?: boolean; testid?: string;
}) {
  const empty = !isAll && (count ?? 0) === 0;
  return (
    <button
      onClick={empty ? undefined : onClick}
      disabled={empty}
      data-testid={testid}
      style={{
        flex: 'none', width: 80, minHeight: 92, borderRadius: 14,
        border: `1.5px solid ${active ? MKT.navy : MKT.navy + (isAll ? '22' : '14')}`,
        background: active ? MKT.navy : (empty ? 'transparent' : '#fff'),
        color: active ? '#fff' : (empty ? MKT.inkMute : (isAll ? MKT.navy : MKT.ink)),
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, cursor: empty ? 'not-allowed' : 'pointer', padding: '10px 8px',
        opacity: empty ? 0.55 : 1, position: 'relative',
      }}
    >
      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: active ? 'rgba(255,255,255,0.75)' : (isAll ? undefined : isToday ? MKT.tealD : MKT.inkSub), opacity: isAll ? 0.7 : 1 }}>
        {isAll ? 'All' : isToday ? 'Today' : day}
      </div>
      <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: isAll ? 26 : 30, lineHeight: 1, letterSpacing: '-0.03em' }}>
        {isAll ? allCount : num}
      </div>
      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: active ? 'rgba(255,255,255,0.6)' : MKT.inkSub, opacity: isAll ? 0.7 : 1 }}>
        {isAll ? 'Dates' : month}
      </div>
      {!isAll && (
        <div style={{ position: 'absolute', top: 8, right: 10, fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: empty ? MKT.inkMute : (active ? MKT.teal : MKT.tealD) }}>
          {empty ? '—' : `·${count}`}
        </div>
      )}
    </button>
  );
}

export default function BookSessions() {
  usePageTitle('Book Sessions');
  const { isAuthenticated } = useMarketplaceAuth();
  const reduce = !!useReducedMotion();
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
      myBookings.filter((b) => b.status === 'confirmed' || b.status === 'attended').map((b) => b.sessionId),
    );
  }, [myBookings]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayIso = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);

  const upcomingSessions = useMemo(() => {
    return sessions?.filter((s) => {
      if (s.status !== 'upcoming') return false;
      const d = new Date(isoDate(s.date as unknown as string) + 'T00:00:00');
      return d >= today;
    }) ?? [];
  }, [sessions, today]);

  const dateTiles = useMemo(() => {
    const counts = new Map<string, number>();
    upcomingSessions.forEach((s) => {
      const iso = isoDate(s.date as unknown as string);
      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    });
    if (!counts.has(todayIso)) counts.set(todayIso, 0);
    return Array.from(counts.keys())
      .sort()
      .map((iso) => {
        const d = new Date(iso + 'T00:00:00');
        return {
          iso,
          day: format(d, 'EEE'),
          num: format(d, 'd'),
          month: format(d, 'MMM'),
          isToday: iso === todayIso,
          count: counts.get(iso) ?? 0,
        };
      });
  }, [upcomingSessions, todayIso]);

  const filteredSessions = useMemo(() => {
    let result = upcomingSessions;
    if (selectedDate) result = result.filter((s) => isoDate(s.date as unknown as string) === selectedDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) =>
        s.venueName?.toLowerCase().includes(q) ||
        s.venueLocation?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q),
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

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' });

  const arrowBtn: CSSProperties = {
    flex: 'none', width: 36, height: 36, borderRadius: 999, border: `1px solid ${MKT.navy}1F`,
    background: '#fff', color: MKT.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  };

  return (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      <div className="max-w-6xl mx-auto" style={{ padding: 'clamp(24px, 4vw, 56px) clamp(16px, 4vw, 48px) clamp(48px, 6vw, 96px)' }}>
        {/* Header */}
        <Reveal>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: FF_MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: MKT.tealD, marginBottom: 16 }}>
            <span style={{ width: 24, height: 1.5, background: MKT.tealD, opacity: 0.5 }} />
            Browse &amp; book
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between" style={{ gap: 24 }}>
            <h1 data-testid="text-page-title" style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(44px, 7vw, 84px)', lineHeight: 0.94, letterSpacing: '-0.04em', color: MKT.navy }}>
              Find your <span style={{ color: MKT.teal, fontStyle: 'italic' }}>next</span> game.
            </h1>
            <p style={{ margin: 0, maxWidth: 360, fontSize: 15, lineHeight: 1.5, color: MKT.inkSub, letterSpacing: '-0.005em' }}>
              {filteredSessions.length} session{filteredSessions.length === 1 ? '' : 's'} across the next 7 days. Filter by date, search by venue, and book in two taps.
            </p>
          </div>
        </Reveal>

        {/* Date strip */}
        <Reveal>
          <div style={{ marginTop: 'clamp(28px, 4vw, 40px)', display: 'flex', alignItems: 'stretch', gap: 10 }}>
            <button onClick={scrollLeft} data-testid="button-date-scroll-left" aria-label="Scroll left" style={{ ...arrowBtn, alignSelf: 'center' }}>
              <ChevronLeft style={{ width: 18, height: 18 }} />
            </button>
            <div ref={scrollRef} className="flex" style={{ gap: 10, overflowX: 'auto', flex: 1, paddingBottom: 4, scrollbarWidth: 'none' }}>
              <DateChip active={selectedDate === null} onClick={() => setSelectedDate(null)} isAll allCount={upcomingSessions.length} testid="button-all-dates" />
              {dateTiles.map((t) => (
                <DateChip
                  key={t.iso}
                  testid={`button-date-${t.iso}`}
                  active={selectedDate === t.iso}
                  onClick={() => setSelectedDate(selectedDate === t.iso ? null : t.iso)}
                  day={t.day}
                  num={t.num}
                  month={t.month}
                  count={t.count}
                  isToday={t.isToday}
                />
              ))}
            </div>
            <button onClick={scrollRight} data-testid="button-date-scroll-right" aria-label="Scroll right" style={{ ...arrowBtn, alignSelf: 'center' }}>
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </Reveal>

        {/* Toolbar: search + filters + view toggle */}
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-center" style={{ marginTop: 22, gap: 12 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0, background: '#fff', borderRadius: 12, border: `1px solid ${MKT.navy}1F`, display: 'flex', alignItems: 'center', padding: '12px 14px 12px 42px' }}>
              <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MKT.inkSub }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by venue, location, or session title…"
                data-testid="input-search-sessions"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: FF_BODY, fontSize: 15, color: MKT.ink, letterSpacing: '-0.005em', minWidth: 0 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                data-testid="button-filters"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${MKT.navy}1F`, background: '#fff', color: MKT.navy, fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                <SlidersHorizontal style={{ width: 16, height: 16 }} />
                Filters
              </button>

              {/* View toggle */}
              <div style={{ display: 'inline-flex', padding: 4, gap: 2, borderRadius: 10, background: 'rgba(0,30,70,0.06)' }}>
                {(['list', 'grid'] as const).map((v) => {
                  const active = viewMode === v;
                  const Icon = v === 'list' ? List : LayoutGrid;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setViewMode(v)}
                      data-testid={v === 'list' ? 'button-view-list' : 'button-view-grid'}
                      aria-label={v === 'list' ? 'List view' : 'Grid view'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: active ? '#fff' : 'transparent', border: 'none', cursor: 'pointer', color: active ? MKT.navy : MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, letterSpacing: '-0.005em', boxShadow: active ? `0 0 0 1px ${MKT.navy}14` : 'none' }}
                    >
                      <Icon style={{ width: 14, height: 14 }} />
                      {v === 'list' ? 'List' : 'Grid'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* result count + active-date chip */}
          <div className="flex items-center justify-between" style={{ marginTop: 18, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: FF_MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: MKT.inkSub }}>
              {filteredSessions.length} result{filteredSessions.length === 1 ? '' : 's'}
              {selectedDate && (
                <span style={{ color: MKT.tealD, marginLeft: 12 }}>
                  · {format(new Date(selectedDate + 'T00:00:00'), 'EEE d MMM')}
                  <span
                    onClick={() => setSelectedDate(null)}
                    style={{ marginLeft: 10, color: MKT.tealD, cursor: 'pointer', textTransform: 'none', fontFamily: FF_BODY, fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em' }}
                  >
                    clear
                  </span>
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: MKT.inkSub, letterSpacing: '-0.005em' }}>Sorted by date, earliest first.</div>
          </div>
        </Reveal>

        {/* Results */}
        {isLoading ? (
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...cardShell, display: 'flex' }}>
                <div style={{ width: 6, background: 'rgba(0,30,70,0.08)' }} />
                <div style={{ flex: 1, padding: 18 }}>
                  <Skeleton className="h-6 w-3/4 mb-3" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-full mb-3" />
                  <Skeleton className="h-2 w-full mb-3" />
                  <Skeleton className="h-9 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <Reveal>
            <div style={{ marginTop: 28, ...cardShell, padding: 'clamp(32px, 5vw, 48px) 32px', textAlign: 'center' }}>
              <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 'clamp(20px, 3vw, 28px)', color: MKT.navy, letterSpacing: '-0.02em', marginBottom: 8 }}>
                No sessions match your filters.
              </div>
              <div style={{ fontSize: 14, color: MKT.inkSub, lineHeight: 1.5 }}>
                {search || selectedDate ? 'Try clearing the date or simplifying your search.' : 'Check back soon for new sessions.'}
              </div>
            </div>
          </Reveal>
        ) : (
          <div>
            {groupedSessions.map(([iso, dateSessions]) => (
              <DayGroup
                key={iso}
                iso={iso}
                sessions={dateSessions}
                view={viewMode}
                reduce={reduce}
                bookedSessionIds={bookedSessionIds}
                isToday={iso === todayIso}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
