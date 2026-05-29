// Drift cleanup, Step 1 (URGENT): add match_suggestions.includes_active_players.
//
// The "Queued (next-round) suggestions Task #54" feature shipped code that
// reads and writes match_suggestions.includes_active_players but the column
// was never created on the live Railway DB. Any INSERT into match_suggestions
// or any SELECT through storage.getMatchSuggestion* paths currently fails
// with `column "includes_active_players" does not exist`.
//
// Fix is purely additive: NOT NULL with DEFAULT false. Existing 8-column rows
// (there are some in the table) backfill from the default. Idempotent.
import pg from 'pg'; import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('='))
    .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; }));
const p = new pg.Pool({ connectionString: env.DATABASE_URL });

const SQL = `ALTER TABLE match_suggestions
             ADD COLUMN IF NOT EXISTS includes_active_players boolean NOT NULL DEFAULT false`;

const client = await p.connect();
try {
  await client.query('BEGIN');
  console.log('→', SQL.replace(/\s+/g, ' '));
  await client.query(SQL);
  await client.query('COMMIT');
  console.log('\n✓ Additive ALTER applied.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed, rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
}

// Verify: column exists, has correct shape, every existing row got the default.
const colMeta = await p.query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name='match_suggestions' AND column_name='includes_active_players'`);
console.log('\nColumn metadata:');
console.table(colMeta.rows);

const counts = await p.query(
  `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE includes_active_players = true)::int  AS true_rows,
          COUNT(*) FILTER (WHERE includes_active_players = false)::int AS false_rows,
          COUNT(*) FILTER (WHERE includes_active_players IS NULL)::int AS null_rows
   FROM match_suggestions`);
console.log('\nRow counts (null_rows MUST be 0 — column is NOT NULL):');
console.table(counts.rows);

// And exercise the exact SELECT the live code does — if this works, the
// previously-broken queued-suggestions code paths are unblocked.
const probeSelect = await p.query(
  `SELECT id, status, includes_active_players
   FROM match_suggestions
   ORDER BY created_at DESC
   LIMIT 3`);
console.log('\nProbe SELECT (mirrors storage.getMatchSuggestion* shape):');
console.table(probeSelect.rows);

await p.end();
