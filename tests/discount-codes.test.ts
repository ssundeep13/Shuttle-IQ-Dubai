import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Unit tests for discount code validation logic
// These tests exercise the pure validation rules without
// requiring a real database connection.
// ============================================================

// Mirror of the validation logic from DatabaseStorage.validateDiscountCode
function computeDiscountAmount(discountType: 'percentage' | 'fixed_aed', discountValue: number, sessionPriceAed: number): number {
  if (discountType === 'percentage') {
    return Math.floor((sessionPriceAed * discountValue) / 100);
  }
  return Math.min(discountValue, sessionPriceAed);
}

function validateCodeRules(
  code: {
    isActive: boolean;
    expiresAt: Date | null;
    maxUses: number | null;
    usedCount: number;
    firstTimeOnly: boolean;
    discountType: 'percentage' | 'fixed_aed';
    discountValue: number;
  },
  priorConfirmedBookings: number,
  sessionPriceAed: number,
  now: Date = new Date(),
): { valid: true; discountAmountAed: number } | { valid: false; error: string } {
  if (!code.isActive) return { valid: false, error: 'This discount code is no longer active' };
  if (code.expiresAt && now > code.expiresAt) return { valid: false, error: 'This discount code has expired' };
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return { valid: false, error: 'This discount code has reached its usage limit' };
  }
  if (code.firstTimeOnly && priorConfirmedBookings > 0) {
    return { valid: false, error: 'This code is for first-time players only' };
  }
  const discountAmountAed = computeDiscountAmount(code.discountType, code.discountValue, sessionPriceAed);
  return { valid: true, discountAmountAed };
}

const NEWBIE_CODE = {
  isActive: true,
  expiresAt: null,
  maxUses: null,
  usedCount: 0,
  firstTimeOnly: true,
  discountType: 'percentage' as const,
  discountValue: 50,
};

describe('Discount code validation rules', () => {
  const SESSION_PRICE = 100; // AED

  describe('NEWBIE code — happy path (first-time player)', () => {
    it('returns valid with 50% discount for a first-time player', () => {
      const result = validateCodeRules(NEWBIE_CODE, 0, SESSION_PRICE);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.discountAmountAed).toBe(50);
      }
    });

    it('calculates 50% of an odd price using floor', () => {
      const result = validateCodeRules(NEWBIE_CODE, 0, 75);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.discountAmountAed).toBe(37); // floor(75 * 50 / 100)
      }
    });

    it('caps the discount at the full session price (100% discount would be max)', () => {
      const fullDiscountCode = { ...NEWBIE_CODE, discountValue: 100 };
      const result = validateCodeRules(fullDiscountCode, 0, 50);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.discountAmountAed).toBe(50);
      }
    });
  });

  describe('NEWBIE code — first-time-only rejection', () => {
    it('rejects when user already has 1 confirmed booking', () => {
      const result = validateCodeRules(NEWBIE_CODE, 1, SESSION_PRICE);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/first-time/i);
      }
    });

    it('rejects when user has multiple prior bookings', () => {
      const result = validateCodeRules(NEWBIE_CODE, 5, SESSION_PRICE);
      expect(result.valid).toBe(false);
    });

    it('allows a non-first-time-only code for returning players', () => {
      const openCode = { ...NEWBIE_CODE, firstTimeOnly: false };
      const result = validateCodeRules(openCode, 3, SESSION_PRICE);
      expect(result.valid).toBe(true);
    });
  });

  describe('Expired code', () => {
    it('rejects a code whose expiry is in the past', () => {
      const pastDate = new Date('2020-01-01T00:00:00Z');
      const expiredCode = { ...NEWBIE_CODE, expiresAt: pastDate, firstTimeOnly: false };
      const result = validateCodeRules(expiredCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/expired/i);
      }
    });

    it('accepts a code whose expiry is in the future', () => {
      const futureDate = new Date('2099-01-01T00:00:00Z');
      const futureCode = { ...NEWBIE_CODE, expiresAt: futureDate, firstTimeOnly: false };
      const result = validateCodeRules(futureCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(true);
    });

    it('accepts a code with no expiry (expiresAt = null)', () => {
      const result = validateCodeRules({ ...NEWBIE_CODE, firstTimeOnly: false }, 0, SESSION_PRICE);
      expect(result.valid).toBe(true);
    });
  });

  describe('Max-uses exhausted', () => {
    it('rejects when usedCount equals maxUses', () => {
      const cappedCode = { ...NEWBIE_CODE, maxUses: 10, usedCount: 10, firstTimeOnly: false };
      const result = validateCodeRules(cappedCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/usage limit/i);
      }
    });

    it('rejects when usedCount exceeds maxUses', () => {
      const overCode = { ...NEWBIE_CODE, maxUses: 5, usedCount: 7, firstTimeOnly: false };
      const result = validateCodeRules(overCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(false);
    });

    it('accepts when usedCount is below maxUses', () => {
      const partialCode = { ...NEWBIE_CODE, maxUses: 10, usedCount: 9, firstTimeOnly: false };
      const result = validateCodeRules(partialCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(true);
    });

    it('accepts when maxUses is null (unlimited)', () => {
      const unlimitedCode = { ...NEWBIE_CODE, maxUses: null, usedCount: 999, firstTimeOnly: false };
      const result = validateCodeRules(unlimitedCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(true);
    });
  });

  describe('Inactive code', () => {
    it('rejects inactive codes immediately', () => {
      const inactiveCode = { ...NEWBIE_CODE, isActive: false, firstTimeOnly: false };
      const result = validateCodeRules(inactiveCode, 0, SESSION_PRICE);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/no longer active/i);
      }
    });
  });

  describe('Fixed AED discount type', () => {
    it('returns the fixed amount when smaller than session price', () => {
      const fixedCode = {
        ...NEWBIE_CODE,
        discountType: 'fixed_aed' as const,
        discountValue: 25,
        firstTimeOnly: false,
      };
      const result = validateCodeRules(fixedCode, 0, 100);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.discountAmountAed).toBe(25);
      }
    });

    it('caps the fixed discount at the session price', () => {
      const bigFixedCode = {
        ...NEWBIE_CODE,
        discountType: 'fixed_aed' as const,
        discountValue: 200,
        firstTimeOnly: false,
      };
      const result = validateCodeRules(bigFixedCode, 0, 50);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.discountAmountAed).toBe(50); // capped at session price
      }
    });
  });
});

// ============================================================
// Checkout booking math — discount reduces total before wallet
// ============================================================

describe('Checkout booking discount math', () => {
  it('applies discount to reduce total before wallet credit', () => {
    const pricePerSpot = 100;
    const spotsBooked = 2;
    const discountAmountAed = 50;

    const totalAmount = pricePerSpot * spotsBooked; // 200
    const discountedTotal = Math.max(0, totalAmount - discountAmountAed); // 150
    const walletBalanceFils = 10000; // AED 100 in fils
    const walletApplicableFils = Math.min(walletBalanceFils, discountedTotal * 100); // 10000 fils = AED 100
    const remainingFils = discountedTotal * 100 - walletApplicableFils; // 50 * 100 = 5000 fils

    expect(discountedTotal).toBe(150);
    expect(walletApplicableFils).toBe(10000); // AED 100 of wallet applied
    expect(remainingFils).toBe(5000); // AED 50 remaining for Ziina
  });

  it('discount reduces total to zero when discount >= session price', () => {
    const totalAmount = 50;
    const discountAmountAed = 60; // larger than price
    const discountedTotal = Math.max(0, totalAmount - discountAmountAed);

    expect(discountedTotal).toBe(0);
  });

  it('no discount leaves total unchanged', () => {
    const totalAmount = 100;
    const discountAmountAed = 0;
    const discountedTotal = Math.max(0, totalAmount - discountAmountAed);

    expect(discountedTotal).toBe(100);
  });

  it('discount is applied per booking (total), not per spot individually', () => {
    // 3 spots @ AED 40 each = AED 120 total
    // NEWBIE 50% off = AED 60 discount
    const spotsBooked = 3;
    const pricePerSpot = 40;
    const totalAmount = pricePerSpot * spotsBooked; // 120
    const discountAed = computeDiscountAmount('percentage', 50, totalAmount); // 60

    expect(discountAed).toBe(60);
    expect(Math.max(0, totalAmount - discountAed)).toBe(60);
  });
});
