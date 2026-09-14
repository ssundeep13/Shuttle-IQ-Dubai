// IQ Pass Gate 1 — schema mirrors, the one-shot migration, the env flag and
// the public config read. The config handler is mounted on a throwaway
// express app and hit over HTTP; its wiring inside registerMarketplaceRoutes
// is pinned at source. Flag off ⇒ 404 (no new 200 route while off).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import { getTableColumns } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET = 'test-main-secret';          // routes.ts pulls in the auth middleware
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { packs, jobRuns, bookings, payments } = await import('../shared/schema');
const { isIqPassEnabled } = await import('../server/iqPass/flag');
const { iqPassConfigHandler } = await import('../server/iqPass/routes');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const cols = (t: any) => Object.keys(getTableColumns(t)).sort();

describe('Drizzle mirrors (must match the one-shot DDL)', () => {
  it('packs has exactly the planned columns', () => {
    expect(cols(packs)).toEqual([
      'cancellationReason', 'cancelledAt', 'createdAt', 'followupEmailSentAt', 'gamesTotal', 'holdExpiresAt', 'id',
      'jerseyHandedOverAt', 'jerseySize', 'paidAt', 'priceAed', 'renewalEmailSentAt', 'repickCredits', 'status', 'tier',
      'userId', 'windowEnd', 'windowStart', 'ziinaPaymentIntentId',
    ]);
    const c = getTableColumns(packs) as any;
    expect(c.status.default).toBe('pending_payment');
    expect(c.repickCredits.default).toBe(0);
    expect(c.windowStart.dataType).toBe('string'); // 'YYYY-MM-DD' text, like session_series.origin_date
    expect(c.holdExpiresAt.notNull).toBe(true);
  });

  it('job_runs has exactly the planned columns', () => {
    expect(cols(jobRuns)).toEqual(['details', 'error', 'finishedAt', 'id', 'jobName', 'startedAt', 'status']);
    expect((getTableColumns(jobRuns) as any).status.default).toBe('running');
  });

  it('bookings gains nullable pack_id + moved_from_booking_id; payments gains pack_id and booking_id becomes nullable (E1a)', () => {
    const b = getTableColumns(bookings) as any;
    expect(b.packId?.name).toBe('pack_id');
    expect(b.packId.notNull).toBe(false);
    expect(b.movedFromBookingId?.name).toBe('moved_from_booking_id');
    expect(b.movedFromBookingId.notNull).toBe(false);
    const p = getTableColumns(payments) as any;
    expect(p.packId?.name).toBe('pack_id');
    expect(p.packId.notNull).toBe(false);
    expect(p.bookingId.notNull).toBe(false);
  });
});

describe('one-shot migration script (scripts/one-shot/2026-09-15-iq-pass-v1.mts)', () => {
  const src = read('scripts/one-shot/2026-09-15-iq-pass-v1.mts');
  const once = (needle: string) => expect(src.split(needle).length - 1, needle).toBe(1);

  it('registers under the iq_pass_v1 key, supports --dry-run, never calls the schema-push tool', () => {
    expect(src.includes("const KEY = 'iq_pass_v1';")).toBe(true);
    expect(src.includes("process.argv.includes('--dry-run')")).toBe(true);
    expect(src.includes('system_one_shot_migrations')).toBe(true);
    expect(/drizzle-kit\s+push/.test(src.replace(/\/\/.*$/gm, ''))).toBe(false);
  });

  it('contains each DDL statement exactly once, additive first, the E1 relaxation last', () => {
    once('CREATE TABLE "packs" (');
    once('CREATE TABLE "job_runs" (');
    once('CREATE INDEX "idx_packs_user_status" ON "packs" ("user_id", "status")');
    once('CREATE UNIQUE INDEX "uq_packs_intent" ON "packs" ("ziina_payment_intent_id") WHERE ziina_payment_intent_id IS NOT NULL');
    once('CREATE UNIQUE INDEX "uq_packs_one_hold" ON "packs" ("user_id") WHERE status = \'pending_payment\'');
    once('CREATE INDEX "idx_job_runs_name_started" ON "job_runs" ("job_name", "started_at")');
    once('ALTER TABLE "bookings" ADD COLUMN "pack_id" varchar;');
    once('ALTER TABLE "bookings" ADD COLUMN "moved_from_booking_id" varchar;');
    once('CREATE INDEX "idx_bookings_pack" ON "bookings" ("pack_id") WHERE pack_id IS NOT NULL');
    once('ALTER TABLE "payments" ADD COLUMN "pack_id" varchar;');
    once('ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;');
    expect(src.indexOf('ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;')).toBeGreaterThan(src.indexOf('ALTER TABLE "payments" ADD COLUMN "pack_id" varchar;'));
  });

  it('refuses to run when packs already exists without a registry row (same guard as the admin_note one-shot)', () => {
    expect(src.includes("table_name = 'packs'")).toBe(true);
    expect(src.includes('ABORT')).toBe(true);
  });
});

describe('IQ_PASS_ENABLED flag', () => {
  const prev = process.env.IQ_PASS_ENABLED;
  afterAll(() => { if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it("is on only for the exact string 'true' (default off)", () => {
    delete process.env.IQ_PASS_ENABLED; expect(isIqPassEnabled()).toBe(false);
    process.env.IQ_PASS_ENABLED = '1'; expect(isIqPassEnabled()).toBe(false);
    process.env.IQ_PASS_ENABLED = 'TRUE'; expect(isIqPassEnabled()).toBe(false);
    process.env.IQ_PASS_ENABLED = 'true'; expect(isIqPassEnabled()).toBe(true);
  });
});

describe('GET /api/marketplace/config — over HTTP', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  beforeAll(async () => {
    const app = express();
    app.get('/api/marketplace/config', iqPassConfigHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    const addr = server.address() as { port: number }; base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it('flag off → 404 (the route table looks exactly like today)', async () => {
    delete process.env.IQ_PASS_ENABLED;
    const res = await fetch(`${base}/api/marketplace/config`);
    expect(res.status).toBe(404);
  });

  it('flag on → 200 { iqPassEnabled: true }, no-store', async () => {
    process.env.IQ_PASS_ENABLED = 'true';
    const res = await fetch(`${base}/api/marketplace/config`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ iqPassEnabled: true }); // Gate 12: the body also carries the public tier table
    expect(body.iqPassTiers.map((t: { tier: string }) => t.tier)).toEqual(["club", "club_plus", "club_elite"]);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('is wired in registerMarketplaceRoutes through the handler module (tripwire)', () => {
    const routes = read('server/marketplace-routes.ts');
    expect(routes).toMatch(/import \{ iqPassConfigHandler(?:, createIqPassRouter)? \} from "\.\/iqPass\/routes";/);
    expect(routes).toMatch(/app\.get\("\/api\/marketplace\/config", iqPassConfigHandler\);/);
  });
});
