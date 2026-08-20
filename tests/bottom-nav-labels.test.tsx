/**
 * Bottom nav labels: "MY BOOKINGS" wrapped to two lines at 390px (5 tabs,
 * ~78px each; the uppercase 11px string needs ~86px), making that tab taller
 * than its siblings. Label is now "Bookings" — route and behaviour untouched.
 * whitespace-nowrap on the label span so a future too-long label overflows
 * visibly in dev instead of silently wrapping again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'client/src/components/MobileBottomNav.tsx'), 'utf8');

describe('MobileBottomNav — single-line labels', () => {
  it('auth tab labels are the five short forms; the two-word booking label is gone', () => {
    for (const label of ['Dashboard', 'Sessions', 'Bookings', 'Rankings', 'Stats']) {
      expect(src).toContain(`label: '${label}'`);
    }
    expect(src).not.toContain("'My Bookings'");
  });

  it('the bookings tab still points at the same route', () => {
    expect(src).toMatch(/href: '\/marketplace\/my-bookings',\s*label: 'Bookings'/);
  });

  it('label span refuses to wrap (overflow beats silent two-line tabs)', () => {
    const i = src.indexOf('text-[11px]');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i - 100, i + 200)).toContain('whitespace-nowrap');
  });
});
