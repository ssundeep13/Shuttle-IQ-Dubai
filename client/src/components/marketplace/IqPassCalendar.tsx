// IQ Pass calendar — one component, two modes (Gates 9 + 10).
//   pick: the purchase picker. Every session in the rolling 4-week window is a chip
//         ("Smash 20:00"); tap to pick, picked chips go navy, chips past the 50% pack
//         cap (or full / already booked) are greyed with a tooltip.
//   read: My Bookings. One dot per booked session, coloured by venue; a day is a
//         button that opens that day's booking cards.
// Wide (>= 640 px): a Mon–Sun grid, one labelled row per week. Narrow: a week strip,
// one week at a time, swipe or arrows. IQ Pass tokens only, Inter, no icons, no emoji.
import { useEffect, useMemo, useState } from 'react';
import { IQP, IQP_FONT, IQP_VENUE_PALETTE } from '@/lib/iqPassTokens';

export type CalendarItemState = 'pickable' | 'picked' | 'blocked';
export type CalendarItem = {
  id: string;
  /** 'YYYY-MM-DD' in Asia/Dubai */
  ymd: string;
  /** chip text, e.g. "Smash 20:00" */
  label: string;
  state?: CalendarItemState;
  /** tooltip for a blocked chip, e.g. "Pass seats full" */
  blockedReason?: string;
  /** read mode: dot colour (venueColour) */
  colour?: string;
};
export type CalendarDay = { ymd: string; inWindow: boolean };
export type CalendarWeek = { start: string; end: string; label: string; days: CalendarDay[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MS = 86_400_000;
/** Widths at or below this get the week strip instead of the grid. */
export const NARROW_MAX = 639;
/** Widths at or below this show the app's fixed bottom nav (md:hidden). */
export const BOTTOM_NAV_MAX = 767;

const parseYmd = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toYmd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (ymd: string): number => { const ms = parseYmd(ymd); const dow = (new Date(ms).getUTCDay() + 6) % 7; return ms - dow * DAY_MS; };
const dayNumber = (ymd: string): number => Number(ymd.slice(8, 10));
const weekdayOf = (ymd: string): string => WEEKDAYS[(new Date(parseYmd(ymd)).getUTCDay() + 6) % 7];

/** "14–20 Sep" or "28 Sep–4 Oct". */
export function weekLabel(start: string, end: string): string {
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  return sm === em ? `${sd}–${ed} ${MONTHS[sm - 1]}` : `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`;
}

/** Mon–Sun rows covering [start, end]; days outside the window are flagged, never dropped. */
export function buildWeeks(start: string, end: string): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  const last = parseYmd(end);
  for (let ws = mondayOf(start); ws <= last; ws += 7 * DAY_MS) {
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => { const ymd = toYmd(ws + i * DAY_MS); return { ymd, inWindow: ymd >= start && ymd <= end }; });
    weeks.push({ start: days[0].ymd, end: days[6].ymd, label: weekLabel(days[0].ymd, days[6].ymd), days });
  }
  return weeks;
}

const VENUE_STOP_WORDS = new Set(['sports', 'sport', 'academy', 'school', 'dubai', 'llc', 'club', 'center', 'centre', 'complex', 'arena', 'hall', 'the', 'of', 'and', 'courts', 'court', 'badminton']);
/** "Smash Sports Academy" → "Smash"; "Bright Riders School Dubai" → "Bright Riders". */
export function shortVenue(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const kept = words.filter((w) => !VENUE_STOP_WORDS.has(w.toLowerCase().replace(/[^a-z&]/g, '')));
  const out = (kept.length ? kept.slice(0, 2) : [words[0]]).join(' ');
  return out.length > 16 ? `${out.slice(0, 15).trimEnd()}…` : out;
}

/** Stable per-venue colour from the token palette. */
export function venueColour(name: string): string {
  let h = 0;
  for (const ch of String(name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IQP_VENUE_PALETTE[h % IQP_VENUE_PALETTE.length];
}

/** Live viewport width (jsdom: window.innerWidth, default 1024). */
export function useViewportWidth(): number {
  const read = () => (typeof window === 'undefined' ? 1024 : window.innerWidth);
  const [width, setWidth] = useState<number>(read);
  useEffect(() => {
    const onResize = () => setWidth(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

type Props = {
  mode: 'pick' | 'read';
  windowStart: string;
  windowEnd: string;
  items: CalendarItem[];
  onPick?: (id: string) => void;
  onDay?: (ymd: string) => void;
  selectedDay?: string | null;
  /** 'YYYY-MM-DD' Dubai — highlighted, and the strip opens on its week */
  today?: string | null;
  legend?: Array<{ label: string; colour: string }>;
  /** force the strip / grid (tests); otherwise from the viewport width */
  narrow?: boolean;
};

const numberStyle = (inWindow: boolean, isToday: boolean): React.CSSProperties => ({
  fontFamily: IQP_FONT, fontSize: 12, fontWeight: isToday ? 700 : 600, lineHeight: 1, color: !inWindow ? IQP.inkSub : isToday ? IQP.teal : IQP.inkSub,
});

export function IqPassCalendar({ mode, windowStart, windowEnd, items, onPick, onDay, selectedDay, today, legend, narrow }: Props) {
  const width = useViewportWidth();
  const isNarrow = narrow ?? width <= NARROW_MAX;
  const weeks = useMemo(() => buildWeeks(windowStart, windowEnd), [windowStart, windowEnd]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) { const l = m.get(it.ymd) ?? []; l.push(it); m.set(it.ymd, l); }
    return m;
  }, [items]);
  const focusYmd = selectedDay ?? today ?? null;
  const [weekIdx, setWeekIdx] = useState<number>(() => {
    const i = focusYmd ? weeks.findIndex((w) => focusYmd >= w.start && focusYmd <= w.end) : -1;
    return i >= 0 ? i : 0;
  });
  useEffect(() => { setWeekIdx((i) => Math.min(i, Math.max(0, weeks.length - 1))); }, [weeks.length]);
  const [touchX, setTouchX] = useState<number | null>(null);

  const chip = (it: CalendarItem) => {
    const picked = it.state === 'picked';
    const blocked = it.state === 'blocked';
    return (
      <button
        key={it.id}
        type="button"
        data-testid={`chip-${it.id}`}
        data-state={it.state ?? 'pickable'}
        disabled={blocked}
        aria-pressed={picked}
        title={blocked ? it.blockedReason : undefined}
        aria-label={blocked && it.blockedReason ? `${it.label} — ${it.blockedReason}` : it.label}
        onClick={() => { if (!blocked) onPick?.(it.id); }}
        style={{
          display: 'block', width: '100%', textAlign: 'left', minHeight: 30, padding: '5px 8px', borderRadius: 5,
          fontFamily: IQP_FONT, fontSize: 12, fontWeight: 600, lineHeight: 1.25, cursor: blocked ? 'default' : 'pointer',
          backgroundColor: picked ? IQP.navy : blocked ? IQP.cream : IQP.white,
          color: picked ? IQP.white : blocked ? IQP.inkSub : IQP.navy,
          border: `1px solid ${picked ? IQP.navy : IQP.line}`, opacity: blocked ? 0.65 : 1,
        }}
      >
        {it.label}
      </button>
    );
  };

  const dot = (it: CalendarItem) => (
    <span key={it.id} data-testid={`dot-${it.id}`} title={it.label} aria-label={it.label}
      style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, backgroundColor: it.colour ?? IQP.navy }} />
  );

  // A day cell (grid) or a day row (strip). Pick mode: a plain box with chips.
  // Read mode: a button that opens the day (disabled when nothing is booked).
  const day = (d: CalendarDay, layout: 'cell' | 'row') => {
    const list = d.inWindow ? byDay.get(d.ymd) ?? [] : [];
    const empty = list.length === 0;
    const isToday = !!today && today === d.ymd;
    const selected = !!selectedDay && selectedDay === d.ymd;
    const base: React.CSSProperties = {
      fontFamily: IQP_FONT, borderRadius: 6, border: `1px solid ${selected ? IQP.navy : IQP.line}`,
      backgroundColor: empty ? IQP.cream : IQP.white, opacity: d.inWindow ? 1 : 0.45,
      boxShadow: selected ? `inset 0 0 0 1px ${IQP.navy}` : undefined,
    };
    const label = layout === 'row' ? `${weekdayOf(d.ymd)} ${dayNumber(d.ymd)}` : String(dayNumber(d.ymd));
    const attrs = { 'data-testid': `day-${d.ymd}`, 'data-empty': String(empty), 'data-outside': String(!d.inWindow) } as const;
    if (mode === 'read') {
      return (
        <button
          key={d.ymd} type="button" {...attrs} disabled={empty} aria-pressed={selected}
          aria-label={`${weekdayOf(d.ymd)} ${dayNumber(d.ymd)}${empty ? '' : `, ${list.length} booking${list.length === 1 ? '' : 's'}`}`}
          onClick={() => { if (!empty) onDay?.(d.ymd); }}
          style={{ ...base, cursor: empty ? 'default' : 'pointer', textAlign: 'left', padding: layout === 'row' ? '10px 12px' : 6,
            minHeight: layout === 'row' ? 44 : 64, display: 'flex', flexDirection: layout === 'row' ? 'row' : 'column', alignItems: layout === 'row' ? 'center' : 'flex-start', gap: 8, width: '100%' }}
        >
          <span style={{ ...numberStyle(d.inWindow, isToday), minWidth: layout === 'row' ? 52 : undefined }}>{label}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>{list.map(dot)}</span>
        </button>
      );
    }
    return (
      <div key={d.ymd} {...attrs}
        style={{ ...base, padding: layout === 'row' ? '8px 10px' : 6, minHeight: layout === 'row' ? 44 : 96,
          display: layout === 'row' ? 'flex' : 'grid', alignItems: layout === 'row' ? 'flex-start' : undefined, gap: layout === 'row' ? 10 : 4, alignContent: 'start' }}>
        <span style={{ ...numberStyle(d.inWindow, isToday), minWidth: layout === 'row' ? 52 : undefined, paddingTop: layout === 'row' ? 8 : 0 }}>{label}</span>
        {layout === 'row'
          ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>{list.map((it) => <span key={it.id} style={{ flex: '0 1 auto', minWidth: 118 }}>{chip(it)}</span>)}</span>
          : list.map(chip)}
      </div>
    );
  };

  const legendBlock = legend && legend.length > 0 ? (
    <div data-testid="legend-iqp-calendar" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10, fontFamily: IQP_FONT, fontSize: 12, color: IQP.inkSub }}>
      {legend.map((l) => (
        <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, backgroundColor: l.colour }} />
          {l.label}
        </span>
      ))}
    </div>
  ) : null;

  if (isNarrow) {
    const week = weeks[Math.min(weekIdx, weeks.length - 1)];
    const arrow = (dir: -1 | 1, disabled: boolean, text: string, testid: string) => (
      <button type="button" data-testid={testid} disabled={disabled} onClick={() => setWeekIdx((i) => Math.max(0, Math.min(weeks.length - 1, i + dir)))}
        aria-label={dir < 0 ? 'Previous week' : 'Next week'}
        style={{ minHeight: 40, minWidth: 64, padding: '0 12px', borderRadius: 6, border: `1px solid ${IQP.line}`, backgroundColor: IQP.white, color: IQP.navy,
          fontFamily: IQP_FONT, fontWeight: 600, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
        {text}
      </button>
    );
    return (
      <div data-testid="iqp-calendar-strip" style={{ fontFamily: IQP_FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {arrow(-1, weekIdx <= 0, 'Prev', 'button-week-prev')}
          <div data-testid="text-week-label" aria-live="polite" style={{ fontWeight: 700, fontSize: 14, color: IQP.navy, textAlign: 'center' }}>{week?.label ?? ''}</div>
          {arrow(1, weekIdx >= weeks.length - 1, 'Next', 'button-week-next')}
        </div>
        {week && (
          <div
            data-testid={`week-panel-${week.start}`}
            onTouchStart={(e) => setTouchX(e.touches?.[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const endX = e.changedTouches?.[0]?.clientX;
              if (touchX === null || endX === undefined) return;
              const delta = endX - touchX;
              if (delta > 40) setWeekIdx((i) => Math.max(0, i - 1));
              else if (delta < -40) setWeekIdx((i) => Math.min(weeks.length - 1, i + 1));
              setTouchX(null);
            }}
            style={{ display: 'grid', gap: 6, marginTop: 10, touchAction: 'pan-y' }}
          >
            {week.days.map((d) => day(d, 'row'))}
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 12, color: IQP.inkSub, textAlign: 'center' }}>Swipe or use the arrows to change week.</p>
        {legendBlock}
      </div>
    );
  }

  const seven: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 };
  return (
    <div data-testid="iqp-calendar-grid" style={{ fontFamily: IQP_FONT }}>
      <div style={seven}>
        {WEEKDAYS.map((w) => (
          <div key={w} data-testid={`weekday-${w}`} style={{ fontSize: 12, fontWeight: 700, color: IQP.inkSub, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week.start} data-testid={`week-row-${week.start}`} style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: IQP.navy }}>{week.label}</div>
          <div style={seven}>{week.days.map((d) => day(d, 'cell'))}</div>
        </div>
      ))}
      {legendBlock}
    </div>
  );
}
