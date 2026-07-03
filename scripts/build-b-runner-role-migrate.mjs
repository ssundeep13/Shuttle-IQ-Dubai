// BUILD B — runner-role columns on portal_users. ADDITIVE, IDEMPOTENT. House pattern
// (scripts/phase2-portal-migrate.mjs): ADD COLUMN IF NOT EXISTS, no drops, no data loss.
//
// - role: text NOT NULL DEFAULT 'owner' — Postgres backfills EXISTING rows with the
//   default on ADD COLUMN, so every existing login keeps full owner access, guaranteed.
// - runner_id: varchar NULL — app-level reference to session_runners.id (house style:
//   same convention as session_costs.captain_id; no DB FK constraint).
//
// Re-runnable: a second run makes ZERO changes. Reversible: ALTER TABLE portal_users
// DROP COLUMN role; DROP COLUMN runner_id; (both new; role default never removed data).
//
// USAGE:
//   node scripts/build-b-runner-role-migrate.mjs           # DRY-RUN (prints, writes nothing)
//   node scripts/build-b-runner-role-migrate.mjs --apply   # apply DDL in one txn
//
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const DDL = [
  { label: "add portal_users.role (text NOT NULL DEFAULT 'owner')",
    sql: `ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner'` },
  { label: 'add portal_users.runner_id (varchar NULL, app-level ref → session_runners.id)',
    sql: `ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS runner_id varchar` },
];

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const conn = env.DATABASE_URL;
const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn);
const { Pool } = pg;
const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
const client = await pool.connect();

try {
  const cols = (await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='portal_users' AND column_name IN ('role','runner_id')`)).rows.map((r) => r.column_name);
  const rows = (await client.query(`SELECT email, is_active FROM portal_users ORDER BY email`)).rows;

  console.log('BUILD B — portal_users role/runner_id migration');
  console.log(`  existing portal_users rows (${rows.length}):`, JSON.stringify(rows));
  console.log(`  role column:      ${cols.includes('role') ? 'already exists' : "would be added (existing rows auto-filled 'owner' → no access change)"}`);
  console.log(`  runner_id column: ${cols.includes('runner_id') ? 'already exists' : 'would be added (NULL for all existing rows)'}`);

  if (!APPLY) {
    console.log('\nWould run:');
    for (const s of DDL) console.log('  →', s.label);
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query('BEGIN');
    for (const s of DDL) { console.log('→', s.label); await client.query(s.sql); }
    await client.query('COMMIT');
    const after = (await client.query(
      `SELECT email, role, runner_id, is_active FROM portal_users ORDER BY email`)).rows;
    console.log('\n✓ Applied. Verification — portal_users now:', JSON.stringify(after));
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
