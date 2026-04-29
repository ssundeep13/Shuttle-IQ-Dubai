import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { BookingsSheet } from '@/pages/SessionsManagement';
import { getQueryFn } from '@/lib/queryClient';

const QUEUE_SESSION_ID = 'queue-sess-1';
const BOOKABLE_ID = 'bookable-1';

const PENDING_LEGACY_ID = 'booking-pending-legacy';
const PENDING_PAYMENT_ID = 'booking-pending-payment';
const CONFIRMED_ID = 'booking-confirmed';

function makeQueueSession() {
  return {
    id: QUEUE_SESSION_ID,
    name: 'ISM Sports Services at Greenfield',
    location: 'Greenfield International',
    date: '2026-04-30',
    startTime: '20:00',
    endTime: '22:00',
    status: 'active',
    sessionFee: 0,
    sessionDuration: 120,
    courtCount: 4,
    courtFeeAed: 0,
    shuttleFeeAed: 0,
    pricePerPersonAed: 0,
    sessionFeeMinimum: 0,
    createdAt: new Date().toISOString(),
  };
}

function makeBookableSessions() {
  return [
    {
      id: BOOKABLE_ID,
      linkedSessionId: QUEUE_SESSION_ID,
      title: 'ISM Sports Services at Greenfield',
      date: '2026-04-30',
      startTime: '20:00',
      endTime: '22:00',
      capacity: 24,
      pricePerPersonAed: 49,
      bookingsCount: 3,
      attendedCount: 0,
      activeBookingsCount: 3,
      cancelledBookingsCount: 0,
      cancelledNoRefundCount: 0,
      waitlistCount: 0,
      revenueAed: 49,
      cashCollectedAed: 0,
      cashOutstandingAed: 0,
      ziinaPaidAed: 49,
      ziinaPendingAed: 98,
      manualBookingsCount: 0,
      manualBookingsRevenue: 0,
      bookableType: 'open',
    },
  ];
}

function makeBookings() {
  // 1 confirmed (just to populate header counts), 1 legacy 'pending', 1 'pending_payment'.
  return [
    {
      id: CONFIRMED_ID,
      sessionId: BOOKABLE_ID,
      userId: 'user-confirmed',
      status: 'confirmed',
      paymentMethod: 'ziina',
      cashPaid: false,
      amountAed: 49,
      spotsBooked: 1,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      user: { id: 'user-confirmed', name: 'Confirmed User', email: 'c@example.com' },
      guests: [],
    },
    {
      id: PENDING_LEGACY_ID,
      sessionId: BOOKABLE_ID,
      userId: 'user-legacy',
      // The status that brand-new Ziina checkout writes.
      status: 'pending',
      paymentMethod: 'ziina',
      cashPaid: false,
      amountAed: 49,
      spotsBooked: 1,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      user: { id: 'user-legacy', name: 'Legacy Pending', email: 'legacy@example.com' },
      guests: [],
    },
    {
      id: PENDING_PAYMENT_ID,
      sessionId: BOOKABLE_ID,
      userId: 'user-promoted',
      // The status the waitlist-promotion path writes.
      status: 'pending_payment',
      paymentMethod: 'ziina',
      cashPaid: false,
      amountAed: 49,
      spotsBooked: 1,
      isGuestBooking: false,
      promotedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      user: { id: 'user-promoted', name: 'Promoted From Waitlist', email: 'promoted@example.com' },
      guests: [],
    },
  ];
}

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/marketplace/admin/sessions')) {
      return new Response(JSON.stringify(makeBookableSessions()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/marketplace/sessions/${BOOKABLE_ID}/bookings`)) {
      return new Response(JSON.stringify(makeBookings()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/players')) {
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderSheet() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: 'throw' }) as any,
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BookingsSheet session={makeQueueSession() as any} onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('BookingsSheet — pending_payment visibility', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders both "pending" and "pending_payment" rows under Pending Payment, with admin Confirm Payment button on each', async () => {
    renderSheet();

    // Both payment-due rows must surface — this is the bug the task fixes.
    await waitFor(() => {
      expect(screen.getByTestId(`card-sheet-booking-${PENDING_LEGACY_ID}`)).toBeInTheDocument();
      expect(screen.getByTestId(`card-sheet-booking-${PENDING_PAYMENT_ID}`)).toBeInTheDocument();
    });

    // Per-row admin override must be available for both statuses, otherwise
    // a waitlist-promoted Ziina booking can't be manually rescued.
    expect(
      screen.getByTestId(`button-admin-confirm-${PENDING_LEGACY_ID}`)
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`button-admin-confirm-${PENDING_PAYMENT_ID}`)
    ).toBeInTheDocument();

    // The amber "Pending" payment badge must render for both — confirms the
    // badge variant logic accepts pending_payment, not just pending.
    expect(
      screen.getByTestId(`badge-payment-${PENDING_LEGACY_ID}`)
    ).toHaveTextContent(/Pending/i);
    expect(
      screen.getByTestId(`badge-payment-${PENDING_PAYMENT_ID}`)
    ).toHaveTextContent(/Pending/i);

    // Confirmed row's payment badge stays "Paid".
    expect(
      screen.getByTestId(`badge-payment-${CONFIRMED_ID}`)
    ).toHaveTextContent(/Paid/i);
  });
});
