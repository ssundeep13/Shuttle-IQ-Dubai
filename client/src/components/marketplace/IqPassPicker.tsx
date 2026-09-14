// IQ Pass picker (Gate 11). Each week of the rolling 4-week window is a teal overline followed
// by a row of session cards — one card per session, no empty cells, no weekday grid. A card
// carries the day number, venue, area, time, a spots-left caption and a 4px rail in the
// venue's colour (shared map). A sticky slot bar shows N empty outlines that fill with
// venue-coloured tiles ("Mon 14 · 20:00"); tap a tile to remove; when every slot is filled the
// bar carries the single Review button. Picked cards go navy with cream text and a tick;
// cap-reached cards drop to 40% with a caption (no tooltips). Phones stack full-width cards.
// IQ Pass tokens only, Inter, no icons, no emoji, flat surfaces (no colour ramps, no lifted shadows).
import { useEffect, useMemo, useRef } from 'react';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { venueColour, VENUE_TILE_TEXT } from '@/lib/venueColours';
import { buildWeeks, dayNumber, weekdayOf, tileLabel } from '@/lib/iqPassDates';
import { useViewportWidth, MOBILE_MAX, HEADER_HEIGHT } from '@/hooks/useViewportWidth';

export type PickerSession = {
  id: string;
  dateDubai: string;
  venueName: string;
  venueArea?: string | null;
  startTime: string;
  endTime: string;
  spotsRemaining: number;
  packSeatsLeft: number;
  alreadyBooked: boolean;
};

export type CardState = 'pickable' | 'picked' | 'blocked' | 'locked';

/** What a card is and what its caption says. `locked` = every slot is filled and this one is not among them. */
export function cardState(s: PickerSession, picked: boolean, slotsFull: boolean): { state: CardState; caption: string } {
  if (picked) return { state: 'picked', caption: `${s.spotsRemaining} spots left` };
  if (s.alreadyBooked) return { state: 'blocked', caption: 'Booked' };
  if (s.spotsRemaining < 1) return { state: 'blocked', caption: 'Full' };
  if (s.packSeatsLeft < 1) return { state: 'blocked', caption: 'Pass seats full' };
  if (slotsFull) return { state: 'locked', caption: `${s.spotsRemaining} spots left` };
  return { state: 'pickable', caption: `${s.spotsRemaining} spots left` };
}

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  minHeight: 44, padding: '0 20px', borderRadius: 6, border: 'none', background: IQP.teal, color: IQP.white,
  fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
});

function Tick({ id }: { id: string }) {
  return (
    <svg data-testid={`tick-${id}`} width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10.5l4 4 8-9" fill="none" stroke={IQP.cream} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SessionCard({ s, state, caption, mobile, onToggle }: { s: PickerSession; state: CardState; caption: string; mobile: boolean; onToggle: (id: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const picked = state === 'picked';
  const blocked = state === 'blocked';
  const locked = state === 'locked';
  // 150ms scale-in on pick (Web Animations; no-op where unsupported, e.g. jsdom)
  useEffect(() => {
    if (picked) ref.current?.animate?.([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
  }, [picked]);
  const fg = picked ? IQP.cream : IQP.ink;
  const muted = picked ? IQP.cream : IQP.inkSub;
  return (
    <button
      ref={ref}
      type="button"
      data-testid={`card-session-${s.id}`}
      data-state={state}
      disabled={blocked || locked}
      aria-pressed={picked}
      aria-label={`${weekdayOf(s.dateDubai)} ${dayNumber(s.dateDubai)}, ${s.startTime} to ${s.endTime}, ${s.venueName}${s.venueArea ? `, ${s.venueArea}` : ''} — ${caption}`}
      onClick={() => { if (!blocked && !locked) onToggle(s.id); }}
      style={{
        position: 'relative', display: 'grid', gridTemplateColumns: '4px 1fr', textAlign: 'left', padding: 0, overflow: 'hidden',
        flexGrow: 1, flexShrink: 1, flexBasis: mobile ? '100%' : '200px', maxWidth: mobile ? '100%' : 260, minHeight: 112,
        borderRadius: 8, border: `1px solid ${picked ? IQP.navy : IQP.line}`,
        background: picked ? IQP.navy : IQP.white, color: fg,
        opacity: blocked ? 0.4 : locked ? 0.6 : 1, cursor: blocked || locked ? 'default' : 'pointer', fontFamily: IQP_FONT,
      }}
    >
      <span data-testid={`rail-${s.id}`} style={{ width: 4, alignSelf: 'stretch', background: venueColour(s.venueName) }} />
      <span style={{ padding: '12px 14px 10px', display: 'grid', gap: 2, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span data-testid={`text-day-${s.id}`} style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>{dayNumber(s.dateDubai)}</span>
            <span data-testid={`text-weekday-${s.id}`} style={{ fontSize: 12, fontWeight: 600, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{weekdayOf(s.dateDubai)}</span>
          </span>
          {picked && <Tick id={s.id} />}
        </span>
        <span data-testid={`text-venue-${s.id}`} style={{ fontSize: 14, fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.venueName}</span>
        {s.venueArea ? <span data-testid={`text-area-${s.id}`} style={{ fontSize: 12, color: muted }}>{s.venueArea}</span> : null}
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span data-testid={`text-time-${s.id}`} style={{ fontSize: 13, fontWeight: 500 }}>{s.startTime}–{s.endTime}</span>
          <span data-testid={`text-caption-${s.id}`} style={{ fontSize: 12, color: muted, textAlign: 'right', whiteSpace: 'nowrap' }}>{caption}</span>
        </span>
      </span>
    </button>
  );
}

function SlotTile({ s, onRemove }: { s: PickerSession; onRemove: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // the tile lands in its slot with a 150ms scale-in
  useEffect(() => {
    ref.current?.animate?.([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
  }, []);
  const label = tileLabel(s.dateDubai, s.startTime);
  return (
    <button
      ref={ref}
      type="button"
      data-testid={`tile-${s.id}`}
      aria-label={`Remove ${label} · ${s.venueName}`}
      onClick={onRemove}
      style={{ width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 6, border: 'none', background: venueColour(s.venueName), color: VENUE_TILE_TEXT, fontFamily: IQP_FONT, fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {label}
    </button>
  );
}

export function IqPassPicker({ windowStart, windowEnd, sessions, picks, games, onToggle, onReview, canReview, reviewHint }: {
  windowStart: string;
  windowEnd: string;
  sessions: PickerSession[];
  picks: string[];
  games: number;
  onToggle: (id: string) => void;
  onReview: () => void;
  canReview: boolean;
  reviewHint: string;
}) {
  const width = useViewportWidth();
  const mobile = width <= MOBILE_MAX;
  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const pickedSessions = picks.map((id) => byId.get(id)).filter((s): s is PickerSession => !!s);
  const slotsFull = picks.length >= games;
  const weeks = useMemo(() => buildWeeks(windowStart, windowEnd).map((w) => ({
    ...w,
    sessions: sessions.filter((s) => s.dateDubai >= w.start && s.dateDubai <= w.end).sort((a, b) => a.dateDubai.localeCompare(b.dateDubai) || a.startTime.localeCompare(b.startTime)),
  })).filter((w) => w.sessions.length > 0), [windowStart, windowEnd, sessions]);

  return (
    <div style={{ display: 'grid', gap: 8, fontFamily: IQP_FONT }}>
      {/* slot bar — sticky under the header; becomes the Review bar when full */}
      <div data-testid="bar-slots" data-complete={slotsFull ? 'true' : 'false'}
        style={{ position: 'sticky', top: HEADER_HEIGHT, zIndex: 20, background: IQP.cream, padding: '10px 0 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: mobile ? 'wrap' : 'nowrap' }}>
        <div role="list" aria-label={`${games} game slots, ${picks.length} filled`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {Array.from({ length: games }, (_, i) => {
            const s = pickedSessions[i];
            return (
              <div key={i} role="listitem" data-testid={`slot-${i}`} data-filled={s ? 'true' : 'false'}
                style={{ flex: mobile ? '1 1 calc(50% - 4px)' : '0 0 auto', minWidth: 112, minHeight: 40, borderRadius: 6, display: 'grid', alignItems: 'stretch',
                  border: s ? 'none' : `1px dashed ${IQP.inkSub}`, background: s ? 'transparent' : IQP.white }}>
                {s ? <SlotTile s={s} onRemove={() => onToggle(s.id)} /> : <span style={{ alignSelf: 'center', textAlign: 'center', fontSize: 12, fontWeight: 600, color: IQP.inkSub }}>Game {i + 1}</span>}
              </div>
            );
          })}
        </div>
        {slotsFull && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexBasis: mobile ? '100%' : 'auto' }}>
            {reviewHint ? <span style={{ fontSize: 12, color: IQP.inkSub, flex: 1 }}>{reviewHint}</span> : null}
            <button type="button" data-testid="button-continue" disabled={!canReview} onClick={onReview} style={{ ...primaryBtn(!canReview), minWidth: 140, width: mobile ? '100%' : 'auto' }}>Review</button>
          </div>
        )}
      </div>

      {weeks.map((w) => (
        <section key={w.start} data-testid={`week-${w.start}`} style={{ borderTopWidth: 2, borderTopStyle: 'solid', borderTopColor: IQP.teal, paddingTop: 8, marginTop: 8 }}>
          <div data-testid={`text-week-${w.start}`} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: IQP.teal, marginBottom: 10 }}>{w.label}</div>
          <div data-testid={`row-${w.start}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {w.sessions.map((s) => {
              const { state, caption } = cardState(s, picks.includes(s.id), slotsFull);
              return <SessionCard key={s.id} s={s} state={state} caption={caption} mobile={mobile} onToggle={onToggle} />;
            })}
          </div>
        </section>
      ))}
      {weeks.length === 0 && <p style={{ margin: 0, fontSize: 14, color: IQP.inkSub }}>No sessions are open in this window yet.</p>}
    </div>
  );
}

/** The review screen's mini month: the window's weeks, picked days as venue-coloured tiles. */
export function MiniMonth({ windowStart, windowEnd, picks }: { windowStart: string; windowEnd: string; picks: PickerSession[] }) {
  const weeks = buildWeeks(windowStart, windowEnd);
  const byDay = new Map<string, PickerSession>();
  for (const p of picks) if (!byDay.has(p.dateDubai)) byDay.set(p.dateDubai, p);
  const seven: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 };
  return (
    <div data-testid="mini-month" aria-label="Your picks on the month" style={{ display: 'grid', gap: 4, fontFamily: IQP_FONT }}>
      <div style={seven}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} style={{ fontSize: 10, fontWeight: 700, color: IQP.inkSub, textAlign: 'center' }}>{d}</span>)}
      </div>
      {weeks.map((w) => (
        <div key={w.start} data-testid={`mini-week-${w.start}`} style={seven}>
          {w.days.map((d) => {
            const p = byDay.get(d.ymd);
            return p ? (
              <span key={d.ymd} data-testid={`mini-tile-${p.id}`} aria-label={`${tileLabel(p.dateDubai, p.startTime)} · ${p.venueName}`}
                style={{ height: 30, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: venueColour(p.venueName), color: VENUE_TILE_TEXT }}>{dayNumber(d.ymd)}</span>
            ) : (
              <span key={d.ymd} data-testid={`mini-day-${d.ymd}`} style={{ height: 30, display: 'grid', placeItems: 'center', fontSize: 12, color: IQP.inkSub, opacity: d.inWindow ? 1 : 0.35 }}>{dayNumber(d.ymd)}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
