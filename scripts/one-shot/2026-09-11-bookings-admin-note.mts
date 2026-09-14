// One-shot migration: add the nullable `admin_note` text column to `bookings`
// (Gate BT1 — the admin's free-text note when confirming an off-app payment).
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-11-bookings-admin-note.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-11-bookings-admin-note.mts
//
// WHY NOT the drizzle-kit schema-push tool: against this PostgreSQL 18 database
// drizzle-kit 0.31.4 plans hundreds of destructive statements on existing
// tables (see docs/challenges-build-report.md); `npm run db:push` is guarded. This script
// runs exactly ONE statement and records itself in system_one_shot_migrations
// so a re-run is a no-op. It also refuses to run if the column already exists.
//
// ORDER OF OPERATIONS: run this BEFORE deploying the code that adds
// `adminNote` to the drizzle schema — every `select().from(bookings)` selects
// the new column, so the code must not go live against a database that lacks it.
import { pool } from '../../server/db';

const KEY = 'bookings_admin_note_v1';
const DRY_RUN = process.argv.includes('--dry-run');

const STATEMENTS = [
  'ALTER TABLE "bookings" ADD COLUMN "admin_note" text;',
];

const client = await pool.connect();
try {
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const col = await client.query(
    `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'admin_note'`,
  );
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`bookings.admin_note: ${col.rowCount ? `EXISTS (${col.rows[0].data_type}, nullable ${col.rows[0].is_nullable})` : 'absent'}`);
  console.log('PLAN:'); for (const s of STATEMENTS) console.log('  ' + s);
  console.log(`  INSERT INTO system_one_shot_migrations (key) VALUES ('${KEY}')`);

  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else if (col.rowCount) {
    console.error('ABORT — bookings.admin_note already exists but the registry has no record; investigate before running.');
    process.exit(2);
  } else {
    await client.query('BEGIN');
    for (const s of STATEMENTS) {
      await client.query(s);
      console.log('ran:', s);
    }
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    await client.query('COMMIT');
    const after = await client.query(
      `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'admin_note'`,
    );
    console.log(`COMMITTED — ${KEY}; bookings.admin_note now ${after.rows[0]?.data_type} nullable ${after.rows[0]?.is_nullable}`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('ROLLED BACK —', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
