/**
 * #231 live "Refund via Ziina" money-path tests.
 *
 * These exercise the server-authoritative refund math + re-entry classification
 * that protect against the two ways this feature can lose money:
 *   1. over-refunding the wallet-paid portion as cash (the wallet trap), and
 *   2. double-refunding on a repeated click / webhook race.
 *
 * The amount is ALWAYS server-computed from the booking + payment records — the
 * client only ever sends a notification id. The simultaneous-click guard is the
 * DB-atomic claim (claimZiinaRefundForProcessing: UPDATE ... WHERE refund_status
 * IS NULL) plus the Ziina Idempotency-Key; the sequential double-click after a
 * recorded success is covered here via classifyRefundReentry.
 */
import { describe, it, expect } from 'vitest';
import { computeZiinaRefundFils, classifyRefundReentry } from '../server/refundMath';

describe('computeZiinaRefundFils — wallet-trap cap', () => {
  it('no wallet used: refunds the full captured cash (= amountAed*100)', () => {
    // AED 60 booking, fully paid by card, Ziina captured 6000 fils.
    expect(computeZiinaRefundFils({
      amountAedTotal: 60,
      walletAmountUsedFils: 0,
      paymentCapturedFils: 6000,
    })).toBe(6000);
  });

  it('partial wallet: refunds ONLY the cash portion, never the wallet portion', () => {
    // AED 60 total, AED 15 (1500 fils) paid from wallet → Ziina captured 4500.
    // Must refund 4500 (the card portion), NOT 6000 (the full total). The
    // wallet 1500 is returned to the wallet balance separately.
    expect(computeZiinaRefundFils({
      amountAedTotal: 60,
      walletAmountUsedFils: 1500,
      paymentCapturedFils: 4500,
    })).toBe(4500);
  });

  it('full wallet coverage: nothing to refund via Ziina (0)', () => {
    // AED 40 total fully covered by 4000 fils wallet → no card charge → 0.
    expect(computeZiinaRefundFils({
      amountAedTotal: 40,
      walletAmountUsedFils: 4000,
      paymentCapturedFils: 0,
    })).toBe(0);
  });

  it('caps at the actually-captured payment amount (defensive second cap)', () => {
    // If the booking total somehow exceeds what Ziina captured (data drift),
    // never refund more than was captured.
    expect(computeZiinaRefundFils({
      amountAedTotal: 100,            // 10000 fils implied
      walletAmountUsedFils: 0,
      paymentCapturedFils: 4500,      // but Ziina only captured 4500
    })).toBe(4500);
  });

  it('wallet greater than total can never produce a negative refund', () => {
    expect(computeZiinaRefundFils({
      amountAedTotal: 30,
      walletAmountUsedFils: 9999,
      paymentCapturedFils: 0,
    })).toBe(0);
  });

  it('does NOT refund the full amountAed when wallet was used (regression guard)', () => {
    const fullTotalFils = 60 * 100;
    const result = computeZiinaRefundFils({
      amountAedTotal: 60,
      walletAmountUsedFils: 2000,
      paymentCapturedFils: 4000,
    });
    expect(result).toBe(4000);
    expect(result).not.toBe(fullTotalFils); // would be the double-refund bug
  });
});

describe('computeZiinaRefundFils — AED→fils conversion regression (audit B1)', () => {
  // payments.amount is stored in WHOLE AED. The route must convert it to fils
  // (payment.amount * 100) before passing it as paymentCapturedFils. These
  // tests model that boundary: `paymentAmountAed` is the raw DB value.
  it('30 AED, no wallet: refunds 3000 fils (AED 30.00), NOT 30', () => {
    const paymentAmountAed = 30; // raw payments.amount (whole AED)
    const result = computeZiinaRefundFils({
      amountAedTotal: 30,
      walletAmountUsedFils: 0,
      paymentCapturedFils: paymentAmountAed * 100, // route converts AED → fils
    });
    expect(result).toBe(3000);   // AED 30.00
    expect(result).not.toBe(30); // the pre-fix bug refunded AED 0.30
    expect(result / 100).toBe(30); // email amount derives from amountFils/100
  });

  it('regression: forgetting the *100 conversion slashes the refund ~100x', () => {
    const paymentAmountAed = 30;
    const buggy = computeZiinaRefundFils({
      amountAedTotal: 30,
      walletAmountUsedFils: 0,
      paymentCapturedFils: paymentAmountAed, // BUG: AED passed as fils
    });
    expect(buggy).toBe(30); // AED 0.30 — demonstrates why the *100 matters
  });

  it('partial wallet still nets correctly after conversion', () => {
    // AED 60 total, AED 15 (1500 fils) from wallet. payments.amount stores the
    // full total in AED (60). Cash portion to refund = 6000 − 1500 = 4500 fils.
    const paymentAmountAed = 60;
    const result = computeZiinaRefundFils({
      amountAedTotal: 60,
      walletAmountUsedFils: 1500,
      paymentCapturedFils: paymentAmountAed * 100, // 6000 fils
    });
    expect(result).toBe(4500);     // AED 45.00 to the card
    expect(result / 100).toBe(45);
  });

  it('full-wallet booking after conversion still yields 0 (rejected upstream)', () => {
    const paymentAmountAed = 0; // no card capture
    const result = computeZiinaRefundFils({
      amountAedTotal: 40,
      walletAmountUsedFils: 4000,
      paymentCapturedFils: paymentAmountAed * 100,
    });
    expect(result).toBe(0);
  });
});

describe('classifyRefundReentry — double-click / idempotency', () => {
  it('already-refunded (terminal success) short-circuits, never re-charges', () => {
    expect(classifyRefundReentry({ refundStatus: 'completed', read: false })).toBe('already_refunded');
    expect(classifyRefundReentry({ refundStatus: 'refunded', read: true })).toBe('already_refunded');
    expect(classifyRefundReentry({ refundStatus: 'succeeded', read: false })).toBe('already_refunded');
  });

  it('a manually-resolved row refuses re-processing (no silent re-charge)', () => {
    expect(classifyRefundReentry({ refundStatus: null, read: true })).toBe('resolved_blocked');
  });

  it('a fresh unresolved row proceeds', () => {
    expect(classifyRefundReentry({ refundStatus: null, read: false })).toBe('proceed');
  });

  it('an in-flight Ziina-pending refund is NOT treated as success', () => {
    // pending is not terminal — proceed (the atomic claim/button-hide handle
    // re-entry; we must not mark it already-refunded).
    expect(classifyRefundReentry({ refundStatus: 'pending', read: false })).toBe('proceed');
  });

  it('a failed refund is retryable (proceed)', () => {
    expect(classifyRefundReentry({ refundStatus: 'failed', read: false })).toBe('proceed');
  });
});
