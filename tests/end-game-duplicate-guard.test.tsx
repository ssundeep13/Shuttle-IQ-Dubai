import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Flat mocks (all hoisted) — nothing here imports a real DB ──────────────

// Prevent server/db.ts from creating a real Neon connection pool
vi.mock('../server/db', () => ({
  db:   {},
  pool: { on: vi.fn(), end: vi.fn() },
}));

// Prevent http.createServer(fakeApp) from reading maxHeaderSize off the proxy
vi.mock('http', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  const fakeServer = { on: vi.fn(), listen: vi.fn(), close: vi.fn(), address: vi.fn().mockReturnValue({ port: 0 }) };
  return { ...actual, createServer: vi.fn().mockReturnValue(fakeServer) };
});

vi.mock('../server/auth/middleware', () => ({
  requireAuth:            (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin:           (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Stub every export that registerRoutes awaits at startup
vi.mock('../server/auth/storage', () => ({
  createAdminUser:            vi.fn(),
  findAdminByEmail:           vi.fn().mockResolvedValue(null),
  findAdminById:              vi.fn().mockResolvedValue(null),
  updateAdminLastLogin:       vi.fn().mockResolvedValue(undefined),
  createAuthSession:          vi.fn().mockResolvedValue({}),
  findAuthSession:            vi.fn().mockResolvedValue(null),
  deleteAuthSession:          vi.fn().mockResolvedValue(undefined),
  deleteSessionsForUser:      vi.fn().mockResolvedValue(undefined),
  deleteExpiredSessions:      vi.fn().mockResolvedValue(undefined),
  ensureOwnerSuperAdmin:      vi.fn().mockResolvedValue(undefined),
  rotateDefaultAdminPassword: vi.fn().mockResolvedValue(undefined),
  seedAdminUser:              vi.fn().mockResolvedValue(null),
}));

vi.mock('../server/financeRoutes', () => ({
  registerFinanceRoutes: vi.fn(),
  seedExpenseCategories: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../server/marketplace-routes', () => ({
  registerMarketplaceRoutes: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Part 1 — UI: EndGameModal submit button disabled while isPending=true
// ═══════════════════════════════════════════════════════════════════════════
describe('EndGameModal — submit button disabled while isPending', () => {
  it('disables the "Record Result" button and shows a spinner when isPending=true', async () => {
    const { EndGameModal } = await import('../client/src/components/EndGameModal');

    const court = {
      id: 'court-1',
      winningTeam: 1,
      players: [
        { id: 'p1', name: 'Alice',   team: 1 },
        { id: 'p2', name: 'Bob',     team: 1 },
        { id: 'p3', name: 'Charlie', team: 2 },
        { id: 'p4', name: 'Dana',    team: 2 },
      ],
    };

    render(
      <EndGameModal
        court={court as any}
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        isPending={true}
      />
    );

    const submitBtn = screen.getByTestId('button-confirm-end-game');
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveTextContent('Saving...');

    const cancelBtn = screen.getByTestId('button-cancel-end-game');
    expect(cancelBtn).toBeDisabled();
  });

  it('enables the "Record Result" button when isPending=false', async () => {
    const { EndGameModal } = await import('../client/src/components/EndGameModal');

    const court = {
      id: 'court-1',
      winningTeam: 2,
      players: [
        { id: 'p1', name: 'Alice',   team: 1 },
        { id: 'p2', name: 'Bob',     team: 1 },
        { id: 'p3', name: 'Charlie', team: 2 },
        { id: 'p4', name: 'Dana',    team: 2 },
      ],
    };

    render(
      <EndGameModal
        court={court as any}
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    const submitBtn = screen.getByTestId('button-confirm-end-game');
    expect(submitBtn).not.toBeDisabled();
    expect(submitBtn).toHaveTextContent('Record Result');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — Route: returns 409 when completeGameTransaction throws
//           court_not_occupied (concurrent duplicate submission)
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/courts/:courtId/end-game — duplicate submission guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 409 when completeGameTransaction throws court_not_occupied', async () => {
    const { storage: storageImpl } = await import('../server/storage');
    const { registerRoutes }       = await import('../server/routes');

    type Handler = (req: unknown, res: unknown) => Promise<void> | void;
    let endGameHandler: Handler | undefined;
    // Proxy a *function* so that http.createServer(fakeApp) treats it as a
    // request listener (not an options object — which would fail on maxHeaderSize).
    const noop = (..._args: unknown[]): unknown => undefined;
    const fakeApp = new Proxy(noop as unknown as Record<string, unknown>, {
      get: (_t, prop) => {
        if (prop === 'post') {
          return (path: string, ...handlers: Handler[]) => {
            if (path === '/api/courts/:courtId/end-game') {
              endGameHandler = handlers[handlers.length - 1];
            }
          };
        }
        return noop;
      },
      apply: (_t, _this, _args) => undefined,
    });

    await registerRoutes(fakeApp as any);
    expect(endGameHandler, 'end-game route handler should be registered').toBeDefined();

    // Court is occupied — passes the early status guard inside the route
    vi.spyOn(storageImpl, 'getCourt').mockResolvedValue({
      id: 'court-x', status: 'occupied', sessionId: 'sess-1',
    } as any);

    vi.spyOn(storageImpl, 'getCourtPlayersWithTeams').mockResolvedValue([
      { courtId: 'court-x', playerId: 'p1', team: 1 },
      { courtId: 'court-x', playerId: 'p2', team: 1 },
      { courtId: 'court-x', playerId: 'p3', team: 2 },
      { courtId: 'court-x', playerId: 'p4', team: 2 },
    ] as any);

    vi.spyOn(storageImpl, 'getPlayer').mockImplementation(async (id) => ({
      id, name: id, team: 0, gamesPlayed: 0, wins: 0, skillScore: 50,
      level: 'intermediate', status: 'playing', lastPlayedAt: null,
      returnGamesRemaining: 0, tierCandidate: null, tierCandidateGames: 0, skid: 5,
    } as any));

    // Route calls storage.getSession when bodySessionId is provided
    vi.spyOn(storageImpl, 'getSession').mockResolvedValue({
      id: 'sess-1', isSandbox: false,
    } as any);

    // Simulate a second concurrent request: court is no longer occupied by
    // the time the tx tries to lock it → storage raises court_not_occupied
    const err = Object.assign(
      new Error('Court is no longer occupied — possible duplicate submission'),
      { code: 'court_not_occupied' },
    );
    vi.spyOn(storageImpl, 'completeGameTransaction').mockRejectedValue(err);

    const req = {
      params: { courtId: 'court-x' },
      body:   { winningTeam: 1, team1Score: 21, team2Score: 18, sessionId: 'sess-1' },
      user:   { userId: 'admin-1', email: 'admin@test.com', role: 'admin' },
    };

    let statusCode = 0;
    let responseBody: unknown;
    const res = {
      status(code: number) { statusCode = code; return this; },
      json(body: unknown)  { responseBody = body; return this; },
    };

    await endGameHandler!(req, res);

    expect(statusCode).toBe(409);
    expect((responseBody as any).error).toMatch(/no longer occupied/i);
  });
});
