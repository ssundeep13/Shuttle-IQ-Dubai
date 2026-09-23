// Tournament Gate 2 — withdrawing an entry (Q4) over injected deps: refund
// owed before 8 Oct, seat-only on 9–10 Oct, blocked from the draft cut-off;
// the freed seat goes to the next waiting player of the same tier.
import { describe, it, expect, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { withdrawRegistration } = await import('../server/tournament/register');

const Z = (iso: string) => new Date(iso);
const NOW = Z('2026-10-01T10:00:00Z');
const reg = (over: Record<string, unknown> = {}) => ({ id: 'r-1', tournamentId: 't-1', userId: 'u-1', tier: 'Beginner', status: 'withdrawn', refundStatus: null, ...over });

const deps = (result: any) => ({
  now: () => NOW,
  withdraw: vi.fn().mockResolvedValue(result),
  onPromoted: vi.fn().mockResolvedValue(undefined),
});

describe('withdrawRegistration', () => {
  it('unknown or someone else’s entry → 404', async () => {
    const d = deps({ kind: 'not_found' });
    expect(await withdrawRegistration({ userId: 'u-1', registrationId: 'r-x' }, d as any)).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(d.withdraw).toHaveBeenCalledWith('r-x', 'u-1', NOW);
  });

  it('from the draft cut-off → 409 withdraw_closed; an inactive entry → 409 not_active', async () => {
    expect(await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, deps({ kind: 'not_allowed', reason: 'after_cutoff' }) as any))
      .toEqual({ status: 409, body: { error: 'withdraw_closed' } });
    expect(await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, deps({ kind: 'not_allowed', reason: 'not_active' }) as any))
      .toEqual({ status: 409, body: { error: 'not_active' } });
  });

  it('paid, before the deadline → withdrawn with refund pending; the next waiting player is promoted and told', async () => {
    const promoted = [{ id: 'r-2', userId: 'u-2', status: 'pending_payment' }];
    const d = deps({ kind: 'withdrawn', registration: reg({ refundStatus: 'pending' }), refund: 'pending', promoted });
    const out = await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any);
    expect(out).toMatchObject({ status: 200, body: { registration: { id: 'r-1', status: 'withdrawn', refundStatus: 'pending' }, refund: 'pending' } });
    expect(d.onPromoted).toHaveBeenCalledWith(promoted);
  });

  it('paid, 9–10 Oct → withdrawn, no refund; unpaid → nothing to refund; no promotion → no notice', async () => {
    const late = deps({ kind: 'withdrawn', registration: reg({ refundStatus: 'not_due' }), refund: 'not_due', promoted: [] });
    expect((await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, late as any)).body).toMatchObject({ refund: 'not_due' });
    expect(late.onPromoted).not.toHaveBeenCalled();
    const unpaid = deps({ kind: 'withdrawn', registration: reg(), refund: null, promoted: [] });
    expect((await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, unpaid as any)).body).toMatchObject({ refund: null });
  });

  it('a failing promotion notice never fails the withdrawal', async () => {
    const d = deps({ kind: 'withdrawn', registration: reg(), refund: null, promoted: [{ id: 'r-2' }] });
    d.onPromoted.mockRejectedValue(new Error('resend'));
    expect((await withdrawRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any)).status).toBe(200);
  });
});
