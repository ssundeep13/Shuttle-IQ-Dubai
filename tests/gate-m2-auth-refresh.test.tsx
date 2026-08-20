/**
 * Gate M2 #40 — behavioural pins for the auth-refresh bounce, written BEFORE
 * the fix (per the autonomous-run rules).
 *
 * Bug (E.2): the /auth/me queryFn threw unconditionally after `await
 * refreshAccessToken()`, even when the refresh SUCCEEDED — settling the query
 * as an error with isLoading=false, which is exactly the condition
 * MarketplaceProtectedRoute redirects on. Every returning user whose 3.5h
 * access token had lapsed got bounced to the login screen with a valid session.
 *
 * Pins:
 *  1. successful refresh → the observable state NEVER passes through
 *     {isAuthenticated: false, isLoading: false} (the redirect condition)
 *     on the way to authenticated.                       [RED before the fix]
 *  2. failed refresh → settles cleanly signed-out, tokens cleared, and the
 *     protected route's ?from= contract is intact.       [guard]
 *  3. a concurrent refresh attempt (the 3.5h interval firing mid-refresh)
 *     never issues a second POST /auth/refresh.          [guard]
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MarketplaceAuthProvider, useMarketplaceAuth } from '../client/src/contexts/MarketplaceAuthContext';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const USER = { id: 'u1', email: 'pin@shuttleiq.test', name: 'Pin User', role: 'player', emailVerified: true, linkedPlayerId: null };

type Snap = { isAuthenticated: boolean; isLoading: boolean };
const snapshots: Snap[] = [];

function Probe() {
  const { isAuthenticated, isLoading, user } = useMarketplaceAuth();
  snapshots.push({ isAuthenticated, isLoading });
  return <div data-testid="probe">{isLoading ? 'loading' : isAuthenticated ? `in:${user?.email}` : 'out'}</div>;
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MarketplaceAuthProvider>
        <Probe />
      </MarketplaceAuthProvider>
    </QueryClientProvider>,
  );
}

function seedTokens() {
  localStorage.setItem('mp_accessToken', 'OLD');
  localStorage.setItem('mp_refreshToken', 'REFRESH');
  localStorage.setItem('mp_remember', 'true');
}

let refreshCalls = 0;

beforeEach(() => {
  snapshots.length = 0;
  refreshCalls = 0;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('#40 — expired access token with a valid refresh token', () => {
  it('1. never passes through the redirect condition (unauthenticated + not loading) on the way to authenticated', async () => {
    seedTokens();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/marketplace/auth/refresh')) {
        refreshCalls++;
        return json({ accessToken: 'NEW', refreshToken: 'REFRESH' });
      }
      if (url.includes('/api/marketplace/auth/me')) {
        const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '';
        return auth === 'Bearer NEW' ? json(USER) : json({ error: 'expired' }, 401);
      }
      return json({}, 404);
    }));

    mount();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe(`in:${USER.email}`), { timeout: 5000 });

    const firstAuthed = snapshots.findIndex(s => s.isAuthenticated);
    const bounced = snapshots.slice(0, firstAuthed).some(s => !s.isAuthenticated && !s.isLoading);
    expect(firstAuthed, 'must end authenticated').toBeGreaterThanOrEqual(0);
    expect(bounced, 'passed through {unauthenticated, not loading} — the protected route would have redirected').toBe(false);
    expect(refreshCalls).toBe(1);
  });

  it('2. failed refresh settles cleanly signed-out with tokens cleared; the ?from= contract is intact', async () => {
    seedTokens();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) { refreshCalls++; return json({ error: 'bad refresh' }, 401); }
      if (url.includes('/auth/me')) return json({ error: 'expired' }, 401);
      return json({}, 404);
    }));

    mount();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('out'), { timeout: 5000 });
    expect(localStorage.getItem('mp_accessToken')).toBeNull();
    expect(localStorage.getItem('mp_refreshToken')).toBeNull();
    expect(refreshCalls).toBe(1);
    // the redirect-with-intent contract lives in the protected route — pin it
    expect(read('client/src/components/MarketplaceProtectedRoute.tsx')).toContain('from=${encodeURIComponent(location)}');
  });

  it('3. concurrent refresh attempts share one in-flight request (single-flight), and its outcome', () => {
    // The interval-mid-refresh race is not reachable deterministically from
    // jsdom (fake timers deadlock RTL's waitFor; timers installed after mount
    // cannot fire the already-registered real interval), so the no-double-
    // refresh property is pinned structurally: one shared in-flight promise,
    // RETURNED to concurrent callers — never a boolean that makes the second
    // caller act on a false "failed".
    const src = read('client/src/contexts/MarketplaceAuthContext.tsx');
    expect(src).toMatch(/refreshInFlight\s*=\s*useRef<Promise<boolean>\s*\|\s*null>/);
    expect(src).toMatch(/if \(refreshInFlight\.current\) return refreshInFlight\.current;/);
    expect(src).not.toMatch(/isRefreshing\.current/);
  });
});
