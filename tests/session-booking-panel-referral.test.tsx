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

function makeFetch(opts: {
  eligible?: boolean;
  canApplyCode?: boolean;
  applySuccess?: boolean;
  applyError?: string;
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
    if (url.includes('/api/marketplace/referral-discount-eligibility')) {
      return new Response(
        JSON.stringify({ eligible: opts.eligible ?? false, canApplyCode: opts.canApplyCode ?? false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'POST' && url.includes('/api/marketplace/referrals/apply-code')) {
      if (opts.applyError) {
        return new Response(JSON.stringify({ error: opts.applyError }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, referrerName: 'Ahmed' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/marketplace/bookings/mine')) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('InlineBookingPanel — referral code entry', () => {
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

  it('shows referral code toggle section in the booking panel when canApplyCode is true', async () => {
    renderSessionDetails(makeFetch({ canApplyCode: true }));

    // Open the booking panel
    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    // The booking panel should open
    await screen.findByTestId('section-booking-panel');

    // The referral toggle section should be visible
    const referralSection = await screen.findByTestId('section-referral-panel');
    expect(referralSection).toBeDefined();

    const toggleBtn = screen.getByTestId('button-toggle-referral-panel');
    expect(toggleBtn.textContent).toContain('Have a referral code');
  });

  it('shows success banner with referrer name after a successful code apply', async () => {
    renderSessionDetails(makeFetch({ canApplyCode: true, applySuccess: true }));

    // Open the booking panel
    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    await screen.findByTestId('section-booking-panel');

    // Expand the referral entry form
    const toggleBtn = await screen.findByTestId('button-toggle-referral-panel');
    fireEvent.click(toggleBtn);

    // Type a referral code
    const input = await screen.findByTestId('input-referral-code-panel');
    fireEvent.change(input, { target: { value: 'SIQ-AHMED0-00001' } });

    // Click Apply
    const applyBtn = screen.getByTestId('button-apply-referral-code-panel');
    fireEvent.click(applyBtn);

    // Success banner should show with referrer name
    const appliedBanner = await screen.findByTestId('banner-referral-applied-panel');
    expect(appliedBanner.textContent).toContain('Ahmed');
    expect(appliedBanner.textContent).toContain('50% off when paying by card');
  });

  it('shows error message when an invalid referral code is submitted', async () => {
    renderSessionDetails(makeFetch({ canApplyCode: true, applyError: 'Invalid referral code' }));

    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    await screen.findByTestId('section-booking-panel');

    const toggleBtn = await screen.findByTestId('button-toggle-referral-panel');
    fireEvent.click(toggleBtn);

    const input = await screen.findByTestId('input-referral-code-panel');
    fireEvent.change(input, { target: { value: 'BAD-CODE' } });

    const applyBtn = screen.getByTestId('button-apply-referral-code-panel');
    fireEvent.click(applyBtn);

    const errorMsg = await screen.findByTestId('text-referral-error-panel');
    expect(errorMsg.textContent).toContain('Invalid referral code');
  });

  it('shows the discount-ready banner when the user already has a referral (eligible=true)', async () => {
    renderSessionDetails(makeFetch({ eligible: true }));

    const bookNowBtn = await screen.findByTestId('button-book-now');
    fireEvent.click(bookNowBtn);

    await screen.findByTestId('section-booking-panel');

    const banner = await screen.findByTestId('banner-referral-ready-panel');
    expect(banner.textContent).toContain('referral welcome discount is ready');
  });
});
