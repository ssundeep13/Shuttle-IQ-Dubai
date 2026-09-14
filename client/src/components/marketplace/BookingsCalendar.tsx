// My Bookings, Gate 10 — the pieces around the shared IQ Pass calendar in read mode:
// month navigation + grid with one venue-coloured dot per booked session and a day panel,
// the IQ Pass strip (tier · played/total · teal progress, links to the pass page), the compact
// pass-seat card (venue, time, Move, "Moves close in Xh") and the one-line past row.
// IQ Pass tokens only, Inter via the token font, no icons, no emoji.
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { IqPassCalendar, shortVenue, venueColour, type CalendarItem } from '@/components/marketplace/IqPassCalendar';
import { dubaiDayLabel } from '@/components/marketplace/IqPassMoveDialog';
import { sessionStartEpochMs } from '@shared/sessionTime';
import type { BookingWithDetails } from '@shared/schema';

export type MyPackLite = {
  id: string; tier: string; label: string; status: string; gamesTotal: number; lastGameDate: string | null;
  seats: Array<{ bookingId: string; sessionId: string; status: string; canMove: boolean; canMoveUntil?: string | null; session: { title: string; venueName: string; date: string; startTime: string; endTime: string } }>;
};
export type SeatInfo = { label: string; canMove: boolean; canMoveUntil: string | null };

const H = 3_600_000;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ymdOf = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
/** 'YYYY-MM-DD' for now in Asia/Dubai (UTC+4, no DST). */
export const todayDubai = (now = Date.now()): string => new Date(now + 4 * H).toISOString().slice(0, 10);
export const monthLabel = (ym: string): string => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };
export const monthBounds = (ym: string): { start: string; end: string } => { const [y, m] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` }; };
export const shiftMonth = (ym: string, delta: number): string => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7); };
const sessionEndMs = (s: { date: string | Date; endTime: string }): number => sessionStartEpochMs(s.date, s.endTime || '23:59');

/** "Moves close in 67h" until the 5-hour cutoff, then "Moves closed". */
export function movesCloseLabel(cutoffMs: number, now = Date.now()): string {
  const h = Math.ceil((cutoffMs - now) / H);
  return h > 0 ? `Moves close in ${h}h` : 'Moves closed';
}

/** The one-word outcome for a past booking. */
export function pastResult(b: { status: string; attendedAt?: unknown }): string {
  if (b.status === 'cancelled') return 'Cancelled';
  if (b.status === 'attended' || b.attendedAt) return 'Attended';
  if (b.status === 'waitlisted') return 'Waitlisted';
  if (b.status === 'pending_payment') return 'Unpaid';
  return 'Booked';
}

/** Games already played on a pass: confirmed or attended seats whose session has ended. */
export function playedOf(pack: MyPackLite, now = Date.now()): number {
  return pack.seats.filter((s) => (s.status === 'confirmed' || s.status === 'attended') && sessionEndMs(s.session) < now).length;
}

/** The pass for the strip: the active pack with games still ahead (earliest last game), else the latest active one. */
export function pickStripPack(packs: MyPackLite[], today: string): MyPackLite | null {
  const active = packs.filter((p) => p.status === 'active');
  if (active.length === 0) return null;
  const ahead = active.filter((p) => p.seats.some((s) => s.status === 'confirmed' && ymdOf(s.session.date) >= today)).sort((a, b) => (a.lastGameDate ?? '').localeCompare(b.lastGameDate ?? ''));
  return ahead[0] ?? active[active.length - 1];
}

const ghost: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1px solid ${IQP.line}`, background: IQP.white, color: IQP.navy, fontFamily: IQP_FONT, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const cardBox: React.CSSProperties = { background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 9, padding: 16, fontFamily: IQP_FONT, color: IQP.ink };

export function IqPassStrip({ pack, now = Date.now() }: { pack: MyPackLite; now?: number }) {
  const played = playedOf(pack, now);
  const total = Math.max(1, pack.gamesTotal);
  const pct = Math.max(0, Math.min(100, Math.round((played / total) * 100)));
  return (
    <Link href="/marketplace/iq-pass" data-testid="strip-iq-pass" aria-label={`IQ Pass ${pack.label}, ${played} of ${pack.gamesTotal} played, open your pass`}
      style={{ ...cardBox, display: 'block', padding: '12px 16px', textDecoration: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: IQP.navy }}>IQ Pass</span>
        <span data-testid="text-iq-pass-strip" style={{ fontSize: 14, color: IQP.inkSub }}>{pack.label} · {played}/{pack.gamesTotal} played</span>
      </div>
      <div aria-hidden="true" style={{ marginTop: 8, height: 6, borderRadius: 999, background: IQP.cream, overflow: 'hidden' }}>
        <div data-testid="bar-iq-pass-progress" style={{ width: `${pct}%`, height: '100%', background: IQP.teal, borderRadius: 999 }} />
      </div>
    </Link>
  );
}

export function PassSeatCard({ booking, seat, onMove, onAddGuest, now = Date.now() }: {
  booking: BookingWithDetails; seat: SeatInfo | null; onMove: () => void; onAddGuest?: () => void; now?: number;
}) {
  const start = sessionStartEpochMs(booking.session.date, booking.session.startTime);
  const cutoff = seat?.canMoveUntil ? new Date(seat.canMoveUntil).getTime() : start - 5 * H;
  const awaiting = booking.status === 'pending_payment';
  return (
    <div data-testid={`card-pass-seat-${booking.id}`} style={{ ...cardBox, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: IQP.navy }}>{booking.session.venueName}</div>
          <div style={{ fontSize: 14, color: IQP.inkSub, marginTop: 2 }}>{dubaiDayLabel(ymdOf(booking.session.date))} · {booking.session.startTime}–{booking.session.endTime}</div>
        </div>
        <span data-testid={`text-booking-iqpass-${booking.id}`} style={{ fontSize: 13, fontWeight: 700, color: IQP.teal, whiteSpace: 'nowrap' }}>
          IQ Pass{seat?.label ? ` · ${seat.label}` : ''}{awaiting ? ' — awaiting payment' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {seat?.canMove && !awaiting && (
          <button type="button" onClick={onMove} data-testid={`button-move-${booking.id}`} style={ghost}>Move</button>
        )}
        <span data-testid={`text-move-window-${booking.id}`} style={{ fontSize: 13, color: IQP.inkSub }}>{awaiting ? 'Held until payment completes' : movesCloseLabel(cutoff, now)}</span>
        {onAddGuest && booking.status === 'confirmed' && (
          <button type="button" onClick={onAddGuest} data-testid={`button-add-guest-${booking.id}`} style={{ ...ghost, marginLeft: 'auto' }}>Add Guest</button>
        )}
      </div>
    </div>
  );
}

export function PastLine({ booking }: { booking: BookingWithDetails }) {
  const result = pastResult(booking as { status: string; attendedAt?: unknown });
  return (
    <div data-testid={`row-past-${booking.id}`}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 6, fontFamily: IQP_FONT, fontSize: 13, color: IQP.inkSub }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: IQP.ink, fontWeight: 600 }}>{dubaiDayLabel(ymdOf(booking.session.date))} · {booking.session.startTime}</span> · {booking.session.venueName}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: result === 'Attended' ? IQP.teal : IQP.inkSub }}>{result}</span>
    </div>
  );
}

export function BookingsCalendar({ bookings, month, onMonth, today, selectedDay, onSelectDay, children }: {
  bookings: BookingWithDetails[]; month: string; onMonth: (ym: string) => void; today: string;
  selectedDay: string | null; onSelectDay: (ymd: string) => void; children?: ReactNode;
}) {
  const { start, end } = monthBounds(month);
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const items: CalendarItem[] = live.map((b) => ({ id: b.id, ymd: ymdOf(b.session.date), label: `${shortVenue(b.session.venueName)} ${b.session.startTime}`, colour: venueColour(b.session.venueName) }));
  const venues = Array.from(new Set(live.filter((b) => { const d = ymdOf(b.session.date); return d >= start && d <= end; }).map((b) => b.session.venueName)));
  const legend = venues.map((v) => ({ label: shortVenue(v), colour: venueColour(v) }));
  const navBtn = (delta: -1 | 1, testid: string, text: string) => (
    <button type="button" data-testid={testid} onClick={() => onMonth(shiftMonth(month, delta))} aria-label={delta < 0 ? 'Previous month' : 'Next month'} style={{ ...ghost, minWidth: 64 }}>{text}</button>
  );
  return (
    <div data-testid="bookings-calendar" style={{ display: 'grid', gap: 12, fontFamily: IQP_FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {navBtn(-1, 'button-month-prev', 'Prev')}
        <div data-testid="text-month-label" aria-live="polite" style={{ fontWeight: 700, fontSize: 16, color: IQP.navy, textAlign: 'center' }}>{monthLabel(month)}</div>
        {navBtn(1, 'button-month-next', 'Next')}
      </div>
      <IqPassCalendar mode="read" windowStart={start} windowEnd={end} items={items} legend={legend} selectedDay={selectedDay} today={today} onDay={onSelectDay} />
      {selectedDay ? (
        <div data-testid="day-panel" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: IQP.navy }}>{dubaiDayLabel(selectedDay)}</div>
          {children}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: IQP.inkSub }}>Tap a day with a dot to see its bookings.</p>
      )}
    </div>
  );
}
