import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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

const BOOKING_ID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(initialPath: string) {
  // CheckoutSuccess reads `window.location.search` directly, so we set it via
  // jsdom's history API before rendering. Wouter's memoryLocation drives all
  // post-mount navigation (the auto-redirect).
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

describe('CheckoutSuccess — waitlisted / error / extra-guest branches', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
    sessionStorage.clear();
    (useMarketplaceAuth as unknown as Mock).mockReset();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: false,
      loginWithTokens: vi.fn(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the waitlisted card with no auto-redirect when the confirm endpoint reports waitlisted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) {
        return jsonResponse({
          confirmed: false,
          waitlisted: true,
          status: 'session_full',
          booking: {
            id: BOOKING_ID,
            sessionId: 'sess-waitlisted',
            amountAed: 50,
            walletAmountUsed: 0,
            paymentMethod: 'ziina',
            spotsBooked: 1,
            session: { id: 'sess-waitlisted', title: 'Waitlist Test Session' },
          },
        });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as unknown as typeof fetch;

    const { memHook } = renderPage(
      `/marketplace/checkout/success?booking_id=${BOOKING_ID}`
    );

    // Waitlisted card should appear after the first poll resolves.
    await screen.findByTestId('text-waitlisted-title');
    expect(screen.getByTestId('text-waitlisted-title')).toHaveTextContent('Added to Waitlist');
    expect(screen.getByTestId('text-waitlisted-message')).toHaveTextContent(
      /added to the waitlist/i
    );

    // Success / error titles must NOT render in the waitlisted branch.
    expect(screen.queryByTestId('text-booking-confirmed')).toBeNull();
    expect(screen.queryByTestId('text-error-title')).toBeNull();

    // The auto-redirect countdown text must NOT render for waitlisted.
    expect(screen.queryByText(/Redirecting to your bookings in/i)).toBeNull();

    // CTA falls back to "View My Bookings" + "Browse Sessions" for the
    // non-success / non-sign-in-notice path.
    expect(screen.getByTestId('button-view-bookings')).toBeInTheDocument();
    expect(screen.getByTestId('button-browse-sessions')).toBeInTheDocument();

    // Strong assertion: advance well past the 3s redirect window and verify
    // wouter never received a navigation push to /marketplace/my-bookings.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(memHook.history.some((p) => p.startsWith('/marketplace/my-bookings'))).toBe(false);

    vi.useRealTimers();
  });

  it('renders the error card instantly when booking_id is missing from the URL', async () => {
    // No fetch should ever be made on this path, but stub it to surface any
    // accidental request as a clear failure.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch in missing-booking_id test: ${input}`);
    }) as unknown as typeof fetch;

    renderPage('/marketplace/checkout/success');

    await screen.findByTestId('text-error-title');
    expect(screen.getByTestId('text-error-title')).toHaveTextContent('Something went wrong');
    expect(screen.getByTestId('text-error-message')).toHaveTextContent(
      'Missing booking information'
    );

    // The success / waitlisted titles must NOT render in this branch.
    expect(screen.queryByTestId('text-booking-confirmed')).toBeNull();
    expect(screen.queryByTestId('text-waitlisted-title')).toBeNull();

    // CTA section still renders once status !== 'verifying'.
    expect(screen.getByTestId('button-view-bookings')).toBeInTheDocument();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders the error card with the Ziina status when the confirm endpoint repeatedly reports a non-success status', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) {
        return jsonResponse({ confirmed: false, status: 'failed' });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as unknown as typeof fetch;

    const { memHook } = renderPage(
      `/marketplace/checkout/success?booking_id=${BOOKING_ID}`
    );

    // 10 attempts × 3s delay = ~27s. Advance generously so all retries fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('text-error-title')).toBeInTheDocument();
    });

    expect(screen.getByTestId('text-error-message')).toHaveTextContent(
      /Payment status: failed/i
    );
    expect(screen.getByTestId('text-error-message')).toHaveTextContent(
      /Please contact support if you were charged/i
    );

    // Auto-redirect MUST NOT fire from the error branch.
    expect(memHook.history.some((p) => p.startsWith('/marketplace/my-bookings'))).toBe(false);

    // Confirm we actually hit the retry loop (>1 attempt before surfacing).
    expect((global.fetch as unknown as Mock).mock.calls.length).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });

  it('renders the error card with the network-failure copy when every confirm request throws', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) {
        throw new TypeError('NetworkError when attempting to fetch resource.');
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as unknown as typeof fetch;

    renderPage(`/marketplace/checkout/success?booking_id=${BOOKING_ID}`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('text-error-title')).toBeInTheDocument();
    });

    expect(screen.getByTestId('text-error-message')).toHaveTextContent(
      /Failed to verify payment/i
    );

    vi.useRealTimers();
  });

  it('renders the extra-guest variant ("Guest Added!" + extra-spot copy) when extra_guest=1 is set', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) {
        return jsonResponse({
          confirmed: true,
          booking: {
            id: BOOKING_ID,
            sessionId: 'sess-eg',
            amountAed: 50,
            walletAmountUsed: 0,
            paymentMethod: 'ziina',
            spotsBooked: 2,
            session: { id: 'sess-eg', title: 'Extra Guest Test Session' },
          },
        });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as unknown as typeof fetch;

    renderPage(
      `/marketplace/checkout/success?booking_id=${BOOKING_ID}&extra_guest=1`
    );

    // Title uses the existing "text-booking-confirmed" testid but reads
    // "Guest Added!" instead of "Booking Confirmed!" when extra_guest=1.
    await screen.findByTestId('text-booking-confirmed');
    expect(screen.getByTestId('text-booking-confirmed')).toHaveTextContent('Guest Added!');
    expect(screen.getByTestId('text-booking-confirmed')).not.toHaveTextContent('Booking Confirmed!');

    // Body copy switches to the extra-spot phrasing and includes the session title.
    expect(screen.getByTestId('text-success-message')).toHaveTextContent(
      /extra spot has been confirmed/i
    );
    expect(screen.getByTestId('text-success-message')).toHaveTextContent(
      'Extra Guest Test Session'
    );

    // The redirect countdown still renders for the extra-guest success branch.
    expect(screen.getByText(/Redirecting to your bookings in/i)).toBeInTheDocument();

    // The "View My Bookings" CTA is present (no sign-in notice in this branch).
    expect(screen.getByTestId('button-view-bookings')).toBeInTheDocument();
    expect(screen.queryByTestId('notice-signin-required')).toBeNull();

    vi.useRealTimers();
  });
});
