import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeName,
  nameKey,
  phoneKey,
  isFullName,
  nameSimilarity,
  findPlayerCandidates,
  FUZZY_NAME_THRESHOLD,
  type MatchablePlayer,
} from '../shared/utils/playerMatching';

// Gate P1 — duplicate prevention. The matching helper is pure so the
// same-person behavior is provable here; route wiring is tripwired below.

const pool: MatchablePlayer[] = [
  { id: 'p-karthik', name: 'Karthik Anand', phone: '+971 50 123 4567', gamesPlayed: 77, skillScore: 80, lastPlayedAt: '2026-07-01T18:00:00Z' },
  { id: 'p-dinesh', name: 'Dinesh Var', phone: null, gamesPlayed: 124, skillScore: 90, lastPlayedAt: '2026-07-05T18:00:00Z' },
  { id: 'p-aisha', name: 'Aisha Rahman', phone: '050 765 4321', gamesPlayed: 10, skillScore: 53, lastPlayedAt: null },
  { id: 'p-zed', name: 'Zubair Khan', phone: null, gamesPlayed: 3, skillScore: 40, lastPlayedAt: null },
];

describe('player matching - normalization', () => {
  it('normalizeName trims and collapses internal whitespace, casing untouched', () => {
    expect(normalizeName('  Karthik   Anand ')).toBe('Karthik Anand');
    expect(normalizeName('Karthik\t Anand')).toBe('Karthik Anand');
  });

  it('nameKey lowercases on top of normalization', () => {
    expect(nameKey('  KARTHIK   Anand ')).toBe('karthik anand');
  });

  it('phoneKey absorbs +971 / 0 / spacing variants; too-short is null', () => {
    expect(phoneKey('+971 50 123 4567')).toBe(phoneKey('0501234567'));
    expect(phoneKey('050-123-4567')).toBe('501234567');
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey('')).toBeNull();
  });

  it('isFullName: two words after trim, single word fails', () => {
    expect(isFullName('Karthik Anand')).toBe(true);
    expect(isFullName('  Karthik   Anand ')).toBe(true);
    expect(isFullName('Karthik')).toBe(false);
    expect(isFullName('  Karthik  ')).toBe(false);
    expect(isFullName('')).toBe(false);
  });
});

describe('player matching - candidates', () => {
  it('normalized-exact name match returns the candidate', () => {
    const out = findPlayerCandidates(pool, { name: '  karthik   ANAND ' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p-karthik');
    expect(out[0].matchType).toBe('name-exact');
  });

  it('no plausible match returns [] — zero added friction', () => {
    expect(findPlayerCandidates(pool, { name: 'Priya Menon' })).toEqual([]);
    expect(findPlayerCandidates(pool, { name: '' })).toEqual([]);
  });

  it('fuzzy match catches a typo above the threshold', () => {
    expect(nameSimilarity('Kartik Anand', 'Karthik Anand')).toBeGreaterThanOrEqual(FUZZY_NAME_THRESHOLD);
    const out = findPlayerCandidates(pool, { name: 'Kartik Anand' });
    expect(out.map((c) => c.id)).toContain('p-karthik');
    expect(out[0].matchType).toBe('name-fuzzy');
  });

  it('single-word input matches players sharing that first word (guest case)', () => {
    const out = findPlayerCandidates(pool, { name: 'Karthik' });
    expect(out.map((c) => c.id)).toContain('p-karthik');
  });

  it('phone match wins over name and is marked as strong evidence', () => {
    const out = findPlayerCandidates(pool, { name: 'Completely Different', phone: '0501234567' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p-karthik');
    expect(out[0].matchType).toBe('phone');
    // ...and ranks above a name-only match for someone else
    const mixed = findPlayerCandidates(pool, { name: 'Dinesh Var', phone: '+971501234567' });
    expect(mixed[0].matchType).toBe('phone');
  });

  it('receipts carry DISPLAY tiers, never DB enums', () => {
    const out = findPlayerCandidates(pool, { name: 'Karthik Anand' });
    expect(out[0].tier).toBe('Intermediate'); // score 80 → lower_intermediate → display label
    expect(out[0].tier).not.toContain('_');
    expect(out[0].gamesPlayed).toBe(77);
    expect(out[0].lastPlayedAt).toContain('2026-07-01');
  });
});

describe('gate P1 wiring tripwires', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

  it('ensure-player runs the same-person check with linkToPlayerId + forceNew escape hatches', () => {
    const src = read('server/routes.ts');
    const start = src.indexOf('guests/:guestId/ensure-player');
    const end = src.indexOf('bookings/:bookingId/checkin');
    const block = src.slice(start, end);
    expect(block.includes('findPlayerCandidates'), 'candidate check missing from ensure-player').toBe(true);
    expect(block.includes('linkToPlayerId'), 'link-to-existing path missing').toBe(true);
    expect(block.includes('forceNew'), 'forceNew escape hatch missing').toBe(true);
  });

  it('POST /api/players 409s with candidates/single-name and honors force:true', () => {
    const src = read('server/routes.ts');
    const start = src.indexOf('app.post("/api/players"');
    const end = src.indexOf('app.patch("/api/players/:id"');
    const block = src.slice(start, end);
    expect(block.includes('DUPLICATE_CANDIDATES'), '409 candidates payload missing').toBe(true);
    expect(block.includes("'SINGLE_NAME'"), 'single-name soft policy missing').toBe(true);
    expect(block.includes('force'), 'force override missing').toBe(true);
    expect(block.includes('status(409)'), '409 status missing').toBe(true);
  });

  it('both player insert sites normalize the stored name', () => {
    const src = read('server/storage.ts');
    const matches = src.match(/name: normalizeName\((insertPlayer|playerInsert)\.name\)/g) ?? [];
    expect(matches.length, 'expected normalizeName at createPlayer AND _insertPlayerInTx').toBe(2);
  });

  it('signup and complete-profile enforce the full-name policy with brand copy', () => {
    const src = read('server/marketplace-routes.ts');
    const occurrences = src.match(/Please enter your full name \(first and last\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    expect(src.includes('isFullName'), 'full-name helper not used').toBe(true);
  });
});
