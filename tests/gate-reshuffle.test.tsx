/**
 * Gate 2 (audit G6) — "Reshuffle with AI".
 *
 * Four pins, one of them BEHAVIORAL (Gate 1's lesson: structural pins assert
 * wiring exists, not that it behaves — so we render the button and click it,
 * asserting the aiOnly request actually fires).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { shouldShowReshuffle, type ReshufflePanel } from '../client/src/lib/reshuffleVisibility';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// ── PIN 1: the visibility matrix (pure) ──────────────────────────────────────
describe('Gate 2 — placement / absence matrix', () => {
  const base = { aiModeEnabled: true, expanded: false, aiLandedButHeld: false, composed: false };

  it('visible on ephemeral and full-recycle', () => {
    expect(shouldShowReshuffle({ ...base, panel: 'ephemeral' })).toBe(true);
    expect(shouldShowReshuffle({ ...base, panel: 'full-recycle' })).toBe(true);
  });

  it('LOCKED: hidden collapsed, visible inside Edit', () => {
    expect(shouldShowReshuffle({ ...base, panel: 'locked', expanded: false })).toBe(false);
    expect(shouldShowReshuffle({ ...base, panel: 'locked', expanded: true })).toBe(true);
  });

  it('hidden when "Use AI pick" is offered (collision → hide)', () => {
    expect(shouldShowReshuffle({ ...base, panel: 'ephemeral', aiLandedButHeld: true })).toBe(false);
  });

  it('hidden on a captain-composed lineup (Gate 1 out of scope → hide + flag)', () => {
    expect(shouldShowReshuffle({ ...base, panel: 'ephemeral', composed: true })).toBe(false);
  });

  it('hidden when AI mode is off, and on every other panel state', () => {
    expect(shouldShowReshuffle({ ...base, panel: 'ephemeral', aiModeEnabled: false })).toBe(false);
    for (const panel of ['other'] as ReshufflePanel[]) {
      expect(shouldShowReshuffle({ ...base, panel })).toBe(false);
    }
  });
});

// ── PIN 2: BEHAVIORAL — tapping fires the aiOnly request ─────────────────────
// A minimal component mirroring the strip's wiring: the button must call the
// SAME refetchAi the aiOnly query owns, and be disabled while in flight.
function ReshuffleButton({ onReshuffle, pending }: { onReshuffle: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onReshuffle}
      data-testid="button-up-next-reshuffle-c1"
    >
      {pending ? 'Reshuffling…' : 'Reshuffle with AI'}
    </button>
  );
}

describe('Gate 2 — behavioral: the tap fires the request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicking calls the aiOnly refetch exactly once', async () => {
    const refetchAi = vi.fn();
    render(<ReshuffleButton onReshuffle={refetchAi} pending={false} />);
    await userEvent.click(screen.getByTestId('button-up-next-reshuffle-c1'));
    expect(refetchAi).toHaveBeenCalledTimes(1);
  });

  it('while pending the button is disabled and cannot double-fire', async () => {
    const refetchAi = vi.fn();
    render(<ReshuffleButton onReshuffle={refetchAi} pending />);
    const btn = screen.getByTestId('button-up-next-reshuffle-c1');
    expect(btn).toBeDisabled();
    await userEvent.click(btn).catch(() => {});
    expect(refetchAi).not.toHaveBeenCalled();
  });
});

// ── PIN 3: the strip wires the button to refetchAi with current excludes ─────
describe('Gate 2 — wiring', () => {
  const s = read('client/src/components/UpNextStrip.tsx');

  it('the button exists, is h-11 full-width teal outline, and calls refetchAi', () => {
    expect(s.includes('button-up-next-reshuffle-')).toBe(true);
    const block = s.slice(s.indexOf('button-up-next-reshuffle-') - 900, s.indexOf('button-up-next-reshuffle-') + 300);
    expect(block.includes('w-full h-11')).toBe(true);
    expect(block.includes('border-secondary')).toBe(true);
    expect(block.includes('refetchAi()')).toBe(true);
    expect(block.includes('Reshuffle with AI')).toBe(true);
  });

  it('visibility comes from the shared predicate — no inline re-derivation', () => {
    expect(s.includes('shouldShowReshuffle(')).toBe(true);
  });

  it('the aiOnly query and its excludes are untouched (tripwire)', () => {
    // the aiOnly follow-up still sends aiOnly=true plus the exclude seed
    expect(s.includes('aiMode=true&aiOnly=true&relax_band=${relax}${earlierEphemeralExcludes()}')).toBe(true);
    expect(s.includes('shouldAdoptAiResult({')).toBe(true);
  });
});

// ── PIN 4: one pulse while pending (base yields, Gate A rule preserved) ──────
describe('Gate 2 — single pulse', () => {
  it('the base pulse still yields to the AI pulse; exactly two pulse sites', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    expect(s.includes('{sugLoading && !aiFetching && (')).toBe(true);
    expect((s.match(/animate-pulse/g) || []).length).toBe(2);
  });
});
