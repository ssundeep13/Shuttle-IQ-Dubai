// Gate F3 — feed API + Dashboard feed. Pure cursor/filter helpers are
// unit-tested directly; endpoint auth, published-only, pagination shape and
// the banner port are locked as source tripwires (behavior proven live by
// the production UI verification).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

const {
  encodeFeedCursor,
  decodeFeedCursor,
  parseFeedFilter,
  FEED_PAGE_SIZE,
  SESSION_FEED_TYPES,
} = await import('../server/feedEvents');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('feed cursor', () => {
  it('round-trips (createdAt, id) exactly', () => {
    const createdAt = new Date('2026-07-18T08:52:51.561Z');
    const id = 'c654a13e-e09d-4fe1-8d60-fa854600aee5';
    const decoded = decodeFeedCursor(encodeFeedCursor(createdAt, id));
    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt).toBe('2026-07-18T08:52:51.561Z');
    expect(decoded!.id).toBe(id);
  });

  it('preserves Postgres MICROsecond timestamps verbatim — a ms-truncated cursor strands boundary rows', () => {
    // Regression: one insert batch shares a single microsecond timestamp;
    // truncating to Date (ms) made page 2 of a 24-event feed come back empty.
    const raw = '2026-07-18 08:52:51.561234+00';
    const decoded = decodeFeedCursor(encodeFeedCursor(raw, 'some-id'));
    expect(decoded!.createdAt).toBe(raw); // exact string, microseconds intact
    expect(decoded!.id).toBe('some-id');
  });

  it('rejects garbage without throwing', () => {
    expect(decodeFeedCursor('not-base64!!')).toBeNull();
    expect(decodeFeedCursor(Buffer.from('no-separator').toString('base64url'))).toBeNull();
    expect(decodeFeedCursor(Buffer.from('bad-date|some-id').toString('base64url'))).toBeNull();
    expect(decodeFeedCursor(Buffer.from('2026-01-01T00:00:00.000Z|').toString('base64url'))).toBeNull();
    expect(decodeFeedCursor('')).toBeNull();
    expect(decodeFeedCursor(undefined)).toBeNull();
    expect(decodeFeedCursor(42 as unknown as string)).toBeNull();
  });

  it('page size is 20', () => {
    expect(FEED_PAGE_SIZE).toBe(20);
  });
});

describe('feed filter parsing', () => {
  it('accepts you/sessions, everything else falls back to all', () => {
    expect(parseFeedFilter('you')).toBe('you');
    expect(parseFeedFilter('sessions')).toBe('sessions');
    expect(parseFeedFilter('all')).toBe('all');
    expect(parseFeedFilter('YOU')).toBe('all');
    expect(parseFeedFilter(undefined)).toBe('all');
    expect(parseFeedFilter(['you'])).toBe('all');
  });

  it('sessions filter targets the F5/F7 types (empty until they ship)', () => {
    expect(SESSION_FEED_TYPES).toEqual(['session_recap', 'scarcity']);
  });
});

describe('feed endpoint (tripwires)', () => {
  const src = read('server/marketplace-routes.ts');
  const at = src.indexOf('app.get("/api/marketplace/feed"');
  const handler = src.slice(at, src.indexOf('app.patch(', at));

  it('is marketplace-auth gated', () => {
    expect(at).toBeGreaterThan(-1);
    const line = src.slice(at, src.indexOf('\n', at) + 100);
    expect(line.includes('requireAuth')).toBe(true);
    expect(line.includes('requireMarketplaceAuth')).toBe(true);
  });

  it('serves published events only, newest first, keyset-paginated', () => {
    expect(handler.includes('eq(feedEvents.status, "published")')).toBe(true);
    expect(handler.includes('desc(feedEvents.createdAt)')).toBe(true);
    expect(handler.includes('FEED_PAGE_SIZE + 1')).toBe(true);
    expect(handler.includes('encodeFeedCursor(')).toBe(true);
  });

  it('never sends cacheable responses (no stale feed)', () => {
    // Both response paths (early "you" return + main) set no-store.
    expect((handler.match(/Cache-Control", "no-store"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('"you" matches subject OR giver-side payload id, and returns empty for unlinked users instead of leaking', () => {
    expect(handler.includes('eq(feedEvents.subjectPlayerId, callerPlayerId)')).toBe(true);
    expect(handler.includes(`->>'giverPlayerId'`)).toBe(true);
    expect(handler.includes('events: [], nextCursor: null')).toBe(true);
  });
});

describe('Dashboard banner port (tripwires)', () => {
  const dash = read('client/src/pages/marketplace/Dashboard.tsx');
  const feed = read('client/src/pages/marketplace/CommunityFeed.tsx');

  it('tag-count milestone banner is gone; the three ported cards remain', () => {
    expect(dash.includes('card-milestone-banner')).toBe(false);
    expect(dash.includes('TAG_MILESTONES')).toBe(false);
    for (const t of ['card-suggestion-approved-banner', 'card-referral-nudge', 'card-tag-nudge']) {
      expect(dash.includes(t), `${t} lost in the port`).toBe(true);
    }
    // Ported functionality intact: referral apply + dismiss, tagged-games gating.
    expect(dash.includes('applyReferralMutation.mutate')).toBe(true);
    expect(dash.includes('dismissNudgeMutation.mutate')).toBe(true);
    expect(dash.includes("'/api/tags/tagged-games'")).toBe(true);
  });

  it('CommunityFeed renders filter chips, show-more cursor paging, and the empty state', () => {
    // Chip testids are template-built: feed-filter-${f.value} over FILTERS.
    expect(feed.includes('feed-filter-${f.value}')).toBe(true);
    for (const v of ["value: 'all'", "value: 'you'", "value: 'sessions'"]) {
      expect(feed.includes(v), `missing filter ${v}`).toBe(true);
    }
    for (const t of ['feed-show-more', 'feed-empty-state']) {
      expect(feed.includes(t), `missing ${t}`).toBe(true);
    }
    expect(feed.includes('useInfiniteQuery')).toBe(true);
    expect(feed.includes('getNextPageParam')).toBe(true);
  });

  it('feed cards follow the brand rule: brightened teal only on navy fills', () => {
    // #2BB3A3 must appear only in navy-card contexts: the declaration, the
    // celebration overline, and the liked-heart color behind `onNavy`.
    expect(feed.includes("const TEAL_ON_NAVY = '#2BB3A3'")).toBe(true);
    const uses = feed.split('TEAL_ON_NAVY').length - 1;
    expect(uses).toBe(3);
  });

  it('no emoji rendered by feed UI (spec)', () => {
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(feed)).toBe(false);
  });

  it('Dashboard mounts CommunityFeed below the session card', () => {
    const session = dash.indexOf('<UnifiedSessionCard');
    const community = dash.indexOf('<CommunityFeed');
    expect(community).toBeGreaterThan(-1);
    expect(community).toBeGreaterThan(session);
  });
});

// ── Gate F4: likes + notifications ──────────────────────────────────────────

describe('feedEventHeadline', () => {
  it('maps every event type to a short human headline', async () => {
    const { feedEventHeadline } = await import('../server/feedEvents');
    expect(feedEventHeadline('tier_promotion', { playerName: 'Rakesh', toTier: 'Competitive' })).toBe('Rakesh is now Competitive');
    expect(feedEventHeadline('tag_received', { receiverName: 'Anita', tagLabel: 'Net Ninja' })).toBe('Anita earned "Net Ninja"');
    expect(feedEventHeadline('win_streak', { playerName: 'Anita', streak: 4 })).toBe("Anita's 4-win streak");
    expect(feedEventHeadline('unknown_future_type', {})).toBe('your post');
  });
});

describe('like endpoints (tripwires)', () => {
  const src = read('server/marketplace-routes.ts');
  const likeAt = src.indexOf('app.post("/api/marketplace/feed/:eventId/like"');
  const likeHandler = src.slice(likeAt, src.indexOf('app.delete("/api/marketplace/feed/:eventId/like"'));
  const unlikeAt = src.indexOf('app.delete("/api/marketplace/feed/:eventId/like"');
  const unlikeHandler = src.slice(unlikeAt, src.indexOf('app.get("/api/marketplace/feed/:eventId/likes"'));
  const likersAt = src.indexOf('app.get("/api/marketplace/feed/:eventId/likes"');

  it('all three like endpoints exist and are marketplace-auth gated', () => {
    for (const at of [likeAt, unlikeAt, likersAt]) {
      expect(at).toBeGreaterThan(-1);
      const line = src.slice(at, src.indexOf('\n', at) + 100);
      expect(line.includes('requireAuth')).toBe(true);
      expect(line.includes('requireMarketplaceAuth')).toBe(true);
    }
  });

  it('double-like is a PK no-op success (onConflictDoNothing), published-only, linked-player-only', () => {
    expect(likeHandler.includes('.onConflictDoNothing()')).toBe(true);
    expect(likeHandler.includes(`ev.status !== "published"`)).toBe(true);
    expect(likeHandler.includes('Link your player profile first')).toBe(true);
    expect(unlikeHandler.includes('Link your player profile first')).toBe(true);
  });

  it('feed_like notification: first-like only, never self, guarded, and only to linked accounts', () => {
    expect(likeHandler.includes('firstLike && ev.subjectPlayerId && ev.subjectPlayerId !== mpUser.linkedPlayerId')).toBe(true);
    expect(likeHandler.includes('"feed_like"')).toBe(true);
    // guarded: notification try/catch cannot fail the like
    const notifyBlock = likeHandler.slice(likeHandler.indexOf('firstLike &&'));
    expect(notifyBlock.includes('try {')).toBe(true);
    expect(notifyBlock.includes('catch')).toBe(true);
  });

  it('feed response is enriched with likeCount/likedByMe/likePreview from ONE batched join', () => {
    const feedHandler = src.slice(src.indexOf('app.get("/api/marketplace/feed"'), likeAt);
    for (const f of ['likeCount:', 'likedByMe:', 'likePreview:']) expect(feedHandler.includes(f), `missing ${f}`).toBe(true);
    expect(feedHandler.includes('innerJoin(players')).toBe(true);
    expect(feedHandler.includes('inArray(feedEventLikes.eventId, eventIds)')).toBe(true);
  });

  it('"you" filter extends to giver-side via payload IDs, null-safe on old payloads', () => {
    const feedHandler = src.slice(src.indexOf('app.get("/api/marketplace/feed"'), likeAt);
    expect(feedHandler.includes(`->>'giverPlayerId'`)).toBe(true);
    expect(feedHandler.includes('eq(feedEvents.subjectPlayerId, callerPlayerId)')).toBe(true);
  });
});

describe('feed_tag notification (tripwires)', () => {
  it('lives inside the tag route guarded block, non-sandbox only, linked accounts only', () => {
    const src = read('server/routes.ts');
    const tagRoute = src.slice(src.indexOf('app.post("/api/tags/game/:gameResultId"'));
    const guard = tagRoute.slice(tagRoute.indexOf('try {', tagRoute.indexOf('createPlayerTags(entries)')), tagRoute.indexOf('catch (feedErr)'));
    expect(guard.includes('"feed_tag"')).toBe(true);
    expect(guard.includes('if (!isSandbox)')).toBe(true);
    expect(guard.includes('inArray(marketplaceUsers.linkedPlayerId, receiverIds)')).toBe(true);
  });
});

describe('LikeBar UI (tripwires)', () => {
  const feed = read('client/src/pages/marketplace/CommunityFeed.tsx');

  it('optimistic toggle with paired rollback and server settle', () => {
    expect(feed.includes('onMutate')).toBe(true);
    expect(feed.includes('onError')).toBe(true);
    expect(feed.includes('applyLocal(ctx.wasLiked)')).toBe(true); // rollback restores the snapshot state
    expect(feed.includes('onSettled')).toBe(true);
  });

  it('heart, avatar stack and inline liker expand render with testids; likers fetched on first expand', () => {
    for (const t of ['feed-like-button', 'feed-like-stack', 'feed-likers-expand', 'feed-likers-list']) {
      expect(feed.includes(t), `missing ${t}`).toBe(true);
    }
    expect(feed.includes('enabled: expanded')).toBe(true);
    expect(feed.includes('aria-pressed')).toBe(true);
  });

  it('all three card types carry the LikeBar; navy card uses the onNavy variant', () => {
    expect((feed.match(/<LikeBar ev=\{ev\} \/>/g) ?? []).length).toBe(2); // TagCard + CompactCard
    expect(feed.includes('<LikeBar ev={ev} onNavy />')).toBe(true); // PromotionCard
  });
});
