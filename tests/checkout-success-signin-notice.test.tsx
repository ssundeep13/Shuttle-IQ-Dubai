import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: vi.fn(),
}));

vi.mock('@/components/InstallAppBar', () => ({
  InstallAppBar: () => null,
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => {},
}));

import CheckoutSuccess from '@/pages/marketplace/CheckoutSuccess';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const BOOKING_ID = '11111111-2222-3333-4444-555555555555';

function makeFetchMock(opts: { resumeStatus?: number; resumeBody?: any }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/marketplace/auth/resume')) {
      const status = opts.resumeStatus ?? 401;
      return new Response(JSON.stringify(opts.resumeBody ?? { error: 'Invalid resume token' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) {
      return new Response(
        JSON.stringify({
          confirmed: true,
          booking: {
            id: BOOKING_ID,
            sessionId: 'sess-1',
            amountAed: 50,
            walletAmountUsed: 0,
            paymentMethod: 'ziina',
            session: { id: 'sess-1', title: 'Test Session' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  });
}

function renderPage(initialPath: string) {
  // CheckoutSuccess reads `window.location.search` directly, so we set it via
  // jsdom's history API before rendering. Wouter's memoryLocation drives all
  // post-mount navigation (the auto-redirect and the Link click).
  window.history.replaceState({}, '', initialPath);
  const memHook = memoryLocation({ path: initialPath, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const utils = render(
    <QueryClientProvider client={qc}>
      <Router hook={memHook.hook}>
        <CheckoutSuccess />
      </Router>
    </QueryClientProvider>
  );

  return { ...utils, memHook };
}

describe('CheckoutSuccess — post-payment sign-in notice flow', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
    sessionStorage.clear();
    (useMarketplaceAuth as unknown as Mock).mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the sign-in notice when /auth/resume fails and the user has no session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: false,
      loginWithTokens: vi.fn(),
    });
    global.fetch = makeFetchMock({ resumeStatus: 401 }) as unknown as typeof fetch;

    const { memHook } = renderPage(
      `/marketplace/checkout/success?booking_id=${BOOKING_ID}&resume=clearly-invalid-token-xyz`
    );

    // Wait for the success card + the sessionLost notice to render.
    await screen.findByTestId('text-booking-confirmed');
    await screen.findByTestId('notice-signin-required');
    await screen.findByTestId('button-signin-required');

    // Notice copy
    expect(screen.getByTestId('notice-signin-required')).toHaveTextContent(
      'Please sign in again to view your bookings'
    );

    // CTA swap: "View My Bookings" should be hidden when the notice is shown.
    expect(screen.queryByTestId('button-view-bookings')).toBeNull();

    // Auto-redirect countdown text must NOT render in this branch.
    expect(screen.queryByText(/Redirecting to your bookings in/i)).toBeNull();

    // Strong assertion: advance well past the 3s redirect window and verify
    // that wouter never received a navigation push to /marketplace/my-bookings.
    // Only the initial mount entry should be in the recorded history.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(memHook.history.some((p) => p.startsWith('/marketplace/my-bookings'))).toBe(false);

    // The Sign In Link wraps a Button. wouter renders <Link href="..."> as an
    // <a href="..."> we can inspect.
    const signInLink = screen.getByTestId('button-signin-required').closest('a');
    expect(signInLink).not.toBeNull();
    expect(signInLink!.getAttribute('href')).toBe(
      '/marketplace/login?from=%2Fmarketplace%2Fmy-bookings'
    );

    // Click the Sign In button — wouter routes via the memory hook.
    await act(async () => {
      fireEvent.click(screen.getByTestId('button-signin-required'));
    });

    // memoryLocation with record:true captures every pushed path in `history`.
    await waitFor(() => {
      const last = memHook.history[memHook.history.length - 1];
      expect(last).toBe('/marketplace/login?from=%2Fmarketplace%2Fmy-bookings');
    });

    vi.useRealTimers();
  });

  it('still auto-redirects to /marketplace/my-bookings on the happy path (no resume token)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: false,
      loginWithTokens: vi.fn(),
    });
    global.fetch = makeFetchMock({}) as unknown as typeof fetch;

    const { memHook } = renderPage(`/marketplace/checkout/success?booking_id=${BOOKING_ID}`);

    // Success card renders.
    await screen.findByTestId('text-booking-confirmed');

    // The "View My Bookings" CTA is present (no notice in this branch).
    expect(screen.getByTestId('button-view-bookings')).toBeInTheDocument();
    expect(screen.queryByTestId('notice-signin-required')).toBeNull();

    // Countdown text is present and starts at 3.
    expect(screen.getByText(/Redirecting to your bookings in 3s/)).toBeInTheDocument();

    // Advance 4 seconds of fake interval ticks. The interval inside the page
    // decrements once per second and calls setLocation('/marketplace/my-bookings')
    // when the count reaches 0. Wrap the advancement in act() so React can
    // flush the resulting state updates without warnings.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    await waitFor(() => {
      const last = memHook.history[memHook.history.length - 1];
      expect(last).toBe('/marketplace/my-bookings');
    });

    vi.useRealTimers();
  });
});
