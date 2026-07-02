// Phase 2 — finance-portal identity. ADDITIVE, IDEMPOTENT. House pattern
// (scripts/gate-d-venue-location-migrate.mjs): CREATE TABLE IF NOT EXISTS, no drops,
// no FKs. Seeds exactly ONE portal user (ssundeep13@gmail.com).
//
// PASSWORD HANDLING — the seed password is read from the PORTAL_SEED_PASSWORD env var
// at run time, bcrypt-hashed, and NEVER printed, logged, or stored in plaintext. The
// script REFUSES to seed if PORTAL_SEED_PASSWORD is missing/empty. Seeding is idempotent
// (ON CONFLICT (email) DO NOTHING) — a re-run never overwrites an existing hash.
//
// Re-runnable: a second run makes ZERO changes (table exists, user exists).
// Reversible: DROP TABLE portal_users; (new table, no dependents).
//
// USAGE:
//   node scripts/phase2-portal-migrate.mjs                                   # DRY-RUN (writes nothing)
//   PORTAL_SEED_PASSWORD='<his password>' node scripts/phase2-portal-migrate.mjs --apply
//
import pg from 'pg';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const SEED_EMAIL = 'ssundeep13@gmail.com'; // stored lowercased

const DDL = `CREATE TABLE IF NOT EXISTS portal_users (
  id varchar PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
)`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const conn = env.DATABASE_URL;
const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn);
const { Pool } = pg;
const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
const client = await pool.connect();

try {
  // Does the table exist yet? (read-only)
  const tableExists = (await client.query(
    `SELECT to_regclass('public.portal_users') IS NOT NULL AS present`)).rows[0].present;

  // Is the seed user already present? (read-only; only if the table exists)
  let userExists = false;
  if (tableExists) {
    userExists = (await client.query(
      `SELECT 1 FROM portal_users WHERE email = $1`, [SEED_EMAIL])).rowCount > 0;
  }

  console.log('Phase 2 — portal_users migration');
  console.log(`  table portal_users: ${tableExists ? 'already exists' : 'would be created (IF NOT EXISTS)'}`);
  console.log(`  seed user ${SEED_EMAIL}: ${userExists ? 'already present (ON CONFLICT DO NOTHING — untouched)' : 'would be seeded'}`);

  if (!APPLY) {
    console.log('\nDRY-RUN — nothing written.');
    console.log("Re-run with:  PORTAL_SEED_PASSWORD='<your password>' node scripts/phase2-portal-migrate.mjs --apply");
    console.log('(The password is read from PORTAL_SEED_PASSWORD, bcrypt-hashed, and never printed.)');
  } else {
    const pw = process.env.PORTAL_SEED_PASSWORD;
    if (!pw || pw.trim().length === 0) {
      console.error('\n❌ REFUSED — PORTAL_SEED_PASSWORD is missing or empty. Nothing written.');
      console.error("   Set it and re-run:  PORTAL_SEED_PASSWORD='<your password>' node scripts/phase2-portal-migrate.mjs --apply");
      process.exitCode = 1;
    } else {
      const hash = await bcrypt.hash(pw, 10); // never printed
      await client.query('BEGIN');
      await client.query(DDL);
      const ins = await client.query(
        `INSERT INTO portal_users (id, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [randomUUID(), SEED_EMAIL, hash]);
      await client.query('COMMIT');
      console.log(`\n✓ Applied — table ensured; ${ins.rowCount} user row inserted (0 = already existed, existing hash left unchanged).`);
      const rows = (await client.query(
        `SELECT email, is_active FROM portal_users ORDER BY email`)).rows;
      // Verification prints email + active flag ONLY — never the hash.
      console.log('Verification — portal_users:', JSON.stringify(rows));
    }
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
