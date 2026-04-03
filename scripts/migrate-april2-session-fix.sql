-- Migration: Fix April 2 session data
-- Run date: 2026-04-03 (already executed on production DB)
--
-- What happened: The host accidentally activated the April 4th queue session
-- (7e0ae3ba) on April 2nd and played all 36 games under the wrong session.
-- The April 2nd session (b89460e3) was created but never activated.
--
-- This script re-files all game data under the correct April 2nd session and
-- resets April 4th back to upcoming. All 4 steps run in one transaction.
--
-- Verified results (SELECT after COMMIT):
--   b89460e3 (Apr 2): ended, 3 courts, 36 games, 20 queue entries ✓
--   7e0ae3ba (Apr 4): upcoming, 0 courts, 0 games, 0 queue entries ✓

BEGIN;

-- Step 1: Delete the 3 unused empty courts from the April 2nd session
-- (auto-created when session was set up, never used for any game)
DELETE FROM courts
WHERE session_id = 'b89460e3-fd40-4496-a54c-106c2f649bd2';
-- Expected: DELETE 3

-- Step 2: Move April 4th session's courts to April 2nd
-- (36 game_results reference these court IDs — they must follow)
UPDATE courts
SET session_id = 'b89460e3-fd40-4496-a54c-106c2f649bd2'
WHERE session_id = '7e0ae3ba-8ea2-468b-aa3d-34b7c7193a25';
-- Expected: UPDATE 3

-- Step 3a: Move all 36 game results to April 2nd session
UPDATE game_results
SET session_id = 'b89460e3-fd40-4496-a54c-106c2f649bd2'
WHERE session_id = '7e0ae3ba-8ea2-468b-aa3d-34b7c7193a25';
-- Expected: UPDATE 36

-- Step 3b: Move all 20 queue entries to April 2nd session
UPDATE queue_entries
SET session_id = 'b89460e3-fd40-4496-a54c-106c2f649bd2'
WHERE session_id = '7e0ae3ba-8ea2-468b-aa3d-34b7c7193a25';
-- Expected: UPDATE 20

-- Step 4a: Mark April 2nd session as ended (actual end time from Apr 4 session)
UPDATE sessions
SET status = 'ended',
    ended_at = '2026-04-02 18:12:51.455'
WHERE id = 'b89460e3-fd40-4496-a54c-106c2f649bd2';
-- Expected: UPDATE 1

-- Step 4b: Reset April 4th session to upcoming, clear end time
UPDATE sessions
SET status = 'upcoming',
    ended_at = NULL
WHERE id = '7e0ae3ba-8ea2-468b-aa3d-34b7c7193a25';
-- Expected: UPDATE 1

COMMIT;

-- Verification query (should return the values in the comments):
-- SELECT id, date::date, status, ended_at,
--   (SELECT COUNT(*) FROM courts c WHERE c.session_id = s.id) AS courts,
--   (SELECT COUNT(*) FROM game_results g WHERE g.session_id = s.id) AS games,
--   (SELECT COUNT(*) FROM queue_entries q WHERE q.session_id = s.id) AS queue
-- FROM sessions s
-- WHERE s.id IN ('b89460e3-fd40-4496-a54c-106c2f649bd2','7e0ae3ba-8ea2-468b-aa3d-34b7c7193a25')
-- ORDER BY s.date;
--
-- Expected:
--   b89460e3 | 2026-04-02 | ended   | 2026-04-02 18:12:51 | 3 | 36 | 20
--   7e0ae3ba | 2026-04-04 | upcoming| NULL                | 0 |  0 |  0
