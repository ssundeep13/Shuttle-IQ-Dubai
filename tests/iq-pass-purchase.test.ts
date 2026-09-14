// IQ Pass Gate 2 — purchase: calendar + hold + single Ziina intent.
// startPurchase / buildCalendar are orchestration over an injected deps
// object (the DB glue lives in server/iqPass/store.ts and is pinned in
// iq-pass-guards.test.ts); the HTTP surface is mounted on a throwaway express
// app behind the REAL auth middleware.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { startPurchase, buildCalendar, JERSEY_SIZES, PickConflictError, iqPassIntentMessage } = await import('../server/iqPass/purchase');
const { createIqPassRouter } = await import('../server/iqPass/routes');
const { buildZiinaReturnUrls } = await import('../server/ziinaReturn');

const NOW = new Date('2026-09-14T08:00:00.000Z'); // 12:00 Dubai, 14 Sep
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-1', userId: 'u-1', tier: 'club', gamesTotal: 4, priceAed: 188, status: 'active', ziinaPaymentIntentId: 'pi_old',
  windowStart: '2026-08-20', windowEnd: '2026-09-16', holdExpiresAt: NOW, paidAt: NOW, cancelledAt: null, cancellationReason: null,
  repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, renewalEmailSentAt: null, followupEmailSentAt: null, createdAt: NOW, ...over,
});
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: 'Smash', venueName: 'Smash Sports Academy', venueLocation: null, dateDubai: '2026-09-20', startTime: '20:00', endTime: '22:00',
  status: 'upcoming', linked: true, capacity: 18, priceAed: 49, spotsRemaining: 10, packSeats: 0, ...over,
});

function fakeDeps(over: Record<string, any> = {}) {
  return {
    now: () => NOW,
    getPacksForUser: vi.fn().mockResolvedValue([]),
    getLastPickedGameDate: vi.fn().mockResolvedValue(null),
    listCalendarSessions: vi.fn().mockResolvedValue([row('a'), row('b'), row('c'), row('d'), row('e', { dateDubai: '2026-10-05' })]),
    getActiveBookingSessionIdsForUser: vi.fn().mockResolvedValue(new Set<string>()),
    getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com' }),
    createHold: vi.fn().mockResolvedValue({ packId: 'pk-new', bookingIds: ['b1', 'b2', 'b3', 'b4'] }),
    attachIntent: vi.fn().mockResolvedValue(undefined),
    cancelHold: vi.fn().mockResolvedValue({ sessionIds: [] }),
    mintResumeParam: vi.fn().mockResolvedValue('&resume=abc'),
    createIntent: vi.fn().mockResolvedValue({ id: 'pi_new', redirect_url: 'https://pay.ziina.com/x' }),
    allowedSchemes: () => ['com.shuttleiq.app'],
    baseUrl: () => 'https://shuttleiq.ai',
    ...over,
  };
}

describe('buildCalendar', () => {
  it('no pass → window starts today (Dubai), 28 days; sessions carry packSeatsLeft + alreadyBooked; jersey eligible for Elite', async () => {
    const deps = fakeDeps({ getActiveBookingSessionIdsForUser: vi.fn().mockResolvedValue(new Set(['b'])) });
    const cal = await buildCalendar('u-1', deps);
    expect(cal.window).toEqual({ start: '2026-09-14', end: '2026-10-11' });
    expect(cal.currentPass).toBeNull();
    expect(cal.jerseyEligibleForElite).toBe(true);
    expect(deps.listCalendarSessions).toHaveBeenCalledWith('2026-09-14', '2026-10-11');
    const a = cal.sessions.find((s) => s.id === 'a')!;
    expect(a.packSeatsLeft).toBe(9);
    expect(a.alreadyBooked).toBe(false);
    expect(cal.sessions.find((s) => s.id === 'b')!.alreadyBooked).toBe(true);
    // never leaks per-seat maths
    expect(JSON.stringify(cal)).not.toMatch(/allocation/i);
  });

  it('active pass → window opens the day after its last picked game; currentPass summarised; a prior Elite pack disables the jersey', async () => {
    const deps = fakeDeps({
      getPacksForUser: vi.fn().mockResolvedValue([pack({ tier: 'club_elite', gamesTotal: 12, priceAed: 516 })]),
      getLastPickedGameDate: vi.fn().mockResolvedValue('2026-09-30'),
    });
    const cal = await buildCalendar('u-1', deps);
    expect(cal.window).toEqual({ start: '2026-10-01', end: '2026-10-28' });
    expect(cal.currentPass).toEqual({ id: 'pk-1', tier: 'club_elite', label: 'Club Elite', gamesTotal: 12, lastGameDate: '2026-09-30' });
    expect(cal.jerseyEligibleForElite).toBe(false);
  });

  it('packSeatsLeft never goes negative when the cap is already exceeded (moves ignore the cap)', async () => {
    const deps = fakeDeps({ listCalendarSessions: vi.fn().mockResolvedValue([row('a', { capacity: 18, packSeats: 10 })]) });
    const cal = await buildCalendar('u-1', deps);
    expect(cal.sessions[0].packSeatsLeft).toBe(0);
  });
});

describe('startPurchase', () => {
  const good = { userId: 'u-1', tier: 'club', sessionIds: ['a', 'b', 'c', 'd'] };

  it('happy path: hold → resume token → return URLs with pack_id → one intent for the pack price → intent attached', async () => {
    const deps = fakeDeps();
    const r = await startPurchase(good, deps);
    expect(r).toEqual({ ok: true, packId: 'pk-new', redirectUrl: 'https://pay.ziina.com/x' });
    expect(deps.createHold).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1', tier: 'club', sessionIds: ['a', 'b', 'c', 'd'], jerseySize: null,
      window: { start: '2026-09-14', end: '2026-10-11' }, holdExpiresAt: new Date('2026-09-14T08:30:00.000Z'),
      user: { name: 'Test Player', email: 't@example.com' },
    }));
    expect(deps.mintResumeParam).toHaveBeenCalledWith('u-1', 'b1');
    const intent = deps.createIntent.mock.calls[0][0];
    expect(intent.amountAed).toBe(188);
    // Ziina receipt line (Sandeep, 2026-09-14): "ShuttleIQ IQ Pass · <first name> · <tier>" so Shannon can match receipts to players.
    expect(intent.message).toBe('ShuttleIQ IQ Pass · Test · Club');
    expect(intent.successUrl).toBe('https://shuttleiq.ai/marketplace/checkout/success?booking_id=b1&pack_id=pk-new&resume=abc');
    expect(intent.cancelUrl).toBe('https://shuttleiq.ai/marketplace/checkout/cancel?booking_id=b1&pack_id=pk-new');
    expect(deps.attachIntent).toHaveBeenCalledWith('pk-new', 'pi_new');
    expect(deps.cancelHold).not.toHaveBeenCalled();
  });

  it('the Ziina message carries the first name only — extra spaces trimmed, a blank name falls back to the tier alone, and Club Elite reads in full', async () => {
    const spaced = fakeDeps({ getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: '  Anna   Maria  Lopez ', email: 'a@example.com' }) });
    await startPurchase(good, spaced);
    expect(spaced.createIntent.mock.calls[0][0].message).toBe('ShuttleIQ IQ Pass · Anna · Club');
    const blank = fakeDeps({ getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: '   ', email: 'b@example.com' }) });
    await startPurchase(good, blank);
    expect(blank.createIntent.mock.calls[0][0].message).toBe('ShuttleIQ IQ Pass · Club');
    // never the allocation or the price, never the email
    for (const d of [spaced, blank]) expect(d.createIntent.mock.calls[0][0].message).not.toMatch(/47|188|516|@/);
    expect(iqPassIntentMessage('Krishnachandran', 'Club Elite')).toBe('ShuttleIQ IQ Pass · Krishnachandran · Club Elite');
    expect(iqPassIntentMessage(null, 'Club Plus')).toBe('ShuttleIQ IQ Pass · Club Plus');
    // the longest real combination stays inside ziinaClient's 50-byte cap (the middle dot is 2 bytes)
    expect(Buffer.byteLength(iqPassIntentMessage('Krishnachandran', 'Club Elite'), 'utf8')).toBeLessThanOrEqual(50);
  });

  it('rejects an unknown tier and a non-array pick list before touching the DB', async () => {
    const deps = fakeDeps();
    expect(await startPurchase({ ...good, tier: 'gold' }, deps)).toMatchObject({ ok: false, status: 400, error: 'invalid_tier' });
    expect(await startPurchase({ ...good, sessionIds: 'a,b' as any }, deps)).toMatchObject({ ok: false, status: 400, error: 'invalid_picks' });
    expect(deps.createHold).not.toHaveBeenCalled();
    expect(deps.createIntent).not.toHaveBeenCalled();
  });

  it('one hold at a time → 409 hold_in_progress', async () => {
    const deps = fakeDeps({ getPacksForUser: vi.fn().mockResolvedValue([pack({ status: 'pending_payment' })]) });
    expect(await startPurchase(good, deps)).toMatchObject({ ok: false, status: 409, error: 'hold_in_progress' });
    expect(deps.createHold).not.toHaveBeenCalled();
  });

  it('pick validation failures come back with their status + session id and never create a hold', async () => {
    const deps = fakeDeps({ listCalendarSessions: vi.fn().mockResolvedValue([row('a', { spotsRemaining: 0 }), row('b'), row('c'), row('d')]) });
    expect(await startPurchase(good, deps)).toMatchObject({ ok: false, status: 409, error: 'session_full', sessionId: 'a' });
    expect(await startPurchase({ ...good, sessionIds: ['a', 'b', 'c'] }, deps)).toMatchObject({ ok: false, status: 400, error: 'pick_count' });
    expect(deps.createHold).not.toHaveBeenCalled();
  });

  it('Elite first purchase requires a jersey size from the fixed list; later Elite packs and other tiers ignore it', async () => {
    expect(JERSEY_SIZES).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    const twelve = Array.from({ length: 12 }, (_, i) => row(`s${i}`));
    const deps = fakeDeps({ listCalendarSessions: vi.fn().mockResolvedValue(twelve), createHold: vi.fn().mockResolvedValue({ packId: 'pk-e', bookingIds: twelve.map((s) => 'b-' + s.id) }) });
    const elite = { userId: 'u-1', tier: 'club_elite', sessionIds: twelve.map((s) => s.id) };
    expect(await startPurchase(elite, deps)).toMatchObject({ ok: false, status: 400, error: 'jersey_size_required' });
    expect(await startPurchase({ ...elite, jerseySize: 'XS' }, deps)).toMatchObject({ ok: false, status: 400, error: 'invalid_jersey_size' });
    expect(await startPurchase({ ...elite, jerseySize: 'L' }, deps)).toMatchObject({ ok: true });
    expect(deps.createHold).toHaveBeenLastCalledWith(expect.objectContaining({ jerseySize: 'L' }));
    // second Elite pack: size ignored (stored null)
    const deps2 = fakeDeps({
      listCalendarSessions: vi.fn().mockResolvedValue(twelve),
      getPacksForUser: vi.fn().mockResolvedValue([pack({ tier: 'club_elite', status: 'completed' })]),
      getLastPickedGameDate: vi.fn().mockResolvedValue('2026-09-01'),
      createHold: vi.fn().mockResolvedValue({ packId: 'pk-e2', bookingIds: ['x'] }),
    });
    expect(await startPurchase({ ...elite, jerseySize: 'L' }, deps2)).toMatchObject({ ok: true });
    expect(deps2.createHold).toHaveBeenLastCalledWith(expect.objectContaining({ jerseySize: null }));
    // Club never asks
    const deps3 = fakeDeps();
    expect(await startPurchase({ ...good, jerseySize: 'M' }, deps3)).toMatchObject({ ok: true });
    expect(deps3.createHold).toHaveBeenLastCalledWith(expect.objectContaining({ jerseySize: null }));
  });

  it('a conflict raised inside the hold transaction (race lost after validation) maps to its status', async () => {
    const deps = fakeDeps({ createHold: vi.fn().mockRejectedValue(new PickConflictError({ status: 409, error: 'pack_cap_reached', sessionId: 'c' })) });
    expect(await startPurchase(good, deps)).toMatchObject({ ok: false, status: 409, error: 'pack_cap_reached', sessionId: 'c' });
    expect(deps.createIntent).not.toHaveBeenCalled();
  });

  it('intent creation failure cancels the hold (reason intent_failed) and answers 502', async () => {
    const deps = fakeDeps({ createIntent: vi.fn().mockRejectedValue(new Error('ziina down')) });
    expect(await startPurchase(good, deps)).toMatchObject({ ok: false, status: 502, error: 'payment_start_failed' });
    expect(deps.cancelHold).toHaveBeenCalledWith('pk-new', 'intent_failed');
    expect(deps.attachIntent).not.toHaveBeenCalled();
  });

  it('wallet / promo fields on the request are ignored (not an eligible tender)', async () => {
    const deps = fakeDeps();
    const r = await startPurchase({ ...good, applyWallet: true, discountCode: 'NEWBIE' } as any, deps);
    expect(r).toMatchObject({ ok: true });
    expect(deps.createIntent.mock.calls[0][0].amountAed).toBe(188);
  });
});

describe('buildZiinaReturnUrls — packId adds pack_id to every return URL (web and native)', () => {
  it('web', () => {
    const u = buildZiinaReturnUrls({ baseUrl: 'https://shuttleiq.ai', bookingId: 'b1', packId: 'pk-1', resumeParam: '&resume=r', allowedSchemes: ['com.shuttleiq.app'] });
    expect(u.successUrl).toBe('https://shuttleiq.ai/marketplace/checkout/success?booking_id=b1&pack_id=pk-1&resume=r');
    expect(u.cancelUrl).toBe('https://shuttleiq.ai/marketplace/checkout/cancel?booking_id=b1&pack_id=pk-1');
    expect(u.failureUrl).toBe('https://shuttleiq.ai/marketplace/checkout/cancel?booking_id=b1&pack_id=pk-1&failed=1');
  });
  it('native', () => {
    const u = buildZiinaReturnUrls({ baseUrl: 'https://shuttleiq.ai', bookingId: 'b1', packId: 'pk-1', returnScheme: 'com.shuttleiq.app', allowedSchemes: ['com.shuttleiq.app'] });
    expect(u.successUrl).toBe('com.shuttleiq.app://checkout/success?booking_id=b1&pack_id=pk-1');
  });
  it('without packId the URLs are byte-identical to today', () => {
    const u = buildZiinaReturnUrls({ baseUrl: 'https://shuttleiq.ai', bookingId: 'b1', resumeParam: '', allowedSchemes: [] });
    expect(u.successUrl).toBe('https://shuttleiq.ai/marketplace/checkout/success?booking_id=b1');
  });
});

describe('HTTP: /api/marketplace/iq-pass/* behind the real middleware', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  const purchaseDeps = fakeDeps();
  const confirmDeps = { confirm: vi.fn().mockResolvedValue({ confirmed: true }), getPack: vi.fn(), retrieveIntent: vi.fn(), isSuccessful: (s: string) => s === 'completed' };
  const token = jwt.sign({ userId: 'u-1', email: 't@example.com', role: 'marketplace_player' }, 'test-main-secret', { expiresIn: '1h' });
  const call = (method: string, path: string, body?: unknown, auth = true) =>
    fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createIqPassRouter({ purchase: purchaseDeps as any, confirm: confirmDeps as any }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });
  beforeEach(() => { process.env.IQ_PASS_ENABLED = 'true'; confirmDeps.getPack.mockReset(); confirmDeps.retrieveIntent.mockReset(); confirmDeps.confirm.mockClear(); });

  it('flag off → every pack route is a JSON 404, token or not', async () => {
    delete process.env.IQ_PASS_ENABLED;
    for (const [m, p] of [['GET', '/api/marketplace/iq-pass/calendar'], ['POST', '/api/marketplace/iq-pass/purchase'], ['POST', '/api/marketplace/iq-pass/packs/pk-1/confirm']] as const) {
      const res = await call(m, p, m === 'POST' ? {} : undefined);
      expect(res.status, p).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
  });

  it('calendar + purchase need a marketplace token (401 without)', async () => {
    expect((await call('GET', '/api/marketplace/iq-pass/calendar', undefined, false)).status).toBe(401);
    expect((await call('POST', '/api/marketplace/iq-pass/purchase', {}, false)).status).toBe(401);
  });

  it('GET calendar → 200 with the window and sessions', async () => {
    const res = await call('GET', '/api/marketplace/iq-pass/calendar');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.window).toEqual({ start: '2026-09-14', end: '2026-10-11' });
    expect(j.sessions.length).toBe(5);
  });

  it('POST purchase → 200 { packId, redirectUrl }; validation errors carry their status', async () => {
    const ok = await call('POST', '/api/marketplace/iq-pass/purchase', { tier: 'club', sessionIds: ['a', 'b', 'c', 'd'] });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ packId: 'pk-new', redirectUrl: 'https://pay.ziina.com/x' });
    const bad = await call('POST', '/api/marketplace/iq-pass/purchase', { tier: 'club', sessionIds: ['a'] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'pick_count' });
  });

  it('POST packs/:id/confirm (no auth, UUID is the secret): 404 unknown, already active, paid → confirm, unpaid → status', async () => {
    confirmDeps.getPack.mockResolvedValueOnce(undefined);
    expect((await call('POST', '/api/marketplace/iq-pass/packs/nope/confirm', {}, false)).status).toBe(404);

    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'active' }));
    const already = await call('POST', '/api/marketplace/iq-pass/packs/pk-1/confirm', {}, false);
    expect(await already.json()).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(confirmDeps.retrieveIntent).not.toHaveBeenCalled();

    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'pending_payment', ziinaPaymentIntentId: 'pi_x' }));
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'completed' });
    const paid = await call('POST', '/api/marketplace/iq-pass/packs/pk-1/confirm', {}, false);
    expect(await paid.json()).toEqual({ confirmed: true });
    expect(confirmDeps.confirm).toHaveBeenCalledWith('pi_x');

    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'pending_payment', ziinaPaymentIntentId: 'pi_y' }));
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'requires_payment_instrument' });
    const unpaid = await call('POST', '/api/marketplace/iq-pass/packs/pk-1/confirm', {}, false);
    expect(await unpaid.json()).toEqual({ confirmed: false, status: 'requires_payment_instrument' });

    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'pending_payment', ziinaPaymentIntentId: null }));
    expect((await call('POST', '/api/marketplace/iq-pass/packs/pk-1/confirm', {}, false)).status).toBe(400);
  });
});
