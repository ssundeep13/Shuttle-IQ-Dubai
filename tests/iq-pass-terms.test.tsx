// IQ Pass terms page (/iq-pass/terms) — verbatim clauses, brand tokens, flag-gated like the
// purchase page, and linked from the purchase review screen right under the Pay button.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const { default: IqPassTerms } = await import('../client/src/pages/marketplace/IqPassTerms');
const { default: IqPass } = await import('../client/src/pages/marketplace/IqPass');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

// Sandeep, 2026-09-14 — verbatim. Any edit here must be a product decision.
const CLAUSES = [
  'An IQ Pass is a prepaid pack of 4, 8 or 12 session seats (Club, Club Plus, Club Elite), paid once via Ziina.',
  'All sessions are chosen at purchase from the next 4 weeks. Seats are held for 30 minutes until payment completes.',
  "Pass seats are limited to half of each session's capacity.",
  'You may move any pass seat to another eligible session, as many times as you like, up to 5 hours before the session you are moving from. Moves are made in the app.',
  'Pass seats cannot be cancelled and are non-refundable. Unused seats expire at the end of the pass.',
  'If ShuttleIQ cancels a session, you receive a free re-pick for that seat, usable while the pass is active.',
  "One active IQ Pass per player. A next pass can be bought at any time; its 4-week window starts the day after your current pass's last session.",
  'Guests may be added to a pass seat at the standard drop-in price.',
  'Club Elite includes one ShuttleIQ jersey on your first Club Elite purchase, in the size chosen at checkout.',
  'ShuttleIQ may change pass prices and tiers for future purchases; an active pass is not affected.',
  'These terms sit alongside the general ShuttleIQ terms and code of conduct.',
];

describe('IqPassTerms page', () => {
  beforeEach(() => { flagMock.enabled = true; });

  it('flag on: the heading and the eleven clauses, verbatim and in order, as a numbered list', () => {
    mount(<IqPassTerms />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('IQ Pass Terms');
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(11);
    items.forEach((li, i) => expect(li.textContent).toBe(CLAUSES[i]));
    const back = screen.getByTestId('link-iq-pass-back') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/marketplace/iq-pass');
  });

  it('flag off: the same "not available" notice as the purchase page, no clauses', () => {
    flagMock.enabled = false;
    mount(<IqPassTerms />);
    expect(screen.getByTestId('text-iq-pass-unavailable')).toBeTruthy();
    expect(screen.queryAllByRole('listitem').length).toBe(0);
  });

  it('brand: IQ Pass tokens only, Inter via the token font, no drifted hex, no emoji, no savings copy', () => {
    const src = read('client/src/pages/marketplace/IqPassTerms.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).toMatch(/IQP_FONT/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/per game|saving/i);
    expect(src).toMatch(/usePageTitle\('IQ Pass Terms'\)/);
    expect(src).toMatch(/useIqPassEnabled\(\)/);
  });
});

describe('route + review-screen link', () => {
  it('App.tsx routes /iq-pass/terms to the page through the public marketplace wrapper', () => {
    const src = read('client/src/App.tsx').replace(/\r\n/g, '\n');
    expect(src).toMatch(/import IqPassTerms from '@\/pages\/marketplace\/IqPassTerms';/);
    expect(src).toMatch(/<Route path="\/iq-pass\/terms">\s*<MarketplaceRoute component=\{IqPassTerms\} \/>\s*<\/Route>/);
  });

  it('the purchase review screen links "IQ Pass terms" to /iq-pass/terms, in the same block as the Pay button', async () => {
    const sessions = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, title: 'Smash Session', venueName: 'Smash Sports Academy', venueLocation: null,
      dateDubai: `2026-09-${String(15 + i).padStart(2, '0')}`, startTime: '20:00', endTime: '22:00', status: 'upcoming', linked: true,
      capacity: 24, priceAed: 49, spotsRemaining: 10, packSeats: 0, packSeatsLeft: 12, alreadyBooked: false,
    }));
    const tiers = { club: { label: 'Club', games: 4, priceAed: 188 }, club_plus: { label: 'Club Plus', games: 8, priceAed: 360 }, club_elite: { label: 'Club Elite', games: 12, priceAed: 516 } };
    const handlers: Record<string, () => unknown> = {
      '/api/marketplace/iq-pass/me': () => ({ packs: [] }),
      '/api/marketplace/iq-pass/calendar': () => ({ window: { start: '2026-09-14', end: '2026-10-11' }, currentPass: null, jerseyEligibleForElite: true, tiers, sessions }),
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      return key ? { ok: true, status: 200, json: async () => handlers[key]() } : { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    }));
    try {
      mount(<IqPass />);
      fireEvent.click(await screen.findByTestId('card-tier-club'));
      for (const id of ['s0', 's1', 's2', 's3']) fireEvent.click(await screen.findByTestId(`row-session-${id}`));
      fireEvent.click(screen.getByTestId('button-continue'));
      await screen.findByTestId('text-review-title');
      const link = screen.getByTestId('link-iq-pass-terms') as HTMLAnchorElement;
      expect(link.textContent).toBe('IQ Pass terms');
      expect(link.getAttribute('href')).toBe('/iq-pass/terms');
      const pay = screen.getByTestId('button-pay');
      expect(link.closest('div')!.contains(pay)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
