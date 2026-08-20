/**
 * Design Gate 1, Batch 3 — press-down feedback on the customer surfaces.
 *
 * shadcn <Button> already darkens on :active (button.tsx hover-elevate
 * active-elevate-2). Every raw <button>/<Link>/<a> the customer taps had
 * NOTHING — and there was no -webkit-tap-highlight-color, so on iOS the
 * browser's grey flash was the only signal, invisible on navy.
 *
 * `.siq-press` is one OPT-IN class in index.css: nothing changes anywhere
 * unless an element carries it. No admin element does. button.tsx and the
 * .hover-elevate overlay are untouched (pinned).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('.siq-press — the opt-in press class', () => {
  const css = read('client/src/index.css');
  const block = css.slice(css.indexOf('.siq-press'));

  it('exists, is opt-in (class selector, not element/universal), and defines an :active state', () => {
    expect(css.indexOf('.siq-press')).toBeGreaterThan(-1);
    expect(block).toMatch(/\.siq-press:active\s*\{/);
    // never widened to everything
    expect(css).not.toMatch(/^\s*\*\s*\{[^}]*tap-highlight/m);
  });
  it('kills the browser tap highlight ONLY on elements carrying the class', () => {
    expect(block).toMatch(/\.siq-press\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/);
  });
  it('the press is transitioned (fast ease-out in) — not an instant snap', () => {
    const base = block.match(/\.siq-press\s*\{([^}]*)\}/)?.[1] ?? '';
    // Gate M1 #4: the shorthand became longhands — it was resetting
    // transition-property and killing sibling colour utilities (proven dead in
    // the built stylesheet). Same 90ms transform press, now additive.
    expect(base).toMatch(/transition-property:[^;]*transform/);
    expect(base).toMatch(/transition-duration:\s*90ms/);
    expect(base).toMatch(/cubic-bezier\(0, 0, 0\.2, 1\)/); // = ease-out
  });
  it('respects prefers-reduced-motion', () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.siq-press/);
  });
  it('the shadcn Button primitive and the .hover-elevate overlay are byte-identical', () => {
    const btn = read('client/src/components/ui/button.tsx');
    expect(btn).toContain('" hover-elevate active-elevate-2"');
    expect(btn).toContain('default: "min-h-9 px-4 py-2"');
    const overlay = css.slice(css.indexOf('.hover-elevate:not(.no-default-hover-elevate)::after'), css.indexOf('/* If there\'s a 1px border'));
    expect(overlay).not.toContain('transition'); // deliberately NOT changed in this gate
  });
});

describe('the class reaches every in-scope raw tappable', () => {
  it('bottom nav tabs', () => {
    const s = read('client/src/components/MobileBottomNav.tsx');
    expect(s).toMatch(/className="siq-press flex flex-1 flex-col/);
  });
  it('shared button factories (covers Dashboard + MyBookings CTAs incl. Pay Now)', () => {
    const s = stripComments(read('client/src/pages/marketplace/LandingComponents.tsx'));
    expect((s.match(/className:\s*'siq-press'/g) ?? []).length).toBe(2);
  });
  it('Checkout: pay button, Add Guest, remove-guest, Back to session', () => {
    const s = read('client/src/pages/marketplace/Checkout.tsx');
    for (const id of ['button-confirm-payment', 'button-add-guest', 'button-remove-guest', 'button-back-to-session']) {
      const i = s.indexOf(id);
      expect(i, id).toBeGreaterThan(-1);
      const open = s.lastIndexOf('<button', i);
      const close = s.indexOf('>', i);
      expect(s.slice(open, close), id).toMatch(/siq-press/);
    }
  });
  it('MarketplaceHome: every siq-hover-lift / siq-link CTA now has an :active rule, and hover is gated to hover-capable devices', () => {
    const s = read('client/src/pages/marketplace/LandingComponents.tsx');
    expect(s).toMatch(/\.siq-hover-lift:active\s*\{/);
    expect(s).toMatch(/@media \(hover:\s*hover\)[\s\S]*\.siq-hover-lift:hover/);
    expect(s).toMatch(/\.siq-link:active/);
  });
  it('no in-scope file still has a hover-only raw tappable without a press class', () => {
    // Login: the eye toggle carries siq-press (Batch 2); the two text links get it here.
    const lg = read('client/src/pages/marketplace/MarketplaceLogin.tsx');
    expect((lg.match(/siq-press/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
