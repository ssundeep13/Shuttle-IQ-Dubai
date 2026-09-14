# IQ Pass — progress

**Current gate:** 1 — schema, flag, config read, pure rules · **Tests:** 1268/1269 (the one failure is the known `portal-runner-wall` timeout flake) · **Hard stop pending:** no · **Next action for Sandeep:** none yet

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

## Found, not fixed

- Pre-fix data only: a booking whose `ziina_payment_intent_id` was overwritten by a second `initiate-payment` before this fix has a completed payments row under the first intent. `confirmPromotedBookingIfPaid` looks the booking up by that intent, misses, and returns false; `initiate-payment` now 409s, so the admin path (Confirm Payment) is the way through. No such rows exist today (Owais was repaired by hand on 3 Sep).
- `scheduler.ts` computes `dateLabel` before the promotion branch; unused on the paid path (harmless).
