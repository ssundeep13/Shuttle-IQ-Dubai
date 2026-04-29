import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: vi.fn(),
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => {},
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => {
        const { children, ...rest } = props ?? {};
        return <div {...rest}>{children}</div>;
      },
    }
  ),
}));

import MyBookings from '@/pages/marketplace/MyBookings';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { getQueryFn } from '@/lib/queryClient';

const NOW_BOOKING_ID = 'booking-now-1';
const FAR_FUTURE_BOOKING_ID = 'booking-far-future-1';
const ATTENDED_NOW_BOOKING_ID = 'booking-attended-now-1';
const GUEST_NOW_BOOKING_ID = 'booking-guest-now-1';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function makeBookings() {
  // Now-window booking: started 15 min ago (clearly inside the
  // 90m-before → 6h-after window).
  const startedRecently = new Date(Date.now() - 15 * 60 * 1000);
  const endsLater = new Date(Date.now() + 60 * 60 * 1000);

  // Far future booking: starts in 5 days.
  const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  return [
    {
      id: NOW_BOOKING_ID,
      sessionId: 'sess-now',
      status: 'confirmed',
      paymentMethod: 'cash',
      cashPaid: true,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-now',
        title: 'Live Now Session',
        date: isoDate(startedRecently),
        startTime: timeHHMM(startedRecently),
        endTime: timeHHMM(endsLater),
        venueName: 'ISM Sports Services',
      },
      guests: [],
    },
    {
      id: FAR_FUTURE_BOOKING_ID,
      sessionId: 'sess-far',
      status: 'confirmed',
      paymentMethod: 'cash',
      cashPaid: false,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-far',
        title: 'Far Future Session',
        date: isoDate(farFuture),
        startTime: '20:00',
        endTime: '22:00',
        venueName: 'Future Venue',
      },
      guests: [],
    },
    {
      id: ATTENDED_NOW_BOOKING_ID,
      sessionId: 'sess-attended-now',
      status: 'attended',
      paymentMethod: 'cash',
      cashPaid: true,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: false,
      attendedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-attended-now',
        title: 'Already Checked In Session',
        date: isoDate(startedRecently),
        startTime: timeHHMM(startedRecently),
        endTime: timeHHMM(endsLater),
        venueName: 'ISM Sports Services',
      },
      guests: [],
    },
    {
      id: GUEST_NOW_BOOKING_ID,
      sessionId: 'sess-guest-now',
      status: 'confirmed',
      paymentMethod: 'cash',
      cashPaid: false,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: true,
      myGuestId: 'guest-1',
      bookedByName: 'Friend Booker',
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-guest-now',
        title: 'Friend Hosted Session — Live',
        date: isoDate(startedRecently),
        startTime: timeHHMM(startedRecently),
        endTime: timeHHMM(endsLater),
        venueName: 'Friend Venue',
      },
      guests: [],
    },
  ];
}

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/marketplace/bookings/mine')) {
      return new Response(JSON.stringify(makeBookings()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderPage() {
  const memHook = memoryLocation({ path: '/marketplace/my-bookings', record: true });
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
      <Router hook={memHook.hook}>
        <MyBookings />
      </Router>
    </QueryClientProvider>
  );
}

describe('MyBookings — self check-in button visibility', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'me-1', email: 'me@example.com', name: 'Me', linkedPlayerId: 'player-1', photoUrl: null },
    });
    global.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the check-in button for a confirmed booking inside the window', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`button-checkin-${NOW_BOOKING_ID}`)).toBeInTheDocument();
    });

    const btn = screen.getByTestId(`button-checkin-${NOW_BOOKING_ID}`);
    expect(btn).toHaveTextContent(/Check in/i);
  });

  it('does not render the check-in button for a confirmed booking outside the window', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`card-booking-${FAR_FUTURE_BOOKING_ID}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`button-checkin-${FAR_FUTURE_BOOKING_ID}`)).toBeNull();
  });

  it('renders the "Checked in" badge instead of the button when already attended', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`badge-checked-in-${ATTENDED_NOW_BOOKING_ID}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`button-checkin-${ATTENDED_NOW_BOOKING_ID}`)).toBeNull();
  });

  it('does not render the check-in button for a guest booking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`card-booking-${GUEST_NOW_BOOKING_ID}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`button-checkin-${GUEST_NOW_BOOKING_ID}`)).toBeNull();
  });
});
