# IQ Pass — progress

**Current gate:** 2 — code complete and committed, **staging verification pending** · **Tests:** 1355/1355 · tsc 28 · **Hard stop pending: YES — create the Railway staging environment (ruling E4a)** · **Next action for Sandeep:** the three steps under "HARD STOP 1" below, then reply "staging created"

Branch `feature/iq-pass` (from `railway-migration` @ `73e44b2`). Gate 0 is cherry-picked to `railway-migration` and deployed on its own; everything else stays on the feature branch until Gate 8.

## Rulings applied (Sandeep, 2026-09-14)

- E1(a) `payments.pack_id` + `payments.booking_id` nullable — pre-approved, dry-run output to be saved here, no stop.
- E2(a) per-seat allocation in `bookings.amount_aed` (47 / 45 / 43), `payment_method = 'iq_pass'`.
- E3(a) move cutoff = 5 h before the session being vacated.
- E4(a) Railway staging environment — **hard stop when it needs creating**.
- E5(a) Rankings tier pill from an overlay endpoint; the 7-key public projection stays.
- E6(a) avatar-dropdown entry + Sessions banner + Profile card; no sixth tab.
- E7 sizes S/M/L/XL/XXL; re-pick credits lapse when the pack completes.
- Amendment 1: one shared "collected revenue" helper replaces the five predicates; a test asserts every call site uses it; no pack code reads `amount_aed` directly.
- Amendment 2: exactly two hard stops — creating the staging environment; the real-money AED 188 test + production flag-on.

## DECISION log

- **DECISION (brand hex):** the brief lists `#003E8C` / `#F5EFE0`, but the existing suite bans exactly those two values in the customer layer (`tests/gate2-typography-brand.test.tsx:141-150`, "zero drifted brand hex") and only allows `#006B5F` on the `tealText` token line. The standing rule says the full suite must be green and flag-off behaviour is proven by the existing suite, so new UI uses the app's brand tokens from `client/src/pages/marketplace/LandingComponents.tsx` (`MKT.navy #002C84`, `MKT.tealText #006B5F`, `MKT.cream #F2ECE1`, `FF_BODY` = Inter). Same family, no drifted literals, no pin loosened. Say the word if you want the tokens themselves changed — that is a separate design gate.

## Gate log

### Gate 0 — webhook capacity-race fix — DONE (2026-09-14, deployed)

- RED: `tests/webhook-capacity-race.test.ts` (12 tests) failed at import (`server/paidBookingGuard` absent), then 11/12 after the splice (my tripwire assumed single quotes; corrected), then 12/12.
- Code: `server/paidBookingGuard.ts` (new, `hasCompletedPayment`), `server/webhookHandler.ts` (race branch records the payment, returns `paid: true`; new export `confirmPromotedBookingIfPaid`), `server/guestSlotRefund.ts`, `server/scheduler.ts`, `server/marketplace-routes.ts` (three promotion sites honour a recorded payment with a "Your spot is confirmed" notification; `initiate-payment` → 409 `already_paid`).
- Bar: full suite 1268/1269 (known flake only), tsc 28.
- Commits: `daf4774` on `feature/iq-pass`; cherry-picked as `9cd941d` on `railway-migration`; Railway deploy SUCCESS 12:00 Dubai; `/api/health` 200.
- **Live check (production, test accounts only, torn down):** Smash Sports Academy 16 Sep (`f06f3e33`, 18 cap, baseline 15 free).
  - A. ZZ tester `confirmed` (legacy cash row) + TEST PLAYER `waitlisted #1` carrying a completed payments row → `POST /bookings/:id/cancel` as ZZ tester → 200, `promoted` = TEST PLAYER; TEST PLAYER booking read back **`confirmed`**, `promoted_at` set, guest slot `confirmed`, notifications = `["Your spot is confirmed"]` only (no "complete payment" notification), payments rows still 1, no other notifications for the test account.
  - B. TEST PLAYER `pending_payment` hold with a completed payments row → `POST /bookings/:id/initiate-payment` → **409 `already_paid`**, intent id untouched (no second intent minted).
  - Teardown: 2 payments, 2 guest slots, 1 notification, 3 bookings deleted; 0 rows reference the test intents; session back to 15 free / 0 test bookings.

### Gate 1 — schema, flag, config read, pure rules — DONE (2026-09-14, feature branch only)

- RED: `tests/iq-pass-rules.test.ts` + `tests/iq-pass-schema.test.ts` failed at import (modules absent) → GREEN 32/32.
- Code: `shared/schema.ts` (`packs`, `jobRuns`, `bookings.packId` / `movedFromBookingId`, `payments.packId`, `payments.bookingId` nullable), `server/iqPass/flag.ts`, `server/iqPass/rules.ts` (tiers, cap, window, `validatePicks`, `canMoveSeat`, `jerseyEligible`), `server/iqPass/routes.ts` (`iqPassConfigHandler`), `server/marketplace-routes.ts` (`GET /api/marketplace/config`), `server/storage.ts` (one type-only null guard in `getPaymentTotalsByBookingIds`), `scripts/one-shot/2026-09-15-iq-pass-v1.mts`.
- Bar: tsc 28 (one new error from the nullable column, fixed by the guard); full suite 1301/1301.
- Commit `04d9d72` on `feature/iq-pass` (not deployed; prod still runs `9cd941d`).
- **Migration `iq_pass_v1` — dry-run saved, then run for real on production** (ruling E1a pre-approved): registry was "not run", `packs` / `job_runs` absent, `payments.booking_id` nullable NO → all 11 statements ran in one transaction → COMMITTED; read-back shows `packs` (19 columns), `job_runs` (7), `bookings.pack_id` / `moved_from_booking_id` nullable YES, `payments.pack_id` YES, `payments.booking_id` **nullable YES**. Production health 200 afterwards; `/api/marketplace/sessions` 200; `/api/marketplace/config` 404 on the old code (as today). Full outputs: scratch `g1-migration-dry-run.txt` / `g1-migration-run.txt` (session temp), key lines reproduced here.
- Flag-off proof: `/api/marketplace/config` answers the same JSON 404 as any unknown `/api` path (`server/index.ts:186-191`), so the route table is unchanged while off.

### Gate 2 — purchase hold, single Ziina payment, atomic confirm, hold expiry — CODE DONE, VERIFICATION WAITING ON STAGING

- RED: five files failed at import (`server/iqPass/{purchase,confirm,jobs,store}`, `server/iqPassEmail`), then 53/54 (one pin adjusted to `lastIndexOf` because the hold-gone branch records its payment before the seat-count check), then 54/54; two follow-ups after the full run (schema test needed the JWT env vars once `routes.ts` pulled in the auth middleware; a `Set` spread tripped the TS target) → full suite **1355/1355**, tsc **28**.
- Code: `server/iqPass/store.ts` (calendar query bounded to the window, `createHold` with `FOR UPDATE` + `validatePicks` under the lock, `confirmTx` all-or-nothing with the RETURNING count check and ONE payments row `{pack_id, booking_id NULL}`, `cancelHold`, `expireHolds`, reconciliation candidates), `purchase.ts` (`buildCalendar`, `startPurchase`, jersey rule, 30-minute hold, intent-failure rollback), `confirm.ts` (hooks once, `iq_pass_active` notification, email), `jobs.ts` (hold expiry every 5 min + waitlist promotion; reconciliation every 10 min, 48 h look-back), `routes.ts` (`createIqPassRouter`: calendar / purchase / confirm poll, all JSON 404 while off), `server/iqPassEmail.ts` + `emailClient.sendIqPassConfirmationEmail` (opening line verbatim, key `iq-pass-confirm/<packId>`), `webhookHandler.ts` (booking → pack (flag on only) → guest), `scheduler.ts` (jobs under `isIqPassEnabled()`), `ziinaReturn.ts` (`pack_id` on every return URL), `marketplace-routes.ts` (router mounted with the private resume-token / deep-link helpers injected; six pack-seat guards: cancel, initiate-payment, cash-paid, payment-not-received, admin-confirm, admin-promote).
- Commit `b75b272` on `feature/iq-pass` (pushed). Production still runs `9cd941d`; nothing pack-related is deployed there.
- Flag-off proof: the pack store is never consulted by the webhook while off (test), the scheduler list is unchanged while off (pin), every pack route answers the standard JSON 404 (HTTP test), the return URLs are byte-identical without `packId` (test), and the six guards only fire on rows with `pack_id` (none exist).
- **Staging verification (pending):** script ready at the session scratchpad `g2-staging-verify.mjs` (`config` → `purchase` → pay with a Ziina test card → `poll` → `verify` → `expiry` → `teardown`).

## HARD STOP 1 — create the Railway staging environment (ruling E4a)

Why now: Gate 2's exit criterion is a real purchase over HTTP with a Ziina **test-mode** intent, and the deployed app can only mint test-mode intents when `NODE_ENV !== 'production'` (`server/ziinaClient.ts:156`). Railway has one environment (production). I will not create a billable environment on your account.

What you do (about five minutes in the Railway dashboard, project ShuttleIQ):
1. **Environments → New environment → name `staging` → "Duplicate" from `production`.** This copies both services (`shuttleiq-app` + Postgres) with their variables. The new Postgres starts empty — I seed it from a production dump afterwards (Docker `postgres:18` `pg_dump` → `pg_restore`, read-only against production).
2. In the **staging** `shuttleiq-app` service: **Settings → Source → branch `feature/iq-pass`**, and **Settings → Networking → Generate Domain** (any `*.up.railway.app` name is fine).
3. Reply **"staging created"** (paste the generated staging domain if handy; nothing secret). I will then set the staging variables myself with the CLI (`NODE_ENV=staging`, `IQ_PASS_ENABLED=true`, `REPLIT_DOMAINS=<staging domain>`, everything else inherited), seed the database, run the Gate 2 verification with TEST PLAYER and a Ziina test card, tear down, and continue with Gate 3.

Cost: one extra web service + one Postgres while it exists (usage-based, small); I will remind you to delete it after Gate 8.

## Found, not fixed

- Pre-fix data only: a booking whose `ziina_payment_intent_id` was overwritten by a second `initiate-payment` before this fix has a completed payments row under the first intent. `confirmPromotedBookingIfPaid` looks the booking up by that intent, misses, and returns false; `initiate-payment` now 409s, so the admin path (Confirm Payment) is the way through. No such rows exist today (Owais was repaired by hand on 3 Sep).
- `scheduler.ts` computes `dateLabel` before the promotion branch; unused on the paid path (harmless).
