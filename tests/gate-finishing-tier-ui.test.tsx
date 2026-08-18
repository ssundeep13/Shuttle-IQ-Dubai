/**
 * Finishing tier — the panel voice. When the pool was widened with players
 * mid-game on OTHER courts, the panel must be honest that this lineup is
 * PROVISIONAL: it "starts as players free up". Plain words, brand tokens, no
 * emoji. Confirm still follows the EXISTING occupied-court path (pinMutation);
 * the 409 action layer remains the arbiter if the captain acts early.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import {
  finishingReceipt, finishingChipCopy, finishingConfirmCopy, FinishingChip,
} from '../client/src/lib/finishingCopy';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('finishingReceipt — "ends in ~N min", replaces the wait count for finishing players', () => {
  it('rounds to whole minutes and never says 0', () => {
    expect(finishingReceipt(6)).toBe('ends in ~6 min');
    expect(finishingReceipt(4.6)).toBe('ends in ~5 min');
    expect(finishingReceipt(0.4)).toBe('ends in under a minute');
    expect(finishingReceipt(0)).toBe('ends in under a minute');
  });
  it('is null when the player is not finishing (waiter/current keep their own receipt)', () => {
    expect(finishingReceipt(undefined)).toBeNull();
  });
});

describe('finishing panel copy — plain voice, no emoji, no jargon', () => {
  it('the chip and the confirm CTA say what will happen', () => {
    expect(finishingChipCopy()).toBe('Starts as players free up');
    expect(finishingConfirmCopy()).toBe('Confirm — starts as players free up');
  });
  it('contains no emoji and none of the engine words', () => {
    for (const s of [finishingChipCopy(), finishingConfirmCopy(), finishingReceipt(3)!]) {
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)).toBe(false);
      expect(/tier|pool|claim|ephemeral|strict/i.test(s)).toBe(false);
    }
  });
});

describe('FinishingChip — renders with brand tokens', () => {
  it('renders the copy on the secondary (teal) token, not amber, not emoji', () => {
    render(<FinishingChip courtId="c1" />);
    const chip = screen.getByTestId('badge-finishing-c1');
    expect(chip.textContent).toBe('Starts as players free up');
    expect(chip.className).toMatch(/text-secondary/);
    expect(chip.className).toMatch(/border-secondary/);
    expect(chip.className).not.toMatch(/amber|success|warning|info/);
  });
});

describe('wiring — UpNextStrip', () => {
  const s = read('client/src/components/UpNextStrip.tsx');

  it('renders the chip when the response flags finishingTier, next to the other meta chips', () => {
    expect(s.includes('finishingTier?: boolean')).toBe(true);
    expect(s).toMatch(/sug\.finishingTier && \(\s*<FinishingChip/);
  });

  it('per-player receipt: a finishing player shows "ends in ~N min", others keep their receipt', () => {
    expect(s.includes('finishingInMin?: number')).toBe(true);
    expect(s.includes('finishingReceipt(p.finishingInMin)')).toBe(true);
  });

  it('Confirm copy switches to the provisional voice ONLY when the tier is active; occupied path (pinMutation) unchanged', () => {
    expect(s.includes('finishingConfirmCopy()')).toBe(true);
    // the button still routes to the existing occupied-court mutation
    expect(s.includes('isOccupied ? pinMutation.mutate(current) : startNowMutation.mutate(current)')).toBe(true);
    // the copy is chosen by the flag, not by kind (finishing only ever appears on occupied courts)
    expect(s).toMatch(/sug\.finishingTier\s*\?\s*finishingConfirmCopy\(\)/);
  });

  it('the dead-state copy is untouched — the tier makes it rarer, not different', () => {
    expect(s.includes('"All players are in games or already lined up"')).toBe(true);
    expect(s.includes('"Not enough players in the session yet"')).toBe(true);
  });
});
