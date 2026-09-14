// IQ Pass Gate 12 — promote IQ Pass. The public config carries the tier table (prices stay
// server-owned); the Dashboard shows the promo card (no active pass) or the progress line
// (active pass) near the top; the landing page gets a full-width IQ Pass section below the
// hero with three tier cards and one CTA (sign-in first when logged out). Both flag-gated.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import express from 'express';
import type { Server } from 'http';

vi.mock('../client/src/lib/nativeAuth', () => ({ openCheckoutRedirect: vi.fn(), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));

// routes.ts pulls in the auth middleware and the DB module, which refuse to load without these
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET ??= 'test-main-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
const { iqPassConfigHandler } = await import('../server/iqPass/routes');
const { IqPassPromoCard, IqPassProgressLine, IqPassLandingSection, IQ_PASS_PERKS } = await import('../client/src/components/marketplace/IqPassPromo');
const { IQP } = await import('../client/src/lib/iqPassTokens');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const tiers = [
  { tier: 'club', label: 'Club', games: 4, priceAed: 188 },
  { tier: 'club_plus', label: 'Club Plus', games: 8, priceAed: 360 },
  { tier: 'club_elite', label: 'Club Elite', games: 12, priceAed: 516 },
] as const;

describe('GET /api/marketplace/config carries the public tier table', () => {
  let server: Server; let base = ''; let prev: string | undefined;
  beforeAll(async () => {
    prev = process.env.IQ_PASS_ENABLED; process.env.IQ_PASS_ENABLED = 'true';
    const app = express(); app.get('/api/marketplace/config', iqPassConfigHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it('flag on → { iqPassEnabled: true, iqPassTiers: [club 4/188, club_plus 8/360, club_elite 12/516] } — labels, games and pass prices only', async () => {
    const res = await fetch(`${base}/api/marketplace/config`);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.iqPassEnabled).toBe(true);
    expect(j.iqPassTiers).toEqual(tiers.map((t) => ({ ...t })));
    expect(JSON.stringify(j)).not.toMatch(/allocation|4[357]\b/);
  });
  it('flag off → 404 like any unknown /api path', async () => {
    process.env.IQ_PASS_ENABLED = 'false';
    const res = await fetch(`${base}/api/marketplace/config`);
    expect(res.status).toBe(404);
    process.env.IQ_PASS_ENABLED = 'true';
  });
});

describe('IqPassPromoCard (Dashboard, no active pass)', () => {
  it('headline, sub, the three tiers with prices on one line, navy "Get your IQ Pass" button', () => {
    render(<IqPassPromoCard tiers={[...tiers]} href="/marketplace/iq-pass" />);
    const card = screen.getByTestId('card-iq-pass-promo');
    expect(within(card).getByRole('heading').textContent).toBe('Pick your month.');
    expect(within(card).getByTestId('text-iq-pass-promo-sub').textContent).toBe('4, 8 or 12 games. Seats locked.');
    expect(within(card).getByTestId('text-iq-pass-tier-line').textContent).toBe('Club AED 188 · Club Plus AED 360 · Club Elite AED 516');
    const btn = within(card).getByTestId('button-get-iq-pass') as HTMLAnchorElement;
    expect(btn.textContent).toBe('Get your IQ Pass'); expect(btn.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(btn.style.backgroundColor).toBe(rgb(IQP.navy)); expect(btn.style.color).toBe(rgb(IQP.white));
    expect(card.textContent).not.toMatch(/per game|saving|save/i);
  });
});

describe('IqPassProgressLine (Dashboard with an active pass; My games hero)', () => {
  it('"Club · 1 of 4 played" with a teal bar at 25%, linking to the pass page', () => {
    render(<IqPassProgressLine label="Club" played={1} total={4} href="/marketplace/iq-pass" />);
    const line = screen.getByTestId('line-iq-pass-progress') as HTMLAnchorElement;
    expect(line.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(within(line).getByTestId('text-iq-pass-progress').textContent).toBe('Club · 1 of 4 played');
    const bar = within(line).getByTestId('bar-iq-pass-progress') as HTMLElement;
    expect(bar.style.width).toBe('25%'); expect(bar.style.backgroundColor).toBe(rgb(IQP.teal));
  });
});

describe('IqPassLandingSection (landing page, below the hero)', () => {
  it('headline, sub, three tier cards (games, price, one-line perk), one CTA; logged-out CTA goes through sign-in', () => {
    render(<IqPassLandingSection tiers={[...tiers]} href="/marketplace/login?from=%2Fmarketplace%2Fiq-pass" />);
    const sec = screen.getByTestId('section-iq-pass');
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('Pick your month.');
    expect(within(sec).getByTestId('text-landing-iq-pass-sub').textContent).toBe('4, 8 or 12 games. Seats locked.');
    for (const t of tiers) {
      const card = within(sec).getByTestId(`card-landing-tier-${t.tier}`);
      expect(card.textContent).toMatch(new RegExp(t.label)); expect(card.textContent).toMatch(new RegExp(`${t.games} games`)); expect(card.textContent).toMatch(new RegExp(`AED ${t.priceAed}`));
      expect(within(card).getByTestId(`text-perk-${t.tier}`).textContent).toBe(IQ_PASS_PERKS[t.tier]);
    }
    expect(IQ_PASS_PERKS.club).toBe('Pick any venue');
    expect(IQ_PASS_PERKS.club_plus).toBe('Priority waitlist and first access to new venues');
    expect(IQ_PASS_PERKS.club_elite).toBe('Everything, plus your ShuttleIQ jersey');
    const ctas = within(sec).getAllByRole('link').filter((a) => a.textContent === 'Get your IQ Pass');
    expect(ctas.length).toBe(1);
    expect(ctas[0].getAttribute('href')).toBe('/marketplace/login?from=%2Fmarketplace%2Fiq-pass');
    expect(within(sec).getByTestId('link-landing-terms').getAttribute('href')).toBe('/iq-pass/terms');
    expect(sec.textContent).not.toMatch(/per game|saving|save/i);
  });
});

describe('source pins — wiring, gating, brand', () => {
  it('useIqPass exposes the config with tiers; the flag hook still answers from the same query', () => {
    const src = read('client/src/hooks/useIqPass.ts');
    expect(src).toMatch(/export function useIqPassConfig\(\)/);
    expect(src).toMatch(/iqPassTiers/);
    expect(src).toMatch(/export function useIqPassEnabled\(\): boolean/);
  });
  it('Dashboard: promo card or progress line right under the greeting, before Getting Started, only while the flag is on', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(src).toMatch(/from '@\/components\/marketplace\/IqPassPromo'/);
    expect(src).toMatch(/useIqPassConfig\(\)/);
    const greeting = src.indexOf('data-testid="text-dashboard-greeting"');
    const promo = src.indexOf('<IqPassPromoCard');
    const line = src.indexOf('<IqPassProgressLine');
    const started = src.indexOf('<GettingStartedCard');
    expect(greeting).toBeGreaterThan(0); expect(promo).toBeGreaterThan(greeting); expect(line).toBeGreaterThan(greeting);
    expect(promo).toBeLessThan(started); expect(line).toBeLessThan(started);
    expect(src).toMatch(/user\?\.iqPass\s*\?\s*\(?\s*<IqPassProgressLine/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
  it('"played" comes from the server summary (seats whose session has ended), the same definition My games uses — never total minus remaining', () => {
    const dash = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(dash).toMatch(/played=\{user\.iqPass\.gamesPlayed\}/);
    expect(dash).not.toMatch(/gamesTotal - user\.iqPass\.gamesRemaining/);
    const store = read('server/iqPass/store.ts');
    expect(store).toMatch(/gamesPlayed: number;/);
    expect(store).toMatch(/gamesPlayed: played/);
    expect(store).toMatch(/const played = seats\.filter\(\(s\) => \(s\.status === 'confirmed' \|\| s\.status === 'attended'\) && sessionStartEpochMs\(s\.session\.date, s\.session\.endTime \|\| '23:59'\) < now\.getTime\(\)\)\.length;/);
    expect(read('client/src/contexts/MarketplaceAuthContext.tsx')).toMatch(/gamesPlayed: number;/);
  });
  it('Landing: the IQ Pass section sits right after the hero and before the referral promo; CTA is sign-in first when logged out', () => {
    const src = read('client/src/pages/marketplace/MarketplaceHome.tsx');
    expect(src).toMatch(/from '@\/components\/marketplace\/IqPassPromo'/);
    const hero = src.indexOf('<HeroLivePanel />');
    const section = src.indexOf('<IqPassLandingSection');
    const referral = src.indexOf('REFERRAL PROMO');
    expect(hero).toBeGreaterThan(0); expect(section).toBeGreaterThan(hero); expect(section).toBeLessThan(referral);
    expect(src).toMatch(/isAuthenticated \? '\/marketplace\/iq-pass' : '\/marketplace\/login\?from=%2Fmarketplace%2Fiq-pass'/);
  });
  it('the promo module is IQ Pass tokens only: Inter, no hex, no emoji, no icons, no ramps, no savings copy', () => {
    const src = read('client/src/components/marketplace/IqPassPromo.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).toMatch(/IQP_FONT/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/lucide-react|gradient/i);
    expect(src).not.toMatch(/per game|saving/i);
  });
});
