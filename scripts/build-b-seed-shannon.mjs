// BUILD B — seed Shannon's runner-only portal login. ADDITIVE, IDEMPOTENT (ON CONFLICT
// (email) DO NOTHING — a re-run never overwrites an existing hash/role). House pattern
// (scripts/phase2-portal-migrate.mjs).
//
// PASSWORD HANDLING: the plaintext is read from SHANNON_SEED_PASSWORD at run time,
// bcrypt-hashed (cost 10, same as the existing portal seed), and NEVER printed or
// committed. The script REFUSES to apply without it.
//
// USAGE:
//   node scripts/build-b-seed-shannon.mjs                                    # DRY-RUN
//   SHANNON_SEED_PASSWORD='<plaintext>' node scripts/build-b-seed-shannon.mjs --apply
//
import pg from 'pg';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const EMAIL = 'estacio.shannenmarie@gmail.com'; // stored lowercased
const RUNNER_NAME = 'Shannon';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  // Resolve the runner id LIVE (never hardcoded) and re-check the email.
  const runner = (await client.query(
    `SELECT id, name FROM session_runners WHERE name = $1 AND is_active`, [RUNNER_NAME])).rows[0];
  if (!runner) throw new Error(`active session_runner named '${RUNNER_NAME}' not found`);
  const existing = (await client.query(
    `SELECT email, role, runner_id FROM portal_users WHERE email = $1`, [EMAIL])).rows;

  console.log('BUILD B — seed Shannon runner login');
  console.log(`  runner: ${runner.name} → ${runner.id}`);
  console.log(`  row to insert: { email: '${EMAIL}', role: 'runner', runner_id: '${runner.id}', is_active: true, password_hash: <bcrypt cost 10, from env> }`);
  console.log(`  existing portal_user for that email: ${existing.length ? JSON.stringify(existing) + ' (ON CONFLICT DO NOTHING — untouched)' : 'none — INSERT will run'}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — nothing written. Re-run with:  SHANNON_SEED_PASSWORD='<plaintext>' node scripts/build-b-seed-shannon.mjs --apply");
  } else {
    const pw = process.env.SHANNON_SEED_PASSWORD;
    if (!pw || pw.trim().length === 0) {
      console.error('\n❌ REFUSED — SHANNON_SEED_PASSWORD is missing or empty. Nothing written.');
      process.exitCode = 1;
    } else {
      const hash = await bcrypt.hash(pw, 10); // never printed
      const ins = await client.query(
        `INSERT INTO portal_users (id, email, password_hash, is_active, role, runner_id)
         VALUES ($1, $2, $3, true, 'runner', $4)
         ON CONFLICT (email) DO NOTHING`,
        [randomUUID(), EMAIL, hash, runner.id]);
      console.log(`\n✓ Applied — ${ins.rowCount} row inserted (0 = already existed, untouched).`);
      const rows = (await client.query(
        `SELECT email, role, runner_id, is_active FROM portal_users ORDER BY email`)).rows;
      console.log('Verification — portal_users (no hashes):', JSON.stringify(rows));
    }
  }
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
