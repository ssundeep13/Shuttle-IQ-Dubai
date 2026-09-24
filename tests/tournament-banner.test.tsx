// ShuttleIQ League — home banner / Dashboard card redesign (Sandeep, 2026-09-24): navy card, reversed
// wordmark, fee top right, four tier tiles, one action. Same data hooks as before; every state; the intro
// motion runs on the first render only and never under prefers-reduced-motion.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const state = vi.hoisted(() => ({
  enabled: true,
  view: undefined as any,
  entry: undefined as any,
  reduced: true as boolean | null,
}));
vi.mock('../client/src/hooks/useTournament', async (orig) => ({
  ...(await orig<typeof import('../client/src/hooks/useTournament')>()),
  useTournamentEnabled: () => state.enabled,
  useTournamentView: () => ({ data: state.view, isLoading: false }),
  useMyTournamentEntry: () => ({ data: state.entry, isLoading: false }),
}));
vi.mock('framer-motion', async (orig) => ({ ...(await orig<typeof import('framer-motion')>()), useReducedMotion: () => state.reduced }));

const { TournamentBanner } = await import('../client/src/components/marketplace/TournamentBanner');
const copy = await import('../client/src/lib/tournamentCopy');
const { IQP } = await import('../client/src/lib/iqPassTokens');

const T = {
  id: 't-1', name: 'ShuttleIQ League', startsAt: '2026-10-17T14:00:00.000Z', endsAt: '2026-10-17T18:00:00.000Z',
  venueName: 'BASELINE SPORTS ACADEMY DIP', venueLocation: 'Dubai Investment Park Second - Dubai', venueMapUrl: null,
  entryFeeAed: 100, registrationOpensAtMembers: '2026-09-24T12:00:00.000Z', registrationOpensAt: '2026-09-24T14:00:00.000Z',
  registrationClosesAt: '2026-10-08T20:00:00.000Z', withdrawDeadlineAt: '2026-10-08T20:00:00.000Z', draftCutoffAt: '2026-10-10T20:00:00.000Z',
  deckUrl: 'https://shuttleiq.ai/docs/shuttleiq-league-sponsorship.pdf',
};
const tier = (tier: string, cap: number, held: number, waitlisted = 0, st: 'open' | 'waitlist' | 'full' = 'open') => ({ tier, cap, held, waitlisted, waitlistCap: 2, state: st });
const openTiers = () => [tier('Professional', 6, 0), tier('Competitive', 18, 0), tier('Intermediate', 18, 9), tier('Beginner', 6, 0)];
const busyTiers = () => [tier('Professional', 6, 6, 1, 'waitlist'), tier('Competitive', 18, 12), tier('Intermediate', 18, 9), tier('Beginner', 6, 6, 2, 'full')];
const view = (over: Record<string, any> = {}) => ({ visible: true, phase: 'open', canRegister: true, tournament: T, tiers: openTiers(), ...over });
const noEntry = { tournament: T, registration: null, eligibleTier: 'Intermediate', canRegister: true };
const withEntry = { ...noEntry, registration: { id: 'r-1', tier: 'Intermediate', status: 'confirmed' }, canRegister: false };

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={client()}>{ui}</QueryClientProvider>);
const card = () => screen.getByTestId('banner-tournament');
const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  state.enabled = true; state.view = view(); state.entry = undefined; state.reduced = true;
});

describe('copy helpers', () => {
  it('meta line, fee line, foot line, opening label', () => {
    expect(copy.bannerMetaLine(T)).toBe('Sat 17 Oct · 6–10 pm · Baseline DIP');
    expect(copy.BANNER_FEE_SUB).toBe('entry · 6 games guaranteed');
    expect(copy.bannerFootLine({ phase: 'open', tournament: T } as any)).toBe('Closes Thu 8 Oct · your tier is locked at registration');
    expect(copy.bannerFootLine({ phase: 'closed', tournament: T } as any)).toBe('Registration closed Thu 8 Oct');
    expect(copy.opensLabel('2026-09-25T14:00:00.000Z')).toBe('FRI 6:00 PM');
  });

  it('tile text: count, full with waitlist, full', () => {
    expect(copy.tierTile(tier('Intermediate', 18, 1))).toEqual({ kind: 'count', filled: 1, cap: 18 });
    expect(copy.tierTile(tier('Professional', 6, 6, 1, 'waitlist'))).toEqual({ kind: 'waitlist', text: 'Full · waitlist 1/2' });
    expect(copy.tierTile(tier('Beginner', 6, 6, 2, 'full'))).toEqual({ kind: 'full', text: 'Full' });
  });
});

describe('banner — hidden unless visible (same hooks as before)', () => {
  it('renders nothing while the flag is off or the viewer cannot see the event', () => {
    state.enabled = false;
    const off = wrap(<TournamentBanner variant="dashboard" />);
    expect(off.container.innerHTML).toBe('');
    off.unmount();
    state.enabled = true; state.view = { visible: false };
    const hidden = wrap(<TournamentBanner variant="home" />);
    expect(hidden.container.innerHTML).toBe('');
  });
});

describe('banner — open', () => {
  it('navy card, overline, reversed wordmark, meta, fee, four tiles, foot line, one Register button', () => {
    wrap(<TournamentBanner variant="dashboard" />);
    const c = card();
    expect(c.style.background).toBe('rgb(0, 62, 140)');
    expect(c.style.borderRadius).toBe('9px');
    expect(c.style.boxShadow).toBe('');
    expect(text('text-banner-overline')).toBe('TOURNAMENT · REGISTRATION OPEN');
    expect(text('text-banner-title')).toBe('ShuttleIQ League');
    expect(text('text-banner-title-iq')).toBe('IQ');
    expect(text('text-banner-meta')).toBe('Sat 17 Oct · 6–10 pm · Baseline DIP');
    expect(text('text-banner-fee')).toBe('AED 100');
    expect(text('text-banner-fee-sub')).toBe('entry · 6 games guaranteed');
    const tiles = within(c).getAllByTestId(/^tile-tier-/);
    expect(tiles.map((el) => el.getAttribute('data-testid'))).toEqual(['tile-tier-Professional', 'tile-tier-Competitive', 'tile-tier-Intermediate', 'tile-tier-Beginner']);
    expect(text('text-tier-count-Intermediate')).toBe('9 / 18');
    expect(text('text-tier-count-Professional')).toBe('0 / 6');
    expect(text('text-banner-foot')).toBe('Closes Thu 8 Oct · your tier is locked at registration');
    const links = within(c).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(within(c).queryAllByRole('button')).toHaveLength(0);
    expect(links[0].textContent).toBe('Register');
    expect(links[0].getAttribute('href')).toBe('/marketplace/tournament');
  });

  it('the fill bar is filled/cap', () => {
    wrap(<TournamentBanner variant="dashboard" />);
    expect((screen.getByTestId('bar-tier-Intermediate') as HTMLElement).style.width).toBe('50%');
    expect((screen.getByTestId('bar-tier-Professional') as HTMLElement).style.width).toBe('0%');
  });

  it('home variant renders the same card inside the home section', () => {
    wrap(<TournamentBanner variant="home" />);
    expect(within(screen.getByTestId('section-tournament')).getByTestId('banner-tournament')).toBeTruthy();
  });
});

describe('banner — full tiers', () => {
  it('full with waitlist open → amber "Full · waitlist n/2"; waitlist full → "Full"; no count on either', () => {
    state.view = view({ tiers: busyTiers() });
    wrap(<TournamentBanner variant="dashboard" />);
    const pro = screen.getByTestId('text-tier-status-Professional');
    expect(pro.textContent).toBe('Full · waitlist 1/2');
    expect(pro.style.color).toBe('rgb(242, 184, 75)');
    expect(screen.queryByTestId('text-tier-count-Professional')).toBeNull();
    expect(text('text-tier-status-Beginner')).toBe('Full');
    expect(screen.queryByTestId('text-tier-count-Beginner')).toBeNull();
    expect(text('text-tier-count-Competitive')).toBe('12 / 18');
  });
});

describe('banner — other states and the one action', () => {
  it('early access (members stage, can register): its overline, Register', () => {
    state.view = view({ phase: 'members_only', canRegister: true });
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-banner-overline')).toBe('TOURNAMENT · IQ PASS EARLY ACCESS');
    expect(text('link-tournament')).toBe('Register');
  });

  it('before the members open: the opening time from the DB, See details', () => {
    state.view = view({ phase: 'before_open', canRegister: true });
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-banner-overline')).toBe('TOURNAMENT · OPENS THU 4:00 PM');
    expect(text('link-tournament')).toBe('See details');
    expect(screen.getByTestId('link-tournament').getAttribute('href')).toBe('/marketplace/tournament');
  });

  it('before the public open (members stage, cannot register): the public opening time, See details', () => {
    state.view = view({ phase: 'members_only', canRegister: false });
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-banner-overline')).toBe('TOURNAMENT · OPENS THU 6:00 PM');
    expect(text('link-tournament')).toBe('See details');
  });

  it('closed: its overline, See details, the closed foot line', () => {
    state.view = view({ phase: 'closed', canRegister: false });
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-banner-overline')).toBe('TOURNAMENT · REGISTRATION CLOSED');
    expect(text('link-tournament')).toBe('See details');
    expect(text('text-banner-foot')).toBe('Registration closed Thu 8 Oct');
  });

  it('a player with an entry: "Your entry" → My games, in any phase; no entry → Register', () => {
    state.entry = noEntry;
    const a = wrap(<TournamentBanner variant="dashboard" />);
    expect(text('link-tournament')).toBe('Register');
    a.unmount();
    state.entry = withEntry;
    const b = wrap(<TournamentBanner variant="dashboard" />);
    expect(text('link-tournament')).toBe('Your entry');
    expect(screen.getByTestId('link-tournament').getAttribute('href')).toBe('/marketplace/my-bookings');
    b.unmount();
    state.view = view({ phase: 'closed', canRegister: false });
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('link-tournament')).toBe('Your entry');
  });
});

describe('banner — motion', () => {
  it('prefers-reduced-motion: final counts and bar widths on the very first render, no fade', () => {
    state.reduced = true;
    wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-tier-count-Intermediate')).toBe('9 / 18');
    expect((screen.getByTestId('bar-tier-Intermediate') as HTMLElement).style.width).toBe('50%');
    expect(card().style.opacity).not.toBe('0');
  });

  it('first render only: counts tick up from 0, then a poll refresh shows the new value at once', async () => {
    state.reduced = false;
    const r = wrap(<TournamentBanner variant="dashboard" />);
    expect(text('text-tier-count-Intermediate')).toBe('0 / 18');
    await waitFor(() => expect(text('text-tier-count-Intermediate')).toBe('9 / 18'), { timeout: 3000 });
    // A real poll refresh lands >= 30 s later; wait out the 600 ms intro window before refreshing.
    await act(async () => { await new Promise((res) => setTimeout(res, 900)); });
    state.view = view({ tiers: [tier('Professional', 6, 0), tier('Competitive', 18, 0), tier('Intermediate', 18, 10), tier('Beginner', 6, 0)] });
    await act(async () => { r.rerender(<QueryClientProvider client={client()}><TournamentBanner variant="dashboard" /></QueryClientProvider>); });
    expect(text('text-tier-count-Intermediate')).toBe('10 / 18');
  });
});

describe('tokens', () => {
  it('the two new colours live in IQP (teal on navy, amber), never inline', () => {
    expect(IQP.tealOnNavy).toBe('#5DCAA5');
    expect(IQP.amber).toBe('#F2B84B');
  });
});
