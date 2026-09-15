// CheckoutCancel (the Ziina cancel return) abandons the unpaid drop-in exactly once per mount — StrictMode's double
// effect, a re-render or a second mount of the same page must not fire a second request — never for a pack, and
// never without a token. The copy reads the answer: "no charge was made" only when the booking was abandoned.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

vi.mock('@/components/InstallAppBar', () => ({ InstallAppBar: () => null }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
// The scroll-reveal wrapper needs IntersectionObserver, which jsdom lacks — render its children directly.
vi.mock('@/pages/marketplace/LandingComponents', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import CheckoutCancel from '@/pages/marketplace/CheckoutCancel';

const BOOKING_ID = '11111111-2222-3333-4444-555555555555';
function renderPage(path: string) {
  window.history.replaceState({}, '', path);
  const memHook = memoryLocation({ path, record: true });
  return render(
    <StrictMode>
      <Router hook={memHook.hook}>
        <CheckoutCancel />
      </Router>
    </StrictMode>
  );
}
type Call = { method: string; url: string; headers: Record<string, string> };
function mockFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: typeof input === 'string' ? input : input.toString(), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return calls;
}

describe('CheckoutCancel', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = global.fetch; localStorage.clear(); localStorage.setItem('mp_accessToken', 'tok'); });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('a drop-in return → ONE POST to /bookings/:id/abandon with the bearer token, even under StrictMode\'s double effect; "no charge was made"', async () => {
    const calls = mockFetch({ abandoned: true });
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}`);
    await screen.findByTestId('text-checkout-cancelled');
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain(`/api/marketplace/bookings/${BOOKING_ID}/abandon`);
    expect(calls[0].url).not.toContain('/cancel');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    await screen.findByTestId('text-cancel-outcome');
    expect(screen.getByTestId('text-cancel-outcome')).toHaveTextContent(/no charge was made/i);
  });

  it('the server says the booking was PAID after all → the copy says so and never claims "no charge was made"', async () => {
    mockFetch({ abandoned: false, status: 'paid' }, 409);
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}`);
    await waitFor(() => expect(screen.getByTestId('text-cancel-outcome')).toHaveTextContent(/payment went through/i));
    expect(screen.getByTestId('text-cancel-outcome')).not.toHaveTextContent(/no charge was made/i);
  });

  it('the server says the payment is still IN FLIGHT → "may still be processing", nothing cancelled', async () => {
    mockFetch({ abandoned: false, status: 'in_flight' }, 409);
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}`);
    await waitFor(() => expect(screen.getByTestId('text-cancel-outcome')).toHaveTextContent(/still be processing/i));
    expect(screen.getByTestId('text-cancel-outcome')).not.toHaveTextContent(/no charge was made/i);
  });

  it('a confirmed / promoted seat is left alone → "was not cancelled"', async () => {
    mockFetch({ abandoned: false, status: 'confirmed' }, 409);
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}`);
    await waitFor(() => expect(screen.getByTestId('text-cancel-outcome')).toHaveTextContent(/was not cancelled/i));
  });

  it('no token → nothing is sent; a pack return never calls the server', async () => {
    localStorage.clear();
    const calls = mockFetch({ abandoned: true });
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}`);
    await screen.findByTestId('text-checkout-cancelled');
    expect(calls).toHaveLength(0);
    localStorage.setItem('mp_accessToken', 'tok');
    const calls2 = mockFetch({ abandoned: true });
    renderPage(`/marketplace/checkout/cancel?booking_id=${BOOKING_ID}&pack_id=pk-1`);
    await screen.findAllByTestId('text-checkout-cancelled');
    expect(calls2).toHaveLength(0);
  });
});
