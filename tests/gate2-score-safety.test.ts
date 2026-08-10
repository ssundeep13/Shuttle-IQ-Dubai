import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Gate 2 — score-entry safety (mobile audit findings F5/F11/F12).
// Logic untouched: chips, points, Record mutation. These pins assert
// targets, colors, and dialog structure only.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Gate 2 — score-entry safety', () => {
  it('F5: cancel-game is a 44px target, separated from the chips', () => {
    const s = read('client/src/components/CourtCard.tsx');
    const block = s.slice(s.indexOf('button-cancel-game-') - 900, s.indexOf('button-cancel-game-') + 200);
    expect(block.includes('min-h-11')).toBe(true);
  });

  it('F5: cancelling requires a confirm — no single-tap destruction', () => {
    const s = read('client/src/components/CourtCard.tsx');
    // the visible button only opens the dialog…
    expect(s.includes('setConfirmCancel(true)')).toBe(true);
    // …and the mutation fires only from the dialog action
    const dialog = s.slice(s.indexOf('<AlertDialogContent'), s.indexOf('</AlertDialog>'));
    expect(dialog.includes('onCancelGame(court.id)')).toBe(true);
    const beforeDialog = s.slice(0, s.indexOf('<AlertDialogContent'));
    expect(beforeDialog.includes('onClick={() => onCancelGame(court.id)}')).toBe(false);
  });

  it('F11: one selected accent in the score flow — teal token, no emerald', () => {
    const s = read('client/src/components/CourtCard.tsx');
    // the whole hot path: VS matchup highlight → winner chips → score panel → Record
    // (the Free/In-Progress status badges are Gate 5 palette-sweep scope)
    const flow = s.slice(s.indexOf('{/* VS matchup */}'), s.indexOf('button-cancel-game-'));
    expect(flow.includes('emerald')).toBe(false);
    const chip = s.slice(s.indexOf('button-select-team-') - 700, s.indexOf('button-select-team-'));
    expect(chip.includes('bg-secondary')).toBe(true);
  });

  it('F12: shared AlertDialog footer is cancel-first with 44px buttons', () => {
    const s = read('client/src/components/ui/alert-dialog.tsx');
    expect(s.includes('flex-col-reverse')).toBe(false);
    const footer = s.slice(s.indexOf('const AlertDialogFooter'), s.indexOf('AlertDialogFooter.displayName'));
    expect(/flex flex-col gap-2 sm:flex-row/.test(footer)).toBe(true);
    const action = s.slice(s.indexOf('const AlertDialogAction'), s.indexOf('AlertDialogAction.displayName'));
    const cancel = s.slice(s.indexOf('const AlertDialogCancel'), s.indexOf('AlertDialogCancel.displayName'));
    expect(action.includes('min-h-11')).toBe(true);
    expect(cancel.includes('min-h-11')).toBe(true);
  });
});
