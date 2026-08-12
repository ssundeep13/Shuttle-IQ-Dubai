/**
 * Gate A (suggestions diagnosis D1) — session-wide inGame + honest receipts.
 * inGame must mean "in any live game this session", not "on this court";
 * a playing player's stale wait-count must never render. The waiter-tier
 * ranking comparator is explicitly OUT of scope and pinned byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Gate A — session-wide inGame', () => {
  it('server: inGame derives from the session playing set, not the own-court set', () => {
    const s = read('server/routes.ts');
    const ep = s.slice(s.indexOf('app.get("/api/courts/:courtId/suggestions"'), s.indexOf('app.get("/api/courts/:courtId/suggestions"') + 12000);
    expect(ep.includes('playingNow')).toBe(true);
    expect(ep.includes('inGame: playingNow.has(p.id)')).toBe(true);
    expect(ep.includes('inGame: currentSet.has(p.id)')).toBe(false);
  });

  it('server: a playing player carries no stale wait receipt', () => {
    const s = read('server/routes.ts');
    const ep = s.slice(s.indexOf('const receipts: Record'), s.indexOf('const receipts: Record') + 800);
    expect(ep.includes('playingNow.has(id)')).toBe(true);
    // playing players report zero wait — the honest state is their game count
    expect(/gamesWaited:\s*playingNow\.has\(id\)\s*\?\s*0/.test(ep)).toBe(true);
  });

  it('client: both inGame derivations use the session-wide playing set', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    expect(s.includes('const inGame = playing.has(p.playerId)')).toBe(true);
    expect(s.includes('inGame: playing.has(incoming.id)')).toBe(true);
    expect(s.includes('const inGame = ownCourtIds.has(p.playerId)')).toBe(false);
    expect(s.includes('inGame: ownCourtIds.has(incoming.id)')).toBe(false);
  });

  it('OUT of scope: rotation comparator is byte-identical', () => {
    const s = read('server/rotation-planner.ts');
    const fn = s.slice(s.indexOf('export function orderRotationCandidates'), s.indexOf('// Recent partners'));
    expect(fn.includes('(a, b) => b.gamesWaited - a.gamesWaited || a.queueIndex - b.queueIndex')).toBe(true);
    expect(fn.includes('a.gamesThisSession - b.gamesThisSession ||')).toBe(true);
    expect(fn.includes('(a.lastGameEndedAt?.getTime() ?? 0) - (b.lastGameEndedAt?.getTime() ?? 0)')).toBe(true);
  });
});
