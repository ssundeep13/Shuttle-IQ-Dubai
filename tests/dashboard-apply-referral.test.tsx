import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: vi.fn(),
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => {},
}));

vi.mock('@/hooks/use-install-prompt', () => ({
  useInstallPrompt: () => ({ canInstall: false, install: vi.fn() }),
}));

vi.mock('@/components/TagTrendingModal', () => ({
  default: () => null,
}));

// framer-motion's `motion.div` is rendered eagerly; replace with a plain div
// so jsdom does not need animation polyfills (no ResizeObserver etc.).
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => {
        const { children, ...rest } = props ?? {};
        return <div {...rest}>{children}</div>;
      },
    }
  ),
}));

import Dashboard from '@/pages/marketplace/Dashboard';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { getQueryFn } from '@/lib/queryClient';

const USER = {
  id: 'user-1',
  email: 'me@example.com',
  name: 'Test User',
  phone: null,
  linkedPlayerId: 'player-1',
  photoUrl: null,
};

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function makeFetchMock(referredByName: string | null, opts?: { linkResult?: { ok: boolean; status?: number; body?: any }; validateResult?: { valid: boolean; referrerName?: string } }) {
  let currentReferrer = referredByName;
  const handler: FetchHandler = async (url, init) => {
    if (url.includes('/api/referrals/me/referred-by')) {
      return new Response(JSON.stringify({ referrerName: currentReferrer }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/referrals/player/')) {
      return new Response(
        JSON.stringify({
          referralCode: 'SIQ-TEST00-00001',
          walletBalance: 0,
          ambassadorStatus: false,
          jerseyDispatched: false,
          leaderboardMention: false,
          completedCount: 0,
          referrals: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/referrals/validate/')) {
      const result = opts?.validateResult ?? { valid: true, referrerName: 'Ahmed' };
      return new Response(JSON.stringify(result), {
        status: result.valid ? 200 : 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/referrals/link')) {
      const r = opts?.linkResult ?? { ok: true };
      if (r.ok) {
        // Subsequent referred-by fetches should reflect the new referrer.
        currentReferrer = opts?.validateResult?.referrerName ?? 'Ahmed';
        return new Response(JSON.stringify({ id: 'ref-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(r.body ?? { error: 'Failed' }), {
        status: r.status ?? 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // All other Dashboard queries: return empty/no-op shape that won't crash.
    if (url.includes('/api/players/') && url.endsWith('/stats')) {
      return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/tags/player/')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  });
}

function renderDashboard() {
  const memHook = memoryLocation({ path: '/marketplace', record: true });
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: 'throw' }),
        retry: false,
        staleTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={memHook.hook}>
        <Dashboard />
      </Router>
    </QueryClientProvider>
  );
}

describe('Dashboard — Apply referral code post-signup', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
    sessionStorage.clear();
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      user: USER,
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('hides the entry point and shows "Referred by X" when a referral is on file', async () => {
    global.fetch = makeFetchMock('Ahmed') as unknown as typeof fetch;
    renderDashboard();

    await screen.findByTestId('card-my-referrals');
    await waitFor(() => {
      expect(screen.getByTestId('text-referred-by')).toHaveTextContent('Referred by Ahmed');
    });
    expect(screen.queryByTestId('button-open-apply-referral')).toBeNull();
  });

  it('shows the entry point when no referral is on file, and hides it after a successful apply', async () => {
    global.fetch = makeFetchMock(null, {
      validateResult: { valid: true, referrerName: 'Ahmed' },
      linkResult: { ok: true },
    }) as unknown as typeof fetch;
    renderDashboard();

    await screen.findByTestId('card-my-referrals');
    const openBtn = await screen.findByTestId('button-open-apply-referral');
    expect(screen.queryByTestId('text-referred-by')).toBeNull();

    await act(async () => {
      fireEvent.click(openBtn);
    });

    const input = await screen.findByTestId('input-apply-referral-code');
    const submit = screen.getByTestId('button-apply-referral-submit');
    // Submit should be disabled before a code is entered & validated.
    expect(submit).toBeDisabled();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'SIQ-AHMED0-00001' } });
      fireEvent.blur(input);
    });

    await screen.findByTestId('text-apply-referrer-name');
    expect(screen.getByTestId('text-apply-referrer-name')).toHaveTextContent('Referred by Ahmed');
    expect(submit).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(submit);
    });

    // Dialog closes, referred-by line appears, entry point disappears.
    await waitFor(() => {
      expect(screen.queryByTestId('dialog-apply-referral')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByTestId('text-referred-by')).toHaveTextContent('Referred by Ahmed');
    });
    expect(screen.queryByTestId('button-open-apply-referral')).toBeNull();
  });

  it('shows an error and keeps the dialog open when the code is invalid', async () => {
    global.fetch = makeFetchMock(null, {
      validateResult: { valid: false },
    }) as unknown as typeof fetch;
    renderDashboard();

    const openBtn = await screen.findByTestId('button-open-apply-referral');
    await act(async () => {
      fireEvent.click(openBtn);
    });

    const input = await screen.findByTestId('input-apply-referral-code');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'SIQ-NOPE00-00000' } });
      fireEvent.blur(input);
    });

    await screen.findByTestId('text-apply-referral-error');
    expect(screen.getByTestId('text-apply-referral-error')).toHaveTextContent('Invalid referral code');
    expect(screen.getByTestId('button-apply-referral-submit')).toBeDisabled();
    expect(screen.queryByTestId('text-apply-referrer-name')).toBeNull();
  });

  it('shows a standalone entry point and links a code for users without a linked player profile', async () => {
    (useMarketplaceAuth as unknown as Mock).mockReturnValue({
      user: { ...USER, linkedPlayerId: null },
      isAuthenticated: true,
    });
    global.fetch = makeFetchMock(null, {
      validateResult: { valid: true, referrerName: 'Ahmed' },
      linkResult: { ok: true },
    }) as unknown as typeof fetch;
    renderDashboard();

    // The full My Referrals card is hidden (it requires linkedPlayerId), but
    // the standalone apply card should appear.
    await screen.findByTestId('card-apply-referral-standalone');
    expect(screen.queryByTestId('card-my-referrals')).toBeNull();

    const openBtn = await screen.findByTestId('button-open-apply-referral-standalone');
    await act(async () => {
      fireEvent.click(openBtn);
    });

    const input = await screen.findByTestId('input-apply-referral-code');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'SIQ-AHMED0-00001' } });
      fireEvent.blur(input);
    });
    await screen.findByTestId('text-apply-referrer-name');

    await act(async () => {
      fireEvent.click(screen.getByTestId('button-apply-referral-submit'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('dialog-apply-referral')).toBeNull();
    });
    // After linking, the standalone "Referred by" line replaces the entry point.
    await waitFor(() => {
      expect(screen.getByTestId('text-referred-by-standalone')).toHaveTextContent('Referred by Ahmed');
    });
    expect(screen.queryByTestId('button-open-apply-referral-standalone')).toBeNull();
  });

  it('surfaces the server error (e.g. self-referral) when /api/referrals/link rejects', async () => {
    global.fetch = makeFetchMock(null, {
      validateResult: { valid: true, referrerName: 'Me Myself' },
      linkResult: { ok: false, status: 400, body: { error: 'You cannot refer yourself' } },
    }) as unknown as typeof fetch;
    renderDashboard();

    const openBtn = await screen.findByTestId('button-open-apply-referral');
    await act(async () => {
      fireEvent.click(openBtn);
    });

    const input = await screen.findByTestId('input-apply-referral-code');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'SIQ-SELF00-00001' } });
      fireEvent.blur(input);
    });

    await screen.findByTestId('text-apply-referrer-name');
    const submit = screen.getByTestId('button-apply-referral-submit');
    await act(async () => {
      fireEvent.click(submit);
    });

    await screen.findByTestId('text-apply-referral-error');
    expect(screen.getByTestId('text-apply-referral-error')).toHaveTextContent('You cannot refer yourself');
    // Dialog stays open; entry point still hidden behind it.
    expect(screen.getByTestId('dialog-apply-referral')).toBeInTheDocument();
  });
});
