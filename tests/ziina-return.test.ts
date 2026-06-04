/**
 * Capacitor prep #3 part 2 — Ziina return-URL allowlist proof.
 *
 * Asserts the payment intent's success/cancel/failure URLs swap to the
 * com.shuttleiq.app://checkout/… scheme ONLY when a validated native marker is
 * present, stay as the unchanged https URLs otherwise, and never emit a
 * non-allowlisted scheme. This is RETURN-PATH ONLY — no amount logic is in this
 * module or these tests.
 */
import { describe, it, expect } from 'vitest';
import { buildZiinaReturnUrls, resolveNativeScheme } from '../server/ziinaReturn';

const ALLOWED = ['com.shuttleiq.app'];
const BASE = 'https://shuttleiq.org';
const BID = 'bk_123';

describe('resolveNativeScheme', () => {
  it('returns the scheme when allowlisted', () => {
    expect(resolveNativeScheme('com.shuttleiq.app', ALLOWED)).toBe('com.shuttleiq.app');
  });
  it('returns null for a non-allowlisted scheme', () => {
    expect(resolveNativeScheme('evil.app', ALLOWED)).toBeNull();
  });
  it('returns null when absent', () => {
    expect(resolveNativeScheme(undefined, ALLOWED)).toBeNull();
  });
});

describe('buildZiinaReturnUrls — web (no native marker) is unchanged', () => {
  it('emits the historical https URLs when no returnScheme', () => {
    const u = buildZiinaReturnUrls({ baseUrl: BASE, bookingId: BID, resumeParam: '', allowedSchemes: ALLOWED });
    expect(u.successUrl).toBe(`https://shuttleiq.org/marketplace/checkout/success?booking_id=bk_123`);
    expect(u.cancelUrl).toBe(`https://shuttleiq.org/marketplace/checkout/cancel?booking_id=bk_123`);
    expect(u.failureUrl).toBe(`https://shuttleiq.org/marketplace/checkout/cancel?booking_id=bk_123&failed=1`);
  });

  it('preserves resume param + extra_guest verbatim on the web path', () => {
    const u = buildZiinaReturnUrls({
      baseUrl: BASE, bookingId: BID, resumeParam: '&resume=tok', extraGuest: true, allowedSchemes: ALLOWED,
    });
    expect(u.successUrl).toBe(
      `https://shuttleiq.org/marketplace/checkout/success?booking_id=bk_123&extra_guest=1&resume=tok`,
    );
  });
});

describe('buildZiinaReturnUrls — native (validated marker) swaps origin only', () => {
  it('uses com.shuttleiq.app://checkout/… when returnScheme is allowlisted', () => {
    const u = buildZiinaReturnUrls({
      baseUrl: BASE, bookingId: BID, resumeParam: '', returnScheme: 'com.shuttleiq.app', allowedSchemes: ALLOWED,
    });
    expect(u.successUrl).toBe(`com.shuttleiq.app://checkout/success?booking_id=bk_123`);
    expect(u.cancelUrl).toBe(`com.shuttleiq.app://checkout/cancel?booking_id=bk_123`);
    expect(u.failureUrl).toBe(`com.shuttleiq.app://checkout/cancel?booking_id=bk_123&failed=1`);
  });

  it('keeps the same query params (booking_id/extra_guest/resume) — origin is the only change', () => {
    const web = buildZiinaReturnUrls({
      baseUrl: BASE, bookingId: BID, resumeParam: '&resume=tok', extraGuest: true, allowedSchemes: ALLOWED,
    });
    const native = buildZiinaReturnUrls({
      baseUrl: BASE, bookingId: BID, resumeParam: '&resume=tok', extraGuest: true,
      returnScheme: 'com.shuttleiq.app', allowedSchemes: ALLOWED,
    });
    // Same path+query after the origin → only the prefix differs.
    expect(web.successUrl.replace('https://shuttleiq.org/marketplace/', '')).toBe(
      native.successUrl.replace('com.shuttleiq.app://', ''),
    );
    expect(native.successUrl).toContain('booking_id=bk_123&extra_guest=1&resume=tok');
  });
});

describe('buildZiinaReturnUrls — allowlist rejection', () => {
  it('a non-allowlisted scheme is NOT emitted; falls back to https', () => {
    const u = buildZiinaReturnUrls({
      baseUrl: BASE, bookingId: BID, resumeParam: '', returnScheme: 'evil.app', allowedSchemes: ALLOWED,
    });
    expect(u.successUrl).not.toContain('evil.app');
    expect(u.cancelUrl).not.toContain('evil.app');
    expect(u.failureUrl).not.toContain('evil.app');
    expect(u.successUrl.startsWith('https://shuttleiq.org/marketplace/checkout/')).toBe(true);
  });
});
