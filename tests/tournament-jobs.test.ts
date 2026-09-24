// Tournament Gate 2 — the three scheduler jobs over injected deps, the
// promotion notices, the flag-gated scheduler block (tripwire), and the DB
// invariants the transactions rely on (tripwires on store.ts).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const {
  runTournamentHoldExpiryJob, runTournamentReconciliationJob, runTournamentOpenNotificationsJob, notifyPromotedRegistrations,
  openNotificationCopy, TOURNAMENT_RECONCILE_WINDOW_MS, TOURNAMENT_HOLD_EXPIRY_INTERVAL_MS, TOURNAMENT_OPEN_NOTIFY_INTERVAL_MS,
} = await import('../server/tournament/jobs');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r/g, '');
const Z = (iso: string) => new Date(iso);

const T = {
  id: 't-1', name: 'ShuttleIQ League', status: 'published',
  startsAt: Z('2026-10-17T14:00:00Z'), endsAt: Z('2026-10-17T18:00:00Z'),
  venueName: 'BASELINE SPORTS ACADEMY DIP', entryFeeAed: 100,
  registrationOpensAtMembers: Z('2026-09-25T08:00:00Z'), registrationOpensAt: Z('2026-09-25T14:00:00Z'),
  registrationClosesAt: Z('2026-10-08T20:00:00Z'), draftCutoffAt: Z('2026-10-10T20:00:00Z'),
  membersOpenNotifiedAt: null, openNotifiedAt: null,
};
const reg = (over: Record<string, unknown> = {}) => ({ id: 'r-1', tournamentId: 't-1', userId: 'u-1', tier: 'Beginner', status: 'pending_payment', ziinaPaymentIntentId: null, holdExpiresAt: Z('2026-09-27T10:00:00Z'), promotedAt: null, ...over });
const ledger = () => ({ startRun: vi.fn().mockResolvedValue('run-1'), finishRun: vi.fn().mockResolvedValue(undefined) });

describe('intervals', () => {
  it('hold expiry and open notices every 5 min; reconciliation looks back 26 h (> the 24 h hold)', () => {
    expect(TOURNAMENT_HOLD_EXPIRY_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(TOURNAMENT_OPEN_NOTIFY_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(TOURNAMENT_RECONCILE_WINDOW_MS).toBe(26 * 60 * 60 * 1000);
  });
});

describe('runTournamentHoldExpiryJob — Ziina first, the clock second', () => {
  const NOW = Z('2026-09-27T10:05:00Z');
  const base = (over: Record<string, any> = {}) => ({
    now: () => NOW, ...ledger(),
    getLapsedHolds: vi.fn().mockResolvedValue([]),
    retrieveIntent: vi.fn(),
    isSuccessful: (s: string) => s === 'completed',
    confirm: vi.fn().mockResolvedValue({ confirmed: true }),
    expireAndPromote: vi.fn().mockResolvedValue({ expired: true, promoted: [] }),
    notify: vi.fn().mockResolvedValue(undefined),
    onPromoted: vi.fn().mockResolvedValue(undefined),
    ...over,
  });

  it('a lapsed hold whose intent was paid is CONFIRMED, never expired', async () => {
    const d = base({ getLapsedHolds: vi.fn().mockResolvedValue([reg({ ziinaPaymentIntentId: 'pi_paid' })]), retrieveIntent: vi.fn().mockResolvedValue({ status: 'completed' }) });
    const out = await runTournamentHoldExpiryJob(d as any);
    expect(d.confirm).toHaveBeenCalledWith('pi_paid');
    expect(d.expireAndPromote).not.toHaveBeenCalled();
    expect(out).toMatchObject({ lapsed: 1, rescued: 1, expired: 0 });
  });

  it('Ziina unreachable → the hold is left for the next run, never expired blind', async () => {
    const d = base({ getLapsedHolds: vi.fn().mockResolvedValue([reg({ ziinaPaymentIntentId: 'pi_x' })]), retrieveIntent: vi.fn().mockRejectedValue(new Error('timeout')) });
    const out = await runTournamentHoldExpiryJob(d as any);
    expect(d.expireAndPromote).not.toHaveBeenCalled();
    expect(out).toMatchObject({ skipped: 1, expired: 0 });
  });

  it('unpaid → expired through the guarded claim, the player told once, the next waiting player promoted and told', async () => {
    const promoted = [reg({ id: 'r-2', userId: 'u-2', promotedAt: NOW })];
    const d = base({
      getLapsedHolds: vi.fn().mockResolvedValue([reg({ ziinaPaymentIntentId: 'pi_unpaid' }), reg({ id: 'r-3', userId: 'u-3' })]),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_confirmation' }),
      expireAndPromote: vi.fn().mockResolvedValueOnce({ expired: true, promoted }).mockResolvedValueOnce({ expired: false, promoted: [] }),
    });
    const out = await runTournamentHoldExpiryJob(d as any);
    expect(d.expireAndPromote).toHaveBeenCalledWith('r-1', NOW);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify.mock.calls[0][0]).toMatchObject({ userId: 'u-1', type: 'tournament_hold_expired' });
    expect(d.notify.mock.calls[0][0].message).toMatch(/24 hours/);
    expect(d.onPromoted).toHaveBeenCalledWith(promoted);
    expect(out).toMatchObject({ lapsed: 2, expired: 1, promoted: 1 });
  });

  it('every run is ledgered in job_runs; a failing query is recorded as an error', async () => {
    const ok = base();
    await runTournamentHoldExpiryJob(ok as any);
    expect(ok.startRun).toHaveBeenCalledWith('tournament_hold_expiry');
    expect(ok.finishRun).toHaveBeenCalledWith('run-1', 'ok', expect.objectContaining({ lapsed: 0 }));
    const bad = base({ getLapsedHolds: vi.fn().mockRejectedValue(new Error('db down')) });
    await runTournamentHoldExpiryJob(bad as any);
    expect(bad.finishRun).toHaveBeenCalledWith('run-1', 'error', expect.any(Object), 'db down');
  });
});

describe('runTournamentReconciliationJob — the missed-webhook safety net', () => {
  it('re-checks every candidate intent and confirms the paid ones through the canonical path', async () => {
    const d = {
      now: () => Z('2026-09-27T10:00:00Z'), ...ledger(),
      getReconcileCandidates: vi.fn().mockResolvedValue([{ id: 'r-1', ziinaPaymentIntentId: 'pi_a' }, { id: 'r-2', ziinaPaymentIntentId: 'pi_b' }, { id: 'r-3', ziinaPaymentIntentId: 'pi_c' }]),
      retrieveIntent: vi.fn().mockImplementation(async (id: string) => (id === 'pi_c' ? Promise.reject(new Error('x')) : { status: id === 'pi_a' ? 'completed' : 'pending' })),
      isSuccessful: (s: string) => s === 'completed',
      confirm: vi.fn().mockResolvedValue({ confirmed: true }),
    };
    const out = await runTournamentReconciliationJob(d as any);
    expect(d.getReconcileCandidates).toHaveBeenCalledWith(expect.any(Date), TOURNAMENT_RECONCILE_WINDOW_MS);
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.confirm).toHaveBeenCalledWith('pi_a');
    expect(out).toEqual({ checked: 3, rescued: 1, failed: 1 });
    expect(d.startRun).toHaveBeenCalledWith('tournament_reconcile');
  });
});

describe('runTournamentOpenNotificationsJob — members at 12:00, everyone at 18:00 Dubai, exactly once each', () => {
  const base = (now: Date, t: any = T, over: Record<string, any> = {}) => ({
    now: () => now, ...ledger(),
    getCurrentTournament: vi.fn().mockResolvedValue(t),
    notifyMembersOpen: vi.fn().mockResolvedValue(4),
    notifyEveryoneOpen: vi.fn().mockResolvedValue(510),
    ...over,
  });

  it('before the members instant: nothing, not even a ledger row', async () => {
    const d = base(Z('2026-09-25T07:59:00Z'));
    await runTournamentOpenNotificationsJob(d as any);
    expect(d.notifyMembersOpen).not.toHaveBeenCalled();
    expect(d.notifyEveryoneOpen).not.toHaveBeenCalled();
    expect(d.startRun).not.toHaveBeenCalled();
  });

  it('members stage fires once with the members copy', async () => {
    const d = base(Z('2026-09-25T08:03:00Z'));
    const out = await runTournamentOpenNotificationsJob(d as any);
    expect(d.notifyMembersOpen).toHaveBeenCalledWith('t-1', expect.any(Date), openNotificationCopy(T as any, 'members'));
    expect(d.notifyEveryoneOpen).not.toHaveBeenCalled();
    expect(out).toEqual({ members: 4, everyone: 0 });
    const stamped = base(Z('2026-09-25T09:00:00Z'), { ...T, membersOpenNotifiedAt: Z('2026-09-25T08:03:00Z') });
    await runTournamentOpenNotificationsJob(stamped as any);
    expect(stamped.notifyMembersOpen).not.toHaveBeenCalled();
  });

  it('everyone stage fires at 18:00; a members stage never fired is skipped once everyone is open', async () => {
    const d = base(Z('2026-09-25T14:02:00Z'));
    await runTournamentOpenNotificationsJob(d as any);
    expect(d.notifyMembersOpen).not.toHaveBeenCalled();
    expect(d.notifyEveryoneOpen).toHaveBeenCalledWith('t-1', expect.any(Date), openNotificationCopy(T as any, 'everyone'));
  });

  it('a claim already taken (null) counts as zero; closed, unpublished or missing tournaments send nothing', async () => {
    const claimed = base(Z('2026-09-25T14:02:00Z'), T, { notifyEveryoneOpen: vi.fn().mockResolvedValue(null) });
    expect(await runTournamentOpenNotificationsJob(claimed as any)).toEqual({ members: 0, everyone: 0 });
    for (const [now, t] of [[Z('2026-10-08T20:00:00Z'), T], [Z('2026-09-25T14:02:00Z'), { ...T, status: 'draft' }], [Z('2026-09-25T14:02:00Z'), undefined]] as const) {
      const d = base(now, T, { getCurrentTournament: vi.fn().mockResolvedValue(t) }); // explicit: a default parameter would swallow undefined
      await runTournamentOpenNotificationsJob(d as any);
      expect(d.notifyEveryoneOpen).not.toHaveBeenCalled();
      expect(d.notifyMembersOpen).not.toHaveBeenCalled();
    }
  });

  it('copy: date, venue, fee; members copy says early access; never the deck link', () => {
    const m = openNotificationCopy(T as any, 'members');
    const e = openNotificationCopy(T as any, 'everyone');
    expect(m.title).toBe('ShuttleIQ League: early access is open');
    expect(e.title).toBe('ShuttleIQ League registration is open');
    for (const c of [m, e]) {
      expect(c.message).toContain('Sat 17 Oct');
      expect(c.message).toContain('Baseline Sports Academy DIP');
      expect(c.message).toContain('AED 100');
      expect(`${c.title} ${c.message}`).not.toMatch(/\.pdf|docs\/|deck/i);
    }
    expect(m.message).toMatch(/IQ Pass/);
    expect(m.message).toMatch(/6:00 pm/);
  });
});

describe('notifyPromotedRegistrations — in-app + email with the pay link, stamp only after the email', () => {
  const NOW = Z('2026-09-27T10:05:00Z');
  const d = (over: Record<string, any> = {}) => ({
    now: () => NOW,
    notify: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue({ id: 'u-2', name: 'Waiting Player', email: 'w@example.com', phone: null, linkedPlayerId: 'p-2' }),
    getTournament: vi.fn().mockResolvedValue(T),
    sendPromotionEmail: vi.fn().mockResolvedValue(undefined),
    markPromotionNotified: vi.fn().mockResolvedValue(undefined),
    ...over,
  });
  const promoted = reg({ id: 'r-2', userId: 'u-2', promotedAt: NOW, holdExpiresAt: Z('2026-09-28T10:05:00Z') });

  it('tells the player the pay-by time in Dubai', async () => {
    const deps = d();
    await notifyPromotedRegistrations([promoted as any], deps as any);
    expect(deps.notify.mock.calls[0][0]).toMatchObject({ userId: 'u-2', type: 'tournament_promoted', title: 'A ShuttleIQ League spot opened up' });
    expect(deps.notify.mock.calls[0][0].message).toContain('2:05 pm on Mon 28 Sept');
    expect(deps.sendPromotionEmail).toHaveBeenCalledTimes(1);
    expect(deps.markPromotionNotified).toHaveBeenCalledWith('r-2', NOW);
  });

  it('email failure → in-app still sent, no stamp', async () => {
    const deps = d({ sendPromotionEmail: vi.fn().mockRejectedValue(new Error('Resend')) });
    await notifyPromotedRegistrations([promoted as any], deps as any);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.markPromotionNotified).not.toHaveBeenCalled();
  });
});

describe('scheduler tripwire — tournament jobs only inside an isTournamentEnabled() block, after IQ Pass', () => {
  const sched = read('server/scheduler.ts');
  const start = sched.slice(sched.indexOf('export function startScheduler'));
  it('is gated and ordered', () => {
    expect(sched).toContain('import { isTournamentEnabled } from "./tournament/flag";');
    const iq = start.indexOf('if (isIqPassEnabled()) {');
    const gate = start.indexOf('if (isTournamentEnabled()) {');
    expect(gate).toBeGreaterThan(iq);
    for (const job of ['runTournamentHoldExpiryJob', 'runTournamentReconciliationJob', 'runTournamentOpenNotificationsJob']) {
      expect(start.indexOf(job), job).toBeGreaterThan(gate);
    }
  });
});

describe('store tripwires — the invariants the transactions rely on', () => {
  const src = read('server/tournament/store.ts');
  const fn = (name: string) => {
    const i = src.indexOf(`async ${name}(`);
    expect(i, name).toBeGreaterThan(-1);
    const j = src.indexOf('\n  async ', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('registration locks the tournament row BEFORE counting the tier', () => {
    const f = fn('createRegistration');
    expect(f.indexOf(".for('update')")).toBeGreaterThan(-1);
    expect(f.indexOf(".for('update')")).toBeLessThan(f.indexOf('countTier'));
    expect(f).toContain('decideRegistration');
  });

  it('expiry claims with a status-guarded update and promotes under the same lock', () => {
    const f = fn('expireAndPromote');
    expect(f).toContain(".for('update')");
    expect(f).toMatch(/eq\(tournamentRegistrations\.status, 'pending_payment'\)/);
    expect(f).toContain('fillFreeSeats');
  });

  it('confirm locks the tournament, then the registration; payments rows carry the registration id', () => {
    const f = fn('confirmTx');
    expect(f.indexOf("from(tournaments)")).toBeLessThan(f.indexOf("from(tournamentRegistrations).where(eq(tournamentRegistrations.id"));
    expect(f).toContain('tournamentRegistrationId');
    expect(f).toContain('queueRefund(tx, r,');
    const q = src.slice(src.indexOf('async function queueRefund('), src.indexOf('export const tournamentStore'));
    expect(q).toContain("type: 'refund_required'");
    expect(q).toContain('refundAmountFils: r.amountAed * 100');
  });

  it('a refunded withdrawal queues the refund inside the withdraw transaction', () => {
    const f = fn('withdraw');
    expect(f).toContain('withdrawOutcome');
    expect(f).toContain("if (outcome.refund === 'pending') await queueRefund(tx, r,");
    expect(f).toContain('fillFreeSeats');
  });

  it('a failed-start cancel locks the tournament, only cancels a hold with NO intent attached, and fills the freed seat', () => {
    const f = fn('cancelHold');
    expect(f).toContain(".for('update')");
    expect(f).toContain('isNull(tournamentRegistrations.ziinaPaymentIntentId)');
    expect(f).toContain('fillFreeSeats');
  });

  it('membership = any ACTIVE pack, no tier filter', () => {
    const m = read('server/tournament/membership.ts');
    expect(m).toContain("eq(packs.status, 'active')");
    expect(m).not.toMatch(/club_plus|club_elite|packs\.tier/);
  });
});
