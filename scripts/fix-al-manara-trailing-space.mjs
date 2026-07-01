// Phase 1 gate (c) STEP 2a — normalise the ONE bookable_sessions row whose venue_name
// carries whitespace ("Al Manara Sports Hall " → "Al Manara Sports Hall"), so the venue
// seed (2b) and the gate-e name-match see a single clean "Al Manara Sports Hall".
//
// PRECISE, not blanket: the WHERE clause only touches rows where venue_name differs from
// its btrim() — i.e. rows that actually have leading/trailing whitespace. The dry-run
// prints the full scope first so we can confirm it's exactly the expected row(s).
//
// IDEMPOTENT: after the fix, `venue_name <> btrim(venue_name)` matches 0 rows, so a
// re-run changes nothing.
//
// REVERSIBLE: this is a name normalisation. To undo, restore the prior value on that id
//   (the only affected row today is "Al Manara Sports Hall " with a single trailing space).
//
// USAGE:
//   node scripts/fix-al-manara-trailing-space.mjs           # DRY-RUN (prints, writes nothing)
//   node scripts/fix-al-manara-trailing-space.mjs --apply   # writes inside one transaction

import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

const PREVIEW_SQL =
  `SELECT id, venue_name AS before, btrim(venue_name) AS after, to_char(date,'YYYY-MM-DD') AS d
   FROM bookable_sessions
   WHERE venue_name <> btrim(venue_name)
   ORDER BY venue_name`;

const UPDATE_SQL =
  `UPDATE bookable_sessions SET venue_name = btrim(venue_name)
   WHERE venue_name <> btrim(venue_name)`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const conn = env.DATABASE_URL;
const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn);
const { Pool } = pg;
const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
const client = await pool.connect();

try {
  const rows = (await client.query(PREVIEW_SQL)).rows;
  console.log(`Rows with leading/trailing whitespace in venue_name: ${rows.length}`);
  for (const r of rows) {
    console.log(`  id=${r.id}  date=${r.d}`);
    console.log(`     before = [${r.before}]  (len ${r.before.length})`);
    console.log(`     after  = [${r.after}]  (len ${r.after.length})`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — nothing written. Re-run with --apply to write (one transaction).');
  } else {
    await client.query('BEGIN');
    const res = await client.query(UPDATE_SQL);
    await client.query('COMMIT');
    console.log(`\n✓ Applied — ${res.rowCount} row(s) updated (committed).`);

    const distinct = (await client.query(`SELECT count(DISTINCT venue_name)::int AS n FROM bookable_sessions`)).rows[0].n;
    const alm = (await client.query(`SELECT count(*)::int AS n FROM bookable_sessions WHERE venue_name = 'Al Manara Sports Hall'`)).rows[0].n;
    const remaining = (await client.query(PREVIEW_SQL)).rows.length;
    console.log(`\nVerification:`);
    console.log(`  DISTINCT venue_name          = ${distinct}`);
    console.log(`  'Al Manara Sports Hall' count = ${alm}`);
    console.log(`  rows still needing trim       = ${remaining} (0 = idempotent)`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
