/**
 * Design Gate 1, Batch 4 — error vs empty on the customer surfaces, and the
 * CheckoutSuccess blocking wait.
 *
 * Every customer query defaulted to [] and rendered its EMPTY state on failure
 * — an outage read as "No sessions scheduled right now — check back soon" /
 * "Find your next game" / "Link your player profile". A confident, wrong
 * sentence. Errored queries now render QueryErrorCard with Retry instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('MarketplaceHome — spotlight and hero sessions', () => {
  const src = stripComments(read('client/src/pages/marketplace/MarketplaceHome.tsx'));
  it('spotlight: destructures isError + refetch and renders the error card BEFORE the empty copy', () => {
    const q = src.slice(src.indexOf("queryKey: ['/api/tags/community-spotlight']") - 300, src.indexOf("queryKey: ['/api/tags/community-spotlight']"));
    expect(q).toMatch(/isError/); expect(q).toMatch(/refetch/);
    const iErr = src.indexOf('spotlightError ?');
    const iEmpty = src.indexOf('spotlight.length === 0');
    expect(iErr).toBeGreaterThan(-1); expect(iErr).toBeLessThan(iEmpty);
  });
  it('hero panel: an errored sessions fetch never says "No sessions scheduled right now"', () => {
    const q = src.slice(src.indexOf("queryKey: ['/api/marketplace/sessions']") - 300, src.indexOf("queryKey: ['/api/marketplace/sessions']"));
    expect(q).toMatch(/isError/); expect(q).toMatch(/refetch/);
    const iErr = src.indexOf('sessionsError ?');
    const iEmpty = src.indexOf('rows.length === 0');
    expect(iErr).toBeGreaterThan(-1); expect(iErr).toBeLessThan(iEmpty);
  });
  it('both use the shared QueryErrorCard', () => {
    expect(src).toMatch(/import \{[^}]*QueryErrorCard[^}]*\} from ['"]@\/components\/marketplace\/QueryErrorCard['"]/);
    expect((src.match(/<QueryErrorCard/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Dashboard — bookings, sessions, stats', () => {
  const src = stripComments(read('client/src/pages/marketplace/Dashboard.tsx'));
  it('bookings + availableSessions destructure isError; UnifiedSessionCard receives it and renders the error card first', () => {
    const b = src.slice(src.indexOf("queryKey: ['/api/marketplace/bookings/mine']") - 300, src.indexOf("queryKey: ['/api/marketplace/bookings/mine']"));
    expect(b).toMatch(/isError/);
    const s = src.slice(src.indexOf("queryKey: ['/api/marketplace/sessions']") - 300, src.indexOf("queryKey: ['/api/marketplace/sessions']"));
    expect(s).toMatch(/isError/);
    // prop threaded in
    expect(src).toMatch(/loadError:\s*boolean/);
    expect(src).toMatch(/loadError=\{/);
    // the card's error branch precedes its "Find your next game" empty branch
    const card = src.slice(src.indexOf('function UnifiedSessionCard'), src.indexOf('function UnifiedSessionCard') + 8000);
    const iErr = card.indexOf('loadError');
    const iEmpty = card.indexOf('empty-next-session');
    expect(iErr).toBeGreaterThan(-1); expect(iErr).toBeLessThan(iEmpty);
  });
  it('an errored stats fetch does NOT tell a linked player to "Link your player profile"', () => {
    const q = src.slice(src.indexOf("'stats']") - 300, src.indexOf("'stats']"));
    expect(q).toMatch(/isError:\s*statsError/);
    // the link-profile card is reachable only when stats is absent AND not errored
    const i = src.indexOf('button-link-profile');
    const branch = src.slice(src.lastIndexOf('stats ?', i), i);
    expect(branch).toMatch(/statsError/);
  });
});

describe('CheckoutSuccess — bounded wait, visible progress, cancellable redirect', () => {
  const src = read('client/src/pages/marketplace/CheckoutSuccess.tsx');
  it('an escape exists WHILE verifying (no 30s trap)', () => {
    // a Link to My Bookings is rendered inside a `status === 'verifying'` branch
    const i = src.indexOf('button-view-bookings-while-verifying');
    expect(i).toBeGreaterThan(-1);
    const branchStart = src.lastIndexOf("status === 'verifying' && (", i);
    expect(branchStart).toBeGreaterThan(-1);
    expect(src.slice(branchStart, i)).toMatch(/href="\/marketplace\/my-bookings"/);
  });
  it('the auto-redirect is cancellable and no longer 3 seconds', () => {
    expect(src).toMatch(/REDIRECT_DELAY_S = (8|9|10)/);
    expect(src).toMatch(/button-stay-here|stayHere|cancelRedirect/);
    // the interval effect honours the cancel flag
    const eff = src.slice(src.indexOf('let count = REDIRECT_DELAY_S'), src.indexOf('let count = REDIRECT_DELAY_S') + 900);
    expect(eff).toMatch(/redirectCancelled|stay/i);
  });
  it('swallowed retries are surfaced as progress, not silence', () => {
    // each failed attempt updates visible progress copy rather than being dropped
    const loop = src.slice(src.indexOf('for (let i = 0; i < MAX_ATTEMPTS'), src.indexOf('for (let i = 0; i < MAX_ATTEMPTS') + 2500);
    expect(loop).toMatch(/setAttempt\(/);
    expect(src).toMatch(/attempt\s*\+\s*1|of \$\{MAX_ATTEMPTS\}|of \{MAX_ATTEMPTS\}/);
  });
});
