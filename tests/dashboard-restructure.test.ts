// Gate F3.6 — dashboard restructure. The Dubai session-clock helper is
// unit-tested directly (including the known timezone-artifact case); the
// section removals, new routes, relocations and brand rules are locked as
// source tripwires with live production verification behind them.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { dubaiCalendarDate, sessionEndInstant, isSessionOver } from '../client/src/lib/sessionTime';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('sessionTime — Dubai-explicit clock (F3.6)', () => {
  it('TIMEZONE ARTIFACT: 2026-07-17T20:00:00Z IS July 18 in Dubai — naive slice(0,10) gets it wrong', () => {
    const stored = '2026-07-17T20:00:00.000Z'; // how session dates actually arrive
    expect(stored.slice(0, 10)).toBe('2026-07-17'); // the buggy naive read
    expect(dubaiCalendarDate(stored)).toBe('2026-07-18'); // the truth in Dubai
  });

  it('session end instant = Dubai calendar date + end_time at the fixed +04:00 offset', () => {
    // Tonight's real shape: date stored 2026-07-17T20:00Z, 18:00–21:00 session.
    const end = sessionEndInstant('2026-07-17T20:00:00.000Z', '18:00', '21:00');
    expect(end!.toISOString()).toBe('2026-07-18T17:00:00.000Z'); // 21:00 Dubai
  });

  it('isSessionOver flips exactly at the end instant, regardless of device timezone', () => {
    const date = '2026-07-17T20:00:00.000Z';
    const endMs = Date.parse('2026-07-18T17:00:00.000Z');
    expect(isSessionOver(date, '18:00', '21:00', endMs - 60_000)).toBe(false); // 20:59 Dubai
    expect(isSessionOver(date, '18:00', '21:00', endMs + 60_000)).toBe(true);  // 21:01 Dubai
  });

  it('overnight sessions (end < start) roll the end to the next day', () => {
    // Session's Dubai date is Jul 18; a 22:00–01:00 session ends 01:00 Dubai
    // on Jul 19, which is 21:00 UTC on Jul 18.
    const end = sessionEndInstant('2026-07-17T20:00:00.000Z', '22:00', '01:00');
    expect(end!.toISOString()).toBe('2026-07-18T21:00:00.000Z');
  });

  it('bad inputs are never "over" — a live session must not be hidden on bad data', () => {
    expect(isSessionOver('garbage', '18:00', '21:00')).toBe(false);
    expect(isSessionOver('2026-07-17T20:00:00Z', '18:00', 'garbage')).toBe(false);
    expect(sessionEndInstant('2026-07-17T20:00:00Z', '18:00', '99:99')).toBeNull();
  });
});

describe('dashboard restructure (tripwires)', () => {
  const dash = read('client/src/pages/marketplace/Dashboard.tsx');

  it('deleted sections are gone: tagged, personalities, leaderboard, skill trend, upcoming bookings, bottom find-next-game', () => {
    for (const t of ['card-received-tags', 'card-player-personalities', 'card-leaderboard', 'card-skill-trend', 'card-upcoming-bookings', 'button-find-session', 'card-my-referrals']) {
      expect(dash.includes(t), `${t} should be deleted from the dashboard`).toBe(false);
    }
    expect(dash.includes('recharts')).toBe(false); // chart library out of the dashboard bundle
    expect(dash.includes('CATEGORY_COLOR')).toBe(false); // off-palette chip variants dead
    expect(dash.includes('TagTrendingModal')).toBe(false);
  });

  it('TagTrendingModal file is deleted and unreferenced anywhere', () => {
    expect(existsSync(join(__dirname, '..', 'client/src/components/TagTrendingModal.tsx'))).toBe(false);
  });

  it('the five target sections survive: getting started (conditional), session card, feed (dashboard variant), stat row, referral teaser', () => {
    expect(dash.includes('card-getting-started')).toBe(true);
    expect(dash.includes('if (bookingsLoading || allDone || dismissed) return null;')).toBe(true); // gone once complete/dismissed
    expect(dash.includes('card-next-session')).toBe(true);
    expect(dash.includes('<CommunityFeed variant="dashboard" pinned={communityPinned} />')).toBe(true);
    expect(dash.includes('card-stats')).toBe(true);
    expect(dash.includes('card-referral-teaser')).toBe(true);
    expect(dash.includes('"/marketplace/referrals"')).toBe(true);
  });

  it('kept queries: tagged-games (tag nudge) and referral data; dead queries removed', () => {
    expect(dash.includes("'/api/tags/tagged-games'")).toBe(true);
    expect(dash.includes("'/api/referrals/player'")).toBe(true);
    expect(dash.includes('/api/tags/trending')).toBe(false);
    expect(dash.includes('/api/tags/received/recent')).toBe(false);
    expect(dash.includes("'/api/tags/player'")).toBe(false);
  });

  it('stale-state priority: ended session never shows the play CTA; next-bookable beats session-complete', () => {
    expect(dash.includes('isSessionOver(')).toBe(true);
    expect(dash.includes('todayBooking && !sessionOver')).toBe(true); // TODAY mode gated on not-over
    // session-complete only when NOTHING else to point at
    expect(dash.includes('todayBooking && sessionOver && !nextBooking && !nextAvailableSession')).toBe(true);
    expect(dash.includes('card-session-complete')).toBe(true);
    expect(dash.includes('button-session-highlights')).toBe(true);
    expect(dash.includes('"/marketplace/feed"')).toBe(true);
  });

  it('no-booking variant shows the soonest open session with spots left', () => {
    expect(dash.includes('Find your next game')).toBe(true);
    expect(dash.includes('spotsRemaining} spots left')).toBe(true);
    expect(dash.includes('Browse sessions')).toBe(true);
  });

  it('no emoji anywhere on the dashboard', () => {
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(dash)).toBe(false);
  });
});

describe('feed cap + FeedScreen (tripwires)', () => {
  const feed = read('client/src/pages/marketplace/CommunityFeed.tsx');
  const screen = read('client/src/pages/marketplace/FeedScreen.tsx');

  it('dashboard variant caps at 6 post-grouping items and swaps Show more for View all', () => {
    expect(feed.includes('DASHBOARD_FEED_CAP = 6')).toBe(true);
    expect(feed.includes("variant === 'dashboard' ? allEvents.slice(0, DASHBOARD_FEED_CAP)")).toBe(true);
    expect(feed.includes("variant === 'full' && hasNextPage")).toBe(true); // Show more only on the full screen
    expect(feed.includes('feed-view-all')).toBe(true);
    expect(feed.includes('href="/marketplace/feed"')).toBe(true);
  });

  it('FeedScreen mounts the full variant with back nav per app convention', () => {
    expect(screen.includes('<CommunityFeed variant="full" />')).toBe(true);
    expect(screen.includes('button-back')).toBe(true);
    expect(screen.includes('ArrowLeft')).toBe(true);
  });
});

describe('ReferralScreen — zero functionality lost (tripwires)', () => {
  const ref = read('client/src/pages/marketplace/ReferralScreen.tsx');

  it('carries the entire relocated block: wallet, code copy, share, ladder, referred list', () => {
    for (const t of ['text-wallet-balance', 'text-referral-code', 'button-copy-referral', 'button-share-referral', 'progress-referral-milestone', 'badge-ambassador', 'row-referral-']) {
      expect(ref.includes(t), `missing relocated ${t}`).toBe(true);
    }
    expect(ref.includes("'/api/referrals/player'")).toBe(true); // same query key — shared cache
  });

  it('apply-code mutation is wired with the same endpoint and eligibility (dismissal never removes the capability)', () => {
    expect(ref.includes("'/api/referrals/link'")).toBe(true);
    expect(ref.includes('input-apply-referral-code')).toBe(true);
    expect(ref.includes('button-apply-referral-code')).toBe(true);
    expect(ref.includes('!referralStatus.hasIncomingReferral')).toBe(true);
    // Capability not gated on nudge dismissal: the eligibility expression
    // must not reference dismissedAt (the interface declaring it is fine).
    const eligibility = ref.slice(ref.indexOf('const canApplyCode'), ref.indexOf('return ('));
    expect(eligibility.includes('dismissedAt')).toBe(false);
  });

  it('no emoji on either new screen', () => {
    const screen = read('client/src/pages/marketplace/FeedScreen.tsx');
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ref)).toBe(false);
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(screen)).toBe(false);
  });
});

describe('routes (tripwires)', () => {
  it('both new routes are registered behind marketplace auth', () => {
    const app = read('client/src/App.tsx');
    expect(app.includes('<Route path="/marketplace/feed">')).toBe(true);
    expect(app.includes('<MarketplaceAuthRoute component={FeedScreen} />')).toBe(true);
    expect(app.includes('<Route path="/marketplace/referrals">')).toBe(true);
    expect(app.includes('<MarketplaceAuthRoute component={ReferralScreen} />')).toBe(true);
  });
});
