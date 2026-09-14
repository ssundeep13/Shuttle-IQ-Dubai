// IQ Pass Gate 5 — the Club / Club Plus / Club Elite tag on Profile, Who's
// Playing, the Play screens and Rankings (ruling E5a: Rankings reads an overlay
// endpoint, the 7-key public projection is untouched). Component + hook
// rendered in jsdom; the four surfaces and the three server payloads pinned at
// source; every new key is emitted only under the flag.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import React from 'react';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { IqPassTag } = await import('../client/src/components/marketplace/IqPassTag');
const { useIqPassEnabled, useIqPassTiers } = await import('../client/src/hooks/useIqPass');
const { IQ_PASS_TIER_LABELS, PACK_TIER_ORDER, highestTier } = await import('../shared/iqPassTiers');
const { IQP } = await import('../client/src/lib/iqPassTokens');
const { createIqPassRouter } = await import('../server/iqPass/routes');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('shared tier labels', () => {
  it('three tiers, brief labels, highestTier picks by order', () => {
    expect(PACK_TIER_ORDER).toEqual(['club', 'club_plus', 'club_elite']);
    expect(IQ_PASS_TIER_LABELS).toEqual({ club: 'Club', club_plus: 'Club Plus', club_elite: 'Club Elite' });
    expect(highestTier(['club', 'club_elite', 'club_plus'])).toBe('club_elite');
    expect(highestTier(['club'])).toBe('club');
    expect(highestTier([])).toBeNull();
    expect(highestTier(['gold' as any])).toBeNull();
  });
});

describe('IqPassTag', () => {
  it('renders the tier label with the IQ Pass brand tokens, no emoji, no price', () => {
    render(<IqPassTag tier="club_plus" testid="tag-x" />);
    const el = screen.getByTestId('tag-x');
    expect(el.textContent).toBe('Club Plus');
    expect(el.style.color).toBe('rgb(0, 107, 95)');          // IQP.teal #006B5F
    expect(el.style.backgroundColor).toBe('rgb(245, 239, 224)'); // IQP.cream #F5EFE0
    expect(el.style.whiteSpace).toBe('nowrap');
    expect(el.textContent).not.toMatch(/AED|\d/);
  });
  it('small variant shrinks the type; unknown or missing tier renders nothing', () => {
    const { container } = render(<><IqPassTag tier="club" small testid="s" /><IqPassTag tier={null} testid="n" /><IqPassTag tier="gold" testid="g" /></>);
    expect(screen.getByTestId('s').style.fontSize).toBe('10px');
    expect(screen.queryByTestId('n')).toBeNull();
    expect(screen.queryByTestId('g')).toBeNull();
    expect(container.textContent).toBe('Club');
  });
  it('never inlines a hex literal — colours come from IQP', () => {
    const src = read('client/src/components/marketplace/IqPassTag.tsx');
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src.includes("from '@/lib/iqPassTokens'") || src.includes('from "@/lib/iqPassTokens"')).toBe(true);
    expect(IQP.teal).toBe('#006B5F');
  });
});

describe('useIqPassEnabled / useIqPassTiers', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  const Probe = () => {
    const on = useIqPassEnabled();
    const tiers = useIqPassTiers();
    return <div data-testid="probe">{on ? 'on' : 'off'}|{Object.keys(tiers).length}</div>;
  };
  const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Probe /></QueryClientProvider>);

  it('flag off (config 404) → off, and the tiers overlay is never requested', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId('probe').textContent).toBe('off|0');
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('/api/marketplace/config'))).toBe(true);
  });

  it('flag on → on, tiers map loaded from /api/marketplace/iq-pass/tiers', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/marketplace/config')) return { ok: true, status: 200, json: async () => ({ iqPassEnabled: true }) };
      if (String(url).includes('/api/marketplace/iq-pass/tiers')) return { ok: true, status: 200, json: async () => ({ 'p-1': 'club_elite', 'p-2': 'club' }) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    mount();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('on|2'));
  });
});

describe('server payloads carry the tier only under the flag (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');
  const me = routes.slice(routes.indexOf('app.get("/api/marketplace/auth/me"'), routes.indexOf('app.get("/api/marketplace/auth/me"') + 4000);
  const players = routes.slice(routes.indexOf('app.get("/api/marketplace/sessions/:id/players"'), routes.indexOf('app.get("/api/marketplace/sessions/:id/bookings"'));
  const suggestion = routes.slice(routes.indexOf('badgeByPlayerId = await getActiveBadgesForPlayers(playerIds)'), routes.indexOf('foundingMember: foundingSeals.has(p.playerId)') + 200);

  it('/auth/me: iqPass key present only when isIqPassEnabled() (absent, not null, while off)', () => {
    expect(me.includes('...(isIqPassEnabled() ? { iqPass } : {})')).toBe(true);
    expect(me.includes('getActiveTierForUser(user.id)')).toBe(true);
  });
  it('/sessions/:id/players: iqPassTier batched by linked player id under the flag, inside a guard', () => {
    expect(players.includes('if (isIqPassEnabled())')).toBe(true);
    expect(players.includes('getActiveTierByPlayerIds(')).toBe(true);
    expect(players.includes('entry.iqPassTier =')).toBe(true);
  });
  it('current-suggestion: iqPassTier per player under the flag; the BadgeTag/founding lines untouched', () => {
    expect(suggestion.includes('isIqPassEnabled()')).toBe(true);
    expect(suggestion.includes('iqPassTier: iqPassTiers.get(p.playerId) ?? null')).toBe(true);
    expect(suggestion.includes('foundingMember: foundingSeals.has(p.playerId)')).toBe(true);
  });
  it('the public 7-key projection is untouched (ruling E5a)', () => {
    const pr = read('server/playerRoutes.ts');
    expect(pr.includes('export const PUBLIC_PLAYER_KEYS = ["id", "name", "shuttleIqId", "level", "skillScore", "gamesPlayed", "wins"] as const;')).toBe(true);
  });
});

describe('GET /api/marketplace/iq-pass/tiers — public overlay (no auth), 404 while off', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  const tiers = { getActiveTiersPublic: vi.fn().mockResolvedValue({ 'p-1': 'club_plus' }) };
  beforeAll(async () => {
    const app = express();
    app.use(createIqPassRouter({ purchase: {} as any, confirm: {} as any, tiers }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it('off → 404; on → 200 map, no-store', async () => {
    delete process.env.IQ_PASS_ENABLED;
    expect((await fetch(`${base}/api/marketplace/iq-pass/tiers`)).status).toBe(404);
    process.env.IQ_PASS_ENABLED = 'true';
    const res = await fetch(`${base}/api/marketplace/iq-pass/tiers`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ 'p-1': 'club_plus' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the four surfaces render the tag (tripwires)', () => {
  const files = {
    rankings: read('client/src/pages/marketplace/Rankings.tsx'),
    session: read('client/src/pages/marketplace/SessionDetails.tsx'),
    play: read('client/src/pages/marketplace/Play.tsx'),
    playing: read('client/src/pages/marketplace/PlayingScreen.tsx'),
    profile: read('client/src/pages/marketplace/Profile.tsx'),
    scores: read('client/src/pages/marketplace/MyScores.tsx'),
  };
  it('every surface imports IqPassTag', () => {
    for (const [k, src] of Object.entries(files)) expect(src.includes("from '@/components/marketplace/IqPassTag'"), k).toBe(true);
  });
  it('Rankings reads the overlay map (useIqPassTiers) and renders the tag beside the tier badge in both the podium and the list', () => {
    expect(files.rankings.includes('useIqPassTiers()')).toBe(true);
    expect((files.rankings.match(/<IqPassTag tier=\{iqPassTiers\[entry\.player\.id\]\}/g) ?? []).length).toBe(2);
  });
  it("Who's Playing renders the tag from the players payload", () => {
    expect(files.session.includes('iqPassTier?: string | null;')).toBe(true);
    expect(files.session.includes('<IqPassTag tier={player.iqPassTier}')).toBe(true);
  });
  it('Play + PlayingScreen render the tag after the BadgeTag line, which stays byte-identical', () => {
    for (const k of ['play', 'playing'] as const) {
      const src = files[k];
      expect(src.includes('<BadgeTag badge={p.badge} small testid={`tag-badge-${p.playerId}`} />'), k).toBe(true);
      expect(src.includes('<IqPassTag tier={p.iqPassTier} small testid={`tag-iqpass-${p.playerId}`} />'), k).toBe(true);
      expect(src.indexOf('<IqPassTag tier={p.iqPassTier}'), k).toBeGreaterThan(src.indexOf('<BadgeTag badge={p.badge} small'));
      expect(src.includes('iqPassTier?: string | null;'), k).toBe(true);
    }
  });
  it('Profile: tag in the name row + an IQ Pass card linking to /marketplace/iq-pass; MyScores: tag in the SIQ row', () => {
    expect(files.profile.includes('<IqPassTag tier={user?.iqPass?.tier} testid="tag-profile-iqpass" />')).toBe(true);
    expect(files.profile.includes('data-testid="card-iq-pass"')).toBe(true);
    expect(files.profile.includes('href="/marketplace/iq-pass"')).toBe(true);
    expect(files.scores.includes('<IqPassTag tier={user?.iqPass?.tier} small testid="tag-scores-iqpass" />')).toBe(true);
    const ctx = read('client/src/contexts/MarketplaceAuthContext.tsx');
    expect(ctx.includes('iqPass?: {')).toBe(true);
  });
  it('no new hex literal in the touched marketplace files beyond what they already had (IQP only)', () => {
    for (const k of ['play', 'playing', 'session'] as const) {
      expect(files[k]).not.toMatch(/#003E8C|#F5EFE0/);
    }
  });
});
