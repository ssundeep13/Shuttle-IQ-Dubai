// Gate 4 — deck + free-card polish (display/entry points only).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chooseSuggestionPool } from '../server/suggestionPool';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const strip = read('client/src/components/UpNextStrip.tsx');
const card = read('client/src/components/CourtCard.tsx');
const deck = read('client/src/components/NextGamesDeck.tsx');
const home = read('client/src/pages/Home.tsx');

describe('Gate 4.1 — ratings on every deck player row', () => {
  it('RatingText renders compact "(NN)" below lg and "M/F · Tier (NN)" from lg up, from the Player source', () => {
    // lg, not md: live verification showed the full form wraps rows to 100px+
    // in md's two-up panels — the spec's "at md+ IF it fits" resolves to lg.
    expect(strip.includes('const RatingText')).toBe(true);
    expect(strip.includes('lg:hidden')).toBe(true);          // compact below lg
    expect(strip.includes('hidden lg:inline')).toBe(true);   // full at lg+
    expect(strip.includes('formatSkillLevel(ratingScore(')).toBe(true); // same source as court cards
  });

  it('ratings mount on locked lineups, suggestion lineups, both swap pickers, and the confirm-row summary', () => {
    expect(strip.includes('<RatingText id={p.playerId} />')).toBe(true); // locked teamChips
    expect(strip.includes('<RatingText id={p.id} fallbackScore={p.skillScore} />')).toBe(true); // ephemeral rows
    // swap pickers append the compact score inside candidate buttons
    expect((strip.match(/\(\{p\.skillScore \?\? 90\}\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // confirm rows: full team lines with RatingText (always-visible-lineup
    // gate replaced the old memberLabel summary)
    expect(strip.includes('upnext-confirm-player-')).toBe(true);
  });

  it('nothing renders under 12px — rating text is text-xs', () => {
    const ratingBlock = strip.slice(strip.indexOf('const RatingText'), strip.indexOf('const RatingText') + 700);
    expect(ratingBlock.includes('text-xs')).toBe(true);
    expect(ratingBlock.includes('text-[10px]')).toBe(false);
    expect(ratingBlock.includes('text-[11px]')).toBe(false);
  });
});

describe('Gate 4.2 — honest empty-pool state (full recycle only)', () => {
  const anyBand = () => true;
  const base = (over: object = {}) => ({
    queue: ['p1', 'p2', 'p3', 'p4', 'p5'],
    sittingOut: new Set<string>(),
    ownCourtPlayerIds: [] as string[],
    strictClaimed: new Set<string>(),
    legacyClaimed: new Set<string>(),
    excludeIds: new Set<string>(),
    passesBand: anyBand,
    ...over,
  });

  it('strictEligibleCount = 0 on FULL recycle, 1-3 on partial, pool size when strict suffices', () => {
    const full = chooseSuggestionPool(base({ excludeIds: new Set(['p1', 'p2', 'p3', 'p4', 'p5']) }));
    expect(full.sharedPool).toBe(true);
    expect(full.strictEligibleCount).toBe(0);
    const partial = chooseSuggestionPool(base({ excludeIds: new Set(['p1', 'p2', 'p3']) }));
    expect(partial.sharedPool).toBe(true);
    expect(partial.strictEligibleCount).toBe(2);
    const ok = chooseSuggestionPool(base());
    expect(ok.sharedPool).toBe(false);
    expect(ok.strictEligibleCount).toBe(5);
  });

  it('the strip replaces the recycled lineup with the honest message + Regenerate on full recycle only', () => {
    expect(strip.includes('sug.sharedPool && (sug.strictEligibleCount ?? 0) === 0')).toBe(true);
    expect(strip.includes('All waiters are booked to earlier courts — this lineup fills as games finish')).toBe(true);
    expect(strip.includes('text-up-next-full-recycle-')).toBe(true);
    // the Shared-pool chip survives for partial overlap
    expect(strip.includes('badge-shared-pool-')).toBe(true);
  });
});

describe('Gate 4.3 — one AssignSheet, two entry points', () => {
  it('both the deck link and the grid free card open the sheet through the SAME lifted callback', () => {
    expect(deck.includes('onClick={() => onOpenAssign(court.id)}')).toBe(true);   // deck link
    expect(card.includes('onClick={() => onOpenAssign(court.id)}')).toBe(true);   // free card
    // Home hands the same setter to both surfaces
    expect(home.includes('assignCourtId={assignSheetCourtId}')).toBe(true);
    expect((home.match(/onOpenAssign=\{setAssignSheetCourtId\}/g) ?? []).length).toBe(2);
  });

  it('the free card is a real button (44px+ target) and CourtCard gained no sheet of its own', () => {
    const placeholder = card.slice(card.indexOf('free-placeholder-') - 600, card.indexOf('free-placeholder-') + 200);
    expect(placeholder.includes('<button')).toBe(true);
    expect(placeholder.includes('min-h-11')).toBe(true); // 44px floor
    // comments mention the sheet's new home — assert on CODE only
    const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code.includes('AssignSheet')).toBe(false);    // no duplicated sheet or logic
    expect(code.includes('SheetContent')).toBe(false);
  });

  it('the sheet still funnels Start Game into onAssignPlayers (single flow)', () => {
    const sheet = deck.slice(deck.indexOf('function AssignSheet'));
    expect(sheet.includes('onAssignPlayers(court.id)')).toBe(true);
  });
});

describe('Gate 4.4 — action hierarchy + 4px grid', () => {
  it('Confirm is the sole primary: teal h-12 in both confirm-row and ephemeral states', () => {
    expect((strip.match(/h-12 text-sm font-semibold bg-secondary/g) ?? []).length).toBe(2);
  });

  it('Regenerate and Dismiss stay demoted (ghost), Undo keeps its confirm dialog', () => {
    const regen = strip.slice(strip.indexOf('button-up-next-regenerate-') - 700, strip.indexOf('button-up-next-regenerate-'));
    expect(regen.includes('variant="ghost"')).toBe(true);
    const dismiss = strip.slice(strip.lastIndexOf('button-up-next-dismiss-') - 500, strip.lastIndexOf('button-up-next-dismiss-'));
    expect(dismiss.includes('variant="ghost"')).toBe(true);
    expect(strip.includes('Unlock this lineup?')).toBe(true); // Undo dialog intact
    expect(strip.includes('AlertDialog open={confirmRemove}')).toBe(true);
  });

  it('strip spacing sits on the 4px grid — no 6px (x-1.5) utilities left', () => {
    for (const off of ['gap-1.5', 'space-y-1.5', 'px-1.5']) {
      expect(strip.includes(off), `off-grid utility ${off} still present`).toBe(false);
    }
  });
});
