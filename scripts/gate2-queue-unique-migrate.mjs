// GATE 2 — queue_entries uniqueness. Cleans historical duplicate (session_id, player_id)
// rows, then adds a UNIQUE index so the double-join race can never recreate them.
// House pattern: additive, idempotent, dry-run default, hand-run before deploy.
//
// Cleanup rule: for each duplicate pair keep the row with the LOWEST position (the
// earliest queue slot — deterministic; ties broken by id). Verified pre-run: all
// duplicates are in ENDED sessions (0 in active), so queue order for live play is
// untouched.
//
// Re-runnable: second run deletes 0 and the index already exists. Reversible:
// DROP INDEX uq_queue_entries_session_player (deleted duplicate rows are historical
// queue leftovers, not meaningful data).
//
// USAGE:
//   node scripts/gate2-queue-unique-migrate.mjs           # DRY-RUN
//   node scripts/gate2-queue-unique-migrate.mjs --apply
//
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const DUP_SELECT = `
  SELECT qe.id FROM queue_entries qe
  JOIN (
    SELECT session_id, player_id, min(position) AS keep_pos,
           (array_agg(id ORDER BY position, id))[1] AS keep_id
    FROM queue_entries GROUP BY session_id, player_id HAVING count(*) > 1
  ) d ON d.session_id = qe.session_id AND d.player_id = qe.player_id
  WHERE qe.id <> d.keep_id`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const toDelete = (await client.query(DUP_SELECT)).rows;
  const activeDups = (await client.query(`
    SELECT count(*)::int AS n FROM (${DUP_SELECT}) x
    JOIN queue_entries qe ON qe.id = x.id
    JOIN sessions s ON s.id = qe.session_id AND s.status = 'active'`)).rows[0].n;
  const indexPresent = (await client.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'uq_queue_entries_session_player'`)).rowCount > 0;

  console.log('GATE 2 — queue_entries unique-index migration');
  console.log(`  duplicate extra rows to delete: ${toDelete.length} (in ACTIVE sessions: ${activeDups})`);
  console.log(`  unique index: ${indexPresent ? 'already exists' : 'would be created'}`);

  if (activeDups > 0) {
    console.error('\n❌ REFUSING — duplicates exist in an ACTIVE session. Resolve live state first.');
    process.exitCode = 1;
  } else if (!APPLY) {
    console.log('\nWould run (one transaction):');
    console.log('  → DELETE the', toDelete.length, 'extra rows (keep lowest-position row per pair)');
    console.log('  → CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_entries_session_player ON queue_entries(session_id, player_id)');
    console.log('DRY-RUN — nothing written. Re-run with --apply.');
  } else {
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM queue_entries WHERE id IN (${DUP_SELECT})`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_entries_session_player ON queue_entries(session_id, player_id)`);
    await client.query('COMMIT');
    const remaining = (await client.query(`
      SELECT count(*)::int AS n FROM (SELECT 1 FROM queue_entries GROUP BY session_id, player_id HAVING count(*) > 1) t`)).rows[0].n;
    console.log(`\n✓ Applied — deleted ${del.rowCount} duplicate rows; remaining duplicate pairs: ${remaining} (want 0); index ensured.`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
