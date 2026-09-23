# ShuttleIQ Premier League — tournament registration build plan (read-only diagnosis, 2026-09-22)

**Status (2026-09-23):** Gate 0 signed off by Sandeep; answers and the as-built changes are in section G, which overrides anything above it. Gate 1 (schema, flag, strict tier map, pure rules, config read, `tournament_v1` migration and seed) shipped 2026-09-23.

At Gate 0 (2026-09-22): branch `railway-migration` at `02d8f8e`, tree clean (untracked only: `.claude/`, `.env`, `docs/refunds/`, `scripts/scratch/`). Nothing in this document has been built, staged, committed, migrated or deployed. This file is the only artefact of Gate 0 and is deliberately left uncommitted (a push deploys). The product spec dated 22 Sep 2026 is treated as locked; this plan adds the engineering and lists the questions the spec leaves open.

**Standing rule (CLAUDE.md, 2026-09-19):** before any change in any gate below, the exact files, rows and expected row counts are shown and an explicit yes is awaited. An approval covers only what it names.

Evidence base: eight read-only code readers over `server/`, `shared/`, `client/`, `tests/` and `scripts/` (file:line cited below, read on 2026-09-22); the production database queried with SELECT only (`TZ=UTC`); the Notion Activity Log and the reference plan page; the sponsorship deck PDF probed byte-level (it could not be rendered: `pdftoppm` is not installed).

---

## 0. Inputs and fixed facts

### 0.1 Notion Activity Log (data source `5af91966-4e54-4030-9f1b-74a586f22064`)

- Latest entry 2026-09-17 (Gate 19, finance portal IQ Pass tab). No entry mentions the tournament, the Premier League, sponsorship, Gate 20 or CLAUDE.md. Nothing in the log conflicts with this plan.
- "tournament" appears once, as a Club Plus perk promise: "first access to new venues/tournaments" (2026-09-07). The locked spec has open registration with no early access for Plus/Elite. See open question Q7.

### 0.2 Reference plan page (`3e23d651-6bfd-81fb-80e5-f98ccf018302`)

- Section 1 (caps): 48 players, 6 teams of 8 = 1 Professional / 3 Competitive / 3 Intermediate / 1 Beginner; caps 6 / 18 / 18 / 6, waitlist 2 per tier.
- Section 13 (sponsorship): Title AED 6,000 (one); Team AED 1,500 (six); booth add-on +1,500; Partner in-kind AED 500+; add-ons court naming 500, MVP naming 500, goodie bag 300. Rules: one brand per category, cash in by 8 Oct, shirts print 9 Oct. Platform numbers quoted to sponsors: 552 players, 200+ sessions, 6 per week, 2 locations.

### 0.3 The deck

`C:\Users\ssund\Downloads\ShuttleIQ Premier League — Sponsorship Deck.pdf`: 11 pages, 5,066,981 bytes (4.83 MB), one raster image per page, Helvetica only, producer "appifact kit". Page content was not verified visually (no renderer on this machine). See A.7 for hosting.

### 0.4 Locked spec, condensed

Sat 17 Oct 2026, 18:00–22:00 Dubai, 6 courts, 48 players, entry AED 100 via Ziina (not wallet). Tier = the player's app tier at registration, frozen on the record; Novice registers as Beginner. `pending_payment` → `confirmed` on Ziina confirmation; unpaid after 24 h → spot released to the waitlist. Registration closes Thu 8 Oct 23:59 Dubai; withdraw before that → refund via Ziina (the app records refund status only); teams drafted Sun 11 Oct. Extra fields: T-shirt size S–XXL, company, "share my details with sponsors", "my company may sponsor a team". Player surfaces: home banner with live per-tier counter, pinned "Tournament" row at the top of Sessions, entry under My games with Withdraw. Notifications: registration open, 3 days left, 24 h left. Admin: registrations by tier, waitlist, promote from waitlist, CSV. Sponsorship card after the company field with the deck link (on-page only, never in notifications); ticking the sponsor box sets `sponsor_interest` and sends ONE email to sandeep@shuttleiq.ai.

### 0.5 Instants (Asia/Dubai is UTC+4, no DST; asserted at `shared/sessionTime.ts:2` and `server/iqPass/rules.ts:44`)

| Event | Dubai | UTC |
|---|---|---|
| Registration closes | Thu 8 Oct 2026 23:59 | `2026-10-08T19:59:00Z` (exclusive form: `2026-10-08T20:00:00Z`, see Q1) |
| Withdraw deadline | same instant | same |
| Draft day | Sun 11 Oct 2026 00:00 | `2026-10-10T20:00:00Z` |
| Tournament start | Sat 17 Oct 2026 18:00 | `2026-10-17T14:00:00Z` |
| Tournament end | Sat 17 Oct 2026 22:00 | `2026-10-17T18:00:00Z` |
| "3 days left" (proposed send) | Mon 5 Oct 2026 09:00 | `2026-10-05T05:00:00Z` |
| "24 h left" (proposed send) | Wed 7 Oct 2026 21:00 | `2026-10-07T17:00:00Z` |

Weekday check: 8 Oct 2026 is a Thursday, 11 Oct a Sunday, 17 Oct a Saturday. The spec's weekdays are consistent.

### 0.6 Production numbers (SELECT only, 2026-09-22 14:13Z)

`players.level` holds exactly five values and no legacy aliases: `lower_intermediate` 203, `Beginner` 169, `upper_intermediate` 111, `Novice` 50, `Advanced` 19 (552 rows). Supply per tournament tier with Novice folded into Beginner (test rows excluded):

| Tournament tier | Players | With a linked account | Played in last 60 days | Cap (+ waitlist) |
|---|---|---|---|---|
| Professional (DB `Advanced`) | 19 | 16 | 13 | 6 (+2) |
| Competitive (`upper_intermediate`) | 111 | 96 | 80 | 18 (+2) |
| Intermediate (`lower_intermediate`) | 203 | 166 | 97 | 18 (+2) |
| Beginner (`Beginner` + `Novice`) | 217 | 152 | 44 | 6 (+2) |

Every cap is fillable from active players. Accounts: 512 `marketplace_users`, 433 linked to a player, 335 with a phone. `job_runs` holds only `iq_pass_renewal` rows (8).

---

## A. Findings, by diagnosis area

### A.1 Routing and the feature-flag pattern

- Frontend routes live in one wouter `<Switch>` (`client/src/App.tsx:179-319`), all pages statically imported (`App.tsx:19-20`, no lazy loading). Wrappers: `MarketplaceRoute` (`:151-157`, layout only) and `MarketplaceAuthRoute` (`:159-167`, redirects to `/marketplace/login?from=` and then to complete-profile when `linkedPlayerId === null`). IQ Pass precedent: `/marketplace/iq-pass` at `:259-261`, public terms at `:262-264`, admin `/admin/iq-pass` at `:196-200` inside `<ProtectedRoute>`.
- "Home" is two pages. `RootRedirect.tsx:36` sends an authenticated player to `/marketplace/dashboard`; guests see `MarketplaceHome`. The banner therefore goes in both `MarketplaceHome.tsx` (IQ Pass slot `:182-185`, after the hero) and `Dashboard.tsx` (slot `:746-757`, after the greeting). The logged-out banner needs a no-auth counter endpoint.
- Sessions list: `BookSessions.tsx` renders day groups at `:725-737` inside a results ternary (`:697-738`); anything placed there vanishes in the empty branch (`:713-723`) and while loading. The pinned row must sit between `:695` and `:697`. The IQ Pass banner precedent is `:523-555`.
- My games is booking-shaped: `MyBookings.tsx` reads `/api/marketplace/bookings/mine`; `MyGames.tsx` rows need `booking.session.*` (`AgendaRow :189-221`). The IQ Pass pending slot at `MyBookings.tsx:978-980` (and the empty branch `:967-970`) is the template for a tournament entry card. A tournament-only player must not see "Nothing booked."
- Backend flag: `server/iqPass/flag.ts:5-7` (`process.env.IQ_PASS_ENABLED === 'true'`); router `createIqPassRouter(deps)` (`server/iqPass/routes.ts:47`) with a per-route `gate` (`:49`) answering the same `{ error: "Not found" }` as the API catch-all (`server/index.ts:190-192`); mounted inside `registerMarketplaceRoutes` at `server/marketplace-routes.ts:2888-2912`. The client learns the flag only through `GET /api/marketplace/config` (404 when off) via `useIqPassConfig` (`client/src/hooks/useIqPass.ts:19-40`, `staleTime: Infinity`, any non-200 → off). Scheduler jobs sit under `if (isIqPassEnabled())` at `server/scheduler.ts:574-582`, and `tests/iq-pass-jobs.test.ts:97-105` pins that layout.
- The tournament flag cannot ride on `/api/marketplace/config`: that endpoint 404s whenever IQ Pass is off and its off-path is a documented tripwire (`docs/iq-pass/PLAN.md:63`). It needs its own `GET /api/marketplace/tournament/config`.
- Host wall (`server/portal/hostGate.ts:17-27`) blocks only `/api/portal/*` on the main hosts; `/api/marketplace/tournament/*` and `/api/admin/tournament/*` pass with no change.
- Bottom nav is at its five-tab ceiling (`MobileBottomNav.tsx:36-37`, pinned by `tests/bottom-nav-labels.test.tsx`); the Sessions tab's `isActive` (`:41-43`) already lists `/marketplace/iq-pass` and should also match `/marketplace/tournament`. No nav link exists to `/admin/iq-pass` (URL only); the admin page will be equally hidden unless a link is added (`SessionsManagement.tsx:243-255` tabConfig).

### A.2 Auth and the tier lookup

- `GET /api/marketplace/auth/me` (`server/marketplace-routes.ts:781-848`) returns the full `linkedPlayer` row; the client type is `any` (`MarketplaceAuthContext.tsx:11`). Keep the server authoritative.
- The confirmed tier is `players.level`, maintained by `applyTierBuffer` (`server/routes.ts:94-131`, three-game buffer). Do not derive the tier from `skillScore` (`getSkillTier`, `shared/utils/skillUtils.ts:39-46`): it leads or lags the confirmed level by up to two games.
- Display mapping is `getTierDisplayName(level)` (`shared/utils/skillUtils.ts:59-75`): Novice, Beginner, `lower_intermediate` → Intermediate, `upper_intermediate` → Competitive, `Advanced`/`Professional` → Professional. Its default branch silently returns 'Intermediate' (`:72-73`); for a paid registration that would mis-bucket a player into the 18-seat cap, so the tournament needs a strict function that refuses unknown levels. DB `Advanced` counts against the six Professional seats (brand ruling).
- IQ Pass does not require a linked player at the API (`server/iqPass/purchase.ts:145-146`); the tournament must, because the tier is unresolvable without a `players` row. Precedent for the refusal: `if (!mpUser?.linkedPlayerId) return res.status(403).json({ error: "Link your player profile first" })` (`marketplace-routes.ts:1137`). Client side, `MarketplaceAuthRoute` already bounces unlinked accounts to complete-profile.
- The public Rankings projection is pinned to seven keys (`server/playerRoutes.ts:56`, `tests/player-endpoints-lockdown.test.ts:191-205`); the live per-tier counter must be its own flag-gated endpoint, never a widening of that payload.

### A.3 Ziina reuse

- Intent creation: `createZiinaPaymentIntent(input)` (`server/ziinaClient.ts:147-158`) takes whole AED (×100 to fils), `currency_code 'AED'`, a `message` sanitised to 50 bytes (`:89-95`, `:173-181`), success/cancel/failure URLs, `test: NODE_ENV !== 'production'` (so production intents are real money, as for IQ Pass). Also reusable: `retrieveZiinaPaymentIntent`, `isZiinaPaymentSuccessful`, `isZiinaPaymentTerminalUnpaid`.
- Return URLs are booking-keyed: `buildZiinaReturnUrls` (`server/ziinaReturn.ts:16-45`) requires a `bookingId` and takes an optional `packId` (`:35`); the shared success page `CheckoutSuccess.tsx` branches on `pack_id` and errors without `booking_id` (`:68-75`); `CheckoutCancel.tsx:84` says "30 minute". A tournament return needs a `registration_id` parameter end to end. The resume token table requires `booking_id NOT NULL` (`shared/schema.ts:411`), so the tournament omits `&resume=`; tolerable because the poll endpoint is no-auth.
- Hold and purchase template: `startPurchase` (`server/iqPass/purchase.ts:107-124,148-188`: hold → intent → `attachIntent`; `cancelHold` on intent failure); `createHold` (`server/iqPass/store.ts:209-311`: parent rows `FOR UPDATE`, recount under the lock with `pending_payment` COUNTED, insert the hold, 23505 → 409). `HOLD_MINUTES = 30` is baked into `rules.ts:25`, `purchase.ts:157`, `jobs.ts:46`, `store.ts:698` and client copy; the tournament needs its own 24 h constant, never a change to the shared ones (`PAYMENT_WINDOW_MS` 4 h at `shared/dubaiTime.ts:26` is mirrored in `server/rebookGuard.ts:17`, `server/guestOrphanSweep.ts:11` and the promotion email text `server/emailClient.ts:356`).
- Confirmation: the webhook dispatch (`server/webhookHandler.ts:186-192`) looks up a booking by intent, then `if (isIqPassEnabled())` tries packs, then falls through to `confirmGuestByIntentId`, which ends in `guest_not_found` (`:28-36`) with the money recorded nowhere. The tournament lookup goes in that block, gated by `isTournamentEnabled()`, so the flag-off path stays byte-identical. `confirmTx` (`store.ts:675-747`) is the atomic template: `FOR UPDATE` by intent, early "already" return, a `payments` row, and money that lands after expiry recorded plus flagged rather than confirmed (`:691-704`). `confirmPackByIntentId` (`server/iqPass/confirm.ts:16-89`) shows the post-commit hooks; the no-auth poll endpoint (`routes.ts:74-86`, UUID is the secret) and the resume route with `platform_mismatch`/`returnScheme` (`:91-113`) are the client-return template.
- Jobs: `runPackHoldExpiryJob` (5 min) and `runPackReconciliationJob` (10 min, 48 h look-back) in `server/iqPass/jobs.ts` write no `job_runs` rows and have no overlap guard; only `runIqPassRenewalJob` (`server/iqPass/renewal.ts:61-118`) ledgers via `iqPassStore.startJobRun/finishJobRun` (`store.ts:429-437`). The drop-in expiry (`scheduler.ts:239-262`) does an unguarded update after its select; do not copy it. `expireHolds`/`cancelHold` (`store.ts:750-761`, `:316-323`) show the status-guarded claim `UPDATE … WHERE id=$1 AND status='pending_payment' RETURNING`.
- Payments rows: `payments.amount` is whole AED, `payments.refunded_amount` is fils (`shared/schema.ts:518-540`); pack rows carry `pack_id` with `booking_id NULL` (E1a). A tournament row needs a nullable `payments.tournament_registration_id` or it is unlabelled Ziina money in `portal/portalReconcile.ts:144-150,271-276`. Finance P&L reads bookings and packs, not payments, so tournament revenue is invisible to the finance portal until a later gate.
- Refunds: `createZiinaRefund` (`ziinaClient.ts:222-272`) exists but is dead (NOT_AUTHORISED; button removed `SessionsManagement.tsx:2707-2710`); refunds are done in the Ziina dashboard and marked with `markRefundAsManuallyProcessed`, which is booking-keyed. `docs/refunds/PLAN.md` is uncommitted and parked (blocked on Ziina). "Refund via Ziina" for a withdrawal therefore means: the app records `refund_status = 'pending'`, Sandeep refunds in the dashboard, an admin action marks it `completed`. The admin Refunds dashboard cannot list it (`getRefundNotifications` joins bookings, `storage.ts:2934`), so the tournament admin page carries its own "refunds owed" list.

### A.4 Schema draft and the one-shot shape

House style read from `shared/schema.ts:1245-1286` and `scripts/one-shot/2026-09-15-iq-pass-v1.mts:21-62`: `varchar("id").primaryKey()` with `randomUUID()`, no foreign keys, no CHECK constraints, `text("status")` with a literal comment, timestamptz on new tables, money columns named by unit, nullable intent column with a partial unique index, `*_sent_at` de-dupe columns, index names `idx_<table>_<cols>` / `uq_<table>_<what>`, plain `CREATE TABLE` (idempotency comes from the `system_one_shot_migrations` registry and an ABORT pre-check, exit 2, when objects exist without a registry row), one `BEGIN`/`COMMIT`, `--dry-run` prints and exits, anything else EXECUTES, run under `railway run` with `PUB_DB_URL`, and the migration runs BEFORE the deploy that references the tables. `npm run db:push` is blocked (`echo BLOCKED && exit 1`).

Waitlist as a STATUS on the registrations table (`waitlisted`), not a second table: one partial unique index gives "one active registration per (tournament, user)", and the per-tier counter is one `GROUP BY tier, status`. No `waitlist_position` column: the 2026-09-19 incident fixed promotion order to `created_at` (positions drift). Lifecycle: `pending_payment` (24 h hold, intent) → `confirmed` | `expired`; `waitlisted` (cap full, ≤ 2 per tier, no hold) → `pending_payment` on promotion (fresh 24 h hold, `promoted_at`); `confirmed`/`pending_payment`/`waitlisted` → `withdrawn`; any → `cancelled` (admin). Active set = `('pending_payment','confirmed','waitlisted')`.

Draft DDL for `scripts/one-shot/2026-10-XX-tournament-v1.mts` (`KEY = 'tournament_v1'`):

```sql
CREATE TABLE "tournaments" (
  "id" varchar PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,            -- 'draft' | 'open' | 'closed' | 'completed' | 'cancelled'
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "venue_name" text NOT NULL,
  "venue_location" text,
  "venue_map_url" text,
  "entry_fee_aed" integer NOT NULL,                  -- whole AED
  "tier_caps" jsonb NOT NULL,                        -- {"Professional":6,"Competitive":18,"Intermediate":18,"Beginner":6}
  "waitlist_cap_per_tier" integer DEFAULT 2 NOT NULL,
  "hold_minutes" integer DEFAULT 1440 NOT NULL,
  "registration_opens_at" timestamp with time zone NOT NULL,
  "registration_closes_at" timestamp with time zone NOT NULL,
  "withdraw_deadline_at" timestamp with time zone NOT NULL,
  "deck_url" text,
  "open_notified_at" timestamp with time zone,
  "three_days_notified_at" timestamp with time zone,
  "one_day_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "tournament_registrations" (
  "id" varchar PRIMARY KEY NOT NULL,
  "tournament_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,                        -- marketplace_users.id
  "player_id" varchar NOT NULL,                      -- linked player at registration (snapshot)
  "tier" text NOT NULL,                              -- FROZEN: 'Professional' | 'Competitive' | 'Intermediate' | 'Beginner'
  "level_at_registration" text NOT NULL,             -- raw players.level (audit)
  "skill_score_at_registration" integer NOT NULL,    -- audit
  "status" text DEFAULT 'pending_payment' NOT NULL,  -- 'pending_payment' | 'confirmed' | 'waitlisted' | 'withdrawn' | 'expired' | 'cancelled'
  "amount_aed" integer NOT NULL,                     -- whole AED (100)
  "ziina_payment_intent_id" text,
  "hold_expires_at" timestamp with time zone,        -- NULL while waitlisted
  "paid_at" timestamp with time zone,
  "promoted_at" timestamp with time zone,
  "withdrawn_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancellation_reason" text,                        -- 'hold_expired' | 'admin' | ...
  "refund_status" text,                              -- NULL | 'pending' | 'completed' | 'not_due'
  "refunded_at" timestamp with time zone,
  "t_shirt_size" text,                               -- 'S' | 'M' | 'L' | 'XL' | 'XXL'
  "company" text,
  "share_with_sponsors" boolean DEFAULT false NOT NULL,
  "sponsor_interest" boolean DEFAULT false NOT NULL,
  "sponsor_interest_emailed_at" timestamp with time zone,
  "confirmation_email_sent_at" timestamp with time zone,
  "promotion_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "uq_tournament_regs_active" ON "tournament_registrations" ("tournament_id", "user_id")
  WHERE status IN ('pending_payment', 'confirmed', 'waitlisted');
CREATE INDEX "idx_tournament_regs_tier_status" ON "tournament_registrations" ("tournament_id", "tier", "status");
CREATE UNIQUE INDEX "uq_tournament_regs_intent" ON "tournament_registrations" ("ziina_payment_intent_id")
  WHERE ziina_payment_intent_id IS NOT NULL;
CREATE INDEX "idx_tournament_regs_user_status" ON "tournament_registrations" ("user_id", "status");
CREATE INDEX "idx_tournament_regs_hold" ON "tournament_registrations" ("hold_expires_at") WHERE status = 'pending_payment';
CREATE INDEX "idx_tournament_regs_waitlist" ON "tournament_registrations" ("tournament_id", "tier", "created_at") WHERE status = 'waitlisted';
-- Q2 (decision): additive, precedes the deploy, E1a pattern
ALTER TABLE "payments" ADD COLUMN "tournament_registration_id" varchar;
CREATE INDEX "idx_payments_tournament_reg" ON "payments" ("tournament_registration_id") WHERE tournament_registration_id IS NOT NULL;
INSERT INTO system_one_shot_migrations (key) VALUES ('tournament_v1');
```

Expected on execute: 2 tables, 6 indexes on the new table, 1 column + 1 index on `payments` (if Q2 is yes), 1 registry row; zero rows touched in any existing table. Dry-run shape: `railway run --environment production --service shuttleiq-app -- npx tsx scripts/one-shot/2026-10-XX-tournament-v1.mts --dry-run` prints every statement and "DRY RUN — nothing executed", exit 0; pre-check ABORT (exit 2) if `tournaments` or `tournament_registrations` already exist without the registry row.

Seed (separate approval, 1 row, shown again before running):

```sql
INSERT INTO tournaments (id, name, status, starts_at, ends_at, venue_name, entry_fee_aed, tier_caps,
  waitlist_cap_per_tier, hold_minutes, registration_opens_at, registration_closes_at, withdraw_deadline_at, deck_url)
VALUES (gen_random_uuid(), 'ShuttleIQ Premier League', 'draft',
  '2026-10-17 14:00:00+00', '2026-10-17 18:00:00+00', '<venue, Q11>', 100,
  '{"Professional":6,"Competitive":18,"Intermediate":18,"Beginner":6}', 2, 1440,
  '<opens, Q6>', '2026-10-08 20:00:00+00', '2026-10-08 20:00:00+00',
  'https://shuttleiq.ai/docs/shuttleiq-premier-league-sponsorship.pdf');
```

Drizzle mirror: `tournaments` and `tournamentRegistrations` in `shared/schema.ts` after `jobRuns` (`:1275-1286`), `{ withTimezone: true }` throughout, indexes declared with `uniqueIndex().where(sql\`…\`)` as `packs` does (`:1267-1268`), pinned column-for-column by a mirror test like `tests/iq-pass-schema.test.ts:24-46`. A shared `shared/tournamentTiers.ts` (`TournamentTier`, order, labels, `tournamentTierFor(level)` = strict map with Novice → Beginner, `null` for anything unknown) follows `shared/iqPassTiers.ts`.

### A.5 Admin location and CSV

- Main-app admin, not the finance portal: the portal has its own `portal_users` login, `requirePortalOwner`, a read-only finance posture (`server/portal/portalIqPass.ts:1-2`) and a host wall that 404s everything but `/api/portal/*` on finance.shuttleiq.ai. Promote and CSV are writes and player-data reads that belong with `requireAuth, requireAdmin` (`server/auth/middleware.ts:12-28`, `:42-55`, admin | super_admin; captains excluded, pinned by `tests/captain-role.test.ts`).
- Templates: `client/src/pages/IqPassAdmin.tsx` (`adminHeaders()` with `localStorage accessToken` `:32`; 404 → `[]` `:38-47`); admin routes `server/iqPass/routes.ts:150-165`; `listPacksAdmin` (`store.ts:440-464`, joins live user data; the tournament list must read the frozen `tier` column, never `players.level`); the HTTP route-test pattern `tests/iq-pass-purchase.test.ts:206-240`.
- Promote: `admin-promote` (`marketplace-routes.ts:5275-5333`) is non-transactional (count, then update) and confirms WITHOUT payment. The tournament promote must count and flip inside one transaction under the tournaments-row lock and land on `pending_payment` with a fresh 24 h hold (the `promoteFirstFittingWaitlisted` model, `server/guestSlotRefund.ts:254-326`: `promotedAt`, confirm-if-already-paid, deadline notification, `?pay=` email link). "Mark paid off-app" (bank transfer at the venue) follows the `server/adminConfirm.ts` pure seam.
- CSV: server-side is the right base. `csvEscape/buildCsv/sendCsv` are closures inside `registerRoutes` (`server/routes.ts:4662-4681`), used by `/api/admin/export/*.csv`; lifting them to `server/csv.ts` touches `server/routes.ts` (a change, so it is listed for approval). The client download helper is `downloadAdminCsv` (`client/src/components/GameHistoryExport.tsx:10-23`); do not copy that file's inline builder (`:101-108`, no quote escaping). The portal's `csvCell` + BOM (`client/portal/IqPassPage.tsx:62-82`) is the escaping rule. Timestamps in the CSV are formatted Asia/Dubai with a labelled header, to avoid the four-hour misread.

### A.6 Notifications, scheduler, job_runs, Resend

- Resend: lazily built client (`server/emailClient.ts:12-22`), from `ShuttleIQ <noreply@shuttleiq.org>` (`:6`), one private `sendEmail(to, subject, html, idempotencyKey?)` (`:90-97`); no `replyTo`/`cc`; the key is send-only (`docs/iq-pass/PLAN.md:42`); Resend de-dupes a key for 24 h only, so app-level `*_sent_at` columns are the real guard. No internal/ops email exists today. Brand-flat template helpers: `server/iqPassEmail.ts:110-141` (`nudgeHtml`) and `:41` (`esc`); hard-coded `https://shuttleiq.ai` link base at `iqPassEmail.ts:6,92` (the legacy `REPLIT_DOMAINS` fallback at `scheduler.ts:246-248` is not to be reused).
- Sender error handling: the IQ Pass and birthday wrappers swallow Resend errors (`emailClient.ts:289-297`, `:339-344`) so callers stamp `*_sent_at` even when nothing was sent (`renewal.ts:85-86`, `scheduler.ts:524-525`). Tournament senders rethrow (session-reminder shape, `:470-500`) and the stamp is written only after a successful send.
- In-app: one table `marketplace_notifications` (`schema.ts:607-624`), `storage.createMarketplaceNotification` (`storage.ts:2897-2910`), bell popover polling every 30 s (`MarketplaceNav.tsx:64-171`) rendering title/message/time only; a new `tournament_*` type needs zero client work. Bulk insert form at `storage.ts:2399-2406`. Test accounts are excluded with `isTestAccountName` (`server/playerRoutes.ts:24-28`).
- No broadcast primitive, no opt-out column, no unsubscribe footer (`challengeEmail.ts:4` "Transactional only"). A "registration open" EMAIL to all 512 accounts would be the app's first non-transactional send. See Q8.
- Scheduler: `setInterval` jobs registered in `startScheduler` (`server/scheduler.ts:533-583`), `REMINDER_INTERVAL_MS` 30 min (`:16`), `scheduleDailyAtUtcHour` (`:498-505`) with no catch-up and no mutex; a Railway redeploy can briefly run two instances, so exactly-once must come from the database (status-guarded claim UPDATE or a unique index), never from memory. `job_runs` (`schema.ts:1275-1286`) via `iqPassStore.startJobRun/finishJobRun` is reusable verbatim; no read path exists (verification is SELECT only).

### A.7 Static assets (the deck)

- Production static chain: host wall → `/uploads` volume (`server/index.ts:43-60`, images only, 30-day cache, blocked on the finance host) → `/api` JSON 404 → `serveStatic()` (`server/vite.ts:75-119`): `express.static(dist/public)` with default options (`:94`) and a catch-all that returns the SPA shell as `200 text/html` for any miss (`:102-118`). Vite copies `client/public` verbatim (`vite.config.ts:29-33`, default `publicDir`); precedent `client/public/scoring-guide.pdf` (102,827 B, commit `203d02d`, linked with `<a target="_blank" rel="noopener noreferrer">` from `MarketplaceFooter.tsx:93-102`). `client/public/docs/` does not exist yet.
- Verdict: `client/public/docs/shuttleiq-premier-league-sponsorship.pdf` → served at `https://shuttleiq.ai/docs/shuttleiq-premier-league-sponsorship.pdf` with `Content-Type: application/pdf`, `Cache-Control: public, max-age=0`, `ETag`, `Accept-Ranges` (inline, revalidated on every open, so no versioned filename is needed; add `?v=` only if the file is ever replaced). The 4.8 MB binary is a permanent git object (well under GitHub's limit; no LFS). File and link must ship in the same deploy or the URL returns the SPA shell as HTML (the FV.1a class of bug). Filename is case-sensitive on Linux. On finance.shuttleiq.ai the same path returns the portal shell; always link against the main host.
- Native shell: a relative href stays inside the WebView (`Bridge.java:407-420` externalises foreign hosts only) and Android WebView cannot render PDFs; use the absolute `https://shuttleiq.ai/docs/…` href, or the `Browser.open` shape from `client/src/lib/nativeAuth.ts:37-43`. iOS opens inline; older Android Chrome and Samsung Internet download to the system viewer. Commit `1d3645f` once called the earlier PDF link "unreliable" without saying why; a real-device check at 375 is part of the Gate 3 screenshots.

### A.8 Timezone

Four Dubai clocks exist: `shared/sessionTime.ts` (`sessionStartEpochMs`, `DUBAI_UTC_OFFSET_MS` module-private), `server/iqPass/rules.ts` (`todayDubai`/`addDaysDubai`, Y-M-D maths), `shared/dubaiTime.ts` (`formatDubaiTime`, `formatDubaiDeadline`, `PAYMENT_WINDOW_MS`, `paymentDeadline`) and the finance-only `formatDubai`. All legacy timestamp columns are naive UTC and node-pg on a Dubai box shows them four hours early (two wrong analyses already). The tournament stores every deadline as a timestamptz instant on the `tournaments` row (values in 0.5), compares instants (`now < registration_closes_at`), and displays through `formatDubaiDeadline`. No offset arithmetic anywhere. The one ruling needed is inclusive-minute semantics (Q1).

### A.9 Brand tokens and drift

- Two token sets coexist. MKT (`LandingComponents.tsx`: `#002C84`, fill `#00766C` / text `#006B5F`, `#F2ECE1`, Montserrat display) on `MarketplaceHome`, `Dashboard`, `BookSessions`, `CheckoutSuccess`, and the `Wordmark` (`#002C84` everywhere). IQP (`client/src/lib/iqPassTokens.ts:9-25`: `#003E8C`, `#006B5F`, `#F5EFE0`, Inter only) on `IqPass.tsx`, `IqPassPromo.tsx`, `MyGames.tsx`. The spec's tokens are exactly IQP, and a sweep test bans inlined brief literals, so tournament screens import `IQP`/`IQP_FONT` and never inline a hex.
- Reusable pieces: `IqPass.tsx:53-63` (card / h2 / sub / primaryBtn / ghostBtn), `:247-259` tier-card buttons, `:39` `JERSEY_SIZES` + `:285-289` size select, `:321-324` sticky pay bar, `:42-52` error-code → copy map; `IqPassPromo.tsx:24-34` `IqPassPromoCard` (home banner), `:36-52` `IqPassProgressLine` (per-tier counter bar), `:54-81` `IqPassLandingSection` (sponsorship section); `IqPassPending.tsx` (awaiting payment → Continue payment); `iqPassDates.ts:57` `countdownLabel`. Weight 800 is used by IQP screens but only Inter 400–700 is loaded: stay ≤ 700.
- Drift to record, not fix here: a pinned Inter/`#003E8C` row inside the Montserrat/`#002C84` session list, and a Montserrat `CheckoutSuccess` heading above an Inter tournament branch. The pinned row follows the IQ Pass banner precedent already in that list so it reads as native there; the tournament page itself is IQP.

### A.10 Risks

| Sev | Risk | Where it bites | Mitigation in this plan |
|---|---|---|---|
| **High** | Per-tier cap race: two registrations pass the count and both take the 6th Professional seat; or a paid AED 100 lands on the waitlist (the drop-in class, `marketplace-routes.ts:3250` unlocked count, `webhookHandler.ts:221-249` re-check, `tests/webhook-capacity-race.test.ts`) | register, promote, webhook | One transaction: `SELECT tournaments … FOR UPDATE` → per-tier COUNT of `pending_payment + confirmed` under the lock → insert `pending_payment` (or `waitlisted` when cap full and waitlist < 2, else 409 `TIER_FULL`). Webhook confirm never re-checks capacity for a `pending_payment` row (the seat is held). Backstop: `uq_tournament_regs_active`. |
| **High** | Double submit / repeat POST mints two registrations or two intents (the Gate 15 root cause class) | register | Partial unique index + `decideIntentReuse` (`marketplace-routes.ts:3552-3558`): a repeat POST returns the same row and the same live redirect; 23505 → re-read and return 200 with the existing row. |
| **High** | Sweep demotion (10bbb24 lesson): an expiry job touches a confirmed row | 24 h release job | Candidates `status='pending_payment' AND hold_expires_at < now()`, claim with `UPDATE … WHERE id=$1 AND status='pending_payment' RETURNING`; confirmed rows are never candidates; RED test pins it. |
| **High** | Money after expiry or withdrawal: Ziina captures after the hold lapsed | webhook / reconciliation | Under the tournaments-row lock: if a seat in that tier is free, restore to `confirmed`; else record the `payments` row, set `refund_status='pending'`, notify admin. Never silently drop (`guest_not_found` path). |
| **High** | Real money in every production intent (`test: NODE_ENV !== 'production'`, one Railway environment) | Gate 6 verification | Flag stays off in production until Gate 6; end-to-end verified locally with a mocked Ziina client and a stub API; one explicit AED 100 live registration by Sandeep's own account on go-live, refunded manually. |
| **Med** | Tier changes between registration and 17 Oct (`applyTierBuffer`) | counters, admin list, My games | Every read uses the frozen `tier`; admin list shows frozen tier and current level side by side for Sandeep's judgement; no automatic re-bucketing (Q10). |
| **Med** | Unknown `players.level` silently becomes Intermediate | register | Strict `tournamentTierFor(level)` returns `null` → 409 `TIER_UNRESOLVED`; the DISTINCT set is clean today (0.6). |
| **Med** | Deploy-freeze blind spot: `session-window-check.mjs` reads only `bookable_sessions`; the tournament evening is not there as itself | every push 17 Oct, and pushes during the last registration hours | Windows listed in 0.6/D; the existing Fire Rallies row on 17 Oct 18:00–20:00 blocks 17:30–20:00 already; treat 17 Oct 17:30–22:30 and 8 Oct 19:30–00:30 as manual no-deploy windows (Q12). |
| **Med** | 24 h hold created inside the last 24 h before close outlives the close | register near 8 Oct | Existing holds keep their full 24 h after close; no new registrations after close; promotions after close get a hold capped at the draft cut-off (Q3). |
| **Med** | Webhook flag-off path changes shape | `webhookHandler.ts:186-192` | Tournament branch inside the `if (!booking)` block, gated by `isTournamentEnabled()`; source-pin test. |
| **Med** | Two scheduler instances during a redeploy send a reminder twice | reminders, sponsor email | Broadcast claim = `UPDATE tournaments SET three_days_notified_at = now() WHERE id=$1 AND three_days_notified_at IS NULL RETURNING id`, rows inserted in the same transaction; per-registration sends stamped after a successful send with a Resend idempotency key. |
| **Low** | Ziina `message` 50-byte cap truncates "ShuttleIQ Premier League · <name> · Professional" | intent | Fixed token `ShuttleIQ Premier League entry` (30 bytes), no name. |
| **Low** | Admin page invisible (no nav link, as for `/admin/iq-pass`); captains can open the page and see 403s (`ProtectedRoute` has no role check) | admin | Page handles 403 with a plain message; optional nav link (Q9). |
| **Low** | `payments.tournament_registration_id` NULL for both `booking_id` and `pack_id` readers | `portalReconcile.ts`, finance P&L | Third branch in reconcile labels; P&L line is out of scope and recorded as a follow-up. |

---

## B. Decisions (DECISION / DESIGN lines; say so if any should change)

- **DECISION: own module, own flag, own config endpoint.** `server/tournament/` mirrors `server/iqPass/` (`flag.ts`, `rules.ts`, `store.ts`, `register.ts`, `confirm.ts`, `jobs.ts`, `routes.ts`, `email.ts`); `GET /api/marketplace/tournament/config` is the only client flag read (404 when off). Nothing is added to `/api/marketplace/config` or to `/auth/me`.
- **DECISION: the event is a DB row, not constants.** Dates, caps, fee and deck URL live on `tournaments`; a date change is a one-row UPDATE under the standing rule, not a deploy inside a session window. The admin page shows them read-only.
- **DECISION: tier is frozen at registration from `players.level`** through a strict shared function (Novice → Beginner, unknown → refuse); `level_at_registration` and `skill_score_at_registration` are kept for audit. A linked player is required (403 otherwise).
- **DECISION: holds count as taken.** The public counter reports `confirmed + pending_payment` against the cap and the waitlist count separately, so a player never sees a seat that is actually held (the honest-holds lesson from Gate 20).
- **DECISION: waitlist is a status, ordered by `created_at`,** promoted only inside the same tournaments-row lock as registration, always to `pending_payment` with a fresh 24 h hold. Plus/Elite priority is not applied (Q7).
- **DECISION: refunds are recorded, not executed.** Withdraw before the deadline sets `withdrawn` + `refund_status='pending'` (when paid); Sandeep refunds in the Ziina dashboard; "Mark refunded" on the admin page sets `completed` + `refunded_at` and the `payments.refund_*` summary. The parked refunds plan can later automate this without a schema change.
- **DESIGN: intent per registration, lazily for promotions.** A new registration creates the Ziina intent immediately (redirect); a promoted player gets the intent when they tap Pay (`POST …/registrations/:id/pay`, reusing a live intent). The return URLs carry `registration_id`; `CheckoutSuccess`/`CheckoutCancel` gain a tournament branch.
- **DESIGN: sponsor-interest email is a post-commit hook** fired from both the create path and `POST …/registrations/:id/sponsor-interest` (the card also appears on the Tournament row and My games), guarded by `sponsor_interest_emailed_at` plus Resend key `tournament-sponsor-interest/<registrationId>`, to `process.env.TOURNAMENT_SPONSOR_INBOX ?? 'sandeep@shuttleiq.ai'`, body = player name, company, phone (or "not provided"), and the player's email so Sandeep can reply (no `replyTo` support exists).
- **DESIGN: jobs ledger their runs.** Both tournament jobs (`tournament_hold_expiry` 5 min, `tournament_reconcile` 10 min, look-back 26 h) and the reminder job write `job_runs` via `iqPassStore.startJobRun/finishJobRun`.
- **DESIGN: "registration open" is an admin action, not a timer:** `POST /api/admin/tournament/:id/announce` flips `status='open'`, stamps `open_notified_at`, and bulk-inserts in-app notifications for every non-test account in one transaction. Email is Q8.

---

## C. Environment flag proposal

`TOURNAMENT_ENABLED` — default off (unset, empty, or anything but the string `true` means off).

- Server: `server/tournament/flag.ts` `isTournamentEnabled()`; every tournament route (player, public counter, admin, poll) starts with a `gate` that answers `404 { error: "Not found" }`; the webhook branch and the scheduler block are wrapped in the flag; no key is added to any existing payload.
- Client: `client/src/hooks/useTournament.ts` (`useTournamentConfig`, `queryKey ['tournament','config']`, non-200 → off, `staleTime: Infinity`, `retry: false`); every slot (`MarketplaceHome`, `Dashboard`, `BookSessions`, `MyBookings`, nav `isActive`) renders nothing when off; the page itself self-gates ("The tournament is not open right now.").
- Tests: a flag-off tripwire hits every tournament path over HTTP on a throwaway express app and expects 404; source pins assert the webhook and scheduler blocks are inside the flag; the schema mirror test is flag-independent.
- Production: the Railway variable is set only in Gate 6, after `session-window-check.mjs` says CLEAR and with the line recorded in PROGRESS.md; the migration and the deck file are already live by then.

---

## D. Gates

Common verification for every gate: RED tests written first and seen failing; full suite green (baseline 1676 tests / 138 files) and `tsc` at the known 28 errors before commit; exact paths staged; `session-window-check.mjs` CLEAR and the `gate-line.js` line in `docs/iq-pass/PROGRESS.md` before every push; post-deploy health 200 and the read-only invariants of that gate; screenshots at 375 and 1280 saved as `docs/tournament/screens/<gate>-<what>-<width>.png`, committed and looked at before "verified" (Q13 confirms the folder). Deploy windows from 0.6: every weekday 19:30–22:00 Dubai and Saturday 17:30–20:00 are blocked; Sundays and mornings are clear.

### Gate 1 — Schema, flag, config, shared tier module (no UI, flag off)

- Files: `shared/schema.ts` (two tables after `jobRuns`; `payments.tournamentRegistrationId` if Q2 yes), `shared/tournamentTiers.ts`, `server/tournament/flag.ts`, `server/tournament/rules.ts` (constants: `HOLD_HOURS = 24`, entry fee, caps read from the row; pure `decideRegistration(counts, caps, waitlistCap)` → `hold | waitlist | full`; `tournamentTierFor`), `server/tournament/routes.ts` (config handler + gate only), `server/marketplace-routes.ts` (mount after `:2912`), `scripts/one-shot/2026-10-XX-tournament-v1.mts`, tests `tests/tournament-schema.test.ts`, `tests/tournament-rules.test.ts`.
- Migration: `tournament_v1` (A.4). Dry-run shown first; executed under `railway run` before the Gate 1 deploy; verified with `information_schema` SELECTs (2 tables, 6 indexes, registry row).
- Verification: mirror test column-for-column; rules tests (Novice → Beginner, Advanced → Professional, unknown → null; cap boundary 5→6→waitlist→full; waitlist cap 2); flag-off 404 tripwire; config handler 200 with `Cache-Control: no-store` when on. No screenshots (no UI).

### Gate 2 — Registration core (server)

- Files: `server/tournament/store.ts` (`createRegistrationTx` with `FOR UPDATE` on the tournaments row + count under lock; `attachIntent`; `confirmTx`; `expireHoldsTx` + `promoteNextWaitlistedTx`; `withdrawTx`; `getByIntent`; `countsByTier`; `listMine`), `server/tournament/register.ts` (hold → intent → attach; `cancelHold` on failure; intent reuse on repeat), `server/tournament/confirm.ts` (`confirmRegistrationByIntentId`, post-commit hooks), `server/tournament/jobs.ts` (`runTournamentHoldExpiryJob`, `runTournamentReconciliationJob`, both ledgered), `server/tournament/routes.ts` (`POST /api/marketplace/tournament/register`, `GET …/me`, `POST …/registrations/:id/pay`, `POST …/registrations/:id/withdraw`, `POST …/registrations/:id/sponsor-interest`, `POST …/registrations/:id/confirm` no-auth poll, `GET …/counts` public), `server/webhookHandler.ts:186-192` (flag-gated lookup), `server/ziinaReturn.ts` (registration-keyed URLs, additive), `server/scheduler.ts` (sibling block after `:582`), `server/tournament/email.ts` (confirmation, promotion with `?pay=`, sponsor-interest; rethrow shape), `server/emailClient.ts` (export a thin `sendRaw` or add the three wrappers beside `:473-500`; listed for approval because it is a shared seam).
- Migration: none.
- Verification: HTTP tests on a throwaway app with mocked Ziina and Resend (`tests/tournament-register.test.ts`, `tests/tournament-confirm.test.ts`, `tests/tournament-jobs.test.ts`, `tests/tournament-withdraw.test.ts`): cap race (two registrations against one free seat inside serialised transactions → one hold, one waitlist); repeat POST returns the same row and redirect; unlinked account → 403; unknown level → 409; expiry never touches confirmed rows; expiry promotes the oldest waitlisted of that tier only; money after expiry restores when a seat is free, else flags; withdraw before deadline sets `refund_status='pending'`, after deadline per Q4; sponsor email sent exactly once across create + re-tick; webhook flag-off source pin; scheduler layout pin extended (`tests/iq-pass-jobs.test.ts:97-105` still passes). No screenshots.

### Gate 3 — Player UI, deck asset, return pages

- Files: `client/src/pages/marketplace/Tournament.tsx` (hero with date/venue/fee, live per-tier counter, form: T-shirt size, company, share-with-sponsors, sponsorship card after the company field with "Want to sponsor a team?", "Team sponsor AED 1,500 · Title sponsor AED 6,000 · in-kind welcome", "View sponsorship deck" absolute link in a new tab, the sponsor tick; sticky "Pay AED 100" bar; states: open / waitlist-only for my tier / full / pending payment (Continue payment) / confirmed / withdrawn / closed), `client/src/hooks/useTournament.ts`, `client/src/components/marketplace/TournamentPromo.tsx` (banner with counter, `IqPassPromoCard` shape), `client/src/components/marketplace/TournamentEntryCard.tsx` (My games entry with Withdraw and the sponsorship card), `client/src/pages/marketplace/MarketplaceHome.tsx` (after `:185`), `Dashboard.tsx` (around `:746`), `BookSessions.tsx` (pinned row between `:695` and `:697`), `MyBookings.tsx` (`:967-970`, `:978-980`), `CheckoutSuccess.tsx` / `CheckoutCancel.tsx` (tournament branch on `registration_id`), `MobileBottomNav.tsx:41-43`, `App.tsx` (route after `:261`, static import), `client/public/docs/shuttleiq-premier-league-sponsorship.pdf` (the 4.8 MB file, same commit as the link), tests `tests/tournament-page.test.tsx`, `tests/tournament-slots.test.tsx`, `tests/tournament-deck-asset.test.ts` (file exists, href matches, `rel="noopener noreferrer"`, absolute host).
- Migration: none.
- Verification: jsdom tests for every state and for flag-off rendering nothing in all five slots; Playwright at 375 and 1280 (local `vite build` + stub API, the `portal-stub.mjs` pattern): `g3-home-loggedout`, `g3-dashboard`, `g3-sessions-pinned`, `g3-register-open`, `g3-register-sponsor-card`, `g3-register-waitlist`, `g3-register-pending`, `g3-mygames-entry`, `g3-checkout-success`; one real-device 375 check that the deck opens (iOS inline, Android viewer). Post-deploy: `curl -I https://shuttleiq.ai/docs/shuttleiq-premier-league-sponsorship.pdf` → `200 application/pdf`, 5,066,981 bytes; served bundle grep for a distinctive string; flag still off so no route answers.

### Gate 4 — Admin page and endpoints

- Files: `server/tournament/routes.ts` (admin: `GET /api/admin/tournament` summary + registrations by tier with frozen tier and current level, waitlist, refunds owed, sponsor-interest filter; `POST …/registrations/:id/promote` transactional → `pending_payment`; `POST …/registrations/:id/mark-paid` `{ method, note }` (adminConfirm seam); `POST …/registrations/:id/mark-refunded`; `POST …/registrations/:id/cancel` (unpaid rows only, guards from `marketplace-routes.ts:5103-5145`); `GET …/export.csv`), `server/csv.ts` (lifted `csvEscape/buildCsv/sendCsv`; `server/routes.ts:4662-4681` switched to import it, listed for approval), `client/src/pages/TournamentAdmin.tsx` (tier tabs, counts vs caps, waitlist with Promote, refunds owed with Mark refunded, sponsor-interest column/filter, CSV button via `downloadAdminCsv`, 403 handling), `App.tsx` (after `:200`), optional nav link (Q9), tests `tests/tournament-admin.test.ts` (admin-gated 401/403, captain excluded, promote transactional and lands on `pending_payment`, CSV escaping and Dubai-formatted timestamps, sponsor filter).
- Migration: none.
- Verification: HTTP tests; `tests/captain-role.test.ts` forbidden-surfaces list extended with the new admin paths; Playwright `g4-admin-375`, `g4-admin-1280`, `g4-admin-waitlist-1280`; CSV opened and the header row checked.

### Gate 5 — Notifications and reminders

- Files: `server/tournament/announce.ts` (admin announce: `status='open'`, `open_notified_at` claim, bulk in-app rows, optional email per Q8), `server/tournament/reminders.ts` (`runTournamentReminderJob` on the 30-minute tick: at or after the instants in 0.5, claim the stamp on the tournaments row, insert in-app rows for linked accounts without an active registration plus a "complete your payment" row for `pending_payment` registrants, ledgered in `job_runs`), `server/scheduler.ts` (inside the Gate 2 block), `server/tournament/routes.ts` (`POST /api/admin/tournament/:id/announce`), tests `tests/tournament-reminders.test.ts` (exactly-once across two simulated instances, audience selection, no deck link in any notification text, test accounts excluded).
- Migration: none (stamps exist from Gate 1).
- Verification: tests; `SELECT` on `job_runs` and `marketplace_notifications` after the first live tick; screenshot `g5-bell-375` of the bell popover with a tournament notification.

### Gate 6 — Go-live

1. `session-window-check.mjs` CLEAR (a Sunday or a morning).
2. Seed row INSERT (A.4, 1 row) under `railway run`, shown and approved first; `deck_url` verified with `curl -I`.
3. Railway variable `TOURNAMENT_ENABLED=true` (a deploy; gate line recorded).
4. Read-only checks: config 200, counts endpoint all zeros, `/auth/me` unchanged, IQ Pass config unaffected, scheduler log lines for the two new jobs, `job_runs` rows appearing.
5. One real registration by Sandeep's own account (AED 100, refunded manually afterwards): webhook confirm, My games entry, admin list, CSV, sponsor tick → one email at sandeep@shuttleiq.ai.
6. Announce (Gate 5 endpoint) when Sandeep says so; screenshots `g6-live-375`, `g6-live-1280` from the TEST PLAYER account only.

### Gate 7 — Close-out (after 8 Oct)

Registration closes by instant comparison with no deploy. Admin: promote stragglers, mark refunds, export the draft CSV for 11 Oct. After 17 Oct: `status='completed'`, flag left on until the My games entry is no longer wanted, then a follow-up gate for the finance P&L "Tournament" line and the reconcile label (A.3).

---

## E. Open questions for Sandeep

1. **Q1 Close semantics.** "23:59" inclusive means a registration at 23:59:30 must succeed. Proposed: store the exclusive instant `2026-10-08T20:00:00Z` and compare `now < registration_closes_at` (copy still says "closes 11:59 PM on Thu 8 Oct"). Yes, or store `19:59:00Z` and lose the last minute?
2. **Q2 `payments.tournament_registration_id`.** Proposed yes (nullable, partial index, additive, in the same one-shot), so the money is labelled in reconciliation and the refunds plan can attach later. Without it the AED 100 rows are unlabelled Ziina money in the portal.
3. **Q3 Holds that outlive the close.** Proposed: holds created before close keep their full 24 h; promotions after close are capped at Sat 10 Oct 23:59 Dubai (`2026-10-10T19:59:00Z`) so the draft on 11 Oct sees final numbers; nothing promotes after that.
4. **Q4 Withdraw after the deadline.** Spec covers withdraw before 8 Oct 23:59 only. Proposed: allowed until the draft cut-off, no refund (`refund_status='not_due'`), seat released to the waitlist; blocked after 10 Oct 23:59.
5. **Q5 Money after expiry.** Proposed: restore to `confirmed` if a seat in that tier is still free at that moment, otherwise record and flag for a manual refund. Or always flag (the IQ Pass rule)?
6. **Q6 Registration opens when?** Needed for the seed row and the announce date; also whether the page is reachable before "open" (proposed: flag on + `status='draft'` shows a "opens soon" page with the counter hidden).
7. **Q7 Plus/Elite early access.** The 7 Sep Club Plus copy promises "first access to tournaments". Proposed: none for this event (open to all at the same instant), and the promise is met by the announcement going to Plus/Elite in-app first by a few hours. Or a real 24 h early-access window (adds `early_access_opens_at` and a pack-tier check)?
8. **Q8 Email broadcast.** In-app "registration open" and reminders are safe. An EMAIL to all 512 accounts would be the app's first non-transactional send with no opt-out or unsubscribe footer. Proposed: in-app only for the broadcast; email only to registrants (confirmation, promotion, 24 h "complete payment"). Yes?
9. **Q9 Admin discoverability.** Add a "Tournament" link to the admin header/tabConfig (`SessionsManagement.tsx:243-255`, one line, touches a shared file), or URL-only like `/admin/iq-pass`?
10. **Q10 Tier change before the draft.** A player registered as Competitive who becomes Professional by 11 Oct stays Competitive on the record. Any re-bucketing is a manual one-row UPDATE under the standing rule. Agreed?
11. **Q11 Venue and the 17 Oct clash.** The spec names no venue; production already has a regular Fire Rallies session on Sat 17 Oct 18:00–20:00 (capacity 24, `1643b1ff…`). Is the tournament at Fire Rallies replacing that session (then the row should be cancelled or repurposed, a data change), or elsewhere with the regular session kept? The seed row needs `venue_name`.
12. **Q12 Deploy freeze on tournament night.** `session-window-check.mjs` only sees `bookable_sessions`. Proposed: treat 17 Oct 17:30–22:30 Dubai and 8 Oct 19:30–00:30 as manual no-deploy windows recorded in PROGRESS.md, rather than extending the script. Or extend the script to read `tournaments` (a code change)?
13. **Q13 Screenshot folder.** The standing rule names `docs/iq-pass/screens/`; proposed `docs/tournament/screens/` with the same naming, viewed before "verified".
14. **Q14 Sponsor inbox.** `sandeep@shuttleiq.ai` is in the spec; the sender is `noreply@shuttleiq.org` with no reply-to support, so the player's email goes in the body. Fine, or add `replyTo` to the shared `sendEmail` (a change to a shared seam)?
15. **Q15 Reminder send times.** "3 days left" and "24 h left" measured from 23:59 land at midnight. Proposed Mon 5 Oct 09:00 and Wed 7 Oct 21:00 Dubai (0.5). Yes?
16. **Q16 Deck contents.** The PDF could not be rendered here; please confirm the deck states the same prices as the sponsorship card (AED 1,500 team, AED 6,000 title) and names the venue, or the card copy is adjusted.

---

## F. Not in this plan

Automated Ziina refunds (parked, `docs/refunds/PLAN.md`), team draft tooling, match scheduling on the night, a finance P&L "Tournament" line (follow-up after Gate 7), an admin "create tournament" UI (the single event is seeded by SQL), and the waitlist gates proposed after the 19 Sep incident.

---

## G. Sign-off and decisions (Sandeep, 2026-09-23) — overrides sections A–F where they differ

- **Q1** Registration closes at the exclusive instant `2026-10-08T20:00:00Z` (23:59:59 Thu 8 Oct Dubai still registers). Rules compare `now < X` everywhere.
- **Q2** Yes: nullable `payments.tournament_registration_id` with a partial index, in `tournament_v1`.
- **Q6, two-stage open (replaces Q7):** Club Plus + Elite members from `2026-09-25T08:00:00Z` (Fri 12:00 Dubai), everyone from `2026-09-25T14:00:00Z` (Fri 18:00 Dubai). Page, home banner and pinned Sessions row are hidden before the open, and shown only to members during the members stage. The in-app "registration open" notification goes to members at 08:00Z and to everyone else at 14:00Z; it moves from Gate 5 into Gate 2 because it must exist at the open.
- **Q8** All three broadcasts (open, 3 days left, 24 h left) are in-app only. No mass email. Transactional emails to registrants and the one sponsor-interest email to Sandeep stay.
- **Q11** Venue is **BASELINE SPORTS ACADEMY DIP** (venues `99dddcef`, "Dubai Investment Park Second - Dubai", https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9), not Fire Rallies.
- **Q3** A promotion's hold is 24 h capped at the draft cut-off `2026-10-10T20:00:00Z` (last second Sat 10 Oct Dubai); no promotions from the cut-off.
- **Q4** Withdraw before `2026-10-08T20:00:00Z`: a paid entry is owed a refund (`refund_status = 'pending'`, refunded in the Ziina dashboard). 9–10 Oct: the seat is freed, no refund (`'not_due'`). From the cut-off: blocked.
- **Q5** Money landing after a hold expired restores the entry if the tier still has a seat under the lock, otherwise it is recorded and a manual refund is owed.
- **Q14** The sponsor-interest email carries the player's name, company and phone only.
- **Q15** Reminders fire at the exact instants: "3 days left" `2026-10-05T20:00:00Z`, "24 h left" `2026-10-07T20:00:00Z` (in-app only, so a midnight arrival wakes nobody).
- **Q9** Admin nav link added in Gate 4. **Q10** Tier frozen; any re-bucket is a manual one-row update under the standing rule. **Q12** Manual no-deploy windows: 17 Oct 17:30–22:30 Dubai and 8 Oct 19:30–00:30 Dubai (the window script cannot see tournament night). **Q13** Screenshots under `docs/tournament/screens/`.
- **Q16** Do not ship the current deck. A corrected deck (slide 4 venue = Baseline DIP, everything else unchanged) arrives before Gate 3.
- **Gate 2 extra:** prove intent → webhook confirm → 24 h expiry with a Ziina test-mode intent before Gate 6's real AED 100 registration.
- **Timeline:** open Fri 25 Sep. Gate 1 Wed 23 Sep morning; Gate 2 Thu 24 Sep morning; Gate 3 and flag on Fri 25 Sep morning; go/no-go Fri 11:00 Dubai, before the members' 12:00 open. Deploys mornings or Sunday only, never in a live session.

### G.1 As built in Gate 1 (differs from the A.4 draft)

- `tournaments` gained `slug` (unique), `registration_opens_at_members` (nullable), `members_open_notified_at`, `draft_cutoff_at`. `status` is `'draft' | 'published' | 'completed' | 'cancelled'`; "open" and "closed" are derived from the instants, never stored.
- `tournament_registrations` gained `payment_method`, `admin_note`, a second active-row unique index on `(tournament_id, player_id)` (one entry per player even across two accounts), and `t_shirt_size NOT NULL`. The separate waitlist index was dropped as redundant.
- Seeded row: `9426fbe2-aa3e-4c79-9d39-37ac4c15278c`, slug `premier-league-2026`, status `published` (still invisible while `TOURNAMENT_ENABLED` is unset).
- Pure rules in `server/tournament/rules.ts`: `decideRegistration` (a freed seat belongs to the waitlist: a newcomer is seated only while held + waitlisted < cap), `registrationPhase` / `canRegister` / `isVisibleTo` (two-stage open), `holdExpiresAt` / `canPromote` (Q3), `withdrawOutcome` (Q4).
