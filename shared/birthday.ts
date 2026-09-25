// Shared birthday-window + discount-availability logic. Used by the booking
// endpoint (enforcement), the checkout UI (summary line), the scheduler email,
// and the admin check-in tag — one source of truth, no client/server drift.
export interface BirthdayUser {
  birthDay?: number | null;
  birthMonth?: number | null;
  birthYear?: number | null;
  birthdayDiscountUsedAt?: Date | string | null;
}

export const BIRTHDAY_WINDOW_DAYS = 4;
const RESET_DAYS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000; // Asia/Dubai is UTC+4 all year (no DST)

// The Asia/Dubai calendar day of `now`, as the UTC midnight the functions below read. Pass this, not the raw
// instant, wherever the window decides something: the raw instant keeps the window open until 04:00 Dubai the day
// after it ends.
export function dubaiCalendarDate(now: Date): Date {
  const d = new Date(now.getTime() + DUBAI_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// The anchor birthday (YYYY-MM-DD) of the window `date` falls in, or null outside every window / with no birthday.
// A free booking stores it, and the database allows one live free booking per (user, key). Pass a Dubai calendar
// date. The backfill in scripts/one-shot/2026-09-25-birthday-restore-v1.mts computes the same key in SQL.
export function birthdayWindowKey(user: BirthdayUser, date: Date): string | null {
  if (!user.birthDay || !user.birthMonth) return null;
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const y = date.getUTCFullYear();
  for (const yr of [y - 1, y, y + 1]) {
    const bday = Date.UTC(yr, user.birthMonth - 1, user.birthDay);
    if (Math.abs(d - bday) <= BIRTHDAY_WINDOW_DAYS * DAY_MS) return new Date(bday).toISOString().slice(0, 10);
  }
  return null;
}

// Does cancelling this slot give the free game back? Only the free (primary) slot of a free booking, cancelled
// outside the 5-hour cutoff, while the window is still open on the Dubai date. The marker itself is cleared only
// when it belongs to this booking — see server/birthdayRestore.ts.
export function canRestoreBirthdayDiscount(input: {
  bookingFlagged: boolean;
  slotIsPrimary: boolean;
  withinLateWindow: boolean;
  user: BirthdayUser;
  now: Date;
}): boolean {
  return input.bookingFlagged && input.slotIsPrimary && !input.withinLateWindow
    && isInBirthdayWindow(input.user, dubaiCalendarDate(input.now));
}

// True if `date` is within BIRTHDAY_WINDOW_DAYS before OR after the user's
// birthday (year ignored). Anchors the birthday in the prev/current/next year
// so the Dec/Jan wraparound works (e.g. Jan 1 birthday → window covers
// Dec 28 … Jan 5). All math in UTC, date-only, to avoid timezone drift.
export function isInBirthdayWindow(user: BirthdayUser, date: Date): boolean {
  if (!user.birthDay || !user.birthMonth) return false;
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const y = date.getUTCFullYear();
  for (const yr of [y - 1, y, y + 1]) {
    const bday = Date.UTC(yr, user.birthMonth - 1, user.birthDay);
    if (Math.abs(d - bday) <= BIRTHDAY_WINDOW_DAYS * DAY_MS) return true;
  }
  return false;
}

// True if the birthday free-game discount is available: in-window AND not used
// within the last RESET_DAYS (≈ once a year). The window is judged on the Dubai
// calendar date of `date`; the reset on the instant itself.
export function isBirthdayDiscountAvailable(user: BirthdayUser, date: Date): boolean {
  if (!isInBirthdayWindow(user, dubaiCalendarDate(date))) return false;
  if (!user.birthdayDiscountUsedAt) return true;
  const used = new Date(user.birthdayDiscountUsedAt).getTime();
  return date.getTime() - used > RESET_DAYS * DAY_MS;
}

// Whole days until the user's next birthday from `date` (0 = today). null if
// day/month not set.
export function daysUntilBirthday(user: BirthdayUser, date: Date): number | null {
  if (!user.birthDay || !user.birthMonth) return null;
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  for (const yr of [date.getUTCFullYear(), date.getUTCFullYear() + 1]) {
    const bday = Date.UTC(yr, user.birthMonth - 1, user.birthDay);
    if (bday >= today) return Math.round((bday - today) / DAY_MS);
  }
  return null;
}

// [from, to] window dates around the birthday nearest to `date` (for the
// reminder email + UI copy). Returns UTC dates.
export function birthdayWindowRange(user: BirthdayUser, date: Date): { from: Date; to: Date } | null {
  if (!user.birthDay || !user.birthMonth) return null;
  const y = date.getUTCFullYear();
  let nearest = 0, best = Infinity;
  for (const yr of [y - 1, y, y + 1]) {
    const bday = Date.UTC(yr, user.birthMonth - 1, user.birthDay);
    const dist = Math.abs(date.getTime() - bday);
    if (dist < best) { best = dist; nearest = bday; }
  }
  return { from: new Date(nearest - BIRTHDAY_WINDOW_DAYS * DAY_MS), to: new Date(nearest + BIRTHDAY_WINDOW_DAYS * DAY_MS) };
}
