// GATE 5b — schema-drift fix: match_suggestions.pending_until must be
// NULLABLE. The code schema (shared/schema.ts) has declared it nullable
// since the queued-suggestion feature shipped — 'queued' rows REQUIRE
// pending_until = NULL so the 90s auto-approve sweep can never touch them
// before promotion — but the physical prod column carries a legacy NOT NULL.
//
// Evidence (2026-07-06): every queued INSERT in prod history has failed on
// this constraint (0 rows have ever held NULL pending_until; status
// histogram contains no 'queued' rows at all). This silently disabled the
// queued orchestrator's Up Next lineups AND blocks Gate 5 captain pins.
//
// House pattern: additive, idempotent, dry-run default, hand-run before use.
// Reversible: ALTER TABLE match_suggestions ALTER COLUMN pending_until SET NOT NULL
// (valid today — zero NULL rows exist until the first queued row lands).
//
// USAGE:
//   node scripts/gate5b-pending-until-nullable.mjs           # DRY-RUN
//   node scripts/gate5b-pending-until-nullable.mjs --apply
//
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const col = (await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'match_suggestions' AND column_name = 'pending_until'`)).rows[0];
  const nullRows = (await client.query(
    `SELECT count(*)::int AS n FROM match_suggestions WHERE pending_until IS NULL`)).rows[0].n;

  console.log('GATE 5b — pending_until nullability fix');
  console.log(`  live column is_nullable: ${col?.is_nullable}`);
  console.log(`  rows with NULL pending_until today: ${nullRows}`);

  if (col?.is_nullable === 'YES') {
    console.log('\n✓ Already nullable — nothing to do.');
  } else if (!APPLY) {
    console.log('\nWould run:');
    console.log('  → ALTER TABLE match_suggestions ALTER COLUMN pending_until DROP NOT NULL');
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query(`ALTER TABLE match_suggestions ALTER COLUMN pending_until DROP NOT NULL`);
    const after = (await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'match_suggestions' AND column_name = 'pending_until'`)).rows[0];
    console.log(`\n✓ Applied — is_nullable now: ${after?.is_nullable}`);
  }
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
