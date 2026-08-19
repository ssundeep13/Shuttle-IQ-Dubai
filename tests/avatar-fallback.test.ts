// Gate FV.1a — dead-avatar fallback + /uploads 404 + cache-buster. Pure
// helpers unit-tested; component wiring, the 404 handler and the two site
// replacements locked as tripwires with live production verification behind.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { initialsOf, avatarSrc } from '../client/src/components/BrandAvatar';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('avatarSrc — cache-buster (FV.1a)', () => {
  it('appends v=2 to locally-hosted /uploads URLs (30-day-cached HTML shells must refetch)', () => {
    expect(avatarSrc('/uploads/profile/abc.webp')).toBe('/uploads/profile/abc.webp?v=2');
    expect(avatarSrc('/uploads/profile/abc.webp?w=96')).toBe('/uploads/profile/abc.webp?w=96&v=2');
  });

  it('leaves Google-hosted and absolute URLs untouched', () => {
    const g = 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c';
    expect(avatarSrc(g)).toBe(g);
    expect(avatarSrc('https://example.com/x.png')).toBe('https://example.com/x.png');
  });
});

describe('initialsOf', () => {
  it('two-word names give two initials; single names one; empty gives placeholder', () => {
    expect(initialsOf('Farhan Aslam')).toBe('FA');
    expect(initialsOf('Darshan')).toBe('D');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });
});

describe('BrandAvatar component (tripwires)', () => {
  const src = read('client/src/components/BrandAvatar.tsx');

  it('falls back on load error AND on null URL; brand style navy/white/Inter 600, no emoji/icons', () => {
    expect(src.includes('onError={() => setFailed(true)}')).toBe(true);
    expect(src.includes('photoUrl && !failed')).toBe(true);
    expect(src.includes("background: NAVY")).toBe(true);
    expect(src.includes("const NAVY = '#002C84'")).toBe(true); // Design Gate 2: true brand navy (was drifted #003E8C)
    expect(src.includes('fontWeight: 600')).toBe(true);
    expect(src.includes("'Inter'")).toBe(true);
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src)).toBe(false);
    expect(src.includes('lucide')).toBe(false);
  });

  it('photo path goes through the cache-buster', () => {
    expect(src.includes('src={avatarSrc(photoUrl)}')).toBe(true);
  });
});

describe('the two bare-img sites use BrandAvatar (tripwires)', () => {
  it('MarketplaceHome Community Spotlight', () => {
    const s = read('client/src/pages/marketplace/MarketplaceHome.tsx');
    expect(s.includes('<BrandAvatar photoUrl={player.photoUrl}')).toBe(true);
    expect(s.includes('img-spotlight-')).toBe(true); // testid preserved
    expect(s.includes('<img src={player.photoUrl}')).toBe(false); // bare img gone
  });

  it('Rankings recruiter leaderboard', () => {
    const s = read('client/src/pages/marketplace/Rankings.tsx');
    expect(s.includes('<BrandAvatar photoUrl={recruiter.photoUrl}')).toBe(true);
    expect(s.includes('img-recruiter-')).toBe(true);
    expect(s.includes('src={recruiter.photoUrl}')).toBe(false);
  });
});

describe('/uploads 404 handler (tripwires)', () => {
  it('registered AFTER the static mount, returns 404 with no-store, never the SPA shell', () => {
    const s = read('server/index.ts');
    const staticAt = s.indexOf('express.static(UPLOADS_ROOT');
    const h404 = s.indexOf('app.use("/uploads", (_req, res) => {');
    expect(staticAt).toBeGreaterThan(-1);
    expect(h404).toBeGreaterThan(staticAt); // miss falls from static into the 404
    const handler = s.slice(h404, h404 + 300);
    expect(handler.includes('res.setHeader("Cache-Control", "no-store")')).toBe(true);
    expect(handler.includes('res.status(404)')).toBe(true);
  });
});
