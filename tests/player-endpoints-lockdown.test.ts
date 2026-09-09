// Gate 1 — lock down the unauthenticated player endpoints.
//
// GET /api/players and GET /api/players/search used to answer anyone with full
// player rows (email, phone, wallet balance, referral code, tier-candidate
// fields). The handlers now live in server/playerRoutes.ts so they can be
// mounted on a throwaway express app here behind the REAL auth middleware and
// hit over HTTP; the wiring inside registerRoutes is pinned at source.
// storage.searchPlayers stops matching on the email column (the shared path
// fed the player-facing search, which made it an email-existence oracle).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const storageMock = vi.hoisted(() => ({
  getAllPlayers: vi.fn(),
  searchPlayers: vi.fn(),
}));
vi.mock('../server/storage', () => ({ storage: storageMock }));

const { playerListHandler, playerSearchHandler, publicPlayerSearchResult, PUBLIC_PLAYER_SEARCH_KEYS } = await import('../server/playerRoutes');
const { requireAuth, requireAdmin, requireCaptain } = await import('../server/auth/middleware');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const token = (role: string) => jwt.sign({ userId: 'u1', email: 'u@example.com', role }, 'test-main-secret', { expiresIn: '1h' });

const FULL_ROW = {
  id: 'p1', shuttleIqId: 'SIQ-00001', name: 'Alpha Tester', email: 'alpha@example.com', phone: '+971500000000',
  gender: 'Male', level: 'Beginner', skillScore: 55, gamesPlayed: 3, wins: 1, status: 'waiting',
  walletBalance: 1500, referralCode: 'SIQ-ALPHA-00001', tierCandidate: null,
};

describe('GET /api/players + /api/players/search — over HTTP through the real middleware', () => {
  let server: Server; let base = '';
  beforeAll(async () => {
    const app = express();
    app.get('/api/players', requireAuth, requireCaptain, playerListHandler);
    app.get('/api/players/search', requireAuth, requireAdmin, playerSearchHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
    storageMock.getAllPlayers.mockResolvedValue([FULL_ROW]);
    storageMock.searchPlayers.mockResolvedValue([FULL_ROW]);
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  const get = (path: string, role?: string) =>
    fetch(base + path, { headers: role ? { Authorization: `Bearer ${token(role)}` } : {} });

  it('unauthenticated GET /api/players → 401 and no rows', async () => {
    const r = await get('/api/players');
    expect(r.status).toBe(401);
    expect(JSON.stringify(await r.json())).not.toContain('alpha@example.com');
    expect(storageMock.getAllPlayers).not.toHaveBeenCalled();
  });

  it('unauthenticated GET /api/players/search?q=a → 401', async () => {
    const r = await get('/api/players/search?q=a');
    expect(r.status).toBe(401);
    expect(storageMock.searchPlayers).not.toHaveBeenCalled();
  });

  it('a player-role token → 403 on both', async () => {
    expect((await get('/api/players', 'marketplace_player')).status).toBe(403);
    expect((await get('/api/players/search?q=a', 'marketplace_player')).status).toBe(403);
    expect(storageMock.getAllPlayers).not.toHaveBeenCalled();
    expect(storageMock.searchPlayers).not.toHaveBeenCalled();
  });

  it('captain token → 200 on the list (the live-session screen needs it); search stays admin-only → 403', async () => {
    const r = await get('/api/players', 'captain');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([FULL_ROW]);
    expect((await get('/api/players/search?q=a', 'captain')).status).toBe(403);
  });

  it('admin token → 200 with player rows on both', async () => {
    const list = await get('/api/players', 'admin');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([FULL_ROW]);
    const search = await get('/api/players/search?q=alp', 'admin');
    expect(search.status).toBe(200);
    expect(await search.json()).toEqual([FULL_ROW]);
    expect(storageMock.searchPlayers).toHaveBeenCalledWith('alp');
  });

  it('admin search with an empty query answers [] without touching storage', async () => {
    storageMock.searchPlayers.mockClear();
    const r = await get('/api/players/search', 'admin');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
    expect(storageMock.searchPlayers).not.toHaveBeenCalled();
  });
});

describe('registerRoutes wiring — pinned at source', () => {
  const routes = read('server/routes.ts');
  it('the two endpoints are registered behind requireAuth + role guard and delegate to the handlers', () => {
    expect(routes).toMatch(/app\.get\("\/api\/players", requireAuth, requireCaptain, playerListHandler\);/);
    expect(routes).toMatch(/app\.get\("\/api\/players\/search", requireAuth, requireAdmin, playerSearchHandler\);/);
    expect(routes).toMatch(/import \{ playerListHandler, playerSearchHandler, publicPlayerListHandler \} from "\.\/playerRoutes";/);
  });
  it('no inline unauthenticated variant survives', () => {
    expect(routes).not.toMatch(/app\.get\("\/api\/players", async/);
    expect(routes).not.toMatch(/app\.get\("\/api\/players\/search", async/);
  });
});

describe('storage.searchPlayers — no email matching on the shared path', () => {
  it("searchPlayers('someone@example.com') cannot return a player whose only match is the email column: the WHERE references name and shuttle_iq_id only", async () => {
    vi.resetModules();
    let captured: any = null;
    vi.doMock('../server/db', () => ({
      db: {
        select: () => ({ from: () => ({ where: (q: any) => { captured = q; return { orderBy: async () => [] }; } }) }),
      },
    }));
    vi.doUnmock('../server/storage');
    const { storage } = await import('../server/storage');
    const rows = await storage.searchPlayers('someone@example.com');
    expect(rows).toEqual([]);
    expect(captured).not.toBeNull();
    // Flatten drizzle's sql chunks: StringChunk → text, Column → its DB name, primitives → params.
    let text = ''; const params: unknown[] = [];
    const walk = (chunks: any[]) => {
      for (const c of chunks) {
        if (c && Array.isArray(c.value) && typeof c.value[0] === 'string') text += c.value.join('');
        else if (typeof c === 'string' || typeof c === 'number') { params.push(c); text += '?'; }
        else if (c && Array.isArray(c.queryChunks)) walk(c.queryChunks);
        else if (c && typeof c === 'object' && 'name' in c && 'table' in c) text += `<${c.name}>`;
        else if (c && typeof c === 'object' && 'value' in c) { params.push(c.value); text += '?'; }
      }
    };
    walk(captured.queryChunks);
    expect(text).toContain('<name>');
    expect(text).toContain('<shuttle_iq_id>');
    expect(text).not.toContain('<email>');
    expect(text).not.toContain('<phone>');
    expect(params).toEqual(['%someone@example.com%', '%SOMEONE@EXAMPLE.COM%']);
  });

  it('admin contact search keeps its own email/phone branch (separate method, admin-only route)', () => {
    const s = read('server/storage.ts');
    const adminFn = s.slice(s.indexOf('async searchPlayersWithContact('), s.indexOf('async createPlayer('));
    expect(adminFn).toMatch(/players\.email/);
    const shared = s.slice(s.indexOf('async searchPlayers('), s.indexOf('async searchPlayersWithContact('));
    expect(shared).not.toMatch(/players\.email|players\.phone/);
    const mp = read('server/marketplace-routes.ts');
    expect(mp).toMatch(/app\.get\("\/api\/marketplace\/admin\/search-players", requireAuth, requireAdmin,[\s\S]*?searchPlayersWithContact\(/);
  });
});

describe('GET /api/marketplace/search-players — response shape', () => {
  it('publicPlayerSearchResult returns exactly {id, name, shuttleIqId, level, skillScore} and strips everything else', () => {
    const out = publicPlayerSearchResult(FULL_ROW as any);
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_PLAYER_SEARCH_KEYS].sort());
    expect(out).toEqual({ id: 'p1', name: 'Alpha Tester', shuttleIqId: 'SIQ-00001', level: 'Beginner', skillScore: 55 });
    expect(JSON.stringify(out)).not.toMatch(/example\.com|\+971|walletBalance|referralCode|tierCandidate/);
  });
  it('the marketplace search-players handler maps through publicPlayerSearchResult (still requireAuth + requireMarketplaceAuth, 2-char minimum, 10 max)', () => {
    const mp = read('server/marketplace-routes.ts');
    const h = mp.slice(mp.indexOf('app.get("/api/marketplace/search-players"'), mp.indexOf('// Unified guest search'));
    expect(h).toMatch(/requireAuth, requireMarketplaceAuth/);
    expect(h).toMatch(/query\.length < 2/);
    expect(h).toMatch(/\.slice\(0, 10\)\.map\(publicPlayerSearchResult\)/);
    expect(h).not.toMatch(/email|phone|walletBalance/);
    expect(mp).toMatch(/import \{ publicPlayerSearchResult \} from "\.\/playerRoutes";/);
  });
});

// ── Option A: the public projection Rankings reads instead of the full rows ──
const { publicPlayerListHandler, publicPlayer, PUBLIC_PLAYER_KEYS } = await import('../server/playerRoutes');

describe('GET /api/players/public — safe projection, no auth', () => {
  let server: Server; let base = '';
  beforeAll(async () => {
    const app = express();
    app.get('/api/players/public', publicPlayerListHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    storageMock.getAllPlayers.mockResolvedValue([FULL_ROW, { ...FULL_ROW, id: 'p2', name: 'Beta', shuttleIqId: null, email: 'beta@example.com' }]);
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('no token → 200, every row has exactly {id, name, shuttleIqId, level, skillScore, gamesPlayed, wins}', async () => {
    const r = await fetch(base + '/api/players/public');
    expect(r.status).toBe(200);
    const rows = await r.json();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual([...PUBLIC_PLAYER_KEYS].sort());
    expect(rows[0]).toEqual({ id: 'p1', name: 'Alpha Tester', shuttleIqId: 'SIQ-00001', level: 'Beginner', skillScore: 55, gamesPlayed: 3, wins: 1 });
    expect(rows[1].shuttleIqId).toBeNull();
    expect(JSON.stringify(rows)).not.toMatch(/example\.com|\+971|walletBalance|referralCode|tierCandidate|status/);
  });

  it('publicPlayer strips everything but the seven keys', () => {
    expect(PUBLIC_PLAYER_KEYS).toEqual(['id', 'name', 'shuttleIqId', 'level', 'skillScore', 'gamesPlayed', 'wins']);
    const out = publicPlayer(FULL_ROW as any);
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_PLAYER_KEYS].sort());
  });
});

describe('Rankings repoint + route order — pinned at source', () => {
  it('routes.ts registers /api/players/public with NO auth middleware, and BEFORE /api/players/:id so ":id" cannot swallow "public"', () => {
    const routes = read('server/routes.ts');
    expect(routes).toMatch(/app\.get\("\/api\/players\/public", publicPlayerListHandler\);/);
    expect(routes.indexOf('app.get("/api/players/public"')).toBeLessThan(routes.indexOf('app.get("/api/players/:id"'));
    expect(routes).toMatch(/import \{ playerListHandler, playerSearchHandler, publicPlayerListHandler \} from "\.\/playerRoutes";/);
  });
  it('Rankings reads the public projection; nothing else in the marketplace app still reads the full list', () => {
    const r = read('client/src/pages/marketplace/Rankings.tsx');
    expect(r).toMatch(/queryKey: \['\/api\/players\/public'\]/);
    expect(r).not.toMatch(/queryKey: \['\/api\/players'\]/);
    // the only change is the key: the all-time query keeps its name, enabled rule and generic
    expect(r).toMatch(/const \{ data: allTimePlayers, isLoading: loadingAllTime, isError: errorAllTime, refetch: refetchAllTime \} = useQuery<Player\[\]>\(\{\s*queryKey: \['\/api\/players\/public'\],\s*enabled: !isMostImproved && timeFilter === 'all-time',/);
  });
});
