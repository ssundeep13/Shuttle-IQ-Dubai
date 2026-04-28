-- ============================================================================
-- Book the 6 demo test marketplace accounts (Male Test 3-4, Female Test 1-4)
-- into the next upcoming bookable session, in PRODUCTION.
--
-- HOW TO RUN:
--   1. Make sure scripts/seed-test-marketplace-accounts-prod.sql has already
--      been applied — the 6 marketplace_users rows must exist and be linked
--      to player rows. If they aren't there, run that script first.
--   2. Open the Replit production database console for ShuttleIQ.
--   3. Paste this entire file and execute it.
--   4. Inspect the verification SELECT at the bottom — every one of the 6
--      rows must show booking_status = 'confirmed'.
--
-- Behavior:
--   - Wraps everything in a single transaction.
--   - Auto-picks the next upcoming bookable session
--     (status='upcoming' AND date >= today, ordered by date ASC, limit 1).
--     If you want a specific session instead, replace the SELECT in the CTE
--     `target_session` with: SELECT '<your-bookable-session-uuid>'::varchar AS id
--   - Idempotent: if a test account already has a non-cancelled booking on
--     the chosen session, the INSERT for that account is skipped via the
--     partial unique index `unique_active_booking_per_session`.
--   - Booking shape mirrors POST /api/marketplace/admin/bookings:
--       status              = 'confirmed'
--       payment_method      = 'cash'
--       cash_paid           = false
--       ziina_payment_intent_id = NULL
--       amount_aed          = bookable_session.price_aed
--       wallet_amount_used  = 0
--       attended_at         = NULL  (so they exercise the real check-in tap)
--
-- IMPORTANT — Play page activation gate:
--   The /marketplace/play screen ALSO requires the linked admin session
--   (sessions.id referenced by bookable_sessions.linked_session_id) to be in
--   status='active' (not 'upcoming') before it will unlock for these
--   accounts. After running this script, an admin must mark that session as
--   active via the admin tools. The /marketplace/dashboard check-in banner
--   does NOT require activation and will show as soon as the booking exists.
-- ============================================================================

BEGIN;

-- Pre-flight: assert that the 6 test accounts exist. Abort otherwise so we
-- never insert orphan bookings.
DO $$
DECLARE
  found_count integer;
BEGIN
  SELECT COUNT(*) INTO found_count
    FROM marketplace_users
   WHERE email IN (
           'maletest3@demo.siq','maletest4@demo.siq',
           'femaletest1@demo.siq','femaletest2@demo.siq',
           'femaletest3@demo.siq','femaletest4@demo.siq'
         );
  IF found_count <> 6 THEN
    RAISE EXCEPTION 'Pre-flight failed: expected 6 demo test marketplace_users rows, found %. Run scripts/seed-test-marketplace-accounts-prod.sql first.', found_count;
  END IF;
END $$;

-- Pre-flight: assert there is an upcoming bookable session to target.
DO $$
DECLARE
  found_count integer;
BEGIN
  SELECT COUNT(*) INTO found_count
    FROM bookable_sessions
   WHERE status = 'upcoming'
     AND date >= date_trunc('day', NOW());
  IF found_count = 0 THEN
    RAISE EXCEPTION 'Pre-flight failed: no upcoming bookable session (status=upcoming, date >= today). Create one in the admin Sessions page first.';
  END IF;
END $$;

-- Pick the target session ONCE inside the transaction and pin it to a temp
-- table so that both the INSERT and the post-COMMIT verification SELECT
-- read the exact same row (eliminates timing drift if a new upcoming
-- session were created concurrently).
CREATE TEMP TABLE _seed_target_session ON COMMIT PRESERVE ROWS AS
SELECT id, price_aed
  FROM bookable_sessions
 WHERE status = 'upcoming'
   AND date >= date_trunc('day', NOW())
 ORDER BY date ASC
 LIMIT 1;

-- Insert one confirmed/cash booking per test account into the pinned
-- session. The partial unique index `unique_active_booking_per_session`
-- (on (user_id, session_id) WHERE status != 'cancelled') makes this idempotent.
WITH test_users AS (
  SELECT id AS user_id, email
    FROM marketplace_users
   WHERE email IN (
           'maletest3@demo.siq','maletest4@demo.siq',
           'femaletest1@demo.siq','femaletest2@demo.siq',
           'femaletest3@demo.siq','femaletest4@demo.siq'
         )
)
INSERT INTO bookings
  (id, user_id, session_id, status, payment_method, ziina_payment_intent_id,
   amount_aed, cash_paid, spots_booked, late_fee_applied, wallet_amount_used)
SELECT
  gen_random_uuid()::varchar,
  tu.user_id,
  ts.id,
  'confirmed',
  'cash',
  NULL,
  ts.price_aed,
  FALSE,
  1,
  FALSE,
  0
FROM test_users tu
CROSS JOIN _seed_target_session ts
ON CONFLICT (user_id, session_id) WHERE status != 'cancelled' DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only).
-- Expected: 6 rows. Each row should show booking_status = 'confirmed' and
-- session_title pointing at the EXACT session that was just targeted by the
-- INSERT (pinned in _seed_target_session, which survives COMMIT because it
-- was created with ON COMMIT PRESERVE ROWS and is dropped at session end).
-- ============================================================================
SELECT mu.email,
       mu.name,
       b.status         AS booking_status,
       b.payment_method,
       b.cash_paid,
       b.amount_aed,
       (b.attended_at IS NOT NULL) AS checked_in,
       bs.title         AS session_title,
       bs.date::date    AS session_date,
       bs.start_time,
       bs.linked_session_id
  FROM marketplace_users mu
  LEFT JOIN bookings b
         ON b.user_id = mu.id
        AND b.status != 'cancelled'
        AND b.session_id = (SELECT id FROM _seed_target_session)
  LEFT JOIN bookable_sessions bs ON bs.id = b.session_id
 WHERE mu.email IN (
         'maletest3@demo.siq','maletest4@demo.siq',
         'femaletest1@demo.siq','femaletest2@demo.siq',
         'femaletest3@demo.siq','femaletest4@demo.siq'
       )
 ORDER BY mu.email;

-- Cleanup: drop the pinned session reference now that verification is done.
DROP TABLE IF EXISTS _seed_target_session;
