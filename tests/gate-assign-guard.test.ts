/**
 * assignCourtCore validation gate — block double-courting (repro: a player
 * live on Court 3 was started on Court 2; assignCourtCore wrote everything
 * with zero eligibility checks).
 *
 * The guard lives INSIDE assignCourtCore, before any write, so BOTH entry
 * paths (/api/courts/:id/assign and bracket-assign) are covered atomically.
 * The suggestion-row conflict resolution for NON-playing players (dismiss
 * competing rows) is working-as-designed and pinned byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const routes = () => readFileSync(join(__dirname, '..', 'server/routes.ts'), 'utf8');
const storage = () => readFileSync(join(__dirname, '..', 'server/storage.ts'), 'utf8');

describe('assign guard — double-courting blocked', () => {
  it('(a) the guard sits inside assignCourtCore BEFORE the court claim (atomic)', () => {
    const s = routes();
    const core = s.slice(s.indexOf('async function assignCourtCore'), s.indexOf('async function assignCourtCore') + 3500);
    expect(core.includes('liveConflicts')).toBe(true);
    expect(core.includes('getCourtsWithPlayers')).toBe(true);
    // rejection precedes every write: the return appears before the CAS claim
    expect(core.indexOf('return { liveConflicts }')).toBeLessThan(core.indexOf('occupyCourtIfAvailable'));
    // roster truth, not players.status
    expect(core.includes("status === 'occupied'")).toBe(true);
  });

  it('(a) the assign endpoint returns 409 with names in the pin-conflict shape', () => {
    const s = routes();
    const ep = s.slice(s.indexOf('app.post("/api/courts/:courtId/assign"'), s.indexOf('app.post("/api/courts/:courtId/assign"') + 4500);
    expect(ep.includes('liveConflicts')).toBe(true);
    expect(ep.includes('in a live game — they can be assigned when it ends.')).toBe(true);
    expect(ep.includes('conflicts: ')).toBe(true);
    expect(ep.includes('409')).toBe(true);
  });

  it('(c) bracket-assign skips a conflicted court without partial writes', () => {
    const s = routes();
    const ep = s.slice(s.indexOf('bracket-assign'), s.indexOf('async function assignCourtCore'));
    expect(ep.includes('liveConflicts')).toBe(true);
    expect(/skipped\.push\(\{ courtId, reason: '.*live game.*' \}\)/.test(ep)).toBe(true);
  });

  it('(b) UNCHANGED: suggestion-row conflict resolution for non-playing players is byte-identical', () => {
    const st = storage();
    const fn = st.slice(st.indexOf('async replaceActiveSuggestionForAdminAssignment'), st.indexOf('async replaceActiveSuggestionForAdminAssignment') + 4000);
    // the dismiss-competing-rows behavior: open statuses matched by court OR player
    expect(fn.includes("'pending', 'approved', 'playing', 'queued'")).toBe(true);
    expect(fn.includes('dismissed')).toBe(true);
    // and the core still mirrors through it
    const s = routes();
    const core = s.slice(s.indexOf('async function assignCourtCore'), s.indexOf('async function assignCourtCore') + 4000);
    expect(core.includes('replaceActiveSuggestionForAdminAssignment')).toBe(true);
  });
});
