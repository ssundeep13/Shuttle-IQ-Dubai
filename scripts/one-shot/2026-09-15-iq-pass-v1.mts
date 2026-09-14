// One-shot migration: IQ Pass v1 schema (Gate 1).
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-15-iq-pass-v1.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-15-iq-pass-v1.mts
//
// WHY NOT the drizzle-kit schema-push tool: against this PostgreSQL 18 database
// it plans hundreds of destructive statements on existing tables (see
// docs/challenges-build-report.md); `npm run db:push` is guarded. This script
// runs exactly the statements below — all additive except the LAST one, which
// relaxes payments.booking_id to nullable (ruling E1a: the single pack payment
// row carries pack_id and no booking_id) — and records itself in
// system_one_shot_migrations so a re-run is a no-op.
//
// ORDER OF OPERATIONS: run this BEFORE deploying the code that adds the new
// Drizzle columns — every select().from(bookings|payments) selects them.
import { pool } from '../../server/db';

const KEY = 'iq_pass_v1';
const DRY_RUN = process.argv.includes('--dry-run');

const STATEMENTS = [
  `CREATE TABLE "packs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"tier" text NOT NULL,
	"games_total" integer NOT NULL,
	"price_aed" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"ziina_payment_intent_id" text,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"hold_expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"repick_credits" integer DEFAULT 0 NOT NULL,
	"jersey_size" text,
	"jersey_handed_over_at" timestamp with time zone,
	"renewal_email_sent_at" timestamp with time zone,
	"followup_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX "idx_packs_user_status" ON "packs" ("user_id", "status")`,
  `CREATE UNIQUE INDEX "uq_packs_intent" ON "packs" ("ziina_payment_intent_id") WHERE ziina_payment_intent_id IS NOT NULL`,
  `CREATE UNIQUE INDEX "uq_packs_one_hold" ON "packs" ("user_id") WHERE status = 'pending_payment'`,
  `CREATE TABLE "job_runs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"details" jsonb,
	"error" text
)`,
  `CREATE INDEX "idx_job_runs_name_started" ON "job_runs" ("job_name", "started_at")`,
  `ALTER TABLE "bookings" ADD COLUMN "pack_id" varchar;`,
  `ALTER TABLE "bookings" ADD COLUMN "moved_from_booking_id" varchar;`,
  `CREATE INDEX "idx_bookings_pack" ON "bookings" ("pack_id") WHERE pack_id IS NOT NULL`,
  `ALTER TABLE "payments" ADD COLUMN "pack_id" varchar;`,
  // NOT additive (ruling E1a, pre-approved): constraint relaxation only, no data change.
  `ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;`,
];

const client = await pool.connect();
try {
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const packsTable = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'packs'`);
  const jobRunsTable = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_runs'`);
  const cols = await client.query(
    `SELECT table_name, column_name, is_nullable FROM information_schema.columns
     WHERE (table_name = 'bookings' AND column_name IN ('pack_id', 'moved_from_booking_id'))
        OR (table_name = 'payments' AND column_name IN ('pack_id', 'booking_id'))
     ORDER BY table_name, column_name`,
  );
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`packs table: ${packsTable.rowCount ? 'EXISTS' : 'absent'} | job_runs table: ${jobRunsTable.rowCount ? 'EXISTS' : 'absent'}`);
  for (const c of cols.rows) console.log(`  ${c.table_name}.${c.column_name}: present, nullable ${c.is_nullable}`);
  console.log('PLAN:'); for (const s of STATEMENTS) console.log('  ' + s.split('\n')[0] + (s.includes('\n') ? ' …' : ''));
  console.log(`  INSERT INTO system_one_shot_migrations (key) VALUES ('${KEY}')`);

  const newColsPresent = cols.rows.some((c) => c.column_name === 'pack_id' || c.column_name === 'moved_from_booking_id');
  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else if (packsTable.rowCount || jobRunsTable.rowCount || newColsPresent) {
    console.error('ABORT — some IQ Pass objects already exist but the registry has no record; investigate before running.');
    process.exit(2);
  } else {
    await client.query('BEGIN');
    for (const s of STATEMENTS) {
      await client.query(s);
      console.log('ran:', s.split('\n')[0]);
    }
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    await client.query('COMMIT');
    const after = await client.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE (table_name = 'bookings' AND column_name IN ('pack_id', 'moved_from_booking_id'))
          OR (table_name = 'payments' AND column_name IN ('pack_id', 'booking_id'))
          OR table_name IN ('packs', 'job_runs')
       ORDER BY table_name, ordinal_position`,
    );
    console.log(`COMMITTED — ${KEY}; ${after.rowCount} columns now present:`);
    for (const c of after.rows) console.log(`  ${c.table_name}.${c.column_name} nullable ${c.is_nullable}`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('ROLLED BACK —', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
