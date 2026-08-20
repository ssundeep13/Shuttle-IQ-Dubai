/**
 * BookSessions subheading: the count is `filteredSessions.length` — ALL
 * upcoming sessions (Aug→Sep spread), never a 7-day window. The old copy
 * claimed "N sessions across the next 7 days" and read "33" when only 6 were
 * inside the week. The line must describe what the list actually shows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('BookSessions subheading is honest about its count', () => {
  const src = readFileSync(join(__dirname, '..', 'client/src/pages/marketplace/BookSessions.tsx'), 'utf8');

  it('no 7-day claim anywhere (the filter has no such window)', () => {
    expect(src).not.toContain('next 7 days');
  });

  it('the count line says "upcoming session(s)" and still counts the filtered list', () => {
    const i = src.indexOf('upcoming session{');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i - 200, i + 100)).toMatch(/filteredSessions\.length/);
    expect(src.slice(i - 50, i + 200)).toContain('book in two taps');
  });
});
