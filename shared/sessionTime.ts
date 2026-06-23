// Timezone-explicit session-start instant. Sessions are scheduled in the
// venue's LOCAL time — Asia/Dubai (UTC+4, no DST) — but `bookable_sessions.date`
// is a date-only value (stored as that Dubai calendar day's midnight) and
// `startTime` is an "HH:MM" Dubai-local string.
//
// The old code did `new Date(date); setHours(startTime)`, which resolves in the
// HOST's local timezone — so the same session anchored to two different instants
// on the UTC server vs a Dubai browser, and the 5-hour refund cutoff disagreed
// by 4 hours (P0-3). This helper removes that ambiguity: it takes ONLY the
// Y-M-D from the date's UTC components (never local string parsing, which would
// re-introduce the column skew), combines it with the HH:MM start time as
// Asia/Dubai local time, and converts to a UTC epoch. Both client and server
// import this, so display and enforcement compute the identical instant.
//
// Mirrors the `Date.UTC(...)` UTC-safe pattern in shared/birthday.ts.
//
// NOTE: the −4h offset hardcodes Asia/Dubai (no DST). Revisit if venues ever
// span timezones — switch to a timezone-aware construction keyed on the venue.
const DUBAI_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Session-start as a UTC epoch in milliseconds.
 * @param date      bookable_sessions.date (Date or ISO string) — only its Y-M-D is used
 * @param startTime "HH:MM" in Asia/Dubai local time
 */
export function sessionStartEpochMs(date: Date | string, startTime: string): number {
  const d = new Date(date);
  const [hours, minutes] = startTime.split(':').map(Number);
  // Y-M-D from the date's UTC calendar day (the value is Dubai-midnight stored
  // as UTC), then add the Dubai-local time-of-day and shift to UTC.
  const utcMidnightOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return utcMidnightOfDay + (hours * 60 + minutes) * 60 * 1000 - DUBAI_UTC_OFFSET_MS;
}
