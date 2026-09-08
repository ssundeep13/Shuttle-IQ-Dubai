// Player Challenges — Gate C7: the Challenges card moves from Profile to Stats
// (/marketplace/my-scores, the STATS tab), and every deep link follows it.
//
// Source pins: MyScores mounts ChallengesCard right under the stat tiles and
// above the tags/history sections; Profile no longer imports or renders it;
// the email constant points at my-scores; nothing anywhere still says
// profile#challenges. jsdom: the real MyScores page renders the card in that
// position, and honours the #challenges hash.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

vi.mock('../client/src/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: () => ({ user: { id: 'u1', name: 'Test Player', email: 't@example.com', linkedPlayerId: 'p1' }, isAuthenticated: true, isLoading: false }),
}));

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { CHALLENGES_DEEP_LINK } = await import('../server/challengeEmail');
const MyScores = (await import('../client/src/pages/marketplace/MyScores')).default;

const root = join(__dirname, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

describe('C7 pins — Stats owns the card, Profile does not, links follow', () => {
  it('MyScores imports ChallengesCard and mounts it under the stat tiles, above Tags Received and the game history link', () => {
    const p = read('client/src/pages/marketplace/MyScores.tsx');
    expect(p).toMatch(/import \{ ChallengesCard \} from '@\/components\/ChallengesCard'/);
    const tiles = p.indexOf('card-stat-winrate');
    const card = p.indexOf('<ChallengesCard');
    const tags = p.indexOf('section-tags-received');
    const history = p.indexOf('link-full-game-history');
    expect(tiles).toBeGreaterThan(0);
    expect(card).toBeGreaterThan(tiles);
    expect(tags).toBeGreaterThan(card);
    expect(history).toBeGreaterThan(card);
  });

  it('Profile no longer imports, renders, or links to the Challenges card', () => {
    const p = read('client/src/pages/marketplace/Profile.tsx');
    expect(p).not.toMatch(/ChallengesCard/);
    expect(p).not.toMatch(/#challenges/);
    expect(p).not.toMatch(/my-scores#challenges/);
  });

  it('the email deep link points at the Stats route + #challenges', () => {
    expect(CHALLENGES_DEEP_LINK).toBe('https://shuttleiq.ai/marketplace/my-scores#challenges');
  });

  it('no source file anywhere still targets profile#challenges', () => {
    const offenders = [
      ...walk(join(root, 'client', 'src')), ...walk(join(root, 'server')), ...walk(join(root, 'shared')),
    ].filter((f) => /profile#challenges/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
  });

  it('ChallengesCard keeps the id="challenges" anchor and the hash-scroll behaviour', () => {
    const c = read('client/src/components/ChallengesCard.tsx');
    expect(c).toMatch(/<Card id="challenges"/);
    expect(c).toMatch(/window\.location\.hash === '#challenges'/);
    expect(c).toMatch(/addEventListener\('hashchange'/);
  });
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const player = { id: 'p1', name: 'Test Player', gender: 'Male', level: 'Beginner', skillScore: 67, status: 'waiting', shuttleIqId: 'SIQ-00345' };
const stats = {
  player, playerPhotoUrl: null, winRate: 50, totalGames: 4, totalWins: 2,
  currentStreak: { type: 'win', count: 1 }, longestWinStreak: 2, longestLossStreak: 1,
  rankBySkillScore: 40, rankByWins: 40, rankByWinRate: 40, totalPlayersRanked: 200,
  performanceTrend: 'stable', recentWinRate: 50, avgScoreDifferential: 0, avgPointsFor: 18, avgPointsAgainst: 18,
  bestPartner: null, frequentPartners: [], rivals: [], favoriteOpponents: [], recentGames: [],
};
const mine = { incoming: [], outgoing: [], active: [], settled: [] };

function renderStats() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['/api/players', 'p1', 'stats'], stats);
  qc.setQueryData(['/api/marketplace/my-disputes'], []);
  qc.setQueryData(['/api/tags/player', 'p1'], []);
  qc.setQueryData(['/api/tags/tagged-games'], []);
  qc.setQueryData(['/api/marketplace/challenges/mine'], mine);
  render(<QueryClientProvider client={qc}><MyScores /></QueryClientProvider>);
}

describe('MyScores — jsdom', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null; rootMargin = ''; thresholds = []; });
    vi.stubGlobal('fetch', vi.fn(async (u: unknown) => String(u).includes('/challenges/mine') ? json(200, mine) : json(200, [])));
    window.location.hash = '';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('renders the Challenges card under the stat tiles and above Tags Received / game history', async () => {
    renderStats();
    const card = await screen.findByTestId('card-challenges');
    expect(card.getAttribute('id')).toBe('challenges');
    const tile = screen.getByTestId('card-stat-winrate');
    const history = screen.getByTestId('link-full-game-history');
    // DOCUMENT_POSITION_FOLLOWING (4): the card comes after the tile and before the history link.
    expect(tile.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opening the page on #challenges scrolls the card into view', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    window.location.hash = '#challenges';
    renderStats();
    await screen.findByTestId('card-challenges');
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });
});
