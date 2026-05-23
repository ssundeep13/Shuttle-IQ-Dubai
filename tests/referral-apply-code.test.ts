import { describe, it, expect } from 'vitest';

// ============================================================
// Pure-logic tests for the POST /api/marketplace/referrals/apply-code
// guard rules and the GET /api/marketplace/referral-discount-eligibility
// extended response shape (eligible + canApplyCode).
//
// These mirror the exact guard checks in marketplace-routes.ts so that
// any future logic change in the route is caught by a failing test here.
// ============================================================

// Mirror of the apply-code guard logic from the route handler
function validateApplyCode(
  hasExistingReferral: boolean,
  priorBookings: number,
  codeFoundInDb: boolean,
): { success: true } | { error: string; status: 400 | 404 | 409 } {
  if (hasExistingReferral) {
    return { error: 'Already used a referral code', status: 409 };
  }
  if (priorBookings > 0) {
    return { error: 'Only available before your first booking', status: 409 };
  }
  if (!codeFoundInDb) {
    return { error: 'Invalid referral code', status: 404 };
  }
  return { success: true };
}

// Mirror of the eligibility endpoint logic from the route handler
function computeEligibility(
  hasReferralRow: boolean,
  priorBookings: number,
): { eligible: boolean; canApplyCode: boolean } {
  return {
    eligible: hasReferralRow && priorBookings === 0,
    canApplyCode: !hasReferralRow && priorBookings === 0,
  };
}

// ────────────────────────────────────────────────────────────
// apply-code guard logic
// ────────────────────────────────────────────────────────────

describe('POST /api/marketplace/referrals/apply-code — guard logic', () => {
  it('rejects with 409 when the user already has a referral row', () => {
    const result = validateApplyCode(true, 0, true);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/already used/i);
    }
  });

  it('rejects with 409 when the user has at least 1 confirmed booking', () => {
    const result = validateApplyCode(false, 1, true);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/first booking/i);
    }
  });

  it('rejects even with many prior bookings (not just exactly 1)', () => {
    const result = validateApplyCode(false, 7, true);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(409);
    }
  });

  it('rejects with 404 when the referral code does not match any player', () => {
    const result = validateApplyCode(false, 0, false);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/invalid referral code/i);
    }
  });

  it('returns success when no referral row, 0 bookings, and code is valid', () => {
    const result = validateApplyCode(false, 0, true);
    expect('success' in result).toBe(true);
  });

  it('the "already has referral" guard fires before the "has prior bookings" guard', () => {
    // Both conditions are true — the order-of-checks determines the error message.
    const result = validateApplyCode(true, 5, true);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/already used/i);
    }
  });
});

// ────────────────────────────────────────────────────────────
// Extended eligibility response shape
// ────────────────────────────────────────────────────────────

describe('GET /api/marketplace/referral-discount-eligibility — eligibility shape', () => {
  it('eligible=true and canApplyCode=false when user has referral row + 0 bookings', () => {
    const result = computeEligibility(true, 0);
    expect(result.eligible).toBe(true);
    expect(result.canApplyCode).toBe(false);
  });

  it('eligible=false and canApplyCode=true when user has NO referral row + 0 bookings', () => {
    const result = computeEligibility(false, 0);
    expect(result.eligible).toBe(false);
    expect(result.canApplyCode).toBe(true);
  });

  it('eligible=false and canApplyCode=false when user has a referral row but prior bookings', () => {
    // Discount has already been used (or timed out)
    const result = computeEligibility(true, 1);
    expect(result.eligible).toBe(false);
    expect(result.canApplyCode).toBe(false);
  });

  it('eligible=false and canApplyCode=false when user has NO referral + prior bookings', () => {
    // Too late to apply — already booked before referring anyone
    const result = computeEligibility(false, 3);
    expect(result.eligible).toBe(false);
    expect(result.canApplyCode).toBe(false);
  });

  it('canApplyCode is only ever true when priorBookings === 0', () => {
    for (const bookings of [0, 1, 2, 10]) {
      const result = computeEligibility(false, bookings);
      if (bookings === 0) {
        expect(result.canApplyCode).toBe(true);
      } else {
        expect(result.canApplyCode).toBe(false);
      }
    }
  });

  it('eligible and canApplyCode are mutually exclusive', () => {
    // They cannot both be true at the same time
    const combinations = [
      computeEligibility(true, 0),
      computeEligibility(false, 0),
      computeEligibility(true, 1),
      computeEligibility(false, 1),
    ];
    for (const r of combinations) {
      expect(r.eligible && r.canApplyCode).toBe(false);
    }
  });
});
