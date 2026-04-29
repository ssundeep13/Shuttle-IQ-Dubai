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

const UPCOMING_BOOKING_ID = 'booking-upcoming-1';
const PAST_BOOKING_ID = 'booking-past-1';
const GUEST_BOOKING_ID = 'booking-guest-1';
const WAITLISTED_BOOKING_ID = 'booking-waitlisted-1';
const PENDING_PAYMENT_BOOKING_ID = 'booking-pending-payment-1';
const UNLINKED_GUEST_BOOKING_ID = 'booking-unlinked-guest-1';

function futureDateIso(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function pastDateIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function makeBookings() {
  return [
    {
      id: UPCOMING_BOOKING_ID,
      sessionId: 'sess-upcoming',
      status: 'confirmed',
      paymentMethod: 'cash',
      cashPaid: false,
      amountAed: 98,
      spotsBooked: 2,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-upcoming',
        title: 'ISM Sports Services at Greenfield International',
        date: futureDateIso(2),
        startTime: '20:00',
        endTime: '22:00',
        venueName: 'ISM Sports Services',
      },
      guests: [],
    },
    {
      id: PAST_BOOKING_ID,
      sessionId: 'sess-past',
      status: 'attended',
      paymentMethod: 'cash',
      cashPaid: true,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: false,
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-past',
        title: 'GEMS Wellington Academy',
        date: pastDateIso(3),
        startTime: '19:00',
        endTime: '21:00',
        venueName: 'GEMS Wellington',
      },
      guests: [],
    },
    {
      id: GUEST_BOOKING_ID,
      sessionId: 'sess-guest',
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
        id: 'sess-guest',
        title: 'Friend Hosted Session',
        date: futureDateIso(1),
        startTime: '18:00',
        endTime: '20:00',
        venueName: 'Friend Venue',
      },
      guests: [],
    },
    {
      id: WAITLISTED_BOOKING_ID,
      sessionId: 'sess-waitlist',
      status: 'waitlisted',
      paymentMethod: 'cash',
      cashPaid: false,
      amountAed: 0,
      spotsBooked: 1,
      isGuestBooking: false,
      waitlistPosition: 3,
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-waitlist',
        title: 'Full Session — Waitlist',
        date: futureDateIso(2),
        startTime: '19:00',
        endTime: '21:00',
        venueName: 'Some Venue',
      },
      guests: [],
    },
    {
      id: PENDING_PAYMENT_BOOKING_ID,
      sessionId: 'sess-pending',
      status: 'pending_payment',
      paymentMethod: 'ziina',
      cashPaid: false,
      amountAed: 80,
      spotsBooked: 1,
      isGuestBooking: false,
      promotedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-pending',
        title: 'Just-Promoted Session',
        date: futureDateIso(3),
        startTime: '20:00',
        endTime: '22:00',
        venueName: 'Pending Venue',
      },
      guests: [],
    },
    {
      id: UNLINKED_GUEST_BOOKING_ID,
      sessionId: 'sess-unlinked-guest',
      status: 'confirmed',
      paymentMethod: 'cash',
      cashPaid: false,
      amountAed: 50,
      spotsBooked: 1,
      isGuestBooking: true,
      // myGuestId intentionally absent — guest is not linked to this user.
      bookedByName: 'Other Booker',
      createdAt: new Date().toISOString(),
      session: {
        id: 'sess-unlinked-guest',
        title: 'Other-Hosted Session',
        date: futureDateIso(4),
        startTime: '17:00',
        endTime: '19:00',
        venueName: 'Other Venue',
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

describe('MyBookings — cancel button visibility', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'me-1', email: 'me@example.com', name: 'Me', linkedPlayerId: null, photoUrl: null },
    });
    global.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the booker cancel trigger for an upcoming confirmed booking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`button-cancel-${UPCOMING_BOOKING_ID}`)).toBeInTheDocument();
    });

    const cancelBtn = screen.getByTestId(`button-cancel-${UPCOMING_BOOKING_ID}`);
    expect(cancelBtn).toHaveTextContent(/Cancel My Spot/i);
    // Mobile-first: button is full width on small screens, intrinsic on sm+.
    expect(cancelBtn.className).toMatch(/w-full/);
    expect(cancelBtn.className).toMatch(/sm:w-auto/);
    // Destructive treatment so it is visually distinct from the surrounding chips.
    expect(cancelBtn.className).toMatch(/text-destructive/);
  });

  it('renders the linked-guest cancel trigger for an upcoming guest booking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`button-cancel-guest-spot-${GUEST_BOOKING_ID}`)).toBeInTheDocument();
    });

    const guestCancelBtn = screen.getByTestId(`button-cancel-guest-spot-${GUEST_BOOKING_ID}`);
    expect(guestCancelBtn).toHaveTextContent(/Cancel My Spot/i);
    expect(guestCancelBtn.className).toMatch(/w-full/);
    expect(guestCancelBtn.className).toMatch(/sm:w-auto/);
    expect(guestCancelBtn.className).toMatch(/text-destructive/);
  });

  it('renders the "Leave Waitlist" label for a waitlisted booking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`button-cancel-${WAITLISTED_BOOKING_ID}`)).toBeInTheDocument();
    });

    const btn = screen.getByTestId(`button-cancel-${WAITLISTED_BOOKING_ID}`);
    expect(btn).toHaveTextContent(/Leave Waitlist/i);
    expect(btn.className).toMatch(/w-full/);
    expect(btn.className).toMatch(/text-destructive/);
  });

  it('renders the "Decline Spot" label for a pending-payment booking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId(`button-cancel-${PENDING_PAYMENT_BOOKING_ID}`)).toBeInTheDocument();
    });

    const btn = screen.getByTestId(`button-cancel-${PENDING_PAYMENT_BOOKING_ID}`);
    expect(btn).toHaveTextContent(/Decline Spot/i);
    expect(btn.className).toMatch(/w-full/);
    expect(btn.className).toMatch(/text-destructive/);
  });

  it('does not render a cancel trigger for an unlinked guest booking', async () => {
    renderPage();

    // Wait for the unlinked-guest card to mount before asserting the
    // triggers are absent — the user is not the linked guest, so neither
    // the booker cancel nor the linked-guest cancel should appear.
    await waitFor(() => {
      expect(screen.getByTestId(`card-booking-${UNLINKED_GUEST_BOOKING_ID}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`button-cancel-${UNLINKED_GUEST_BOOKING_ID}`)).toBeNull();
    expect(screen.queryByTestId(`button-cancel-guest-spot-${UNLINKED_GUEST_BOOKING_ID}`)).toBeNull();
  });

  it('does not render any cancel trigger for a past booking', async () => {
    renderPage();

    // Wait for the past card to mount before asserting the trigger is absent.
    await waitFor(() => {
      expect(screen.getByTestId(`card-booking-${PAST_BOOKING_ID}`)).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`button-cancel-${PAST_BOOKING_ID}`)).toBeNull();
    expect(screen.queryByTestId(`button-cancel-guest-spot-${PAST_BOOKING_ID}`)).toBeNull();
  });
});
