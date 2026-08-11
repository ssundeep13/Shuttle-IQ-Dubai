/**
 * Option A Gate 3 — the one rule for "does the primary play?":
 * a person plays iff their booking_guests row is ACTIVE (status !== 'cancelled').
 *
 * Legacy rule: 8 pre-model bookings and admin cash bookings have NO
 * booking_guests rows at all. Absence of an isPrimary row ≠ cancelled —
 * those bookings keep today's behaviour (primary treated as active).
 * The rule only demotes a primary when a row EXISTS and is cancelled.
 *
 * Shared client+server so every surface (roster feed, check-in guards,
 * Who's Playing, Play/Dashboard, admin card, MyBookings) agrees. The badge
 * SQL mirrors this as NOT EXISTS(... is_primary AND status='cancelled').
 */
export function primarySlotActive(
  guests?: Array<{ isPrimary: boolean; status: string }> | null,
): boolean {
  const primary = (guests ?? []).find((g) => g.isPrimary);
  return !primary || primary.status !== 'cancelled';
}
