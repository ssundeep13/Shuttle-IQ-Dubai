import { describe, it, expect } from 'vitest';
import { computeOnboardingScore } from '../shared/utils/skillUtils';

describe('computeOnboardingScore', () => {
  it('all 1s → 35 / Novice', () => {
    expect(computeOnboardingScore([1, 1, 1])).toEqual({ score: 35, tier: 'Novice' });
  });

  it('all 2s → 55 / Beginner', () => {
    expect(computeOnboardingScore([2, 2, 2])).toEqual({ score: 55, tier: 'Beginner' });
  });

  it('all 3s → 75 / lower_intermediate', () => {
    expect(computeOnboardingScore([3, 3, 3])).toEqual({ score: 75, tier: 'lower_intermediate' });
  });

  it('all 4s → 95 / upper_intermediate (hard cap)', () => {
    expect(computeOnboardingScore([4, 4, 4])).toEqual({ score: 95, tier: 'upper_intermediate' });
  });

  it('mixed answers map to bands by average', () => {
    // avg 2.67 → 75 (lower_intermediate)
    expect(computeOnboardingScore([2, 3, 3])).toEqual({ score: 75, tier: 'lower_intermediate' });
    // avg 2.33 → 55 (Beginner)
    expect(computeOnboardingScore([1, 2, 4])).toEqual({ score: 55, tier: 'Beginner' });
    // avg 3.67 → 95 (upper_intermediate, hits cap)
    expect(computeOnboardingScore([3, 4, 4])).toEqual({ score: 95, tier: 'upper_intermediate' });
  });

  it('never returns a score above 95 for any combination', () => {
    for (const a of [1, 2, 3, 4] as const) {
      for (const b of [1, 2, 3, 4] as const) {
        for (const c of [1, 2, 3, 4] as const) {
          expect(computeOnboardingScore([a, b, c]).score).toBeLessThanOrEqual(95);
        }
      }
    }
  });

  it('rejects out-of-range inputs', () => {
    expect(() => computeOnboardingScore([0 as any, 1, 1])).toThrow();
    expect(() => computeOnboardingScore([5 as any, 1, 1])).toThrow();
  });
});
