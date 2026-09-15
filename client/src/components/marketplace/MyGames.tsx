// My games (Gate 13) — My Bookings around the next game.
//   NextGameCard   navy hero: day and date, time, venue · area, live countdown (by the minute),
//                  Move + "Moves close in Xh" for a pass seat, thin teal pass line at the bottom.
//   MonthStrip     six weeks of days (day letter + number), today centred with a teal underline,
//                  booked days as venue-coloured tiles with the start time; tap → the agenda row.
//   AgendaWeek/Row upcoming games grouped by week under teal overlines: day, time, venue,
//                  "IQ Pass" chip, Move, and a Details toggle that opens the existing booking card
//                  (guest add, drop-in cancel, payment state stay exactly where they were).
//   PlayedSection  past games under a collapsed native <details>, one line each with the outcome.
// IQ Pass tokens only, Inter, shared venue map, no icons, no emoji, flat surfaces.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { venueColour, VENUE_TILE_TEXT } from '@/lib/venueColours';
import { IqPassProgressLine } from '@/components/marketplace/IqPassPromo';
import { addDays, countdownLabel, dayLetter, dayNumber, mondayOf, monthShort, weekLabel, weekdayOf, ymdOf } from '@/lib/iqPassDates';
import { sessionStartEpochMs } from '@shared/sessionTime';
import type { BookingWithDetails } from '@shared/schema';

export type MyPackLite = {
  id: string; tier: string; label: string; status: string; gamesTotal: number; lastGameDate: string | null;
  holdExpiresAt?: string; cancellationReason?: string | null;
  seats: Array<{ bookingId: string; sessionId: string; status: string; canMove: boolean; canMoveUntil?: string | null; session: { title: string; venueName: string; date: string; startTime: string; endTime: string } }>;
};
export type SeatInfo = { label: string; canMove: boolean; canMoveUntil: string | null };

const H = 3_600_000;
export const startOf = (b: { session: { date: string | Date; startTime: string } }): number => sessionStartEpochMs(b.session.date, b.session.startTime);
export const endOf = (b: { session: { date: string | Date; endTime: string } }): number => sessionStartEpochMs(b.session.date, b.session.endTime || '23:59');
/** "Fri 18 Sep" */
export const dayDateLabel = (ymd: string): string => `${weekdayOf(ymd)} ${dayNumber(ymd)} ${monthShort(ymd)}`;

/** "Moves close in 27h" until the 5-hour cutoff, then "Moves closed". */
export function movesCloseLabel(cutoffMs: number, now = Date.now()): string {
  const h = Math.ceil((cutoffMs - now) / H);
  return h > 0 ? `Moves close in ${h}h` : 'Moves closed';
}

/** The one-word outcome for a past booking. */
export function pastResult(b: { status: string; attendedAt?: unknown }): string {
  if (b.status === 'cancelled') return 'Cancelled';
  if (b.status === 'attended' || b.attendedAt) return 'Attended';
  if (b.status === 'waitlisted') return 'Waitlisted';
  if (b.status === 'pending_payment' || b.status === 'pending') return 'Unpaid';
  return 'Booked';
}

/** Games already played on a pass: confirmed or attended seats whose session has ended. */
export function playedOf(pack: MyPackLite, now = Date.now()): number {
  return pack.seats.filter((s) => (s.status === 'confirmed' || s.status === 'attended') && endOf(s) < now).length;
}

/** The pass to show: the active pack with games still ahead (earliest last game), else the latest active one. */
export function pickStripPack(packs: MyPackLite[], today: string): MyPackLite | null {
  const active = packs.filter((p) => p.status === 'active');
  if (active.length === 0) return null;
  const ahead = active.filter((p) => p.seats.some((s) => s.status === 'confirmed' && ymdOf(s.session.date) >= today)).sort((a, b) => (a.lastGameDate ?? '').localeCompare(b.lastGameDate ?? ''));
  return ahead[0] ?? active[active.length - 1];
}

const STATUS_CAPTION: Record<string, string> = { waitlisted: 'Waitlisted', pending_payment: 'Payment due', pending: 'Pending', attended: 'Attended' };

/** Wall clock that ticks once a minute — enough for "in 27h" without a jittering seconds counter. */
export function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  return now;
}

const ghostOnNavy: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1px solid ${IQP.cream}`, background: 'transparent', color: IQP.cream, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const ghost: React.CSSProperties = { minHeight: 40, padding: '0 12px', borderRadius: 6, border: `1px solid ${IQP.line}`, background: IQP.white, color: IQP.navy, fontFamily: IQP_FONT, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const caption: React.CSSProperties = { fontSize: 12, color: IQP.inkSub };

export function NextGameCard({ booking, area, seat, passLine, onMove, now: nowProp }: {
  booking: BookingWithDetails; area: string | null; seat: SeatInfo | null;
  passLine: { label: string; played: number; total: number } | null; onMove: () => void; now?: number;
}) {
  const tick = useMinuteNow();
  const now = nowProp ?? tick;
  const ymd = ymdOf(booking.session.date);
  const start = startOf(booking);
  const cutoff = seat?.canMoveUntil ? new Date(seat.canMoveUntil).getTime() : start - 5 * H;
  const status = STATUS_CAPTION[booking.status];
  return (
    <section data-testid="card-next-game" aria-label="Next game" style={{ background: IQP.navy, color: IQP.cream, borderRadius: 12, padding: '18px 20px', fontFamily: IQP_FONT, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: IQP.cream, opacity: 0.8 }}>Next game</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span data-testid="text-next-day" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{dayDateLabel(ymd)}</span>
        <span data-testid="text-next-countdown" aria-live="polite" style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>{countdownLabel(start, now)}</span>
      </div>
      <span data-testid="text-next-time" style={{ fontSize: 14, fontWeight: 500 }}>{booking.session.startTime}–{booking.session.endTime}</span>
      <span data-testid="text-next-venue" style={{ fontSize: 14, fontWeight: 600 }}>{booking.session.venueName}{area ? ` · ${area}` : ''}</span>
      {status ? <span data-testid="text-next-status" style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>{status}</span> : null}
      {seat && booking.status === 'confirmed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {seat.canMove && <button type="button" data-testid={`button-move-${booking.id}`} onClick={onMove} style={ghostOnNavy}>Move</button>}
          <span data-testid={`text-move-window-${booking.id}`} style={{ fontSize: 12, opacity: 0.85 }}>{movesCloseLabel(cutoff, now)}</span>
        </div>
      )}
      {passLine && <IqPassProgressLine compact onDark label={passLine.label} played={passLine.played} total={passLine.total} href="/marketplace/iq-pass" />}
    </section>
  );
}

export type StripDay = { ymd: string; tiles: Array<{ bookingId: string; startTime: string; venueName: string }> };

/** Six weeks of days around today (the week before through four weeks ahead), with the live bookings on each. */
export function buildStripDays(upcoming: BookingWithDetails[], today: string): StripDay[] {
  const first = addDays(mondayOf(today), -7);
  const byDay = new Map<string, StripDay['tiles']>();
  for (const b of upcoming) {
    if (b.status === 'cancelled') continue;
    const ymd = ymdOf(b.session.date);
    const list = byDay.get(ymd) ?? [];
    list.push({ bookingId: b.id, startTime: b.session.startTime, venueName: b.session.venueName });
    byDay.set(ymd, list);
  }
  return Array.from({ length: 42 }, (_, i) => { const ymd = addDays(first, i); return { ymd, tiles: (byDay.get(ymd) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)) }; });
}

// Always a horizontal, scrolling row (today centred) at every width — the desktop column mode was dropped 2026-09-14.
export function MonthStrip({ days, today, onPick }: { days: StripDay[]; today: string; onPick: (bookingId: string) => void }) {
  const todayRef = useRef<HTMLDivElement>(null);
  useEffect(() => { todayRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' }); }, []);
  return (
    <div data-testid="strip-days" data-orientation="horizontal" aria-label="Your month"
      style={{ display: 'flex', flexDirection: 'row', gap: 6, overflowX: 'auto', scrollSnapType: 'x proximity', padding: '4px 0 8px', fontFamily: IQP_FONT }}>
      {days.map((d) => {
        const isToday = d.ymd === today;
        return (
          <div key={d.ymd} ref={isToday ? todayRef : undefined} data-testid={`day-${d.ymd}`} data-today={isToday ? 'true' : 'false'}
            style={{ flex: '0 0 auto', minWidth: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '2px 2px 4px', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: isToday ? IQP.teal : 'transparent', scrollSnapAlign: 'center' }}>
            <span data-testid={`text-day-letter-${d.ymd}`} style={{ fontSize: 11, fontWeight: 600, color: IQP.inkSub }}>{dayLetter(d.ymd)}</span>
            <span data-testid={`text-day-number-${d.ymd}`} style={{ fontSize: 14, fontWeight: isToday ? 800 : 600, color: isToday ? IQP.teal : IQP.ink }}>{dayNumber(d.ymd)}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 22 }}>
              {d.tiles.map((t) => (
                <button key={t.bookingId} type="button" data-testid={`tile-${t.bookingId}`} aria-label={`${dayDateLabel(d.ymd)} ${t.startTime} ${t.venueName}`} onClick={() => onPick(t.bookingId)}
                  style={{ border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700, backgroundColor: venueColour(t.venueName), color: VENUE_TILE_TEXT, cursor: 'pointer', fontFamily: IQP_FONT, lineHeight: 1.4 }}>
                  {t.startTime}
                </button>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Upcoming games grouped by Mon–Sun week, earliest first. */
export function groupUpcomingByWeek(upcoming: BookingWithDetails[]): Array<{ start: string; label: string; rows: BookingWithDetails[] }> {
  const sorted = [...upcoming].sort((a, b) => startOf(a) - startOf(b));
  const groups = new Map<string, BookingWithDetails[]>();
  for (const b of sorted) { const start = mondayOf(ymdOf(b.session.date)); const l = groups.get(start) ?? []; l.push(b); groups.set(start, l); }
  return Array.from(groups.entries()).map(([start, rows]) => ({ start, label: weekLabel(start, addDays(start, 6)), rows }));
}

export function AgendaWeek({ start, label, children }: { start: string; label: string; children: ReactNode }) {
  return (
    <section data-testid={`agenda-week-${start}`} style={{ borderTopWidth: 2, borderTopStyle: 'solid', borderTopColor: IQP.teal, paddingTop: 8, fontFamily: IQP_FONT }}>
      <div data-testid={`text-agenda-week-${start}`} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: IQP.teal, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>{children}</div>
    </section>
  );
}

export function AgendaRow({ booking, area, seat, open, onToggle, onMove, children }: {
  booking: BookingWithDetails; area: string | null; seat: SeatInfo | null; open: boolean; onToggle: () => void; onMove: () => void; children: ReactNode;
}) {
  const ymd = ymdOf(booking.session.date);
  const status = STATUS_CAPTION[booking.status];
  return (
    <div id={`game-${booking.id}`} data-testid={`row-game-${booking.id}`} style={{ background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 8, overflow: 'hidden', fontFamily: IQP_FONT, color: IQP.ink }}>
      <div style={{ display: 'grid', gridTemplateColumns: '4px minmax(0, 1fr) auto', alignItems: 'center' }}>
        <span aria-hidden="true" style={{ alignSelf: 'stretch', background: venueColour(booking.session.venueName) }} />
        <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: IQP.navy }}>{weekdayOf(ymd)} {dayNumber(ymd)}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{booking.session.startTime}–{booking.session.endTime}</span>
            {booking.packId ? <span data-testid={`chip-iq-pass-${booking.id}`} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: IQP.teal, border: `1px solid ${IQP.teal}`, borderRadius: 4, padding: '1px 6px' }}>IQ Pass</span> : null}
            {status ? <span data-testid={`chip-status-${booking.id}`} style={{ ...caption, fontWeight: 700 }}>{status}</span> : null}
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{booking.session.venueName}{area ? <span style={caption}> · {area}</span> : null}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 10px', alignItems: 'center' }}>
          {seat?.canMove && booking.status === 'confirmed' && <button type="button" data-testid={`button-move-${booking.id}`} onClick={onMove} style={ghost}>Move</button>}
          <button type="button" data-testid={`button-details-${booking.id}`} aria-expanded={open} aria-controls={`details-${booking.id}`} onClick={onToggle} style={ghost}>{open ? 'Hide' : 'Details'}</button>
        </div>
      </div>
      {open && <div id={`details-${booking.id}`} data-testid={`details-${booking.id}`} style={{ padding: 10, borderTop: `1px solid ${IQP.line}`, background: IQP.cream }}>{children}</div>}
    </div>
  );
}

export function PastLine({ booking }: { booking: BookingWithDetails }) {
  const result = pastResult(booking as { status: string; attendedAt?: unknown });
  return (
    <div data-testid={`row-past-${booking.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px', background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 6, fontFamily: IQP_FONT, fontSize: 13, color: IQP.inkSub }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: IQP.ink, fontWeight: 600 }}>{dayDateLabel(ymdOf(booking.session.date))} · {booking.session.startTime}</span> · {booking.session.venueName}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: result === 'Attended' ? IQP.teal : IQP.inkSub }}>{result}</span>
    </div>
  );
}

/** A past booking counts as played when it was attended, or confirmed and the session is over. */
export function isPlayed(b: { status: string; attendedAt?: unknown }): boolean {
  const r = pastResult(b);
  return r === 'Attended' || r === 'Booked';
}

const summaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: 14, fontWeight: 700, color: IQP.navy, padding: '8px 0', listStyle: 'none' };

/**
 * "Played (n)" counts only attended or completed games (Sandeep, 2026-09-14 — cancelled seats used to be counted);
 * cancelled, unpaid and waitlisted past rows keep their trace under a separate collapsed "Not played" section.
 */
export function PlayedSection({ bookings }: { bookings: BookingWithDetails[] }) {
  const sorted = [...bookings].sort((a, b) => startOf(b) - startOf(a));
  const played = sorted.filter((b) => isPlayed(b as { status: string; attendedAt?: unknown }));
  const notPlayed = sorted.filter((b) => !isPlayed(b as { status: string; attendedAt?: unknown }));
  return (
    <>
      {played.length > 0 && (
        <details data-testid="section-played" style={{ fontFamily: IQP_FONT }}>
          <summary data-testid="summary-played" style={summaryStyle}>Played ({played.length})</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginTop: 4 }}>{played.map((b) => <PastLine key={b.id} booking={b} />)}</div>
        </details>
      )}
      {notPlayed.length > 0 && (
        <details data-testid="section-not-played" style={{ fontFamily: IQP_FONT }}>
          <summary data-testid="summary-not-played" style={summaryStyle}>Not played ({notPlayed.length})</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginTop: 4 }}>{notPlayed.map((b) => <PastLine key={b.id} booking={b} />)}</div>
        </details>
      )}
    </>
  );
}

const emptyBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 6, backgroundColor: IQP.navy, color: IQP.white, fontWeight: 700, fontSize: 15, textDecoration: 'none', width: 'fit-content' };

// One action only: with IQ Pass on it is the pass (flag off falls back to the session list).
export function EmptyUpcoming({ iqPassEnabled, browseHref }: { iqPassEnabled: boolean; browseHref: string }) {
  return (
    <div data-testid="empty-upcoming" style={{ background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 12, padding: '20px', fontFamily: IQP_FONT, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <p data-testid="text-nothing-booked" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: IQP.navy, letterSpacing: '-0.01em' }}>Nothing booked.</p>
      {iqPassEnabled
        ? <Link href="/marketplace/iq-pass" data-testid="button-get-iq-pass" style={emptyBtn}>Get your IQ Pass</Link>
        : <Link href={browseHref} data-testid="button-browse-sessions" style={emptyBtn}>Browse Sessions</Link>}
    </div>
  );
}
