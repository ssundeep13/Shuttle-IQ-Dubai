/**
 * Gate 3 (audit G5) — brand/a11y token sweep. VISUAL ONLY: any logic change
 * in this gate's diff is a tripwire.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getSkillTierColor } from '../shared/utils/skillUtils';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// WCAG relative-luminance contrast, computed from the token values themselves.
const hsl2rgb = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
};
const parseHsl = (css: string, name: string): [number, number, number] => {
  const m = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('Gate 3 — contrast', () => {
  const css = read('client/src/index.css');
  const root = css.slice(css.indexOf(':root'), css.indexOf('.dark'));

  it('muted-foreground clears WCAG AA (4.5:1) on the cream background', () => {
    const fg = hsl2rgb(...parseHsl(root, 'muted-foreground'));
    const bg = hsl2rgb(...parseHsl(root, 'background'));
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('every tier pill renders readable text (no 1.8:1 colour-on-cream)', () => {
    // the pill classes must not put a low-contrast semantic token on text
    for (const tier of ['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Professional']) {
      const cls = getSkillTierColor(tier);
      expect(cls).not.toMatch(/text-(success|warning|info)\b/);
      expect(cls).not.toMatch(/text-amber-\d/);
    }
  });

  it('Professional is navy, not red (tier-band spec)', () => {
    const cls = getSkillTierColor('Professional');
    expect(cls).toContain('primary');
    expect(cls).not.toContain('destructive');
    expect(getSkillTierColor('Advanced')).toBe(cls); // legacy alias same band
  });
});

describe('Gate 3 — fonts, viewport, emoji', () => {
  const html = read('client/index.html');

  it('exactly one font family is loaded (Inter, via the stylesheet import)', () => {
    // the 25-family <link> is gone; preconnect hints stay (they speed the one
    // Inter @import and so REDUCE fallback flash)
    expect(html).not.toMatch(/<link[^>]+css2\?family=/);
    const css = read('client/src/index.css');
    const imports = css.match(/@import[^;]+;/g) ?? [];
    expect(imports.length).toBe(1);
    expect(imports[0]).toContain('Inter');
    // one family requested, not a list
    expect((imports[0].match(/family=/g) ?? []).length).toBe(1);
  });

  it('pinch-zoom is unblocked and the safe area is honoured', () => {
    const meta = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? '';
    expect(meta).not.toContain('maximum-scale');
    expect(meta).toContain('viewport-fit=cover');
    const css = read('client/src/index.css');
    expect(css).toContain('env(safe-area-inset');
  });

  it('no emoji in the dialog copy', () => {
    const dlg = read('client/src/components/AutoAssignConfirmDialog.tsx');
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(dlg)).toBe(false);
  });
});

describe('Gate 3 — radius scale', () => {
  it('captain surfaces use the 3/6/9px token scale, not stray 12/16px', () => {
    for (const f of [
      'client/src/components/CourtCard.tsx',
      'client/src/components/NextGamesDeck.tsx',
      'client/src/components/PlayerQueue.tsx',
      'client/src/components/GameHistory.tsx',
      'client/src/components/SessionLeaderboard.tsx',
    ]) {
      const s = read(f);
      expect(s.includes('rounded-xl')).toBe(false);
      expect(s.includes('rounded-2xl')).toBe(false);
    }
  });
});
