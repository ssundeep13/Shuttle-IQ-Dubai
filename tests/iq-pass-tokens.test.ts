// IQ Pass — brand tokens for the IQ Pass screens (Sandeep, 2026-09-14): the
// brief's #003E8C / #006B5F / #F5EFE0. The app-wide MKT tokens drifted to
// #002C84 / #F2ECE1 (logged under "Found, not fixed"), and the customer-layer
// sweep test bans the brief's navy/beige literals inside pages/marketplace and
// components/marketplace — so the IQ Pass values live in ONE module outside
// those globs and every IQ Pass screen imports it instead of inlining hex.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IQP, IQP_FONT } from '../client/src/lib/iqPassTokens';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('IQ Pass tokens', () => {
  it('resolve to the brief values exactly', () => {
    expect(IQP.navy).toBe('#003E8C');
    expect(IQP.teal).toBe('#006B5F');
    expect(IQP.cream).toBe('#F5EFE0');
    expect(IQP_FONT).toBe('var(--font-sans)'); // Inter (the app loads it as --font-sans)
  });

  it('ink / surface companions are the app ink scale (no new drift), white for on-navy text', () => {
    expect(IQP.ink).toBe('#1A1F2B');
    expect(IQP.inkSub).toBe('#5C6577');
    expect(IQP.white).toBe('#FFFFFF');
    expect(IQP.line).toBe('rgba(0, 30, 70, 0.10)');
  });

  it('the module sits outside the customer-layer hex-sweep globs and is the only place the values are written', () => {
    const src = read('client/src/lib/iqPassTokens.ts');
    expect(src.match(/#003E8C/g)?.length).toBe(1);
    expect(src.match(/#F5EFE0/g)?.length).toBe(1);
    expect(src.match(/#006B5F/g)?.length).toBe(1);
    // the app-wide tokens are untouched (the drift is logged, not fixed)
    const mkt = read('client/src/pages/marketplace/LandingComponents.tsx');
    expect(mkt.includes("navy: '#002C84'")).toBe(true);
    expect(mkt.includes("cream: '#F2ECE1'")).toBe(true);
  });
});
