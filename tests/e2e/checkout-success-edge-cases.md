# CheckoutSuccess: Waitlisted / Error / Extra-Guest — E2E Test Plan

This is a Playwright-style end-to-end test plan for the
`/marketplace/checkout/success` page that exercises the three
post-payment branches NOT covered by `checkout-success-signin-notice.md`:

1. Waitlisted card (session filled up at the same moment payment went through).
2. Error card (confirm endpoint either reports a non-success Ziina status, or
   the request to it fails outright, or `booking_id` was missing in the URL).
3. Extra-guest success variant (`?extra_guest=1`) — different title and copy.

These flows are otherwise hard to reproduce manually because they require
either a mid-payment race condition (waitlisted), a Ziina failure
(error-with-status), or a third-party network outage (network error).

The project has no in-process test runner. Re-run this plan on demand by
loading the `testing` skill and invoking
`runTest({ testPlan, relevantTechnicalDocumentation })` with the contents
of the two sections below.

## Page under test

- `client/src/pages/marketplace/CheckoutSuccess.tsx`
- Server endpoint: `POST /api/marketplace/bookings/:id/confirm`
  (`server/marketplace-routes.ts` ~ line 2239)

The page polls the confirm endpoint up to 10 times, 3s apart. Possible
JSON shapes the endpoint returns and how the page reacts:

| Server response                                          | Page status   |
| -------------------------------------------------------- | ------------- |
| `{ confirmed: true, booking }`                           | `success`     |
| `{ confirmed: false, waitlisted: true, booking, ... }`   | `waitlisted`  |
| `{ confirmed: false, status: <ziina-status> }` (10x)     | `error`       |
| Network failure / non-JSON 5xx (10x)                     | `error`       |
| (no `booking_id` in URL)                                 | `error` (instant) |

Auto-redirect: only fires when `status === 'success' && !showSignInNotice`.
Waitlisted/error MUST NOT auto-redirect.

## Test plan

```text
Test 1: Waitlisted card renders correctly with no auto-redirect.

1. [New Context] Create a fresh browser context (no stored auth).

2. [Browser] BEFORE navigating, install a Playwright route handler that
   intercepts POST requests matching the glob
   '**/api/marketplace/bookings/*/confirm' and fulfills them with:
     status: 200
     contentType: 'application/json'
     body: JSON.stringify({
       confirmed: false,
       waitlisted: true,
       status: 'session_full',
       booking: {
         id: 'mock-waitlisted-booking',
         sessionId: 'mock-session',
         status: 'waitlisted',
         paymentMethod: 'ziina',
         amountAed: 50,
         walletAmountUsed: 0,
         spotsBooked: 1
       }
     })

3. [Browser] Navigate to
   /marketplace/checkout/success?booking_id=mock-waitlisted-booking

4. [Browser] Wait up to 8s for the waitlisted state to render.

5. [Verify] On the waitlisted card:
   - data-testid="text-waitlisted-title" is visible and reads
     "Added to Waitlist".
   - data-testid="text-waitlisted-message" is visible and contains
     "added to the waitlist".
   - data-testid="text-booking-confirmed" is NOT present.
   - data-testid="text-error-title" is NOT present.
   - The "Redirecting to your bookings in Ns…" countdown text is NOT present.
   - data-testid="button-view-bookings" IS present (the CTA falls back to
     "View My Bookings" because showSignInNotice is false).
   - data-testid="button-browse-sessions" IS present.

6. [Browser] Wait an additional 5s on the same page.

7. [Verify] URL pathname is still /marketplace/checkout/success
   (auto-redirect MUST NOT fire for the waitlisted branch).

---

Test 2: Error card renders when no booking_id is present in the URL
(instant error path; no polling).

8. [New Context] Create a fresh browser context.

9. [Browser] Navigate to /marketplace/checkout/success
   (no booking_id query param at all).

10. [Verify] On the error card:
    - data-testid="text-error-title" is visible and reads "Something went wrong".
    - data-testid="text-error-message" is visible and contains
      "Missing booking information".
    - data-testid="text-booking-confirmed" is NOT present.
    - data-testid="text-waitlisted-title" is NOT present.
    - data-testid="button-view-bookings" IS present (the page still renders
      its CTA section once status !== 'verifying').

---

Test 3: Error card renders when the confirm endpoint repeatedly reports a
non-success Ziina status (slow-error path: takes ~30s due to 10 retries
spaced 3s apart).

11. [New Context] Create a fresh browser context.

12. [Browser] BEFORE navigating, install a Playwright route handler that
    intercepts POST requests matching '**/api/marketplace/bookings/*/confirm'
    and fulfills EVERY call with:
      status: 200
      contentType: 'application/json'
      body: JSON.stringify({ confirmed: false, status: 'failed' })

13. [Browser] Navigate to
    /marketplace/checkout/success?booking_id=mock-error-booking

14. [Browser] Wait up to 45s for the error state to render (the page does
    10 attempts with 3s gaps before surfacing the error, ~27s minimum).
    A reliable signal is data-testid="text-error-title" appearing.

15. [Verify] On the error card:
    - data-testid="text-error-title" is visible and reads "Something went wrong".
    - data-testid="text-error-message" is visible and contains
      "Payment status: failed" AND "Please contact support if you were charged".
    - data-testid="button-view-bookings" IS present.

16. [Verify] URL pathname is still /marketplace/checkout/success
   (auto-redirect MUST NOT fire for the error branch).

---

Test 4: Error card renders when the confirm endpoint outright fails
(network/abort path).

17. [New Context] Create a fresh browser context.

18. [Browser] BEFORE navigating, install a Playwright route handler that
    intercepts POST requests matching '**/api/marketplace/bookings/*/confirm'
    and aborts EVERY call (use `route.abort('failed')`).

19. [Browser] Navigate to
    /marketplace/checkout/success?booking_id=mock-network-error-booking

20. [Browser] Wait up to 45s for the error state to render.

21. [Verify] On the error card:
    - data-testid="text-error-title" is visible.
    - data-testid="text-error-message" is visible and contains
      "Failed to verify payment".

---

Test 5: Extra-guest success variant — title and copy reflect "Guest Added"
language instead of "Booking Confirmed".

22. [DB] Create a fresh marketplace user, bookable session, and CONFIRMED
    booking (mirrors Test 1 setup of checkout-success-signin-notice.md).

    INSERT INTO marketplace_users (id, email, name, role, email_verified)
    VALUES ('test-user-' || md5(random()::text),
            'cs-eg-' || md5(random()::text) || '@example.com',
            'CS Extra-Guest Test User', 'player', true)
    RETURNING id;
    -- capture as ${userId}

    INSERT INTO bookable_sessions
      (id, title, venue_name, date, start_time, end_time,
       court_count, capacity, price_aed, status)
    VALUES ('test-session-' || md5(random()::text),
            'CS Extra-Guest Test Session', 'Test Venue',
            NOW() + INTERVAL '7 days', '18:00', '20:00', 2, 16, 50, 'upcoming')
    RETURNING id;
    -- capture as ${sessionId}

    INSERT INTO bookings
      (id, user_id, session_id, status, payment_method, amount_aed, spots_booked)
    VALUES ('test-booking-' || md5(random()::text),
            '${userId}', '${sessionId}', 'confirmed', 'ziina', 50, 2)
    RETURNING id;
    -- capture as ${bookingId}

23. [New Context] Create a fresh browser context.

24. [Browser] Navigate to
    /marketplace/checkout/success?booking_id=${bookingId}&extra_guest=1
    (no resume token; confirm endpoint short-circuits because the booking
    is already 'confirmed').

25. [Browser] Wait up to 8s for the success state to render.

26. [Verify] On the success card:
    - data-testid="text-booking-confirmed" is visible and reads
      "Guest Added!" (NOT "Booking Confirmed!").
    - data-testid="text-success-message" is visible and contains
      "extra spot has been confirmed" and "CS Extra-Guest Test Session".
    - data-testid="button-view-bookings" IS present.
    - The "Redirecting to your bookings in Ns…" countdown text IS visible
      (extra-guest still auto-redirects on success).

Cleanup (best-effort):
27. [DB] DELETE FROM bookings WHERE id = '${bookingId}';
28. [DB] DELETE FROM bookable_sessions WHERE id = '${sessionId}';
29. [DB] DELETE FROM marketplace_users WHERE id = '${userId}';
```

## Relevant technical documentation

```text
PAGE BEHAVIOR (client/src/pages/marketplace/CheckoutSuccess.tsx)
- Reads booking_id and (optional) extra_guest, resume from window.location.search.
- If booking_id is missing, immediately sets status = 'error' with
  errorMessage = 'Missing booking information' (no polling).
- Otherwise polls POST /api/marketplace/bookings/:id/confirm:
    - { confirmed: true, booking } -> status = 'success'
    - { confirmed: false, waitlisted: true, booking, ... } -> status = 'waitlisted'
    - On the LAST (10th) attempt, if neither flag was set:
        - { ..., status: <ziinaStatus> } -> errorMessage =
          `Payment status: ${ziinaStatus}. Please contact support if you were charged.`
        - else -> errorMessage = 'Payment not confirmed. Please contact support.'
    - Network/parse error on the LAST attempt -> errorMessage =
      'Failed to verify payment. Please check My Bookings or contact support.'
- Polling: MAX_ATTEMPTS = 10, RETRY_DELAY_MS = 3000. Worst case ~27s before
  the error state renders. Tests for the slow-error path should allow ~45s.
- Auto-redirect: only when status === 'success' && !showSignInNotice.
  Waitlisted and error MUST NOT auto-redirect.
- isExtraGuest is read once at mount from ?extra_guest=1 and switches:
    - Title: "Guest Added!" (still uses data-testid="text-booking-confirmed").
    - Message: "The extra spot has been confirmed for <sessionTitle>." (uses
      data-testid="text-success-message").

DATA-TESTIDS USED BY THIS PLAN
- text-booking-confirmed     (success/extra-guest title)
- text-success-message       (success/extra-guest body copy)
- text-waitlisted-title      (waitlisted card title)
- text-waitlisted-message    (waitlisted card body copy)
- text-error-title           (error card title)
- text-error-message         (error card body copy)
- button-view-bookings       (default CTA when not in sign-in-notice mode)
- button-browse-sessions     (secondary CTA)

CONFIRM ENDPOINT NOTES
POST /api/marketplace/bookings/:id/confirm short-circuits with
{ confirmed: true, booking } when booking.status === 'confirmed'. This is
why Test 5 can use a directly-seeded confirmed booking with no Ziina
interaction.

For Tests 1, 3, 4 we mock the endpoint via Playwright route handlers so
no DB rows are required and Ziina is never contacted.

PLAYWRIGHT ROUTE-INTERCEPT EXAMPLE (apply per-context, BEFORE navigating)
  await context.route('**/api/marketplace/bookings/*/confirm', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ confirmed: false, waitlisted: true, ... }),
    });
  });

  // For Test 4 (network failure):
  await context.route('**/api/marketplace/bookings/*/confirm', (route) => {
    route.abort('failed');
  });

DB SCHEMA HIGHLIGHTS (shared/schema.ts)
- marketplace_users(id, email UNIQUE, name, role, email_verified, ...)
- bookable_sessions(id, title, venue_name, date, start_time, end_time,
  court_count, capacity, price_aed, status, ...)
- bookings(id, user_id, session_id, status, payment_method, amount_aed,
  spots_booked, ...)
  - Partial unique index on (user_id, session_id) WHERE status != 'cancelled'.

ROUTING NOTES
- /marketplace/checkout/success is a public route (no auth required).
- Tests 1-4 don't need a real session or DB row because the confirm
  request is intercepted client-side.
```

## Last verified

All 5 cases passed via the testing skill on 2026-04-24. See task #200.
