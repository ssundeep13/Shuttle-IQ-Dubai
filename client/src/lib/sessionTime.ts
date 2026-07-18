// Gate F3.6 — Dubai-explicit session time logic. This codebase has a known
// timezone-artifact bug class: session `date` arrives as an ISO instant like
// 2026-07-17T20:00:00Z, which IS July 18 in Dubai — any `.slice(0, 10)` or
// device-local Date math gets the calendar day wrong. These helpers derive
// the calendar date IN Asia/Dubai and build instants with the explicit +04:00
// offset (Dubai has no DST), so results are identical on any device timezone.
//
// Interim display logic only: F5's real session-close trigger replaces the
// clock comparison later.

const dubaiDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dubai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date (YYYY-MM-DD) of an instant, as seen in Dubai. */
export function dubaiCalendarDate(instant: Date | string): string | null {
  const d = new Date(instant);
  if (isNaN(d.getTime())) return null;
  return dubaiDateFmt.format(d); // en-CA formats as YYYY-MM-DD
}

function normalizeTime(t: string): string | null {
  const m = (t ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * The exact UTC instant a session ends: its Dubai calendar date + end_time
 * at +04:00, rolled forward a day for overnight sessions (end < start).
 * Null when inputs are unparseable — callers treat that as "not over"
 * (never hide a live session on bad data).
 */
export function sessionEndInstant(dateIso: Date | string, startTime: string, endTime: string): Date | null {
  const day = dubaiCalendarDate(dateIso);
  const end = normalizeTime(endTime);
  if (!day || !end) return null;
  const instant = new Date(`${day}T${end}:00+04:00`);
  if (isNaN(instant.getTime())) return null;
  const start = normalizeTime(startTime);
  if (start && end < start) {
    return new Date(instant.getTime() + 24 * 60 * 60 * 1000); // overnight session
  }
  return instant;
}

/** True once the session's end time has passed (Dubai clock). */
export function isSessionOver(
  dateIso: Date | string,
  startTime: string,
  endTime: string,
  nowMs: number = Date.now(),
): boolean {
  const end = sessionEndInstant(dateIso, startTime, endTime);
  return end ? nowMs > end.getTime() : false;
}
