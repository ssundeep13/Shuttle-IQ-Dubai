/**
 * Design Gate 1, Batch 2 — touch targets & safe area on the customer surfaces.
 * Rule (skill: accessibility.md): controls >= 44pt on mobile; spacing between
 * adjacent controls matters as much as size. No primitive changes — every fix
 * is page-level, so admin surfaces are untouched by construction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── shared button factories (hoisted, 44px) ─────────────────────────────────
describe('marketplace button factories — one definition, 44px floor', () => {
  it('navyBtn / ghostBtn live in LandingComponents and both size variants clear 44px', async () => {
    const { navyBtn, ghostBtn } = await import('../client/src/pages/marketplace/LandingComponents');
    for (const f of [navyBtn, ghostBtn]) {
      for (const size of ['sm', 'md'] as const) {
        const { style } = f(size);
        expect(style.minHeight, `${f.name}(${size}) minHeight`).toBe(44);
      }
    }
  });
  it('every factory returns the press class alongside the style', async () => {
    const { navyBtn, ghostBtn } = await import('../client/src/pages/marketplace/LandingComponents');
    expect(navyBtn('sm').className).toContain('siq-press');
    expect(ghostBtn('md').className).toContain('siq-press');
  });
  it('Dashboard and MyBookings IMPORT the factories — the local copies are gone', () => {
    for (const f of ['client/src/pages/marketplace/Dashboard.tsx', 'client/src/pages/marketplace/MyBookings.tsx']) {
      const src = stripComments(read(f));
      expect(src, f).toMatch(/import \{[^}]*navyBtn[^}]*\} from ['"]\.\/LandingComponents['"]/);
      expect(src, f).not.toMatch(/function navyBtn\(/);
      expect(src, f).not.toMatch(/function ghostBtn\(/);
    }
  });
});

// ── bottom nav ──────────────────────────────────────────────────────────────
describe('MobileBottomNav — safe area + label floor', () => {
  const src = read('client/src/components/MobileBottomNav.tsx');
  it('the fixed nav pads for the home indicator (body padding does not reach fixed children)', () => {
    expect(src).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
  });
  it('labels are at least 11px', () => {
    expect(src).not.toMatch(/text-\[10px\]/);
    expect(src).toMatch(/text-\[11px\]/);
  });
  it('the 64px tab bar itself is unchanged (0-gap full-width tabs are the standard pattern)', () => {
    expect(src).toMatch(/flex h-16 items-stretch/);
  });
});

// ── MyBookings guest row ────────────────────────────────────────────────────
describe('MyBookings — guest edit/cancel are real targets and no longer twins 2px apart', () => {
  const src = read('client/src/pages/marketplace/MyBookings.tsx');
  it('no 20px icon buttons remain; the pair is >= 8px apart', () => {
    expect(src).not.toMatch(/size="icon" variant="ghost" className="h-5 w-5"/);
    expect(src).not.toMatch(/flex items-center gap-0\.5 shrink-0/);
    const row = src.slice(src.indexOf('button-edit-guest-') - 600, src.indexOf('button-cancel-guest-') + 200);
    expect(row).toMatch(/h-11 w-11/);
    expect(row).toMatch(/gap-2/);
  });
  it('the destructive cancel is visually distinct from edit', () => {
    const cancel = src.slice(src.indexOf('button-cancel-guest-') - 300, src.indexOf('button-cancel-guest-') + 200);
    expect(cancel).toMatch(/text-destructive/);
  });
  it('inline guest edit inputs are 44px', () => {
    expect(src).not.toMatch(/<Input[^>]*className="h-7/);
    const edits = src.slice(src.indexOf('input-edit-guest-name') - 200, src.indexOf('input-edit-guest-email') + 200);
    expect((edits.match(/h-11/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ── Dashboard ───────────────────────────────────────────────────────────────
describe('Dashboard — onboarding CTAs and dismiss buttons', () => {
  const src = read('client/src/pages/marketplace/Dashboard.tsx');
  it('the onboarding step CTA no longer overrides the factory padding down to 29px', () => {
    // the <Link ...> element itself, from its opening tag to the testid
    const i = src.indexOf('button-onboarding-step');
    const open = src.lastIndexOf('<Link', i);
    const cta = src.slice(open, i);
    expect(cta).not.toMatch(/padding:\s*'6px 12px'/);
    expect(cta).not.toMatch(/fontSize:\s*12/);
    expect(cta).toMatch(/ghostBtn\('sm'\)/); // still the shared 44px factory
  });
  it('all three dismiss controls carry a 44px hit area', () => {
    const ids = ['button-dismiss-onboarding', 'button-dismiss-referral-nudge', 'button-dismiss-suggestion-banner'];
    for (const id of ids) {
      const i = src.indexOf(id);
      expect(i, id).toBeGreaterThan(-1);
      // the whole <button ...> opening tag around the testid
      const open = src.lastIndexOf('<button', i);
      const close = src.indexOf('>', i);
      const tag = src.slice(open, close);
      expect(tag, id).toMatch(/minHeight:\s*44/);
      expect(tag, id).toMatch(/siq-press/);
    }
  });
});

// ── Checkout wallet toggle ──────────────────────────────────────────────────
describe('Checkout — the wallet-vs-card switch sits in a 44px label row', () => {
  const src = read('client/src/pages/marketplace/Checkout.tsx');
  it('the Switch is wrapped in a <label> with min-h-11 so the whole row toggles', () => {
    const i = src.indexOf('data-testid="switch-use-wallet"');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i - 800, i);
    expect(block).toMatch(/<label[^>]*htmlFor="switch-use-wallet"[^>]*min-h-11/);
    expect(block).toMatch(/id="switch-use-wallet"/); // the Switch carries the id the label points at
  });
});

// ── Login ───────────────────────────────────────────────────────────────────
describe('MarketplaceLogin — eye toggle, checkbox row, primary buttons', () => {
  const src = read('client/src/pages/marketplace/MarketplaceLogin.tsx');
  it('the password eye toggle is a 44px target', () => {
    const i = src.indexOf('button-toggle-password');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i - 400, i)).toMatch(/h-11 w-11/);
  });
  it('the remember-me row is 44px tall', () => {
    const i = src.indexOf('checkbox-remember');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i - 300, i + 400)).toMatch(/min-h-11/);
  });
  it('the three primary buttons carry min-h-11 (page-level, primitive untouched)', () => {
    expect((src.match(/className="w-full min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // and the primitive is byte-identical
    const btn = read('client/src/components/ui/button.tsx');
    expect(btn).toContain('default: "min-h-9 px-4 py-2"');
    expect(btn).toContain('sm: "min-h-8 rounded-md px-3 text-xs"');
  });
});
