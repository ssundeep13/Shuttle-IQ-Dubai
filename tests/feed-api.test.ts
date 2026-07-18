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
  assembleTagWall,
  TAG_WALL_MAX_GROUPS_PER_SESSION,
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

  it('F2.1 rider: Sessions chip hidden until session_recap events exist; per-filter empty copy', () => {
    expect(feed.includes('SHOW_SESSIONS_FILTER = false')).toBe(true);
    expect(feed.includes("SHOW_SESSIONS_FILTER || f.value !== 'sessions'")).toBe(true);
    expect(feed.includes('Nothing about you yet')).toBe(true);
    expect(feed.includes('Your next session will change that.')).toBe(true);
    // "play your first session" copy stays exclusive to the All filter branch
    const emptyBlock = feed.slice(feed.indexOf(`filter === 'you' ? (`), feed.indexOf('feed-empty-book-link'));
    expect(emptyBlock.includes('Nothing about you yet')).toBe(true);
    expect(emptyBlock.indexOf('Play your first session')).toBeGreaterThan(emptyBlock.indexOf(') : ('));
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

// ── Gate F3.5: tag wall grouping + burst cap (pure, per page) ───────────────

let tagSeq = 0;
const mkTag = (subject: string, session: string | null, giver: string, label: string, minutesAgo: number) => ({
  id: `ev-${++tagSeq}`,
  type: 'tag_received',
  createdAt: new Date(Date.UTC(2026, 6, 18, 12, 0 - minutesAgo)).toISOString(),
  subjectPlayerId: subject,
  sessionId: session,
  payload: { receiverName: `Name ${subject}`, giverName: giver, tagLabel: label },
  session: session ? { venueName: 'Bright Riders', date: '2026-07-18' } : null,
  likeCount: 0, likedByMe: false, likePreview: [] as string[],
});
const mkOther = (type: string) => ({
  id: `ev-${++tagSeq}`, type, createdAt: new Date().toISOString(), subjectPlayerId: 'px',
  sessionId: 's9', payload: { playerName: 'X' }, session: null, likeCount: 0, likedByMe: false, likePreview: [] as string[],
});

describe('assembleTagWall — grouping', () => {
  it('collapses tags sharing (subject, session) into one group; like state rides the NEWEST event', () => {
    const a1 = mkTag('p1', 's1', 'DILJITH', 'Smasher', 1); // newest
    a1.likeCount = 5; a1.likedByMe = true; a1.likePreview = ['Priya'];
    const a2 = mkTag('p1', 's1', 'DILJITH', 'High Energy', 2);
    const a3 = mkTag('p1', 's1', 'DILJITH', 'Soft Touch', 3);
    const out = assembleTagWall([a1, a2, a3]);
    expect(out).toHaveLength(1);
    const g = out[0] as any;
    expect(g.type).toBe('tag_received_group');
    expect(g.eventIds).toEqual([a1.id, a2.id, a3.id]);
    expect(g.tagLabels).toEqual(['Smasher', 'High Energy', 'Soft Touch']);
    expect(g.subjectName).toBe('Name p1');
    expect(g.likeTarget).toBe(a1.id);
    expect(g.id).toBe(a1.id);
    expect(g.likeCount).toBe(5);
    expect(g.likedByMe).toBe(true);
    expect(g.createdAt).toBe(a1.createdAt);
  });

  it('dedupes multiple givers in first-seen order', () => {
    const out = assembleTagWall([
      mkTag('p1', 's1', 'DILJITH', 'A', 1),
      mkTag('p1', 's1', 'Priya', 'B', 2),
      mkTag('p1', 's1', 'DILJITH', 'C', 3),
    ]);
    expect((out[0] as any).giverNames).toEqual(['DILJITH', 'Priya']);
  });

  it('solo tags pass through UNCHANGED (same object, type tag_received)', () => {
    const solo = mkTag('p1', 's1', 'DILJITH', 'Smasher', 1);
    const out = assembleTagWall([solo]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(solo); // identity — page-boundary partial groups degrade to this too
  });

  it('same subject in DIFFERENT sessions stays separate; null-session tags group but never burst', () => {
    const out = assembleTagWall([
      mkTag('p1', 's1', 'G', 'A', 1), mkTag('p1', 's2', 'G', 'B', 2),
      mkTag('p2', null, 'G', 'C', 3), mkTag('p2', null, 'G', 'D', 4),
    ]);
    expect(out).toHaveLength(3); // two solos + one null-session group
    expect((out[2] as any).type).toBe('tag_received_group');
  });

  it('non-tag events pass through untouched with interleaved order preserved', () => {
    const promo = mkOther('tier_promotion');
    const t1 = mkTag('p1', 's1', 'G', 'A', 2);
    const streak = mkOther('win_streak');
    const t2 = mkTag('p1', 's1', 'G', 'B', 3);
    const out = assembleTagWall([promo, t1, streak, t2]);
    expect(out.map(o => o.type)).toEqual(['tier_promotion', 'tag_received_group', 'win_streak']);
    expect(out[0]).toBe(promo);
    expect(out[2]).toBe(streak);
  });
});

describe('assembleTagWall — burst cap', () => {
  it('caps at 4 groups per session by (tag count, then recency); the rest fold into ONE overflow in first folded position', () => {
    expect(TAG_WALL_MAX_GROUPS_PER_SESSION).toBe(4);
    // 6 clusters in s1: sizes 3,2,2,1,1,1 — kept: size3, both size2s, NEWEST size1.
    const big = [mkTag('pA', 's1', 'G', 'a1', 1), mkTag('pA', 's1', 'G', 'a2', 2), mkTag('pA', 's1', 'G', 'a3', 3)];
    const two1 = [mkTag('pB', 's1', 'G', 'b1', 4), mkTag('pB', 's1', 'G', 'b2', 5)];
    const two2 = [mkTag('pC', 's1', 'G', 'c1', 6), mkTag('pC', 's1', 'G', 'c2', 7)];
    const soloNew = mkTag('pD', 's1', 'G', 'd1', 8);
    const soloMid = mkTag('pE', 's1', 'G', 'e1', 9);
    const soloOld = mkTag('pF', 's1', 'G', 'f1', 10);
    const out = assembleTagWall([...big, ...two1, ...two2, soloNew, soloMid, soloOld]);

    const types = out.map(o => o.type);
    expect(types).toEqual(['tag_received_group', 'tag_received_group', 'tag_received_group', 'tag_received', 'tag_overflow']);
    expect(out[3]).toBe(soloNew); // newest solo survives the cap as a pass-through
    const ov = out[4] as any;
    expect(ov.playerCount).toBe(2);
    expect(ov.previewNames).toEqual(['Name pE', 'Name pF']);
    expect(ov.sessionId).toBe('s1');
    // folded groups come in FULL group shape with their own like targets
    expect(ov.groups.map((g: any) => g.type)).toEqual(['tag_received_group', 'tag_received_group']);
    expect(ov.groups[0].likeTarget).toBe(soloMid.id);
    expect(ov.groups[1].likeTarget).toBe(soloOld.id);
    // and the overflow sits where the first folded cluster appeared (after soloNew)
    expect(out.indexOf(ov)).toBe(4);
  });

  it('does not cap across different sessions', () => {
    const items = ['p1', 'p2', 'p3'].map(p => mkTag(p, 's1', 'G', 'x', 1))
      .concat(['p4', 'p5', 'p6'].map(p => mkTag(p, 's2', 'G', 'x', 2)));
    const out = assembleTagWall(items);
    expect(out.every(o => o.type === 'tag_received')).toBe(true); // 3 per session ≤ 4 → all solo pass-through
    expect(out).toHaveLength(6);
  });
});

describe('tag wall UI (tripwires)', () => {
  const feed = read('client/src/pages/marketplace/CommunityFeed.tsx');

  it('grouped + overflow cards render with testids and their own like bars', () => {
    for (const t of ['feed-card-tag-group', 'feed-card-tag-overflow', 'feed-overflow-expand', 'feed-overflow-rows']) {
      expect(feed.includes(t), `missing ${t}`).toBe(true);
    }
    expect(feed.includes('earned {g.tagLabels.length} tags')).toBe(true);
    expect(feed.includes('<LikeBar ev={g} />')).toBe(true); // group card + overflow rows
  });

  it('optimistic like patch reaches groups nested inside a tag_overflow item', () => {
    expect(feed.includes(`ov.type === 'tag_overflow'`)).toBe(true);
    expect(feed.includes('ov.groups.some(g => g.id === ev.id)')).toBe(true);
    expect(feed.includes('ov.groups.map(g => g.id === ev.id ? flip(g) : g)')).toBe(true);
  });

  it('route assembles the wall before responding; cursor still keys on RAW page rows', () => {
    const src = read('server/marketplace-routes.ts');
    const handler = src.slice(src.indexOf('app.get("/api/marketplace/feed"'), src.indexOf('app.post("/api/marketplace/feed/:eventId/like"'));
    expect(handler.includes('assembleTagWall(')).toBe(true);
    expect(handler.includes('encodeFeedCursor(page[page.length - 1].createdAtRaw')).toBe(true);
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
