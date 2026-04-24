# CheckoutSuccess: Post-Payment Sign-In Notice — E2E Test Plan

This is a Playwright-style end-to-end test plan for the
`/marketplace/checkout/success` page. It exercises the branch where the
payment-resume token exchange fails and the user has no session, which is hard
to reproduce organically (requires expired/replayed resume tokens combined
with a fresh browser context).

The project has no in-process test runner. Re-run this plan on demand by
loading the `testing` skill and invoking `runTest({ testPlan, relevantTechnicalDocumentation })`
with the contents of the two sections below.

## Page under test

- `client/src/pages/marketplace/CheckoutSuccess.tsx`
- `client/src/contexts/MarketplaceAuthContext.tsx`
- Server endpoints:
  - `POST /api/marketplace/auth/resume` (`server/marketplace-routes.ts` ~ line 421)
  - `POST /api/marketplace/bookings/:id/confirm` (`server/marketplace-routes.ts` ~ line 2239)

`showSignInNotice = (status === 'success' && sessionLost && !isAuthenticated)`.
When true, the page suppresses the auto-redirect timer and swaps the
"View My Bookings" CTA for a "Sign In" link pointing to
`/marketplace/login?from=%2Fmarketplace%2Fmy-bookings`.

## Test plan

```text
Test 1: Sign-in notice appears when the resume token exchange fails for an
unauthenticated user.

1. [DB] Create a fresh marketplace user, bookable session, and CONFIRMED
   booking. Use unique IDs to avoid colliding with other test runs.

   INSERT INTO marketplace_users (id, email, name, role, email_verified)
   VALUES ('test-user-' || md5(random()::text),
           'cs-test-' || md5(random()::text) || '@example.com',
           'CS Notice Test User', 'player', true)
   RETURNING id;
   -- capture as ${userId}

   INSERT INTO bookable_sessions
     (id, title, venue_name, date, start_time, end_time,
      court_count, capacity, price_aed, status)
   VALUES ('test-session-' || md5(random()::text),
           'CS Notice Test Session', 'Test Venue',
           NOW() + INTERVAL '7 days', '18:00', '20:00', 2, 16, 50, 'upcoming')
   RETURNING id;
   -- capture as ${sessionId}

   INSERT INTO bookings
     (id, user_id, session_id, status, payment_method, amount_aed, spots_booked)
   VALUES ('test-booking-' || md5(random()::text),
           '${userId}', '${sessionId}', 'confirmed', 'ziina', 50, 1)
   RETURNING id;
   -- capture as ${bookingId}

2. [New Context] Create a new browser context with no stored authentication
   (simulates the PWA → system browser hand-off where localStorage is empty).

3. [Browser] Navigate to
   /marketplace/checkout/success?booking_id=${bookingId}&resume=clearly-invalid-token-xyz

4. [Browser] Wait up to 8s for the success state to render. The bogus resume
   token should produce a 401 from /api/marketplace/auth/resume which sets
   sessionLost = true. The confirm endpoint short-circuits on the first
   attempt because the booking is already 'confirmed'.

5. [Verify] On the success card:
   - data-testid="text-booking-confirmed" is visible and reads "Booking Confirmed!".
   - data-testid="notice-signin-required" is visible and contains
     "Please sign in again to view your bookings".
   - data-testid="button-signin-required" (label "Sign In") is visible.
   - data-testid="button-view-bookings" is NOT present.
   - The "Redirecting to your bookings in Ns…" countdown text is NOT present.

6. [Browser] Click data-testid="button-signin-required".

7. [Verify] URL is /marketplace/login?from=%2Fmarketplace%2Fmy-bookings.

---

Test 2: Happy-path auto-redirect still fires when no resume token is present.

8. [DB] Create another confirmed booking. The unique partial index on
   (user_id, session_id) where status != 'cancelled' means we need a NEW
   session for the same user. Insert a second bookable_sessions row and a
   second confirmed bookings row pointing at ${userId}; capture as
   ${sessionId2} and ${bookingId2}.

9. [New Context] Create another fresh browser context.

10. [Browser] Navigate to
    /marketplace/checkout/success?booking_id=${bookingId2}
    (NO resume param at all).

11. [Verify] On the success card:
    - data-testid="text-booking-confirmed" is visible.
    - data-testid="notice-signin-required" is NOT present.
    - data-testid="button-view-bookings" IS present.
    - The "Redirecting to your bookings in" countdown text IS visible.

12. [Browser] Wait up to 6s for the auto-redirect to fire (countdown is 3s).

13. [Verify] URL is no longer /marketplace/checkout/success. Pathname is
    either /marketplace/my-bookings OR /marketplace/login (the protected-
    route guard bounces the unauthenticated context). Either outcome proves
    the auto-redirect fired.

Cleanup (best-effort):
14. [DB] DELETE FROM bookings WHERE id IN ('${bookingId}', '${bookingId2}');
15. [DB] DELETE FROM bookable_sessions WHERE id IN ('${sessionId}', '${sessionId2}');
16. [DB] DELETE FROM marketplace_users WHERE id = '${userId}';
```

## Relevant technical documentation

```text
PAGE BEHAVIOR (client/src/pages/marketplace/CheckoutSuccess.tsx)
- On mount reads booking_id and (optional) resume from the URL.
- If resume is present AND no marketplace tokens are in storage AND
  !isAuthenticated, POSTs the token to /api/marketplace/auth/resume.
  - 200 -> calls loginWithTokens(...)
  - non-2xx OR network error -> sets sessionLost = true
  - Always strips the resume param via history.replaceState afterward.
- Then polls /api/marketplace/bookings/:id/confirm up to 10 times, 3s apart.
- showSignInNotice = (status === 'success' && sessionLost && !isAuthenticated).
- Auto-redirect effect runs only when !showSignInNotice, counting down 3s
  before setLocation('/marketplace/my-bookings').

DATA-TESTIDS USED BY THIS TEST
- text-booking-confirmed
- notice-signin-required
- button-signin-required
- button-view-bookings

CONFIRM ENDPOINT SHORT-CIRCUIT
POST /api/marketplace/bookings/:id/confirm returns
{ confirmed: true, booking } immediately if booking.status === 'confirmed',
without consulting Ziina. Inserting a confirmed row directly is sufficient.

RESUME ENDPOINT FAILURE MODE
POST /api/marketplace/auth/resume returns 401 for any unparseable/unknown
token, so any garbage string reliably triggers sessionLost = true.

DB SCHEMA HIGHLIGHTS (shared/schema.ts)
- marketplace_users(id, email UNIQUE, name, role, email_verified, ...)
- bookable_sessions(id, title, venue_name, date, start_time, end_time,
  court_count, capacity, price_aed, status, ...)
- bookings(id, user_id, session_id, status, payment_method, amount_aed,
  spots_booked, ...)
  - Partial unique index on (user_id, session_id) WHERE status != 'cancelled'.

ROUTING NOTES
- /marketplace/checkout/success is a public route.
- /marketplace/my-bookings is protected; an unauthenticated redirect there
  is bounced to /marketplace/login. Both URLs are acceptable evidence the
  auto-redirect fired in Test 2.
```

## Last verified

Both cases passed via the testing skill on 2026-04-24. See task #198.
