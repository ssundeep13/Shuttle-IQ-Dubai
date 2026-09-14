// IQ Pass date helpers shared by the picker, the review mini-month and My games.
// Everything is 'YYYY-MM-DD' in Asia/Dubai; no timezone maths beyond the fixed +4.
export type CalendarDay = { ymd: string; inWindow: boolean };
export type CalendarWeek = { start: string; end: string; label: string; days: CalendarDay[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MS = 86_400_000;
const H_MS = 3_600_000;

export const parseYmd = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const toYmd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const ymdOf = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
/** 'YYYY-MM-DD' for now in Asia/Dubai (UTC+4, no DST). */
export const todayDubai = (now = Date.now()): string => new Date(now + 4 * H_MS).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number): string => toYmd(parseYmd(ymd) + n * DAY_MS);
export const dayNumber = (ymd: string): number => Number(ymd.slice(8, 10));
/** 'Mon' … 'Sun' */
export const weekdayOf = (ymd: string): string => WEEKDAYS[(new Date(parseYmd(ymd)).getUTCDay() + 6) % 7];
/** 'M' … 'S' (the strip's day letter) */
export const dayLetter = (ymd: string): string => weekdayOf(ymd)[0];
export const monthShort = (ymd: string): string => MONTHS[Number(ymd.slice(5, 7)) - 1];
export const mondayOf = (ymd: string): string => { const ms = parseYmd(ymd); const dow = (new Date(ms).getUTCDay() + 6) % 7; return toYmd(ms - dow * DAY_MS); };

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
  for (let ws = parseYmd(mondayOf(start)); ws <= last; ws += 7 * DAY_MS) {
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => { const ymd = toYmd(ws + i * DAY_MS); return { ymd, inWindow: ymd >= start && ymd <= end }; });
    weeks.push({ start: days[0].ymd, end: days[6].ymd, label: weekLabel(days[0].ymd, days[6].ymd), days });
  }
  return weeks;
}

/** "Mon 14 · 20:00" — the slot-tile / strip label. */
export const tileLabel = (ymd: string, startTime: string): string => `${weekdayOf(ymd)} ${dayNumber(ymd)} · ${startTime}`;

const VENUE_STOP_WORDS = new Set(['sports', 'sport', 'academy', 'school', 'dubai', 'llc', 'club', 'center', 'centre', 'complex', 'arena', 'hall', 'the', 'of', 'and', 'courts', 'court', 'badminton']);
/** "Smash Sports Academy" → "Smash"; "Bright Riders School Dubai" → "Bright Riders". */
export function shortVenue(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const kept = words.filter((w) => !VENUE_STOP_WORDS.has(w.toLowerCase().replace(/[^a-z&]/g, '')));
  const out = (kept.length ? kept.slice(0, 2) : [words[0]]).join(' ');
  return out.length > 16 ? `${out.slice(0, 15).trimEnd()}…` : out;
}

/** "in 27h" / "in 45m" / "in 3d" — the live countdown to a game. */
export function countdownLabel(startMs: number, now = Date.now()): string {
  const diff = startMs - now;
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)}m`;
  const hours = Math.round(diff / H_MS);
  if (hours < 72) return `in ${hours}h`;
  return `in ${Math.round(diff / DAY_MS)}d`;
}
