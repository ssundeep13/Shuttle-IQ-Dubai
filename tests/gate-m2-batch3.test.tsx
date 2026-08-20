/**
 * Gate M2 Batch 3 — reserved space, footer consistency, one checkout total,
 * honest error states, bottom-nav wayfinding (#38, #61, #64, #65, #68).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('#38 — first paint holds its space', () => {
  it('GettingStartedCard: skeleton while loading, and a done-stamp so settled users never see an insert OR a collapse', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(src).toMatch(/skeleton-onboarding/);
    expect(src).toMatch(/siq_onboarding_done_/);
    expect(src).toMatch(/if \(dismissed \|\| doneStamped \|\| allDone\) return null;/);
    // the bare loading-null that caused the ~250px insert is gone
    expect(src).not.toMatch(/if \(bookingsLoading \|\| allDone \|\| dismissed\) return null;/);
  });
  it('MyBookings wallet chip: shell always renders (minHeight reserved), never mounts on data arrival', () => {
    const src = read('client/src/pages/marketplace/MyBookings.tsx');
    expect(src).not.toMatch(/\{walletData !== undefined && \(/);
    const i = src.indexOf('data-testid="card-wallet-balance"');
    expect(src.slice(i - 700, i)).toMatch(/minHeight: 50/);
  });
});

describe('#61 — Dialog and AlertDialog stack their footers the same way on mobile', () => {
  it('DialogFooter and SheetFooter are cancel-first (flex-col), matching AlertDialogFooter', () => {
    expect(read('client/src/components/ui/dialog.tsx')).toMatch(/"flex flex-col gap-2 sm:flex-row/);
    expect(read('client/src/components/ui/sheet.tsx')).toMatch(/"flex flex-col gap-2 sm:flex-row/);
    expect(read('client/src/components/ui/dialog.tsx')).not.toMatch(/flex-col-reverse/);
    expect(read('client/src/components/ui/sheet.tsx')).not.toMatch(/flex-col-reverse/);
  });
});

describe('#64 — one total, in one place, and it is the amount actually charged', () => {
  const src = read('client/src/pages/marketplace/Checkout.tsx');
  it('OrderSummary carries the wallet maths: Subtotal / Wallet credit / You pay', () => {
    expect(src).toMatch(/walletAppliedAed/);
    expect(src).toMatch(/You pay/);
    // the big figure switches to the payable amount when credit applies
    expect(src).toMatch(/walletAppliedAed > 0 \? payable\.toFixed\(2\) : amount/);
  });
  it('the second, contradicting breakdown in the wallet card is gone', () => {
    expect(src).not.toContain('Session cost');
    expect(src).not.toContain('text-remaining-amount');
  });
  it('the wallet toggle sits with the summary; the guest form no longer separates them', () => {
    const summary = src.indexOf('walletAppliedAed={useWallet ? walletApplicableAed : 0}');
    const walletCard = src.indexOf('data-testid="card-wallet-credit"');
    const guestForm = src.indexOf('submitAttempted={guestSubmitAttempted}', summary);
    expect(summary).toBeGreaterThan(0);
    expect(walletCard).toBeGreaterThan(summary);
    expect(guestForm).toBeGreaterThan(walletCard);
  });
});

describe('#65 — outages read as outages, never as empty states', () => {
  it('Rankings: error branch (active view) with QueryErrorCard BEFORE the empty check', () => {
    const src = read('client/src/pages/marketplace/Rankings.tsx');
    expect(src).toMatch(/rankedError \?/);
    expect(src).toMatch(/testId="error-rankings"/);
    expect(src.indexOf('rankedError ?')).toBeLessThan(src.indexOf("ranked.length === 0 ?"));
  });
  it('NotificationBell: isError branch with retry instead of "No notifications yet"', () => {
    const src = read('client/src/components/MarketplaceNav.tsx');
    expect(src).toMatch(/error-notifications/);
    expect(src.indexOf('isError ?')).toBeLessThan(src.indexOf("No notifications yet"));
  });
  it('wallet cards survive a failed fetch with a visible retry (Profile + MyBookings)', () => {
    expect(read('client/src/pages/marketplace/Profile.tsx')).toMatch(/button-wallet-retry/);
    expect(read('client/src/pages/marketplace/MyBookings.tsx')).toMatch(/button-wallet-retry/);
  });
});

describe('#68 — an authenticated user always has an answer to "where am I?"', () => {
  const src = read('client/src/components/MobileBottomNav.tsx');
  it('Rankings is an auth tab', () => {
    const authBlock = src.slice(src.indexOf('const authTabs'), src.indexOf('const guestTabs'));
    expect(authBlock).toContain("href: '/marketplace/rankings'");
  });
  it('Profile resolves to the Dashboard tab', () => {
    expect(src).toMatch(/location\.startsWith\('\/marketplace\/profile'\)/);
  });
  it('game history still resolves to the Stats tab', () => {
    expect(src).toContain("location === '/marketplace/game-history'");
  });
});
