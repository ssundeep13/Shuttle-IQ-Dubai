// Finance portal — the IQ Pass tab's data: one owner-only endpoint that reports every
// pack with its picked seats. Pure seam (buildIqPassReport) over plain rows, a DB loader
// with no writes, and the route behind requirePortalAuth + requirePortalOwner.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const storageMock = vi.hoisted(() => ({ getPortalUserById: vi.fn() }));
vi.mock('../server/storage', () => ({ storage: storageMock }));
const loadMock = vi.hoisted(() => vi.fn());
vi.mock('../server/portal/portalIqPass', async (importOriginal) => ({ ...(await importOriginal<any>()), loadIqPassInput: loadMock }));

const { buildIqPassReport, formatDubai } = await import('../server/portal/portalIqPass');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

// Fixed clock: Thu 17 Sep 2026 11:30 Dubai.
const NOW = new Date('2026-09-17T07:30:00.000Z');
const D = (iso: string) => new Date(iso);
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-club', userId: 'u-1', playerName: 'Aisha Khan', playerEmail: 'aisha@example.test', tier: 'club', gamesTotal: 4, priceAed: 188,
  status: 'active', ziinaPaymentIntentId: 'pi_club_1', windowStart: '2026-09-14', windowEnd: '2026-10-11',
  holdExpiresAt: D('2026-09-14T14:31:00.000Z'), paidAt: D('2026-09-14T14:02:04.000Z'), cancelledAt: null, cancellationReason: null,
  repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, createdAt: D('2026-09-14T14:01:39.000Z'), ...over,
});
const seat = (over: Record<string, unknown> = {}) => ({
  bookingId: 'bk-1', packId: 'pk-club', status: 'confirmed', cancellationReason: null, movedFromBookingId: null, attendedAt: null,
  sessionId: 's-1', sessionDateIso: '2026-09-16', startTime: '20:00', endTime: '22:00', venue: 'Smash Sports Academy', sessionStatus: 'upcoming', ...over,
});

const PACKS = [
  pack(), // active Club, paid 14 Sep 18:02 Dubai
  pack({ id: 'pk-plus', userId: 'u-2', playerName: 'Rohan Mehta', tier: 'club_plus', gamesTotal: 8, priceAed: 360, ziinaPaymentIntentId: 'pi_plus_1',
    paidAt: D('2026-09-14T14:35:07.000Z'), createdAt: D('2026-09-14T14:34:54.000Z'), repickCredits: 1 }),
  pack({ id: 'pk-elite', userId: 'u-3', playerName: 'Mehek Contractor', tier: 'club_elite', gamesTotal: 12, priceAed: 516, ziinaPaymentIntentId: 'pi_elite_1',
    windowStart: '2026-09-17', windowEnd: '2026-10-14', paidAt: D('2026-09-16T23:27:07.000Z'), createdAt: D('2026-09-16T23:26:53.000Z'), jerseySize: 'M' }),
  pack({ id: 'pk-old', userId: 'u-4', playerName: 'Old Timer', tier: 'club', ziinaPaymentIntentId: 'pi_old', windowStart: '2026-07-01', windowEnd: '2026-07-28',
    paidAt: D('2026-07-01T08:00:00.000Z'), createdAt: D('2026-07-01T07:59:00.000Z') }), // active in the DB, window long over → expired
  pack({ id: 'pk-done', userId: 'u-5', playerName: 'Done Player', tier: 'club', status: 'completed', ziinaPaymentIntentId: 'pi_done', windowStart: '2026-08-01', windowEnd: '2026-08-28',
    paidAt: D('2026-08-01T08:00:00.000Z'), createdAt: D('2026-08-01T07:59:00.000Z') }),
  pack({ id: 'pk-hold', userId: 'u-6', playerName: 'Holding Player', tier: 'club_plus', gamesTotal: 8, priceAed: 360, status: 'pending_payment', ziinaPaymentIntentId: 'pi_hold',
    paidAt: null, holdExpiresAt: D('2026-09-17T07:55:00.000Z'), createdAt: D('2026-09-17T07:25:00.000Z') }),
  pack({ id: 'pk-lost', userId: 'u-7', playerName: 'Lost Hold', tier: 'club', status: 'cancelled', cancellationReason: 'hold_expired', ziinaPaymentIntentId: 'pi_lost',
    paidAt: null, cancelledAt: D('2026-09-14T15:16:16.000Z'), createdAt: D('2026-09-14T14:46:16.000Z') }),
];
const SEATS = [
  // Club: one played (16 Sep, ended), three upcoming
  seat(), seat({ bookingId: 'bk-2', sessionId: 's-2', sessionDateIso: '2026-09-18' }), seat({ bookingId: 'bk-3', sessionId: 's-3', sessionDateIso: '2026-09-23' }),
  seat({ bookingId: 'bk-4', sessionId: 's-4', sessionDateIso: '2026-09-30', venue: 'Bright Riders School Dubai' }),
  // Plus: a moved seat (old cancelled iq_pass_move → new with movedFromBookingId), a session-cancelled seat (credit), 5 upcoming
  seat({ bookingId: 'bp-old', packId: 'pk-plus', status: 'cancelled', cancellationReason: 'iq_pass_move', sessionId: 's-5', sessionDateIso: '2026-09-19' }),
  seat({ bookingId: 'bp-new', packId: 'pk-plus', movedFromBookingId: 'bp-old', sessionId: 's-6', sessionDateIso: '2026-09-25' }),
  seat({ bookingId: 'bp-cx', packId: 'pk-plus', status: 'cancelled', cancellationReason: 'session_cancelled', sessionId: 's-7', sessionDateIso: '2026-09-21', sessionStatus: 'cancelled' }),
  ...[22, 24, 26, 28, 29].map((d, i) => seat({ bookingId: `bp-${i}`, packId: 'pk-plus', sessionId: `s-p${i}`, sessionDateIso: `2026-09-${d}` })),
  // Elite: 12 picks, first 17 Sep (tonight, not yet played), attended_at on none
  ...Array.from({ length: 12 }, (_, i) => seat({ bookingId: `be-${i}`, packId: 'pk-elite', sessionId: `s-e${i}`, sessionDateIso: `2026-${i < 13 ? '09' : '10'}-${String(17 + i).padStart(2, '0')}`.replace(/-09-(3[1-9])/, (_m, d) => `-10-${String(Number(d) - 30).padStart(2, '0')}`) })),
  // Old: 4 seats all in July (played)
  ...[3, 8, 15, 22].map((d, i) => seat({ bookingId: `bo-${i}`, packId: 'pk-old', sessionId: `s-o${i}`, sessionDateIso: `2026-07-${String(d).padStart(2, '0')}` })),
  // Done: 4 seats in August, the last attended
  ...[3, 8, 15, 22].map((d, i) => seat({ bookingId: `bd-${i}`, packId: 'pk-done', sessionId: `s-d${i}`, sessionDateIso: `2026-08-${String(d).padStart(2, '0')}`, attendedAt: i === 3 ? D('2026-08-22T18:00:00.000Z') : null })),
  // Hold: 8 pending seats; Lost: 4 cancelled by the hold expiry
  ...Array.from({ length: 8 }, (_, i) => seat({ bookingId: `bh-${i}`, packId: 'pk-hold', status: 'pending_payment', sessionId: `s-h${i}`, sessionDateIso: `2026-09-${18 + i}` })),
  ...Array.from({ length: 4 }, (_, i) => seat({ bookingId: `bl-${i}`, packId: 'pk-lost', status: 'cancelled', cancellationReason: 'iq_pass_hold_expired', sessionId: `s-l${i}`, sessionDateIso: `2026-09-${18 + i}` })),
];

describe('buildIqPassReport — summary strip', () => {
  const r = buildIqPassReport({ packs: PACKS, seats: SEATS }, NOW);
  it('passes sold = paid packs (holds excluded), by tier, revenue by tier, status counts, jerseys owed', () => {
    expect(r.summary.sold).toBe(5);
    expect(r.summary.soldByTier).toEqual({ club: 3, club_plus: 1, club_elite: 1 });
    expect(r.summary.revenueAed).toBe(188 * 3 + 360 + 516);
    expect(r.summary.revenueAedByTier).toEqual({ club: 564, club_plus: 360, club_elite: 516 });
    expect(r.summary.active).toBe(3);      // club, plus, elite
    expect(r.summary.completed).toBe(1);   // pk-done
    expect(r.summary.expired).toBe(1);     // pk-old: active in the DB, window ended
    expect(r.summary.pendingHolds).toBe(1);
    expect(r.summary.cancelledHolds).toBe(1);
    expect(r.summary.jerseysOwed).toBe(1); // the Elite pass, not handed over
  });
});

describe('buildIqPassReport — one row per pack, newest first, holds separated', () => {
  const r = buildIqPassReport({ packs: PACKS, seats: SEATS }, NOW);
  const by = (id: string) => [...r.packs, ...r.holds].find((p) => p.packId === id)!;

  it('paid packs newest first; pending and cancelled holds live in holds, newest first', () => {
    expect(r.packs.map((p) => p.packId)).toEqual(['pk-elite', 'pk-plus', 'pk-club', 'pk-done', 'pk-old']);
    expect(r.holds.map((p) => p.packId)).toEqual(['pk-hold', 'pk-lost']);
  });

  it('player, tier, price, Dubai paid time, Ziina reference, window, jersey', () => {
    const e = by('pk-elite');
    expect(e.playerName).toBe('Mehek Contractor');
    expect(e.tier).toBe('club_elite');
    expect(e.tierLabel).toBe('Club Elite');
    expect(e.priceAed).toBe(516);
    expect(e.paidAtDubai).toBe('17 Sep 2026, 03:27');
    expect(e.purchaseMonth).toBe('2026-09');
    expect(e.ziinaRef).toBe('pi_elite_1');
    expect(e.windowStart).toBe('2026-09-17');
    expect(e.windowEnd).toBe('2026-10-14');
    expect(e.jerseySize).toBe('M');
    expect(e.jerseyOwed).toBe(true);
    expect(e.jerseyHandedOverAt).toBeNull();
    expect(by('pk-club').jerseyOwed).toBe(false); // Club has no jersey
  });

  it('games picked / played / remaining follow the player-facing pass line: played = session ended, remaining = upcoming picked seats', () => {
    const c = by('pk-club');
    expect([c.gamesTotal, c.gamesPicked, c.gamesPlayed, c.gamesRemaining]).toEqual([4, 4, 1, 3]);
    expect([c.firstGame, c.lastGame]).toEqual(['2026-09-16', '2026-09-30']);
    const p = by('pk-plus'); // 8 total: 6 live seats (moved one counts once), 1 credit unspent
    expect([p.gamesTotal, p.gamesPicked, p.gamesPlayed, p.gamesRemaining, p.repickCredits]).toEqual([8, 6, 0, 6, 1]);
    const o = by('pk-old');
    expect([o.gamesPicked, o.gamesPlayed, o.gamesRemaining]).toEqual([4, 4, 0]);
  });

  it('status: active / completed / expired for paid packs; pending payment (with the hold expiry) and cancelled hold for holds', () => {
    expect(by('pk-club').status).toBe('active');
    expect(by('pk-done').status).toBe('completed');
    expect(by('pk-old').status).toBe('expired');
    expect(by('pk-old').statusLabel).toBe('Expired');
    const h = by('pk-hold');
    expect(h.status).toBe('pending_payment');
    expect(h.statusLabel).toBe('Pending payment');
    expect(h.holdExpiresDubai).toBe('17 Sep 2026, 11:55');
    expect(h.createdAtDubai).toBe('17 Sep 2026, 11:25'); // the hold's start, Dubai time (the raw ISO is UTC)
    expect(h.paidAtDubai).toBeNull();
    const l = by('pk-lost');
    expect(l.status).toBe('cancelled_hold');
    expect(l.statusLabel).toBe('Cancelled hold');
  });

  it('the picked seats, in date order, each with its state: upcoming / played / moved / cancelled with re-pick credit / held / hold lost', () => {
    expect(by('pk-club').seats.map((s) => [s.date, s.state])).toEqual([
      ['2026-09-16', 'played'], ['2026-09-18', 'upcoming'], ['2026-09-23', 'upcoming'], ['2026-09-30', 'upcoming'],
    ]);
    expect(by('pk-club').seats[3].venue).toBe('Bright Riders School Dubai');
    const plus = by('pk-plus').seats;
    expect(plus.find((s) => s.bookingId === 'bp-old')?.state).toBe('moved');
    expect(plus.find((s) => s.bookingId === 'bp-old')?.stateLabel).toBe('Moved');
    expect(plus.find((s) => s.bookingId === 'bp-new')?.state).toBe('upcoming');
    expect(plus.find((s) => s.bookingId === 'bp-cx')?.state).toBe('cancelled_credit');
    expect(plus.find((s) => s.bookingId === 'bp-cx')?.stateLabel).toBe('Cancelled · re-pick credit');
    expect(by('pk-hold').seats.every((s) => s.state === 'held')).toBe(true);
    expect(by('pk-lost').seats.every((s) => s.state === 'hold_lost')).toBe(true);
  });

  it('a pack with no seats reports zeros and no window games', () => {
    const r2 = buildIqPassReport({ packs: [pack({ id: 'pk-none' })], seats: [] }, NOW);
    expect([r2.packs[0].gamesPicked, r2.packs[0].gamesPlayed, r2.packs[0].gamesRemaining]).toEqual([0, 0, 0]);
    expect(r2.packs[0].firstGame).toBeNull();
  });
});

describe('formatDubai', () => {
  it('renders a timestamp as "D Mon YYYY, HH:MM" in Asia/Dubai (UTC+4), 24-hour', () => {
    expect(formatDubai(new Date('2026-09-16T23:27:07.598Z'))).toBe('17 Sep 2026, 03:27');
    expect(formatDubai(new Date('2026-01-31T20:05:00.000Z'))).toBe('1 Feb 2026, 00:05');
    expect(formatDubai(null)).toBeNull();
  });
});

describe('GET /api/portal/iq-pass — real middleware', () => {
  let server: Server; let base: string;
  beforeAll(async () => {
    const { registerPortalRoutes } = await import('../server/portal/portalRoutes');
    const app = express();
    app.use(express.json());
    registerPortalRoutes(app);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  const tokenFor = async (id: string) => (await import('../server/portal/portalAuth')).signPortalToken({ portalUserId: id, email: `${id}@example.test` });

  it('an owner gets 200 with the report shape (summary, packs, holds)', async () => {
    storageMock.getPortalUserById.mockResolvedValue({ id: 'owner-1', email: 'o@example.test', role: 'owner', runnerId: null, isActive: true, passwordChangedAt: null });
    loadMock.mockResolvedValue({ packs: PACKS, seats: SEATS });
    const res = await fetch(`${base}/api/portal/iq-pass`, { headers: { Authorization: `Bearer ${await tokenFor('owner-1')}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['holds', 'packs', 'summary']);
    expect(body.summary.sold).toBe(5);
    expect(body.packs[0].packId).toBe('pk-elite');
    expect(body.holds).toHaveLength(2);
  });

  it('a runner login gets 403 and the loader never runs', async () => {
    storageMock.getPortalUserById.mockResolvedValue({ id: 'runner-1', email: 'r@example.test', role: 'runner', runnerId: 'shannon-id', isActive: true, passwordChangedAt: null });
    loadMock.mockClear();
    const res = await fetch(`${base}/api/portal/iq-pass`, { headers: { Authorization: `Bearer ${await tokenFor('runner-1')}` } });
    expect(res.status).toBe(403);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('no token → 401', async () => {
    const res = await fetch(`${base}/api/portal/iq-pass`);
    expect(res.status).toBe(401);
  });
});

describe('source pins', () => {
  it('the route is registered on one line behind both guards, and the loader module has no writes', () => {
    const pr = read('server/portal/portalRoutes.ts');
    expect(pr).toMatch(/app\.get\("\/api\/portal\/iq-pass", requirePortalAuth, requirePortalOwner, async/);
    const mod = read('server/portal/portalIqPass.ts');
    expect(mod).not.toMatch(/\.(update|insert|delete)\(/);
    expect(mod).not.toMatch(/applyWalletDelta|createZiinaPaymentIntent|refund|\.transaction\(/i);
  });
});
