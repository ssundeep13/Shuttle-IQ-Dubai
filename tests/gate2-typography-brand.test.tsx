/**
 * Design Gate 2 — typography system (Montserrat display / Inter body) and
 * brand-token alignment (navy #002C84, teal #00766C fills / #006B5F text,
 * beige #F2ECE1).
 *
 * The contrast pins COMPUTE WCAG ratios from the token values in the source,
 * so any future token edit that breaks AA fails here, not in a user's hand.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── colour maths (self-contained so the pin has no runtime dependency) ─────
const hexRgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => { const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a: string, b: string) => { const la = lum(hexRgb(a)), lb = lum(hexRgb(b)); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
const hslHex = (h: number, s: number, l: number) => { s /= 100; l /= 100; const k = (n: number) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const token = (css: string, name: string): [number, number, number] => {
  const m = css.match(new RegExp(`^\\s*${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`, 'm'));
  if (!m) throw new Error(`token ${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const css = read('client/src/index.css');
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('.dark') > 0 ? css.indexOf('.dark') : css.length);

// ── PART A: typography ─────────────────────────────────────────────────────
describe('font tokens — Montserrat display, Inter body, real fallback chains', () => {
  it('declares --font-display (Montserrat) and --font-sans (Inter) with system fallbacks', () => {
    // 'Montserrat Fallback' (metric-matched Arial, pinned below) sits between the web font and Inter.
    expect(rootBlock).toMatch(/--font-display:\s*['"]?Montserrat['"]?,\s*(?:['"]?Montserrat Fallback['"]?,\s*)?['"]?Inter['"]?,\s*-apple-system/);
    expect(rootBlock).toMatch(/--font-sans:\s*['"]?Inter['"]?,\s*-apple-system/);
  });
  it('Tailwind exposes font-display', () => {
    expect(read('tailwind.config.ts')).toMatch(/display:\s*\["var\(--font-display\)"\]/);
  });
  it('the render-blocking @import is gone; fonts load via preloaded <link>s with swap, only the weights in use', () => {
    expect(css).not.toMatch(/@import url\('https:\/\/fonts\.googleapis\.com/);
    const html = read('client/index.html');
    expect(html).toMatch(/Montserrat:wght@600;700/);
    expect(html).toMatch(/Inter:wght@400;500;600;700/);
    expect(html).not.toMatch(/Inter:wght@300/);           // no light weight
    expect(html).toMatch(/display=swap/);
    expect(html).toMatch(/rel="preload" as="style"/);
  });
  it('a metric-matched fallback face exists so the swap does not reflow (size-adjust measured at ~105%)', () => {
    expect(css).toMatch(/font-family:\s*['"]Montserrat Fallback['"]/);
    expect(css).toMatch(/size-adjust:\s*10[4-6](\.\d)?%/);
    expect(css).toMatch(/ascent-override/);
    expect(rootBlock).toMatch(/--font-display:[^;]*Montserrat Fallback/);
  });
});

describe('display wiring — one constant flips the customer layer', () => {
  it('FF_DISPLAY points at the token; Bricolage (never loaded, always fell back to Inter) is gone', () => {
    const lc = stripComments(read('client/src/pages/marketplace/LandingComponents.tsx'));
    expect(lc).toMatch(/export const FF_DISPLAY = ['"`]var\(--font-display\)['"`]/);
    expect(lc).toMatch(/export const FF_BODY = ['"`]var\(--font-sans\)['"`]/);
    expect(lc).not.toContain('Bricolage');
  });
  it('no customer file still inlines the Bricolage string', () => {
    const files = ['BlogList', 'BlogPost', 'GuestCancel', 'MarketplaceLogin', 'MarketplaceSignup', 'PersonalityCard', 'Rankings', 'ResetPassword', 'VerifyEmail', 'Welcome', 'JoinTheCrew'];
    for (const f of files) expect(read(`client/src/pages/marketplace/${f}.tsx`), f).not.toContain('Bricolage');
    expect(read('client/src/components/marketplace/SkillAssessmentStepper.tsx')).not.toContain('Bricolage');
  });
  it('the CTA factories are display-font', () => {
    const lc = stripComments(read('client/src/pages/marketplace/LandingComponents.tsx'));
    const base = lc.slice(lc.indexOf('const BTN_BASE'), lc.indexOf('const BTN_SIZE'));
    expect(base).toMatch(/fontFamily:\s*FF_DISPLAY/);
    const cs = read('client/src/pages/marketplace/CheckoutSuccess.tsx');
    expect((cs.match(/fontFamily:\s*FF_DISPLAY/g) ?? []).length).toBeGreaterThanOrEqual(2); // navyBtnStyle + ghostBtnStyle
    // Every PAGE-LOCAL pill factory (found by headless verify still computing Inter on the
    // hero "Browse Sessions" / SessionDetails "Book" / Checkout "Pay") is display too. The
    // pin reads each factory body: no FF_BODY on the pill base, FF_DISPLAY present.
    const factories: Array<[string, string, string]> = [
      ['MarketplaceHome.tsx', 'function btnStyle(', 'export default function MarketplaceHome'],
      ['Checkout.tsx', 'function navyBtnStyle(', 'function CancellationPolicy'],
      ['CheckoutCancel.tsx', 'function navyBtnStyle(', 'export default function'],
      ['SessionDetails.tsx', 'function navyBtnStyle(', 'function PriceLabel'],
    ];
    for (const [file, from, to] of factories) {
      const src = stripComments(read(`client/src/pages/marketplace/${file}`));
      const body = src.slice(src.indexOf(from), src.indexOf(to));
      expect(body.length, `${file}: factory slice`).toBeGreaterThan(50);
      expect(body, `${file}: pill base must be display`).toMatch(/fontFamily:\s*FF_DISPLAY,\s*fontWeight:\s*600/);
      // the only body-face allowance is MarketplaceHome's tealLink text-link kind
      const bodyUses = (body.match(/fontFamily:\s*FF_BODY/g) ?? []).length;
      expect(bodyUses, `${file}: FF_BODY inside the pill factory`).toBeLessThanOrEqual(file === 'MarketplaceHome.tsx' ? 1 : 0);
    }
  });
  it('admin inherits: global h1-h6, shadcn Button, CardTitle use the display font', () => {
    const h = css.slice(css.indexOf('h1, h2, h3, h4, h5, h6 {'), css.indexOf('h1, h2, h3, h4, h5, h6 {') + 200);
    expect(h).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(read('client/src/components/ui/button.tsx')).toMatch(/font-display/);
    expect(read('client/src/components/ui/card.tsx')).toMatch(/font-display/);
  });
  it('dense numbers stay body + tabular: wallet amounts and payment countdown carry tabular-nums, not the display font', () => {
    const mb = read('client/src/pages/marketplace/MyBookings.tsx');
    // the payment-countdown label span and the wallet chip figure
    expect(mb).toMatch(/text-payment-countdown[^\n]*\n[^\n]*|fontVariantNumeric:\s*'tabular-nums'/);
    expect((mb.match(/tabular-nums/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ── PART B: brand tokens ───────────────────────────────────────────────────
describe('HSL tokens equal the true brand (exact hex round-trip)', () => {
  it('--primary is navy #002C84', () => { expect(hslHex(...token(rootBlock, '--primary'))).toBe('#002C84'); });
  it('--secondary is FILL teal #00766C; --secondary-text is TEXT teal #006B5F', () => {
    expect(hslHex(...token(rootBlock, '--secondary'))).toBe('#00766C');
    expect(hslHex(...token(rootBlock, '--secondary-text'))).toBe('#006B5F');
  });
  it('--background is beige #F2ECE1', () => { expect(hslHex(...token(rootBlock, '--background'))).toBe('#F2ECE1'); });
  it('--muted-foreground moved to 40% for headroom', () => { expect(token(rootBlock, '--muted-foreground')[2]).toBe(40); });
  it('the sidebar/ring/chart mirrors follow the same values', () => {
    for (const t of ['--sidebar-primary', '--ring', '--chart-1']) expect(hslHex(...token(rootBlock, t)), t).toBe('#002C84');
    for (const t of ['--sidebar-accent', '--chart-2', '--accent']) expect(hslHex(...token(rootBlock, t)), t).toBe('#00766C');
  });
  it('no drifted brand hex literal remains inside index.css', () => {
    expect(stripComments(css)).not.toMatch(/#003E8C|#006B5F(?![^\n]*secondary-text)|#F5EFE0/i);
  });
});

describe('MKT (customer layer) equals the true brand, ramps re-derived, inkMute fixed', () => {
  const lc = read('client/src/pages/marketplace/LandingComponents.tsx');
  const mkt = lc.slice(lc.indexOf('export const MKT'), lc.indexOf('} as const;'));
  const v = (k: string) => mkt.match(new RegExp(`\\b${k}:\\s*'([^']+)'`))?.[1];
  it('bases', () => { expect(v('navy')).toBe('#002C84'); expect(v('teal')).toBe('#00766C'); expect(v('tealText')).toBe('#006B5F'); expect(v('cream')).toBe('#F2ECE1'); });
  it('ramps were re-derived from the new bases (computed, not eyeballed)', () => {
    expect(v('navyD')).toBe('#001D58'); expect(v('navyL')).toBe('#385BAA'); expect(v('navyInk')).toBe('#000E30');
    expect(v('tealD')).toBe('#005A52'); expect(v('tealL')).toBe('#2D958C'); expect(v('tealMist')).toBe('#E0EEEC');
    expect(v('creamD')).toBe('#E6DFD3'); expect(v('creamL')).toBe('#F9F5EC'); expect(v('paper')).toBe('#FEF9F0');
  });
  // Plan quoted #6B7385 as 4.5:1 on beige; MEASURED 4.04 (fails). Corrected to #626A7C = 4.61 beige / 5.42 white.
  it('inkMute is now a passing text colour', () => { expect(v('inkMute')).toBe('#626A7C'); });
});

describe('zero drifted brand hex in the customer layer (the sweep held)', () => {
  it('no #003E8C / #F5EFE0 anywhere under pages/marketplace or components/marketplace; #006B5F only as the tealText token', () => {
    const { execSync } = require('child_process');
    const out = execSync(`grep -rl -iE "003E8C|F5EFE0" client/src/pages/marketplace client/src/components/marketplace client/src/components/MobileBottomNav.tsx client/src/components/MarketplaceNav.tsx client/src/components/MarketplaceFooter.tsx client/src/components/BadgeTag.tsx client/src/components/BrandAvatar.tsx client/src/components/Wordmark.tsx || true`, { cwd: join(__dirname, '..') }).toString().trim();
    expect(out, 'files still carrying drifted hex:\n' + out).toBe('');
    const teal = execSync(`grep -rn -i "006B5F" client/src/pages/marketplace client/src/components/marketplace client/src/components/MobileBottomNav.tsx client/src/components/MarketplaceNav.tsx client/src/components/MarketplaceFooter.tsx || true`, { cwd: join(__dirname, '..') }).toString().trim().split('\n').filter(Boolean);
    // the only permitted #006B5F is the tealText definition itself
    expect(teal.filter(l => !/tealText:/.test(l)), 'stray #006B5F:\n' + teal.join('\n')).toEqual([]);
  });
});

describe('Wordmark — one component, every site', () => {
  it('renders Shuttle + IQ in the display font on brand tokens', async () => {
    const { Wordmark } = await import('../client/src/components/Wordmark');
    render(<Wordmark />);
    const el = screen.getByTestId('wordmark');
    expect(el.textContent).toBe('ShuttleIQ');
    expect(el.style.fontFamily || el.className).toMatch(/font-display|--font-display/);
    expect(el.querySelector('[data-part="iq"]')).toBeTruthy();
  });
  it('every former inline site imports it', () => {
    for (const f of ['client/src/pages/PlayerRegistry.tsx', 'client/src/pages/SessionsManagement.tsx', 'client/src/components/MarketplaceNav.tsx', 'client/src/components/MarketplaceFooter.tsx', 'client/src/components/Header.tsx', 'client/src/pages/Home.tsx']) {
      const s = read(f);
      expect(s, f).toMatch(/import \{[^}]*Wordmark[^}]*\} from ['"]@\/components\/Wordmark['"]/);
      expect(s, f).not.toMatch(/Shuttle<span[^>]*>IQ<\/span>/);
      expect(s, f).not.toMatch(/style=\{\{ color: '#002C84' \}\}>Shuttle/);
    }
  });
});

describe('AA contrast — computed from the tokens as written', () => {
  const beige = hslHex(...token(rootBlock, '--background'));
  const mutedFg = hslHex(...token(rootBlock, '--muted-foreground'));
  const fg = hslHex(...token(rootBlock, '--foreground'));
  const navy = hslHex(...token(rootBlock, '--primary'));
  const tealFill = hslHex(...token(rootBlock, '--secondary'));
  const tealText = hslHex(...token(rootBlock, '--secondary-text'));
  it('muted-foreground on beige >= 4.9 (headroom, not just 4.5)', () => { expect(contrast(mutedFg, beige)).toBeGreaterThanOrEqual(4.9); });
  it('foreground on beige >= 12', () => { expect(contrast(fg, beige)).toBeGreaterThanOrEqual(12); });
  it('navy text on beige and on white >= 7 (AAA)', () => { expect(contrast(navy, beige)).toBeGreaterThanOrEqual(7); expect(contrast(navy, '#FFFFFF')).toBeGreaterThanOrEqual(7); });
  it('TEXT teal on beige >= 4.9 and on white >= 6 (the split exists precisely for this)', () => {
    expect(contrast(tealText, beige)).toBeGreaterThanOrEqual(4.9);
    expect(contrast(tealText, '#FFFFFF')).toBeGreaterThanOrEqual(6);
  });
  it('white on navy and on FILL teal >= 4.5 (button labels)', () => {
    expect(contrast('#FFFFFF', navy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', tealFill)).toBeGreaterThanOrEqual(4.5);
  });
  it('MKT.inkSub and inkMute on beige and on white >= 4.5', () => {
    expect(contrast('#5C6577', beige)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#626A7C', beige)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#626A7C', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
