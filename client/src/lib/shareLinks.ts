// Canonical base for EXTERNALLY-SHARED links (referral codes, profile links,
// share-sheet URLs). A shared link must always point at the public site,
// regardless of where it was generated:
//  • Web: window.location.origin is already https://shuttleiq.org, so the
//    resulting string is identical to before — web behaviour is unchanged.
//  • Native shell: the origin would be capacitor://localhost / http://localhost,
//    which would produce a link pointing into the user's own phone. Using the
//    canonical base fixes that.
//
// This is ONLY for link strings that get copied/shared. In-app navigation and
// routing stay relative and are not affected.
export const CANONICAL_ORIGIN = 'https://shuttleiq.org';

// Build a shareable absolute URL for a given app path (e.g. '/marketplace/...').
export function shareUrl(path: string): string {
  return `${CANONICAL_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

// Shareable absolute URL for the CURRENT page — canonical origin + the current
// path/query (replaces a bare window.location.href, which is wrong natively).
export function shareCurrentPageUrl(): string {
  return `${CANONICAL_ORIGIN}${window.location.pathname}${window.location.search}`;
}
