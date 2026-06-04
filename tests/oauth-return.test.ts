/**
 * Capacitor OAuth (prep #3 part 1) — allowlist proof.
 *
 * The native shell receives access/refresh tokens via a custom-scheme deep
 * link. These tests prove tokens are ONLY ever redirected to an allowlisted
 * scheme, and that absent/forged schemes fall back to the unchanged web
 * behaviour — i.e. tokens can never be exfiltrated to an attacker scheme.
 */
import { describe, it, expect } from 'vitest';
import { buildOAuthCallbackRedirect, isSchemeAllowed } from '../server/oauthReturn';

const ALLOWED_SCHEMES = ['com.shuttleiq.app'];
const ALLOWED_DOMAINS = ['shuttleiq.org', 'localhost:5000', 'localhost'];
const TOKENS = { accessToken: 'ACCESS_TOK', refreshToken: 'REFRESH_TOK' };

describe('isSchemeAllowed', () => {
  it('accepts an allowlisted scheme', () => {
    expect(isSchemeAllowed('com.shuttleiq.app', ALLOWED_SCHEMES)).toBe(true);
  });
  it('rejects a non-allowlisted scheme', () => {
    expect(isSchemeAllowed('evil.app', ALLOWED_SCHEMES)).toBe(false);
  });
  it('rejects undefined/empty', () => {
    expect(isSchemeAllowed(undefined, ALLOWED_SCHEMES)).toBe(false);
    expect(isSchemeAllowed('', ALLOWED_SCHEMES)).toBe(false);
  });
});

describe('buildOAuthCallbackRedirect — allowlist proof', () => {
  // (a) allowlisted native scheme → deep-link with tokens
  it('(a) allowlisted returnScheme → com.shuttleiq.app://auth/callback with tokens', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      returnPath: '/marketplace/dashboard',
      returnScheme: 'com.shuttleiq.app',
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url.startsWith('com.shuttleiq.app://auth/callback?')).toBe(true);
    expect(url).toContain('accessToken=ACCESS_TOK');
    expect(url).toContain('refreshToken=REFRESH_TOK');
    expect(url).toContain('returnPath=%2Fmarketplace%2Fdashboard');
  });

  // (b) non-allowlisted scheme → tokens NEVER go to that scheme; safe web fallback
  it('(b) evil.app:// returnScheme → does NOT emit tokens to evil.app, falls back to web', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      returnScheme: 'evil.app',
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url).not.toContain('evil.app');             // tokens never reach the attacker scheme
    expect(url.startsWith('/marketplace/auth/callback?')).toBe(true); // safe web fallback
    expect(url).toContain('accessToken=ACCESS_TOK');   // tokens still delivered via the safe path
  });

  it('(b2) evil scheme does not win even when an allowlisted web returnDomain is also present', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      returnScheme: 'evil.app',
      returnDomain: 'shuttleiq.org',
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url).not.toContain('evil.app');
    expect(url.startsWith('https://shuttleiq.org/marketplace/auth/callback?')).toBe(true);
  });

  // (c) no returnScheme → unchanged https web redirect (or relative default)
  it('(c) no returnScheme + allowlisted returnDomain → unchanged https web redirect', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      returnDomain: 'shuttleiq.org',
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url).toBe(
      `https://shuttleiq.org/marketplace/auth/callback?accessToken=ACCESS_TOK&refreshToken=REFRESH_TOK`,
    );
  });

  it('(c2) no returnScheme + no returnDomain → relative web redirect (historical default)', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url).toBe(`/marketplace/auth/callback?accessToken=ACCESS_TOK&refreshToken=REFRESH_TOK`);
  });

  it('localhost returnDomain uses http (dev parity)', () => {
    const url = buildOAuthCallbackRedirect({
      ...TOKENS,
      returnDomain: 'localhost:5000',
      allowedSchemes: ALLOWED_SCHEMES,
      allowedDomains: ALLOWED_DOMAINS,
    });
    expect(url.startsWith('http://localhost:5000/marketplace/auth/callback?')).toBe(true);
  });
});
