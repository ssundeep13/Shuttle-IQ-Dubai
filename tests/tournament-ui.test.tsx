// Tournament Gate 3 — the player screens over mocked data hooks: the page (every state),
// the home / dashboard banner, the pinned Sessions row, the My games entry, the
// withdraw dialog, the checkout return; plus source tripwires on every slot.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import React from 'react';

const state = vi.hoisted(() => ({
  enabled: true,
  view: undefined as any,
  entry: undefined as any,
  auth: { isAuthenticated: true, user: { id: 'u-1', linkedPlayerId: 'p-1' } } as any,
  actions: { register: vi.fn(), pay: vi.fn(), withdraw: vi.fn(), setSponsor: vi.fn(), busy: false, error: null as string | null, clearError: vi.fn() },
}));
vi.mock('../client/src/hooks/useTournament', async (orig) => ({
  ...(await orig<typeof import('../client/src/hooks/useTournament')>()),
  useTournamentEnabled: () => state.enabled,
  useTournamentView: () => ({ data: state.view, isLoading: false }),
  useMyTournamentEntry: () => ({ data: state.entry, isLoading: false }),
  useTournamentActions: () => state.actions,
}));
vi.mock('../client/src/contexts/MarketplaceAuthContext', () => ({ useMarketplaceAuth: () => state.auth }));
vi.mock('../client/src/lib/nativeAuth', () => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
vi.mock('framer-motion', async (orig) => ({ ...(await orig<typeof import('framer-motion')>()), useReducedMotion: () => true }));

const { default: Tournament } = await import('../client/src/pages/marketplace/Tournament');
const { TournamentBanner } = await import('../client/src/components/marketplace/TournamentBanner');
const { TournamentSessionsRow } = await import('../client/src/components/marketplace/TournamentSessionsRow');
const { TournamentEntryCard } = await import('../client/src/components/marketplace/TournamentEntryCard');
const { TournamentSponsorCard } = await import('../client/src/components/marketplace/TournamentSponsorCard');
const { TournamentCheckoutResult } = await import('../client/src/components/marketplace/TournamentCheckoutResult');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const T = {
  id: 't-1', name: 'ShuttleIQ League', startsAt: '2026-10-17T14:00:00.000Z', endsAt: '2026-10-17T18:00:00.000Z',
  venueName: 'BASELINE SPORTS ACADEMY DIP', venueLocation: 'Dubai Investment Park Second - Dubai', venueMapUrl: 'https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9',
  entryFeeAed: 100, registrationOpensAtMembers: '2026-09-25T08:00:00.000Z', registrationOpensAt: '2026-09-25T14:00:00.000Z',
  registrationClosesAt: '2026-10-08T20:00:00.000Z', withdrawDeadlineAt: '2026-10-08T20:00:00.000Z', draftCutoffAt: '2026-10-10T20:00:00.000Z', deckUrl: null,
};
const tiers = (over: Record<string, any> = {}) => [
  { tier: 'Professional', cap: 6, held: 6, waitlisted: 1, waitlistCap: 2, state: 'waitlist' },
  { tier: 'Competitive', cap: 18, held: 12, waitlisted: 0, waitlistCap: 2, state: 'open' },
  { tier: 'Intermediate', cap: 18, held: 3, waitlisted: 0, waitlistCap: 2, state: 'open' },
  { tier: 'Beginner', cap: 6, held: 6, waitlisted: 2, waitlistCap: 2, state: 'full' },
].map((t) => ({ ...t, ...(over[t.tier] ?? {}) }));
const view = (over: Record<string, any> = {}) => ({ visible: true, phase: 'open', canRegister: true, tournament: T, tiers: tiers(), ...over });
const reg = (over: Record<string, any> = {}) => ({
  id: 'r-1', tournamentId: 't-1', tier: 'Competitive', status: 'pending_payment', amountAed: 100, holdExpiresAt: '2026-09-26T10:00:00.000Z',
  paidAt: null, promotedAt: null, withdrawnAt: null, refundStatus: null, tShirtSize: 'M', company: null, shareWithSponsors: false, sponsorInterest: false, createdAt: '2026-09-25T14:05:00.000Z', ...over,
});
const entry = (over: Record<string, any> = {}) => ({ tournament: T, registration: null, eligibleTier: 'Competitive', canRegister: true, ...over });

beforeEach(() => {
  state.enabled = true; state.view = view(); state.entry = entry();
  state.auth = { isAuthenticated: true, user: { id: 'u-1', linkedPlayerId: 'p-1' } };
  for (const k of ['register', 'pay', 'withdraw', 'setSponsor', 'clearError'] as const) (state.actions as any)[k] = vi.fn().mockResolvedValue(undefined);
  state.actions.busy = false; state.actions.error = null;
  window.history.replaceState({}, '', '/marketplace/tournament');
});

describe('Tournament page', () => {
  it('flag off → one plain line, no form', () => {
    state.enabled = false;
    wrap(<Tournament />);
    expect(screen.getByTestId('text-tournament-unavailable').textContent).toBe('The ShuttleIQ League is not open right now.');
    expect(screen.queryByTestId('form-tournament-register')).toBeNull();
  });

  it('hidden before the open (or to non-members in the members stage) → "not open yet"', () => {
    state.view = { visible: false };
    wrap(<Tournament />);
    expect(screen.getByTestId('text-tournament-unavailable').textContent).toBe('ShuttleIQ League registration is not open yet.');
  });

  it('the event, the per-tier counter in the brand format', () => {
    wrap(<Tournament />);
    expect(screen.getByTestId('text-tournament-event').textContent).toBe('Sat 17 Oct, 6:00 pm to 10:00 pm · Baseline Sports Academy DIP');
    const lines = screen.getAllByTestId(/^text-tier-count-/).map((n) => n.textContent);
    expect(lines).toEqual([
      'Professional · 6 of 6 filled · waitlist open',
      'Competitive · 12 of 18 filled',
      'Intermediate · 3 of 18 filled',
      'Beginner · 6 of 6 filled · waitlist full',
    ]);
  });

  it('signed out → "Sign in to register", back to this page', () => {
    state.auth = { isAuthenticated: false, user: null };
    state.entry = undefined;
    wrap(<Tournament />);
    const a = screen.getByTestId('link-tournament-sign-in') as HTMLAnchorElement;
    expect(a.textContent).toBe('Sign in to register');
    expect(a.getAttribute('href')).toBe('/marketplace/login?from=%2Fmarketplace%2Ftournament');
  });

  it('no linked player → finish the profile first', () => {
    state.entry = entry({ eligibleTier: null, canRegister: false, reason: 'link_player_first' });
    wrap(<Tournament />);
    expect(screen.getByTestId('link-tournament-complete-profile').getAttribute('href')).toBe('/marketplace/complete-profile');
  });

  it('the form: tier, T-shirt size, company, share tick, THEN the sponsorship card, then pay; the body reaches register', async () => {
    wrap(<Tournament />);
    const form = screen.getByTestId('form-tournament-register');
    expect(within(form).getByTestId('text-your-tier').textContent).toBe("You'll play as Competitive");
    const order = ['select-tshirt-size', 'input-company', 'checkbox-share-with-sponsors', 'card-tournament-sponsor', 'button-tournament-register']
      .map((id) => within(form).getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
    const btn = within(form).getByTestId('button-tournament-register');
    expect(btn.textContent).toBe('Pay AED 100');
    fireEvent.click(btn);
    expect(await within(form).findByTestId('text-tournament-form-error')).toHaveProperty('textContent', 'Choose a T-shirt size.');
    expect(state.actions.register).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByTestId('select-tshirt-size'), { target: { value: 'L' } });
    fireEvent.change(within(form).getByTestId('input-company'), { target: { value: 'Acme LLC' } });
    fireEvent.click(within(form).getByTestId('checkbox-share-with-sponsors'));
    fireEvent.click(within(form).getByTestId('checkbox-sponsor-interest'));
    fireEvent.click(btn);
    await waitFor(() => expect(state.actions.register).toHaveBeenCalledWith({ tShirtSize: 'L', company: 'Acme LLC', shareWithSponsors: true, sponsorInterest: true }));
  });

  it('my tier on the waitlist → "Join the waitlist"; my tier full → disabled, says so', () => {
    state.view = view({ tiers: tiers({ Competitive: { held: 18, waitlisted: 0, state: 'waitlist' } }) });
    const { unmount } = wrap(<Tournament />);
    expect(screen.getByTestId('button-tournament-register').textContent).toBe('Join the waitlist');
    unmount();
    state.view = view({ tiers: tiers({ Competitive: { held: 18, waitlisted: 2, state: 'full' } }) });
    wrap(<Tournament />);
    const b = screen.getByTestId('button-tournament-register') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe('Competitive is full');
  });

  it('members stage: an early-access note for members', () => {
    state.view = view({ phase: 'members_only' });
    wrap(<Tournament />);
    expect(screen.getByTestId('text-tournament-early-access').textContent).toBe('Early access for IQ Pass members. Registration opens to everyone at 6:00 pm on Fri 25 Sept.');
  });

  it('closed → the close time, no form', () => {
    state.view = view({ phase: 'closed', canRegister: false });
    state.entry = entry({ canRegister: false });
    wrap(<Tournament />);
    expect(screen.getByTestId('text-tournament-closed').textContent).toBe('Registration closed on Thu 8 Oct 23:59.');
    expect(screen.queryByTestId('form-tournament-register')).toBeNull();
  });

  it('with an entry: its status, Pay for a hold, and the sponsorship card with the saved tick', () => {
    state.entry = entry({ registration: reg({ sponsorInterest: true }) });
    wrap(<Tournament />);
    expect(screen.queryByTestId('form-tournament-register')).toBeNull();
    const card = screen.getByTestId('card-tournament-entry');
    expect(within(card).getByTestId('text-tournament-status').textContent).toBe('Competitive · awaiting payment · pay AED 100 by 2:00 pm on Sat 26 Sept');
    fireEvent.click(within(card).getByTestId('button-tournament-pay'));
    expect(state.actions.pay).toHaveBeenCalledWith('r-1');
    expect((within(card).getByTestId('checkbox-sponsor-interest') as HTMLInputElement).checked).toBe(true);
  });

  it('?pay=<id> (the promotion email link) starts that payment once', async () => {
    state.entry = entry({ registration: reg({ promotedAt: '2026-09-26T09:00:00.000Z' }) });
    window.history.replaceState({}, '', '/marketplace/tournament?pay=r-1');
    wrap(<Tournament />);
    await waitFor(() => expect(state.actions.pay).toHaveBeenCalledWith('r-1'));
    expect(state.actions.pay).toHaveBeenCalledTimes(1);
  });
});

describe('withdraw dialog', () => {
  it('confirmed entry → Withdraw opens the dialog with the refund rule; confirming withdraws', async () => {
    state.entry = entry({ registration: reg({ status: 'confirmed', paidAt: '2026-09-25T14:10:00.000Z', holdExpiresAt: null }) });
    wrap(<Tournament />);
    fireEvent.click(screen.getByTestId('button-tournament-withdraw'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Withdraw from the ShuttleIQ League?')).toBeTruthy();
    expect(dialog.textContent).toContain('Withdraw before Thu 8 Oct 23:59 for a full refund of AED 100.');
    expect(dialog.textContent).toContain('Refunds are handled manually via Ziina within 5 working days.');
    fireEvent.click(within(dialog).getByTestId('button-confirm-withdraw'));
    await waitFor(() => expect(state.actions.withdraw).toHaveBeenCalledWith('r-1'));
  });
});

describe('sponsorship card', () => {
  it('the deck has shipped: with no override the card shows "View sponsorship deck" → the renamed PDF, new tab', () => {
    render(<TournamentSponsorCard checked={false} onChange={vi.fn()} />);
    const a = screen.getByTestId('link-sponsorship-deck') as HTMLAnchorElement;
    expect(a.textContent).toBe('View sponsorship deck');
    expect(a.getAttribute('href')).toBe('https://shuttleiq.ai/docs/shuttleiq-league-sponsorship.pdf');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('exact copy; the deck link only when the deck ships (new tab, absolute URL); the tick reports changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TournamentSponsorCard checked={false} onChange={onChange} deckAvailable={false} />);
    const card = screen.getByTestId('card-tournament-sponsor');
    expect(card.textContent).toContain('Want to sponsor a team?');
    expect(card.textContent).toContain('Team sponsor AED 1,500 · Title sponsor AED 6,000 · in-kind welcome');
    expect(within(card).queryByTestId('link-sponsorship-deck')).toBeNull();
    fireEvent.click(within(card).getByTestId('checkbox-sponsor-interest'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(within(card).getByText('My company may sponsor a team')).toBeTruthy();
    rerender(<TournamentSponsorCard checked onChange={onChange} deckAvailable />);
    const a = screen.getByTestId('link-sponsorship-deck') as HTMLAnchorElement;
    expect(a.textContent).toBe('View sponsorship deck');
    expect(a.getAttribute('href')).toBe('https://shuttleiq.ai/docs/shuttleiq-league-sponsorship.pdf');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('banner, pinned row, My games entry — render nothing unless visible', () => {
  it('banner: null when off or hidden; with the event, the counter and the link when visible', () => {
    state.enabled = false;
    const off = wrap(<TournamentBanner variant="dashboard" />);
    expect(off.container.innerHTML).toBe('');
    off.unmount();
    state.enabled = true; state.view = { visible: false };
    const hidden = wrap(<TournamentBanner variant="home" />);
    expect(hidden.container.innerHTML).toBe('');
    hidden.unmount();
    state.view = view();
    wrap(<TournamentBanner variant="dashboard" />);
    const b = screen.getByTestId('banner-tournament');
    // Redesigned 2026-09-24 (navy card, tier tiles): full coverage in tests/tournament-banner.test.tsx.
    expect(b.textContent).toContain('ShuttleIQ League');
    expect(b.textContent).toContain('TOURNAMENT · REGISTRATION OPEN');
    expect(within(b).getByTestId('text-tier-count-Competitive').textContent).toBe('12 / 18');
    expect(within(b).getByTestId('link-tournament').getAttribute('href')).toBe('/marketplace/tournament');
  });

  it('pinned Sessions row', () => {
    state.view = { visible: false };
    const hidden = wrap(<TournamentSessionsRow />);
    expect(hidden.container.innerHTML).toBe('');
    hidden.unmount();
    state.view = view();
    wrap(<TournamentSessionsRow />);
    const row = screen.getByTestId('row-tournament-pinned');
    expect(row.textContent).toContain('Tournament');
    expect(row.textContent).toContain('Sat 17 Oct, 6:00 pm to 10:00 pm · Baseline Sports Academy DIP');
    expect(row.getAttribute('href')).toBe('/marketplace/tournament');
  });

  it('My games entry: null without an entry; status + Pay for a hold', () => {
    state.entry = entry();
    const none = wrap(<TournamentEntryCard />);
    expect(none.container.innerHTML).toBe('');
    none.unmount();
    state.entry = entry({ registration: reg() });
    wrap(<TournamentEntryCard />);
    const card = screen.getByTestId('card-tournament-entry');
    expect(within(card).getByTestId('text-tournament-status').textContent).toContain('awaiting payment');
    expect(within(card).getByTestId('button-tournament-pay').textContent).toBe('Pay AED 100');
  });
});

describe('checkout return', () => {
  it('success: polls the no-auth confirm and says you are in', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ confirmed: true }), { status: 200 }));
    render(<TournamentCheckoutResult mode="success" registrationId="r-1" />);
    expect(await screen.findByTestId('text-tournament-confirmed')).toHaveProperty('textContent', "You're in the ShuttleIQ League");
    expect(String(f.mock.calls[0][0])).toContain('/api/marketplace/tournament/registrations/r-1/confirm');
    f.mockRestore();
  });

  it('success but the money could not take a seat → says the refund is on its way', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ confirmed: false, error: 'registration_refund_owed' }), { status: 200 }));
    render(<TournamentCheckoutResult mode="success" registrationId="r-1" />);
    expect((await screen.findByTestId('text-tournament-refund-owed')).textContent).toContain('refund');
    f.mockRestore();
  });

  it('cancel: payment not completed, the spot stays held until the pay-by time', () => {
    render(<TournamentCheckoutResult mode="cancel" registrationId="r-1" />);
    expect(screen.getByTestId('text-tournament-cancelled').textContent).toBe('Payment not completed');
    expect(screen.getByTestId('link-tournament-back').getAttribute('href')).toBe('/marketplace/tournament');
  });
});

describe('slot tripwires — one line per page, route, nav, and IQP tokens only', () => {
  it('App route (public, static import) and the Sessions tab stays active on the page', () => {
    const app = read('client/src/App.tsx');
    expect(app).toContain("import Tournament from '@/pages/marketplace/Tournament';");
    expect(app).toMatch(/<Route path="\/marketplace\/tournament">\s*<MarketplaceRoute component=\{Tournament\} \/>\s*<\/Route>/);
    expect(app.indexOf('path="/marketplace/tournament"')).toBeLessThan(app.indexOf('<Route component={NotFound}'));
    expect(read('client/src/components/MobileBottomNav.tsx')).toContain("location.startsWith('/marketplace/tournament')");
  });

  it('home, dashboard, sessions, my games each render their self-contained piece in the agreed place', () => {
    const home = read('client/src/pages/marketplace/MarketplaceHome.tsx');
    expect(home.indexOf('<TournamentBanner variant="home" />')).toBeGreaterThan(home.indexOf('<IqPassLandingSection'));
    const dash = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(dash.indexOf('<TournamentBanner variant="dashboard" />')).toBeGreaterThan(dash.indexOf('IqPassPromoCard tiers'));
    expect(dash.indexOf('<TournamentBanner variant="dashboard" />')).toBeLessThan(dash.indexOf('{/* Getting Started'));
    const book = read('client/src/pages/marketplace/BookSessions.tsx');
    expect(book.indexOf('<TournamentSessionsRow />')).toBeGreaterThan(-1);
    expect(book.indexOf('<TournamentSessionsRow />')).toBeLessThan(book.indexOf('{/* Results */}'));
    const my = read('client/src/pages/marketplace/MyBookings.tsx');
    expect(my.indexOf('<TournamentEntryCard spacedBelow />')).toBeGreaterThan(-1);
    expect(my.indexOf('<TournamentEntryCard spacedBelow />')).toBeLessThan(my.indexOf('{isLoading ? ('));
  });

  it('checkout pages hand a registration_id return to the tournament result, the booking flow untouched', () => {
    for (const [f, mode] of [['client/src/pages/marketplace/CheckoutSuccess.tsx', 'success'], ['client/src/pages/marketplace/CheckoutCancel.tsx', 'cancel']] as const) {
      const src = read(f);
      expect(src).toContain(`<TournamentCheckoutResult mode="${mode}" registrationId={registrationId} />`);
      expect(src).toContain("get('registration_id')");
    }
  });

  it('new tournament screens use IQP tokens, never a hex literal', () => {
    const dir = 'client/src/components/marketplace';
    const files = readdirSync(join(__dirname, '..', dir)).filter((n) => n.startsWith('Tournament')).map((n) => `${dir}/${n}`);
    files.push('client/src/pages/marketplace/Tournament.tsx');
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(read(f), f).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});

describe('entry on the tournament page — no repeated event header', () => {
  it('the page shows "Your entry" instead of repeating the title and date; My games keeps them', () => {
    state.entry = entry({ registration: reg() });
    const page = wrap(<Tournament />);
    expect(document.title).toBe('ShuttleIQ League');
    const card = screen.getByTestId('card-tournament-entry');
    expect(within(card).getByTestId('text-entry-heading').textContent).toBe('Your entry');
    expect(within(card).queryByText('ShuttleIQ League')).toBeNull();
    page.unmount();
    wrap(<TournamentEntryCard />);
    const mine = screen.getByTestId('card-tournament-entry');
    expect(within(mine).getByText('ShuttleIQ League')).toBeTruthy();
  });
});
