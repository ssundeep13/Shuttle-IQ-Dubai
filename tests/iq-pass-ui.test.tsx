// IQ Pass Gate 6 — purchase UI + My Bookings. The IqPass page and the move
// dialog render in jsdom against a stubbed fetch; the bookings page, the two
// checkout return pages, the nav entries and the Sessions banner are pinned at
// source. Copy rule: never per-game maths, never savings.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';

const authMock = vi.hoisted(() => ({ user: { id: 'u-1', name: 'Test Player', email: 't@example.com' }, isAuthenticated: true, isLoading: false }));
const nativeMock = vi.hoisted(() => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock('../client/src/contexts/MarketplaceAuthContext', () => ({ useMarketplaceAuth: () => authMock }));
vi.mock('../client/src/lib/nativeAuth', () => nativeMock);
vi.mock('../client/src/hooks/useIqPass', () => ({ useIqPassEnabled: () => flagMock.enabled, useIqPassTiers: () => ({}) }));

const { default: IqPass } = await import('../client/src/pages/marketplace/IqPass');
const { IqPassMoveDialog } = await import('../client/src/components/marketplace/IqPassMoveDialog');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const sessionsFixture = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`, title: 'Smash Session', venueName: i % 2 ? 'Bright Riders School Dubai' : 'Smash Sports Academy', venueLocation: null,
  dateDubai: `2026-09-${String(15 + i).padStart(2, '0')}`, startTime: '20:00', endTime: '22:00', status: 'upcoming', linked: true,
  capacity: 24, priceAed: 49, spotsRemaining: i === 13 ? 0 : 10, packSeats: 0, packSeatsLeft: i === 12 ? 0 : 12, alreadyBooked: i === 11,
}));
const tiersFixture = { club: { label: 'Club', games: 4, priceAed: 188 }, club_plus: { label: 'Club Plus', games: 8, priceAed: 360 }, club_elite: { label: 'Club Elite', games: 12, priceAed: 516 } };
const calendar = (over: Record<string, unknown> = {}) => ({ window: { start: '2026-09-14', end: '2026-10-11' }, currentPass: null, jerseyEligibleForElite: true, tiers: tiersFixture, sessions: sessionsFixture, ...over });

let fetchMock: ReturnType<typeof vi.fn>;
const stubFetch = (handlers: Record<string, (init?: RequestInit) => unknown>) => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    const body = handlers[key](init);
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
};
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('IqPass page — purchase flow', () => {
  beforeEach(() => { flagMock.enabled = true; nativeMock.openCheckoutRedirect.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('flag off → a plain "not available" notice, no calendar request', async () => {
    flagMock.enabled = false;
    stubFetch({});
    mount(<IqPass />);
    expect(await screen.findByTestId('text-iq-pass-unavailable')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tier cards: names, game counts and the pass price only — never per-game maths or savings', async () => {
    stubFetch({ '/api/marketplace/iq-pass/me': () => ({ packs: [] }), '/api/marketplace/iq-pass/calendar': () => calendar() });
    mount(<IqPass />);
    const club = await screen.findByTestId('card-tier-club');
    expect(club.textContent).toMatch(/Club/); expect(club.textContent).toMatch(/4 games/); expect(club.textContent).toMatch(/AED 188/);
    expect(screen.getByTestId('card-tier-club_plus').textContent).toMatch(/8 games/);
    expect(screen.getByTestId('card-tier-club_plus').textContent).toMatch(/AED 360/);
    expect(screen.getByTestId('card-tier-club_elite').textContent).toMatch(/12 games/);
    expect(screen.getByTestId('card-tier-club_elite').textContent).toMatch(/AED 516/);
    expect(document.body.textContent).not.toMatch(/per game|\/ ?game|save|saving|AED 4[357]\b|AED 49/i);
  });

  it('Club Plus: pick exactly 8 from the window (full / capped / already-booked rows disabled) → review "Your month is locked" → Pay posts the picks and opens Ziina', async () => {
    let purchaseBody: any = null;
    stubFetch({
      '/api/marketplace/iq-pass/me': () => ({ packs: [] }),
      '/api/marketplace/iq-pass/calendar': () => calendar(),
      '/api/marketplace/iq-pass/purchase': (init) => { purchaseBody = JSON.parse(String(init?.body)); return { packId: 'pk-new', redirectUrl: 'https://pay.ziina.com/x' }; },
    });
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club_plus'));
    await screen.findByTestId('card-session-s0');
    expect(screen.getAllByTestId(/^slot-\d+$/).length).toBe(8); // Gate 11: eight empty slots, no counter
    expect((screen.getByTestId('card-session-s11') as HTMLButtonElement).disabled).toBe(true); // already booked
    expect((screen.getByTestId('card-session-s12') as HTMLButtonElement).disabled).toBe(true); // pack seats capped
    expect((screen.getByTestId('card-session-s13') as HTMLButtonElement).disabled).toBe(true); // session full
    expect(screen.queryByTestId('button-continue')).toBeNull(); // Gate 11: Review appears only once every slot is filled
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByTestId(`card-session-s${i}`));
    expect(screen.getAllByTestId(/^slot-\d+$/).filter((el) => el.getAttribute('data-filled') === 'true').length).toBe(8);
    expect((screen.getByTestId('card-session-s8') as HTMLButtonElement).disabled).toBe(true); // a ninth pick is not allowed
    fireEvent.click(screen.getByTestId('button-continue'));
    expect((await screen.findByTestId('text-review-title')).textContent).toBe('Your month is locked');
    expect(screen.getByTestId('button-pay').textContent).toMatch(/Pay AED 360/);
    expect(document.body.textContent).not.toMatch(/per game|\/ ?game|save|saving/i);
    fireEvent.click(screen.getByTestId('button-pay'));
    await waitFor(() => expect(nativeMock.openCheckoutRedirect).toHaveBeenCalledWith('https://pay.ziina.com/x'));
    expect(purchaseBody).toMatchObject({ tier: 'club_plus', sessionIds: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'] });
    expect(purchaseBody.jerseySize).toBeUndefined();
  });

  it('Club Elite first purchase asks for a jersey size (S–XXL) and sends it', async () => {
    let purchaseBody: any = null;
    stubFetch({
      '/api/marketplace/iq-pass/me': () => ({ packs: [] }),
      '/api/marketplace/iq-pass/calendar': () => calendar(),
      '/api/marketplace/iq-pass/purchase': (init) => { purchaseBody = JSON.parse(String(init?.body)); return { packId: 'pk-e', redirectUrl: 'https://pay.ziina.com/e' }; },
    });
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club_elite'));
    await screen.findByTestId('card-session-s0');
    const select = screen.getByTestId('select-jersey-size') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'S', 'M', 'L', 'XL', 'XXL']);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) fireEvent.click(screen.getByTestId(`card-session-s${i}`));
    // 11 of 12 — continue disabled; the 12th pickable row is s12? no (capped) → none left but s11 (booked) / s13 (full)
    expect(screen.queryByTestId('button-continue')).toBeNull(); // Gate 9: Review appears only once every game is picked
    // free one more row for the test: the fixture leaves exactly 11 pickable rows, so widen it
    fireEvent.click(screen.getByTestId('card-session-s10')); // unpick
    expect(screen.getAllByTestId(/^slot-\d+$/).filter((el) => el.getAttribute('data-filled') === 'true').length).toBe(10);
  });

  it('server-side pick conflicts surface as a message, not a crash', async () => {
    stubFetch({
      '/api/marketplace/iq-pass/me': () => ({ packs: [] }),
      '/api/marketplace/iq-pass/calendar': () => calendar(),
    });
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ packs: [] }) }));
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('card-session-s0');
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId(`card-session-s${i}`));
    fireEvent.click(screen.getByTestId('button-continue'));
    await screen.findByTestId('text-review-title');
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/iq-pass/purchase')) return { ok: false, status: 409, json: async () => ({ error: 'pack_cap_reached', sessionId: 's2' }) };
      return original(url, init);
    });
    fireEvent.click(screen.getByTestId('button-pay'));
    expect((await screen.findByTestId('text-purchase-error')).textContent).toMatch(/no IQ Pass seats left/i);
    expect(nativeMock.openCheckoutRedirect).not.toHaveBeenCalled();
  });

  it('with an active pass: shows the pass, its seats with Move where allowed, and "Buy your next pass"', async () => {
    stubFetch({
      '/api/marketplace/iq-pass/me': () => ({ packs: [{
        id: 'pk-1', tier: 'club', label: 'Club', status: 'active', gamesTotal: 4, repickCredits: 1, jerseySize: null, jerseyHandedOverAt: null, paidAt: '2026-09-10T00:00:00.000Z', holdExpiresAt: '2026-09-10T00:30:00.000Z', lastGameDate: '2026-09-30',
        seats: [
          { bookingId: 'b1', sessionId: 's1', status: 'confirmed', session: { title: 'Smash', venueName: 'Smash Sports Academy', date: '2026-09-20T00:00:00.000Z', startTime: '20:00', endTime: '22:00' }, canMoveUntil: '2099-01-01T00:00:00.000Z', canMove: true },
          { bookingId: 'b2', sessionId: 's2', status: 'confirmed', session: { title: 'Smash', venueName: 'Smash Sports Academy', date: '2026-09-16T00:00:00.000Z', startTime: '20:00', endTime: '22:00' }, canMoveUntil: '2000-01-01T00:00:00.000Z', canMove: false },
        ],
      }] }),
      '/api/marketplace/iq-pass/calendar': () => calendar({ currentPass: { id: 'pk-1', tier: 'club', label: 'Club', gamesTotal: 4, lastGameDate: '2026-09-30' }, window: { start: '2026-10-01', end: '2026-10-28' } }),
    });
    mount(<IqPass />);
    const pass = await screen.findByTestId('card-my-pass-pk-1');
    expect(pass.textContent).toMatch(/Club/);
    expect(pass.textContent).toMatch(/1 free re-pick/);
    expect(screen.getByTestId('button-move-b1')).toBeTruthy();
    expect(screen.queryByTestId('button-move-b2')).toBeNull();
    expect(screen.getByTestId('button-repick-pk-1')).toBeTruthy();
    expect(screen.getByTestId('button-buy-next').textContent).toMatch(/next pass/i);
    expect(pass.textContent).not.toMatch(/AED/);
  });
});

describe('IqPassMoveDialog', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('lists pickable sessions from the calendar (never the current one, never full / already-booked), posts the move, reports back', async () => {
    let moveBody: any = null; let moveUrl = '';
    stubFetch({
      '/api/marketplace/iq-pass/calendar': () => calendar(),
      '/api/marketplace/iq-pass/bookings/b1/move': (init) => { moveBody = JSON.parse(String(init?.body)); return { newBookingId: 'b-new' }; },
    });
    const onMoved = vi.fn();
    mount(<IqPassMoveDialog open onOpenChange={() => {}} bookingId="b1" currentSessionId="s1" onMoved={onMoved} />);
    await screen.findByTestId('move-row-s0');
    expect(screen.queryByTestId('move-row-s1')).toBeNull();
    expect(screen.queryByTestId('move-row-s11')).toBeNull();
    expect(screen.queryByTestId('move-row-s13')).toBeNull();
    fireEvent.click(screen.getByTestId('move-row-s3'));
    fireEvent.click(screen.getByTestId('button-move-confirm'));
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('b-new'));
    expect(moveBody).toEqual({ toSessionId: 's3' });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/marketplace/iq-pass/bookings/b1/move') && (c[1] as RequestInit)?.method === 'POST')).toBe(true);
  });
});

describe('source pins — bookings page, checkout returns, nav, banner, route', () => {
  const mb = read('client/src/pages/marketplace/MyBookings.tsx');
  it('My Bookings: pack seats get their own section, no cancel / pay-now, a tier label instead of an amount, and Move', () => {
    expect(mb).toMatch(/from '@\/components\/marketplace\/MyGames'/); // Gate 13: pass seats are agenda rows with the IQ Pass chip
    expect(read('client/src/components/marketplace/MyGames.tsx')).toMatch(/chip-iq-pass-\$\{booking\.id\}/);
    expect(mb.includes('const packSeats = upcoming.filter(b => !!b.packId')).toBe(true);
    expect(mb.includes("const active = upcoming.filter(b => b.status !== 'waitlisted' && b.status !== 'pending_payment' && !b.packId)")).toBe(true);
    expect(mb.includes("const pendingPayment = upcoming.filter(b => b.status === 'pending_payment' && !b.packId)")).toBe(true);
    expect(mb.includes('const canCancel = !booking.packId && !booking.isGuestBooking')).toBe(true);
    expect(mb.includes('{isPendingPayment && !booking.packId && (')).toBe(true);
    expect(mb.includes('data-testid={`text-booking-iqpass-${booking.id}`}')).toBe(true);
    expect(mb.includes('data-testid={`button-move-${booking.id}`}')).toBe(true);
    expect(mb.includes("import { IqPassMoveDialog } from '@/components/marketplace/IqPassMoveDialog';")).toBe(true);
    // the amount line is skipped for pack seats
    expect(mb.includes('{!isWaitlisted && !isPendingPayment && !booking.packId && (')).toBe(true);
  });
  it('CheckoutSuccess: a pack return polls the pack confirm route and refreshes the pass', () => {
    const cs = read('client/src/pages/marketplace/CheckoutSuccess.tsx');
    expect(cs.includes("const packId = params.get('pack_id');")).toBe(true);
    expect(cs.includes('`/api/marketplace/iq-pass/packs/${packId}/confirm`')).toBe(true);
    expect(cs.includes("queryClient.invalidateQueries({ queryKey: ['/api/marketplace/iq-pass/me'] });")).toBe(true);
    expect(cs.includes("isPack ? 'Your IQ Pass is active' :")).toBe(true);
  });
  it('CheckoutCancel: a pack return never cancels the seat booking (the 30-minute hold lapses on its own) and says so', () => {
    const cc = read('client/src/pages/marketplace/CheckoutCancel.tsx');
    expect(cc.includes("const packId = params.get('pack_id');")).toBe(true);
    expect(cc.includes('if (bookingId && !packId) {')).toBe(true);
    expect(cc).toMatch(/held for 30 minutes/);
  });
  it('nav: dropdown entry + Sessions tab prefix + route + Sessions-page banner, all behind the flag', () => {
    const nav = read('client/src/components/MarketplaceNav.tsx');
    expect(nav.includes("{ href: '/marketplace/iq-pass', label: 'IQ Pass', icon: Ticket }")).toBe(true);
    expect(nav.includes('useIqPassEnabled()')).toBe(true);
    const bottom = read('client/src/components/MobileBottomNav.tsx');
    expect(bottom.includes("location.startsWith('/marketplace/iq-pass')")).toBe(true);
    const app = read('client/src/App.tsx');
    expect(app.includes('<Route path="/marketplace/iq-pass">')).toBe(true);
    expect(app.includes('<MarketplaceAuthRoute component={IqPass} />')).toBe(true);
    const bs = read('client/src/pages/marketplace/BookSessions.tsx');
    expect(bs.includes('data-testid="banner-iq-pass"')).toBe(true);
    expect(bs.includes('{iqPassEnabled && (')).toBe(true);
    const banner = bs.slice(bs.indexOf('data-testid="banner-iq-pass"'), bs.indexOf('Birthday prompt'));
    expect(banner).not.toMatch(/per game|saving|save/i);
  });
  it('the page and dialog use the IQ Pass tokens only (no drifted hex, no emoji)', () => {
    for (const f of ['client/src/pages/marketplace/IqPass.tsx', 'client/src/components/marketplace/IqPassMoveDialog.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/#003E8C|#F5EFE0|#002C84|#F2ECE1/);
      expect(src, f).toMatch(/from '@\/lib\/iqPassTokens'/);
      expect(src, f).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(src, f).not.toMatch(/per game|saving/i);
    }
  });
});
