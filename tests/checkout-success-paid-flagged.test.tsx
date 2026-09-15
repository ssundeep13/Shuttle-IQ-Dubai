// A paying player whose seat could not be attached (a re-book superseded the row and the seat is gone / already
// paid for) is answered `{ confirmed:false, status:'paid_flagged', paid:true }` by POST /bookings/:id/confirm. That
// is terminal: the money is recorded and admin already holds a refund_required flag — the page must say so at once,
// never poll ten times and never show the internal status token.
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/MarketplaceAuthContext', () => ({ useMarketplaceAuth: vi.fn() }));
vi.mock('@/components/InstallAppBar', () => ({ InstallAppBar: () => null }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

import CheckoutSuccess from '@/pages/marketplace/CheckoutSuccess';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const BOOKING_ID = '99999999-aaaa-bbbb-cccc-eeeeeeeeeeee';
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage(initialPath: string) {
  window.history.replaceState({}, '', initialPath);
  const memHook = memoryLocation({ path: initialPath, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={memHook.hook}>
        <CheckoutSuccess />
      </Router>
    </QueryClientProvider>
  );
}

describe('CheckoutSuccess — paid but the seat could not be attached', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
    (useMarketplaceAuth as unknown as Mock).mockReset();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({ isAuthenticated: true, loginWithTokens: vi.fn() });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('stops after the first answer and tells the player their payment was received and is being handled — no status token, no retry loop', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(`/api/marketplace/bookings/${BOOKING_ID}/confirm`)) return jsonResponse({ confirmed: false, status: 'paid_flagged', paid: true });
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as unknown as typeof fetch;

    renderPage(`/marketplace/checkout/success?booking_id=${BOOKING_ID}`);

    await screen.findByTestId('text-paid-review-title');
    expect(screen.getByTestId('text-paid-review-title')).toHaveTextContent(/payment received/i);
    expect(screen.getByTestId('text-paid-review-message')).toHaveTextContent(/could not confirm/i);
    expect(screen.getByTestId('text-paid-review-message')).toHaveTextContent(BOOKING_ID);
    expect(screen.getByTestId('text-paid-review-message')).not.toHaveTextContent(/paid_flagged/);
    expect(screen.queryByTestId('text-error-title')).toBeNull();
    expect(screen.queryByTestId('text-booking-confirmed')).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('button-view-bookings')).toBeInTheDocument();
  });
});
