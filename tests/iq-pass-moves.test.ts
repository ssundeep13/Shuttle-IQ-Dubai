// IQ Pass Gate 4 — moves (5 h before the session being vacated, ruling E3a),
// free re-picks after a ShuttleIQ cancellation, the session-cancel hook,
// priority waitlist for Plus/Elite, the admin-cancel email variant, and the
// three new routes. Orchestration over injected deps; DB glue pinned at source.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.RESEND_API_KEY = 'test-key-not-real';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send: sendMock } }; }) }));

const { moveSeat, repickSeat } = await import('../server/iqPass/moves');
const { sortWaitlistWithPriority } = await import('../server/iqPass/rules');
const { PickConflictError } = await import('../server/iqPass/store');
const { createIqPassRouter } = await import('../server/iqPass/routes');
const { sendCancellationEmail } = await import('../server/emailClient');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const NOW = new Date('2026-09-14T08:00:00.000Z'); // 12:00 Dubai, Mon 14 Sep
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-1', userId: 'u-1', tier: 'club_plus', gamesTotal: 8, priceAed: 360, status: 'active', ziinaPaymentIntentId: 'pi_1',
  windowStart: '2026-09-14', windowEnd: '2026-10-11', holdExpiresAt: NOW, paidAt: NOW, cancelledAt: null, cancellationReason: null,
  repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, renewalEmailSentAt: null, followupEmailSentAt: null, createdAt: NOW, ...over,
});
const seat = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1', userId: 'u-1', sessionId: 's-src', status: 'confirmed', paymentMethod: 'iq_pass', amountAed: 45, packId: 'pk-1',
  spotsBooked: 1, cancelledAt: null, promotedAt: null, walletAmountUsed: 0, ...over,
});
const sess = (id: string, over: Record<string, unknown> = {}) => ({
  id, dateDubai: '2026-09-20', startTime: '20:00', status: 'upcoming', linked: true, capacity: 24, spotsRemaining: 10, ...over,
});

function deps(over: Record<string, any> = {}) {
  const sessions: Record<string, any> = { 's-src': sess('s-src'), 's-dst': sess('s-dst', { dateDubai: '2026-09-25' }) };
  return {
    now: () => NOW,
    getBooking: vi.fn().mockResolvedValue(seat()),
    getPack: vi.fn().mockResolvedValue(pack()),
    getSessionForMove: vi.fn().mockImplementation(async (id: string) => sessions[id]),
    hasActiveGuests: vi.fn().mockResolvedValue(false),
    getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com' }),
    moveSeatTx: vi.fn().mockResolvedValue({ newBookingId: 'bk-new' }),
    repickSeatTx: vi.fn().mockResolvedValue({ newBookingId: 'bk-rp' }),
    promote: vi.fn().mockResolvedValue(1),
    notify: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('moveSeat', () => {
  const input = { userId: 'u-1', bookingId: 'bk-1', toSessionId: 's-dst' };

  it('happy path: one-step move inside the 5 h window → new seat, source freed to the waitlist, player notified', async () => {
    const d = deps();
    const r = await moveSeat(input, d);
    expect(r).toEqual({ ok: true, newBookingId: 'bk-new' });
    expect(d.moveSeatTx).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ id: 'bk-1' }), toSessionId: 's-dst', tier: 'club_plus', user: { name: 'Test Player', email: 't@example.com' }, now: NOW }));
    expect(d.promote).toHaveBeenCalledWith('s-src', 1);
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', type: 'iq_pass_moved' }));
  });

  it('ownership and shape guards: 404 unknown, 403 not owner, 400 not a pack seat, 409 seat not confirmed, 409 pack not active, 400 same session', async () => {
    expect(await moveSeat(input, deps({ getBooking: vi.fn().mockResolvedValue(undefined) }))).toMatchObject({ ok: false, status: 404, error: 'booking_not_found' });
    expect(await moveSeat(input, deps({ getBooking: vi.fn().mockResolvedValue(seat({ userId: 'u-2' })) }))).toMatchObject({ ok: false, status: 403, error: 'not_owner' });
    expect(await moveSeat(input, deps({ getBooking: vi.fn().mockResolvedValue(seat({ packId: null, paymentMethod: 'ziina' })) }))).toMatchObject({ ok: false, status: 400, error: 'not_pack_seat' });
    expect(await moveSeat(input, deps({ getBooking: vi.fn().mockResolvedValue(seat({ status: 'cancelled' })) }))).toMatchObject({ ok: false, status: 409, error: 'seat_not_confirmed' });
    expect(await moveSeat(input, deps({ getPack: vi.fn().mockResolvedValue(pack({ status: 'completed' })) }))).toMatchObject({ ok: false, status: 409, error: 'pack_not_active' });
    expect(await moveSeat({ ...input, toSessionId: 's-src' }, deps())).toMatchObject({ ok: false, status: 400, error: 'same_session' });
  });

  it('cutoff: 5 h before the session being VACATED (E3a) — 11:00Z on the day is the last moment for a 20:00 Dubai session', async () => {
    const at = (iso: string) => deps({ now: () => new Date(iso) });
    expect(await moveSeat(input, at('2026-09-20T10:59:59.000Z'))).toMatchObject({ ok: true });
    expect(await moveSeat(input, at('2026-09-20T11:00:00.000Z'))).toMatchObject({ ok: false, status: 409, error: 'move_cutoff_passed' });
  });

  it('a seat with an extra guest cannot move (409 move_with_guests) — the guest is cancelled through the existing flow first', async () => {
    expect(await moveSeat(input, deps({ hasActiveGuests: vi.fn().mockResolvedValue(true) }))).toMatchObject({ ok: false, status: 409, error: 'move_with_guests' });
  });

  it('target checks: unknown 404, not upcoming/linked 400, outside the rolling 4-week window 400, full 409', async () => {
    const target = (over: Record<string, unknown>) => deps({ getSessionForMove: vi.fn().mockImplementation(async (id: string) => id === 's-src' ? sess('s-src') : (over === null ? undefined : sess('s-dst', over))) });
    expect(await moveSeat(input, target(null as any))).toMatchObject({ ok: false, status: 404, error: 'session_not_found' });
    expect(await moveSeat(input, target({ status: 'cancelled' }))).toMatchObject({ ok: false, status: 400, error: 'session_unavailable' });
    expect(await moveSeat(input, target({ linked: false }))).toMatchObject({ ok: false, status: 400, error: 'session_unavailable' });
    expect(await moveSeat(input, target({ dateDubai: '2026-10-12' }))).toMatchObject({ ok: false, status: 400, error: 'out_of_window' });
    expect(await moveSeat(input, target({ dateDubai: '2026-09-13' }))).toMatchObject({ ok: false, status: 400, error: 'out_of_window' });
    expect(await moveSeat(input, target({ spotsRemaining: 0 }))).toMatchObject({ ok: false, status: 409, error: 'session_full' });
  });

  it('a conflict raised inside the transaction (unique index / capacity lost under the lock) maps to its status and skips the follow-ups', async () => {
    const d = deps({ moveSeatTx: vi.fn().mockRejectedValue(new PickConflictError({ status: 409, error: 'already_booked', sessionId: 's-dst' })) });
    expect(await moveSeat(input, d)).toMatchObject({ ok: false, status: 409, error: 'already_booked' });
    expect(d.promote).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('the 50% pack cap is NOT enforced on moves (purchase-time only)', async () => {
    const d = deps({ getSessionForMove: vi.fn().mockImplementation(async (id: string) => id === 's-src' ? sess('s-src') : sess('s-dst', { dateDubai: '2026-09-25', capacity: 18, spotsRemaining: 1 })) });
    expect(await moveSeat(input, d)).toMatchObject({ ok: true });
  });
});

describe('repickSeat — a free re-pick after ShuttleIQ cancelled a picked session', () => {
  const input = { userId: 'u-1', packId: 'pk-1', toSessionId: 's-dst' };

  it('consumes one credit, inserts the seat, notifies', async () => {
    const d = deps({ getPack: vi.fn().mockResolvedValue(pack({ repickCredits: 1 })) });
    expect(await repickSeat(input, d)).toEqual({ ok: true, newBookingId: 'bk-rp' });
    expect(d.repickSeatTx).toHaveBeenCalledWith(expect.objectContaining({ pack: expect.objectContaining({ id: 'pk-1' }), toSessionId: 's-dst', tier: 'club_plus' }));
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'iq_pass_repicked' }));
  });

  it('refuses without a credit, when the pack is not active, when not the owner, and applies the same target checks', async () => {
    expect(await repickSeat(input, deps())).toMatchObject({ ok: false, status: 409, error: 'no_repick_credit' });
    expect(await repickSeat(input, deps({ getPack: vi.fn().mockResolvedValue(pack({ repickCredits: 1, status: 'completed' })) }))).toMatchObject({ ok: false, status: 409, error: 'pack_not_active' });
    expect(await repickSeat(input, deps({ getPack: vi.fn().mockResolvedValue(pack({ repickCredits: 1, userId: 'u-9' })) }))).toMatchObject({ ok: false, status: 403, error: 'not_owner' });
    const full = deps({ getPack: vi.fn().mockResolvedValue(pack({ repickCredits: 1 })), getSessionForMove: vi.fn().mockResolvedValue(sess('s-dst', { spotsRemaining: 0 })) });
    expect(await repickSeat(input, full)).toMatchObject({ ok: false, status: 409, error: 'session_full' });
  });
});

describe('sortWaitlistWithPriority — Plus/Elite first, stable within groups, identity when nobody has priority', () => {
  const rows = [{ id: 'a', userId: 'u1' }, { id: 'b', userId: 'u2' }, { id: 'c', userId: 'u3' }, { id: 'd', userId: 'u2' }];
  it('moves priority holders to the front in their original order', () => {
    expect(sortWaitlistWithPriority(rows, new Set(['u2', 'u3'])).map((r) => r.id)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('returns the same array (not a copy) when the priority set is empty — byte-identical order for a flag-off app', () => {
    expect(sortWaitlistWithPriority(rows, new Set())).toBe(rows);
  });
});

describe('admin-cancel email — IQ Pass seat variant', () => {
  // no vi.restoreAllMocks() here — it would also wipe the vi.fn() deps the HTTP block below relies on
  beforeEach(() => { sendMock.mockReset(); sendMock.mockResolvedValue({ data: { id: 'e' }, error: null }); });
  const session = { title: 'Smash Sports Academy Session', venueName: 'Smash', venueLocation: null, venueMapUrl: null, date: new Date('2026-09-20'), startTime: '20:00', endTime: '22:00' } as any;

  it('tells the player about the free re-pick, never mentions a refund or a per-game amount', async () => {
    await sendCancellationEmail('t@example.com', 'Test', session, false, 0, { eventCancelledByAdmin: true, paymentMethod: 'iq_pass', walletAmountUsedAed: 0, iqPassRepick: true });
    const html: string = sendMock.mock.calls[0][0].html;
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).toMatch(/free re-pick/);
    expect(text).toMatch(/IQ Pass/);
    expect(text).not.toMatch(/refund/i);
    expect(text).not.toMatch(/AED 4[357]\b/);
  });

  it('a normal ziina seat keeps the existing refund wording', async () => {
    await sendCancellationEmail('t@example.com', 'Test', session, false, 49, { eventCancelledByAdmin: true, paymentMethod: 'ziina', walletAmountUsedAed: 0 });
    expect(sendMock.mock.calls[0][0].html).toMatch(/Full refund of AED 49\.00/);
  });
});

describe('source pins', () => {
  const store = read('server/iqPass/store.ts');
  const st = read('server/storage.ts');
  const routes = read('server/marketplace-routes.ts');

  it('moveSeatTx: target locked FOR UPDATE and recounted, source re-checked, new seat carries moved_from_booking_id, source cancelled with iq_pass_move, guests handled', () => {
    const fn = store.slice(store.indexOf('async moveSeatTx('), store.indexOf('async repickSeatTx('));
    expect(fn.includes('db.transaction(')).toBe(true);
    expect(fn.includes(".for('update')")).toBe(true);
    expect(fn.includes('movedFromBookingId: source.id')).toBe(true);
    expect(fn.includes("cancellationReason: 'iq_pass_move'")).toBe(true);
    expect(fn.includes("paymentMethod: 'iq_pass'")).toBe(true);
    expect(fn.includes('amountAed: tier.allocationAed')).toBe(true);
    expect(fn.includes('promotedAt: null')).toBe(true);
    expect(fn.includes("code === '23505'")).toBe(true);
  });

  it('repickSeatTx: pack locked FOR UPDATE, credit checked and decremented in the same transaction', () => {
    const fn = store.slice(store.indexOf('async repickSeatTx('), store.indexOf('async getPlusTierUserIds('));
    expect(fn.includes(".for('update')")).toBe(true);
    expect(fn.includes('repickCredits: sql`${packs.repickCredits} - 1`')).toBe(true);
    expect(fn.indexOf('.insert(bookings)')).toBeGreaterThan(fn.indexOf(".for('update')"));
  });

  it('confirmTx: a hold whose seats were lost (session cancelled meanwhile) is treated as hold_gone BEFORE any flip — payment recorded, refund queued, nothing confirmed', () => {
    const fn = store.slice(store.indexOf('async confirmTx('), store.indexOf('async expireHolds('));
    const held = fn.indexOf('pack.gamesTotal !== held.length'); // reversed on purpose: the post-flip sanity check owns "!== pack.gamesTotal"
    const flip = fn.indexOf('.update(bookings)');
    expect(held).toBeGreaterThan(-1);
    expect(held).toBeLessThan(flip);
    expect(fn.includes("cancellationReason: 'seats_lost'")).toBe(true);
  });

  it('getWaitlistedBookingsForSession keeps created_at ASC and applies the priority sort only under the flag', () => {
    const fn = st.slice(st.indexOf('async getWaitlistedBookingsForSession('), st.indexOf('async getWaitlistCountForSession('));
    expect(fn.includes('.orderBy(asc(bookings.createdAt))')).toBe(true);
    expect(fn.includes('if (!isIqPassEnabled()) return rows;')).toBe(true);
    expect(fn.includes('sortWaitlistWithPriority(rows, ')).toBe(true);
    expect(fn.includes('getPlusTierUserIds(')).toBe(true);
  });

  it('cancelBookableSessionAndRefund: a pack seat gets a re-pick credit + iq_pass_repick notification inside the same transaction and never a refund row', () => {
    const fn = st.slice(st.indexOf('async cancelBookableSessionAndRefund('), st.indexOf('async updateBooking('));
    const tx = fn.indexOf('db.transaction(');
    const credit = fn.indexOf('repickCredits: sql`${packs.repickCredits} + 1`');
    const notif = fn.indexOf("type: 'iq_pass_repick'");
    const refund = fn.indexOf('if (isZiinaPaid) {');
    expect(credit).toBeGreaterThan(tx);
    expect(notif).toBeGreaterThan(credit);
    expect(refund).toBeGreaterThan(notif);
    expect(fn.includes('if (booking.packId && wasPaidStatus)')).toBe(true);
    expect(fn.includes('iqPassRepickCount')).toBe(true);
  });

  it('the admin session-cancel route emails pack seats with the re-pick variant and no amount', () => {
    const r = routes.slice(routes.indexOf('app.post("/api/marketplace/admin/sessions/:id/cancel"'), routes.indexOf('app.post("/api/marketplace/admin/sessions/:id/cancel"') + 4000);
    expect(r.includes('iqPassRepick: !!booking.packId && wasPaidStatus')).toBe(true);
    expect(r.includes('booking.packId ? 0 : (wasPaidStatus ? booking.amountAed : 0)')).toBe(true);
  });
});

describe('HTTP: move / repick / me', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  const moveDeps = deps({ getPack: vi.fn().mockResolvedValue(pack({ repickCredits: 1 })) });
  const meDeps = { getMyPacks: vi.fn().mockResolvedValue({ packs: [{ id: 'pk-1', tier: 'club_plus', label: 'Club Plus', status: 'active', gamesTotal: 8, repickCredits: 1, seats: [] }] }) };
  const token = jwt.sign({ userId: 'u-1', email: 't@example.com', role: 'marketplace_player' }, 'test-main-secret', { expiresIn: '1h' });
  const call = (method: string, path: string, body?: unknown, auth = true) =>
    fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createIqPassRouter({ purchase: {} as any, confirm: {} as any, moves: moveDeps as any, me: meDeps as any }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.IQ_PASS_ENABLED = 'true';
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it('flag off → 404 for all three', async () => {
    delete process.env.IQ_PASS_ENABLED;
    expect((await call('POST', '/api/marketplace/iq-pass/bookings/bk-1/move', { toSessionId: 's-dst' })).status).toBe(404);
    expect((await call('POST', '/api/marketplace/iq-pass/packs/pk-1/repick', { toSessionId: 's-dst' })).status).toBe(404);
    expect((await call('GET', '/api/marketplace/iq-pass/me')).status).toBe(404);
    process.env.IQ_PASS_ENABLED = 'true';
  });

  it('all three need a marketplace token', async () => {
    expect((await call('POST', '/api/marketplace/iq-pass/bookings/bk-1/move', { toSessionId: 's-dst' }, false)).status).toBe(401);
    expect((await call('GET', '/api/marketplace/iq-pass/me', undefined, false)).status).toBe(401);
  });

  it('move → 200 { newBookingId }; bad body → 400; errors carry their status', async () => {
    const ok = await call('POST', '/api/marketplace/iq-pass/bookings/bk-1/move', { toSessionId: 's-dst' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ newBookingId: 'bk-new' });
    expect((await call('POST', '/api/marketplace/iq-pass/bookings/bk-1/move', {})).status).toBe(400);
    const same = await call('POST', '/api/marketplace/iq-pass/bookings/bk-1/move', { toSessionId: 's-src' });
    expect(same.status).toBe(400);
    expect(await same.json()).toMatchObject({ error: 'same_session' });
  });

  it('repick → 200 { newBookingId }', async () => {
    const ok = await call('POST', '/api/marketplace/iq-pass/packs/pk-1/repick', { toSessionId: 's-dst' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ newBookingId: 'bk-rp' });
  });

  it('me → 200 with the packs list', async () => {
    const res = await call('GET', '/api/marketplace/iq-pass/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ packs: [expect.objectContaining({ id: 'pk-1', label: 'Club Plus' })] });
    expect(meDeps.getMyPacks).toHaveBeenCalledWith('u-1', expect.any(Date));
  });
});
