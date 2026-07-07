// COURT BANDS Gate 1 — courts.skill_band. One additive column:
//   skill_band text NOT NULL DEFAULT 'all_levels'
//   ('all_levels' | 'beginner' | 'intermediate_plus' | 'competitive_plus')
// Filters suggestion/orchestrator candidate pools per court; never blocks
// captain actions. Existing courts backfill to 'all_levels' via the default.
//
// House pattern: additive, idempotent, dry-run default, hand-run before deploy.
// Re-runnable: ADD COLUMN IF NOT EXISTS. Reversible:
//   ALTER TABLE courts DROP COLUMN skill_band.
// No value CHECK constraint — matches this schema's convention for text
// status columns (courts.status, players.level are unconstrained text);
// the API layer validates the enum.
//
// USAGE:
//   node scripts/court-band-migrate.mjs           # DRY-RUN
//   node scripts/court-band-migrate.mjs --apply
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
  const colPresent = (await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'courts' AND column_name = 'skill_band'`)).rowCount > 0;
  const courtCount = (await client.query(`SELECT count(*)::int AS n FROM courts`)).rows[0].n;

  console.log('COURT BANDS Gate 1 — courts.skill_band migration');
  console.log(`  existing court rows (will backfill to 'all_levels'): ${courtCount}`);
  console.log(`  skill_band column: ${colPresent ? 'already exists' : 'would be added'}`);

  if (!APPLY) {
    console.log('\nWould run:');
    console.log("  → ALTER TABLE courts ADD COLUMN IF NOT EXISTS skill_band text NOT NULL DEFAULT 'all_levels'");
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query(`ALTER TABLE courts ADD COLUMN IF NOT EXISTS skill_band text NOT NULL DEFAULT 'all_levels'`);
    const colNow = (await client.query(
      `SELECT data_type, column_default, is_nullable FROM information_schema.columns
       WHERE table_name = 'courts' AND column_name = 'skill_band'`)).rows[0];
    const backfilled = (await client.query(
      `SELECT count(*)::int AS n FROM courts WHERE skill_band = 'all_levels'`)).rows[0].n;
    const total = (await client.query(`SELECT count(*)::int AS n FROM courts`)).rows[0].n;
    console.log('\n✓ Applied.');
    console.log(`  column: ${JSON.stringify(colNow)}`);
    console.log(`  backfill: ${backfilled}/${total} rows at 'all_levels' (want equal).`);
  }
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
