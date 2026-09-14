// IQ Pass Gate 2 — scheduler jobs: the 30-minute hold expiry sweep and the
// pack reconciliation sweep (missed-webhook safety net), both over injected
// deps; registration in startScheduler is pinned under the flag.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
const { runPackHoldExpiryJob, runPackReconciliationJob, HOLD_EXPIRY_INTERVAL_MS, PACK_RECONCILE_WINDOW_MS } = await import('../server/iqPass/jobs');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const NOW = new Date('2026-09-14T08:00:00.000Z');

describe('runPackHoldExpiryJob', () => {
  it('cancels every lapsed hold, notifies the player once, and offers each freed seat to the waitlist', async () => {
    const deps = {
      now: () => NOW,
      expireHolds: vi.fn().mockResolvedValue([
        { packId: 'pk-1', userId: 'u-1', sessionIds: ['s1', 's2', 's3', 's4'] },
        { packId: 'pk-2', userId: 'u-2', sessionIds: ['s1', 's9'] },
      ]),
      notify: vi.fn().mockResolvedValue(undefined),
      promote: vi.fn().mockResolvedValue(1),
    };
    const r = await runPackHoldExpiryJob(deps);
    expect(deps.expireHolds).toHaveBeenCalledWith(NOW);
    expect(r).toEqual({ expired: 2, promoted: 6 });
    expect(deps.notify).toHaveBeenCalledTimes(2);
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', type: 'iq_pass_hold_expired', title: 'IQ Pass hold released' }));
    expect(deps.notify.mock.calls[0][0].message).toContain('30 minutes');
    expect(deps.promote).toHaveBeenCalledTimes(6);
    expect(deps.promote).toHaveBeenCalledWith('s9', 1);
  });

  it('nothing lapsed → no writes', async () => {
    const deps = { now: () => NOW, expireHolds: vi.fn().mockResolvedValue([]), notify: vi.fn(), promote: vi.fn() };
    expect(await runPackHoldExpiryJob(deps)).toEqual({ expired: 0, promoted: 0 });
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.promote).not.toHaveBeenCalled();
  });

  it('a failure on one pack does not stop the others', async () => {
    const deps = {
      now: () => NOW,
      expireHolds: vi.fn().mockResolvedValue([{ packId: 'pk-1', userId: 'u-1', sessionIds: ['s1'] }, { packId: 'pk-2', userId: 'u-2', sessionIds: ['s2'] }]),
      notify: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined),
      promote: vi.fn().mockResolvedValue(0),
    };
    const r = await runPackHoldExpiryJob(deps);
    expect(r.expired).toBe(2);
    expect(deps.promote).toHaveBeenCalledWith('s2', 1);
  });

  it('runs every 5 minutes', () => {
    expect(HOLD_EXPIRY_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});

describe('runPackReconciliationJob', () => {
  const p = (id: string, intent: string | null) => ({ id, ziinaPaymentIntentId: intent, status: 'pending_payment' });

  it('re-checks each pending pack intent at Ziina and confirms the paid ones through the canonical path', async () => {
    const deps = {
      getPendingPacks: vi.fn().mockResolvedValue([p('pk-1', 'pi_1'), p('pk-2', 'pi_2'), p('pk-3', null)]),
      retrieveIntent: vi.fn().mockImplementation(async (id: string) => ({ status: id === 'pi_1' ? 'completed' : 'requires_payment_instrument' })),
      isSuccessful: (s: string) => s === 'completed',
      confirm: vi.fn().mockResolvedValue({ confirmed: true }),
    };
    const r = await runPackReconciliationJob(deps);
    expect(deps.getPendingPacks).toHaveBeenCalledWith(PACK_RECONCILE_WINDOW_MS);
    expect(deps.retrieveIntent).toHaveBeenCalledTimes(2); // the intent-less pack is skipped
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.confirm).toHaveBeenCalledWith('pi_1');
    expect(r).toEqual({ checked: 2, rescued: 1 });
  });

  it('already-confirmed results are not counted as rescues; a Ziina error on one pack does not stop the sweep', async () => {
    const deps = {
      getPendingPacks: vi.fn().mockResolvedValue([p('pk-1', 'pi_1'), p('pk-2', 'pi_2')]),
      retrieveIntent: vi.fn().mockRejectedValueOnce(new Error('ziina 500')).mockResolvedValueOnce({ status: 'completed' }),
      isSuccessful: (s: string) => s === 'completed',
      confirm: vi.fn().mockResolvedValue({ confirmed: true, alreadyConfirmed: true }),
    };
    expect(await runPackReconciliationJob(deps)).toEqual({ checked: 2, rescued: 0 });
    expect(deps.confirm).toHaveBeenCalledTimes(1);
  });

  it('looks back 48 hours', () => {
    expect(PACK_RECONCILE_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
  });
});

describe('scheduler wiring (tripwires)', () => {
  const sched = read('server/scheduler.ts');
  const start = sched.slice(sched.indexOf('export function startScheduler'));

  it('pack jobs are registered ONLY inside an isIqPassEnabled() block, after every existing job', () => {
    const gate = start.indexOf('if (isIqPassEnabled()) {');
    expect(gate).toBeGreaterThan(-1);
    expect(start.indexOf('runPackHoldExpiryJob')).toBeGreaterThan(gate);
    expect(start.indexOf('runPackReconciliationJob')).toBeGreaterThan(gate);
    // the last pre-existing job registration stays before the gate
    expect(start.indexOf('runMatchSuggestionAutoApproveSweep();')).toBeLessThan(gate);
    expect(sched.includes('import { isIqPassEnabled } from "./iqPass/flag";')).toBe(true);
  });

  it('the existing 4-hour hold sweep keeps its promoted_at IS NOT NULL predicate (pack holds have promoted_at NULL)', () => {
    const s = read('server/storage.ts');
    const q = s.slice(s.indexOf('async getExpiredPendingPaymentBookings'), s.indexOf('async getExpiredPendingPaymentBookings') + 600);
    expect(q.includes('promotedAt} IS NOT NULL')).toBe(true);
  });
});
