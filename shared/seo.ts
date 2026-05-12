// Single source of truth for which routes should NOT be indexed by search
// engines. Consumed by:
//   - server/index.ts — emits X-Robots-Tag: noindex for non-JS crawlers
//   - client/src/components/RobotsMetaController.tsx — overrides the default
//     <meta name="robots" content="index,follow"> for JS-rendering crawlers
//   - client/public/robots.txt — Disallow rules (kept in sync manually; see
//     tests/seo-robots-meta.test.tsx for the parity assertion)
export const NOINDEX_PATH_PATTERNS: { source: string; flags?: string }[] = [
  { source: '^/admin(/|$)' },
  { source: '^/login$' },
  { source: '^/players$' },
  { source: '^/session/' },
  { source: '^/player/' },
  { source: '^/marketplace/checkout(/|$)' },
  { source: '^/marketplace/guest-cancel' },
  { source: '^/marketplace/guests/' },
  { source: '^/marketplace/auth/' },
  { source: '^/marketplace/players/[^/]+/personality-card$' },
  { source: '^/marketplace/dashboard$' },
  { source: '^/marketplace/my-bookings$' },
  { source: '^/marketplace/my-scores$' },
  { source: '^/marketplace/game-history$' },
  { source: '^/marketplace/profile$' },
  { source: '^/carousel$' },
  { source: '^/features-carousel$' },
  { source: '^/instagram-leaderboard$' },
  { source: '^/screenshot-harness$' },
  { source: '^/welcome$' },
];

export const NOINDEX_REGEXES: RegExp[] = NOINDEX_PATH_PATTERNS.map(
  (p) => new RegExp(p.source, p.flags),
);

export function isNoindexPath(path: string): boolean {
  return NOINDEX_REGEXES.some((re) => re.test(path));
}

// Robots.txt Disallow lines — keep in sync with the patterns above. Static
// strings (not regexes) since robots.txt only supports prefix wildcards.
export const ROBOTS_TXT_DISALLOW: string[] = [
  '/admin/',
  '/session/',
  '/player/',
  '/players',
  '/login',
  '/marketplace/checkout/',
  '/marketplace/guest-cancel',
  '/marketplace/guests/',
  '/marketplace/auth/',
  '/marketplace/dashboard',
  '/marketplace/my-bookings',
  '/marketplace/my-scores',
  '/marketplace/game-history',
  '/marketplace/profile',
  '/carousel',
  '/features-carousel',
  '/instagram-leaderboard',
  '/screenshot-harness',
  '/welcome',
];
