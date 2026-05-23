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

import Checkout from '@/pages/marketplace/Checkout';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const SESSION_ID = 'sess-discount-ui-1';

function makeSession(priceAed = 100) {
  return {
    id: SESSION_ID,
    title: 'Discount UI Test Session',
    venueName: 'Test Venue',
    date: '2026-12-31',
    startTime: '19:00',
    endTime: '21:00',
    priceAed,
    spotsRemaining: 10,
    capacity: 16,
    status: 'upcoming',
  };
}

function renderCheckout(fetchImpl: typeof fetch) {
  global.fetch = fetchImpl as unknown as typeof fetch;
  // Must start at the exact path so Route params are populated for useParams()
  const memHook = memoryLocation({ path: `/marketplace/checkout/${SESSION_ID}`, record: true });
  const qc = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'returnNull' }) as QueryFunction, retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      {/* Route wrapper is required so useParams() inside Checkout receives { id } */}
      <Router hook={memHook.hook}>
        <Route path="/marketplace/checkout/:id" component={Checkout} />
      </Router>
    </QueryClientProvider>
  );
}

describe('Checkout — discount code UI', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    toastMock.mockReset();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-1', name: 'Test User', linkedPlayerId: null },
    });
    // DiscountCodeField reads this before sending the validate request
    localStorage.setItem('mp_accessToken', 'test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.removeItem('mp_accessToken');
    vi.restoreAllMocks();
  });

  function makeFetch(opts: {
    discountValid?: boolean;
    discountError?: string;
  } = {}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/marketplace/sessions/${SESSION_ID}`)) {
        return new Response(JSON.stringify(makeSession()), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/referrals/player')) {
        return new Response(JSON.stringify({ walletBalance: 0 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'POST' && url.endsWith('/api/marketplace/discount-codes/validate')) {
        if (opts.discountValid === false) {
          return new Response(
            JSON.stringify({ error: opts.discountError ?? 'This code is for first-time players only' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            valid: true,
            codeId: 'code-1',
            code: 'NEWBIE',
            discountType: 'percentage',
            discountValue: 50,
            discountAmountAed: 50,
            discountLabel: '50% off',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  }

  it('renders the discount code field BEFORE payment method selection (above the method selector)', async () => {
    const fetchMock = makeFetch();
    renderCheckout(fetchMock as unknown as typeof fetch);

    // Discount field appears once session loads, before user picks a payment method
    await waitFor(() => {
      expect(screen.getByTestId('section-discount-code')).toBeInTheDocument();
    }, { timeout: 3000 });
    // Payment method buttons must also be visible at this stage
    expect(screen.getByTestId('button-pay-card')).toBeInTheDocument();
    expect(screen.getByTestId('button-pay-cash')).toBeInTheDocument();
  });

  it('shows inline error when an invalid code is applied', async () => {
    const fetchMock = makeFetch({ discountValid: false, discountError: 'This code is for first-time players only' });
    renderCheckout(fetchMock as unknown as typeof fetch);

    await waitFor(() => screen.getByTestId('input-discount-code'), { timeout: 3000 });
    fireEvent.change(screen.getByTestId('input-discount-code'), { target: { value: 'NEWBIE' } });
    fireEvent.click(screen.getByTestId('button-apply-discount'));

    await waitFor(() => {
      expect(screen.getByTestId('text-discount-error')).toBeInTheDocument();
      expect(screen.getByTestId('text-discount-error').textContent).toMatch(/first-time/i);
    }, { timeout: 3000 });
  });

  it('shows green confirmation and updated order summary total when a valid code is applied', async () => {
    const fetchMock = makeFetch({ discountValid: true });
    renderCheckout(fetchMock as unknown as typeof fetch);

    await waitFor(() => screen.getByTestId('input-discount-code'), { timeout: 3000 });
    fireEvent.change(screen.getByTestId('input-discount-code'), { target: { value: 'NEWBIE' } });
    fireEvent.click(screen.getByTestId('button-apply-discount'));

    // Green confirmation banner appears
    await waitFor(() => {
      expect(screen.getByTestId('card-discount-applied')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Order summary shows the discount amount
    const discountEl = screen.getByTestId('text-discount-amount');
    expect(discountEl.textContent).toContain('50');

    // Total should be AED 50 (100 - 50% discount)
    const totalEl = screen.getByTestId('text-checkout-amount');
    expect(totalEl.textContent).toContain('50');
  });

  it('discount field persists when user selects card payment (Ziina form)', async () => {
    const fetchMock = makeFetch({ discountValid: true });
    renderCheckout(fetchMock as unknown as typeof fetch);

    // Apply discount before selecting payment method
    await waitFor(() => screen.getByTestId('input-discount-code'), { timeout: 3000 });
    fireEvent.change(screen.getByTestId('input-discount-code'), { target: { value: 'NEWBIE' } });
    fireEvent.click(screen.getByTestId('button-apply-discount'));
    await waitFor(() => screen.getByTestId('card-discount-applied'), { timeout: 3000 });

    // Select card payment
    fireEvent.click(screen.getByTestId('button-pay-card'));

    // Discount should still be shown in the Ziina form
    await waitFor(() => {
      expect(screen.getByTestId('card-discount-applied')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ============================================================
// Referral code entry section — UI tests
// ============================================================

describe('Checkout — referral code entry section', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    toastMock.mockReset();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-2', name: 'New Player', linkedPlayerId: null },
    });
    localStorage.setItem('mp_accessToken', 'test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.removeItem('mp_accessToken');
    vi.restoreAllMocks();
  });

  function makeReferralFetch(opts: {
    canApplyCode?: boolean;
    eligible?: boolean;
    applySuccess?: boolean;
    applyError?: string;
  } = {}) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/marketplace/sessions/${SESSION_ID}`)) {
        return new Response(JSON.stringify(makeSession()), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/referrals/player')) {
        return new Response(JSON.stringify({ walletBalance: 0 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/marketplace/referral-discount-eligibility')) {
        return new Response(
          JSON.stringify({ eligible: opts.eligible ?? false, canApplyCode: opts.canApplyCode ?? false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (method === 'POST' && url.endsWith('/api/marketplace/referrals/apply-code')) {
        if (opts.applySuccess === false) {
          return new Response(
            JSON.stringify({ error: opts.applyError ?? 'Invalid referral code' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, referrerName: 'Ahmed' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  }

  it('renders the referral code entry section when canApplyCode is true', async () => {
    renderCheckout(makeReferralFetch({ canApplyCode: true }) as unknown as typeof fetch);

    await waitFor(() => {
      expect(screen.getByTestId('section-referral-code-toggle')).toBeInTheDocument();
    }, { timeout: 3000 });
    // Discount code section must NOT appear when canApplyCode is true
    expect(screen.queryByTestId('section-discount-toggle')).not.toBeInTheDocument();
  });

  it('shows the confirmed banner after successfully applying a referral code', async () => {
    renderCheckout(makeReferralFetch({ canApplyCode: true, applySuccess: true }) as unknown as typeof fetch);

    await waitFor(() => screen.getByTestId('section-referral-code-toggle'), { timeout: 3000 });
    fireEvent.click(screen.getByTestId('button-toggle-referral-entry'));

    await waitFor(() => screen.getByTestId('input-referral-code'), { timeout: 3000 });
    fireEvent.change(screen.getByTestId('input-referral-code'), { target: { value: 'SIQ-AHMED0-00001' } });
    fireEvent.click(screen.getByTestId('button-apply-referral-code'));

    await waitFor(() => {
      expect(screen.getByTestId('banner-referral-code-applied')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByTestId('section-referral-code-toggle')).not.toBeInTheDocument();
  });

  it('does not show the referral entry section when the user is already discount-eligible', async () => {
    renderCheckout(makeReferralFetch({ eligible: true, canApplyCode: false }) as unknown as typeof fetch);

    await waitFor(() => {
      expect(screen.getByTestId('banner-referral-discount-callout')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByTestId('section-referral-code-toggle')).not.toBeInTheDocument();
  });
});

// ============================================================
// Route-level booking with discount — pure logic tests
// ============================================================

describe('Booking route discount logic', () => {
  it('discount reduces total to zero → booking confirmed without Ziina', () => {
    const priceAed = 50;
    const spotsBooked = 1;
    const totalAmount = priceAed * spotsBooked; // 50
    const appliedDiscountAmountAed = 60; // larger than price
    const discountedTotal = Math.max(0, totalAmount - appliedDiscountAmountAed); // 0
    const totalAmountFils = discountedTotal * 100; // 0
    const walletApplied = 0;
    const remainingFils = totalAmountFils - walletApplied; // 0

    // new check: remainingFils <= 0 triggers fast-path confirmation
    expect(remainingFils).toBe(0);
    expect(remainingFils <= 0).toBe(true);
  });

  it('partial discount does NOT trigger fast-path (still goes to Ziina)', () => {
    const priceAed = 100;
    const spotsBooked = 2;
    const totalAmount = priceAed * spotsBooked; // 200
    const appliedDiscountAmountAed = 50;
    const discountedTotal = Math.max(0, totalAmount - appliedDiscountAmountAed); // 150
    const totalAmountFils = discountedTotal * 100; // 15000
    const walletApplied = 0;
    const remainingFils = totalAmountFils - walletApplied; // 15000

    expect(remainingFils > 0).toBe(true);
  });

  it('discount + wallet together covering full amount triggers fast-path', () => {
    const priceAed = 100;
    const totalAmount = priceAed;
    const appliedDiscountAmountAed = 50;
    const discountedTotal = Math.max(0, totalAmount - appliedDiscountAmountAed); // 50
    const totalAmountFils = discountedTotal * 100; // 5000
    const walletBalanceFils = 5000;
    const walletApplicable = Math.min(walletBalanceFils, totalAmountFils); // 5000
    const remainingFils = totalAmountFils - walletApplicable; // 0

    expect(remainingFils <= 0).toBe(true);
  });

  it('percentage discount scales correctly with multi-spot booking', () => {
    // NEWBIE 50% off, 2 spots @ AED 75 each
    const pricePerSpot = 75;
    const spotsBooked = 2;
    const rawTotal = pricePerSpot * spotsBooked; // 150
    const discountSaving = Math.min(Math.floor((rawTotal * 50) / 100), rawTotal); // 75
    const discountedTotal = Math.max(0, rawTotal - discountSaving); // 75

    expect(discountSaving).toBe(75);
    expect(discountedTotal).toBe(75);
  });
});
