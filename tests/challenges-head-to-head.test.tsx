// Player Challenges — Gate C4.1: head-to-head panel replaces the Challenge button.
//
// Pure aggregation (server/headToHead.ts) and copy (shared/utils/headToHeadCopy.ts)
// are unit-tested; the SQL loader is checked against a fake db handle; the
// panel and the restyled ChallengeButton render for real in jsdom; the page
// wiring (below the navy card, above Community Personality, old button gone)
// and the route registration are pinned at source.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HeadToHeadPanel } from '../client/src/components/HeadToHeadPanel';
import { ChallengeButton } from '../client/src/components/ChallengeButton';
import { recordLine, scoreLine } from '../shared/utils/headToHeadCopy';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { aggregateHeadToHead, loadHeadToHeadRows, headToHeadView } = await import('../server/headToHead');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

type Row = Parameters<typeof aggregateHeadToHead>[0][number];
const row = (over: Partial<Row>): Row => ({
  gameId: 'g', myTeam: 1, theirTeam: 2, winningTeam: 1, team1Score: 21, team2Score: 15, playedAt: '2026-09-01T10:00:00.000Z', isSandbox: false, ...over,
});

describe('aggregateHeadToHead — pure', () => {
  it('counts only games where the two players were on opposite teams; same-team games are excluded', () => {
    const out = aggregateHeadToHead([
      row({ gameId: 'g1', myTeam: 1, theirTeam: 2, winningTeam: 1 }),          // I won
      row({ gameId: 'g2', myTeam: 2, theirTeam: 1, winningTeam: 1 }),          // they won
      row({ gameId: 'g3', myTeam: 1, theirTeam: 1, winningTeam: 1 }),          // partners — excluded
      row({ gameId: 'g4', myTeam: 2, theirTeam: 2, winningTeam: 2 }),          // partners — excluded
    ]);
    expect(out.met).toBe(2);
    expect(out.myWins).toBe(1);
    expect(out.theirWins).toBe(1);
  });

  it('excludes sandbox games even if the loader let one through', () => {
    const out = aggregateHeadToHead([
      row({ gameId: 'g1', isSandbox: true }),
      row({ gameId: 'g2', isSandbox: null }),
      row({ gameId: 'g3', isSandbox: false }),
    ]);
    expect(out.met).toBe(2);
  });

  it('last = the most recent opposite-team game, scores oriented to me (also when I was team 2)', () => {
    const out = aggregateHeadToHead([
      row({ gameId: 'old', playedAt: '2026-08-01T10:00:00.000Z', myTeam: 1, theirTeam: 2, team1Score: 21, team2Score: 9 }),
      row({ gameId: 'newest', playedAt: '2026-09-05T18:30:00.000Z', myTeam: 2, theirTeam: 1, winningTeam: 1, team1Score: 21, team2Score: 17 }),
      row({ gameId: 'mid', playedAt: '2026-08-20T10:00:00.000Z' }),
      row({ gameId: 'newer-but-partners', playedAt: '2026-09-06T10:00:00.000Z', myTeam: 1, theirTeam: 1 }),
    ]);
    expect(out.met).toBe(3);
    expect(out.last).toEqual({ myScore: 17, theirScore: 21, playedAt: '2026-09-05T18:30:00.000Z' });
  });

  it('zero games → met 0, no wins, last null', () => {
    expect(aggregateHeadToHead([])).toEqual({ met: 0, myWins: 0, theirWins: 0, last: null });
  });

  it('headToHeadView adds display tier labels (never DB enums) and skill scores for both players', () => {
    const v = headToHeadView([], { name: 'Sandeep S', skillScore: 68, level: 'lower_intermediate' }, { name: 'Akhila R', skillScore: 74, level: 'upper_intermediate' });
    expect(v.me).toEqual({ name: 'Sandeep S', skillScore: 68, tierLabel: 'Intermediate' });
    expect(v.them).toEqual({ name: 'Akhila R', skillScore: 74, tierLabel: 'Competitive' });
    expect(JSON.stringify(v)).not.toMatch(/lower_intermediate|upper_intermediate/);
  });
});

describe('loadHeadToHeadRows — SQL shape', () => {
  const flatten = (q: any) => {
    let text = ''; const params: unknown[] = [];
    for (const c of q.queryChunks) {
      if (c && Array.isArray(c.value)) text += c.value.join('');                       // StringChunk
      else if (typeof c === 'string' || typeof c === 'number') { params.push(c); text += '?'; } // raw primitive (drizzle keeps these unwrapped)
      else if (c && typeof c === 'object' && 'value' in c) { params.push(c.value); text += '?'; } // Param
    }
    return { text, params };
  };

  it('joins game_participants twice on game_id, filters by BOTH player ids, excludes sandbox sessions, newest first', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const rows = await loadHeadToHeadRows('me-1', 'them-2', { execute } as any);
    expect(rows).toEqual([]);
    const { text, params } = flatten(execute.mock.calls[0][0]);
    expect(params).toEqual(['them-2', 'me-1']);
    expect(text).toMatch(/JOIN game_participants them ON them\.game_id = me\.game_id AND them\.player_id = \?/);
    expect(text).toMatch(/WHERE me\.player_id = \?/);
    expect(text).toMatch(/s\.is_sandbox = false OR s\.is_sandbox IS NULL/);
    expect(text).toMatch(/ORDER BY gr\.created_at DESC/);
  });

  it('maps snake_case rows to the aggregation shape', async () => {
    const execute = vi.fn(async () => ({ rows: [{ game_id: 'g1', my_team: 2, their_team: 1, winning_team: 2, team1_score: 18, team2_score: 21, played_at: new Date('2026-09-05T18:30:00.000Z'), is_sandbox: false }] }));
    const rows = await loadHeadToHeadRows('me-1', 'them-2', { execute } as any);
    expect(rows).toEqual([{ gameId: 'g1', myTeam: 2, theirTeam: 1, winningTeam: 2, team1Score: 18, team2Score: 21, playedAt: '2026-09-05T18:30:00.000Z', isSandbox: false }]);
  });
});

describe('head-to-head copy', () => {
  it('the four record strings', () => {
    expect(recordLine({ met: 3, myWins: 1, theirWins: 2 }, 'Akhila')).toBe('Met 3 times · Akhila leads 2–1');
    expect(recordLine({ met: 3, myWins: 2, theirWins: 1 }, 'Akhila')).toBe('Met 3 times · You lead 2–1');
    expect(recordLine({ met: 2, myWins: 1, theirWins: 1 }, 'Akhila')).toBe('Met 2 times · Level 1–1');
    expect(recordLine({ met: 0, myWins: 0, theirWins: 0 }, 'Akhila')).toBe("You haven't met yet.");
  });
  it('a single meeting reads "Met once"', () => {
    expect(recordLine({ met: 1, myWins: 1, theirWins: 0 }, 'Akhila')).toBe('Met once · You lead 1–0');
  });
  it('score line uses first names', () => {
    expect(scoreLine(68, 'Akhila Rao', 74)).toBe('You 68 · Akhila 74');
  });
});

function withClient(ui: React.ReactElement, seed: Array<[unknown[], unknown]> = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [key, data] of seed) qc.setQueryData(key, data);
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return qc;
}
const h2h = (over: Record<string, unknown> = {}) => ({
  met: 3, myWins: 1, theirWins: 2, last: { myScore: 15, theirScore: 21, playedAt: '2026-09-05T18:30:00.000Z' },
  me: { name: 'Sandeep S', skillScore: 68, tierLabel: 'Intermediate' }, them: { name: 'Akhila Rao', skillScore: 74, tierLabel: 'Competitive' }, ...over,
});
const stubApi = (h2hResponse: Response | (() => Response), status: unknown = { canChallenge: true }) =>
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => String(u).includes('/head-to-head') ? (typeof h2hResponse === 'function' ? h2hResponse() : h2hResponse.clone()) : json(200, status)));

describe('HeadToHeadPanel — jsdom', () => {
  const panel = (over: Partial<React.ComponentProps<typeof HeadToHeadPanel>> = {}) => (
    <HeadToHeadPanel playerId="p2" playerName="Akhila Rao" playerPhotoUrl={null} viewerPlayerId="p1" viewerPhotoUrl={null} {...over} />
  );

  it('hidden entirely on your own profile and when the viewer has no linked player', () => {
    stubApi(json(200, h2h()));
    withClient(panel({ viewerPlayerId: 'p2' }));
    expect(screen.queryByTestId('head-to-head-panel')).toBeNull();
    withClient(panel({ viewerPlayerId: null }));
    expect(screen.queryByTestId('head-to-head-panel')).toBeNull();
  });

  it('skeleton while loading, then the score line, the record line, both avatars, and the button', async () => {
    stubApi(json(200, h2h()));
    withClient(panel());
    expect(screen.getByTestId('h2h-skeleton')).toBeTruthy();
    expect(await screen.findByTestId('text-h2h-scores')).toHaveProperty('textContent', 'You 68 · Akhila 74');
    expect(screen.getByTestId('text-h2h-record').textContent).toBe('Met 3 times · Akhila leads 2–1');
    expect(screen.getByTestId('avatar-h2h-viewer').textContent).toBe('S');
    expect(screen.getByTestId('avatar-h2h-player').textContent).toBe('A');
    expect(screen.queryByTestId('h2h-skeleton')).toBeNull();
    expect(await screen.findByTestId('button-challenge')).toHaveProperty('textContent', 'Challenge Akhila');
  });

  it.each([
    [h2h({ met: 3, myWins: 2, theirWins: 1 }), 'Met 3 times · You lead 2–1'],
    [h2h({ met: 2, myWins: 1, theirWins: 1 }), 'Met 2 times · Level 1–1'],
    [h2h({ met: 0, myWins: 0, theirWins: 0, last: null }), "You haven't met yet."],
  ])('record line variants → "%s"', async (body, expected) => {
    stubApi(json(200, body));
    withClient(panel());
    expect((await screen.findByTestId('text-h2h-record')).textContent).toBe(expected);
  });

  it('when the history endpoint fails, the panel still renders with the button alone (never blocks challenging)', async () => {
    stubApi(() => json(500, { error: 'boom' }));
    withClient(panel());
    expect(await screen.findByTestId('button-challenge')).toHaveProperty('textContent', 'Challenge Akhila');
    expect(screen.getByTestId('head-to-head-panel')).toBeTruthy();
    expect(screen.queryByTestId('text-h2h-record')).toBeNull();
    expect(screen.queryByTestId('text-h2h-scores')).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('h2h-skeleton')).toBeNull(), { timeout: 4000 });
    expect(screen.queryByTestId('text-h2h-record')).toBeNull();
    expect(screen.getByTestId('button-challenge')).toBeTruthy();
  });

  it('panel still renders in the pending / active / out-of-range button states', async () => {
    for (const reason of ['Challenge pending', 'Challenge active', 'Out of your range']) {
      stubApi(json(200, h2h()), { canChallenge: false, reason });
      const { unmount } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{panel()}</QueryClientProvider>);
      await waitFor(() => expect(screen.getByTestId('button-challenge-state')).toBeTruthy());
      expect(screen.getByTestId('text-h2h-record')).toBeTruthy();
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('avatars use photos when present and keep the initials fallback otherwise', async () => {
    stubApi(json(200, h2h()));
    withClient(panel({ playerPhotoUrl: 'https://img.example/akhila.jpg' }));
    const img = await screen.findByTestId('img-h2h-player');
    expect(img.getAttribute('src')).toBe('https://img.example/akhila.jpg');
    expect(screen.getByTestId('avatar-h2h-viewer').textContent).toBe('S');
  });
});

describe('ChallengeButton — panel styling and the four states', () => {
  const statusKey = ['/api/marketplace/challenges/status', 'p2'];
  const btn = (status: unknown) => {
    withClient(<ChallengeButton playerId="p2" playerName="Akhila Rao" viewerPlayerId="p1" />, [[statusKey, status]]);
  };

  it('default: teal fill, white, full width, 48px, radius 6, label "Challenge <firstName>"', () => {
    btn({ canChallenge: true });
    const b = screen.getByTestId('button-challenge') as HTMLButtonElement;
    expect(b.textContent).toBe('Challenge Akhila');
    expect(b.disabled).toBe(false);
    expect(b.className).toContain('w-full');
    expect(b.style.backgroundColor).toMatch(/rgb\(0, 107, 95\)|#006b5f/i);
    expect(b.style.color).toMatch(/rgb\(255, 255, 255\)|#fff/i);
    expect(b.style.minHeight).toBe('48px');
    expect(b.style.borderRadius).toBe('6px');
    expect(b.style.fontWeight).toBe('700');
    expect(b.style.fontSize).toBe('15px');
  });

  it.each([
    ['Challenge pending', 'pending', 'Challenge pending'],
    ['Challenge active', 'active', 'Challenge active — settles on court'],
  ])('"%s" → outline navy 1px, disabled, "%s"', (reason, state, label) => {
    btn({ canChallenge: false, reason });
    expect(screen.queryByTestId('button-challenge')).toBeNull();
    const b = screen.getByTestId('button-challenge-state') as HTMLButtonElement;
    expect(b.getAttribute('data-state')).toBe(state);
    expect(b.textContent).toBe(label);
    expect(b.disabled).toBe(true);
    expect(b.style.borderWidth).toBe('1px');
    expect(b.style.borderColor).toMatch(/rgb\(0, 44, 132\)|#002c84/i);
    expect(b.style.backgroundColor).toMatch(/rgb\(255, 255, 255\)|#fff|transparent/i);
  });

  it('"Out of your range" → disabled, ink-10 background, ink-50 text', () => {
    btn({ canChallenge: false, reason: 'Out of your range' });
    const b = screen.getByTestId('button-challenge-state') as HTMLButtonElement;
    expect(b.getAttribute('data-state')).toBe('out-of-range');
    expect(b.textContent).toBe('Out of your range');
    expect(b.disabled).toBe(true);
    expect(b.style.backgroundColor).toMatch(/rgba\(26, 31, 43, 0\.1\)|#1a1f2b1a/i);
    expect(b.style.color).toMatch(/rgb\(92, 101, 119\)|#5c6577/i);
  });

  it('the open-challenge cap still surfaces as a disabled state with the server reason', () => {
    btn({ canChallenge: false, reason: 'You have 3 open challenges' });
    const b = screen.getByTestId('button-challenge-state') as HTMLButtonElement;
    expect(b.getAttribute('data-state')).toBe('capped');
    expect(b.textContent).toBe('You have 3 open challenges');
    expect(b.disabled).toBe(true);
  });
});

describe('C4.1 pins — page anchor, old button removed, route, brand', () => {
  it('PlayerPublicProfile renders HeadToHeadPanel below the navy card and above Community Personality; the old header ChallengeButton is gone', () => {
    const p = read('client/src/pages/marketplace/PlayerPublicProfile.tsx');
    expect(p).toMatch(/import \{ HeadToHeadPanel \} from '@\/components\/HeadToHeadPanel'/);
    expect(p).not.toMatch(/ChallengeButton/);
    const hero = p.indexOf('data-testid="hero-banner"');
    const panel = p.indexOf('<HeadToHeadPanel');
    const personality = p.indexOf('data-testid="card-community-personality"');
    expect(hero).toBeGreaterThan(0);
    expect(panel).toBeGreaterThan(hero);
    expect(personality).toBeGreaterThan(panel);
    expect(p).toMatch(/<HeadToHeadPanel[\s\S]*?playerId=\{stats\.player\.id\}[\s\S]*?viewerPlayerId=\{viewer\?\.linkedPlayerId \?\? null\}/);
    expect(p).toMatch(/playerPhotoUrl=\{stats\.playerPhotoUrl\}/);
  });

  it('GET /api/marketplace/players/:playerId/head-to-head is registered with requireAuth + requireMarketplaceAuth and the 403 / 400 guards', () => {
    const r = read('server/marketplace-routes.ts');
    expect(r).toMatch(/app\.get\("\/api\/marketplace\/players\/:playerId\/head-to-head", requireAuth, requireMarketplaceAuth,/);
    const body = r.slice(r.indexOf('/api/marketplace/players/:playerId/head-to-head'));
    const end = body.indexOf('app.');
    const route = body.slice(0, end > 0 ? end : undefined);
    expect(route).toMatch(/status\(403\)\.json\(\{ error: "Link your player profile first" \}\)/);
    expect(route).toMatch(/status\(400\)/);
    expect(route).toMatch(/headToHeadView\(/);
  });

  it('panel + button: no emoji, no icons in the card, no shadows, no off-brand literals', () => {
    const panel = read('client/src/components/HeadToHeadPanel.tsx');
    const button = read('client/src/components/ChallengeButton.tsx');
    for (const src of [panel, button]) {
      expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(src).not.toMatch(/boxShadow|shadow-(sm|md|lg|xl)/);
      expect(src).not.toMatch(/003E8C|F5EFE0/i);
    }
    expect(panel).not.toMatch(/lucide-react/);
    expect(panel).toMatch(/MKT\.navy/);
    expect(panel).toMatch(/MKT\.teal/);
  });
});
