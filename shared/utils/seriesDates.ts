// Weekly-recurrence date maths, done entirely on 'YYYY-MM-DD' strings.
//
// WHY STRINGS: sessions.date and bookable_sessions.date are `timestamp WITHOUT
// time zone` — they hold a naive calendar day at 00:00. The moment such a value
// becomes a JS Date it acquires the *reader's* timezone: on a UTC+4 machine
// `2026-08-14 00:00` reads back as `2026-08-13T20:00Z`, one UTC day early. That
// off-by-one already cost a full wrong analysis once. So nothing here ever
// parses a date string into a local Date, and nothing calls a local getter —
// all arithmetic is explicit UTC component math via Date.UTC, which is a pure
// integer calculation with no zone attached.
//
// Shared deliberately: the wizard preview ("Creates: 26 Aug, 2 Sep…") and the
// server generator must agree exactly, so they compute from the same functions.

export const SERIES_WEEKS_MIN = 4;
export const SERIES_WEEKS_MAX = 8;
export const SERIES_WEEKS_DEFAULT = 4;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Splits a strict ISO date into its integer parts, or throws. Anything looser
 *  (a timestamp, a d-m-y string, a single-digit month) is rejected rather than
 *  coerced — a silently mis-parsed date would create sessions on wrong days. */
function parts(iso: string): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(String(iso));
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${iso}"`);
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  // Round-trip check: catches 2026-02-30 and friends, which Date.UTC would
  // silently roll forward into March.
  const utc = Date.UTC(y, m - 1, d);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== m || back.getUTCDate() !== d) {
    throw new Error(`Not a real calendar date: "${iso}"`);
  }
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (utcMs: number): string => {
  const t = new Date(utcMs);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** 'Tuesday' for the given calendar day, independent of the reader's timezone. */
export function weekdayName(iso: string): string {
  const { y, m, d } = parts(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Calendar addition of whole weeks. Adding days (not hours) is what keeps the
 *  weekday stable across any DST changeover — Dubai has none, but a reader
 *  elsewhere must get the same answer. */
export function addWeeksToISODate(iso: string, weeks: number): string {
  const { y, m, d } = parts(iso);
  return toISO(Date.UTC(y, m - 1, d + weeks * 7));
}

/** The dates a series will CREATE: weeks 1..n after the anchor. The anchor is
 *  excluded — that session already exists, made by the normal create path. */
export function seriesDates(anchorIso: string, weeksAhead: number): string[] {
  if (!Number.isInteger(weeksAhead) || weeksAhead < SERIES_WEEKS_MIN || weeksAhead > SERIES_WEEKS_MAX) {
    throw new Error(`weeksAhead must be an integer between ${SERIES_WEEKS_MIN} and ${SERIES_WEEKS_MAX}, got ${weeksAhead}`);
  }
  const out: string[] = [];
  for (let w = 1; w <= weeksAhead; w++) out.push(addWeeksToISODate(anchorIso, w));
  return out;
}

/** '26 Aug' — the short form in the wizard's "Creates:" confirmation line. */
export function formatPreviewDate(iso: string): string {
  const { y: _y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** 'Repeat every Tuesday' / 'for the next 4 Tuesdays' — one place, so the
 *  toggle label and the count label can never disagree about the weekday. */
export function repeatLabel(anchorIso: string): string {
  return `Repeat every ${weekdayName(anchorIso)}`;
}
export function repeatCountLabel(anchorIso: string, weeksAhead: number): string {
  return `for the next ${weeksAhead} ${weekdayName(anchorIso)}s`;
}
