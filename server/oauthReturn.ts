// Pure decision logic for where the Google OAuth callback sends the user after
// minting tokens. Extracted so the SECURITY-CRITICAL allowlist behaviour can be
// unit-tested without mocking the whole OAuth/Google/storage flow.
//
// The native Capacitor shell receives tokens via a custom-scheme deep link
// (com.shuttleiq.app://auth/callback?...). Tokens must ONLY ever be redirected
// to a scheme in the strict server-side allowlist — never to a scheme that
// merely arrived from the client. A non-allowlisted scheme falls through to the
// normal web redirect, so it can never exfiltrate tokens.

export function isSchemeAllowed(
  scheme: string | undefined | null,
  allowed: string[],
): scheme is string {
  return !!scheme && allowed.includes(scheme);
}

export function buildOAuthCallbackRedirect(input: {
  accessToken: string;
  refreshToken: string;
  returnPath?: string;
  returnScheme?: string;
  returnDomain?: string;
  allowedSchemes: string[];
  allowedDomains: string[];
}): string {
  const params = new URLSearchParams({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
  });
  if (input.returnPath) params.set('returnPath', input.returnPath);
  const qs = params.toString();

  // 1. Native deep-link return — highest priority, allowlisted schemes only.
  if (isSchemeAllowed(input.returnScheme, input.allowedSchemes)) {
    return `${input.returnScheme}://auth/callback?${qs}`;
  }

  // 2. Originating web domain (if it differs from canonical), allowlisted only.
  if (input.returnDomain && input.allowedDomains.includes(input.returnDomain)) {
    const proto = input.returnDomain.startsWith('localhost') ? 'http' : 'https';
    return `${proto}://${input.returnDomain}/marketplace/auth/callback?${qs}`;
  }

  // 3. Default relative web redirect — unchanged historical behaviour.
  return `/marketplace/auth/callback?${qs}`;
}
