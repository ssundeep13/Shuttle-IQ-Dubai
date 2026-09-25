// Birthday free game — offer, consume and restore (Sandeep, 2026-09-25; decisions 1–5 + the amendment).
//
//   offer    decideBirthdayOffer: free only in the window (Dubai date), with the marker clear, and while no live free
//            booking already holds this window. The booking stores the window key; the partial unique index
//            uq_bookings_one_live_birthday decides a race, and the loser gets BIRTHDAY_ALREADY_BOOKED (409), never a charge.
//   consume  consumeBirthdayDiscount on every confirm path: the marker is set together with the booking that set it.
//   restore  restoreBirthdayDiscount on every cancel of a free slot: outside the 5-hour cutoff and while the window is
//            open, clear the marker ONLY if this booking set it. A booking that stays live for its guests also gives
//            up its window key (the amendment), so the player can book their free game again.
//
// Pure over injected deps — production passes birthdayStore(tx) from server/storage.ts; tests pass an in-memory store.
import { birthdayWindowKey, dubaiCalendarDate, isBirthdayDiscountAvailable, isInBirthdayWindow, type BirthdayUser } from "@shared/birthday";

export const BIRTHDAY_UNIQUE_INDEX = 'uq_bookings_one_live_birthday';
export const BIRTHDAY_ALREADY_BOOKED = 'Your free birthday game is already booked';

export interface BirthdayBookingRef {
  id: string;
  userId: string;
  birthdayDiscountApplied: boolean;
}

export interface BirthdayStore {
  hasLiveBirthdayBooking(userId: string, windowKey: string): Promise<boolean>;
  setMarker(userId: string, bookingId: string, at: Date): Promise<void>;
  /** Clears the marker only where it belongs to `bookingId`; true when a row was cleared. */
  clearMarker(userId: string, bookingId: string): Promise<boolean>;
  releaseWindowKey(bookingId: string): Promise<void>;
}

/** A unique violation on the one-live-free-booking rule (drizzle 0.39 throws the pg error; newer ones wrap it). */
export function isBirthdayConflict(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } } | null;
  if (!e || typeof e !== 'object') return false;
  if (e.code === '23505' && e.constraint === BIRTHDAY_UNIQUE_INDEX) return true;
  return e.cause?.code === '23505' && e.cause?.constraint === BIRTHDAY_UNIQUE_INDEX;
}

export async function decideBirthdayOffer(
  user: BirthdayUser & { id: string },
  now: Date,
  deps: Pick<BirthdayStore, 'hasLiveBirthdayBooking'>,
): Promise<{ applied: boolean; windowKey: string | null }> {
  const none = { applied: false, windowKey: null };
  if (!isBirthdayDiscountAvailable(user, now)) return none;
  const windowKey = birthdayWindowKey(user, dubaiCalendarDate(now));
  if (!windowKey) return none;
  // A pending free booking (e.g. one with guests awaiting payment) has not set the marker yet — it still holds the window.
  if (await deps.hasLiveBirthdayBooking(user.id, windowKey)) return none;
  return { applied: true, windowKey };
}

export async function consumeBirthdayDiscount(
  booking: BirthdayBookingRef,
  at: Date,
  deps: Pick<BirthdayStore, 'setMarker'>,
): Promise<void> {
  if (!booking.birthdayDiscountApplied) return;
  await deps.setMarker(booking.userId, booking.id, at);
}

export type BirthdayRestoreReason = 'restored' | 'late' | 'window_closed' | 'not_free_slot' | 'not_this_booking';

export async function restoreBirthdayDiscount(
  input: {
    booking: BirthdayBookingRef;
    /** The cancelled slot is the booker's own (the free one). A whole-booking cancel passes true. */
    slotIsPrimary: boolean;
    /** Inside the 5-hour cutoff (or already played) — the free game is used up. */
    withinLateWindow: boolean;
    /** The booking stays live for its guests (per-slot cancel of the primary's own slot). */
    bookingStaysLive: boolean;
    user: BirthdayUser;
    now: Date;
  },
  deps: Pick<BirthdayStore, 'clearMarker' | 'releaseWindowKey'>,
): Promise<{ restored: boolean; reason: BirthdayRestoreReason }> {
  const { booking } = input;
  // canRestoreBirthdayDiscount (shared/birthday.ts, also behind the My games copy), split out to name the reason.
  if (!booking.birthdayDiscountApplied || !input.slotIsPrimary) return { restored: false, reason: 'not_free_slot' };
  if (input.withinLateWindow) return { restored: false, reason: 'late' };
  if (!isInBirthdayWindow(input.user, dubaiCalendarDate(input.now))) return { restored: false, reason: 'window_closed' };
  if (!(await deps.clearMarker(booking.userId, booking.id))) return { restored: false, reason: 'not_this_booking' };
  if (input.bookingStaysLive) await deps.releaseWindowKey(booking.id);
  return { restored: true, reason: 'restored' };
}
