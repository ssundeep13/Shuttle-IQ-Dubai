import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Conflict-errors gate: raw JSON must never reach a captain toast. The
// request layer extracts server copy + payload; these helpers and tripwires
// keep the guarantee from regressing.

describe('friendly errors - copy helpers', () => {
  it('friendlyMessage passes server copy through and swallows anything JSON-shaped', async () => {
    const { friendlyMessage } = await import('../client/src/lib/errors');
    expect(friendlyMessage({ error: 'Court does not belong to this session' }, 'fallback')).toBe('Court does not belong to this session');
    expect(friendlyMessage({ error: '{"error":"raw"}' }, 'fallback')).toBe('fallback');
    expect(friendlyMessage({ message: '[{"a":1}]' }, 'fallback')).toBe('fallback');
    expect(friendlyMessage(undefined, 'fallback')).toBe('fallback');
    expect(friendlyMessage(new Error('Failed to fetch'), 'fallback')).toBe('Failed to fetch');
  });

  it('conflict helpers: detection, names (never ids), copy grammar', async () => {
    const { isConflictError, conflictNames, conflictCopy } = await import('../client/src/lib/errors');
    const err = {
      status: 409,
      payload: { conflicts: [
        { playerId: 'id-1', name: 'Aisha', reason: 'on-another-lineup' },
        { playerId: 'id-2', reason: 'playing' },
      ] },
    };
    expect(isConflictError(err)).toBe(true);
    expect(isConflictError({ status: 400 })).toBe(false);
    expect(conflictNames(err)).toEqual(['Aisha']); // unresolvable id -> dropped, never shown
    expect(conflictNames(err, (id) => (id === 'id-2' ? 'Rahul' : undefined))).toEqual(['Aisha', 'Rahul']);
    expect(conflictCopy(['Aisha'])).toBe('Aisha was just placed on another court — refreshing this suggestion');
    expect(conflictCopy(['Aisha', 'Rahul'])).toContain('Aisha and Rahul were just placed');
    expect(conflictCopy([])).toBe('Some players were just placed on another court — refreshing this suggestion');
  });

  it('tripwire: captain surfaces no longer render the raw error chain', () => {
    for (const f of ['client/src/components/UpNextStrip.tsx', 'client/src/components/CourtCard.tsx', 'client/src/pages/Home.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(src.includes('error?.error || error?.message'), `${f} still uses the raw error idiom`).toBe(false);
    }
  });

  it('tripwire: the request layer parses BEFORE throwing (the self-caught-throw bug stays dead)', () => {
    const src = readFileSync(join(__dirname, '..', 'client/src/lib/queryClient.ts'), 'utf8');
    expect(src.includes('payload,')).toBe(true); // structured payload rides along
    // the old bug: a structured throw inside its own try { JSON.parse ... }
    expect(/try \{[^}]*JSON\.parse[^}]*throw \{/s.test(src)).toBe(false);
  });

  it('tripwire: a successful pin/lock invalidates the ["/api/courts"] prefix (stale cross-court cards refresh)', () => {
    // Locking on one court must refresh every court's ephemeral suggestion
    // ladder — the pin path was the only lock-adjacent path that skipped
    // the prefix invalidation, leaving other courts offering players the
    // lock just claimed.
    const src = readFileSync(join(__dirname, '..', 'client/src/components/UpNextStrip.tsx'), 'utf8');
    const start = src.indexOf('const pinMutation');
    const end = src.indexOf('if (!isOccupied && confirmRow)');
    expect(start, 'pinMutation not found').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pinBlock = src.slice(start, end);
    expect(pinBlock.includes('invalidate()'), 'pending-suggestions invalidation missing from pin onSuccess').toBe(true);
    expect(pinBlock.includes('queryKey: ["/api/courts"], exact: false'), '/api/courts prefix invalidation missing from pin onSuccess').toBe(true);
  });
});
