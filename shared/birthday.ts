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
// within the last RESET_DAYS (≈ once a year).
export function isBirthdayDiscountAvailable(user: BirthdayUser, date: Date): boolean {
  if (!isInBirthdayWindow(user, date)) return false;
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
