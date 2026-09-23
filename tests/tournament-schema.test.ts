// Tournament Gate 1 — the Drizzle mirrors must match the one-shot DDL column
// for column (name, type, NOT NULL) and index for index; the seed script's
// instants must be the Dubai wall-clock times Sandeep signed off; the
// TOURNAMENT_ENABLED flag is off by default; the config read answers the same
// JSON 404 as an unknown /api path while the flag is off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { tournaments, tournamentRegistrations, payments } = await import('../shared/schema');
const { isTournamentEnabled } = await import('../server/tournament/flag');
const { tournamentConfigHandler } = await import('../server/tournament/routes');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r/g, '');
const MIGRATION = 'scripts/one-shot/2026-09-23-tournament-v1.mts';
const SEED = 'scripts/one-shot/2026-09-23-tournament-seed-premier-league.mts';

type Col = { type: string; notNull: boolean };

/** Columns declared inside `CREATE TABLE "<table>" ( … )` in the one-shot source. */
function ddlColumns(src: string, table: string): Map<string, Col & { def: string | null }> {
  const start = src.indexOf(`CREATE TABLE "${table}" (`);
  expect(start, `CREATE TABLE "${table}"`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf(')`', start));
  const out = new Map<string, Col & { def: string | null }>();
  for (const raw of body.split('\n').slice(1)) {
    const m = raw.trim().match(/^"([a-z_]+)" (varchar|text|integer|boolean|jsonb|timestamp with time zone)(.*?),?$/);
    if (m) out.set(m[1], { type: m[2], notNull: /NOT NULL/.test(m[3]), def: (m[3].match(/DEFAULT (\S+)/) || [])[1] ?? null });
  }
  return out;
}

function drizzleColumns(t: any): Map<string, Col> {
  const out = new Map<string, Col>();
  for (const c of Object.values(getTableColumns(t)) as any[]) out.set(c.name, { type: c.getSQLType(), notNull: c.notNull });
  return out;
}

function ddlIndexes(src: string, table: string) {
  const re = new RegExp(`CREATE (UNIQUE )?INDEX "([a-z_]+)" ON "${table}" \\(([^)]*)\\)( WHERE [^\`]+)?\``, 'g');
  return [...src.matchAll(re)].map((m) => ({ name: m[2], unique: !!m[1], partial: !!m[4] })).sort((a, b) => a.name.localeCompare(b.name));
}

function drizzleIndexes(t: any) {
  return getTableConfig(t).indexes
    .map((i: any) => ({ name: i.config.name as string, unique: !!i.config.unique, partial: !!i.config.where }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
}

describe('Drizzle mirrors == one-shot DDL (scripts/one-shot/2026-09-23-tournament-v1.mts)', () => {
  const src = read(MIGRATION);

  for (const [table, t] of [['tournaments', tournaments], ['tournament_registrations', tournamentRegistrations]] as const) {
    it(`${table}: same columns, same types, same NOT NULL`, () => {
      const ddl = ddlColumns(src, table);
      const drz = drizzleColumns(t);
      expect([...drz.keys()].sort()).toEqual([...ddl.keys()].sort());
      for (const [name, col] of ddl) {
        expect(drz.get(name), `${table}.${name}`).toEqual({ type: col.type, notNull: col.notNull });
      }
    });

    it(`${table}: same indexes (name, unique, partial)`, () => {
      expect(drizzleIndexes(t)).toEqual(ddlIndexes(src, table));
    });
  }

  it('tournaments carries both open instants, the exclusive deadlines and the four notification stamps', () => {
    const ddl = ddlColumns(src, 'tournaments');
    expect(ddl.get('registration_opens_at_members')).toMatchObject({ type: 'timestamp with time zone', notNull: false });
    for (const c of ['registration_opens_at', 'registration_closes_at', 'withdraw_deadline_at', 'draft_cutoff_at', 'starts_at', 'ends_at']) {
      expect(ddl.get(c), c).toMatchObject({ type: 'timestamp with time zone', notNull: true });
    }
    for (const c of ['members_open_notified_at', 'open_notified_at', 'three_days_notified_at', 'one_day_notified_at']) {
      expect(ddl.get(c), c).toMatchObject({ type: 'timestamp with time zone', notNull: false });
    }
    expect(ddl.get('status')?.def).toBe("'draft'");
    expect(ddl.get('waitlist_cap_per_tier')?.def).toBe('2');
    expect(ddl.get('hold_minutes')?.def).toBe('1440');
    const c = getTableColumns(tournaments) as any;
    expect(c.status.default).toBe('draft');
    expect(c.waitlistCapPerTier.default).toBe(2);
    expect(c.holdMinutes.default).toBe(1440);
  });

  it('tournament_registrations freezes the tier and the level, and money is whole AED', () => {
    const ddl = ddlColumns(src, 'tournament_registrations');
    for (const c of ['tier', 'level_at_registration', 'skill_score_at_registration', 'player_id', 'amount_aed', 't_shirt_size']) {
      expect(ddl.get(c)?.notNull, c).toBe(true);
    }
    expect(ddl.get('hold_expires_at')?.notNull).toBe(false); // NULL while waitlisted
    expect(ddl.get('status')?.def).toBe("'pending_payment'");
    const c = getTableColumns(tournamentRegistrations) as any;
    expect(c.status.default).toBe('pending_payment');
    expect(c.shareWithSponsors.default).toBe(false);
    expect(c.sponsorInterest.default).toBe(false);
  });

  it('one active registration per account AND per player, one row per Ziina intent', () => {
    const active = "WHERE status IN ('pending_payment', 'confirmed', 'waitlisted')";
    expect(src).toContain(`CREATE UNIQUE INDEX "uq_tournament_regs_active" ON "tournament_registrations" ("tournament_id", "user_id") ${active}`);
    expect(src).toContain(`CREATE UNIQUE INDEX "uq_tournament_regs_active_player" ON "tournament_registrations" ("tournament_id", "player_id") ${active}`);
    expect(src).toContain('CREATE UNIQUE INDEX "uq_tournament_regs_intent" ON "tournament_registrations" ("ziina_payment_intent_id") WHERE ziina_payment_intent_id IS NOT NULL');
  });

  it('payments gains a nullable tournament_registration_id (Q2), declared in Drizzle', () => {
    expect(src.split('ALTER TABLE "payments" ADD COLUMN "tournament_registration_id" varchar;').length - 1).toBe(1);
    expect(src.split('CREATE INDEX "idx_payments_tournament_reg" ON "payments" ("tournament_registration_id") WHERE tournament_registration_id IS NOT NULL').length - 1).toBe(1);
    const p = getTableColumns(payments) as any;
    expect(p.tournamentRegistrationId?.name).toBe('tournament_registration_id');
    expect(p.tournamentRegistrationId.notNull).toBe(false);
    expect(drizzleIndexes(payments).map((i: { name: string }) => i.name)).toContain('idx_payments_tournament_reg');
  });
});

describe('one-shot migration script — guards', () => {
  const src = read(MIGRATION);
  const code = src.replace(/\/\/.*$/gm, '');

  it('registers under tournament_v1, supports --dry-run and --rehearse, never calls the schema-push tool', () => {
    expect(src).toContain("const KEY = 'tournament_v1';");
    expect(src).toContain("process.argv.includes('--dry-run')");
    expect(src).toContain("process.argv.includes('--rehearse')");
    expect(src).toContain("INSERT INTO system_one_shot_migrations (key) VALUES ($1)");
    expect(/drizzle-kit\s+push|db:push/.test(code)).toBe(false);
  });

  it('is additive only: no DROP / DELETE / UPDATE / TRUNCATE anywhere in the code', () => {
    expect(/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/.test(code)).toBe(false);
  });

  it('one transaction with a lock timeout; the rehearsal rolls back; objects without a registry row abort (exit 2)', () => {
    expect(src).toContain("SET LOCAL lock_timeout = '5s'");
    expect(code.indexOf("await client.query('ROLLBACK')")).toBeGreaterThan(code.indexOf('if (REHEARSE)'));
    expect(src).toContain('ABORT');
    expect(src).toContain('process.exit(2)');
  });
});

describe('seed script — the Premier League row Sandeep signed off (2026-09-23)', () => {
  const src = read(SEED);
  const literal = (key: string) => {
    const m = src.match(new RegExp(`\\b${key}: ('[^']*'|\\d+)`));
    expect(m, key).not.toBeNull();
    return m![1].replace(/'/g, '');
  };
  const dubai = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

  it('registers under its own key and inserts exactly one row', () => {
    expect(src).toContain("const KEY = 'tournament_seed_premier_league_2026';");
    expect(src).toContain("process.argv.includes('--dry-run')");
    expect(src).toContain('ins.rowCount !== 1');
    expect(src).toContain('ABORT');
  });

  it('every instant is UTC and lands on the agreed Dubai wall-clock time', () => {
    expect(literal('starts_at')).toBe('2026-10-17T14:00:00Z');
    expect(dubai(literal('starts_at'))).toBe('Sat 17 Oct, 18:00');
    expect(literal('ends_at')).toBe('2026-10-17T18:00:00Z');
    expect(dubai(literal('ends_at'))).toBe('Sat 17 Oct, 22:00');
    expect(literal('registration_opens_at_members')).toBe('2026-09-25T08:00:00Z');
    expect(dubai(literal('registration_opens_at_members'))).toBe('Fri 25 Sept, 12:00');
    expect(literal('registration_opens_at')).toBe('2026-09-25T14:00:00Z');
    expect(dubai(literal('registration_opens_at'))).toBe('Fri 25 Sept, 18:00');
    // exclusive instants: the last registrable moment is 23:59:59 Thu 8 Oct / Sat 10 Oct Dubai
    expect(literal('registration_closes_at')).toBe('2026-10-08T20:00:00Z');
    expect(literal('withdraw_deadline_at')).toBe('2026-10-08T20:00:00Z');
    expect(literal('draft_cutoff_at')).toBe('2026-10-10T20:00:00Z');
    expect(dubai('2026-10-08T19:59:59Z')).toBe('Thu 8 Oct, 23:59');
    expect(dubai('2026-10-10T19:59:59Z')).toBe('Sat 10 Oct, 23:59');
  });

  it('venue is Baseline DIP (venues 99dddcef), fee AED 100, caps 6/18/18/6 + 2 waitlist, 24 h hold', () => {
    expect(literal('venue_name')).toBe('BASELINE SPORTS ACADEMY DIP');
    expect(literal('venue_location')).toBe('Dubai Investment Park Second - Dubai');
    expect(literal('venue_map_url')).toBe('https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9');
    expect(src).not.toMatch(/Fire Rallies/);
    expect(literal('entry_fee_aed')).toBe('100');
    expect(src).toContain('tier_caps: { Professional: 6, Competitive: 18, Intermediate: 18, Beginner: 6 }');
    expect(literal('waitlist_cap_per_tier')).toBe('2');
    expect(literal('hold_minutes')).toBe('1440');
    expect(literal('slug')).toBe('premier-league-2026');
    expect(literal('status')).toBe('published');
  });
});

describe('TOURNAMENT_ENABLED flag', () => {
  const prev = process.env.TOURNAMENT_ENABLED;
  afterAll(() => { if (prev === undefined) delete process.env.TOURNAMENT_ENABLED; else process.env.TOURNAMENT_ENABLED = prev; });

  it("is on only for the exact string 'true' (default off)", () => {
    delete process.env.TOURNAMENT_ENABLED; expect(isTournamentEnabled()).toBe(false);
    process.env.TOURNAMENT_ENABLED = ''; expect(isTournamentEnabled()).toBe(false);
    process.env.TOURNAMENT_ENABLED = '1'; expect(isTournamentEnabled()).toBe(false);
    process.env.TOURNAMENT_ENABLED = 'TRUE'; expect(isTournamentEnabled()).toBe(false);
    process.env.TOURNAMENT_ENABLED = 'true'; expect(isTournamentEnabled()).toBe(true);
  });
});

describe('GET /api/marketplace/tournament/config — over HTTP', () => {
  let server: Server; let base = '';
  const prev = process.env.TOURNAMENT_ENABLED;
  beforeAll(async () => {
    const app = express();
    app.get('/api/marketplace/tournament/config', tournamentConfigHandler);
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    const addr = server.address() as { port: number }; base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    if (prev === undefined) delete process.env.TOURNAMENT_ENABLED; else process.env.TOURNAMENT_ENABLED = prev;
  });

  it('flag off → the same JSON 404 an unknown /api path returns', async () => {
    delete process.env.TOURNAMENT_ENABLED;
    const res = await fetch(`${base}/api/marketplace/tournament/config`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('flag on → 200 { tournamentEnabled: true }, no-store', async () => {
    process.env.TOURNAMENT_ENABLED = 'true';
    const res = await fetch(`${base}/api/marketplace/tournament/config`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournamentEnabled: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('is its own route, mounted after the IQ Pass router — the IQ Pass config read is untouched (tripwire)', () => {
    const routes = read('server/marketplace-routes.ts');
    expect(routes).toMatch(/import \{ tournamentConfigHandler \} from "\.\/tournament\/routes";/);
    const mount = routes.indexOf('app.get("/api/marketplace/tournament/config", tournamentConfigHandler);');
    expect(mount).toBeGreaterThan(routes.indexOf('app.use(createIqPassRouter({'));
    expect(routes.split('tournamentConfigHandler').length - 1).toBe(2); // the import and the mount, nothing else
    expect(read('server/iqPass/routes.ts')).not.toMatch(/tournament/i);
  });

  it('the IQ Pass index.ts JSON 404 body is the one the handler mirrors', () => {
    expect(read('server/index.ts')).toContain('{ error: "Not found" }');
  });
});
