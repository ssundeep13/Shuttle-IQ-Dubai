// Pure return-URL construction for Ziina payment intents (Capacitor prep #3
// part 2). Extracted so the RETURN-PATH-ONLY behaviour and the allowlist guard
// can be unit-tested without the booking route's money logic.
//
// MONEY-SAFETY: this module builds ONLY the success/cancel/failure URLs Ziina
// sends the user back to. It does not see or touch amounts, wallet credit, or
// refunds. Only the URL *origin* changes between web (https) and native (an
// allowlisted custom scheme); every query param (booking_id, extra_guest,
// resume, failed) is identical in both. Booking confirmation remains server-
// side via the Ziina webhook + booking_id lookup, unchanged.
import { isSchemeAllowed } from './oauthReturn';

// Returns the native deep-link scheme ONLY if the client-supplied value is in
// the strict allowlist; otherwise null (→ normal https web return URLs). Tokens
// of trust never extend to an un-allowlisted scheme.
export function resolveNativeScheme(
  returnScheme: string | undefined | null,
  allowedSchemes: string[],
): string | null {
  return isSchemeAllowed(returnScheme, allowedSchemes) ? returnScheme : null;
}

export function buildZiinaReturnUrls(input: {
  baseUrl: string;
  bookingId: string;
  resumeParam?: string;   // e.g. '&resume=abc' or '' — preserved verbatim
  extraGuest?: boolean;   // adds &extra_guest=1 to successUrl (add-guest flow)
  returnScheme?: string;  // client-supplied; honoured only if allowlisted
  allowedSchemes: string[];
}): { successUrl: string; cancelUrl: string; failureUrl: string } {
  const nativeScheme = resolveNativeScheme(input.returnScheme, input.allowedSchemes);
  const resume = input.resumeParam || '';
  const extra = input.extraGuest ? '&extra_guest=1' : '';
  // Web: ${baseUrl}/marketplace/checkout/…   Native: com.shuttleiq.app://checkout/…
  const prefix = nativeScheme
    ? `${nativeScheme}://checkout/`
    : `${input.baseUrl}/marketplace/checkout/`;
  return {
    successUrl: `${prefix}success?booking_id=${input.bookingId}${extra}${resume}`,
    cancelUrl: `${prefix}cancel?booking_id=${input.bookingId}`,
    failureUrl: `${prefix}cancel?booking_id=${input.bookingId}&failed=1`,
  };
}
