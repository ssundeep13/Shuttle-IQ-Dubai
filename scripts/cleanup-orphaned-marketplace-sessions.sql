-- Cleanup two specific orphaned bookable_sessions that had no linked admin session.
-- These were created before the unified session architecture was enforced.
-- FK-safe order: payments → bookings → bookable_sessions.
-- Idempotent: safe to run multiple times.

BEGIN;

-- Verify targets before deletion
SELECT id, title, linked_session_id FROM bookable_sessions
WHERE id IN (
  '5c390611-9882-41f1-8446-d4da55843ef4',
  '234c115a-b4ea-4bc1-bf3c-75a137d0b7bf'
);

DELETE FROM payments
WHERE booking_id IN (
  SELECT b.id FROM bookings b
  WHERE b.session_id IN (
    '5c390611-9882-41f1-8446-d4da55843ef4',
    '234c115a-b4ea-4bc1-bf3c-75a137d0b7bf'
  )
);

DELETE FROM bookings
WHERE session_id IN (
  '5c390611-9882-41f1-8446-d4da55843ef4',
  '234c115a-b4ea-4bc1-bf3c-75a137d0b7bf'
);

DELETE FROM bookable_sessions
WHERE id IN (
  '5c390611-9882-41f1-8446-d4da55843ef4',
  '234c115a-b4ea-4bc1-bf3c-75a137d0b7bf'
);

-- Verify cleanup: should return 0 rows
SELECT id, title FROM bookable_sessions WHERE linked_session_id IS NULL;

COMMIT;
