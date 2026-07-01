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

/**
 * Session duration in DECIMAL HOURS from the two "HH:MM" Dubai-local time strings
 * (e.g. "18:00","21:00" → 3; "18:30","21:00" → 2.5; "20:00","22:15" → 2.25).
 *
 * Same-day assumption. start and end are on the SAME Dubai calendar day, so the
 * Asia/Dubai UTC+4 offset cancels out of the DIFFERENCE — duration is offset-
 * independent — and we compute it straight from the HH:MM minute-of-day values.
 * (sessionStartEpochMs handles the absolute instant, where the offset matters.)
 *
 * We do NOT silently wrap past midnight: if endTime <= startTime (or either string
 * is unparseable) this returns NaN and logs an error, so a bad/cross-midnight
 * session surfaces loudly instead of producing a wrong cost. If real cross-midnight
 * sessions ever appear, add explicit next-day handling keyed on the venue.
 *
 * @param startTime "HH:MM" in Asia/Dubai local time
 * @param endTime   "HH:MM" in Asia/Dubai local time
 */
export function sessionDurationHours(startTime: string, endTime: string): number {
  const toMinutes = (t: string): number => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    console.error(
      `[sessionDurationHours] non-positive/invalid duration: start="${startTime}" ` +
      `end="${endTime}" → NaN (no midnight wrap).`,
    );
    return NaN;
  }
  return (endMin - startMin) / 60;
}
