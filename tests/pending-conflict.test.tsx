// A differently-shaped repeat inside the 4-hour window answers 409 pending_booking_exists. The session page turns
// that into two actions instead of a dead-end sentence: "Continue payment" (the existing intent's redirect) and
// "Change booking" (re-submit the CURRENT form — live wallet toggle, live guests — with replacePending, which
// supersedes the unpaid young booking on purpose). Rendered and clicked here, not just string-pinned.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';

const nav = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined), dismissed: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/contexts/MarketplaceAuthContext', () => ({ useMarketplaceAuth: () => ({ isAuthenticated: true, user: { id: 'u-1', name: 'TEST PLAYER' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/lib/nativeAuth', () => ({ openCheckoutRedirect: nav.open, onCheckoutDismissed: nav.dismissed, nativeReturnFields: () => ({}), nativeReturnBody: () => undefined, startGoogleOAuth: vi.fn(), NATIVE_DEEPLINK_SCHEME: 'com.shuttleiq.app' }));
vi.mock('framer-motion', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useReducedMotion: () => true }));
vi.mock('@/pages/marketplace/LandingComponents', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const { pendingConflictOf } = await import('@/lib/pendingConflict');
const { InlineBookingPanel } = await import('@/pages/marketplace/SessionDetails');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

describe('pendingConflictOf', () => {
  it('recognises only the 409 pending_booking_exists answer and carries its copy, booking and redirect', () => {
    const c = pendingConflictOf(409, { error: 'pending_booking_exists', message: 'You already have a booking awaiting payment.', bookingId: 'bk-1', redirectUrl: 'https://pay.ziina.com/x' });
    expect(c).toEqual({ message: 'You already have a booking awaiting payment.', bookingId: 'bk-1', redirectUrl: 'https://pay.ziina.com/x' });
    expect(pendingConflictOf(409, { error: 'pending_booking_exists', bookingId: null, redirectUrl: null })).toMatchObject({ redirectUrl: null, bookingId: null });
    expect(pendingConflictOf(409, { error: 'iq_pass_seat', message: 'x' })).toBeNull();
    expect(pendingConflictOf(400, { error: 'pending_booking_exists' })).toBeNull();
    expect(pendingConflictOf(200, { bookingId: 'bk-1' })).toBeNull();
  });
  it('falls back to a sentence when the server sends none', () => {
    expect(pendingConflictOf(409, { error: 'pending_booking_exists' })?.message).toMatch(/awaiting payment/i);
  });
});

const session = {
  id: 's-1', title: 'Bright Riders School Dubai Session', venueName: 'Bright Riders School Dubai', venueAddress: 'Green Community', date: new Date('2026-09-20T00:00:00Z'), startTime: '20:00', endTime: '22:00',
  priceAed: 49, capacity: 24, spotsRemaining: 10, totalBookings: 1, waitlistCount: 0, status: 'upcoming', courts: 4, maxPlayers: 24, description: null, level: 'all_levels', createdAt: new Date(), ziinaEnabled: true,
} as any;

type Posted = { url: string; body: any };
function harness(answers: Array<{ status: number; body: unknown }>) {
  const posts: Posted[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (init?.method === 'POST' && url.includes('/api/marketplace/bookings')) {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      const a = answers.shift() ?? { status: 500, body: { error: 'no answer scripted' } };
      return json(a.body, a.status);
    }
    if (url.includes('/api/marketplace/me/wallet')) return json({ walletBalance: 0 });
    return json({});
  }) as unknown as typeof fetch;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } } });
  const utils = render(<QueryClientProvider client={qc}><InlineBookingPanel session={session} onBooked={() => {}} /></QueryClientProvider>);
  return { ...utils, posts };
}
const CONFLICT = { status: 409, body: { error: 'pending_booking_exists', message: 'You already have a booking awaiting payment for this session. Continue that payment, or change the booking to replace it.', bookingId: 'bk-old', redirectUrl: 'https://pay.ziina.com/old' } };

describe('InlineBookingPanel — the 409 becomes Continue payment / Change booking', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = global.fetch; localStorage.clear(); localStorage.setItem('mp_accessToken', 'tok'); nav.open.mockClear(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('Pay by Card → 409 → the panel shows the server copy with both actions; the pay button is usable again (lock released)', async () => {
    harness([CONFLICT]);
    fireEvent.click(await screen.findByTestId('button-book-now'));
    fireEvent.click(await screen.findByTestId('button-pay-card'));
    const panel = await screen.findByTestId('panel-pending-conflict');
    expect(panel).toHaveTextContent(/awaiting payment/i);
    expect(screen.getByTestId('button-continue-payment')).not.toBeDisabled();
    expect(screen.getByTestId('button-change-booking')).not.toBeDisabled();
    expect(screen.queryByTestId('text-booking-error')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('button-pay-card')).not.toBeDisabled());
  });

  it('Continue payment opens the existing intent\'s redirect — no new request', async () => {
    const { posts } = harness([CONFLICT]);
    fireEvent.click(await screen.findByTestId('button-book-now'));
    fireEvent.click(await screen.findByTestId('button-pay-card'));
    fireEvent.click(await screen.findByTestId('button-continue-payment'));
    expect(nav.open).toHaveBeenCalledWith('https://pay.ziina.com/old');
    expect(posts).toHaveLength(1);
  });

  it('Change booking re-sends the CURRENT form with replacePending: true, then follows the new redirect; the panel is gone', async () => {
    const { posts } = harness([CONFLICT, { status: 200, body: { bookingId: 'bk-new', paymentMethod: 'ziina', paymentIntentId: 'pi_new', redirectUrl: 'https://pay.ziina.com/new', amount: 49, spotsBooked: 1 } }]);
    fireEvent.click(await screen.findByTestId('button-book-now'));
    fireEvent.click(await screen.findByTestId('button-pay-card'));
    fireEvent.click(await screen.findByTestId('button-change-booking'));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[0].body.replacePending).toBeUndefined();
    expect(posts[1].body).toMatchObject({ sessionId: 's-1', paymentMethod: 'ziina', replacePending: true });
    expect(posts[1].body.applyWallet).toBeUndefined(); // the LIVE wallet toggle (no credit → off), not a value captured at conflict time
    await waitFor(() => expect(nav.open).toHaveBeenCalledWith('https://pay.ziina.com/new'));
    expect(screen.queryByTestId('panel-pending-conflict')).toBeNull();
  });

  it('a 409 with NO redirect (the first request is still attaching its intent) → a Refresh action, not a Change booking that would loop', async () => {
    harness([{ status: 409, body: { error: 'pending_booking_exists', message: 'You already have a booking awaiting payment for this session.', bookingId: 'bk-old', redirectUrl: null } }]);
    fireEvent.click(await screen.findByTestId('button-book-now'));
    fireEvent.click(await screen.findByTestId('button-pay-card'));
    await screen.findByTestId('panel-pending-conflict');
    expect(screen.getByTestId('button-refresh-page')).toBeInTheDocument();
    expect(screen.queryByTestId('button-change-booking')).toBeNull();
    expect(screen.queryByTestId('button-continue-payment')).toBeNull();
  });

  it('Cancel closes the panel and clears the conflict — a fresh Book now starts clean', async () => {
    harness([CONFLICT]);
    fireEvent.click(await screen.findByTestId('button-book-now'));
    fireEvent.click(await screen.findByTestId('button-pay-card'));
    await screen.findByTestId('panel-pending-conflict');
    fireEvent.click(screen.getByTestId('button-cancel-booking'));
    fireEvent.click(await screen.findByTestId('button-book-now'));
    await screen.findByTestId('button-pay-card');
    expect(screen.queryByTestId('panel-pending-conflict')).toBeNull();
  });
});

describe('source pins — SessionDetails', () => {
  const src = read('client/src/pages/marketplace/SessionDetails.tsx');
  it('the booking POST turns a 409 into the conflict panel instead of throwing; Change booking re-submits with replacePending: true and the live wallet toggle', () => {
    expect(src.includes('pendingConflictOf(res.status, data)')).toBe(true);
    expect(src.includes('replacePending: true')).toBe(true);
    const chg = src.slice(src.indexOf('data-testid="button-change-booking"') - 400, src.indexOf('data-testid="button-change-booking"'));
    expect(chg.includes('useWallet, { replace: true }')).toBe(true);
  });
  it('the conflict panel is cleared when a new submit starts', () => {
    const mk = src.slice(src.indexOf('const makeBooking = async'), src.indexOf('const makeBooking = async') + 900);
    expect(mk.includes('setPendingConflict(null)')).toBe(true);
  });
});
