import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider, type QueryFunction } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

// The 50% referral first-game discount has been removed.
// This suite verifies that the booking panel no longer shows any referral
// discount banners or code-entry sections.

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

const SESSION_ID = 'sess-panel-ref-1';

function makeSession() {
  return {
    id: SESSION_ID,
    title: 'Panel Referral Test Session',
    venueName: 'Test Venue',
    date: '2026-12-31',
    startTime: '19:00',
    endTime: '21:00',
    priceAed: 120,
    spotsRemaining: 8,
    capacity: 16,
    status: 'upcoming',
    description: null,
    level: null,
    bookableSessionId: null,
    isWaitlisted: false,
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

function makeFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

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
    if (url.includes('/api/marketplace/referral-discount-eligibility')) {
      return new Response(
        JSON.stringify({ eligible: false, canApplyCode: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/marketplace/bookings/mine')) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('InlineBookingPanel — referral discount UI removed', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
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

  it('does not show the referral code toggle section when booking panel opens', async () => {
    renderSessionDetails(makeFetch());

    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    await screen.findByTestId('section-booking-panel');

    await waitFor(() => {
      expect(screen.queryByTestId('section-referral-panel')).toBeNull();
    });
  });

  it('does not show the discount-ready banner even for eligible users (discount removed)', async () => {
    renderSessionDetails(makeFetch());

    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    await screen.findByTestId('section-booking-panel');

    await waitFor(() => {
      expect(screen.queryByTestId('banner-referral-ready-panel')).toBeNull();
    });
  });

  it('shows the Book Now button and session price without referral-related UI', async () => {
    renderSessionDetails(makeFetch());

    const priceText = await screen.findByTestId('text-session-price');
    expect(priceText.textContent).toContain('120');

    const bookNowBtn = await screen.findByTestId('button-book-now');
    expect(bookNowBtn).toBeDefined();
  });

  it('opens the booking panel and shows payment method choices without referral sections', async () => {
    renderSessionDetails(makeFetch());

    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    const panel = await screen.findByTestId('section-booking-panel');
    expect(panel).toBeDefined();

    await waitFor(() => {
      expect(screen.queryByTestId('banner-referral-applied-panel')).toBeNull();
      expect(screen.queryByTestId('section-referral-panel')).toBeNull();
    });
  });
});
