/**
 * The referrer screen (/marketplace/referrals: own code, share link, rewards)
 * had ONE doorway — the Dashboard teaser card. Profile carried only the
 * "enter a friend's code" card, which hides itself once the 30-day window
 * closes, so an established referrer saw nothing referral-related at all.
 * Now: a permanent Profile link card (whenever a player profile is linked),
 * a desktop-menu entry, and a footer entry. The bottom nav stays at five
 * tabs — it is full (DASHBOARD already fills its slot at 360px).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('Profile — permanent "My Referrals" link card', () => {
  const src = read('client/src/pages/marketplace/Profile.tsx');
  const at = src.indexOf('card-my-referrals-link');

  it('exists, titled and subtitled as specified, and goes to /marketplace/referrals', () => {
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at - 900, at + 1400);
    expect(block).toContain('My Referrals');
    expect(block).toContain('Your code, share link and rewards');
    expect(block).toMatch(/navigate\('\/marketplace\/referrals'\)/);
  });

  it('renders whenever a player profile is linked — not tied to the 30-day window', () => {
    const gate = src.slice(at - 900, at);
    expect(gate).toMatch(/user\?\.linkedPlayerId/);
    expect(gate).not.toMatch(/showReferralField|referralEligible|eligibleUntil/);
  });

  it('sits beside the existing add-a-code card, whose logic is untouched', () => {
    expect(src.indexOf('card-add-referral')).toBeGreaterThan(0);
    expect(Math.abs(src.indexOf('card-add-referral') - at)).toBeLessThan(4000);
    // Source is CRLF — match across line endings, not a literal "\n".
    expect(src).toMatch(/const referralEligible =\s+!!referralStatus && new Date\(referralStatus\.eligibleUntil\)\.getTime\(\) > Date\.now\(\);/);
    expect(src).toMatch(/const showReferralField =\s+!!referralStatus && \(referralStatus\.hasIncomingReferral \|\| referralEligible\);/);
    expect(src).toMatch(/\{showReferralField && referralStatus && \(/);
  });

  it('uses the same tappable-card chrome as the wallet card (no new colours)', () => {
    const block = src.slice(at - 400, at + 400);
    expect(block).toContain('...cardChrome');
    expect(block).toContain('transition-transform active:scale-[0.99]');
    expect(block).toMatch(/role="button"/);
    expect(block).toMatch(/tabIndex=\{0\}/);
    expect(src.slice(at, at + 1400)).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe('Nav — Referrals reachable from the desktop menu and the footer', () => {
  it('desktop user menu lists Referrals', () => {
    const nav = read('client/src/components/MarketplaceNav.tsx');
    const menu = nav.slice(nav.indexOf('const authMenuLinks'), nav.indexOf('function getInitials'));
    expect(menu).toMatch(/href: '\/marketplace\/referrals',\s*label: 'Referrals'/);
  });

  it('footer Players column links to Referrals', () => {
    const foot = read('client/src/components/MarketplaceFooter.tsx');
    expect(foot).toMatch(/href="\/marketplace\/referrals"[^>]*data-testid="link-footer-referrals"/);
  });

  it('bottom nav stays at five tabs (it is full) and lights Dashboard on the referrals route', () => {
    const src = read('client/src/components/MobileBottomNav.tsx');
    const authBlock = src.slice(src.indexOf('const authTabs'), src.indexOf('const guestTabs'));
    expect((authBlock.match(/href: '/g) ?? []).length).toBe(5);
    expect(authBlock).not.toContain('/marketplace/referrals');
    expect(src).toMatch(/location\.startsWith\('\/marketplace\/referrals'\)/);
  });
});
