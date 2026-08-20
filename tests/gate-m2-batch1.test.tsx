/**
 * Gate M2 Batch 1 — correctness-grade wayfinding one-liners (Emil audit
 * .claude/skills/AUDIT-2026-08-19-gate0b-emil-apple-design.md).
 *
 * #66 dead link, #67 scroll reset, #41 ?from= preservation, #37 stats
 * loading-as-empty, #39 RootRedirect blank frames.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('#66 — empty-feed CTA links to a route that exists', () => {
  const src = read('client/src/pages/marketplace/CommunityFeed.tsx');
  it('feed-empty-book-link points at /marketplace/book (the /marketplace/sessions browse route does not exist)', () => {
    const i = src.indexOf('feed-empty-book-link');
    const around = src.slice(i - 300, i + 50);
    expect(around).toContain('href="/marketplace/book"');
    expect(src).not.toContain('href="/marketplace/sessions"');
  });
});

describe('#67 — scroll resets on route change (§16 wayfinding)', () => {
  const app = read('client/src/App.tsx');
  it('a ScrollReset lives inside Router: wouter location + useLayoutEffect + scrollTo(0, 0)', () => {
    expect(app).toMatch(/function ScrollReset\(/);
    // before paint, so no visible jump
    expect(app).toMatch(/useLayoutEffect\(\(\) => \{\s*window\.scrollTo\(0, 0\);\s*\}, \[location\]\)/);
    // rendered inside the Router tree
    expect(app).toMatch(/<ScrollReset \/>/);
  });
});

describe('#41 — login/signup honour ?from= like the Google path already does', () => {
  const login = read('client/src/pages/marketplace/MarketplaceLogin.tsx');
  const signup = read('client/src/pages/marketplace/MarketplaceSignup.tsx');
  it('email/password login lands on from= (validated prefix) or the dashboard — never the marketing page', () => {
    expect(login).not.toMatch(/setLocation\('\/marketplace'\)/);
    expect(login).toMatch(/startsWith\('\/marketplace\/'\)/);
    expect(login).toMatch(/'\/marketplace\/dashboard'/);
  });
  it('signup does the same', () => {
    expect(signup).not.toMatch(/setLocation\('\/marketplace'\)/);
    expect(signup).toMatch(/startsWith\('\/marketplace\/'\)/);
    expect(signup).toMatch(/'\/marketplace\/dashboard'/);
  });
});

describe('#37 — Dashboard stats: loading is a loading state, not the link-profile empty state', () => {
  const src = read('client/src/pages/marketplace/Dashboard.tsx');
  it('destructures isLoading from the stats query', () => {
    const q = src.slice(src.indexOf("useQuery<PlayerStats>"), src.indexOf("useQuery<PlayerStats>") + 400);
    expect(src).toMatch(/isLoading:\s*statsLoading/);
    expect(q).toContain("queryKey: ['/api/players', linkedPlayerId, 'stats']");
  });
  it('renders skeleton tiles for the loading branch BEFORE the statsError/empty branches', () => {
    const loadIdx = src.indexOf('statsLoading ?');
    const errIdx = src.indexOf('statsError ?');
    expect(loadIdx).toBeGreaterThan(0);
    expect(errIdx).toBeGreaterThan(loadIdx); // loading checked first
    // DashCard's testid prop renders as data-testid
    expect(src).toMatch(/(data-)?testid="skeleton-stats"/);
  });
});

describe('#39 — RootRedirect never paints an unbranded or blank frame', () => {
  const src = read('client/src/components/RootRedirect.tsx');
  it('no bare "Loading..." text and no null return for authenticated users', () => {
    expect(src).not.toContain('>Loading...<');
    expect(src).not.toMatch(/return null;/);
  });
  it('renders a branded shell (Wordmark on the cream token) while resolving/redirecting', () => {
    expect(src).toMatch(/import \{ Wordmark \}/);
    expect(src).toContain('data-testid="root-loading"');
  });
});
