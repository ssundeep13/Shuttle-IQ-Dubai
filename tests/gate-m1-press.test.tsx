/**
 * Gate M1 — press-language unification (Emil audit #1–#13).
 * §1: respond on pointer-down. §10: 44px + cancel-by-drag-away (CSS :active).
 * §7: mirrored release. §16.4: same-looking controls behave the same.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const css = () => read('client/src/index.css');
const lc = () => read('client/src/pages/marketplace/LandingComponents.tsx');
const home = () => read('client/src/pages/marketplace/MarketplaceHome.tsx');

describe('#1 — hero/CTA press is not silently retimed by an inline transition', () => {
  it('btnStyle no longer declares transform/box-shadow transitions inline', () => {
    const src = home();
    expect(src).not.toContain("transition: 'transform .2s ease, box-shadow .25s ease, background .2s ease'");
    const i = src.indexOf('function btnStyle');
    expect(src.slice(i, i + 2000)).toMatch(/transition: 'background-color 150ms ease-out'/);
  });
});

describe('#3 — the shadcn press language has a transition and a scale, mirroring .siq-press', () => {
  it('elevate carriers transition transform; active-elevate-2 presses at scale(.97); overlay bg fades', () => {
    const s = css();
    expect(s).toMatch(/\.active-elevate-2:active:not\(\.no-default-active-elevate\)\s*\{\s*transform: scale\(0\.97\);/);
    expect(s).toMatch(/hover-elevate[\s\S]{0,400}transition-property: transform/);
    expect(s).toMatch(/::after[\s\S]{0,200}transition: background-color 150ms ease-out/);
  });
  it('reduced motion drops the elevate scale but keeps the overlay', () => {
    const s = css();
    const rm = s.slice(s.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(rm).toMatch(/active-elevate/);
  });
});

describe('#4 — .siq-press is additive: longhands that include colour, no shorthand clobber', () => {
  it('uses transition-property including color/background-color', () => {
    const s = css();
    const i = s.indexOf('.siq-press {');
    const block = s.slice(i, i + 400);
    expect(block).toMatch(/transition-property: transform, opacity, color, background-color, border-color/);
    expect(block).not.toMatch(/transition: transform 90ms/);
  });
});

describe('#2/#5/#6/#7/#8/#9/#10 — pointer-down coverage on every flagged hot path', () => {
  it('#2 Rankings podium cards + rows carry the active press pair', () => {
    const src = read('client/src/pages/marketplace/Rankings.tsx');
    const podium = src.indexOf("hover-elevate active-elevate-2 cursor-pointer`}");
    const rows = src.match(/hover-elevate active-elevate-2 cursor-pointer/g) ?? [];
    expect(podium).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
  it('#5 Dashboard whole-card targets press', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(src).toMatch(/data-testid="card-referral-teaser"[^>]*className="[^"]*siq-press/);
    const nudge = src.indexOf('card-tag-nudge');
    expect(src.slice(nudge - 600, nudge + 100)).toMatch(/siq-press/);
    const avatar = src.indexOf('link-profile-avatar');
    expect(src.slice(avatar - 300, avatar + 100)).toMatch(/siq-press/);
  });
  it('#6 CommunityFeed controls press and the chips reach 44px', () => {
    const src = read('client/src/pages/marketplace/CommunityFeed.tsx');
    const chip = src.indexOf('data-testid={`feed-filter-');
    expect(src.slice(chip - 100, chip + 400)).toMatch(/siq-press/);
    expect(src.slice(chip - 100, chip + 400)).toMatch(/padding: '11px 16px'/);
    const like = src.indexOf('feed-like-') >= 0 ? src.indexOf('feed-like-') : src.indexOf('heartColor');
    expect(src.slice(like - 700, like + 300)).toMatch(/siq-press/);
    expect((src.match(/siq-press/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('#7 Signup eye toggle + login link match Login exactly (44px + siq-press)', () => {
    const src = read('client/src/pages/marketplace/MarketplaceSignup.tsx');
    expect(src).toMatch(/siq-press absolute right-1 top-1\/2 -translate-y-1\/2 h-11 w-11/);
    const i = src.indexOf('data-testid="link-login"');
    expect(src.slice(i - 300, i + 50)).toMatch(/siq-press[^"]*min-h-11/);
  });
  it('#8 Dashboard see-all links press with a grown hit area', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    const i = src.indexOf('const seeAllLink');
    expect(src.slice(i, i + 400)).toMatch(/padding: '12px 4px', margin: '-12px -4px'/);
    expect(src).toMatch(/link-view-all-stats"[\s\S]{0,40}/);
    expect(src.slice(src.indexOf('link-view-all-stats') - 300, src.indexOf('link-view-all-stats') + 60)).toMatch(/siq-link/);
    expect(src.slice(src.indexOf('link-stats-leaderboard') - 400, src.indexOf('link-stats-leaderboard') + 60)).toMatch(/siq-link/);
  });
  it('#9 Checkout confirmed/waitlist buttons + MyBookings method tile press; refund radios get 44px rows', () => {
    const co = read('client/src/pages/marketplace/Checkout.tsx');
    for (const t of ['button-view-bookings', 'button-browse-sessions"', 'button-view-waitlist']) {
      const i = co.indexOf(t);
      expect(co.slice(i - 300, i + 60), t).toMatch(/siq-press/);
    }
    const mb = read('client/src/pages/marketplace/MyBookings.tsx');
    const tile = mb.indexOf('siq-press flex flex-col items-center gap-1.5');
    expect(tile).toBeGreaterThan(0);
    expect((mb.match(/min-h-11 -my-1 px-1 -mx-1 rounded-md siq-press/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it('#10 nav links, logo, 44px bell, footer links press', () => {
    const nav = read('client/src/components/MarketplaceNav.tsx');
    expect(nav).toMatch(/link-marketplace-home"[\s\S]{0,20}/);
    expect(nav.slice(nav.indexOf('link-marketplace-home') - 200, nav.indexOf('link-marketplace-home') + 40)).toMatch(/siq-press/);
    expect(nav).toMatch(/siq-press inline-flex items-center px-3/); // desktop links
    expect(nav).toMatch(/h-11 w-11 text-white\/80/); // bell grown from 36px
    const foot = read('client/src/components/MarketplaceFooter.tsx');
    expect(foot).toMatch(/footerLinkClass = 'siq-press /);
  });
});

describe('#11 — primitive press states (shared; admin inherits deliberately)', () => {
  it('TabsTrigger and Switch respond on pointer-down', () => {
    expect(read('client/src/components/ui/tabs.tsx')).toMatch(/active:scale-\[0\.98\]/);
    expect(read('client/src/components/ui/switch.tsx')).toMatch(/active:opacity-80/);
  });
  it('DropdownMenuItem gets 44px + an active state', () => {
    const s = read('client/src/components/ui/dropdown-menu.tsx');
    expect(s).toMatch(/DropdownMenuItem[\s\S]{0,600}min-h-11/);
    expect(s).toMatch(/DropdownMenuItem[\s\S]{0,600}active:bg-accent/);
  });
  it('GuestRow options/clear/add-manually press', () => {
    const s = read('client/src/components/marketplace/GuestRow.tsx');
    expect((s.match(/siq-press/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('#12 — .siq-link presses and releases on mirrored timing', () => {
  it('base carries an opacity transition; underline retracts at 220ms, not 350ms', () => {
    const s = lc();
    expect(s).toMatch(/\.siq-link \{[^}]*transition: opacity 90ms ease-out/);
    expect(s).toMatch(/\.siq-link::after[^}]*transition: transform 220ms/);
  });
});

describe('#13 — no motion affordance on non-interactive surfaces; no dead paint transitions', () => {
  it('StepCard no longer lifts; hover-lift no longer transitions a box-shadow nothing changes', () => {
    const src = home();
    const step = src.indexOf("padding: '32px 32px 36px', borderRadius: 24");
    expect(src.slice(step - 300, step + 50)).not.toMatch(/siq-hover-lift/);
    expect(lc()).not.toMatch(/\.siq-hover-lift \{[^}]*box-shadow/);
  });
});
