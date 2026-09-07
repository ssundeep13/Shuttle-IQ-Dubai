# Player Challenges — autonomous build report

Branch `railway-migration`. Started 2026-09-05 (Dubai). Sandeep away; explicit GO for gates C1→C5 with the hard-stop list in the brief.

## Standing interpretations (read first)

- **`npm run check` = bare `tsc`, which has 28 pre-existing errors on this branch** (unchanged for weeks; the project's established bar is "tsc 28"). "Must pass" is therefore applied as **no new errors — the count must stay at 28**. Every gate records the count.
- Test data uses only the two pre-existing linked test accounts (`TEST PLAYER` SIQ-00345 / shuttleiqdubai@gmail.com, and `ZZ-SANDBOX-GOODWILL Tester`), both `Beginner` and therefore in range of each other. No real player is written to.
- The two `ZZ-SANDBOX-GOODWILL` ended sandbox sessions from 17 Aug are pre-existing fixtures and are left alone. Baseline before C1: **0 active sessions**, `challenges` table absent.

## Gate log

### C1 — table + endpoints — **HARD STOP before schema apply** (2026-09-05, ~15:20 Dubai)

**Done (code, all green, NOT committed, NOT deployed):**
- `shared/schema.ts` — `challenges` table exactly as specified (timestamptz columns, 3 composite indexes, partial unique index `uq_challenges_open_pair` on `pair_key WHERE status IN ('pending','accepted')`), `Challenge` type.
- `server/feedEvents.ts` — `TIER_ORDER` exported (one-word change).
- `server/challenges.ts` (new) — re-exports `TIER_ORDER`; `canChallenge`, `pairKey`, `expiresAtFrom`, `isExpired`, `challengeDirection`, `checkCreateGuards` (the full 4xx ladder, pure), `OPEN_STATUSES`, `MAX_OUTGOING=3`, `EXPIRY_DAYS=7`; DB helpers `expireStaleChallenges`, `findOpenChallengeForPlayers`, `findOpenForPair`, `countOpenOutgoing`, `createChallenge`, `respondToChallenge` (guarded pending→x update), `toViews`/`listMine`/`statusFor` (display names + display tiers via `getTierDisplayName`, never DB enums).
- `server/marketplace-routes.ts` — the five routes (`POST /challenges`, `POST /:id/accept`, `POST /:id/decline`, `GET /mine`, `GET /status/:playerId`), all `requireAuth + requireMarketplaceAuth`, 403 "Link your player profile first", `expireStaleChallenges()` first in each; unique-violation race mapped to 409; notifications `challenge_received` / `challenge_accepted`; decline silent.
- `tests/challenges.test.ts` — 19 tests: canChallenge full 6×6 matrix + spec examples + unknown levels, pairKey symmetry, the 4xx ladder incl. MAX_OUTGOING boundary (2 ok / 3 refused) and precedence, expiry (only pending lapses, +7d exact), direction, schema/route pins. RED (module absent) → GREEN 19/19.
- Bar: full suite **1040/1040 exit 0** (portal-runner-wall timeout flake once, passed isolated 30/30 and in the re-run); **tsc 28 = baseline, no new errors**.

**Why stopped — step 5 (`npx drizzle-kit push`):** run with `--strict --verbose` and stdin closed so the plan prints and aborts at the approval prompt. The plan contained, besides the new table, an **ALTER of an existing table**:

```
· You're about to add session_runners_name_unique unique constraint to the table, which contains 4 items.
  … Do you want to truncate session_runners table?   ❯ No / Yes
```

Nothing was applied (`to_regclass('public.challenges')` = null after both runs; the prompt aborted). Root cause, verified read-only: `session_runners.name` is declared `.unique()` in the schema (commit `ddc71ae`, finance Phase 1), and the live DB **already enforces it** — under Postgres's default constraint name `session_runners_name_key`. drizzle-kit matches constraints by its own naming convention (`session_runners_name_unique`), so it sees drift and wants to add a second, redundant constraint. The 4 runner names (Arjun, Preetham, Shannon, Akhila) are distinct, so the statement would succeed — but it is an `ALTER TABLE` on an existing table, which the brief lists as a hard stop, and the tool's truncate offer is exactly the kind of surprise that rule exists for. **This drift is pre-existing and blocks every future `drizzle-kit push`, not just this one.**

**Options for Sandeep (pick one, then I resume at C1 step 5):**
1. *Recommended:* `ALTER TABLE session_runners RENAME CONSTRAINT session_runners_name_key TO session_runners_name_unique;` — data-safe, ends the drift permanently; then `drizzle-kit push` should plan only `CREATE TABLE challenges` + 4 indexes (I will re-preview before applying).
2. Approve the push as-is (adds the redundant second unique constraint; answer "No, add without truncating").
3. Create the `challenges` table via a one-shot SQL migration (`system_one_shot_migrations` pattern), leaving the drift for later — deviates from the brief's "existing method".

**Working tree at stop:** modified `server/feedEvents.ts`, `server/marketplace-routes.ts`, `shared/schema.ts`; untracked `server/challenges.ts`, `tests/challenges.test.ts`, `docs/challenges-build-report.md`, `scripts/scratch/mint-mp-token.mjs` (helper, never to be staged). Nothing committed, nothing pushed, nothing written to the DB. Zero active sessions; no test data created.

Gates C2–C5: not started.

### C1 step 5 resumed on Sandeep's GO (Option 1) — 2026-09-05

**Constraint rename (approved, executed, verified):**
`ALTER TABLE session_runners RENAME CONSTRAINT session_runners_name_key TO session_runners_name_unique;`
- before: unique constraints on `session_runners` = `session_runners_name_key`
- after: `session_runners_name_unique` present, `session_runners_name_key` absent; row count 4 → 4.

**Re-preview (`drizzle-kit push --strict --verbose`, stdin closed): HARD STOP AGAIN.** The plan's first (and only shown) item is now `session_costs_session_id_unique` — "table contains 110 items … truncate?" — the same naming quirk on the next table. Nothing applied; `challenges` still absent.

**Full enumeration of this drift class (read-only):** every schema `.unique()` column whose live constraint carries the Postgres default `_key` name instead of drizzle's `<table>_<column>_unique`. drizzle-kit will stop on each of these, one per run, until all are renamed:

| Table.column | DB constraint now | drizzle expects | rows | data-safe? |
|---|---|---|---|---|
| session_costs.session_id | session_costs_session_id_key | session_costs_session_id_unique | 110 | yes — 0 duplicate session_ids |
| venues.name | venues_name_key | venues_name_unique | 20 | yes (already unique) |
| portal_users.email | portal_users_email_key | portal_users_email_unique | 3 | yes |
| discount_codes.code | discount_codes_code_key | discount_codes_code_unique | 1 | yes |
| discount_code_uses.booking_id | discount_code_uses_booking_id_key | discount_code_uses_booking_id_unique | 0 | yes |

(`stripe._migrations` / `stripe._sync_status` also use `_key` names but live outside drizzle's `public` scope — irrelevant.)

Proposed batch, pending Sandeep's GO (each is a metadata rename; no data touched):
```sql
ALTER TABLE session_costs      RENAME CONSTRAINT session_costs_session_id_key      TO session_costs_session_id_unique;
ALTER TABLE venues             RENAME CONSTRAINT venues_name_key                   TO venues_name_unique;
ALTER TABLE portal_users       RENAME CONSTRAINT portal_users_email_key            TO portal_users_email_unique;
ALTER TABLE discount_codes     RENAME CONSTRAINT discount_codes_code_key           TO discount_codes_code_unique;
ALTER TABLE discount_code_uses RENAME CONSTRAINT discount_code_uses_booking_id_key TO discount_code_uses_booking_id_unique;
```
After the batch I will re-preview once more and proceed ONLY if the plan is exactly `CREATE TABLE challenges` + its indexes; any further non-CREATE item is another stop (the preview shows one item per run, so a different drift class could still be hiding behind these).

### C1 step 5, second resume (GO on the five-rename batch) — **HARD STOP: a different drift class** (2026-09-05)

**Batch executed and verified (standing approval for `_key → _unique` only):**

| Table | before | after | rows |
|---|---|---|---|
| session_costs | session_costs_session_id_key | session_costs_session_id_unique | 110 → 110 (0 duplicate session_ids checked first) |
| venues | venues_name_key | venues_name_unique | 20 → 20 |
| portal_users | portal_users_email_key | portal_users_email_unique | 3 → 3 |
| discount_codes | discount_codes_code_key | discount_codes_code_unique | 1 → 1 |
| discount_code_uses | discount_code_uses_booking_id_key | discount_code_uses_booking_id_unique | 0 → 0 |

Zero `_key`-named unique constraints remain in `public`. Those six renames (incl. `session_runners`) are the only DB writes made in this build.

**Re-preview (`--strict --verbose`, stdin closed → "No, abort" taken; `challenges` still absent):** the plan is now the correct `CREATE TABLE challenges` + its four indexes (incl. `uq_challenges_open_pair … WHERE status IN ('pending','accepted')`) **plus 327 other statements against existing tables**, which is a different drift class entirely and not something the brief's approval covers:

- **310 × `DROP CONSTRAINT "<table>_<col>_not_null"`** across 47 tables. The database is **PostgreSQL 18.6**, which catalogues every NOT NULL as a named constraint (`pg_constraint contype='n'`: 310 rows). **drizzle-kit 0.31.4 does not model these and plans to drop every one — i.e. strip NOT NULL from `players`, `bookings`, `wallet_transactions`, `payments`, `sessions`, and 42 more.**
- **3 × `DROP CONSTRAINT` on CHECKs the schema never declared:** `players_wallet_balance_non_negative` (`CHECK (wallet_balance >= 0)` — the wallet floor), `session_series_weeks_ahead_range`, `session_series_origin_date_iso`.
- **3 × `DROP INDEX` on hand-made guards absent from `schema.ts`:** `uq_queue_entries_session_player` (one queue entry per player per session), `uq_match_suggestions_one_queued_per_court`, `idx_sessions_series_id`.
- **3 FK drops + 2 FK re-adds and 3 PK drops + 3 PK re-adds** purely to rename them to drizzle's conventions (`sessions_series_id_fkey` is dropped and NOT re-added).

Nothing was applied. This is not a naming drift that renames can fix: `drizzle-kit push` against this PG18 database with the pinned drizzle-kit would dismantle the schema's integrity constraints. **`npx drizzle-kit push` — "the repo's existing method" — is unusable here and should be considered dangerous until the toolchain is upgraded.**

**Options for Sandeep (any of these needs an explicit GO):**
1. *Recommended:* create the `challenges` table via a one-shot SQL migration using the exact five statements drizzle generated (`CREATE TABLE` + 3 `CREATE INDEX` + 1 `CREATE UNIQUE INDEX … WHERE`), recorded in `system_one_shot_migrations` — the brief's own fallback pattern, zero contact with existing tables. Then continue C1 → C5 unchanged.
2. Upgrade drizzle-kit to a release that understands PostgreSQL 17+/18 named NOT NULL constraints, re-preview, and only then push — a dependency change deserving its own gate.
3. Add the three hand-made indexes and three CHECKs to `schema.ts` so the diff shrinks — still leaves the 310 NOT NULL drops, so not sufficient alone.

### C1 step 5, third resume (GO on Option 1 + guard) — table created via one-shot migration — 2026-09-07 10:34 Dubai

(Date correction: the entries above headed "2026-09-05" were written on 2026-09-07; the constraint renames and stops all happened today.)

- **`scripts/one-shot/2026-09-05-challenges-table.mts`** (new, committed with C1): runs exactly drizzle's five generated statements — `CREATE TABLE "challenges"` + `idx_challenges_challenger_status`, `idx_challenges_challenged_status`, `idx_challenges_pair_status`, `uq_challenges_open_pair … WHERE status IN ('pending','accepted')` — inside one transaction, records `challenges_table_v1` in `system_one_shot_migrations`, and re-runs as a SKIP. **Zero statements against any other table.**
- Verified after the run: `to_regclass('public.challenges')` = challenges; `SELECT count(*) FROM challenges` = **0**; `pg_indexes` lists the four indexes plus the PK; migration row `challenges_table_v1` present; second invocation printed SKIP.
- **Guard (in the C1 commit):** `package.json` `db:push` now prints `BLOCKED: drizzle-kit 0.31.4 mis-reads PG18 NOT NULL/CHECK constraints and will drop them …` and exits 1 (verified); `drizzle.config.ts` carries a one-line pointer above the export. Reason: the 327-statement plan recorded above (310 NOT NULL drops across 47 tables, 3 CHECK drops incl. the wallet floor, 3 hand-made index drops, FK/PK churn).
- Later gates: **no further schema change is expected in C2–C5** (settlement, feed cards, UI and captain view all use existing tables plus `challenges`). If one ever appears, it goes through a one-shot script, never push.

**Sandeep to decide:**
- **drizzle-kit upgrade gate** — pick a PG17+/18-aware drizzle-kit release, re-run `push --strict --verbose` with stdin closed, and lift the `db:push` guard only if the plan is empty (or exactly the intended change).
- `npm run check` has 28 pre-existing tsc errors — separate cleanup gate.
- (Withdrawn after a direct probe: the app pool's session TimeZone is `Etc/UTC` and `ran_at` equals `now()`, so local scripts write naive UTC exactly like Railway. The only trap remains the read side — node-pg parses naive timestamps as local time on a UTC+4 machine — and, separately, this workstation's Git Bash `date` ignores `TZ=Asia/Dubai`, so wall-clock stamps in this report derived from `date` are UTC; add 4 h for Dubai.)

### C1 — closed: commit `ff67c44`, Railway deploy `3b83a424` SUCCESS, health 200 (2026-09-07 ~10:45 UTC)

Files in the commit: shared/schema.ts, server/feedEvents.ts, server/challenges.ts, server/marketplace-routes.ts, tests/challenges.test.ts, scripts/one-shot/2026-09-05-challenges-table.mts, package.json, drizzle.config.ts, docs/challenges-build-report.md. Pre-commit bar: tsc 28 (baseline, no new), full suite 1040/1040 exit 0.

Live smoke with a bearer minted for the TEST PLAYER account (shuttleiqdubai@gmail.com, player `b23351aa…`, SIQ-00345):
```
GET /api/marketplace/challenges/mine                     → 200 {"incoming":[],"outgoing":[],"active":[],"settled":[]}
GET /api/marketplace/challenges/status/e26b3e7d…         → 200 {"canChallenge":true}      (ZZ-SANDBOX Tester, Beginner vs Beginner)
GET /api/marketplace/challenges/mine   (no bearer)       → 401
GET /api/marketplace/challenges/status/b23351aa… (self)  → 200 {"canChallenge":false,"reason":"This is you"}
```
No challenge rows created; `challenges` count still 0.

### C2 — settlement (score path + edit path) — built (2026-09-07)

- `server/challenges.ts`: `pickSettlements` (pure: accepted + both in game + opposite teams → winner = the winning side; same team = untouched), `flipWinnerFor` (pure), `settleChallengesInTx(tx, {gameResultId, sessionId, isSandbox, perPlayer})` — sandbox returns `[]` before any read; otherwise runs in its own savepoint (`tx.transaction`) with its own try/catch exactly like `emitGameFeedEventsInTx`, guarded `accepted → settled` update (a retried score entry can't re-settle), and `challenge_settled` notifications to both players ("<winner> beat <loser> — challenge settled"); `flipSettledWinnersForGame` (self-guarded) for the edit path. No `storage` import (cycle guard, pinned).
- **Placement note:** the brief names `server/routes.ts` end-game path, but the transaction lives in `storage.completeGameTransaction`; the call is inserted there, in the SAME `tx`, immediately before `emitGameFeedEventsInTx` and after participants + player updates are written. No rating math or side-effect ordering changed (pinned: settle precedes feed within 900 chars).
- `server/routes.ts` `PATCH /api/game-results/:id`: `if (winnerChanged) flipSettledWinnersForGame(gameId, newWinningTeam, participants)` before the existing feed supersede. (C3 will supersede the settled feed card here.)
- `tests/challenges-settlement.test.ts` — 18 tests: singles settles; doubles opposite teams settles (winner = winning side); doubles same team does not; pending ignored; absent opponent ignored; several per game; flip pure cases; DB behaviour on a routing fake tx (savepoint taken, update payload, two notifications, sandbox = no savepoint/no reads/no writes, same-team = no writes, thrown update swallowed → `[]`); flip writes / no-op; wiring pins. RED (functions absent) → GREEN.
- Bar: tsc 28 (baseline), full suite exit 0.

### C2 — closed: commit `81e4085`, Railway deploy `7bd8bb58` SUCCESS, health 200 (2026-09-07 ~10:45 UTC)

Live verification on production (`scripts/scratch/c2-sandbox-verify.mjs`, untracked; test data only):
```
pre: active sessions 0 | challenges rows 0
created test players [ '9c7b405d', '9ddcbf8b' ]            (ZZ-CHALLENGE-TEST-C / -D, Beginner)
sandbox session 90802ba3 { is_sandbox: true, status: 'active' }   court 23a059ed
challenge created 0feaa026 pending TEST PLAYER → ZZ-SANDBOX-GOODWILL Tester | tiers Beginner / Beginner
accepted: accepted respondedAt 2026-09-07T10:46:07.125Z
/mine (challenger): active 1 outgoing 0
assigned; court status occupied → end-game 200 (team 1 wins 21–15; challenge pair on opposite teams)
AFTER sandbox score: challenge {"status":"accepted","game_result_id":null,"winner_player_id":null,"settled_at":null}
  | feed rows for session 0 | challenge_settled notifications (10 min) 0
SANDBOX RULE HOLDS
teardown: session end → 200 {"deleted":true,"sandbox":true}; challenge rows deleted 1; test notifications deleted 2; test players deleted 2
FINAL STATE: {"active":0,"zz_sessions":0,"challenges":0,"zz_players":0}
```
Non-sandbox path: **settlement verified by unit tests + sandbox negative test only; first real settlement to be observed on the next live session.** (No non-sandbox test venue/session flow exists in tests/ or scripts/, and a real-session game would publish real stats and feed rows.)

### C3 — feed cards — built (2026-09-07)

- `shared/utils/challengeCopy.ts` (new): `challengeAcceptedHeadline` → "Dev challenged Reena"; `challengeSettledHeadline` → "Dev beat Reena 21–17 · Challenge settled". One source for server headline + client card.
- `server/feedEvents.ts`: `buildChallengeAcceptedEvent` (subject = challenger, dedupe `ca:<id>`, payload names + display tiers), `buildChallengeSettledEvent` (subject = winner, `gameResultId` set, dedupe `cs:<id>`; corrections `cs:<id>:corr:<winnerId>`), `feedEventHeadline` cases, type comment.
- `server/challenges.ts`: `settleChallengesInTx` now takes `team1Score/team2Score` and inserts the settled card via `insertFeedEvents` in the SAME savepoint as the settlement write; `supersedeChallengeCardsForGame` (self-guarded) supersedes published `challenge_settled` cards for the game and inserts corrected cards. `server/storage.ts` passes the scores. `server/routes.ts` PATCH calls it after the winner flip.
- `server/marketplace-routes.ts` accept route: emits the accepted card (guarded); decline emits nothing (pinned).
- `client/src/pages/marketplace/CommunityFeed.tsx`: `ChallengeAcceptedCard` (headline navy, both players as name·tier tags in text-teal) and `ChallengeSettledCard` (headline navy, "Captain-verified score" in text-teal); flat white card, 1px border, Inter, max weight 800, no shadow/gradient/emoji, `LikeBar` on both. **Brand note:** the brief's `#003E8C` is banned as a literal by the Gate-2 brand pin under `pages/marketplace`; cards use the app's navy token `MKT.navy` (#002C84) and `MKT.tealText` (#006B5F).
- Tests: `tests/challenges-feed.test.ts` (13: builders, copy, savepoint emission, sandbox no-card, correction supersede, wiring + client pins); C2 fake `tx.insert` extended to model drizzle's chain; `tests/feed-api.test.ts` LikeBar tripwire updated 2 → 4 with reason. RED (module absent) → GREEN; bar: tsc 28, full suite exit 0.
- Likes on the new cards: the like route filters on `published` status only — no type filter (pinned).

### C3 — closed: commit `acec5d8`, Railway deploy `54f81c88` SUCCESS, health 200 (2026-09-07 ~11:05 UTC)

Live verification (`scripts/scratch/c3-feed-verify.mjs`, test accounts only):
```
challenge 4e650c78 accepted   (TEST PLAYER → ZZ-SANDBOX-GOODWILL Tester)
FEED CARD: {"type":"challenge_accepted","subjectPlayerId":"b23351aa","payload":{"challengeId":"4e650c78…","challengedName":"ZZ-SANDBOX-GOODWILL Tester","challengedTier":"Beginner","challengerName":"TEST PLAYER","challengerTier":"Beginner"},"likeCount":0,"likedByMe":false,"session":null}
like → 200 {"likeCount":1,"likedByMe":true}      unlike → 200 {"likeCount":0,"likedByMe":false}
DB feed row: {"type":"challenge_accepted","status":"published","dedupe_key":"ca:4e650c78…","subject_player_id":"b23351aa…","game_result_id":null}
teardown: feed events deleted 1; challenge deleted 1; test notifications deleted 2
FINAL STATE: {"challenges":0,"challenge_cards":0,"active":0}
```
The `challenge_settled` card needs a non-sandbox settlement (unit-tested + savepoint-emission test; first real one to be observed on the next live session). Client rendering of both cards is source-pinned (the feed page needs auth + cursor providers, matching the repo's existing feed-test approach); a Playwright screenshot was not available in this environment.

### C4 — player UI — built (2026-09-07)

- `client/src/components/ChallengeButton.tsx` (new): navy `navyBtn` "Challenge" on a public profile, driven by `GET /challenges/status/:playerId`; hidden when `!canChallenge` with the reason as caption ("Out of your range" / "Challenge pending" / "Challenge active"); hidden on own profile and for viewers without a linked player; confirm dialog before sending; server error (e.g. 409) shown inline; success invalidates `/api/marketplace/challenges*` and toasts. Full-width under 400px (`w-full min-[400px]:w-auto`).
- `client/src/components/ChallengesCard.tsx` (new): Profile "Challenges" card — incoming (Accept / Decline, full-width under 400px), waiting-for-reply, active, last 3 settled; empty state "No challenges yet. Find a player to challenge." with a rankings link. Accept/decline POST to the C1 routes and refresh `/mine` + feed.
- `client/src/lib/apiError.ts` (new): server `{error}` text out of an apiRequest failure.
- `client/src/pages/marketplace/PlayerPublicProfile.tsx`: renders `ChallengeButton` under the header row with the viewer's `linkedPlayerId` (via `useMarketplaceAuth`). `client/src/pages/marketplace/Profile.tsx`: renders `ChallengesCard` (Profile card chrome) after the My Referrals card, only for linked players.
- Notifications: the bell renders free-text `title`/`message` with no per-type branching, so `challenge_received` / `challenge_accepted` / `challenge_settled` need no special case (pinned).
- Tests: `tests/challenges-ui.test.tsx` — 14 tests, real jsdom renders of both components (status-driven button, three captions, own-profile/unlinked hidden, confirm → POST body → invalidate, inline 409, empty state, section lists + settled cap of 3, accept POST + refresh, no-emoji/no-shadow/no-drifted-hex pins) + page wiring pins. RED (components absent) → GREEN 14/14; one new tsc error fixed (nullable Dubai date) → tsc 28; full suite exit 0.

### C4 — closed: commit `075a7b1`, Railway deploy `0c455539` SUCCESS, health 200 (2026-09-07 ~11:20 UTC)

Live walkthrough with the two test accounts (`scripts/scratch/c4-mine-verify.mjs`):
```
status A→B: {"canChallenge":true}
created 2177a9ae | status A→B now: {"canChallenge":false,"reason":"Challenge pending","existing":{…,"status":"pending","direction":"outgoing"}}
A /mine: {"outgoing":["2177a9ae"],…} | B /mine: {"incoming":["2177a9ae"],…}
B notifications (latest): {"type":"challenge_received","title":"New challenge","message":"TEST PLAYER has challenged you"}
after accept — A /mine: {"active":["2177a9ae"]} | B /mine: {"active":["2177a9ae"]}   (names + display tiers in the rows)
feed card present: true
second create (B→A) → 409 Open challenge already exists   (one open challenge per pair)
teardown: feed rows deleted 1 | challenge deleted 1 | test notifications deleted 2 → FINAL STATE {"challenges":0,"cards":0}
```
Playwright: not installed in the project (`require('playwright')` fails; only an npx cache answered `--version`). Installing it means a package download plus lockfile changes, so the DOM walkthrough was not run; the components are exercised in jsdom by `tests/challenges-ui.test.tsx` (14 real renders) and the wiring is pinned. Delete-after: done (see FINAL STATE).

### C5 — captain visibility — built (2026-09-07)

- `server/challenges.ts` `listSessionChallenges(id)`: open (pending|accepted) challenges where BOTH players hold a `confirmed`/`attended` booking in the session; `id` may be the bookable id or the ops id (resolved via `linked_session_id`); shaped `[{challengeId, status, aId, aName, bId, bName, createdAt, respondedAt}]`.
- `server/routes.ts` `GET /api/sessions/:id/challenges` — `requireAuth, requireCaptain` (middleware admits captain, admin, super_admin — pinned). **Captain allow-list pin updated 33 → 34** in `tests/captain-role.test.ts` with the reason (read-only view, no escalation). End-game replies now carry `settledChallenges` (from `completeGameTransaction`, `[]` on the duplicate/lost-race paths).
- `shared/utils/challengeViews.ts` (new, pure): `sessionChallengeTag` ("vs <first name>" + tooltip "Dev Kumar vs Reena Pillai · challenged by Dev Kumar · accepted 3 Sep"), `lineupChallenge` (accepted pair on opposite teams), `openChallengeCount`, `settledLabel` ("Challenge settled — Dev beat Reena").
- Admin `SessionsManagement.tsx` BookingsSheet: fetches `/api/sessions/<bookable>/challenges`; each booking row shows a text-teal "vs <first name>" tag (native tooltip + aria-label) when that player has an open challenge with someone booked here; header badge "N open challenges" when N > 0.
- Admin court cards: `Home.tsx` fetches the active session's challenges (30 s refetch), keeps `settledByCourt` from the end-game reply and clears it on the next assign; `CourtManagement` passes through; `CourtCard` shows "Challenge match · A vs B" on an occupied lineup with an accepted pair on opposite teams, and "Challenge settled — X beat Y" on the free court until its next lineup.
- Player-facing: `PlayingScreen` shows "Challenge match · vs <name>" when one of the player's active challenges is against an opponent on court; `SessionDone` lists "Challenge settled — X beat Y" for challenges settled in the last 3 hours.
- Tests: `tests/challenges-captain.test.tsx` — 22 tests (pure helpers incl. tooltip dates; real jsdom `CourtCard` renders for both labels and both negatives; server/route/storage/middleware pins; client wiring pins; no-emoji). RED (module absent; captain pin 33≠34) → GREEN; tsc 28; full suite exit 0.

### C5 — closed: commit `d3eaa08`, Railway deploy `4e98a077` SUCCESS, health 200 (2026-09-07 ~11:15 UTC)

Live verification (`scripts/scratch/c5-captain-verify.mjs`; sandbox session + DRAFT bookable row + the two test accounts booked and checked in + two throwaway test players):
```
check-in 502fbdec → 200 {"added":true}   check-in 11e314ea → 200 {"added":true}
challenge 50f4bc91 accepted
GET /api/sessions/<ops id>/challenges      (admin)        → 200 [{"status":"accepted","aName":"TEST PLAYER","bName":"ZZ-SANDBOX-GOODWILL Tester",…}]
GET /api/sessions/<bookable id>/challenges (admin)        → 200 (same pair)
GET /api/sessions/<ops id>/challenges      (CAPTAIN role) → 200 (same pair)      player token → 403
header count would be: open challenges = 1
assign → 200 (pair on opposite teams) → end-game → 200 | settledChallenges in reply: []   (sandbox: nothing settles)
challenge after sandbox score: {"status":"accepted","game_result_id":null}
teardown: session end → {"deleted":true,"sandbox":true}; bookable/bookings/challenge/test players/notifications removed
FINAL STATE: {"active":0,"zz_sessions":0,"zz_bookable":0,"challenges":0,"zz_players":0,"cards":0}
```
DOM assertion of the "vs" tag / header count was not possible (Playwright not installed — see C4); the row tag and header count are rendered from the same endpoint payload above and are pinned at source; `CourtCard` labels are rendered for real in jsdom.

---

## FINAL — 2026-09-07

**Gates completed: C1, C2, C3, C4, C5 — all deployed and live-verified.** Gates skipped: none.

| Gate | Commit | Railway deploy | Live evidence |
|---|---|---|---|
| C1 table + endpoints | `ff67c44` | `3b83a424` | `/mine` 200 with empty sets; status 200 `canChallenge:true` vs the other test account; unauth 401; self → "This is you" |
| C2 settlement | `81e4085` | `7bd8bb58` | sandbox: accepted challenge + score entry → still accepted, no feed rows, no settled notifications; 1040/1040 |
| C3 feed cards | `acec5d8` | `54f81c88` | `challenge_accepted` card in the feed API with display tiers; like → 1 / unlike → 0; row `published`, `ca:<id>`, no game anchor |
| C4 player UI | `075a7b1` | `0c455539` | status → create → both `/mine` → `challenge_received` → accept → active both sides → feed card → pair rule 409 |
| C5 captain view | `d3eaa08` | `4e98a077` | endpoint via ops/bookable id, admin + captain roles, player 403; reply `settledChallenges: []` in sandbox |

Also on the branch before C1: the six `_key → _unique` constraint renames (approved), the one-shot `challenges_table_v1` migration, and the `db:push` guard.

**Test-data teardown — confirmed.** Every verification script deleted what it created and printed its final state; the last one: `{"active":0,"zz_sessions":0,"zz_bookable":0,"challenges":0,"zz_players":0,"cards":0}`. Zero active sandbox sessions. The two pre-existing `ZZ-SANDBOX-GOODWILL` ended sessions (17 Aug fixtures) were never touched. Test accounts used: TEST PLAYER (SIQ-00345) and ZZ-SANDBOX-GOODWILL Tester only; no real player was written to at any point.

**Untracked helper scripts left on disk (never staged):** `scripts/scratch/{mint-mp-token,mint-admin-token,c2-sandbox-verify,c3-feed-verify,c4-mine-verify,c4-browser,c5-captain-verify,tz-probe}.mjs`. Safe to delete; `c4-browser.mjs` needs Playwright, which is not installed.

**Sandeep to review or decide:**
- **drizzle-kit upgrade gate** (PG18-aware release) — re-preview with `push --strict --verbose`, stdin closed, and lift the `db:push` guard only when the plan is empty. Until then, all schema changes go through `scripts/one-shot/*.mts`.
- **`npm run check` has 28 pre-existing tsc errors** — this build held the count at 28; separate cleanup gate.
- **Captain allow-list is now 34** (`GET /api/sessions/:id/challenges`, read-only) — confirm you're happy with captains seeing challenge pairings.
- **Brand:** feed cards use the app's navy token `#002C84` (the brief's `#003E8C` literal is banned under `pages/marketplace` by the Gate-2 pin) and `MKT.tealText` `#006B5F`.
- **Placement:** settlement was wired inside `storage.completeGameTransaction` (where the transaction lives), not `routes.ts` as the brief named — same tx, before the feed emitter.
- **First real settlement and the `challenge_settled` feed card are still to be observed on the next live session** (only sandbox negatives could be run without touching real players). Watch a session with an accepted challenge between two booked players on opposite teams.
- **Score-edit path** (`PATCH /api/game-results/:id`): winner flip + card supersede are unit-tested and pinned, not exercised live.
- Playwright is not in the project; DOM walkthroughs for C3–C5 UI were replaced by jsdom renders + API evidence. Installing it (a download + lockfile change) is your call.

**Sandeep to review (standing):**
- **Never run `npx drizzle-kit push` (or `npm run db:push`) against production with drizzle-kit 0.31.4 on PostgreSQL 18** — it would drop 310 NOT NULL constraints, the wallet floor CHECK and the queue/suggestion uniqueness guards. The script is now guarded.
- `npm run check` (bare `tsc`) has 28 pre-existing errors on `railway-migration`; this build treats "pass" as "no new errors". Separate cleanup gate later.
- The `_key` vs `_unique` naming drift means `drizzle-kit push` has been unusable without manual intervention since these tables were created outside drizzle's naming; the batch above fixes that for good.
