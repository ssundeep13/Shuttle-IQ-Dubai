// Finance-portal token identity (Phase 2). DELIBERATELY separate from the main app's
// auth (server/auth/utils.ts): a different secret (PORTAL_JWT_SECRET) and an audience
// claim ('portal'). Because the secrets differ, a main-app JWT presented to a portal
// endpoint fails signature verification (→ null), and a portal JWT presented to a
// main-app endpoint likewise fails. That mutual-unverifiability IS the wall; the aud
// check is a second belt-and-suspenders guard.
//
// FAIL CLOSED: if PORTAL_JWT_SECRET is unset we do NOT throw at import (that would take
// the whole app down) and we NEVER fall back to JWT_SECRET. Instead signing throws and
// verification returns null, so the login route reports a 500 "not configured".
import jwt from 'jsonwebtoken';

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;
const PORTAL_AUDIENCE = 'portal';

export interface PortalJWTPayload {
  portalUserId: string;
  email: string;
  aud: string;
}

export function isPortalConfigured(): boolean {
  return !!(PORTAL_JWT_SECRET && PORTAL_JWT_SECRET.length > 0);
}

export function signPortalToken(payload: { portalUserId: string; email: string }): string {
  if (!PORTAL_JWT_SECRET) {
    throw new Error('[Portal] PORTAL_JWT_SECRET is not set — cannot sign portal tokens.');
  }
  return jwt.sign(
    { portalUserId: payload.portalUserId, email: payload.email },
    PORTAL_JWT_SECRET,
    { expiresIn: '8h', audience: PORTAL_AUDIENCE },
  );
}

export function verifyPortalToken(token: string): PortalJWTPayload | null {
  if (!PORTAL_JWT_SECRET) return null; // fail closed; never try JWT_SECRET
  try {
    const decoded = jwt.verify(token, PORTAL_JWT_SECRET, { audience: PORTAL_AUDIENCE }) as PortalJWTPayload;
    if (decoded.aud !== PORTAL_AUDIENCE) return null;
    return decoded;
  } catch {
    return null;
  }
}
