/**
 * Gate M2 Batch 2 — response latency + honest feedback (#35, #36, #42, #43).
 * Source pins; the #40 behavioural pins live in gate-m2-auth-refresh.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const signup = () => read('client/src/pages/marketplace/MarketplaceSignup.tsx');
const login = () => read('client/src/pages/marketplace/MarketplaceLogin.tsx');
const checkout = () => read('client/src/pages/marketplace/Checkout.tsx');
const complete = () => read('client/src/pages/marketplace/CompleteProfile.tsx');
const bookings = () => read('client/src/pages/marketplace/MyBookings.tsx');
const feed = () => read('client/src/pages/marketplace/CommunityFeed.tsx');

describe('#35 — signup Continue is never disabled by its own blur handler', () => {
  it('the referral-step button is disabled only while the account is being created', () => {
    const src = signup();
    // the old expression swallowed the tap: blur → referralValidating=true → disabled
    expect(src).not.toMatch(/disabled=\{loading \|\| referralValidating/);
    expect(src).toMatch(/data-testid="button-continue-referral"/);
  });
  it('an unvalidated code is resolved ON the tap (validate returns its outcome), not by pre-disabling', () => {
    const src = signup();
    // validateReferralCode now reports success/failure to its caller
    expect(src).toMatch(/const validateReferralCode[\s\S]{0,900}return (true|!!|Boolean)/);
    // the continue handler validates a pending code before finishing
    expect(src).toMatch(/await validateReferralCode\(/);
  });
});

describe('#36 — inline validation, not submit-time toasts', () => {
  it('signup full name: blur-time inline error under the field, no toast', () => {
    const src = signup();
    expect(src).toContain('data-testid="error-name"');
    expect(src).not.toMatch(/toast\(\{\s*title: 'Please enter your full name/);
    // the name input flags itself for AT
    const i = src.indexOf('data-testid="input-name"');
    expect(src.slice(i - 600, i + 100)).toMatch(/aria-invalid/);
  });
  it('complete-profile full name: same inline pattern, no four-steps-later toast', () => {
    const src = complete();
    expect(src).toContain('data-testid="error-name"');
    expect(src).not.toMatch(/toast\(\{\s*title: 'Please enter your full name/);
  });
  it('login 401: inline error rendered with the form and the password field refocused', () => {
    const src = login();
    expect(src).toContain('data-testid="error-login"');
    expect(src).toMatch(/passwordRef|getElementById\('password'\)/);
  });
  it('checkout guests: per-field errors with aria-invalid; submit scrolls the first invalid field into view', () => {
    const src = checkout();
    expect(src).toMatch(/data-testid=\{`error-guest-name-\$\{idx\}`\}/);
    expect(src).toMatch(/aria-invalid/);
    expect(src).toMatch(/scrollIntoView/);
  });
});

describe('#42 — feed error offers a real retry, not an imaginary gesture', () => {
  it('QueryErrorCard with refetch; the "pull to refresh" instruction is gone', () => {
    const src = feed();
    expect(src).not.toContain('pull to refresh');
    expect(src).toMatch(/QueryErrorCard/);
    expect(src).toMatch(/onRetry=\{\(\) => \{? ?void refetch\(\)/);
  });
});

describe('#43 — destructive commits show their pending state, keyed to the row that fired them', () => {
  it('the cancel-booking confirm: pending guard + label, and the dialog is not closed out from under the request', () => {
    const src = bookings();
    const i = src.indexOf("lateFee ? 'Cancel & Forfeit Payment' : 'Yes, Cancel'");
    const around = src.slice(i - 900, i + 200);
    expect(around).toMatch(/cancelMutation\.isPending/);
    expect(around).toMatch(/Cancelling…/);
    expect(around).toMatch(/preventDefault\(\)/);
  });
  it('guest-cancel confirms carry the same guard (drilled as isCancelPending, keyed at the call site)', () => {
    const src = bookings();
    const refundWallet = src.indexOf('Refund to wallet');
    expect(src.slice(refundWallet - 700, refundWallet + 600)).toMatch(/isCancelPending/);
    expect(src).toMatch(/isCancelPending=\{cancelGuestMutation\.isPending && cancelGuestMutation\.variables\?\.bookingId === booking\.id\}/);
  });
  it('Pay Now pending is keyed to the booking that fired it, not every card', () => {
    const src = bookings();
    expect(src).toMatch(/initiatePaymentMutation\.isPending && initiatePaymentMutation\.variables === booking\.id/);
  });
  it('cancel pending is keyed to the booking too', () => {
    const src = bookings();
    expect(src).toMatch(/cancelMutation\.variables\?\.bookingId === booking\.id/);
  });
  it('profile Log Out exposes a pending state', () => {
    const src = read('client/src/pages/marketplace/Profile.tsx');
    expect(src).toMatch(/Signing out…/);
  });
});
