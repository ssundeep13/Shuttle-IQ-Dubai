import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider, type QueryFunction } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: vi.fn(),
}));

import SessionDetails from '@/pages/marketplace/SessionDetails';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const SESSION_ID = 'sess-wallet-test-1';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Wallet Test Session',
    venueName: 'Test Venue',
    date: '2026-12-31',
    startTime: '19:00',
    endTime: '21:00',
    priceAed: 49,
    spotsRemaining: 8,
    capacity: 16,
    status: 'upcoming',
    description: null,
    level: null,
    bookableSessionId: null,
    isWaitlisted: false,
    ...overrides,
  };
}

function renderSessionDetails(fetchImpl: typeof fetch) {
  global.fetch = fetchImpl as unknown as typeof fetch;
  const memHook = memoryLocation({ path: `/marketplace/sessions/${SESSION_ID}`, record: true });
  const qc = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'returnNull' }) as QueryFunction, retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={memHook.hook}>
        <Route path="/marketplace/sessions/:id" component={SessionDetails} />
      </Router>
    </QueryClientProvider>
  );
}

function makeFetch({
  walletBalance = 1500,
  bookingResponse = null as Record<string, unknown> | null,
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes(`/api/marketplace/sessions/${SESSION_ID}/players`)) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/marketplace/sessions/${SESSION_ID}`)) {
      return new Response(JSON.stringify(makeSession()), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/marketplace/me/wallet')) {
      return new Response(JSON.stringify({ walletBalance }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/marketplace/bookings/mine')) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/marketplace/bookings') && method === 'POST') {
      const body = bookingResponse ?? { redirectUrl: 'https://pay.ziina.com/test' };
      return new Response(JSON.stringify(body), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('InlineBookingPanel — wallet credit', () => {
  let originalFetch: typeof fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalLocation = window.location;
    toastMock.mockReset();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-1', name: 'Test User', linkedPlayerId: null },
    });
    localStorage.setItem('mp_accessToken', 'test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.removeItem('mp_accessToken');
    vi.restoreAllMocks();
  });

  async function openPanel() {
    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);
    await screen.findByTestId('section-booking-panel');
  }

  it('shows wallet credit card when balance > 0', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 1500 }));
    await openPanel();
    await waitFor(() => {
      expect(screen.getByTestId('card-wallet-credit')).toBeDefined();
    });
    expect(screen.getByTestId('switch-use-wallet')).toBeDefined();
  });

  it('does not show wallet card when balance is zero', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 0 }));
    await openPanel();
    await waitFor(() => {
      expect(screen.queryByTestId('card-wallet-credit')).toBeNull();
    });
  });

  it('shows breakdown when wallet toggle is switched on (partial cover)', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 1500 }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('text-wallet-deduction')).toBeDefined();
      expect(screen.getByTestId('text-remaining-amount')).toBeDefined();
    });

    const deductionEl = screen.getByTestId('text-wallet-deduction');
    expect(deductionEl.textContent).toContain('15.00');

    const remainingEl = screen.getByTestId('text-remaining-amount');
    expect(remainingEl.textContent).toContain('34.00');
  });

  it('shows "Book with Wallet Credit" button when wallet covers full amount', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 10000 }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('button-book-wallet')).toBeDefined();
    });
    expect(screen.queryByTestId('button-pay-cash')).toBeNull();
    expect(screen.queryByTestId('button-pay-card')).toBeNull();
  });

  it('hides "Book with Wallet Credit" button when wallet does not cover full amount', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 1500 }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByTestId('button-book-wallet')).toBeNull();
      expect(screen.getByTestId('button-pay-cash')).toBeDefined();
      expect(screen.getByTestId('button-pay-card')).toBeDefined();
    });
  });

  it('sends applyWallet:true in POST body when wallet covers all and user books', async () => {
    const fetchMock = makeFetch({
      walletBalance: 10000,
      bookingResponse: { paymentMethod: 'wallet', bookingId: 'bk-1', spotsBooked: 1 },
    });
    renderSessionDetails(fetchMock);
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    const bookBtn = await screen.findByTestId('button-book-wallet');
    fireEvent.click(bookBtn);

    await waitFor(() => {
      const postCall = (fetchMock as Mock).mock.calls.find(
        ([url, init]: [string, RequestInit]) =>
          url.includes('/api/marketplace/bookings') &&
          (init?.method ?? '').toUpperCase() === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body as string);
      expect(body.applyWallet).toBe(true);
    });
  });

  it('shows confirmed state when server returns paymentMethod:wallet', async () => {
    renderSessionDetails(makeFetch({
      walletBalance: 10000,
      bookingResponse: { paymentMethod: 'wallet', bookingId: 'bk-2', spotsBooked: 1 },
    }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    const bookBtn = await screen.findByTestId('button-book-wallet');
    fireEvent.click(bookBtn);

    await waitFor(() => {
      expect(screen.getByTestId('section-cash-confirmed')).toBeDefined();
      expect(screen.getByTestId('text-cash-confirmed').textContent).toContain('Booking Confirmed');
    });

    const confirmText = screen.getByTestId('section-cash-confirmed').textContent;
    expect(confirmText).toContain('wallet credit');
  });

  it('shows "Pay by card instead" escape-hatch when wallet covers full amount', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 10000 }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('link-pay-by-card-instead')).toBeDefined();
    });
  });

  it('"Pay by card instead" escape-hatch toggles wallet off and restores payment cards', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 10000 }));
    await openPanel();

    const toggle = await screen.findByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    const escapeLink = await screen.findByTestId('link-pay-by-card-instead');
    fireEvent.click(escapeLink);

    await waitFor(() => {
      expect(screen.queryByTestId('button-book-wallet')).toBeNull();
      expect(screen.getByTestId('button-pay-cash')).toBeDefined();
      expect(screen.getByTestId('button-pay-card')).toBeDefined();
    });
  });

  it('live total shows remaining amount when wallet toggle is on (partial)', async () => {
    renderSessionDetails(makeFetch({ walletBalance: 1500 }));
    await openPanel();

    const totalEl = await screen.findByTestId('text-inline-total');
    expect(totalEl.textContent).toContain('49');

    const toggle = screen.getByTestId('switch-use-wallet');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByTestId('text-inline-total').textContent).toContain('34.00');
    });
  });
});
