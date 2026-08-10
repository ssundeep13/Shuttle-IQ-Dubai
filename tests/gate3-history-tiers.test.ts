import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTierDisplayName, TIER_DISPLAY_NAMES } from '../shared/utils/skillUtils';

// Gate 3 — tier ruling + History readability (audit B3/F16).
// Ruling: 5-tier ladder, DB 'Advanced' displays Professional,
// getTierDisplayName is the single source for tier display text.

const src = () => readFileSync(join(__dirname, '..', 'client/src/components/GameHistory.tsx'), 'utf8');

describe('Gate 3 — tier display + History readability', () => {
  it('B3 ruling pin: the shared mapper never leaks slugs or the deprecated Advanced label', () => {
    const dbValues = ['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional'];
    for (const v of dbValues) {
      const display = getTierDisplayName(v);
      expect(display.includes('_')).toBe(false);
      expect(display).not.toBe('Advanced');
      expect(TIER_DISPLAY_NAMES.includes(display as any)).toBe(true);
    }
    expect(getTierDisplayName('Advanced')).toBe('Professional');
  });

  it('B3: History renders tiers only through getTierDisplayName — badge and CSV', () => {
    const s = src();
    expect(s.includes('getTierDisplayName(p.playerLevel)')).toBe(true);
    // no raw slug render remains anywhere in the file
    expect(s.includes('{p.playerLevel}')).toBe(false);
    expect(s.includes('(${p.playerLevel})')).toBe(false);
  });

  it('B3 layout: expanded rows — name column shrinks/truncates, delta column fixed', () => {
    const s = src();
    const row = s.slice(s.indexOf('function PlayerScoreRow'), s.indexOf('// ─── GameCard'));
    expect(row.includes('min-w-0')).toBe(true);
    expect(row.includes('truncate')).toBe(true);
    expect(row.includes('shrink-0')).toBe(true);
  });

  it('F16: collapsed row carries a truncating names line', () => {
    const s = src();
    expect(s.includes('text-game-players-')).toBe(true);
    // the trigger is a flex item: without min-w-0 the names line's nowrap
    // intrinsic width propagates up and un-shrinks the whole row (live-caught
    // at 360: edit landed at 362)
    expect(s.includes('className="min-w-0 px-3 py-3')).toBe(true);
    const line = s.slice(s.indexOf('text-game-players-') - 400, s.indexOf('text-game-players-') + 400);
    expect(line.includes('truncate')).toBe(true);
    expect(line.includes('min-w-0')).toBe(true);
    expect(line.includes(' vs ')).toBe(true);
  });
});
