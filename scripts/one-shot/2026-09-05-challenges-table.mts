// One-shot migration: create the `challenges` table (Player Challenges, C1).
//
//   DATABASE_URL=<railway url> npx tsx scripts/one-shot/2026-09-05-challenges-table.mts
//
// WHY NOT drizzle-kit push: against this PostgreSQL 18 database, drizzle-kit
// 0.31.4 plans 327 statements on EXISTING tables (310 named NOT NULL drops,
// the wallet-floor CHECK, the queue/suggestion uniqueness indexes) alongside
// the one CREATE TABLE we want. See docs/challenges-build-report.md. This
// script runs exactly the five statements drizzle generated for the new
// table — nothing else — and records itself in system_one_shot_migrations so
// a re-run is a no-op.
import { pool } from '../../server/db';

const KEY = 'challenges_table_v1';

// Verbatim from `drizzle-kit push --strict --verbose` on 2026-09-05.
const STATEMENTS = [
  `CREATE TABLE "challenges" (
	"id" varchar PRIMARY KEY NOT NULL,
	"challenger_player_id" varchar NOT NULL,
	"challenged_player_id" varchar NOT NULL,
	"pair_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"game_result_id" varchar,
	"winner_player_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"settled_at" timestamp with time zone
)`,
  `CREATE INDEX "idx_challenges_challenger_status" ON "challenges" USING btree ("challenger_player_id","status")`,
  `CREATE INDEX "idx_challenges_challenged_status" ON "challenges" USING btree ("challenged_player_id","status")`,
  `CREATE INDEX "idx_challenges_pair_status" ON "challenges" USING btree ("pair_key","status")`,
  `CREATE UNIQUE INDEX "uq_challenges_open_pair" ON "challenges" USING btree ("pair_key") WHERE status IN ('pending', 'accepted')`,
];

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const done = await client.query('SELECT ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran at ${done.rows[0].ran_at}`);
    await client.query('ROLLBACK');
  } else {
    for (const s of STATEMENTS) {
      await client.query(s);
      console.log('ran:', s.split('\n')[0].slice(0, 90));
    }
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    await client.query('COMMIT');
    console.log(`COMMITTED — ${KEY}`);
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('ROLLED BACK —', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  client.release();
}

// ── Verification (read-only) ─────────────────────────────────────────────────
const exists = (await pool.query(`SELECT to_regclass('public.challenges') AS t`)).rows[0].t;
const count = exists ? (await pool.query('SELECT count(*)::int AS n FROM challenges')).rows[0].n : null;
const indexes = (await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'challenges' ORDER BY indexname`)).rows.map((r: { indexname: string }) => r.indexname);
const recorded = (await pool.query('SELECT key, ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY])).rows[0];
console.log('VERIFY table:', exists, '| rows:', count, '| indexes:', indexes.join(', '), '| migration row:', recorded ? `${recorded.key} @ ${recorded.ran_at.toISOString()}` : 'MISSING');
await pool.end();
process.exit(exists && count === 0 && indexes.length === 5 && recorded ? 0 : 2);
