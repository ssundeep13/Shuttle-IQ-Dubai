import { sessionStartEpochMs } from '@shared/sessionTime';

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
