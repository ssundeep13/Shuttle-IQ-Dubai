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
  refundStatus: null,
  refundedAt: null,
  refundedAmount: null,
  ziinaRefundId: null,
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
  refundStatus: null,
  refundedAt: null,
  refundedAmount: null,
  ziinaRefundId: null,
};

function makeFetch(
  refunds: RefundNotificationWithDetails[],
  opts?: { processResponse?: { status: number; body: unknown }; onProcess?: (id: string) => void },
) {
  let currentRefunds = refunds.slice();
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/marketplace/admin/refunds') && method === 'GET') {
      return new Response(JSON.stringify(currentRefunds), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const procMatch = url.match(/\/api\/marketplace\/admin\/refunds\/([^/]+)\/process$/);
    if (procMatch && method === 'POST') {
      opts?.onProcess?.(procMatch[1]);
      const r = opts?.processResponse ?? { status: 200, body: { success: true, refundId: 're_test_123', refundedAmount: 5000 } };
      // On success, simulate the row flipping to refunded so a refetch reflects it.
      if (r.status === 200) {
        currentRefunds = currentRefunds.map((row) =>
          row.id === procMatch[1]
            ? { ...row, read: true, refundStatus: 'completed', refundedAt: new Date('2026-05-07T12:00:00Z'), refundedAmount: 5000, ziinaRefundId: 're_test_123' }
            : row,
        );
      }
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
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

    // Order number is rendered alongside the Ziina intent so the admin can
    // quote it back to the player when processing in Ziina.
    const orderEl = screen.getByTestId(`text-refund-order-${ZIINA_REFUND.id}`);
    expect(orderEl.textContent).toBe(`#${ZIINA_REFUND.relatedBookingId}`);
    expect(screen.getByTestId(`button-copy-order-${ZIINA_REFUND.id}`)).toBeInTheDocument();
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

    // Order number stays visible on cash rows so admins can reference it
    // when settling in person.
    const orderEl = screen.getByTestId(`text-refund-order-${CASH_REFUND.id}`);
    expect(orderEl.textContent).toBe(`#${CASH_REFUND.relatedBookingId}`);
    expect(screen.getByTestId(`button-copy-order-${CASH_REFUND.id}`)).toBeInTheDocument();
  });

  it('renders the "Refund via Ziina" button only on unresolved Ziina rows; cash rows never show it', async () => {
    renderPage(makeFetch([ZIINA_REFUND, CASH_REFUND]) as unknown as typeof fetch);
    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await userEvent.setup().click(tabBtn);

    await waitFor(() => {
      expect(screen.getByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`)).toBeInTheDocument();
    });
    // Cash rows must never offer an in-app Ziina refund button — they're
    // settled in person.
    expect(screen.queryByTestId(`button-refund-ziina-${CASH_REFUND.id}`)).toBeNull();

    // Button label includes the AED amount so the admin can confirm at a glance.
    const btn = screen.getByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`);
    expect(btn.textContent).toMatch(/Refund AED 50\.00 via Ziina/);
  });

  it('confirms, calls Ziina, and flips the row to "Refunded" with success toast on the happy path', async () => {
    const procIds: string[] = [];
    const fetchImpl = makeFetch([ZIINA_REFUND], { onProcess: (id) => procIds.push(id) });
    renderPage(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();

    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await user.click(tabBtn);

    const btn = await waitFor(() => screen.getByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`));
    await user.click(btn);

    // Confirm dialog opens with player + amount + intent.
    expect(await screen.findByTestId('dialog-confirm-refund')).toBeInTheDocument();
    expect(screen.getByTestId('text-confirm-player').textContent).toBe('Alice Z');
    expect(screen.getByTestId('text-confirm-amount').textContent).toBe('AED 50.00');
    expect(screen.getByTestId('text-confirm-intent').textContent).toBe('pi_test_xyz');

    await user.click(screen.getByTestId('button-confirm-refund'));

    await waitFor(() => {
      expect(procIds).toEqual([ZIINA_REFUND.id]);
    });
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Refund issued' }));
    });
    // After the refetch, the row carries a "Refunded" badge and the action
    // button is gone (button is hidden when refundStatus indicates refunded).
    await waitFor(() => {
      expect(screen.getByTestId(`badge-refunded-${ZIINA_REFUND.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`)).toBeNull();
    });
  });

  it('keeps the row pending and surfaces the Ziina error when the refund call fails', async () => {
    const fetchImpl = makeFetch([ZIINA_REFUND], {
      processResponse: { status: 502, body: { error: 'Ziina insufficient balance' } },
    });
    renderPage(fetchImpl as unknown as typeof fetch);
    const user = userEvent.setup();

    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await user.click(tabBtn);

    await user.click(await waitFor(() => screen.getByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`)));
    await user.click(await screen.findByTestId('button-confirm-refund'));

    await waitFor(() => {
      // The Ziina error message must be surfaced verbatim — admins need to know
      // *why* the refund failed (e.g. balance issue) so they can fix it.
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Refund failed',
          variant: 'destructive',
          description: 'Ziina insufficient balance',
        }),
      );
    });
    // Row is still pending — the action button remains so the admin can retry.
    expect(screen.getByTestId(`button-refund-ziina-${ZIINA_REFUND.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`badge-refunded-${ZIINA_REFUND.id}`)).toBeNull();
  });

  it('shows a "Refund pending" badge (not "Refunded") and hides the refund button when Ziina settlement is in flight', async () => {
    // A row whose payment row already has a non-terminal status (e.g.
    // status='pending') must NOT be shown as fully refunded — the player
    // hasn't been emailed yet because the webhook has not confirmed.
    const PENDING_ROW: RefundNotificationWithDetails = {
      ...ZIINA_REFUND,
      id: 'refund-z-pending',
      refundStatus: 'pending',
      ziinaRefundId: 're_pending_1',
      refundedAmount: 5000,
      refundedAt: null,
    };
    renderPage(makeFetch([PENDING_ROW]) as unknown as typeof fetch);
    const tabBtn = await waitFor(() => screen.getByTestId('tab-refunds'));
    await userEvent.setup().click(tabBtn);

    await waitFor(() => {
      expect(screen.getByTestId(`badge-refund-pending-${PENDING_ROW.id}`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`badge-refunded-${PENDING_ROW.id}`)).toBeNull();
    // No re-fire button while a refund is in flight (would double-charge).
    expect(screen.queryByTestId(`button-refund-ziina-${PENDING_ROW.id}`)).toBeNull();
  });
});
