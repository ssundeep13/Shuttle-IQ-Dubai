-- Cleanup orphaned bookable_sessions that have no linked admin session.
-- These were created before the unified session architecture was enforced.
-- FK-safe order: payments → bookings → bookable_sessions.
-- Idempotent: safe to run multiple times.

BEGIN;

DELETE FROM payments
WHERE booking_id IN (
  SELECT b.id FROM bookings b
  JOIN bookable_sessions bs ON b.session_id = bs.id
  WHERE bs.linked_session_id IS NULL
);

DELETE FROM bookings
WHERE session_id IN (
  SELECT id FROM bookable_sessions WHERE linked_session_id IS NULL
);

DELETE FROM bookable_sessions
WHERE linked_session_id IS NULL;

COMMIT;
