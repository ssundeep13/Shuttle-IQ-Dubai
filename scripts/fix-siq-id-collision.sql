-- Task #183: Repair fallout from SIQ ID generator collision bug.
--
-- Background: server/storage.ts `generateShuttleIqId()` previously sorted
-- IDs lexically and parsed digits via /SIQ-(\d+)/. A stale test row
-- "Preview Searcher dSgv" with id `SIQ-J-TZXX` sorted higher than
-- `SIQ-00284`, the regex didn't match, and the generator silently fell
-- back to `SIQ-00001`. The first new player after that (Navya) was
-- assigned `SIQ-00001`; subsequent inserts then collided on the
-- `players_shuttle_iq_id_key` unique constraint.
--
-- This script is idempotent and safe to re-run.

BEGIN;

-- 1. Remove the stale test rows that triggered the bug. Verified prior
--    to running that the only FK referencing players is
--    `referrals.referrer_id`, and these rows have no referrals.
DELETE FROM players
WHERE id IN ('DtaQyDcI3LMI', 'test-player-1776514927622');

-- 2. Reassign Navya from SIQ-00001 (wrong, caused by the bug) to
--    SIQ-00285 (the correct next-in-sequence at the time she was
--    created), and bring her referral_code's numeric tail in line.
UPDATE players
SET shuttle_iq_id = 'SIQ-00285',
    referral_code = 'SIQ-NAVYAX-00285'
WHERE id = 'f20556c2-a6f0-4c3f-adda-116c576413cd'
  AND shuttle_iq_id = 'SIQ-00001';

COMMIT;

-- 3. Sanity check — the next generated SIQ ID should be MAX+1.
SELECT
  MAX(CAST(SUBSTRING(shuttle_iq_id FROM '^SIQ-([0-9]{5})$') AS INTEGER)) AS current_max,
  MAX(CAST(SUBSTRING(shuttle_iq_id FROM '^SIQ-([0-9]{5})$') AS INTEGER)) + 1 AS next_id
FROM players
WHERE shuttle_iq_id ~ '^SIQ-[0-9]{5}$';
