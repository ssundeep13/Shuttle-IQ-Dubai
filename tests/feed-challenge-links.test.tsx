// Feed Gate 2 — clickable player names on challenge feed cards + compact card.
//
// Server: challenge feed events get player ids attached at READ time from the
// challenges table (payloads stay frozen; legacy events resolve via
// payload.challengeId), and the two builders now carry the ids for new events.
// Client: PlayerLink wraps wouter's Link to the public profile (plain text when
// the id is null); both challenge cards use it for the avatar and each name,
// with the tier as inline teal text — no pill row, nothing interactive in it.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { attachChallengePlayerIds, buildChallengeAcceptedEvent, buildChallengeSettledEvent } = await import('../server/feedEvents');
const { loadChallengePlayerIds } = await import('../server/challenges');
const { PlayerLink } = await import('../client/src/components/marketplace/PlayerLink');
const { ChallengeAcceptedCard, ChallengeSettledCard } = await import('../client/src/pages/marketplace/CommunityFeed');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const ROW = { id: 'ch-1', challengerPlayerId: 'p-dev', challengedPlayerId: 'p-reena', winnerPlayerId: null as string | null };
const accepted = (payload: Record<string, unknown>, id = 'e1') => ({
  id, type: 'challenge_accepted', createdAt: '2026-09-08T10:00:00.000Z', subjectPlayerId: 'p-dev', sessionId: null,
  payload: { challengeId: 'ch-1', challengerName: 'Dev', challengedName: 'Reena', challengerTier: 'Competitive', challengedTier: 'Intermediate', ...payload },
  session: null, likeCount: 0, likedByMe: false, likePreview: [] as string[],
});
const settled = (payload: Record<string, unknown>, id = 'e2') => ({
  id, type: 'challenge_settled', createdAt: '2026-09-08T12:00:00.000Z', subjectPlayerId: 'p-dev', sessionId: 's1',
  payload: { challengeId: 'ch-1', winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17, ...payload },
  session: { venueName: 'Bright Riders', date: '2026-09-08' }, likeCount: 2, likedByMe: false, likePreview: ['A', 'B'],
});

describe('attachChallengePlayerIds — pure, read-time enrichment', () => {
  it('a legacy accepted payload (names only) resolves both ids via payload.challengeId; winner/loser stay null', () => {
    const [out] = attachChallengePlayerIds([accepted({})], new Map([[ROW.id, ROW]]));
    expect(out.challengerPlayerId).toBe('p-dev');
    expect(out.challengedPlayerId).toBe('p-reena');
    expect(out.winnerPlayerId).toBeNull();
    expect(out.loserPlayerId).toBeNull();
  });

  it('a settled event gets winner + loser from the row (loser = the other player), either way round', () => {
    const [a] = attachChallengePlayerIds([settled({})], new Map([[ROW.id, { ...ROW, winnerPlayerId: 'p-dev' }]]));
    expect([a.winnerPlayerId, a.loserPlayerId]).toEqual(['p-dev', 'p-reena']);
    const [b] = attachChallengePlayerIds([settled({})], new Map([[ROW.id, { ...ROW, winnerPlayerId: 'p-reena' }]]));
    expect([b.winnerPlayerId, b.loserPlayerId]).toEqual(['p-reena', 'p-dev']);
    expect(a.challengerPlayerId).toBe('p-dev');
    expect(a.challengedPlayerId).toBe('p-reena');
  });

  it('an unknown challengeId (or none) yields four nulls and never throws', () => {
    const [a] = attachChallengePlayerIds([accepted({ challengeId: 'gone' })], new Map());
    expect([a.challengerPlayerId, a.challengedPlayerId, a.winnerPlayerId, a.loserPlayerId]).toEqual([null, null, null, null]);
    const [b] = attachChallengePlayerIds([accepted({ challengeId: undefined })], new Map([[ROW.id, ROW]]));
    expect([b.challengerPlayerId, b.challengedPlayerId]).toEqual([null, null]);
  });

  it('new-style payloads carry the ids themselves; they are used when the row is missing', () => {
    const [a] = attachChallengePlayerIds([accepted({ challengerPlayerId: 'p-x', challengedPlayerId: 'p-y' })], new Map());
    expect([a.challengerPlayerId, a.challengedPlayerId]).toEqual(['p-x', 'p-y']);
    const [s] = attachChallengePlayerIds([settled({ winnerPlayerId: 'p-y', loserPlayerId: 'p-x' })], new Map());
    expect([s.winnerPlayerId, s.loserPlayerId]).toEqual(['p-y', 'p-x']);
  });

  it('other event types pass through untouched and payloads are never mutated', () => {
    const tag = { id: 't1', type: 'tag_received', createdAt: 'x', subjectPlayerId: 'p1', sessionId: null, payload: { receiverName: 'R' }, session: null, likeCount: 0, likedByMe: false, likePreview: [] as string[] };
    const ev = accepted({});
    const before = JSON.stringify(ev.payload);
    const [t, a] = attachChallengePlayerIds([tag, ev], new Map([[ROW.id, ROW]]));
    expect(t).toEqual(tag);
    expect('challengerPlayerId' in t).toBe(false);
    expect(JSON.stringify(a.payload)).toBe(before);
  });
});

describe('builders carry the ids for new events', () => {
  it('buildChallengeAcceptedEvent payload has challengerPlayerId + challengedPlayerId', () => {
    const e = buildChallengeAcceptedEvent({ challengeId: 'c', challenger: { id: 'p-dev', name: 'Dev', tier: 'Competitive' }, challenged: { id: 'p-reena', name: 'Reena', tier: 'Intermediate' } });
    expect(e.payload).toMatchObject({ challengerPlayerId: 'p-dev', challengedPlayerId: 'p-reena', challengerName: 'Dev', challengedName: 'Reena' });
  });
  it('buildChallengeSettledEvent payload has winnerPlayerId + loserPlayerId', () => {
    const e = buildChallengeSettledEvent({ challengeId: 'c', gameResultId: 'g', sessionId: 's', winner: { id: 'p-dev', name: 'Dev' }, loser: { id: 'p-reena', name: 'Reena' }, score: { winner: 21, loser: 17 } });
    expect(e.payload).toMatchObject({ winnerPlayerId: 'p-dev', loserPlayerId: 'p-reena', winnerName: 'Dev', loserName: 'Reena' });
  });
});

describe('loadChallengePlayerIds — one query for the page', () => {
  it('returns a map keyed by challenge id; empty input makes no query', async () => {
    const where = vi.fn(async () => [ROW, { ...ROW, id: 'ch-2', winnerPlayerId: 'p-reena' }]);
    const select = vi.fn(() => ({ from: () => ({ where }) }));
    const map = await loadChallengePlayerIds(['ch-1', 'ch-2'], { select } as any);
    expect(select).toHaveBeenCalledTimes(1);
    expect(map.get('ch-1')).toEqual(ROW);
    expect(map.get('ch-2')?.winnerPlayerId).toBe('p-reena');
    const empty = await loadChallengePlayerIds([], { select } as any);
    expect(empty.size).toBe(0);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

function renderCard(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const hrefs = () => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));

describe('PlayerLink', () => {
  it('links to the public profile when an id is present, plain text otherwise', () => {
    renderCard(<><PlayerLink playerId="p-dev" name="Dev" /><PlayerLink playerId={null} name="Ghost" /></>);
    const a = screen.getByText('Dev').closest('a');
    expect(a?.getAttribute('href')).toBe('/marketplace/players/p-dev');
    expect(screen.getByText('Ghost').closest('a')).toBeNull();
  });
});

describe('ChallengeAcceptedCard — compact, names link to profiles', () => {
  const ev = { ...accepted({}), challengerPlayerId: 'p-dev', challengedPlayerId: 'p-reena', winnerPlayerId: null, loserPlayerId: null };

  it('renders two name anchors to the correct profiles (plus the avatar link), tier text inline, no pill row, like bar present', () => {
    renderCard(<ChallengeAcceptedCard ev={ev as any} />);
    const names = screen.getAllByTestId('feed-player-link');
    expect(names.map((n) => n.getAttribute('href'))).toEqual(['/marketplace/players/p-dev', '/marketplace/players/p-reena']);
    expect(names.map((n) => n.textContent)).toEqual(['Dev', 'Reena']);
    expect(screen.getByTestId('feed-player-avatar-link').getAttribute('href')).toBe('/marketplace/players/p-dev');
    expect(hrefs()).toEqual(['/marketplace/players/p-dev', '/marketplace/players/p-dev', '/marketplace/players/p-reena']);
    const tiers = screen.getAllByTestId('feed-tier-text');
    expect(tiers.map((t) => t.textContent)).toEqual(['Competitive', 'Intermediate']);
    for (const t of tiers) {
      expect(t.querySelector('a, button')).toBeNull();
      expect(t.closest('a, button')).toBeNull();
      expect(t.style.color).toMatch(/rgb\(0, 107, 95\)|#006b5f/i);
    }
    expect(screen.queryByTestId('feed-tier-pill')).toBeNull();
    expect(screen.getByTestId('feed-card-challenge-accepted').textContent).toContain('challenged');
    expect(screen.getByTestId('feed-like-button')).toBeTruthy();
  });

  it('null ids render the names as text: no anchors anywhere in the card', () => {
    renderCard(<ChallengeAcceptedCard ev={{ ...ev, challengerPlayerId: null, challengedPlayerId: null } as any} />);
    expect(hrefs()).toEqual([]);
    expect(screen.getByTestId('feed-card-challenge-accepted').textContent).toContain('Dev');
    expect(screen.getByTestId('feed-card-challenge-accepted').textContent).toContain('Reena');
    expect(screen.queryByTestId('feed-player-link')).toBeNull();
  });
});

describe('ChallengeSettledCard — winner and loser link to profiles', () => {
  const ev = { ...settled({}), challengerPlayerId: 'p-dev', challengedPlayerId: 'p-reena', winnerPlayerId: 'p-dev', loserPlayerId: 'p-reena' };

  it('two name anchors + avatar link; score and "Challenge settled" stay in the headline', () => {
    renderCard(<ChallengeSettledCard ev={ev as any} />);
    const names = screen.getAllByTestId('feed-player-link');
    expect(names.map((n) => n.getAttribute('href'))).toEqual(['/marketplace/players/p-dev', '/marketplace/players/p-reena']);
    expect(screen.getByTestId('feed-player-avatar-link').getAttribute('href')).toBe('/marketplace/players/p-dev');
    const text = screen.getByTestId('feed-card-challenge-settled').textContent ?? '';
    expect(text).toContain('beat');
    expect(text).toContain('21–17');
    expect(text).toContain('Challenge settled');
    expect(screen.getByTestId('feed-like-button')).toBeTruthy();
  });

  it('null ids → text only', () => {
    renderCard(<ChallengeSettledCard ev={{ ...ev, winnerPlayerId: null, loserPlayerId: null } as any} />);
    expect(hrefs()).toEqual([]);
  });
});

describe('Gate 2 pins — route, DTO, cards, component', () => {
  it('the feed route resolves ids with ONE challenges lookup for the page, after the page rows are known', () => {
    const r = read('server/marketplace-routes.ts');
    const route = r.slice(r.indexOf('app.get("/api/marketplace/feed"'), r.indexOf('app.get("/api/marketplace/feed/:eventId/likes"'));
    expect((route.match(/loadChallengePlayerIds\(/g) ?? []).length).toBe(1);
    expect(route).toMatch(/attachChallengePlayerIds\(/);
    expect(route.indexOf('loadChallengePlayerIds(')).toBeGreaterThan(route.indexOf('const page = rows.slice'));
    expect(route).not.toMatch(/challengeIds\.map\(\(?\w*\)? ?=> ?(db|dbh|storage)\./); // no per-event queries
  });
  it('the client DTO declares the four id fields; the cards use PlayerLink and no TierTag/pill row', () => {
    const c = read('client/src/pages/marketplace/CommunityFeed.tsx');
    // present on challenge events only, hence optional on the union DTO
    expect(c).toMatch(/challengerPlayerId\?: string \| null;/);
    expect(c).toMatch(/challengedPlayerId\?: string \| null;/);
    expect(c).toMatch(/winnerPlayerId\?: string \| null;/);
    expect(c).toMatch(/loserPlayerId\?: string \| null;/);
    expect(c).toMatch(/import \{ PlayerLink \} from '@\/components\/marketplace\/PlayerLink'/);
    const cards = c.slice(c.indexOf('function ChallengeAcceptedCard'), c.indexOf('function FeedEventCard'));
    expect(cards).not.toMatch(/TierTag/);
    expect(cards).not.toMatch(/flex flex-wrap gap-2/); // the old pill-row wrapper (headline rows may wrap for the like list — Gate 4)
    expect((cards.match(/<PlayerLink/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(c).not.toMatch(/function TierTag/);
  });
  it('PlayerLink: wouter Link, brand tokens only, no emoji, no shadows', () => {
    const p = read('client/src/components/marketplace/PlayerLink.tsx');
    expect(p).toMatch(/from 'wouter'/);
    expect(p).toMatch(/\/marketplace\/players\/\$\{/);
    expect(p).not.toMatch(/#[0-9a-fA-F]{6}\b|boxShadow|shadow-/);
    expect(p).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
