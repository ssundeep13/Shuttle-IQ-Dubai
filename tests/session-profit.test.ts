import { describe, it, expect } from 'vitest';
import { computeProfitFils } from '../server/portal/sessionProfit';
import { sessionDurationHours } from '../shared/sessionTime';

// Arithmetic unit tests for the PURE profit definition (no DB). The DB wrapper's
// revenue-netting SQL is exercised separately by the real-data June check.
describe('computeProfitFils — the single session-profit definition (fils)', () => {
  it('(i) normal: revenue − total costs', () => {
    // AED 1000 revenue; AED 200 court + 80 shuttle + 20 water = AED 300 costs → AED 700
    expect(computeProfitFils({
      revenueFils: 100_000, courtCostFils: 20_000, shuttleCostFils: 8_000, waterCostFils: 2_000,
    })).toBe(70_000);
  });

  it('(ii) costs > revenue → floored to 0, never negative', () => {
    expect(computeProfitFils({
      revenueFils: 5_000, courtCostFils: 6_000, shuttleCostFils: 2_000, waterCostFils: 1_000,
    })).toBe(0);
    // exactly break-even is 0, not negative
    expect(computeProfitFils({
      revenueFils: 9_000, courtCostFils: 9_000, shuttleCostFils: 0, waterCostFils: 0,
    })).toBe(0);
  });

  it('(iii) partial guest-slot refund reduces revenue before profit', () => {
    // One AED 490 booking; partial guest-slot refund AED 245 (24_500 fils) recorded in
    // payments.refundedAmount. The wrapper nets gross − refund; assert the pure fn on
    // that netted revenue, costs still 0 (session_costs empty today).
    const grossFils = 490 * 100;              // 49_000
    const refundFils = 24_500;                // payments.refundedAmount, fils
    const revenueFils = grossFils - refundFils; // 24_500
    expect(computeProfitFils({
      revenueFils, courtCostFils: 0, shuttleCostFils: 0, waterCostFils: 0,
    })).toBe(24_500);
  });

  it('(iv) AED→fils ×100 bridge is exact for integer AED amounts', () => {
    const amountsAed = [49, 490, 1234, 7];
    const grossFils = amountsAed.reduce((s, a) => s + a * 100, 0);
    expect(grossFils).toBe(178_000);
    expect(Number.isInteger(grossFils)).toBe(true);
    // profit with zero costs equals the exact gross (no float drift)
    expect(computeProfitFils({
      revenueFils: grossFils, courtCostFils: 0, shuttleCostFils: 0, waterCostFils: 0,
    })).toBe(178_000);
  });
});

describe('sessionDurationHours', () => {
  it('whole, half, and quarter hours', () => {
    expect(sessionDurationHours('18:00', '21:00')).toBe(3);
    expect(sessionDurationHours('18:30', '21:00')).toBe(2.5);
    expect(sessionDurationHours('20:00', '22:15')).toBe(2.25);
  });

  it('end <= start → NaN (no silent midnight wrap)', () => {
    expect(sessionDurationHours('21:00', '18:00')).toBeNaN();  // end before start
    expect(sessionDurationHours('20:00', '20:00')).toBeNaN();  // zero-length
  });
});
