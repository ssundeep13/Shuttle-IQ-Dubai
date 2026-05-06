import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider, type QueryFunction } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

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

const SESSION_ID = 'sess-cancel-1';
const BOOKABLE_ID = 'bookable-cancel-1';

function makeSession() {
  return {
    id: SESSION_ID,
    venueName: 'Test Court',
    status: 'upcoming',
    date: '2026-12-31',
    startTime: '20:00',
    endTime: '22:00',
    courtCount: 2,
    skillLevels: ['Beginner'],
    pricePerPerson: 5000,
    totalCapacity: 16,
    isSandbox: false,
    createdAt: new Date().toISOString(),
  };
}

function makeBookable(status: 'upcoming' | 'cancelled' = 'upcoming') {
  return {
    id: BOOKABLE_ID,
    linkedSessionId: SESSION_ID,
    title: 'Test Bookable',
    venueName: 'Test Court',
    date: '2026-12-31',
    startTime: '20:00',
    endTime: '22:00',
    capacity: 16,
    pricePerPerson: 5000,
    status,
    totalBookings: 4,
    confirmedBookings: 4,
    waitlistCount: 0,
    availableSpots: 12,
  };
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

describe('SessionsManagement — cancel event flow', () => {
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

  function makeFetch(extra: Partial<{ bookableStatus: 'upcoming' | 'cancelled' }> = {}) {
    const cancelCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith(`/api/marketplace/admin/sessions/${BOOKABLE_ID}/cancel`)) {
        cancelCalls.push(url);
        return new Response(
          JSON.stringify({
            alreadyCancelled: false,
            bookingsCancelled: 4,
            walletRefundedCount: 1,
            ziinaRefundCount: 2,
            cashRefundCount: 1,
            emailsSent: 4,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/sessions') && url.includes('sandbox=true')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/sessions')) {
        return new Response(JSON.stringify([makeSession()]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/players')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/marketplace/admin/sessions')) {
        return new Response(JSON.stringify([makeBookable(extra.bookableStatus ?? 'upcoming')]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/disputes')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/marketplace/admin/refunds')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    return { fetchMock, cancelCalls };
  }

  it('shows cancel-event button on a card with a linked bookable, opens dialog with booking count, and POSTs to the cancel endpoint on confirm', async () => {
    const { fetchMock, cancelCalls } = makeFetch();
    renderPage(fetchMock as unknown as typeof fetch);

    const triggerBtn = await waitFor(() =>
      screen.getByTestId(`button-cancel-event-${SESSION_ID}`)
    );
    fireEvent.click(triggerBtn);

    // Dialog should reveal the booking count.
    await waitFor(() => {
      expect(screen.getByTestId('button-confirm-cancel-event')).toBeInTheDocument();
    });
    expect(screen.getByRole('alertdialog').textContent).toMatch(/4/);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Test Court/);

    fireEvent.click(screen.getByTestId('button-confirm-cancel-event'));

    await waitFor(() => {
      expect(cancelCalls.length).toBe(1);
    });

    // Success toast must summarise the refund counts so the admin sees
    // exactly what happened — not just a generic "done" message.
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    const successCall = toastMock.mock.calls.find(
      (args) => (args[0] as { title?: string })?.title === 'Event cancelled',
    );
    expect(successCall, 'expected an "Event cancelled" toast').toBeTruthy();
    const description = (successCall![0] as { description: string }).description;
    expect(description).toContain('4 bookings cancelled');
    expect(description).toContain('3 refunds queued'); // 2 ziina + 1 cash
    expect(description).toContain('4 players emailed');

    // Admin/marketplace/refunds query caches must be invalidated — verified
    // by the refunds endpoint being re-fetched after the mutation resolves.
    await waitFor(() => {
      const refundFetches = (fetchMock.mock.calls as Array<[string | URL | Request, RequestInit | undefined]>)
        .filter(([url]) => String(url).endsWith('/api/marketplace/admin/refunds'));
      expect(refundFetches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('hides the cancel-event button when the linked bookable is already cancelled and renders the Cancelled badge', async () => {
    const { fetchMock } = makeFetch({ bookableStatus: 'cancelled' });
    renderPage(fetchMock as unknown as typeof fetch);

    await waitFor(() => {
      expect(screen.getByTestId(`badge-event-cancelled-${SESSION_ID}`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`button-cancel-event-${SESSION_ID}`)).toBeNull();
  });
});
