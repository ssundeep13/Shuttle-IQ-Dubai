import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Handler = (req: any, res: any) => Promise<void> | void;

async function loadOnboardingHandler(): Promise<Handler> {
  const { registerMarketplaceRoutes } = await import('../server/marketplace-routes');
  let captured: Handler | undefined;
  const noop = () => {};
  const fakeApp = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'post') {
        return (path: string, ...handlers: Handler[]) => {
          if (path === '/api/marketplace/onboarding') {
            captured = handlers[handlers.length - 1];
          }
        };
      }
      return noop;
    },
  });
  registerMarketplaceRoutes(fakeApp as unknown as Parameters<typeof registerMarketplaceRoutes>[0]);
  if (!captured) throw new Error('onboarding handler not registered');
  return captured;
}

function makeRes() {
  let statusCode = 200;
  let body: Record<string, unknown> | undefined;
  const res = {
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (b: Record<string, unknown>) => {
      body = b;
      return res;
    },
  };
  return { res, get statusCode() { return statusCode; }, get body() { return body; } };
}

describe('POST /api/marketplace/onboarding', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('persists answers, computes the spec band-snap score, and updates a linked player with zero games', async () => {
    const handler = await loadOnboardingHandler();
    const { storage } = await import('../server/storage');

    const userRow: any = {
      id: 'u1',
      email: 'a@b.com',
      onboardingCompleted: false,
      onboardingExperience: null,
      onboardingRallies: null,
      onboardingGames: null,
      linkedPlayerId: 'p1',
    };
    const playerRow: any = { id: 'p1', gamesPlayed: 0, skillScore: 50, level: 'Beginner' };

    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(userRow);
    vi.spyOn(storage, 'getPlayer').mockResolvedValue(playerRow);
    const updateUser = vi.spyOn(storage, 'updateMarketplaceUser').mockResolvedValue(userRow);
    const updatePlayer = vi.spyOn(storage, 'updatePlayer').mockResolvedValue(playerRow);

    const captured = makeRes();
    // Answers all "3" → average 3.0 → band-snap to 75 (upper_intermediate).
    await handler(
      { user: { userId: 'u1' }, body: { experience: 3, rallies: 3, games: 3 } },
      captured.res,
    );

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ score: 75, appliedToPlayerId: 'p1' });
    expect(updateUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        onboardingCompleted: true,
        onboardingExperience: 3,
        onboardingRallies: 3,
        onboardingGames: 3,
      }),
    );
    expect(updatePlayer).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ skillScore: 75, skillScoreBaseline: 75 }),
    );
  });

  it('persists answers but does NOT touch the linked player when gameplay history exists (409 gameplay_score_locked)', async () => {
    const handler = await loadOnboardingHandler();
    const { storage } = await import('../server/storage');

    const userRow: any = {
      id: 'u2',
      onboardingCompleted: false,
      onboardingExperience: null,
      onboardingRallies: null,
      onboardingGames: null,
      linkedPlayerId: 'p2',
    };
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(userRow);
    vi.spyOn(storage, 'getPlayer').mockResolvedValue({ id: 'p2', gamesPlayed: 7 } as any);
    const updateUser = vi.spyOn(storage, 'updateMarketplaceUser').mockResolvedValue(userRow);
    const updatePlayer = vi.spyOn(storage, 'updatePlayer').mockResolvedValue({} as any);

    const captured = makeRes();
    await handler(
      { user: { userId: 'u2' }, body: { experience: 4, rallies: 4, games: 4 } },
      captured.res,
    );

    expect(captured.statusCode).toBe(409);
    expect(captured.body).toEqual({ error: 'gameplay_score_locked' });
    expect(updateUser).not.toHaveBeenCalled();
    expect(updatePlayer).not.toHaveBeenCalled();
  });

  it('skip path marks completed with no concrete answers and seeds nothing', async () => {
    const handler = await loadOnboardingHandler();
    const { storage } = await import('../server/storage');

    const userRow: any = { id: 'u3', onboardingCompleted: false, linkedPlayerId: null };
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(userRow);
    const updateUser = vi.spyOn(storage, 'updateMarketplaceUser').mockResolvedValue(userRow);
    const updatePlayer = vi.spyOn(storage, 'updatePlayer').mockResolvedValue({} as any);

    const captured = makeRes();
    await handler({ user: { userId: 'u3' }, body: { skip: true } }, captured.res);

    expect(captured.statusCode).toBe(200);
    expect(captured.body).toEqual({ skipped: true });
    expect(updateUser).toHaveBeenCalledWith(
      'u3',
      expect.objectContaining({
        onboardingCompleted: true,
        onboardingExperience: null,
        onboardingRallies: null,
        onboardingGames: null,
      }),
    );
    expect(updatePlayer).not.toHaveBeenCalled();
  });

  it('rejects retake submissions from a user who originally skipped (409 onboarding_already_skipped)', async () => {
    const handler = await loadOnboardingHandler();
    const { storage } = await import('../server/storage');

    const userRow: any = {
      id: 'u4',
      onboardingCompleted: true,
      onboardingExperience: null,
      onboardingRallies: null,
      onboardingGames: null,
      linkedPlayerId: null,
    };
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(userRow);
    const updateUser = vi.spyOn(storage, 'updateMarketplaceUser').mockResolvedValue(userRow);

    const captured = makeRes();
    await handler(
      { user: { userId: 'u4' }, body: { experience: 2, rallies: 2, games: 2 } },
      captured.res,
    );

    expect(captured.statusCode).toBe(409);
    expect(captured.body).toEqual({ error: 'onboarding_already_skipped' });
    expect(updateUser).not.toHaveBeenCalled();
  });
});
