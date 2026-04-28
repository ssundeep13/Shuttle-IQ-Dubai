-- ============================================================================
-- Seed 6 test marketplace accounts (Male Test 3-4, Female Test 1-4) into PROD.
--
-- HOW TO RUN:
--   1. Open the Replit production database console for ShuttleIQ.
--   2. Paste this entire file and execute it.
--   3. Inspect the verification SELECT at the bottom — every one of the 6 rows
--      must show linked = t and email_verified = t.
--
-- This script:
--   - Wraps everything in a single transaction.
--   - Is idempotent: re-running it is a no-op (uses ON CONFLICT DO NOTHING on
--     email + shuttle_iq_id; the linkage UPDATE is a join-based query that
--     ONLY links a marketplace_user to the player whose shuttle_iq_id matches
--     and whose email matches — so if a player insert is skipped because the
--     SIQ is already taken by an unrelated row, no dangling link is created).
--   - Pre-allocates UUIDs (randomUUID()) and SIQ ids (SIQ-00003..SIQ-00008)
--     based on a read of production max(shuttle_iq_id) = SIQ-00002 taken
--     immediately before this file was generated.
--   - Uses the bcrypt hash of "Test1234!" produced by the same hashPassword()
--     helper the live signup endpoint uses (bcryptjs, genSalt(10)). The hash
--     was verified locally with bcrypt.compare. (One hash is shared across
--     all 6 test accounts — acceptable for test fixtures.)
--   - Does NOT touch maletest1@demo.siq or maletest2@demo.siq.
-- ============================================================================

BEGIN;

-- ----- Pre-flight assertion -----
-- Abort the transaction if the prod max canonical SIQ no longer matches what
-- this file was generated against (SIQ-00002). If a new player has signed up
-- since this file was created, regenerate the file with a fresh SIQ range
-- before re-running.
DO $$
DECLARE
  current_max integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(shuttle_iq_id FROM '^SIQ-([0-9]{5})$') AS INTEGER)), 0)
    INTO current_max
    FROM players
   WHERE shuttle_iq_id ~ '^SIQ-[0-9]{5}$';
  IF current_max > 2 AND NOT EXISTS (
       SELECT 1 FROM marketplace_users WHERE email = 'maletest3@demo.siq'
     ) THEN
    RAISE EXCEPTION 'Pre-flight failed: max canonical shuttle_iq_id is now SIQ-%, expected SIQ-00002. Regenerate this file with the next-free SIQ range before running.', LPAD(current_max::text, 5, '0');
  END IF;
END $$;

-- ----- 1. marketplace_users -----
INSERT INTO marketplace_users
  (id, email, password_hash, name, phone, linked_player_id, role,
   pending_signup_credit_fils, email_verified,
   email_verification_token, email_verification_token_expiry)
VALUES
  ('23b57f98-ff70-438f-8b57-81dcbf2486c1', 'maletest3@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Male Test 3', '+971501111003', NULL, 'player', 0, TRUE, NULL, NULL),
  ('ecb200c9-593a-498f-aed4-0175c5d7bb1c', 'maletest4@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Male Test 4', '+971501111004', NULL, 'player', 0, TRUE, NULL, NULL),
  ('2e81d23e-acf1-4f9f-beca-281fae57f5d0', 'femaletest1@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Female Test 1', '+971501111005', NULL, 'player', 0, TRUE, NULL, NULL),
  ('8c1445f4-a3b1-48ea-afca-9a6fa64019eb', 'femaletest2@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Female Test 2', '+971501111006', NULL, 'player', 0, TRUE, NULL, NULL),
  ('27539f07-12e2-44ad-9aaf-70e05b2f5f92', 'femaletest3@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Female Test 3', '+971501111007', NULL, 'player', 0, TRUE, NULL, NULL),
  ('3ac19436-7ac5-4642-bff1-2d68cb322634', 'femaletest4@demo.siq', '$2b$10$vG.6C/JDSQaWYQL9vMaBNun8lm5yMA1VeD.xdwsoJfTXz1lZvEHfe', 'Female Test 4', '+971501111008', NULL, 'player', 0, TRUE, NULL, NULL)
ON CONFLICT (email) DO NOTHING;

-- Repair partial-prior-run state: ensure email_verified = true even when the
-- INSERT above was a no-op because the row already existed.
UPDATE marketplace_users
   SET email_verified = TRUE,
       email_verification_token = NULL,
       email_verification_token_expiry = NULL
 WHERE email IN (
         'maletest3@demo.siq',
         'maletest4@demo.siq',
         'femaletest1@demo.siq',
         'femaletest2@demo.siq',
         'femaletest3@demo.siq',
         'femaletest4@demo.siq'
       )
   AND email_verified = FALSE;

-- ----- 2. players (linked rows) -----
INSERT INTO players
  (id, shuttle_iq_id, name, email, phone, gender, level, skill_score,
   games_played, wins, status, return_games_remaining, tier_candidate_games,
   referral_code, skill_score_baseline)
VALUES
  ('57d916bd-47ab-4148-95fd-fde6bc0cea27', 'SIQ-00003', 'Male Test 3', 'maletest3@demo.siq', '+971501111003', 'Male', 'beginner', 55, 0, 0, 'waiting', 0, 0, 'SIQ-MALETE-00003', 55),
  ('dc2d4dd9-aa40-4f6f-831e-73e9c75c36ff', 'SIQ-00004', 'Male Test 4', 'maletest4@demo.siq', '+971501111004', 'Male', 'lower_intermediate', 75, 0, 0, 'waiting', 0, 0, 'SIQ-MALETE-00004', 75),
  ('8b4c2c40-556c-4b65-8f2b-9014112c5430', 'SIQ-00005', 'Female Test 1', 'femaletest1@demo.siq', '+971501111005', 'Female', 'upper_intermediate', 95, 0, 0, 'waiting', 0, 0, 'SIQ-FEMALE-00005', 95),
  ('71b851b4-49ff-433a-b15c-2bbd76098570', 'SIQ-00006', 'Female Test 2', 'femaletest2@demo.siq', '+971501111006', 'Female', 'beginner', 55, 0, 0, 'waiting', 0, 0, 'SIQ-FEMALE-00006', 55),
  ('a2a5982b-5e0a-4f2b-bbec-86eb60c0d047', 'SIQ-00007', 'Female Test 3', 'femaletest3@demo.siq', '+971501111007', 'Female', 'lower_intermediate', 75, 0, 0, 'waiting', 0, 0, 'SIQ-FEMALE-00007', 75),
  ('c0e5aeaa-ed25-4bc8-8971-89a3e31e0b53', 'SIQ-00008', 'Female Test 4', 'femaletest4@demo.siq', '+971501111008', 'Female', 'beginner', 55, 0, 0, 'waiting', 0, 0, 'SIQ-FEMALE-00008', 55)
ON CONFLICT (shuttle_iq_id) DO NOTHING;

-- ----- 3. Link each marketplace_user to its player (FAIL-SAFE) -----
-- Joins on BOTH email and shuttle_iq_id, so if step 2 skipped a player
-- insert because that SIQ was already taken by an unrelated row, we will
-- simply NOT link rather than create a dangling reference. Only updates
-- rows still unlinked, so safe to re-run.
UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'maletest3@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00003'
   AND p.email = 'maletest3@demo.siq'
   AND mu.linked_player_id IS NULL;

UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'maletest4@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00004'
   AND p.email = 'maletest4@demo.siq'
   AND mu.linked_player_id IS NULL;

UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'femaletest1@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00005'
   AND p.email = 'femaletest1@demo.siq'
   AND mu.linked_player_id IS NULL;

UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'femaletest2@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00006'
   AND p.email = 'femaletest2@demo.siq'
   AND mu.linked_player_id IS NULL;

UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'femaletest3@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00007'
   AND p.email = 'femaletest3@demo.siq'
   AND mu.linked_player_id IS NULL;

UPDATE marketplace_users mu
   SET linked_player_id = p.id
  FROM players p
 WHERE mu.email = 'femaletest4@demo.siq'
   AND p.shuttle_iq_id = 'SIQ-00008'
   AND p.email = 'femaletest4@demo.siq'
   AND mu.linked_player_id IS NULL;

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only).
-- Expected: 6 rows, every row has linked = t and email_verified = t,
-- and shuttle_iq_id is one of SIQ-00003..SIQ-00008.
-- ============================================================================
SELECT mu.email, mu.name, mu.email_verified, mu.role,
       (mu.linked_player_id IS NOT NULL) AS linked,
       p.shuttle_iq_id, p.gender, p.skill_score, p.level, p.referral_code
  FROM marketplace_users mu
  LEFT JOIN players p ON p.id = mu.linked_player_id
 WHERE mu.email IN (
         'maletest3@demo.siq','maletest4@demo.siq',
         'femaletest1@demo.siq','femaletest2@demo.siq',
         'femaletest3@demo.siq','femaletest4@demo.siq'
       )
 ORDER BY mu.email;
