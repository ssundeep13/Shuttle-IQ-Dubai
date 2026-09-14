# IQ Pass — build plan (read-only diagnosis, 2026-09-14)

Branch `railway-migration` at `73e44b2`. Nothing in this document has been built, staged, committed, migrated or deployed. The product spec in the brief is treated as locked; this plan only adds the engineering.

Evidence base: every `server/`, `shared/`, `client/` and `tests/` path below was read at the line numbers cited; the test suite and `tsc` were run once; the production database was queried read-only (SELECT only) for capacity and volume facts; Railway config was read with the CLI (variable names only, no values printed).

---

## A. Findings

### A.1 Prior findings, verified

| # | Prior finding | Verdict | What is actually true |
|---|---|---|---|
| 1 | No purchase-group column on `bookings` | **CONFIRMED** | Live `bookings` has 24 columns (read from `information_schema`); none groups rows. `discount_code_id` is per-booking. Drizzle table at `shared/schema.ts:447-491`. |
| 2 | No reschedule primitive, only cancel + create | **CONFIRMED** | Route inventory `server/marketplace-routes.ts:2845-5292` has create (`:3011`), cancel (`:4013`), guest add/remove, admin confirm/promote. Nothing moves a booking between sessions. |
| 3 | Webhook drops unknown intents | **CONFIRMED** | `server/webhookHandler.ts:159-164`: booking lookup by intent misses → `confirmGuestByIntentId` → `:25-28` logs a warning, returns `{ confirmed:false, error:'guest_not_found' }`, route answers 200 (`:435-443`). Nothing is persisted. A pack intent would be silently dropped today. |
| 4 | `venue_awards` requires a venue PK | **CORRECTED** | The table's composite PK is `(user_id, venue_id, badge_type)` with `venue_id NOT NULL` (`shared/schema.ts:1178-1187`), but `venue_id` is **not a foreign key** and the only writer hard-codes `SILICON_OASIS_VENUE_ID` (`server/venueAwards.ts:20`). `bookable_sessions` carries `venue_name` text only, no venue id; the `venues` table has 20 rows vs 23 distinct venue names on sessions. So: a venue *string id* is required, not a PK relation, and there is no session→venue link to derive it from. Irrelevant to IQ Pass (perks are not venue-scoped). |
| 5 | Scheduler is in-process `setInterval`, no run ledger | **CONFIRMED** | `server/scheduler.ts:519-557` registers 8 `setInterval` jobs + 1 daily `setTimeout` chain (`:486-491`), started from `server/index.ts:209` after listen. No persistence; no `job_runs`-like table exists (queried `information_schema.tables`). |
| 6 | App-wide cancel rule is 5 hours | **CONFIRMED** | Single source `isWithinLateCancelWindow` at `server/guestSlotRefund.ts:25-33` (`sessionStartEpochMs − 5h`), used by the cancel route (`marketplace-routes.ts:4025-4031`) and guest-slot settle (`guestSlotRefund.ts:147`). Client mirrors: `client/src/pages/marketplace/MyBookings.tsx:98-103`, `client/src/lib/primaryCancel.ts:64`. (The 4-hour figure elsewhere is the waitlist *payment* window, a different rule.) |
| 7 | Sessions query is unbounded | **CONFIRMED, with nuance** | `storage.getUpcomingBookableSessions` (`server/storage.ts:2192-2209`): lower bound = today, `linked_session_id IS NOT NULL`, **no upper date bound, no LIMIT**, plus two count queries per session (N+1). Fine at today's volume (~20 upcoming sessions) but the 4-week calendar should get its own bounded query rather than reuse this. |

### A.2 The 3 Sep webhook capacity-race fix — where it lives

**It does not exist in the tree.** `git status` clean (only `.claude/`, `.env`, `scripts/scratch/` untracked); `git log --oneline -30` has no such commit; `git stash list` is empty; no local or remote branch carries it; `grep -rn 409` on `initiate-payment` finds nothing (the route at `marketplace-routes.ts:3469-3538` returns 400/403/404/410/502/500 only).

It exists only as a **proposed diff in this session's transcript**, timestamped 2026-09-03 13:01 UTC, titled "Proposed fix (diff for review — NOT applied)". It is reproduced verbatim in Appendix 1 so it is no longer only in a chat log. The race branch it targets is unchanged at `server/webhookHandler.ts:178-191`: a booking that pays but loses the capacity race is re-waitlisted **without** a `payments` row, and the three promotion sites then treat it as unpaid and mint a second intent.

### A.3 New findings relevant to IQ Pass

- **N1 No client feature-flag plumbing.** `SELF_SCORING_ENABLED` is server-only (`marketplace-routes.ts:5952`); the client has no config endpoint and no `VITE_` feature flags (`client/src/App.tsx:229-232` parks a route by redirect). IQ Pass needs a tiny config read (Gate 1).
- **N2 `Checkout.tsx` is orphaned.** No in-app link targets `/marketplace/checkout/:id`; the live booking path is `SessionDetails.tsx` `InlineBookingPanel` (`:192-`, POST at `:265-280`, `openCheckoutRedirect` at `:304-305`). Reuse that panel's patterns, not `Checkout.tsx`.
- **N3 Five divergent "collected revenue" predicates** already disagree before IQ Pass: `server/portal/sessionProfit.ts:68` (ziina|bank_transfer|paid cash), `sessionProfit.ts:173` (refund lookup, omits bank_transfer), `server/storage.ts:3698,3766` (ziina|bank_transfer + paid cash), `storage.ts:3734` and `storage.ts:4001,4068` (ziina only — missed the BT1 update). Every one silently excludes an unknown `payment_method`. Captain pay is `round(0.25 × max(0, value − costs))` per session (`server/portal/portalFinance.ts:25-32`, applied `:320`), driven entirely by `bookings.amount_aed` through that classifier. **A pack seat with `amount_aed = 0` or an unrecognised method zeroes captain pay and P&L for that session.**
- **N4 `payments.booking_id` is NOT NULL** (`shared/schema.ts:516`, live schema). "One payments row per pack" cannot be written without either relaxing that constraint or attaching the row to one of the seats (decision E1).
- **N5 The 4-hour hold sweep is keyed on `promoted_at IS NOT NULL`** (`storage.ts:2744-2754`) and `initiate-payment` returns 400 for a `pending_payment` booking without `promoted_at` (`marketplace-routes.ts:3481-3483`). Pack holds created with `promoted_at NULL` are therefore invisible to both today — useful, and must be pinned by tests.
- **N6 `unique_active_booking_per_session`** partial unique index on `(user_id, session_id) WHERE status <> 'cancelled'` (live). A pack pick on a session the player already holds a drop-in for will raise 23505; the calendar must exclude such sessions and the route must map the error to 409.
- **N7 The public Rankings projection is pinned to exactly 7 keys** (`server/playerRoutes.ts:56`, `tests/player-endpoints-lockdown.test.ts:191-205`); adding `packTier` there trips an approved pin. Rankings already uses an overlay map pattern (`topTagMap`, `Rankings.tsx:146-150`), which is the natural home for the tier pill.
- **N8 Bottom nav is at its five-tab ceiling** (`client/src/components/MobileBottomNav.tsx:5-7`, pinned by `tests/bottom-nav-labels.test.tsx:15-20`). Entry point goes in the avatar dropdown (`MarketplaceNav.tsx:42-49`) plus a banner on Sessions.
- **N9 Session-cancel path** `storage.cancelBookableSessionAndRefund` (`storage.ts:2311-2420`) queues "Full refund of AED n owed" notifications for every confirmed booking; for a pack seat that would ask for a refund of its allocation instead of granting a re-pick. Needs a pack branch.
- **N10 Waitlist order** is `created_at ASC` in one storage method (`storage.ts:2445-2451`) consumed by all three promotion sites and the admin renumbering. Priority waitlist for Plus+ is a one-method change.
- **N11 Ziina test mode is tied to `NODE_ENV`** (`server/ziinaClient.ts:156`: `test: NODE_ENV !== 'production'`); the single token `ZIINA_API_TOKEN` serves both. Railway has **one environment (production)**, `NODE_ENV=production`, so every intent created by the deployed app is real money. No preview/staging environment exists. `IQ_PASS_ENABLED` is not set.
- **N12 Resend** sends from `ShuttleIQ <noreply@shuttleiq.org>` (`server/emailClient.ts:5`), key is send-only (no list API), no idempotency on booking emails; the challenge email (C6) already uses Resend idempotency keys (`emailClient.ts:276-285`) — the pattern to copy.
- **N13 Test suite (one run):** 102 files, **1257 tests, 1256 passed, 1 failed** (`tests/portal-runner-wall.test.ts`, the known 5-second timeout flake), vitest duration **68.6 s** (80 s wall). `tsc`: **28 errors** (the standing baseline).
- **N14 Volume facts (prod, read-only):** upcoming linked sessions in the next 28 days ≈ 20 across three venues (Smash 18 seats, Bright Riders 24, Fire Rallies 24); capacity mix over all sessions 18 (44), 24 (73), 36 (9), a few 12/16/30/42; price AED 49 on 118 of 137 sessions. **42 players had ≥4 confirmed bookings in the last 28 days** (the natural first cohort). 50% caps: 18→9, 24→12, 36→18.

---

## B. Risks

| Sev | Risk | Where it bites | Mitigation in this plan |
|---|---|---|---|
| **High** | Captain pay and P&L zero-count pack sessions (N3) | `sessionProfit.ts:63-76`, `portalFinance.ts:320`, `storage.ts:3698-3800,4001-4068` | Gate 3: write a per-seat allocation into `bookings.amount_aed` (E2) with `payment_method='iq_pass'`, add `iq_pass` to every collected predicate, pin with tests before any real pack exists. |
| **High** | Existing paid-booking loss on capacity race (A.2) | `webhookHandler.ts:178-191` + 3 promotion sites | Gate 0 ships the 3 Sep fix first, RED tests for the race. |
| **High** | Pack confirmation not atomic → paid pack with some seats still `pending_payment` | new confirm path | One `db.transaction` with `FOR UPDATE` on the pack row and a `RETURNING` count that must equal `games_total`, else rollback (Gate 2). |
| **High** | Oversell of the 50% cap under concurrent purchases | new purchase path | Purchase transaction locks the picked `bookable_sessions` rows (`SELECT … FOR UPDATE`) before counting pack seats (Gate 2). |
| **High** | Real-money exposure while verifying (N11) | every Ziina call in prod | Flag stays OFF in prod until Gate 8; pack flows verified on a staging environment with test-mode intents (E4); one explicit real-money test at flag-on. |
| **Med** | `payments.booking_id` relaxation ripples through TypeScript readers (N4) | `Payment.bookingId: string` consumers (`webhookHandler.ts:392-396`, `portalReconcile.ts:236-259`, refund routes) | E1 decides; if relaxed, `tsc` must stay at 28 — each reader gets a null guard, pinned. |
| **Med** | Existing sweeps touch pack holds | `runExpiredPaymentJob` (`scheduler.ts:236-322`), reconciliation (`storage.ts:2761-2783`), guest orphan sweep | Holds carry `promoted_at NULL` → out of the 4-hour sweep by construction (pin); pack intents get their own reconciliation query; guest sweep only sees non-primary pending guests. |
| **Med** | Session cancelled by ShuttleIQ asks for "AED 47 refund" on pack seats (N9) | `storage.ts:2375-2410` | Pack branch: grant `repick_credits += 1`, notify, no refund row (Gate 4). |
| **Med** | Player-facing surfaces leak per-game maths ("AED 47") | `MyBookings.tsx:4005 totalPaidAed`, admin panel `SessionsManagement.tsx:1199` | Client branches on `packId` and shows "IQ Pass · Club Plus"; admin sees the allocation (admins may). Pinned. |
| **Med** | Waitlist priority changes fairness silently | `storage.ts:2445-2451` | Stable sort in JS after fetch; with no active Plus+ packs the order is byte-identical (pinned). |
| **Med** | Reconcile mis-buckets pack charges and pack-seat guest charges | `portalReconcile.ts:249-259,291-302` | Pack intents get `expected = price_aed × 100`; pack seats with extra guests compare against `(amount_aed − allocation)`. Tests in `tests/portal-reconcile.test.ts`. |
| **Med** | Flag-off drift: a new 200 endpoint or a changed `/auth/me` shape while the flag is off | config endpoint, `/auth/me`, players payloads | Every new key/route is emitted only when `IQ_PASS_ENABLED==='true'`; the config endpoint 404s when off; the extra pack lookup in the webhook runs only when on. A tripwire test asserts the off-path emits nothing new. |
| **Low** | 7-key public projection pin (N7) | `tests/player-endpoints-lockdown.test.ts:203` | Overlay endpoint instead (E5). |
| **Low** | Bottom-nav pin (N8) | `tests/bottom-nav-labels.test.tsx` | Dropdown + banner (E6). |
| **Low** | Hex-literal / font pins for new marketplace files | `tests/gate2-typography-brand.test.tsx:141-150` | New files import `MKT`/`FF_*` from `LandingComponents.tsx:17-52`; never inline `#003E8C`/`#F5EFE0`/`#006B5F`. |
| **Low** | Wallet balances | none | No pack code path touches `players.wallet_balance` or `applyWalletDelta`; wallet is not an eligible tender. Referral rewards keep flowing through the untouched `fireReferralOnPayment` hook. |

---

## C. Schema changes

All statements run through a one-shot script (`scripts/one-shot/2026-09-15-iq-pass-v1.mts`, registry key `iq_pass_v1`, same shape as `scripts/one-shot/2026-09-05-challenges-table.mts`), **before** the code that adds the Drizzle columns is deployed (column-add rule). `npm run db:push` stays blocked.

```sql
-- New table: one row per pass purchase (hold → active → completed | cancelled)
CREATE TABLE "packs" (
  "id"                       varchar PRIMARY KEY NOT NULL,
  "user_id"                  varchar NOT NULL,                     -- marketplace_users.id (app-level, house style)
  "tier"                     text NOT NULL,                        -- 'club' | 'club_plus' | 'club_elite'
  "games_total"              integer NOT NULL,                     -- 4 | 8 | 12
  "price_aed"                integer NOT NULL,                     -- 188 | 360 | 516
  "status"                   text DEFAULT 'pending_payment' NOT NULL, -- pending_payment | active | completed | cancelled
  "ziina_payment_intent_id"  text,
  "window_start"             text NOT NULL,                        -- 'YYYY-MM-DD' Dubai calendar day (same reasoning as session_series.origin_date)
  "window_end"               text NOT NULL,                        -- window_start + 27 days
  "hold_expires_at"          timestamp with time zone NOT NULL,    -- created_at + 30 min
  "paid_at"                  timestamp with time zone,
  "cancelled_at"             timestamp with time zone,
  "cancellation_reason"      text,                                 -- 'hold_expired' | 'intent_failed' | 'admin'
  "repick_credits"           integer DEFAULT 0 NOT NULL,           -- free re-picks from ShuttleIQ-cancelled sessions
  "jersey_size"              text,
  "jersey_handed_over_at"    timestamp with time zone,
  "renewal_email_sent_at"    timestamp with time zone,
  "followup_email_sent_at"   timestamp with time zone,
  "created_at"               timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX  "idx_packs_user_status"       ON "packs" ("user_id", "status");
CREATE UNIQUE INDEX "uq_packs_intent"       ON "packs" ("ziina_payment_intent_id") WHERE ziina_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX "uq_packs_one_hold"     ON "packs" ("user_id") WHERE status = 'pending_payment';

-- New table: ledger for scheduled jobs (first user: the renewal job)
CREATE TABLE "job_runs" (
  "id"          varchar PRIMARY KEY NOT NULL,
  "job_name"    text NOT NULL,
  "started_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "status"      text DEFAULT 'running' NOT NULL,                   -- running | ok | error
  "details"     jsonb,
  "error"       text
);
CREATE INDEX "idx_job_runs_name_started" ON "job_runs" ("job_name", "started_at");

-- Existing tables: nullable columns only
ALTER TABLE "bookings" ADD COLUMN "pack_id" varchar;               -- set on every pack seat
ALTER TABLE "bookings" ADD COLUMN "moved_from_booking_id" varchar; -- audit trail for moves / re-picks
CREATE INDEX "idx_bookings_pack" ON "bookings" ("pack_id") WHERE pack_id IS NOT NULL;
ALTER TABLE "payments" ADD COLUMN "pack_id" varchar;               -- the single pack payment row
```

**NOT additive — flagged, gated on decision E1:**

```sql
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;    -- constraint relaxation, no data change
```

No `payment_method` enum exists (`bookings.payment_method` is free text, `shared/schema.ts:453`), so the new value `'iq_pass'` needs no DDL. Drizzle mirrors: `packs`, `jobRuns`, `bookings.packId`, `bookings.movedFromBookingId`, `payments.packId` (+ `payments.bookingId` nullable if E1 = recommended) in `shared/schema.ts`. Timestamps on the new tables are `timestamptz`, matching the C1 `challenges` precedent; readers of the naive-UTC `bookings` columns are unchanged.

Rollback of the migration: additive objects can stay (invisible with the flag off) or be dropped by a reverse one-shot only while `packs` is empty. The NOT NULL can be re-added only while no `payments` row has a NULL `booking_id`.

---

## D. Gate plan

Standing rules for every gate: RED tests first; stage only named files; `npx vitest run` written to a file and exit code checked (never piped through grep); `tsc` stays at 28; push = Railway deploy → poll `railway deployment list --json` to SUCCESS → `curl /api/health` 200; live verification with the two test accounts only (TEST PLAYER `b23351aa…`, ZZ-SANDBOX-GOODWILL Tester `e26b3e7d…`) and full teardown; never `railway down`; never `db:push`; no wallet writes. Each gate ends with a build-report entry in `docs/iq-pass/BUILD-REPORT.md` (created at Gate 0).

Effort figures are agent working time.

### Gate 0 — Webhook capacity-race fix (prerequisite, no pack code)

**Files**
- Modify `server/webhookHandler.ts:178-191` (record the payment in the race branch, return `paid: true`) and add export `confirmPromotedBookingIfPaid(booking)`.
- Modify the three promotion sites, right after each `status: 'pending_payment'` write: `server/marketplace-routes.ts:4174-4178` (cancel cascade), `server/guestSlotRefund.ts:265-270` (`promoteFirstFittingWaitlisted`), `server/scheduler.ts:278-283` (expiry cascade). When the helper confirms, emit a `waitlist_promoted` notification titled "Your spot is confirmed" and **skip** the pay-by-deadline notification + `sendWaitlistPromotionEmail`.
- Modify `server/marketplace-routes.ts:3469-3538` (`initiate-payment`): after the `promotedAt`/deadline guards, `409 { error:'already_paid' }` when a `completed` payments row exists.
- Create `tests/webhook-capacity-race.test.ts`.

The diff is Appendix 1, adjusted for today's line numbers. Import direction is safe: `guestSlotRefund.ts` may import from `webhookHandler.ts` (which does not import it back).

**Tests first (RED)**
1. `confirmZiinaBookingByIntentId` — full session + `pending` booking: `createPayment` called once with `{ status:'completed', ziinaPaymentIntentId }`, booking updated to `waitlisted` with position `waitlistCount+1`, result `{ confirmed:false, waitlisted:true, paid:true }` (`vi.mock('../server/storage')`, plus mocks for `referrals`, `venueAwards`, `dubailandPromo`, `goodwillCredit`, `emailClient`).
2. Same scenario with the payments row already present → no second `createPayment`.
3. `confirmPromotedBookingIfPaid` — no completed row → `false`, no confirm call; completed row → calls the confirm path with `"completed"` and returns `true`.
4. Tripwires: each of the three sites contains `confirmPromotedBookingIfPaid(` after its `status: 'pending_payment'` write and before `sendWaitlistPromotionEmail(`; the pay-now notification lives inside the `else` branch.
5. HTTP: `initiate-payment` mounted on a throwaway `express()` behind the real `server/auth/middleware` with `JWT_SECRET='test-main-secret'` — a `pending_payment` booking with a completed payments row → **409**; without → the existing path proceeds (mock `createZiinaPaymentIntent`).
6. Existing pins must stay green: `tests/hold-controls.test.ts:78-80` (`if (booking.cancelledAt)`, `not resurrecting`), `tests/venue-awards.test.ts:165-169`, `tests/dubailand-promo.test.ts:95-98`, `tests/goodwill-auto-credit.test.ts:356-410`.

**Verify (prod, test data)**
- On a session with ≥3 free seats: insert a ZZ-tester `confirmed` booking (+ primary guest row) and a TEST PLAYER `waitlisted` booking with a synthetic `completed` payments row. Cancel the ZZ-tester booking through `POST /api/marketplace/bookings/:id/cancel` as that user (minted token under `railway run`). Expect TEST PLAYER booking `confirmed` (not `pending_payment`), notification "Your spot is confirmed", no pay-by notification. Read back rows.
- Insert a TEST PLAYER `pending_payment` hold (`promoted_at = now()`) with a synthetic completed payments row; `POST …/initiate-payment` → 409 body `already_paid`. Then release it via admin `payment-not-received`.
- Teardown: delete the test bookings, guests, payments, notifications; confirm the session's `spotsRemaining` is back to baseline via `GET /api/marketplace/sessions/:id`.
- Commit `Webhook: record payment on capacity race, honour paid bookings at promotion, 409 on re-pay`.

**Rollback:** `git revert` + push. No schema. **Effort:** 3–4 h.

### Gate 1 — Schema, flag, config read, pure rules (deploys with the flag off)

**Files**
- Create `scripts/one-shot/2026-09-15-iq-pass-v1.mts` (Section C; `--dry-run`, `information_schema` pre-checks, registry insert; the E1 statement included only if approved).
- Modify `shared/schema.ts`: `packs`, `jobRuns`, `bookings.packId`, `bookings.movedFromBookingId`, `payments.packId` (+ nullable `bookingId` per E1), types `Pack`, `JobRun`, `PackTier`.
- Create `server/iqPass/flag.ts` — `isIqPassEnabled(): boolean` (`process.env.IQ_PASS_ENABLED === 'true'`).
- Create `server/iqPass/rules.ts` — pure, no DB:
  ```ts
  export const IQ_PASS_TIERS = {
    club:       { label: 'Club',       games: 4,  priceAed: 188, allocationAed: 47 },
    club_plus:  { label: 'Club Plus',  games: 8,  priceAed: 360, allocationAed: 45 },
    club_elite: { label: 'Club Elite', games: 12, priceAed: 516, allocationAed: 43 },
  } as const;                                  // 4×47=188, 8×45=360, 12×43=516 — exact, no rounding drift
  export const HOLD_MINUTES = 30;
  export const PACK_CAP_RATIO = 0.5;
  export function packSeatCap(capacity: number): number;            // Math.floor(capacity * 0.5)
  export function isPlusOrAbove(tier: PackTier): boolean;
  export function windowFor(todayDubai: string, currentPassLastGame: string | null): { start: string; end: string };
  export function validatePicks(input: {
    tier: PackTier;
    picks: string[];                                             // session ids chosen by the player
    window: { start: string; end: string };                      // from windowFor()
    sessions: Array<{ id: string; dateDubai: string; status: string; linked: boolean; capacity: number; spotsRemaining: number; packSeats: number }>;
    alreadyBookedSessionIds: Set<string>;                        // player's active bookings (unique index N6)
  }): { ok: true } | { ok: false; status: 400 | 409; error: string; sessionId?: string };
  export function canMoveSeat(sessionDate: Date | string, startTime: string, now: Date): boolean; // same 5h cutoff as isWithinLateCancelWindow
  export function jerseyEligible(tier: PackTier, priorEliteCount: number): boolean;
  ```
- Modify `server/marketplace-routes.ts`: `GET /api/marketplace/config` → `{ iqPassEnabled: true }` when on, **404** when off (so the flag-off route table is unchanged).
- Create `tests/iq-pass-rules.test.ts`, `tests/iq-pass-schema.test.ts`.

**Tests first (RED)**
- Tier table exactness (prices, games, allocation × games = price); `packSeatCap(18)=9`, `(24)=12`, `(36)=18`; window from today vs day-after-last-game, 28-day span; `validatePicks`: wrong count, out-of-window, duplicate session, already-booked session, per-session cap reached (uses live counts passed in), session not upcoming/linked; `canMoveSeat` at exactly −5h and −5h+1ms; `jerseyEligible` true only for `club_elite` with zero prior elite packs.
- Schema pins: `packs`/`jobRuns` declared with the columns above; migration file contains each DDL statement once; flag helper string-pinned.
- HTTP: `/api/marketplace/config` 404 with flag unset, 200 `{ iqPassEnabled: true }` with it set.

**Verify:** run the one-shot `--dry-run` then for real under `railway run` with the `PUB_DB_URL` launcher (memory recipe); confirm `information_schema` shows the new tables/columns and the registry row; deploy code; `curl /api/marketplace/config` → 404 (flag off); `/api/health` 200; full suite green.

**Rollback:** revert code; leave additive objects (harmless) or reverse one-shot while `packs` is empty. **Effort:** 4 h (+ the go for the migration).

### Gate 2 — Purchase hold, single Ziina payment, atomic confirm, hold expiry (server only)

**Files**
- Create `server/iqPass/storage.ts` (Drizzle helpers): `createPackHoldTx`, `getPack`, `getPackByZiinaPaymentIntentId`, `getActivePacksForUser`, `countPackSeatsBySession(sessionIds)`, `listCalendarSessions(windowStart, windowEnd)` (bounded query, one aggregate for seat counts — no N+1), `expirePackHoldsTx(now)`, `getPacksPendingReconciliation(withinMs)`.
- Create `server/iqPass/purchase.ts`: `startPurchase({ userId, tier, sessionIds, jerseySize, returnScheme })`:
  1. `db.transaction`: `SELECT … FOR UPDATE` on the picked `bookable_sessions` rows; recount pack seats + spots; `validatePicks`; insert `packs` (`pending_payment`, `hold_expires_at = now()+30m`); insert N `bookings` rows `{ status:'pending_payment', paymentMethod:'iq_pass', amountAed: allocationAed, spotsBooked:1, packId, promotedAt: null, walletAmountUsed:0 }` + one primary `booking_guests` row each (`is_primary`, `status:'pending'`, `linked_user_id`), mirroring `marketplace-routes.ts:3131-3141`; 23505 → 409 `already_booked`.
  2. Outside the transaction: `createZiinaPaymentIntent({ amountAed: priceAed, message: 'ShuttleIQ IQ Pass · <label>' })` with return URLs carrying `pack_id` (extend `buildZiinaReturnUrls` in `server/ziinaReturn.ts` with an optional `packId`; `tests/ziina-return.test.ts` gets cases). On failure: cancel the hold (`cancellation_reason:'intent_failed'`) and 502, same wording as `:3315-3325`.
  3. Store the intent id on the pack; respond `{ packId, redirectUrl }`.
- Create `server/iqPass/confirm.ts`: `confirmPackByIntentId(intentId)` — one transaction: pack `FOR UPDATE`; `active` → `{ confirmed:true, alreadyConfirmed:true }`; not `pending_payment` (hold expired/cancelled) → record the payments row + `refund_required` notification (same shape as `webhookHandler.ts:59-78`) and return `{ confirmed:false, error:'pack_hold_expired' }`; else pack → `active`, `paid_at`; `UPDATE bookings SET status='confirmed' WHERE pack_id=$1 AND status='pending_payment' RETURNING id` and **throw if count ≠ games_total**; primary guest rows → `confirmed`; insert the single payments row `{ packId, bookingId: <per E1>, ziinaPaymentIntentId, amount: priceAed, status:'completed', completedAt }`. After commit (fire-and-forget, never inside the tx): `fireReferralOnPayment(userId, firstBookingId)` once, `syncFoundingMemberForUser(userId)`, `fireGoodwillCredit(bookingId, 'iq-pass-confirm')` per seat, notification `iq_pass_active`, `sendIqPassConfirmationEmail`.
- Modify `server/webhookHandler.ts:159-164`: when the booking lookup misses **and the flag is on**, try `getPackByZiinaPaymentIntentId` before falling through to `confirmGuestByIntentId`. Existing pins (`if (booking.cancelledAt)`, `not resurrecting`, the `confirmGuestByIntentId` slice, `status: "confirmed"` followed by `syncFoundingMemberForUser`) are untouched.
- Modify `server/marketplace-routes.ts`: `POST /api/marketplace/iq-pass/packs/:id/confirm` (no auth, UUID is the secret, mirrors `:3372-3416`: retrieve intent → if successful `confirmPackByIntentId`); guards on existing routes — `cancel` (`:4013`) 400 `iq_pass_seat` before any write; `initiate-payment` explicit 400 `iq_pass_seat`; admin `admin-confirm`, `cash-paid`, `payment-not-received`, `admin-promote` 400 `iq_pass_seat` (pack seats are managed through pack routes only).
- Modify `server/scheduler.ts`: `runPackHoldExpiryJob` every 5 min and pack reconciliation folded into `runZiinaReconciliationJob`, **registered only when the flag is on** (`startScheduler`). Expiry: pack → `cancelled/hold_expired`, its `pending_payment` seats → `cancelled` (`cancellation_reason:'iq_pass_hold_expired'`), guest rows → `cancelled`, notification `iq_pass_hold_expired`, then `promoteWaitlistForFreedSpots(sessionId, 1)` per freed session (existing helper, `guestSlotRefund.ts:323`).
- Create `server/iqPassEmail.ts` (pure builder, like `server/challengeEmail.ts`) + `sendIqPassConfirmationEmail` in `server/emailClient.ts` with Resend idempotency key `iq-pass-confirm:<packId>`. Opening line exactly: **"You're now a {label} member of ShuttleIQ. Your IQ Pass is active — {n} games locked."** followed by the session list (date, time, venue).
- Create `tests/iq-pass-purchase.test.ts`, `tests/iq-pass-confirm.test.ts`, `tests/iq-pass-guards.test.ts`, `tests/iq-pass-email.test.ts`.

**Tests first (RED)**
- Purchase: happy path writes pack + N seats + N primary guest rows with the exact field values above; cap breach → 409 with the offending session id; already booked → 409; wallet/promo fields ignored; intent failure cancels the hold and returns 502; hold uniqueness (second hold → 409).
- Confirm: idempotent; seat-count mismatch rolls back everything (spy on `tx.rollback` / assert no `payments` insert); expired hold → payment recorded + `refund_required`, pack stays cancelled; hooks fire after commit; email opening line pinned verbatim; Resend key pinned.
- Webhook dispatch order: booking → pack (flag on) → guest; **flag off: `getPackByZiinaPaymentIntentId` is never called** (byte-identical path).
- Guards: each listed route returns 400 `iq_pass_seat` for a booking with `packId`; `getExpiredPendingPaymentBookings` predicate still contains `promotedAt IS NOT NULL` (pin); `initiate-payment` on a pack seat is refused before any Ziina call.
- Scheduler: `startScheduler` registers the pack jobs only under the flag (tripwire on the `if (isIqPassEnabled())` block).

**Verify (staging, E4 — flag on, `NODE_ENV≠production` so intents are Ziina test mode):** as TEST PLAYER call `POST /iq-pass/purchase` for Club with 4 sessions; read back pack + 4 seats `pending_payment`; `GET /api/marketplace/sessions/:id` shows `spotsRemaining` reduced by 1 on each; pay with a Ziina test card; poll `/iq-pass/packs/:id/confirm` → `confirmed`; read back: pack `active`, 4 seats `confirmed`, one payments row for 188, `/api/marketplace/sessions/:id/players` lists TEST PLAYER; confirmation email visible in Resend dashboard with the pinned opening line. Second run: let the hold lapse 30 min → sweep cancels pack + seats, capacity restored. Teardown all rows. **In prod:** deploy with flag off; `/api/health` 200; verify the webhook path is unchanged by replaying nothing (no pack rows exist).

**Rollback:** revert; any test pack rows on staging only. **Effort:** 8–10 h.

### Gate 3 — Finance correctness before any real pack (server + portal)

**Files**
- Modify `server/portal/sessionProfit.ts:68` and `:173`: add `b.paymentMethod === 'iq_pass'` to the collected bucket and the refund-lookup list (and add the missing `bank_transfer` at `:173` while there — pinned separately so the fix is visible).
- Modify `server/storage.ts` `getPublicAnalytics` (`:3698`, `:3734`, `:3766`) and `getFinanceSummary` (`:4001`, `:4068`): count `iq_pass` (and the BT1-missed `bank_transfer`) as collected; add a third `byPaymentMethod.iqPass` bucket `{ bookings, spotsBooked, amountAed }` (`:3787-3800`, type at `:186`).
- Modify `server/portal/portalFinance.ts`: `loadPackRevenueRows()` (packs with `paid_at` in month, status `active|completed`) → `aggregateMonthlyPnl` adds `iqPassRevenueAed` and `iqPassByTier: { club, club_plus, club_elite }` as **info lines** (pack seats are already inside "Collected revenue" via the per-seat allocation, so the tier line is not added to net — stated in the footnote to avoid double counting). `server/portal/portalRoutes.ts:179-186` emits the keys; the route stays on one line (the guard pin at `tests/portal-finance.test.ts:296-303` greps single lines).
- Modify `server/portal/portalReconcile.ts:236-259`: intent map also reads `packs.ziina_payment_intent_id` with `expected = price_aed × 100`, bucket label "IQ Pass"; for a booking with `pack_id`, expected guest cash = `(amount_aed − allocation) × 100`.
- Modify `client/portal/pages.tsx`: `PnlRow` (`:64-73`) + header/body cells (`:92-114`) gain "IQ Pass (info)" with a per-tier tooltip or three narrow columns; footnote (`:120-124`) explains the info line.
- Modify `client/src/pages/SessionsManagement.tsx:1199`: session revenue sum unchanged (allocation is in `amountAed`); the bookings panel row shows the label "IQ Pass" for `packId` rows (admins may see the allocation).
- Tests: extend `tests/portal-finance.test.ts` (an `iq_pass` case beside the `'comp'` exclusion pin at `:83-86`), `tests/session-profit.test.ts`, `tests/portal-reconcile.test.ts` (new bucket + pack-seat guest case beside `:110`), new `tests/iq-pass-finance.test.ts` pinning all five predicate sites by string.

**Tests first (RED):** `computeRevenueBasesFils([{ paymentMethod:'iq_pass', amountAed:47 }])` → `revenueFils 4700`; refund netting on an `iq_pass` seat with a refunded guest row; `aggregateMonthlyPnl` emits `iqPassByTier` sums from pack rows and leaves `collectedRevenueAed` untouched by them; reconcile: pack intent consistent at 18800 fils; pack seat + one guest charge of 4900 consistent; `getPublicAnalytics` shape includes `byPaymentMethod.iqPass`.

**Verify (prod, test data, flag off is fine — pure reads):** insert one TEST PLAYER `confirmed` booking with `payment_method='iq_pass'`, `amount_aed=47`, `pack_id='zz-test'` on a future session; `GET /api/public/analytics?sessionId=` → `revenueCollectedAed` +47 and `byPaymentMethod.iqPass.bookings` 1; portal `GET /api/portal/finance/sessions` (portal token) shows the session collected +47; delete the row; totals back to baseline.

**Rollback:** revert. **Effort:** 4–5 h.

### Gate 4 — Moves, re-picks, session-cancel hook, priority waitlist

**Files**
- Create `server/iqPass/moves.ts`: `moveSeat({ userId, bookingId, toSessionId, now })` — transaction: source booking `FOR UPDATE`; owner + `packId` + `status='confirmed'` + pack `active`; `canMoveSeat(source.session)` (5 h before the session being vacated — E3); refuse 409 `move_with_guests` if the source has a non-primary active guest (guests are cancelled through the existing flow first); target `upcoming`, linked, capacity ≥ 1 (session capacity only — the 50% cap is purchase-time only per spec); insert the new seat `{ confirmed, iq_pass, allocationAed, packId, movedFromBookingId: source.id }` + primary guest row; source → `cancelled` (`cancellation_reason:'iq_pass_move'`, `cancelledAt`), its guest row → `cancelled`; 23505 → 409 `already_booked`. After commit: `promoteFirstFittingWaitlisted(sourceSessionId)`, notification `iq_pass_moved`. `repickSeat({ userId, packId, toSessionId })` — same insert path, requires `repick_credits > 0`, decrements it, `movedFromBookingId` = the cancelled seat.
- Modify `server/storage.ts:2311-2420` (`cancelBookableSessionAndRefund`): inside the existing transaction, for bookings with `packId`: skip both refund-notification branches, `UPDATE packs SET repick_credits = repick_credits + 1`, insert notification `iq_pass_repick` ("Session cancelled — pick another game for your IQ Pass"). Wallet branch untouched (pack seats have `walletAmountUsed 0`).
- Modify `server/storage.ts:2445-2451` (`getWaitlistedBookingsForSession`): after the `created_at ASC` fetch, stable-sort by `hasPlusPack DESC` using `getPlusTierUserIds(userIds)` from `server/iqPass/storage.ts` (active packs, tier ∈ {club_plus, club_elite}); the pure comparator `sortWaitlistWithPriority(rows, priorityUserIds)` lives in `server/iqPass/rules.ts`. With no priority users the array is returned as fetched (identity, pinned).
- Modify `server/marketplace-routes.ts`: `POST /api/marketplace/iq-pass/bookings/:bookingId/move`, `POST /api/marketplace/iq-pass/packs/:packId/repick`, `GET /api/marketplace/iq-pass/me` (packs + seats + `canMoveUntil` per seat), all `requireAuth + requireMarketplaceAuth`, 404 when the flag is off.
- Tests: `tests/iq-pass-moves.test.ts`, `tests/iq-pass-session-cancel.test.ts`, `tests/iq-pass-waitlist-priority.test.ts`.

**Tests first (RED):** move inside/outside the 5 h cutoff; not owner 403; pack not active 409; source has guests 409; target full 409; duplicate booking 409; audit fields set; source cascade promotion called once; re-pick consumes exactly one credit and refuses at zero; session-cancel: pack seats get a credit and **no** `refund_required` row while a normal ziina seat still does (existing behaviour pinned side by side); comparator: Plus+ users first, stable within groups, identity when the set is empty; tripwire that all three promotion sites still read `getWaitlistedBookingsForSession`.

**Verify (staging):** buy a Club pass as TEST PLAYER, move one seat to another session, read back both bookings + `spotsRemaining` on both sessions; attempt a move within 5 h of a session (use a session created for the test) → 409; admin-cancel a picked session via the existing admin route → pack `repick_credits 1`, notification present, no refund row; re-pick → new confirmed seat, credits 0; ZZ tester on a waitlist behind TEST PLAYER (Plus pass) → TEST PLAYER promoted first when a seat frees. Teardown.

**Rollback:** revert. **Effort:** 6–8 h.

### Gate 5 — Tier tag on Profile, Who's Playing, Play, Rankings

**Files**
- Create `client/src/components/marketplace/IqPassTag.tsx` — `{ tier, small?, testid? }` → "Club" / "Club Plus" / "Club Elite", `MKT.navy` text on `MKT.tealMist`, `FF_BODY`, radius 3, `whiteSpace:'nowrap'`, `null` when no tier. No price, ever.
- Create `client/src/hooks/useIqPassEnabled.ts` (reads `/api/marketplace/config`, `staleTime: Infinity`, non-200 → `false`) and `useIqPassTiers()` (overlay map from `GET /api/marketplace/iq-pass/tiers`, enabled only when the flag is on).
- Server: `GET /api/marketplace/iq-pass/tiers` → `{ [playerId]: tier }` for active packs (linked players only, no PII, 404 when off); `server/iqPass/storage.ts` gains `getActiveTierByPlayerIds(playerIds)` and `getActiveTierForUser(userId)`.
- Modify `server/marketplace-routes.ts:754-808` (`/auth/me`): add `iqPass: { tier, label, gamesTotal, gamesRemaining, lastGameDate, repickCredits } | null` **only when the flag is on** (key absent when off). Client type mirror `client/src/contexts/MarketplaceAuthContext.tsx:20-33`.
- Modify `server/marketplace-routes.ts:5273-5283` (`/sessions/:id/players`): third batch lookup in the same `try`, emits `iqPassTier?` per player (flag on only). `:4610-4651` (current-suggestion): same, `iqPassTier` per player.
- Render sites: `Profile.tsx:524-546` (name row, beside `BadgeTag`) + a small "IQ Pass" card modelled on the Founding Member card at `:575-602` (tier, games remaining, next game, "Manage" → `/marketplace/iq-pass`); `SessionDetails.tsx:154-161` (beside the seal / level pill); `Play.tsx:594-595` and `PlayingScreen.tsx:262-263` (a sibling after `BadgeTag` — the exact `BadgeTag` JSX line is pinned by `tests/badge-public-surfaces.test.ts:70-77` and must not be edited); `Rankings.tsx:462-465` (rest-of-list meta row) and `:413-425` (podium) using the overlay map; `MyScores.tsx:331-341` uses the `/auth/me` field.
- Tests: `tests/iq-pass-tag.test.tsx` (jsdom render of the tag + each surface with mocked queries; flag-off renders nothing and issues no tier query), pins that the `/auth/me`, players and suggestion payloads carry the key only under the flag, and that `PUBLIC_PLAYER_KEYS` is untouched.

**Verify (staging, rendered screens in the in-app browser at 390 px):** TEST PLAYER with an active Club Plus pass shows the pill on all four surfaces; ZZ tester without a pass shows none; Rankings all-time/week/month modes all show it; flag off (toggle on staging) → no pill and no `/iq-pass/tiers` request in the network log.

**Rollback:** revert. **Effort:** 4–5 h.

### Gate 6 — Purchase UI and My Bookings

**Files**
- Create `client/src/pages/marketplace/IqPass.tsx` at `/marketplace/iq-pass` (`MarketplaceAuthRoute`, `App.tsx:156-164` pattern; static import beside `:30-58`): step 1 tier cards (name, games, price only — no "save AED", no "per game"); step 2 four-week calendar from `GET /api/marketplace/iq-pass/calendar` (grouped by Dubai day, reuses the date-tile idiom from `BookSessions.tsx:445-497`, shows venue/time, `packSeatsLeft`/full/already-booked states, pick exactly N, any venue); jersey size select shown only when `jerseyEligible` (Elite first purchase); step 3 review headed **"Your month is locked"** with the list, total, then "Pay AED n" → `POST /iq-pass/purchase` → `openCheckoutRedirect(redirectUrl)` (`client/src/lib/nativeAuth.ts`). Existing pass → management view (seats, Move, re-pick credit, next window date, "Buy next pass" opens step 1 with the window starting the day after the last picked game).
- Modify `client/src/pages/marketplace/CheckoutSuccess.tsx:114-188`: `?pack_id=` branch polls `POST /api/marketplace/iq-pass/packs/:id/confirm` with the same retry envelope; success invalidates `['/api/marketplace/bookings/mine']`, `['/api/marketplace/iq-pass/me']` and the picked sessions' players queries. `CheckoutCancel.tsx` copies the pack branch (hold keeps the seats until it lapses; copy says so).
- Modify `client/src/pages/marketplace/MyBookings.tsx`: new "IQ Pass" section above Payment Required (`:867-877`), cards for `packId` bookings: tier label instead of the amount (`totalPaidAed` hidden), "Move" (when `canMoveUntil > now`) opening a dialog that reuses the calendar list, no Cancel, no Pay Now, Add Guest unchanged (`:509`). `canCancel` (`:396`) becomes false for `packId` rows (pinned by `tests/primary-cancel-gate4.test.ts`, which reads this file — extend, don't rewrite).
- Modify `client/src/components/MarketplaceNav.tsx:42-49` (dropdown entry "IQ Pass", flag on only) and `client/src/pages/marketplace/BookSessions.tsx` (a one-line banner above the date tiles, flag on only); `MobileBottomNav.tsx:41-43` active-prefix so `/marketplace/iq-pass` lights the Sessions tab (no sixth tab).
- Server: `GET /api/marketplace/iq-pass/calendar` (window, sessions with counts, `currentPass`, `jerseyEligible`; bounded query; 404 when off).
- Tests: `tests/iq-pass-page.test.tsx` (jsdom: tier cards show no per-game or savings text — pin with a regex on the rendered DOM; pick counter enforces N; review heading text; jersey select only for Elite first purchase), `tests/iq-pass-mybookings.test.tsx` (pack card hides amount/cancel/pay-now, shows Move only before the cutoff), `tests/checkout-success-edge-cases.test.tsx` extended for the `pack_id` branch; brand pins (`MKT` imports, `FF_DISPLAY` 600 buttons per `tests/gate2-typography-brand.test.tsx:79-93`).

**Verify (staging, phone width in the in-app browser):** full purchase as TEST PLAYER end to end with a test card, landing on the success page, then My Bookings shows the four seats under "IQ Pass" with no amounts; Move dialog moves one seat; Add Guest on a pack seat still charges AED 49 through the existing flow and the guest appears on Who's Playing. Teardown.

**Rollback:** revert. **Effort:** 10–12 h.

### Gate 7 — Renewal job, job_runs ledger, admin jersey handover

**Files**
- Create `server/iqPass/renewal.ts`: `runIqPassRenewalJob(now)` — writes a `job_runs` row (`running` → `ok|error` with counts); for each `active` pack compute `lastGameDate = max(session.date)` over non-cancelled seats; renewal email when `today ∈ [lastGameDate−7, lastGameDate−1]` and `renewal_email_sent_at IS NULL`; follow-up when `today ≥ lastGameDate+7`, `followup_email_sent_at IS NULL` and the user has no newer `active|pending_payment` pack; packs with `lastGameDate < today` → `completed`. Registered in `startScheduler` via `scheduleDailyAtUtcHour(5, …)` (09:00 Dubai) **under the flag**.
- `server/emailClient.ts`: `sendIqPassRenewalEmail`, `sendIqPassFollowupEmail` (builders in `server/iqPassEmail.ts`, Resend keys `iq-pass-renewal:<packId>`, `iq-pass-followup:<packId>`); draft copy for Sandeep to edit.
- Admin: `GET /api/admin/iq-pass/packs` (requireAdmin; filters status/tier), `POST /api/admin/iq-pass/packs/:id/jersey-handed-over`; a compact table on a new admin page `client/src/pages/IqPassAdmin.tsx` at `/admin/iq-pass` (player, tier, games, paid at, jersey size, handed-over toggle, next window).
- Tests: `tests/iq-pass-renewal.test.ts` (fake clock: exactly-once send across repeated daily runs, follow-up suppressed by a newer pack, completion transition, `job_runs` row per run with `ok`/`error`), `tests/iq-pass-admin.test.tsx`.

**Verify (staging):** seed a pack whose last game is in 7 days → run the job twice via a scratch script → one email in Resend, second run no-op, `job_runs` shows two rows; move the clock (seed data 8 days past) → follow-up once. Admin page marks a jersey handed over and the flag persists.

**Rollback:** revert; jobs stop with the flag. **Effort:** 5–6 h.

### Gate 8 — Production flag-on and real-money test

1. Staging sign-off on Gates 2–7 (Sandeep's phone click-through on the staging URL).
2. `railway variables set "IQ_PASS_ENABLED=true" --service shuttleiq-app` (auto-redeploys ~2–3 min) → `/api/marketplace/config` 200 → dropdown entry visible.
3. **Real-money test:** one Club purchase on Sandeep's own account with a real card; verify pack `active`, four seats confirmed, single payments row, confirmation email, pill on Profile/Who's Playing; refund through the Ziina dashboard if desired (the refund webhook path is untouched and will mark the payments row).
4. Monitor for 48 h: hold-expiry sweep lines, `job_runs`, reconcile page shows the pack charge as consistent.

**Rollback:** `IQ_PASS_ENABLED=false` (redeploy) hides every surface and stops the jobs; existing paid packs keep their confirmed seats (they are ordinary confirmed bookings). **Effort:** 2 h + monitoring.

**Total:** roughly 45–55 agent hours across eight gates.

---

## E. Decisions I need from you

1. **Where the single pack payment row attaches (schema, non-additive).** Options: (a) add `payments.pack_id` **and** drop `NOT NULL` on `payments.booking_id`, pack rows carry `booking_id NULL`; (b) attach the AED 188 row to the first picked seat's `booking_id`; (c) a separate `pack_payments` table. **Recommended: (a).** Every per-booking reader (`getPaymentsByBookingId`, My Bookings totals, refund caps, reconciliation) then never sees pack money against one seat, which is what (b) would corrupt (a 49-AED seat "paid" 188, refund math capped on 188). (c) breaks the "one payments row" statement and duplicates the refund-webhook code. Cost of (a): one constraint relaxation, and `Payment.bookingId` becomes nullable in TypeScript, so a handful of readers gain a null guard (kept at tsc 28).
2. **What value each pack seat writes to `bookings.amount_aed` for session P&L and captain pay.** (a) the exact per-seat allocation (Club 47, Plus 45, Elite 43 — multiplies back to the pack price with no rounding); (b) AED 49 "normal game" parity; (c) 0 with pack revenue attributed only at purchase. **Recommended: (a).** It keeps session-level collected revenue and captain pay (25% of session value-profit) truthful and automatic, needs no new pay formula, and "counts as one normal game" holds for attendance, badges and streaks. (b) overstates collected cash by AED 2–6 per seat; (c) zeroes captain pay (Risk High). Players never see the allocation; the client shows the tier label instead.
3. **Move cutoff semantics.** "Up to 5 hours before the ORIGINAL session": (a) 5 h before the session the seat is being moved **from** (each move re-anchors); (b) 5 h before the session picked **at purchase**, even after moves. **Recommended: (a)** — it reuses the one 5-hour rule everyone already knows and never strands a seat that was moved early to a later date. If you meant (b), the seat needs an `original_session_id` column (still additive).
4. **Where pack flows get verified before flag-on.** Railway has one environment and Ziina test mode follows `NODE_ENV`, so anything the deployed app does is real money. Options: (a) a Railway **staging** environment (duplicate of production with its own Postgres restored from a prod dump, `NODE_ENV=staging`, `IQ_PASS_ENABLED=true`, webhook not registered there so the poll fallback confirms) — extra Railway spend (second service + database); (b) local server against a Docker `postgres:18` restored from a dump, same flags; (c) prod only, real card, immediate refunds. **Recommended: (a).** It gives you a phone-testable URL and the closest thing to production; (b) is the fallback if the spend is unwanted; (c) is not acceptable for Gates 2–7.
5. **Rankings tier pill source.** (a) an overlay endpoint `GET /api/marketplace/iq-pass/tiers` (player id → tier), consumed like the top-tags map, leaving the approved 7-key `/api/players/public` projection untouched; (b) widen the projection to 8 keys and update the lockdown pin and doc. **Recommended: (a)** — one endpoint covers all four Rankings modes (all-time, week, month, most-improved) and honours the lockdown decision.
6. **Entry point.** The bottom nav is capped at five tabs (pinned). (a) avatar-dropdown entry "IQ Pass" + a one-line banner on the Sessions page + an "IQ Pass" card on Profile; (b) replace an existing tab. **Recommended: (a).**
7. **Jersey size list and re-pick expiry.** Sizes: recommend `S, M, L, XL, XXL` (stored as text, so extending later is free). Re-pick credits: recommend they stay usable while the pack is `active` and lapse when it completes (no carry-over), which keeps the renewal window rule simple. Say if you want either different.

---

## F. Autonomy proposal

Run without you: Gate 0 (ships to production on green — you said it must land before pack code), Gate 1 code, Gates 2–7 in full including staging verification and teardown, each with tests → tsc 28 → suite green → deploy (flag off in prod) → build-report entry.

Your go, and only these:
1. **The Gate 1 migration run** — it contains the one non-additive statement (E1). I will show the `--dry-run` output first.
2. **Creating the staging environment** (E4) — it is a spend decision on your Railway account.
3. **The real-money test and production flag-on** (Gate 8, one message: "flag on").

Hard stops on my side, no matter what: any schema step that is not in Section C; any wallet write; any Ziina call in production before Gate 8; tsc above 28; a test that can only be made green by loosening an existing pin.

---

## G. Plain-English summary

1. IQ Pass lets a player pay once for 4, 8 or 12 games and pick every game up front from the next four weeks.
2. Before any of that, a known payment bug must be fixed: a player who pays for a full session can lose the seat and be asked to pay again. The fix was written on 3 Sep but never shipped; it goes first.
3. The pass is stored as its own record; each picked game is an ordinary booking tagged to the pass, so attendance, badges, guests and referrals keep working unchanged.
4. Seats are held for 30 minutes, paid in one Ziina payment, and all confirmed together or not at all.
5. No more than half of any session can be pass seats, checked at purchase time.
6. Players can move a game up to five hours before it starts; they cannot cancel; a session ShuttleIQ cancels gives a free re-pick.
7. Money reporting is adjusted so pass games show up in session revenue and captain pay, plus a new "IQ Pass by tier" line in the finance portal.
8. Club / Club Plus / Club Elite tags appear on Profile, Who's Playing, the Play screens and Rankings; Plus and Elite players go first on waitlists.
9. A daily job sends the renewal reminder 7 days before the last game and one follow-up a week after, and records every run.
10. Everything sits behind a switch that is off in production until you say go; the app behaves exactly as today while it is off.

---

## Appendix 1 — The 3 Sep webhook capacity-race diff (verbatim from the review, never applied)

Line numbers in the original refer to the 3 Sep tree; today's equivalents are `server/webhookHandler.ts:178-191`, cancel cascade `server/marketplace-routes.ts:4174-4178`, `server/guestSlotRefund.ts:265-270`, `server/scheduler.ts:278-283`, `initiate-payment` `server/marketplace-routes.ts:3469-3538`.

```diff
--- a/server/webhookHandler.ts
+++ b/server/webhookHandler.ts
@@ confirmZiinaBookingByIntentId
   if (booking.status !== "pending_payment") {
     const sessionForCapacity = await storage.getBookableSessionWithAvailability(booking.sessionId);
     const neededSpots = booking.spotsBooked ?? 1;
     if (sessionForCapacity && sessionForCapacity.spotsRemaining < neededSpots) {
+      // The money is already captured at Ziina. Record it NOW so the paid
+      // fact survives the waitlist round-trip; promotion checks for it and
+      // confirms without asking the player to pay twice.
+      const existing = await storage.getPaymentsByBookingId(booking.id);
+      if (!existing.some((p) => p.ziinaPaymentIntentId === intentId)) {
+        await storage.createPayment({
+          bookingId: booking.id, ziinaPaymentIntentId: intentId,
+          amount: booking.amountAed, currency: "aed",
+          status: "completed", completedAt: new Date(),
+        });
+      }
+      console.warn(`[Ziina Webhook] PAID booking ${booking.id} lost the capacity race — re-waitlisted with payment recorded (intent ${intentId})`);
       const waitlistCount = await storage.getWaitlistCountForSession(booking.sessionId);
       await storage.updateBooking(booking.id, {
         status: "waitlisted",
         waitlistPosition: waitlistCount + 1,
       });
-      return { confirmed: false, waitlisted: true };
+      return { confirmed: false, waitlisted: true, paid: true };
     }
   }
+
+/** Promotion helper: if the booking already carries a completed payment,
+ *  confirm it through the normal pipeline (guest slots, emails, referral,
+ *  founding, goodwill) and return true — caller must then skip the
+ *  "complete payment" notification/email. */
+export async function confirmPromotedBookingIfPaid(booking: Booking): Promise<boolean> {
+  const paid = (await storage.getPaymentsByBookingId(booking.id)).find((p) => p.status === "completed");
+  if (!paid) return false;
+  // status is already pending_payment (spot reserved) → capacity check is skipped
+  const r = await confirmZiinaBookingByIntentId(paid.ziinaPaymentIntentId, "completed");
+  return r.confirmed === true;
+}
```

Same six-line insertion at each of the three promotion sites, right after the `pending_payment` update:

```diff
             await storage.updateBooking(first.id, {
               status: 'pending_payment',
               waitlistPosition: null,
               promotedAt,
             });
+            // Already paid (lost a capacity race earlier)? Confirm outright and
+            // skip the pay-by-deadline notification + email below.
+            if (await confirmPromotedBookingIfPaid(first)) {
+              await storage.createMarketplaceNotification({ userId: first.userId, type: 'waitlist_promoted',
+                title: 'Your spot is confirmed', message: `A spot opened up for "${bookableSession.title}" — your earlier payment covers it. See you there.`, relatedBookingId: first.id });
+              promoted = { bookingId: first.id, userId: first.userId };   // (routes site only)
+            } else {
               ...existing "Spot available — complete payment!" notification + email...
+            }
```

```diff
--- a/server/marketplace-routes.ts            (initiate-payment, after the promotedAt/deadline guards)
+      // Never mint a second intent over a paid one — that orphans the money.
+      const paidAlready = (await storage.getPaymentsByBookingId(booking.id)).some((p) => p.status === 'completed');
+      if (paidAlready) {
+        return res.status(409).json({ error: "already_paid", message: "This booking is already paid — no further payment is needed." });
+      }
```

## Appendix 2 — Evidence log

- Test run: `npx vitest run` → 102 files, 1257 tests, 1256 passed, 1 failed (`portal-runner-wall` timeout flake), 68.56 s. `npx tsc` → 28 errors.
- Railway: project ShuttleIQ, environment `production` only; service `shuttleiq-app` online; variables present include `ZIINA_API_TOKEN`, `ZIINA_WEBHOOK_SECRET`, `RESEND_API_KEY`, `NODE_ENV=production`, `REPLIT_DOMAINS=shuttleiq.ai,…`; `IQ_PASS_ENABLED` absent.
- Ziina: `server/ziinaClient.ts:147-158` (`test: NODE_ENV !== 'production'`, one API base `https://api-v2.ziina.com/api`).
- Resend: `server/emailClient.ts:5` sender; challenge email idempotency precedent `:276-285`.
- Production read-only queries (session list next 28 days, capacity/price distributions, payment-method mix last 60 days, players with ≥4 confirmed bookings in 28 days, live `bookings` columns and indexes, one-shot registry, absence of `packs`/`job_runs`). No writes were made.
