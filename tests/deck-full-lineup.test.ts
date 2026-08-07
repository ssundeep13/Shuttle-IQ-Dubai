// Always-visible-lineup gate (real-phone finding): deck panels must show
// the full four players with ratings on every width, no tap required. The
// collapse affordance survives only for the secondary controls.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const strip = readFileSync(join(__dirname, '..', 'client/src/components/UpNextStrip.tsx'), 'utf8');

describe('always-visible deck lineups', () => {
  it('LOCKED state: the team grid renders OUTSIDE the expanded guard', () => {
    const lockedStart = strip.indexOf('// ── LOCKED IN');
    const block = strip.slice(lockedStart, strip.indexOf('// ── EPHEMERAL'));
    const gridIdx = block.indexOf('{teamChips(team1, "Team 1")}');
    expect(gridIdx).toBeGreaterThan(-1);
    // no `{expanded && (` opens between the container start and the grid —
    // the grid is unconditional; expanded gates only what FOLLOWS it
    const beforeGrid = block.slice(block.indexOf('data-testid={`strip-up-next-'), gridIdx);
    expect(beforeGrid.includes('{expanded && (')).toBe(false);
    const afterGrid = block.slice(gridIdx);
    expect(afterGrid.includes('{expanded && (')).toBe(true); // controls still gated
  });

  it('LOCKED state: Swap sits behind the toggle; the truncating names summary is gone', () => {
    const lockedStart = strip.indexOf('// ── LOCKED IN');
    const block = strip.slice(lockedStart, strip.indexOf('// ── EPHEMERAL'));
    // Swap button is expanded-gated inside teamChips
    const swapIdx = block.indexOf('button-upnext-swap-${court.id}-${p.playerId}');
    const gateIdx = block.lastIndexOf('{expanded && (', swapIdx);
    expect(gateIdx).toBeGreaterThan(-1);
    // the old one-line "A + B vs C + D" summary no longer exists in the toggle
    expect(block.includes('.join(" + ")')).toBe(false);
    // the toggle reads as the edit affordance now
    expect(block.includes('"Done" : "Edit"')).toBe(true);
  });

  it('CONFIRM state: full team lines with ratings replace the truncating summary', () => {
    const confirmStart = strip.indexOf('if (!isOccupied && confirmRow)');
    const block = strip.slice(confirmStart, strip.indexOf('// ── LOCKED IN'));
    expect(block.includes('upnext-confirm-player-')).toBe(true);
    expect(block.includes('<RatingText id={p.playerId} />')).toBe(true);
    expect(block.includes('{confirmTeam(t1, "Team 1")}')).toBe(true);
    expect(block.includes('.join(" + ")')).toBe(false); // summary line dead
    // Confirm & start and the status line survive untouched
    expect(block.includes('button-up-next-confirm-')).toBe(true);
    expect(block.includes('text-up-next-confirm-state-')).toBe(true);
  });

  it('panels hug their own content — no tallest-sibling stretch (Finding B)', () => {
    const deck = readFileSync(join(__dirname, '..', 'client/src/components/NextGamesDeck.tsx'), 'utf8');
    // items-start covers BOTH the mobile flex carousel and the md/lg grid:
    // flex/grid default (stretch) inflated every panel to the tallest sibling.
    const scroller = deck.slice(deck.indexOf('overflow-x-auto') - 200, deck.indexOf('overflow-x-auto') + 200);
    expect(scroller.includes('items-start')).toBe(true);
  });

  it('EPHEMERAL state: lineup + why-line remain always-visible (regression pin)', () => {
    const whyIdx = strip.indexOf('text-up-next-reason-');
    const teamsIdx = strip.indexOf('{suggestionTeam(current.team2, 2, "Team 2")}');
    expect(teamsIdx).toBeGreaterThan(-1);
    expect(whyIdx).toBeGreaterThan(teamsIdx);
    // the suggestion grid is not behind any expand toggle
    const ephemeralBlock = strip.slice(strip.indexOf('const suggestionTeam'), whyIdx);
    expect(ephemeralBlock.includes('{expanded &&')).toBe(false);
  });
});
