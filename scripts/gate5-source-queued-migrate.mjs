// GATE 5 — captain court controls schema. Two additive, idempotent changes:
//   1. match_suggestions.source text NOT NULL DEFAULT 'auto' — lineup origin
//      marker ('auto' | 'captain'). Existing rows backfill to 'auto' via the
//      default; no data rewrite.
//   2. Partial UNIQUE index: at most ONE status='queued' row per court. Makes
//      the captain double-pin race deterministic (loser gets a unique
//      violation → 409) instead of relying on orchestrator serialization.
//
// House pattern: additive, idempotent, dry-run default, hand-run before deploy.
// Re-runnable: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
// Reversible: ALTER TABLE match_suggestions DROP COLUMN source;
//             DROP INDEX uq_match_suggestions_one_queued_per_court.
//
// PRECONDITION checked here: no court may currently hold 2+ queued rows
// (would make the index creation fail). Expect 0 — the orchestrator is the
// sole queued-row creator and runs under the session advisory lock.
//
// USAGE:
//   node scripts/gate5-source-queued-migrate.mjs           # DRY-RUN
//   node scripts/gate5-source-queued-migrate.mjs --apply
//
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const DUP_QUEUED = `
  SELECT court_id, count(*)::int AS n
  FROM match_suggestions WHERE status = 'queued'
  GROUP BY court_id HAVING count(*) > 1`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const dups = (await client.query(DUP_QUEUED)).rows;
  const queuedTotal = (await client.query(
    `SELECT count(*)::int AS n FROM match_suggestions WHERE status = 'queued'`)).rows[0].n;
  const colPresent = (await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'match_suggestions' AND column_name = 'source'`)).rowCount > 0;
  const indexPresent = (await client.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'uq_match_suggestions_one_queued_per_court'`)).rowCount > 0;

  console.log('GATE 5 — match_suggestions source + one-queued-per-court migration');
  console.log(`  current queued rows total: ${queuedTotal}`);
  console.log(`  courts with DUPLICATE queued rows: ${dups.length}${dups.length ? ' — ' + JSON.stringify(dups) : ''}`);
  console.log(`  source column: ${colPresent ? 'already exists' : 'would be added'}`);
  console.log(`  partial unique index: ${indexPresent ? 'already exists' : 'would be created'}`);

  if (dups.length > 0) {
    console.error('\n❌ REFUSING — duplicate queued rows exist; resolve before creating the unique index.');
    process.exitCode = 1;
  } else if (!APPLY) {
    console.log('\nWould run (one transaction):');
    console.log("  → ALTER TABLE match_suggestions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto'");
    console.log("  → CREATE UNIQUE INDEX IF NOT EXISTS uq_match_suggestions_one_queued_per_court ON match_suggestions (court_id) WHERE status = 'queued'");
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE match_suggestions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto'`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_match_suggestions_one_queued_per_court ON match_suggestions (court_id) WHERE status = 'queued'`);
    await client.query('COMMIT');
    const colNow = (await client.query(
      `SELECT data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'match_suggestions' AND column_name = 'source'`)).rows[0];
    const idxNow = (await client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_match_suggestions_one_queued_per_court'`)).rows[0];
    const autoCount = (await client.query(
      `SELECT count(*)::int AS n FROM match_suggestions WHERE source = 'auto'`)).rows[0].n;
    const totalCount = (await client.query(
      `SELECT count(*)::int AS n FROM match_suggestions`)).rows[0].n;
    console.log(`\n✓ Applied.`);
    console.log(`  source column: ${JSON.stringify(colNow)}`);
    console.log(`  index: ${idxNow?.indexdef}`);
    console.log(`  backfill: ${autoCount}/${totalCount} rows source='auto' (want equal).`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
