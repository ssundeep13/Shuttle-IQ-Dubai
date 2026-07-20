// Badge Gate 2a — automatic attendance from match participation. A
// captain-recorded game IS the venue verification: completeGameTransaction
// stamps bookings.attended_at for every participant with a linked
// marketplace account and a live booking on the session's marketplace
// listing. The hook is savepoint-guarded (an attendance bug can never fail
// score entry), idempotent (NULL-only writes), never touches cancelled
// bookings, and skips sandbox sessions entirely. Live-fixture verification
// sits behind these tripwires; the invariants below are what must never
// silently regress.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('auto-attend hook in completeGameTransaction (tripwires)', () => {
  const storage = read('server/storage.ts');
  const fnStart = storage.indexOf('async completeGameTransaction(');
  const fn = storage.slice(fnStart, storage.indexOf('export const storage'));
  const hookAt = fn.indexOf('[AutoAttend]');

  it('hook exists inside completeGameTransaction, AFTER the core game writes', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(-1);
    // Order: participants insert → suggestion completion → attendance.
    // Attendance must never run before the claim/core writes are in place.
    const participantsAt = fn.indexOf('.insert(gameParticipants)');
    expect(participantsAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(participantsAt);
  });

  it('is savepoint-guarded: nested tx.transaction wrapped in try/catch so a bug never rolls back score entry', () => {
    const hook = fn.slice(fn.indexOf('if (!args.isSandboxSession)'), fn.indexOf('// Feed events'));
    expect(hook.includes('try {')).toBe(true);
    expect(hook.includes('await tx.transaction(async (atx)')).toBe(true);
    expect(hook.includes("console.error('[AutoAttend] failed (score entry unaffected):'")).toBe(true);
  });

  it('skips sandbox sessions entirely', () => {
    expect(fn.includes('if (!args.isSandboxSession) {')).toBe(true);
  });

  it('resolves bookings via the marketplace listing linked to the operational session', () => {
    expect(fn.includes('eq(bookableSessions.linkedSessionId, args.sessionId)')).toBe(true);
    expect(fn.includes('inArray(marketplaceUsers.linkedPlayerId, args.playerIds)')).toBe(true);
  });

  it('eligibility guards: attended_at NULL only, never cancelled, earliest booking wins', () => {
    const hook = fn.slice(fn.indexOf('if (!args.isSandboxSession)'), fn.indexOf('// Feed events'));
    expect(hook.includes('isNull(bookings.attendedAt)')).toBe(true);
    expect(hook.includes("ne(bookings.status, 'cancelled')")).toBe(true);
    expect(hook.includes('.orderBy(asc(bookings.createdAt))')).toBe(true);
  });

  it('the UPDATE itself re-checks attended_at IS NULL — a concurrent stamp is never overwritten', () => {
    const hook = fn.slice(fn.indexOf('if (!args.isSandboxSession)'), fn.indexOf('// Feed events'));
    const updAt = hook.indexOf('.update(bookings)');
    expect(updAt).toBeGreaterThan(-1);
    const upd = hook.slice(updAt, updAt + 250);
    expect(upd.includes('.set({ attendedAt: new Date() })')).toBe(true);
    expect(upd.includes('isNull(bookings.attendedAt)')).toBe(true);
    // attended_at is the ONLY column the auto path writes — deliberately no
    // status flip (manual /attend sets status='attended'; auto must not
    // clobber waitlisted/pending states) and no queue-append (participants
    // are already on court).
    expect(upd.includes('status')).toBe(false);
  });

  it('walk-ins and unlinked players are logged, never thrown', () => {
    const hook = fn.slice(fn.indexOf('if (!args.isSandboxSession)'), fn.indexOf('// Feed events'));
    expect(hook.includes('walk-in / data gap')).toBe(true);
    expect(hook.includes('no marketplace account')).toBe(true);
    // Inside the hook body, failures log — nothing throws.
    const body = hook.slice(hook.indexOf('await tx.transaction'), hook.lastIndexOf('} catch'));
    expect(body.includes('throw')).toBe(false);
  });
});

describe('/attend endpoint stays the admin-only manual fallback (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');

  it('POST /bookings/:id/attend keeps requireAuth + requireAdmin — no captain access', () => {
    const at = routes.indexOf('"/api/marketplace/bookings/:id/attend"');
    expect(at).toBeGreaterThan(-1);
    const line = routes.slice(at, at + 120);
    expect(line.includes('requireAdmin')).toBe(true);
    expect(line.includes('requireCaptain')).toBe(false);
  });
});
