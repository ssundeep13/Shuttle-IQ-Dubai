// The booking route answers 409 pending_booking_exists when the player already holds a young pending booking on the
// session with a DIFFERENT shape (spots / wallet / guests). The session page turns that into two actions — continue
// the existing payment, or replace the booking on purpose — instead of a dead-end sentence.
export type PendingConflict = { message: string; bookingId: string | null; redirectUrl: string | null };

export const PENDING_CONFLICT_FALLBACK = 'You already have a booking awaiting payment for this session.';

export function pendingConflictOf(status: number, data: unknown): PendingConflict | null {
  if (status !== 409 || !data || typeof data !== 'object') return null;
  const d = data as { error?: unknown; message?: unknown; bookingId?: unknown; redirectUrl?: unknown };
  if (d.error !== 'pending_booking_exists') return null;
  return {
    message: typeof d.message === 'string' && d.message ? d.message : PENDING_CONFLICT_FALLBACK,
    bookingId: typeof d.bookingId === 'string' ? d.bookingId : null,
    redirectUrl: typeof d.redirectUrl === 'string' ? d.redirectUrl : null,
  };
}
