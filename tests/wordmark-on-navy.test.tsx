// Wordmark consistency on navy (Sandeep, 2026-09-24): ONE reversed wordmark — Inter 800, −0.04em, "Shuttle" white,
// "IQ" in the navy-surface teal (IQP.tealOnNavy #5DCAA5) — used by the nav, the footer, the tournament banner and
// every other navy surface. "IQ" never renders #006B5F (or any dark brand teal) on navy.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import React from 'react';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const { Wordmark } = await import('../client/src/components/Wordmark');

describe('the reversed wordmark (onDark)', () => {
  it('Inter 800, −0.04em, "Shuttle" white, "IQ" #5DCAA5 — never #006B5F', () => {
    render(<Wordmark onDark size={20} />);
    const el = screen.getByTestId('wordmark');
    expect(el.textContent).toBe('ShuttleIQ');
    expect(el.style.fontFamily).toBe('var(--font-sans)');
    expect(el.style.fontWeight).toBe('800');
    expect(el.style.letterSpacing).toBe('-0.04em');
    expect(el.style.color).toBe('rgb(255, 255, 255)');
    const iq = el.querySelector('[data-part="iq"]') as HTMLElement;
    expect(iq.style.color).toBe('rgb(93, 202, 165)');
    expect(iq.style.color).not.toBe('rgb(0, 107, 95)');
    expect(el.className).not.toMatch(/font-display|font-bold|tracking-tight/);
  });

  it('accepts a CSS size (the banner title is fluid)', () => {
    render(<Wordmark onDark size="clamp(28px, 2.4vw, 30px)" />);
    expect(screen.getByTestId('wordmark').style.fontSize).toBe('clamp(28px, 2.4vw, 30px)');
  });

  it('the light wordmark is unchanged (display font, brand tokens)', () => {
    render(<Wordmark />);
    const el = screen.getByTestId('wordmark');
    expect(el.className).toMatch(/font-display/);
    expect((el.querySelector('[data-part="iq"]') as HTMLElement).style.color).toBe('hsl(var(--secondary-text))');
  });
});

describe('every navy surface uses the shared reversed wordmark', () => {
  const NAVY_SURFACES = [
    'client/src/components/MarketplaceNav.tsx',
    'client/src/components/MarketplaceFooter.tsx',
    'client/src/components/marketplace/TournamentBanner.tsx',
    'client/src/components/FoundingMemberAward.tsx',
    'client/src/pages/marketplace/JoinTheCrew.tsx',
  ];

  it('imports Wordmark and renders it onDark; no hand-built "Shuttle…IQ" span', () => {
    for (const f of NAVY_SURFACES) {
      const s = read(f);
      expect(s, f).toMatch(/import \{[^}]*Wordmark[^}]*\} from ['"]@\/components\/Wordmark['"]/);
      expect(s, f).toMatch(/<Wordmark[^>]*\bonDark\b/);
      expect(s, f).not.toMatch(/Shuttle<span[^>]*>IQ<\/span>/);
    }
  });

  it('no hand-built "IQ" span is left in the app outside the Wordmark (Instagram image generators excepted: own palette, not an app surface)', () => {
    const EXEMPT = ['client/src/pages/InstagramCarousel.tsx', 'client/src/pages/InstagramFeaturesCarousel.tsx', 'client/src/pages/InstagramLeaderboard.tsx'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(__dirname, '..', dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && p !== 'client/src/components/Wordmark.tsx' && /Shuttle<span[^>]*>IQ<\/span>/.test(read(p))) hits.push(p);
      }
    };
    walk('client/src');
    expect(hits.sort()).toEqual(EXEMPT.sort());
    for (const f of EXEMPT) expect(read(f), f).not.toMatch(/#006B5F/i);
  });
});
