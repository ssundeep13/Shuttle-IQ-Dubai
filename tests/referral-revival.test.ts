import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Referral clawback revival (2026-07-10). The atomic behavior is proven live
// against sandbox fixtures (scripts/scratch revival smoke: complete → clawback
// state → revive via a real payment trigger, asserting exact ledger deltas);
// these tests lock the source invariants that make the cycle safe.

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('referral revival - completion path', () => {
  const referrals = read('server/referrals.ts');
  const storage = read('server/storage.ts');

  it('completion CAS keys on the caller-observed status (pending OR clawed_back)', () => {
    expect(storage.includes('eq(referrals.status, params.expectedStatus)'),
      'CAS must match the exact prior status the caller read').toBe(true);
    expect(storage.includes("expectedStatus: 'pending' | 'clawed_back'")).toBe(true);
  });

  it('payment trigger accepts clawed_back and stamps a distinguishable method', () => {
    const fn = referrals.slice(referrals.indexOf('export async function completeReferralOnPayment'), referrals.indexOf('export type LinkOutcome'));
    expect(fn.includes("referral.status !== 'clawed_back'"), 'clawed_back must pass the guard').toBe(true);
    expect(fn.includes("'first_payment_revived'"), 'revival must be distinguishable').toBe(true);
    expect(fn.includes("'first_payment'"), 'normal pending completion unchanged').toBe(true);
  });

  it('admin force-complete may revive deliberately and stamps admin_revived', () => {
    const fn = referrals.slice(referrals.indexOf('export async function completeReferral('), referrals.indexOf('// PUBLIC: clawback'));
    expect(fn.includes("referral.status !== 'clawed_back'")).toBe(true);
    expect(fn.includes("'admin_revived'")).toBe(true);
    expect(fn.includes("'admin'")).toBe(true);
  });

  it('all five payment call sites still fire the same trigger', () => {
    const files = ['server/marketplace-routes.ts', 'server/webhookHandler.ts', 'server/portal/portalExpenses.ts'];
    const calls = files.map(read).join('\n').match(/fireReferralOnPayment\(/g) ?? [];
    expect(calls.length, 'expected exactly 5 payment-confirmation call sites').toBe(5);
  });
});

describe('referral revival - clawback stays intact (gaming stays blocked)', () => {
  const storage = read('server/storage.ts');
  const referrals = read('server/referrals.ts');
  const clawbackFn = storage.slice(storage.indexOf('async applyReferralClawbackAtomic'), storage.indexOf('async getAllReferrals'));

  it('clawback CAS still flips ONLY completed → clawed_back', () => {
    expect(clawbackFn.includes("eq(referrals.status, 'completed')")).toBe(true);
    expect(clawbackFn.includes("status: 'clawed_back'")).toBe(true);
  });

  it('clawback never consults completionMethod — a revived completion claws back the same way', () => {
    expect(clawbackFn.includes('completionMethod'), 'clawback must stay method-agnostic').toBe(false);
  });

  it('clawback reverses BOTH credits with the floor-at-0 write-off (so revival is not a double-pay)', () => {
    const floorCalls = clawbackFn.match(/applyClawbackWithFloor\(/g) ?? [];
    expect(floorCalls.length, 'referrer + linked-referee reversal').toBe(2);
    expect(clawbackFn.includes('pendingSignupCreditFils'), 'unlinked referee staging drained too').toBe(true);
  });

  it('milestones stay coherent: completion re-evaluates up, clawback re-evaluates down', () => {
    expect(referrals.includes('handleMilestoneAfterCompletion')).toBe(true);
    const claw = referrals.slice(referrals.indexOf('export async function clawbackReferralForBooking'));
    expect(claw.includes('getCompletedReferralCount')).toBe(true);
  });
});

describe('referral revival - honest status display', () => {
  it('player dashboard: explicit mapping, clawed_back deliberately reads Pending, invalid is honest', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(src.includes("'Not eligible'")).toBe(true);
    expect(src.includes('Clawed back'), 'internal jargon must not reach players').toBe(false);
    expect(src.includes('behaviorally identical to pending'), 'the Pending choice must stay documented').toBe(true);
  });

  it('admin All Referrals shows the real status', () => {
    const src = read('client/src/pages/SessionsManagement.tsx');
    expect(src.includes("'Clawed back'")).toBe(true);
    expect(src.includes("'Invalid'")).toBe(true);
  });
});
