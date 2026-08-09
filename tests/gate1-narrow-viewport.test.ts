import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Gate 1 — narrow-viewport integrity (mobile audit findings B1/B2/B4/F8/F13/P22).
// Structural pins in the suite's source-grep convention; rendered geometry is
// verified live at 360/380/412 after deploy.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Gate 1 — narrow-viewport integrity', () => {
  it('B1: score stepper row wraps so deuce steppers stay reachable at 360', () => {
    const s = read('client/src/components/CourtCard.tsx');
    const panel = s.slice(s.indexOf('score-entry-'), s.indexOf('button-record-game-'));
    expect(panel.includes('flex flex-wrap items-center justify-between')).toBe(true);
  });

  it('B2: header top bar shrinks/wraps instead of forcing page width', () => {
    const s = read('client/src/components/Header.tsx');
    const bar = s.slice(s.indexOf('Top Bar'), s.indexOf('Session Info Strip'));
    expect(bar.includes('flex-wrap')).toBe(true);
    expect(bar.includes('min-w-0')).toBe(true);
    // auth group right-aligns when it wraps to a second line
    expect(bar.includes('ml-auto')).toBe(true);
    // Admin label is icon-only below sm
    expect(bar.includes('hidden sm:inline')).toBe(true);
  });

  it('B2: toast is capped to the viewport width', () => {
    const s = read('client/src/components/NotificationToast.tsx');
    expect(s.includes('max-w-[calc(100vw-2rem)]')).toBe(true);
  });

  it('B2: page container clips horizontal overflow', () => {
    const s = read('client/src/pages/Home.tsx');
    expect(/"[^"]*min-h-screen[^"]*overflow-x-clip[^"]*"|"[^"]*overflow-x-clip[^"]*min-h-screen[^"]*"/.test(s)).toBe(true);
  });

  it('B4: history date yields (truncates) instead of pushing chevron+edit off-canvas', () => {
    const s = read('client/src/components/GameHistory.tsx');
    const row = s.slice(s.indexOf('Date — pushed right'), s.indexOf('{/* Chevron */}'));
    expect(row.includes('truncate')).toBe(true);
    expect(row.includes('shrink-0')).toBe(false);
    // fixed children must fit at 380 with the date at zero width:
    // tight gap + trigger padding (live-measured: gap-3/px-4 left edit at 382)
    const trigger = s.slice(s.indexOf('<AccordionTrigger'), s.indexOf('{/* Expanded detail */}'));
    expect(trigger.includes('gap-2 w-full min-w-0')).toBe(true);
    expect(trigger.includes('px-3 py-3')).toBe(true);
  });

  it('F8: deck player rows are two-line — Swap right-aligned on the meta line, both states', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    const eph = s.slice(s.indexOf('const suggestionTeam'), s.indexOf('return (', s.indexOf('const suggestionTeam')));
    const locked = s.slice(s.indexOf('const teamChips'), s.indexOf('const candidateButtons'));
    for (const block of [eph, locked]) {
      // Swap pushed to the right edge of its own player's meta line
      expect(block.includes('ml-auto')).toBe(true);
      // the old single-line wrap-anywhere row is gone
      expect(block.includes('flex items-center gap-2 flex-wrap')).toBe(false);
    }
  });

  it('F13: Queue/History card titles stay single-line', () => {
    const q = read('client/src/components/PlayerQueue.tsx');
    const g = read('client/src/components/GameHistory.tsx');
    expect(/<h2 className="[^"]*truncate/.test(q)).toBe(true);
    expect(/<h2 className="[^"]*truncate/.test(g)).toBe(true);
  });

  it('P22: carousel indicator pills are 12px+', () => {
    const s = read('client/src/components/NextGamesDeck.tsx');
    expect(s.includes('text-[11px]')).toBe(false);
  });
});
