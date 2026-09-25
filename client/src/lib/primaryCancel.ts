import { sessionStartEpochMs } from '@shared/sessionTime';
import { birthdayWindowRange, canRestoreBirthdayDiscount, dubaiCalendarDate, isInBirthdayWindow, type BirthdayUser } from '@shared/birthday';

/**
 * Option A Gate 4 — visibility + display math for the "Cancel my spot"
 * action. Mirrors the SERVER's settle exactly (guestSlotRefund.ts):
 *   chargeableSpots = birthday ? max(1, spots-1) : max(1, spots)
 *   spotValueFils   = round(amountAed*100 / chargeableSpots)
 * so the AED shown is the AED settled. The birthday primary's slot is the
 * free one → AED 0 and no refund choice.
 *
 * Visibility (ALL must hold):
 *  - booking is the viewer's own (not a guest view), status 'confirmed',
 *    session not ended, not checked in (server would 400 anyway);
 *  - the viewer's isPrimary row EXISTS and is active — legacy no-row
 *    bookings NEVER show this action (unlike primarySlotActive's no-row=
 *    active display rule, an explicit row is required to cancel it);
 *  - at least one guest slot is still active (otherwise the existing
 *    whole-booking Cancel is the right tool and remains unchanged).
 */
export interface PrimaryCancelBookingShape {
  status: string;
  attendedAt?: string | Date | null;
  isGuestBooking?: boolean;
  amountAed: number;
  spotsBooked: number | null;
  birthdayDiscountApplied?: boolean;
  session: { date: string | Date; startTime: string; endTime?: string | null };
  guests?: Array<{ id: string; isPrimary: boolean; status: string }> | null;
}

export interface PrimaryCancelInfo {
  visible: boolean;
  primarySlotId: string | null;
  /** birthday booking — the primary's slot was never charged */
  freeSlot: boolean;
  within5h: boolean;
  /** the prorated share the server will settle (0 for a free slot) */
  refundAed: number;
}

export function primaryCancelInfo(
  booking: PrimaryCancelBookingShape,
  now: Date = new Date(),
  sessionEnded = false,
): PrimaryCancelInfo {
  const guests = booking.guests ?? [];
  const primaryRow = guests.find((g) => g.isPrimary);
  const primaryActive = !!primaryRow && primaryRow.status !== 'cancelled';
  const anyActiveGuest = guests.some((g) => !g.isPrimary && g.status === 'confirmed');

  const visible =
    !booking.isGuestBooking &&
    booking.status === 'confirmed' &&
    !booking.attendedAt &&
    !sessionEnded &&
    primaryActive &&
    anyActiveGuest;

  const freeSlot = booking.birthdayDiscountApplied === true;
  const spots = booking.spotsBooked ?? 1;
  const chargeableSpots = freeSlot ? Math.max(1, spots - 1) : Math.max(1, spots);
  const spotValueFils = freeSlot ? 0 : Math.round((booking.amountAed * 100) / chargeableSpots);

  const cutoffMs = sessionStartEpochMs(booking.session.date, booking.session.startTime) - 5 * 60 * 60 * 1000;
  const within5h = now.getTime() >= cutoffMs;

  return {
    visible,
    primarySlotId: primaryRow?.id ?? null,
    freeSlot,
    within5h,
    refundAed: spotValueFils / 100,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Birthday free game — the line both My games cancel dialogs show for a free
 * spot ("Cancel your spot?" and "Cancel Booking"). Same rules as the server
 * (shared/birthday.ts canRestoreBirthdayDiscount, Dubai date): outside the
 * 5-hour cutoff while the window is open, the free game comes back; inside the
 * cutoff it is used up. Nothing to say once the window has closed, or for a
 * paid spot. The window end is the last day of the window, "Mon 28 Sep".
 */
export function birthdayCancelLine(input: {
  freeSpot: boolean;
  within5h: boolean;
  user: BirthdayUser | null | undefined;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (!input.freeSpot || !input.user || !isInBirthdayWindow(input.user, dubaiCalendarDate(now))) return null;
  if (!canRestoreBirthdayDiscount({ bookingFlagged: true, slotIsPrimary: true, withinLateWindow: input.within5h, user: input.user, now })) {
    return 'Cancelling within 5 hours uses up your free birthday game.';
  }
  const end = birthdayWindowRange(input.user, dubaiCalendarDate(now))?.to;
  if (!end) return null;
  const label = `${WEEKDAYS[end.getUTCDay()]} ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  return `Your free birthday game comes back — book any session until ${label}.`;
}
