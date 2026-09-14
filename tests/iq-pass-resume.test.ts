// IQ Pass — "Complete payment" for a hold awaiting payment (Sandeep, 2026-09-14). Server side:
//   POST /api/marketplace/iq-pass/packs/:id/resume  owner-only, read-only — reopens the SAME Ziina intent
//     (200 { redirectUrl, holdExpiresAt }), confirms through the canonical path if Ziina already took the money,
//     409 hold_expired once the 30 minutes are up or the sweep cancelled the hold.
//   getMyPacks carries cancellationReason so the client can tell a swept hold ("Hold expired — pick again")
//     from any other cancellation.
//   startPurchase supersedes a lapsed hold instead of answering hold_in_progress until the sweep runs.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { createIqPassRouter } = await import('../server/iqPass/routes');
const { startPurchase } = await import('../server/iqPass/purchase');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const MIN = 60_000;
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-hold', userId: 'u-1', tier: 'club', gamesTotal: 4, priceAed: 188, status: 'pending_payment', ziinaPaymentIntentId: 'pi_hold',
  windowStart: '2026-09-14', windowEnd: '2026-10-11', holdExpiresAt: new Date(Date.now() + 11 * MIN), paidAt: null, cancelledAt: null, cancellationReason: null,
  repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, renewalEmailSentAt: null, followupEmailSentAt: null, createdAt: new Date(Date.now() - 19 * MIN), ...over,
});

describe('HTTP: POST /api/marketplace/iq-pass/packs/:id/resume', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  const confirmDeps = {
    getPack: vi.fn(),
    retrieveIntent: vi.fn(),
    isSuccessful: (s: string) => s === 'completed',
    confirm: vi.fn().mockResolvedValue({ confirmed: true }),
  };
  const tokenFor = (userId: string) => jwt.sign({ userId, email: 't@example.com', role: 'marketplace_player' }, 'test-main-secret', { expiresIn: '1h' });
  const call = (packId: string, userId: string | null = 'u-1', body?: unknown) =>
    fetch(`${base}/api/marketplace/iq-pass/packs/${packId}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}) }, body: JSON.stringify(body ?? {}) });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createIqPassRouter({ purchase: {} as any, confirm: confirmDeps as any, me: {} as any }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.IQ_PASS_ENABLED = 'true';
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });
  beforeEach(() => {
    confirmDeps.getPack.mockReset().mockResolvedValue(pack());
    confirmDeps.retrieveIntent.mockReset().mockResolvedValue({ status: 'requires_payment_instrument', redirect_url: 'https://pay.ziina.com/pi_hold' });
    confirmDeps.confirm.mockClear();
  });

  it('flag off → 404 like any unknown /api path; no token → 401', async () => {
    delete process.env.IQ_PASS_ENABLED;
    expect((await call('pk-hold')).status).toBe(404);
    process.env.IQ_PASS_ENABLED = 'true';
    expect((await call('pk-hold', null)).status).toBe(401);
  });

  it("unknown pack or another player's pack → 404, and Ziina is never called", async () => {
    confirmDeps.getPack.mockResolvedValueOnce(undefined);
    expect((await call('pk-nope')).status).toBe(404);
    expect((await call('pk-hold', 'u-2')).status).toBe(404);
    expect(confirmDeps.retrieveIntent).not.toHaveBeenCalled();
  });

  it('live hold, intent still payable → 200 { redirectUrl, holdExpiresAt } from the SAME intent (no new intent is minted)', async () => {
    const res = await call('pk-hold');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.redirectUrl).toBe('https://pay.ziina.com/pi_hold');
    expect(new Date(j.holdExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(confirmDeps.retrieveIntent).toHaveBeenCalledWith('pi_hold');
    expect(confirmDeps.confirm).not.toHaveBeenCalled();
    expect(JSON.stringify(j)).not.toMatch(/47|188/);
  });

  it('lapsed hold, still unpaid at Ziina → 409 hold_expired (Ziina is asked first so money is never discarded); a swept (cancelled) hold → 409 without touching Ziina', async () => {
    confirmDeps.getPack.mockResolvedValueOnce(pack({ holdExpiresAt: new Date(Date.now() - MIN) }));
    const lapsed = await call('pk-hold');
    expect(lapsed.status).toBe(409);
    expect(await lapsed.json()).toMatchObject({ error: 'hold_expired' });
    expect(confirmDeps.retrieveIntent).toHaveBeenCalledTimes(1);
    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'cancelled', cancellationReason: 'hold_expired', holdExpiresAt: new Date(Date.now() - 9 * MIN) }));
    const swept = await call('pk-hold');
    expect(swept.status).toBe(409);
    expect(await swept.json()).toMatchObject({ error: 'hold_expired' });
    expect(confirmDeps.retrieveIntent).toHaveBeenCalledTimes(1);
  });

  it('lapsed hold but Ziina already took the money (before the sweep ran) → confirmed through the canonical path, never 409', async () => {
    confirmDeps.getPack.mockResolvedValueOnce(pack({ holdExpiresAt: new Date(Date.now() - 2 * MIN) }));
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'completed', redirect_url: 'https://pay.ziina.com/pi_hold' });
    const res = await call('pk-hold');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ confirmed: true });
    expect(confirmDeps.confirm).toHaveBeenCalledWith('pi_hold');
  });

  it('a declined or rejected intent is dead → 409 intent_unavailable even though Ziina still hands back a redirect', async () => {
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'declined', redirect_url: 'https://pay.ziina.com/pi_hold' });
    const res = await call('pk-hold');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'intent_unavailable' });
  });

  it('the intent was minted for the other platform (deep-link return URLs vs the web) → 409 platform_mismatch; the matching platform gets the redirect', async () => {
    const native = { status: 'requires_payment_instrument', redirect_url: 'https://pay.ziina.com/pi_hold', success_url: 'com.shuttleiq.app://checkout/success?booking_id=b1&pack_id=pk-hold' };
    confirmDeps.retrieveIntent.mockResolvedValueOnce(native);
    const web = await call('pk-hold');
    expect(web.status).toBe(409);
    expect(await web.json()).toMatchObject({ error: 'platform_mismatch' });
    confirmDeps.retrieveIntent.mockResolvedValueOnce(native);
    const app = await call('pk-hold', 'u-1', { returnScheme: 'com.shuttleiq.app' });
    expect(app.status).toBe(200);
    expect((await app.json()).redirectUrl).toBe('https://pay.ziina.com/pi_hold');
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'requires_payment_instrument', redirect_url: 'https://pay.ziina.com/pi_hold', success_url: 'https://shuttleiq.ai/marketplace/checkout/success?booking_id=b1&pack_id=pk-hold' });
    const crossed = await call('pk-hold', 'u-1', { returnScheme: 'com.shuttleiq.app' });
    expect(crossed.status).toBe(409);
    expect(await crossed.json()).toMatchObject({ error: 'platform_mismatch' });
  });

  it('Ziina already took the money → confirmed through the canonical path → 200 { confirmed: true }', async () => {
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'completed', redirect_url: 'https://pay.ziina.com/pi_hold' });
    const res = await call('pk-hold');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ confirmed: true });
    expect(confirmDeps.confirm).toHaveBeenCalledWith('pi_hold');
  });

  it('active pack → 200 { confirmed: true, alreadyConfirmed: true }; intent gone at Ziina → 409 intent_unavailable', async () => {
    confirmDeps.getPack.mockResolvedValueOnce(pack({ status: 'active', paidAt: new Date() }));
    const active = await call('pk-hold');
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ confirmed: true, alreadyConfirmed: true });
    confirmDeps.retrieveIntent.mockResolvedValueOnce({ status: 'canceled' });
    const gone = await call('pk-hold');
    expect(gone.status).toBe(409);
    expect(await gone.json()).toMatchObject({ error: 'intent_unavailable' });
  });
});

describe('startPurchase supersedes a lapsed hold', () => {
  const NOW = new Date('2026-09-14T08:00:00.000Z');
  const row = (id: string) => ({ id, title: 'Smash', venueName: 'Smash Sports Academy', venueLocation: null, dateDubai: '2026-09-20', startTime: '20:00', endTime: '22:00', status: 'upcoming', linked: true, capacity: 18, priceAed: 49, spotsRemaining: 10, packSeats: 0 });
  const deps = (packs: unknown[]) => ({
    now: () => NOW,
    getPacksForUser: vi.fn().mockResolvedValue(packs),
    getLastPickedGameDate: vi.fn().mockResolvedValue(null),
    listCalendarSessions: vi.fn().mockResolvedValue([row('a'), row('b'), row('c'), row('d')]),
    getActiveBookingSessionIdsForUser: vi.fn().mockResolvedValue(new Set<string>()),
    getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com' }),
    createHold: vi.fn().mockResolvedValue({ packId: 'pk-new', bookingIds: ['b1', 'b2', 'b3', 'b4'] }),
    attachIntent: vi.fn().mockResolvedValue(undefined),
    cancelHold: vi.fn().mockResolvedValue({ sessionIds: ['a', 'z'] }),
    promote: vi.fn().mockResolvedValue(1),
    notify: vi.fn().mockResolvedValue(undefined),
    mintResumeParam: vi.fn().mockResolvedValue('&resume=abc'),
    createIntent: vi.fn().mockResolvedValue({ id: 'pi_new', redirect_url: 'https://pay.ziina.com/x' }),
    allowedSchemes: () => ['com.shuttleiq.app'],
    baseUrl: () => 'https://shuttleiq.ai',
  });
  const good = { userId: 'u-1', tier: 'club', sessionIds: ['a', 'b', 'c', 'd'] };

  it('a hold whose 30 minutes are up is cancelled (hold_expired) and the new purchase goes ahead', async () => {
    const d = deps([pack({ id: 'pk-old', holdExpiresAt: new Date(NOW.getTime() - MIN), createdAt: new Date(NOW.getTime() - 31 * MIN) })]);
    const r = await startPurchase(good, d as any);
    expect(r).toEqual({ ok: true, packId: 'pk-new', redirectUrl: 'https://pay.ziina.com/x' });
    expect(d.cancelHold).toHaveBeenCalledWith('pk-old', 'hold_expired');
    expect(d.createHold).toHaveBeenCalled();
    // the freed seats go to the waitlist like the sweep's do — except the sessions the new purchase is about to re-take
    expect(d.promote).toHaveBeenCalledTimes(1);
    expect(d.promote).toHaveBeenCalledWith('z', 1);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('if the lapsed hold was confirmed a moment earlier (cancelHold claims nothing) the purchase does not go ahead', async () => {
    const d = deps([pack({ id: 'pk-old', holdExpiresAt: new Date(NOW.getTime() - MIN) })]);
    d.cancelHold.mockResolvedValueOnce(null);
    expect(await startPurchase(good, d as any)).toMatchObject({ ok: false, status: 409, error: 'hold_in_progress' });
    expect(d.createHold).not.toHaveBeenCalled();
  });

  it('a hold still inside its 30 minutes keeps answering 409 hold_in_progress and is not touched', async () => {
    const d = deps([pack({ id: 'pk-live', holdExpiresAt: new Date(NOW.getTime() + 9 * MIN) })]);
    expect(await startPurchase(good, d as any)).toMatchObject({ ok: false, status: 409, error: 'hold_in_progress' });
    expect(d.cancelHold).not.toHaveBeenCalled();
    expect(d.createHold).not.toHaveBeenCalled();
  });
});

describe('source pins', () => {
  it('getMyPacks exposes cancellationReason (typed) and the resume route sits behind the flag gate and the marketplace auth', () => {
    const store = read('server/iqPass/store.ts');
    expect(store.includes('cancellationReason: string | null;')).toBe(true);
    expect(store.includes('cancellationReason: p.cancellationReason,')).toBe(true);
    const routes = read('server/iqPass/routes.ts');
    expect(routes).toMatch(/r\.post\("\/api\/marketplace\/iq-pass\/packs\/:id\/resume", gate, requireAuth, requireMarketplaceAuth/);
  });
});
