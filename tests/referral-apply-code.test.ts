import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level tests for:
//   GET  /api/marketplace/referral-discount-eligibility  (extended shape)
//   POST /api/marketplace/referrals/apply-code           (new endpoint)
//
// Pattern: mock auth middleware so it passes through, capture the route
// handler from a fakeApp proxy, mock storage, call the handler directly.

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Handler = (req: any, res: any) => Promise<void> | void;

/** Capture handlers for multiple (method, path) pairs in one registration call. */
async function loadHandlers(pairs: Array<{ method: 'get' | 'post'; path: string }>) {
  const { registerMarketplaceRoutes } = await import('../server/marketplace-routes');
  const captured = new Map<string, Handler>();
  const noop = () => {};
  const fakeApp = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      const method = String(prop);
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        return (path: string, ...handlers: Handler[]) => {
          const key = `${method.toUpperCase()} ${path}`;
          if (pairs.some(p => p.method === method && p.path === path)) {
            captured.set(key, handlers[handlers.length - 1]);
          }
        };
      }
      return noop;
    },
  });
  registerMarketplaceRoutes(fakeApp as unknown as Parameters<typeof registerMarketplaceRoutes>[0]);
  return captured;
}

function makeRes() {
  let statusCode = 200;
  let body: Record<string, unknown> | undefined;
  const res = {
    status: (c: number) => { statusCode = c; return res; },
    json: (b: Record<string, unknown>) => { body = b; return res; },
  };
  return {
    res,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/referral-discount-eligibility — extended shape
// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/marketplace/referral-discount-eligibility', () => {
  const PATH = '/api/marketplace/referral-discount-eligibility';

  beforeEach(() => vi.restoreAllMocks());

  async function load() {
    const handlers = await loadHandlers([{ method: 'get', path: PATH }]);
    const handler = handlers.get(`GET ${PATH}`);
    if (!handler) throw new Error('handler not captured');
    return handler;
  }

  it('returns eligible=true, canApplyCode=false when user has a referral row and 0 bookings', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'r1' } as any);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ eligible: true, canApplyCode: false });
  });

  it('returns eligible=false, canApplyCode=true when user has NO referral row and 0 bookings', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ eligible: false, canApplyCode: true });
  });

  it('returns eligible=false, canApplyCode=false when user has prior bookings (no referral)', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(2);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ eligible: false, canApplyCode: false });
  });

  it('returns eligible=false, canApplyCode=false when user has referral row but also has prior bookings', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'r1' } as any);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(1);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ eligible: false, canApplyCode: false });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/marketplace/referrals/apply-code
// ────────────────────────────────────────────────────────────────────────────

describe('POST /api/marketplace/referrals/apply-code', () => {
  const PATH = '/api/marketplace/referrals/apply-code';

  beforeEach(() => vi.restoreAllMocks());

  async function load() {
    const handlers = await loadHandlers([{ method: 'post', path: PATH }]);
    const handler = handlers.get(`POST ${PATH}`);
    if (!handler) throw new Error('handler not captured');
    return handler;
  }

  it('returns 400 when referralCode is missing from the body', async () => {
    const handler = await load();
    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: {} }, captured.res);
    expect(captured.statusCode).toBe(400);
  });

  it('returns 409 when the user already has a referral row', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'r1' } as any);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: { referralCode: 'SIQ-TEST00-00001' } }, captured.res);

    expect(captured.statusCode).toBe(409);
    expect(captured.body?.error).toMatch(/already used/i);
  });

  it('returns 409 when the user has 1 or more prior confirmed bookings', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(1);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: { referralCode: 'SIQ-TEST00-00001' } }, captured.res);

    expect(captured.statusCode).toBe(409);
    expect(captured.body?.error).toMatch(/first booking/i);
  });

  it('returns 404 when the referral code does not match any player', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);
    vi.spyOn(storage, 'getPlayerByReferralCode').mockResolvedValue(undefined);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: { referralCode: 'SIQ-NOBODY-99999' } }, captured.res);

    expect(captured.statusCode).toBe(404);
    expect(captured.body?.error).toMatch(/invalid referral code/i);
  });

  it('creates the referral row and returns success + referrerName for a valid code', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);
    vi.spyOn(storage, 'getPlayerByReferralCode').mockResolvedValue({ id: 'p1', name: 'Ahmed' } as any);
    const createSpy = vi.spyOn(storage, 'createReferral').mockResolvedValue({} as any);

    const captured = makeRes();
    await handler({ user: { userId: 'u2' }, body: { referralCode: 'SIQ-AHMED0-00001' } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ success: true, referrerName: 'Ahmed' });
    expect(createSpy).toHaveBeenCalledWith({ referrerPlayerId: 'p1', refereeUserId: 'u2' });
  });

  it('trims whitespace from the referral code before looking it up', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);
    const lookupSpy = vi.spyOn(storage, 'getPlayerByReferralCode').mockResolvedValue(undefined);

    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: { referralCode: '  SIQ-AHMED0-00001  ' } }, captured.res);

    expect(lookupSpy).toHaveBeenCalledWith('SIQ-AHMED0-00001');
  });

  it('does not create a referral row when the code is invalid (404 path)', async () => {
    const handler = await load();
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);
    vi.spyOn(storage, 'getPlayerByReferralCode').mockResolvedValue(undefined);
    const createSpy = vi.spyOn(storage, 'createReferral');

    const captured = makeRes();
    await handler({ user: { userId: 'u1' }, body: { referralCode: 'SIQ-NOBODY-99999' } }, captured.res);

    expect(captured.statusCode).toBe(404);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
