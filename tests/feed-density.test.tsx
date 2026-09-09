// Feed Gate 4 — density.
//
// 1. The like control sits INSIDE the headline row of every card type (heart
//    + liker stack at the right edge, 44px hit box); the standalone like row
//    is gone; the expanded likers list renders as a full-width line under the
//    row. 2. Adjacent challenge_accepted events from the same Dubai day fold
//    into one "N new challenges" card whose like anchor is the newest event
//    (same rule as the tag wall). 3. Type filter chips (Challenges / Results /
//    Tags) map to exact type sets on the server and persist in the URL.
//    4. Sandbox / test accounts never appear in the player-facing search.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { groupChallengeRuns, dubaiDay, parseFeedFilter, FEED_TYPE_FILTERS } = await import('../server/feedEvents');
const { isTestAccountName, TEST_ACCOUNT_NAME_PREFIXES } = await import('../server/playerRoutes');
const feedModule = await import('../client/src/pages/marketplace/CommunityFeed');
const { FeedEventCard, GroupedChallengeCard } = feedModule;
const CommunityFeed = feedModule.default;

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── fixtures ────────────────────────────────────────────────────────────────
const base = (id: string, type: string, payload: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id, type, createdAt: '2026-09-08T18:00:00.000Z', subjectPlayerId: 'p1', sessionId: 's1',
  payload, session: { venueName: 'Bright Riders', date: '2026-09-08' }, likeCount: 2, likedByMe: false, likePreview: ['Dev', 'Reena'], ...over,
});
const accepted = (id: string, createdAt: string, n = 1) => base(id, 'challenge_accepted', {
  challengeId: `c-${id}`, challengerName: `Challenger ${n}`, challengedName: `Target ${n}`, challengerTier: 'Competitive', challengedTier: 'Intermediate',
}, { createdAt, sessionId: null, session: null, challengerPlayerId: `pc-${n}`, challengedPlayerId: `pt-${n}` });
const settled = (id: string, createdAt: string) => base(id, 'challenge_settled', {
  challengeId: `c-${id}`, winnerName: 'Dev', loserName: 'Reena', winnerScore: 21, loserScore: 17,
}, { createdAt, winnerPlayerId: 'p-dev', loserPlayerId: 'p-reena', challengerPlayerId: 'p-dev', challengedPlayerId: 'p-reena' });
const tagGroup = (id: string) => ({
  type: 'tag_received_group', id, eventIds: [id, 'x2'], subjectPlayerId: 'p1', subjectName: 'Reena', giverNames: ['Dev'], tagLabels: ['Smasher', 'Rally King'],
  sessionId: 's1', session: { venueName: 'Bright Riders', date: '2026-09-08' }, createdAt: '2026-09-08T18:00:00.000Z', likeTarget: id, likeCount: 1, likedByMe: false, likePreview: ['Dev'],
});
const CARDS: Array<[string, any]> = [
  ['tier_promotion', base('e1', 'tier_promotion', { playerName: 'Dev', toTier: 'Competitive', corrected: false })],
  ['tag_received', base('e2', 'tag_received', { receiverName: 'Reena', giverName: 'Dev', tagLabel: 'Smasher' })],
  ['milestone', base('e3', 'milestone', { playerName: 'Dev', milestone: 'game_50' })],
  ['win_streak', base('e4', 'win_streak', { playerName: 'Dev', streak: 5 })],
  ['leaderboard_move', base('e5', 'leaderboard_move', { playerName: 'Dev', fromRank: 9, toRank: 4 })],
  ['challenge_accepted', accepted('e6', '2026-09-08T18:00:00.000Z')],
  ['challenge_settled', settled('e7', '2026-09-08T18:30:00.000Z')],
  ['tag_received_group', tagGroup('g1')],
];

function renderIn(ui: React.ReactElement) {
  // The app's client joins the query key into a URL; the likers query relies on that default.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join('/'))).json() } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (url.includes('/likes')) return json(200, { likers: [{ name: 'Dev' }, { name: 'Reena' }], count: 2 });
    if (init?.method === 'POST' || init?.method === 'DELETE') return json(200, { ok: true });
    return json(200, { events: [], nextCursor: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

// ── 1. inline like control on every card ────────────────────────────────────
describe('like control sits in the headline row of every card type', () => {
  it.each(CARDS)('%s: heart inside the headline row, no standalone like row', (_type, item) => {
    renderIn(<FeedEventCard ev={item} />);
    const heart = screen.getByTestId('feed-like-button');
    const row = heart.closest('[data-testid="feed-headline-row"]');
    expect(row, 'heart must live inside the headline row').not.toBeNull();
    expect(screen.queryByTestId('feed-like-row')).toBeNull();
    expect(heart.style.padding).toBe('13px');
    expect(heart.style.margin).toBe('-13px');
    // the row wraps so the expanded likers line can drop underneath
    expect(row!.className).toMatch(/flex-wrap/);
    expect(within(row as HTMLElement).getByTestId('feed-like-stack')).toBeTruthy();
  });

  it('challenge cards are two text lines (settled keeps its verified-score line as a third)', () => {
    const { unmount } = renderIn(<FeedEventCard ev={CARDS[5][1]} />);
    const acc = screen.getByTestId('feed-card-challenge-accepted');
    expect(acc.querySelectorAll('p').length).toBe(2);
    unmount();
    renderIn(<FeedEventCard ev={CARDS[6][1]} />);
    const set = screen.getByTestId('feed-card-challenge-settled');
    expect(set.querySelectorAll('p').length).toBe(3);
    expect(set.textContent).toContain('Captain-verified score');
  });

  it('the liker stack is the expand control; the expanded list renders as a full-width line under the row', async () => {
    renderIn(<FeedEventCard ev={CARDS[0][1]} />);
    const expand = screen.getByTestId('feed-likers-expand');
    expect(expand.closest('[data-testid="feed-headline-row"]')).not.toBeNull();
    fireEvent.click(expand);
    const list = await screen.findByTestId('feed-likers-list');
    expect(list.closest('[data-testid="feed-headline-row"]')).not.toBeNull();
    expect(list.style.flexBasis).toBe('100%');
    await waitFor(() => expect(list.textContent).toContain('Reena'));
  });

  it('tag overflow rows also carry the inline control once expanded', () => {
    const overflow = { type: 'tag_overflow', id: 'ov1', sessionId: 's1', session: { venueName: 'Bright Riders', date: '2026-09-08' }, groups: [tagGroup('g2'), tagGroup('g3')], playerCount: 2, previewNames: ['Reena', 'Dev'] };
    renderIn(<FeedEventCard ev={overflow as any} />);
    fireEvent.click(screen.getByTestId('feed-overflow-expand'));
    const hearts = screen.getAllByTestId('feed-like-button');
    expect(hearts.length).toBe(2);
    for (const h of hearts) expect(h.closest('[data-testid="feed-headline-row"]')).not.toBeNull();
  });
});

// ── 2. grouping ─────────────────────────────────────────────────────────────
describe('groupChallengeRuns — pure', () => {
  it('dubaiDay: 20:10Z on 8 Sep is already 9 Sep in Dubai', () => {
    expect(dubaiDay('2026-09-08T19:50:00.000Z')).toBe('2026-09-08');
    expect(dubaiDay('2026-09-08T20:10:00.000Z')).toBe('2026-09-09');
  });

  it('three adjacent same-day accepted events fold into one group anchored on the newest', () => {
    const a = accepted('n3', '2026-09-08T19:00:00.000Z', 3), b = accepted('n2', '2026-09-08T15:00:00.000Z', 2), c = accepted('n1', '2026-09-08T09:00:00.000Z', 1);
    const out = groupChallengeRuns([a, b, c]);
    expect(out).toHaveLength(1);
    const g = out[0] as any;
    expect(g.type).toBe('challenge_accepted_group');
    expect(g.id).toBe('n3'); expect(g.likeTarget).toBe('n3');
    expect(g.eventIds).toEqual(['n3', 'n2', 'n1']);
    expect(g.members.map((m: any) => m.id)).toEqual(['n3', 'n2', 'n1']);
    expect(g.members[0]).toMatchObject({ challengerName: 'Challenger 3', challengedName: 'Target 3', challengerTier: 'Competitive', challengedTier: 'Intermediate', challengerPlayerId: 'pc-3', challengedPlayerId: 'pt-3' });
    expect(g.createdAt).toBe(a.createdAt);
    expect(g.day).toBe('2026-09-08');
    expect([g.likeCount, g.likedByMe, g.likePreview]).toEqual([a.likeCount, a.likedByMe, a.likePreview]);
  });

  it('adjacent but different Dubai days do not group (23:50 vs 00:10 Dubai)', () => {
    const late = accepted('d2', '2026-09-08T20:10:00.000Z'), early = accepted('d1', '2026-09-08T19:50:00.000Z');
    const out = groupChallengeRuns([late, early]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(late); expect(out[1]).toBe(early);
  });

  it('challenge_settled never groups and breaks a run; other types break a run too', () => {
    const a1 = accepted('a1', '2026-09-08T18:00:00.000Z'), s = settled('s1', '2026-09-08T17:00:00.000Z'), a2 = accepted('a2', '2026-09-08T16:00:00.000Z');
    const out = groupChallengeRuns([a1, s, a2]);
    expect(out.map((x: any) => x.type)).toEqual(['challenge_accepted', 'challenge_settled', 'challenge_accepted']);
    const tag = base('t1', 'tag_received', { receiverName: 'R', giverName: 'G', tagLabel: 'X' });
    const out2 = groupChallengeRuns([a1, tag, a2]);
    expect(out2.map((x: any) => x.type)).toEqual(['challenge_accepted', 'tag_received', 'challenge_accepted']);
    expect(out2[1]).toBe(tag);
  });

  it('a lone accepted event stays the same object; a run of two groups; runs are independent', () => {
    const lone = accepted('l1', '2026-09-08T18:00:00.000Z');
    expect(groupChallengeRuns([lone])[0]).toBe(lone);
    const r1a = accepted('r1a', '2026-09-08T18:00:00.000Z'), r1b = accepted('r1b', '2026-09-08T17:00:00.000Z');
    const s = settled('s', '2026-09-08T16:00:00.000Z');
    const r2a = accepted('r2a', '2026-09-08T15:00:00.000Z'), r2b = accepted('r2b', '2026-09-08T14:00:00.000Z');
    const out = groupChallengeRuns([r1a, r1b, s, r2a, r2b]) as any[];
    expect(out.map((x) => x.type)).toEqual(['challenge_accepted_group', 'challenge_settled', 'challenge_accepted_group']);
    expect(out[0].id).toBe('r1a'); expect(out[2].id).toBe('r2a');
  });
});

describe('GroupedChallengeCard', () => {
  const group = groupChallengeRuns([
    accepted('n3', '2026-09-08T19:00:00.000Z', 3), accepted('n2', '2026-09-08T15:00:00.000Z', 2), accepted('n1', '2026-09-08T09:00:00.000Z', 1),
  ])[0] as any;

  it('headline "3 new challenges", one compact line per challenge newest first, six profile links, tiers inline, heart on the headline row', () => {
    renderIn(<GroupedChallengeCard g={group} />);
    const card = screen.getByTestId('feed-card-challenge-group');
    expect(card.textContent).toContain('3 new challenges');
    const rows = screen.getAllByTestId('feed-challenge-group-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Challenger 3'), expect.stringContaining('Challenger 2'), expect.stringContaining('Challenger 1'),
    ]);
    const links = screen.getAllByTestId('feed-player-link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/marketplace/players/pc-3', '/marketplace/players/pt-3', '/marketplace/players/pc-2', '/marketplace/players/pt-2', '/marketplace/players/pc-1', '/marketplace/players/pt-1']);
    expect(screen.getAllByTestId('feed-tier-text').map((t) => t.textContent)).toEqual(['Competitive', 'Intermediate', 'Competitive', 'Intermediate', 'Competitive', 'Intermediate']);
    for (const r of rows) expect(r.textContent).toContain('challenged');
    expect(screen.getByTestId('feed-like-button').closest('[data-testid="feed-headline-row"]')).not.toBeNull();
    expect(screen.queryByTestId('feed-tier-pill')).toBeNull();
  });

  it('liking the group posts to the newest event (the anchor), like the tag wall', async () => {
    renderIn(<GroupedChallengeCard g={group} />);
    fireEvent.click(screen.getByTestId('feed-like-button'));
    await waitFor(() => expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('/api/marketplace/feed/n3/like') && c[1]?.method === 'POST')).toBe(true));
  });

  it('FeedEventCard dispatches the group type', () => {
    renderIn(<FeedEventCard ev={group} />);
    expect(screen.getByTestId('feed-card-challenge-group')).toBeTruthy();
  });
});

// ── 3. filter ───────────────────────────────────────────────────────────────
describe('feed type filter — server', () => {
  it('maps to the exact event type sets; unknown falls back to all', () => {
    expect(FEED_TYPE_FILTERS.challenges).toEqual(['challenge_accepted', 'challenge_settled']);
    expect(FEED_TYPE_FILTERS.results).toEqual(['win_streak', 'milestone', 'leaderboard_move', 'tier_promotion']);
    expect(FEED_TYPE_FILTERS.tags).toEqual(['tag_received']);
    for (const v of ['all', 'you', 'sessions', 'challenges', 'results', 'tags']) expect(parseFeedFilter(v)).toBe(v);
    expect(parseFeedFilter('nope')).toBe('all');
    expect(parseFeedFilter(undefined)).toBe('all');
    expect(parseFeedFilter(['challenges'])).toBe('all');
  });
  it('the feed route applies the type set with inArray and folds challenge runs after the tag wall', () => {
    const r = read('server/marketplace-routes.ts');
    const route = r.slice(r.indexOf('app.get("/api/marketplace/feed"'), r.indexOf('app.get("/api/marketplace/feed/:eventId/likes"'));
    expect(route).toMatch(/FEED_TYPE_FILTERS\[filter\]/);
    expect(route).toMatch(/inArray\(feedEvents\.type, FEED_TYPE_FILTERS\[filter\]\)/);
    expect(route).toMatch(/groupChallengeRuns\(assembleTagWall\(/);
  });
});

describe('feed type filter — chips + URL persistence', () => {
  it('reads ?filter= on mount, marks the chip selected, fetches with it; changing a chip rewrites the URL; All clears it', async () => {
    window.history.replaceState({}, '', '/marketplace/feed?filter=results');
    renderIn(<CommunityFeed variant="full" />);
    const results = screen.getByTestId('feed-filter-results');
    expect(results.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('filter=results'))).toBe(true));
    for (const v of ['challenges', 'tags']) expect(screen.getByTestId(`feed-filter-${v}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('feed-filter-tags'));
    expect(window.location.search).toBe('?filter=tags');
    expect(screen.getByTestId('feed-filter-tags').getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect((fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('filter=tags'))).toBe(true));
    fireEvent.click(screen.getByTestId('feed-filter-all'));
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/marketplace/feed');
  });
  it('an unknown ?filter= value falls back to All', () => {
    window.history.replaceState({}, '', '/marketplace/feed?filter=bogus');
    renderIn(<CommunityFeed variant="full" />);
    expect(screen.getByTestId('feed-filter-all').getAttribute('aria-selected')).toBe('true');
  });
});

// ── 4. search exclusion ─────────────────────────────────────────────────────
describe('search-players hides sandbox / test accounts', () => {
  it('prefixes are exactly ZZ- and TEST PLAYER', () => {
    expect(TEST_ACCOUNT_NAME_PREFIXES).toEqual(['ZZ-', 'TEST PLAYER']);
    for (const n of ['ZZ-SANDBOX-GOODWILL Tester', 'ZZ-CHALLENGE-TEST-A', 'ZZ-FEED-VERIFY fixture', 'TEST PLAYER', 'TEST PLAYER 2']) expect(isTestAccountName(n), n).toBe(true);
    for (const n of ['Zzania', 'Test Playerson', 'Testimony', 'ZZ Top', 'Dev']) expect(isTestAccountName(n), n).toBe(false);
  });
  it('only the marketplace handler filters; admin search and the ops search do not', () => {
    const mp = read('server/marketplace-routes.ts');
    const h = mp.slice(mp.indexOf('app.get("/api/marketplace/search-players"'), mp.indexOf('// Unified guest search'));
    expect(h).toMatch(/\.filter\(\(?p\)? => !isTestAccountName\(p\.name\)\)[\s\S]*?\.slice\(0, 10\)\.map\(publicPlayerSearchResult\)/);
    const admin = mp.slice(mp.indexOf('app.get("/api/marketplace/admin/search-players"'), mp.indexOf('app.get("/api/marketplace/admin/search-players"') + 800);
    expect(admin).not.toMatch(/isTestAccountName/);
    expect(read('server/playerRoutes.ts')).not.toMatch(/playerSearchHandler[\s\S]*?isTestAccountName/);
  });
});
