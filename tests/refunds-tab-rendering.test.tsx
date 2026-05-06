import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider, type QueryFunction } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RefundNotificationWithDetails } from '@shared/schema';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => {},
}));

vi.mock('@/components/FinanceTab', () => ({ default: () => null }));
vi.mock('@/components/SessionSetupWizard', () => ({ SessionSetupWizard: () => null }));
vi.mock('@/components/PlayerImport', () => ({ PlayerImport: () => null }));
vi.mock('@/components/GameHistoryExport', () => ({ GameHistoryExport: () => null }));
vi.mock('@/components/Leaderboard', () => ({ Leaderboard: () => null }));
vi.mock('@/components/EditPlayerModal', () => ({ EditPlayerModal: () => null }));
vi.mock('@/components/EditSessionModal', () => ({ EditSessionModal: () => null }));

import SessionsManagement from '@/pages/SessionsManagement';
import { useAuth } from '@/contexts/AuthContext';
import { getQueryFn } from '@/lib/queryClient';

const ZIINA_REFUND: RefundNotificationWithDetails = {
  id: 'refund-z-1',
  message: 'Event "Friday Night" cancelled. Full refund of AED 50.00 owed via Ziina dashboard (intent pi_test_xyz).',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  read: false,
  relatedBookingId: 'booking-ziina-1',
  amountAed: 50,
  spotsBooked: 1,
  paymentMethod: 'ziina',
  ziinaPaymentIntentId: 'pi_test_xyz',
  bookingSessionId: 'sess-1',
  playerName: 'Alice Z',
  playerEmail: 'alice@example.com',
  sessionTitle: 'Friday Night',
  sessionDate: new Date('2026-05-08T19:00:00Z'),
  sessionVenueName: 'Skill Court Dubai',
};

const CASH_REFUND: RefundNotificationWithDetails = {
  id: 'refund-c-1',
  message: 'Event "Friday Night" cancelled. Cash refund of AED 30.00 owed in person.',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  read: false,
  relatedBookingId: 'booking-cash-1',
  amountAed: 30,
  spotsBooked: 1,
  paymentMethod: 'cash',
  ziinaPaymentIntentId: null,
  bookingSessionId: 'sess-1',
  playerName: 'Bob C',
  playerEmail: 'bob@example.com',
  sessionTitle: 'Friday Night',
  sessionDate: new Date('2026-05-08T19:00:00Z'),
  sessionVenueName: 'Skill Court Dubai',
};

function makeFetch(refunds: RefundNotificationWithDetails[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/marketplace/admin/refunds') && method === 'GET') {
      return new Response(JSON.stringify(refunds), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderPage(fetchImpl: typeof fetch) {
  global.fetch = fetchImpl as unknown as typeof fetch;
  const memHook = memoryLocation({ path: '/admin/sessions', record: true });
  const qc = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: 'throw' }) as QueryFunction, retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Router hook={memHook.hook}>
          <SessionsManagement />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('RefundsTabContent — event-cancellation refund rows', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    toastMock.mockReset();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the Ziina payment intent ID and a deep link to Ziina for ziina-paid refunds', async () => {
    renderPage(makeFetch([ZIINA_REFUND]) as unknown as typeof fetch);

    // Switch to Refunds tab — Radix Tabs requires pointer events, not just click.
    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await userEvent.setup().click(tabBtn);

    await waitFor(() => {
      expect(screen.getByTestId(`refund-row-${ZIINA_REFUND.id}`)).toBeInTheDocument();
    });

    // Method label distinguishes Ziina rows clearly.
    expect(screen.getByTestId(`badge-method-ziina-${ZIINA_REFUND.id}`)).toBeInTheDocument();

    // Payment intent is visible and copyable.
    const intentEl = screen.getByTestId(`text-refund-intent-${ZIINA_REFUND.id}`);
    expect(intentEl.textContent).toBe('pi_test_xyz');
    expect(screen.getByTestId(`button-copy-intent-${ZIINA_REFUND.id}`)).toBeInTheDocument();

    // Deep-links to the specific intent in the Ziina dashboard, not the bare app root.
    const dashLink = screen.getByTestId(`button-ziina-dashboard-${ZIINA_REFUND.id}`);
    const href = dashLink.getAttribute('href') ?? dashLink.querySelector('a')?.getAttribute('href');
    expect(href).toBe('https://app.ziina.com/payment_intent/pi_test_xyz');

    // The cancellation message context (refund amount + method) is shown.
    expect(screen.getByTestId(`text-refund-message-${ZIINA_REFUND.id}`).textContent).toMatch(/Full refund of AED 50\.00/);
  });

  it('marks cash refunds with a "Cash refund owed" badge and in-person settlement guidance, no Ziina CTA', async () => {
    renderPage(makeFetch([CASH_REFUND]) as unknown as typeof fetch);

    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await userEvent.setup().click(tabBtn);

    await waitFor(() => {
      expect(screen.getByTestId(`refund-row-${CASH_REFUND.id}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId(`badge-method-cash-${CASH_REFUND.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`text-cash-instructions-${CASH_REFUND.id}`).textContent).toMatch(/Settle in person/);
    expect(screen.queryByTestId(`button-ziina-dashboard-${CASH_REFUND.id}`)).toBeNull();
    expect(screen.queryByTestId(`text-refund-intent-${CASH_REFUND.id}`)).toBeNull();
  });
});
