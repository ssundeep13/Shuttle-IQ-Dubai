// Phase 1 — per-session cost foundation. ADDITIVE, IDEMPOTENT. CREATE-only (+ one
// idempotent seed). Never drops. Follows scripts/multitenancy-gate1-additive-migrate.mjs
// and scripts/refund-231-additive-migrate.mjs.
//
// Deliberately bypasses drizzle-kit push (live Neon has unrelated drift push would DROP).
//
// Creates : venues, session_runners, session_costs  (all IF NOT EXISTS — no DB-level FK
//           constraints, house style; integrity is app-level).
// Seeds   : session_runners with Shannon, Akhila, Arjun via INSERT ... ON CONFLICT (name)
//           DO NOTHING. This is the ONLY data write; everything else is CREATE-only.
// Adds to / drops from : NOTHING else. bookable_sessions and every existing table are
//           untouched. getFinanceSummary, the finance routes, and the finance tab are
//           untouched.
//
// Re-runnable: a second run makes ZERO changes (CREATE TABLE IF NOT EXISTS ·
//   INSERT ... ON CONFLICT DO NOTHING → 0 rows once seeded).
// Reversible: the three tables are brand-new and start (near-)empty — rollback is
//   DROP TABLE IF EXISTS session_costs;  DROP TABLE IF EXISTS session_runners;
//   DROP TABLE IF EXISTS venues;
//
// Run ONCE per environment (after approval), BEFORE any code path reads these tables:
//   node scripts/phase1-cost-foundation-migrate.mjs
//
// DDL / SESSION_RUNNER_NAMES / runMigration / verify are exported so an out-of-process
// validator (pglite) can run the EXACT same statements against a scratch DB without
// touching live.

import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// The initial controlled list of session runners (the captain dropdown). Seeded
// idempotently; admins add/edit more via the venue/runner UI later (gate c/d).
export const SESSION_RUNNER_NAMES = ['Shannon', 'Akhila', 'Arjun'];

export const DDL = [
  { label: 'create table venues', sql:
    `CREATE TABLE IF NOT EXISTS venues (
       id                       varchar   PRIMARY KEY,
       name                     text      NOT NULL UNIQUE,
       court_rate_fils_per_hour integer   NOT NULL DEFAULT 0,
       is_active                boolean   NOT NULL DEFAULT true,
       created_at               timestamp NOT NULL DEFAULT now(),
       updated_at               timestamp NOT NULL DEFAULT now()
     )` },
  { label: 'create table session_runners', sql:
    `CREATE TABLE IF NOT EXISTS session_runners (
       id         varchar   PRIMARY KEY,
       name       text      NOT NULL UNIQUE,
       is_active  boolean   NOT NULL DEFAULT true,
       created_at timestamp NOT NULL DEFAULT now(),
       updated_at timestamp NOT NULL DEFAULT now()
     )` },
  { label: 'create table session_costs', sql:
    `CREATE TABLE IF NOT EXISTS session_costs (
       id                    varchar   PRIMARY KEY,
       session_id            varchar   NOT NULL UNIQUE,
       court_cost_fils       integer   NOT NULL DEFAULT 0,
       shuttle_cost_fils     integer   NOT NULL DEFAULT 0,
       water_cost_fils       integer   NOT NULL DEFAULT 0,
       court_cost_overridden boolean   NOT NULL DEFAULT false,
       captain_id            varchar,
       captured_by           text,
       captured_at           timestamp NOT NULL DEFAULT now()
     )` },
];

// Runs every step on the given db handle (pg client OR a scratch driver exposing
// .query(text, params) -> {rows, rowCount}). Caller owns BEGIN/COMMIT.
// Returns { runnersInserted } so a validator can assert a re-run inserts 0.
export async function runMigration(db, log = console.log) {
  // Pre-flight: bookable_sessions is the logical anchor for session_costs.session_id.
  // Abort loudly if it's missing (live drift) before any write.
  const present = (await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'bookable_sessions'`)).rows;
  if (present.length === 0) {
    throw new Error('Pre-flight FAILED — bookable_sessions table not found. Aborting, no changes applied.');
  }

  // 1) new tables
  for (const s of DDL) { log('→', s.label); await db.query(s.sql); }

  // 2) idempotent seed of the runner list (the ONLY data write)
  log('→ seed session_runners (Shannon, Akhila, Arjun)');
  let runnersInserted = 0;
  for (const name of SESSION_RUNNER_NAMES) {
    const r = await db.query(
      `INSERT INTO session_runners (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [randomUUID(), name]);
    runnersInserted += r.rowCount ?? 0;
  }
  log(`    session_runners: ${runnersInserted} inserted (0 = all already present)`);

  return { runnersInserted };
}

// Read-only verification of the end state.
export async function verify(db) {
  const cols = (await db.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN ('venues','session_runners','session_costs')
     ORDER BY table_name, ordinal_position`)).rows;
  const tabs = (await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('venues','session_runners','session_costs')
     ORDER BY table_name`)).rows.map((r) => r.table_name);
  const runners = (await db.query(`SELECT name, is_active FROM session_runners ORDER BY name`)).rows;
  const counts = {
    venues: (await db.query(`SELECT count(*)::int AS n FROM venues`)).rows[0].n,
    session_runners: (await db.query(`SELECT count(*)::int AS n FROM session_runners`)).rows[0].n,
    session_costs: (await db.query(`SELECT count(*)::int AS n FROM session_costs`)).rows[0].n,
  };
  return { newTables: tabs, columns: cols, runners, counts };
}

// ── Self-execute only when run directly against the target DB. ──
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  const env = Object.fromEntries(
    fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
  const conn = env.DATABASE_URL;
  const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn); // mirror server/db.ts
  const { Pool } = pg;
  const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await runMigration(client);
    await client.query('COMMIT');
    console.log('\n✓ Phase 1 cost-foundation migration applied (atomic — one transaction).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed — ROLLED BACK, no changes applied:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
  console.log('\nVerification (post-commit):');
  console.dir(await verify(pool), { depth: null });
  await pool.end();
}
