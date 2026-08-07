// Gate 2 — deck-lite. One structural change: the UpNextStrip mounts moved
// from CourtCard into the NEXT GAMES deck in Home. These pins hold the
// relocation's contract:
//   1. The deck renders ABOVE the courts grid (mount order in Home).
//   2. The strip comes along UNCHANGED — same component, same 5 props, and
//      its own props interface gained nothing.
//   3. CourtCard is now the live-game surface: no strip, no assign flow —
//      and the score-entry hot path (992a07f) is byte-identical in intent:
//      its markers all survive.
//   4. Mobile is a snap carousel (never stacked) with court-name indicators.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('Gate 2: NEXT GAMES deck-lite relocation', () => {
  const home = read('client/src/pages/Home.tsx');
  const deck = read('client/src/components/NextGamesDeck.tsx');
  const card = stripComments(read('client/src/components/CourtCard.tsx'));
  const strip = read('client/src/components/UpNextStrip.tsx');

  it('Home mounts the deck between the tab bar and the courts grid', () => {
    const courtsTab = home.slice(home.indexOf("activeTab === 'courts'"));
    const deckIdx = courtsTab.indexOf('<NextGamesDeck');
    const gridIdx = courtsTab.indexOf('<CourtManagement');
    expect(deckIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(-1);
    expect(deckIdx).toBeLessThan(gridIdx); // deck ABOVE the grid
  });

  it('the deck mounts UpNextStrip with the same 5 props the CourtCard mount passed', () => {
    const mount = deck.slice(deck.indexOf('<UpNextStrip'), deck.indexOf('/>', deck.indexOf('<UpNextStrip')));
    for (const prop of ['court=', 'queuePlayers=', 'playingPlayerIds=', 'isSandboxSession=', 'aiModeEnabled=']) {
      expect(mount.includes(prop), `strip mount missing ${prop}`).toBe(true);
    }
  });

  it("UpNextStrip's own props interface gained nothing (behavior comes along unchanged)", () => {
    const iface = strip.slice(
      strip.indexOf('interface UpNextStripProps'),
      strip.indexOf('}', strip.indexOf('interface UpNextStripProps')),
    );
    const props = iface.match(/^\s{2}\w+[?]?:/gm) ?? [];
    expect(props.length).toBe(5); // court, queuePlayers, playingPlayerIds, isSandboxSession, aiModeEnabled
  });

  it('CourtCard no longer mounts the strip or any assign flow', () => {
    expect(card.includes('UpNextStrip')).toBe(false);
    expect(card.includes('AssignSheet')).toBe(false);
    expect(card.includes('button-open-assign-sheet')).toBe(false);
    expect(card.includes('button-assign-players')).toBe(false);
    expect(card.includes('onAssignPlayers')).toBe(false);
  });

  it('the score-entry hot path survives in CourtCard untouched', () => {
    for (const marker of [
      'button-select-team-',        // winner chips
      'score-entry-',               // inline panel
      'button-loser-score-',        // quick-tap chips
      'button-record-game-',        // the one Record tap
      'button-cancel-game-',        // quiet cancel link
    ]) {
      expect(card.includes(marker), `hot-path marker ${marker} missing from CourtCard`).toBe(true);
    }
  });

  it('free courts keep a slim placeholder card in the grid', () => {
    expect(card.includes('free-placeholder-')).toBe(true);
  });

  it('mobile deck is a horizontal snap carousel with court-name indicators — never stacked', () => {
    const scroller = deck.slice(deck.indexOf('overflow-x-auto') - 200, deck.indexOf('overflow-x-auto') + 300);
    expect(scroller.includes('snap-x')).toBe(true);
    expect(scroller.includes('snap-mandatory')).toBe(true);
    expect(deck.includes('snap-center')).toBe(true);
    expect(deck.includes('md:grid')).toBe(true);            // grid only from md up
    expect(deck.includes('deck-indicators')).toBe(true);    // court-name chips
    expect(deck.includes('{court.name}')).toBe(true);
  });

  it('the deck panel wires Assign manually → AssignSheet → onAssignPlayers', () => {
    expect(deck.includes('button-assign-manually-')).toBe(true);
    // the sheet's Start Game still fires the Home callback with the court id
    const sheet = deck.slice(deck.indexOf('function AssignSheet'));
    expect(sheet.includes('onAssignPlayers(court.id)')).toBe(true);
    expect(sheet.includes('data-testid={`button-assign-players-${court.id}`}')).toBe(true);
  });

  it('deck and grid sort courts with the same shared comparator (fixed order stays agreed)', () => {
    expect(deck.includes("from \"@/lib/courtOrder\"")).toBe(true);
    expect(read('client/src/components/CourtManagement.tsx').includes("from \"@/lib/courtOrder\"")).toBe(true);
  });
});
