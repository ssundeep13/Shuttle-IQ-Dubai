// Gate W2 — capacity-increase waitlist promotion. The loop helper is
// unit-tested with an injected promote function (all real capacity math
// lives inside promoteFirstFittingWaitlisted per call); the route wiring
// is pinned as tripwires.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const { promoteWaitlistForFreedSpots } = await import('../server/guestSlotRefund');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const hit = { bookingId: 'b', userId: 'u' };

describe('promoteWaitlistForFreedSpots', () => {
  it('promote-N-from-increase: delta 3, three fitting waitlisted → 3 promotions, exactly 3 calls', async () => {
    const promote = vi.fn().mockResolvedValue(hit);
    expect(await promoteWaitlistForFreedSpots('s', 3, promote)).toBe(3);
    expect(promote).toHaveBeenCalledTimes(3);
  });

  it('fills-during-loop race: delta 3 but the session fills after one promotion → stops at 1, no third call', async () => {
    const promote = vi.fn()
      .mockResolvedValueOnce(hit)
      .mockResolvedValueOnce(null); // organic booking consumed the next free spot
    expect(await promoteWaitlistForFreedSpots('s', 3, promote)).toBe(1);
    expect(promote).toHaveBeenCalledTimes(2);
  });

  it('waitlist empty from the start → 0 promotions, one probing call', async () => {
    const promote = vi.fn().mockResolvedValue(null);
    expect(await promoteWaitlistForFreedSpots('s', 5, promote)).toBe(0);
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it('hard cap at the delta: endless supply of fitting bookings, delta 2 → exactly 2 calls, never a third', async () => {
    const promote = vi.fn().mockResolvedValue(hit);
    expect(await promoteWaitlistForFreedSpots('s', 2, promote)).toBe(2);
    expect(promote).toHaveBeenCalledTimes(2);
  });

  it('zero/negative delta → no calls at all', async () => {
    const promote = vi.fn().mockResolvedValue(hit);
    expect(await promoteWaitlistForFreedSpots('s', 0, promote)).toBe(0);
    expect(await promoteWaitlistForFreedSpots('s', -1, promote)).toBe(0);
    expect(promote).not.toHaveBeenCalled();
  });
});

describe('PATCH /sessions/:id wiring (tripwires)', () => {
  const routes = read('server/marketplace-routes.ts');
  const route = routes.slice(
    routes.indexOf('app.patch("/api/marketplace/sessions/:id", requireAuth, requireCaptain'),
    routes.indexOf('app.patch("/api/marketplace/sessions/:id/link"'),
  );

  it('pre-update capacity is read BEFORE the update (the delta needs it)', () => {
    const beforeAt = route.indexOf('const beforeSession = await storage.getBookableSession(');
    const updateAt = route.indexOf('await storage.updateBookableSession(');
    expect(beforeAt).toBeGreaterThan(-1);
    expect(beforeAt).toBeLessThan(updateAt);
  });

  it('strict-increase gate: decreases and capacity-less edits run zero promotion code', () => {
    expect(route.includes('parsed.capacity > beforeSession.capacity')).toBe(true);
    expect(route.includes('if (capacityIncreased) {')).toBe(true);
  });

  it('delta-capped call to the helper, isolated in try/catch so a failure never fails the edit', () => {
    expect(route.includes('promoteWaitlistForFreedSpots(session.id, delta)')).toBe(true);
    expect(route.includes('(edit still applied)')).toBe(true);
    // Block sits before the response.
    expect(route.indexOf('if (capacityIncreased) {')).toBeLessThan(route.indexOf('res.json(session)'));
  });

  it('helper defaults to the real production promote path', () => {
    const g = read('server/guestSlotRefund.ts');
    expect(g.includes('promote: (sid: string) => Promise<{ bookingId: string; userId: string } | null> = promoteFirstFittingWaitlisted')).toBe(true);
  });
});
