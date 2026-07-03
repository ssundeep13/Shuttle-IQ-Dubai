// PHASE 6 — password_changed_at on portal_users. ADDITIVE, IDEMPOTENT (house pattern).
// Enables token invalidation on password change: requirePortalAuth rejects any portal
// JWT whose iat predates the user's password_changed_at. NULL (all existing rows) means
// "never changed" — every current token stays valid until the first password change.
//
// Re-runnable: second run makes ZERO changes. Reversible: DROP COLUMN password_changed_at.
//
// USAGE:
//   node scripts/phase6-password-changed-migrate.mjs           # DRY-RUN
//   node scripts/phase6-password-changed-migrate.mjs --apply   # apply DDL
//
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const DDL = {
  label: 'add portal_users.password_changed_at (timestamp NULL)',
  sql: `ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`,
};

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const present = (await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='portal_users' AND column_name='password_changed_at'`)).rowCount > 0;
  const rows = (await client.query(`SELECT email, role FROM portal_users ORDER BY email`)).rows;
  console.log('PHASE 6 — portal_users.password_changed_at migration');
  console.log(`  rows (${rows.length}):`, JSON.stringify(rows));
  console.log(`  column: ${present ? 'already exists' : 'would be added (NULL for all — no token is invalidated by the migration itself)'}`);
  if (!APPLY) {
    console.log('\nWould run:\n  →', DDL.sql);
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query('BEGIN');
    console.log('→', DDL.label);
    await client.query(DDL.sql);
    await client.query('COMMIT');
    const after = (await client.query(
      `SELECT email, role, password_changed_at FROM portal_users ORDER BY email`)).rows;
    console.log('\n✓ Applied. Verification:', JSON.stringify(after));
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
