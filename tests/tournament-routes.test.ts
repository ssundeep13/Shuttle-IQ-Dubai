// Tournament Gate 2 — the HTTP surface behind the REAL auth middleware on a
// throwaway express app. Flag off: every tournament path answers the app's
// JSON 404, token or not. Flag on: six player routes + one public read.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { createTournamentRouter, tournamentConfigHandler } = await import('../server/tournament/routes');

const Z = (iso: string) => new Date(iso);
const OPEN = Z('2026-09-26T10:00:00Z');
const T = {
  id: 't-1', name: 'ShuttleIQ League', status: 'published', startsAt: Z('2026-10-17T14:00:00Z'), endsAt: Z('2026-10-17T18:00:00Z'),
  venueName: 'BASELINE SPORTS ACADEMY DIP', venueLocation: 'x', venueMapUrl: 'y', entryFeeAed: 100,
  tierCaps: { Professional: 6, Competitive: 18, Intermediate: 18, Beginner: 6 }, waitlistCapPerTier: 2, holdMinutes: 1440,
  registrationOpensAtMembers: Z('2026-09-25T08:00:00Z'), registrationOpensAt: Z('2026-09-25T14:00:00Z'),
  registrationClosesAt: Z('2026-10-08T20:00:00Z'), withdrawDeadlineAt: Z('2026-10-08T20:00:00Z'), draftCutoffAt: Z('2026-10-10T20:00:00Z'), deckUrl: null,
};
const reg = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', tournamentId: 't-1', userId: 'u-1', playerId: 'p-1', tier: 'Competitive', status: 'pending_payment', amountAed: 100,
  ziinaPaymentIntentId: 'pi_1', holdExpiresAt: Z('2026-09-27T10:00:00Z'), tShirtSize: 'M', company: null, shareWithSponsors: false, sponsorInterest: false, createdAt: OPEN, ...over,
});
const counts = { Professional: { held: 0, waitlisted: 0 }, Competitive: { held: 0, waitlisted: 0 }, Intermediate: { held: 0, waitlisted: 0 }, Beginner: { held: 0, waitlisted: 0 } };

const d: Record<string, any> = {
  now: () => OPEN,
  getCurrentTournament: vi.fn().mockResolvedValue(T),
  getTournament: vi.fn().mockResolvedValue(T),
  getAccount: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com', phone: null, linkedPlayerId: 'p-1' }),
  getPlayer: vi.fn().mockResolvedValue({ id: 'p-1', level: 'upper_intermediate', skillScore: 95 }),
  isMember: vi.fn().mockResolvedValue(false),
  isPreviewUser: vi.fn().mockReturnValue(false),
  countsByTier: vi.fn().mockResolvedValue(counts),
  getRegistration: vi.fn(),
  getActiveRegistrationForUser: vi.fn().mockResolvedValue(undefined),
  createRegistration: vi.fn().mockResolvedValue({ kind: 'created', registration: reg({ ziinaPaymentIntentId: null }) }),
  attachIntent: vi.fn().mockResolvedValue(true),
  cancelHold: vi.fn().mockResolvedValue({ cancelled: true, promoted: [] }),
  withdraw: vi.fn().mockResolvedValue({ kind: 'withdrawn', registration: reg({ status: 'withdrawn' }), refund: null, promoted: [] }),
  setSponsorInterest: vi.fn().mockResolvedValue(reg({ sponsorInterest: true })),
  createIntent: vi.fn().mockResolvedValue({ id: 'pi_new', redirect_url: 'https://pay.ziina.com/new' }),
  retrieveIntent: vi.fn(),
  isSuccessful: (s: string) => s === 'completed',
  isIntentDead: (s: string) => s === 'failed',
  confirm: vi.fn().mockResolvedValue({ confirmed: true }),
  onSponsorInterest: vi.fn(),
  onPromoted: vi.fn().mockResolvedValue(undefined),
  allowedSchemes: () => [],
  baseUrl: () => 'https://shuttleiq.ai',
};

const PATHS: Array<[string, string]> = [
  ['GET', '/api/marketplace/tournament/config'],
  ['GET', '/api/marketplace/tournament'],
  ['POST', '/api/marketplace/tournament/register'],
  ['GET', '/api/marketplace/tournament/me'],
  ['POST', '/api/marketplace/tournament/registrations/r-1/pay'],
  ['POST', '/api/marketplace/tournament/registrations/r-1/withdraw'],
  ['POST', '/api/marketplace/tournament/registrations/r-1/sponsor-interest'],
  ['POST', '/api/marketplace/tournament/registrations/r-1/confirm'],
];

describe('HTTP: /api/marketplace/tournament/*', () => {
  let server: Server; let base = '';
  const prev = process.env.TOURNAMENT_ENABLED;
  const player = jwt.sign({ userId: 'u-1', email: 't@example.com', role: 'marketplace_player' }, 'test-main-secret', { expiresIn: '1h' });
  const admin = jwt.sign({ userId: 'a-1', email: 'a@example.com', role: 'admin' }, 'test-main-secret', { expiresIn: '1h' });
  const call = (method: string, path: string, body?: unknown, token: string | null = player) =>
    fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/marketplace/tournament/config', tournamentConfigHandler);
    app.use(createTournamentRouter(d as any));
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' })); // the app's own /api catch-all
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.TOURNAMENT_ENABLED; else process.env.TOURNAMENT_ENABLED = prev; });
  beforeEach(() => { process.env.TOURNAMENT_ENABLED = 'true'; d.getRegistration.mockReset(); d.retrieveIntent.mockReset(); d.confirm.mockClear(); });

  it('flag off → every tournament path is the JSON 404, with or without a token, and no dep is touched', async () => {
    delete process.env.TOURNAMENT_ENABLED;
    for (const token of [player, null]) {
      for (const [m, p] of PATHS) {
        const res = await call(m, p, {}, token);
        expect(res.status, `${m} ${p}`).toBe(404);
        expect(await res.json()).toEqual({ error: 'Not found' });
      }
    }
    expect(d.getCurrentTournament).not.toHaveBeenCalled();
    expect(d.createRegistration).not.toHaveBeenCalled();
    expect(d.getRegistration).not.toHaveBeenCalled();
  });

  it('player routes need a marketplace token: 401 without, 403 for an admin token', async () => {
    for (const [m, p] of PATHS.filter(([, p]) => !p.endsWith('/config') && p !== '/api/marketplace/tournament' && !p.endsWith('/confirm'))) {
      expect((await call(m, p, {}, null)).status, `${m} ${p}`).toBe(401);
      expect((await call(m, p, {}, admin)).status, `${m} ${p}`).toBe(403);
    }
  });

  it('GET /api/marketplace/tournament is public (no token needed), no-store', async () => {
    const res = await call('GET', '/api/marketplace/tournament', undefined, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ visible: true, phase: 'open' });
    // an invalid token is treated as anonymous, never a 401 on the public read
    const bad = await call('GET', '/api/marketplace/tournament', undefined, 'not-a-jwt');
    expect(bad.status).toBe(200);
  });

  it('POST register → 200 with the redirect; the body reaches the action', async () => {
    const res = await call('POST', '/api/marketplace/tournament/register', { tShirtSize: 'L', company: 'Acme', shareWithSponsors: false, sponsorInterest: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ registration: { id: 'r-1' }, redirectUrl: 'https://pay.ziina.com/new' });
    expect(d.createRegistration.mock.calls.at(-1)[0]).toMatchObject({ userId: 'u-1', tShirtSize: 'L', company: 'Acme' });
  });

  it('GET me, POST withdraw, POST sponsor-interest → 200', async () => {
    expect((await call('GET', '/api/marketplace/tournament/me')).status).toBe(200);
    expect((await call('POST', '/api/marketplace/tournament/registrations/r-1/withdraw')).status).toBe(200);
    expect((await call('POST', '/api/marketplace/tournament/registrations/r-1/sponsor-interest', { interested: true })).status).toBe(200);
  });

  it('POST confirm (no auth; the registration id is the secret): 404, already, unpaid, paid', async () => {
    d.getRegistration.mockResolvedValueOnce(undefined);
    expect((await call('POST', '/api/marketplace/tournament/registrations/nope/confirm', {}, null)).status).toBe(404);

    d.getRegistration.mockResolvedValueOnce(reg({ status: 'confirmed' }));
    expect(await (await call('POST', '/api/marketplace/tournament/registrations/r-1/confirm', {}, null)).json()).toEqual({ confirmed: true, alreadyConfirmed: true });

    d.getRegistration.mockResolvedValueOnce(reg({ ziinaPaymentIntentId: null }));
    expect((await call('POST', '/api/marketplace/tournament/registrations/r-1/confirm', {}, null)).status).toBe(400);

    d.getRegistration.mockResolvedValueOnce(reg());
    d.retrieveIntent.mockResolvedValueOnce({ status: 'pending' });
    expect(await (await call('POST', '/api/marketplace/tournament/registrations/r-1/confirm', {}, null)).json()).toEqual({ confirmed: false, status: 'pending' });
    expect(d.confirm).not.toHaveBeenCalled();

    d.getRegistration.mockResolvedValueOnce(reg());
    d.retrieveIntent.mockResolvedValueOnce({ status: 'completed' });
    expect(await (await call('POST', '/api/marketplace/tournament/registrations/r-1/confirm', {}, null)).json()).toEqual({ confirmed: true });
    expect(d.confirm).toHaveBeenCalledWith('pi_1');
  });

  it('an unexpected failure is a 500 with a plain message, never a stack', async () => {
    d.getCurrentTournament.mockRejectedValueOnce(new Error('db down'));
    const res = await call('GET', '/api/marketplace/tournament', undefined, null);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load the tournament' });
  });
});
