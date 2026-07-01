// Phase 1 gate (c) STEP 2b — seed the venues price-book from existing session data.
// Inserts DISTINCT bookable_sessions.venue_name (EXCLUDING 'Test Venue') into venues
// with court_rate_fils_per_hour = 0 and is_active = true, using ON CONFLICT (name)
// DO NOTHING. Run 2a (whitespace fix) FIRST so "Al Manara Sports Hall" is one clean name.
//
// IDEMPOTENT / re-run-safe: ON CONFLICT (name) DO NOTHING → a second run inserts 0.
// Prices seed at 0 = "not set yet" (the UI renders 0 as unset, never "free").
//
// USAGE:
//   node scripts/seed-venues-from-sessions.mjs           # DRY-RUN (prints, writes nothing)
//   node scripts/seed-venues-from-sessions.mjs --apply    # writes inside one transaction

import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const EXCLUDE = ['Test Venue'];

const NAMES_SQL =
  `SELECT DISTINCT venue_name
   FROM bookable_sessions
   WHERE venue_name <> ALL($1::text[])
   ORDER BY venue_name`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const conn = env.DATABASE_URL;
const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn);
const { Pool } = pg;
const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
const client = await pool.connect();

try {
  const names = (await client.query(NAMES_SQL, [EXCLUDE])).rows.map((r) => r.venue_name);
  const venuesBefore = (await client.query(`SELECT count(*)::int AS n FROM venues`)).rows[0].n;

  console.log(`Would insert ${names.length} venue(s)  (excluding: ${EXCLUDE.map((e) => `'${e}'`).join(', ')}):`);
  names.forEach((n, i) => console.log(`  ${String(i + 1).padStart(2)}. [${n}]`));

  console.log(`\nCount to insert          = ${names.length}`);
  console.log(`'Test Venue' in list?    = ${names.includes('Test Venue')}  (expect false)`);
  console.log(`venues rows BEFORE       = ${venuesBefore}  (0 ⇒ all are new inserts)`);

  if (!APPLY) {
    console.log('\nDRY-RUN — nothing written. Re-run with --apply to seed (one transaction).');
  } else {
    await client.query('BEGIN');
    let inserted = 0;
    for (const name of names) {
      const r = await client.query(
        `INSERT INTO venues (id, name, court_rate_fils_per_hour, is_active)
         VALUES ($1, $2, 0, true) ON CONFLICT (name) DO NOTHING`,
        [randomUUID(), name]);
      inserted += r.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`\n✓ Seeded — ${inserted} inserted (0 = all already present).`);

    const rows = (await client.query(
      `SELECT name, court_rate_fils_per_hour AS rate, is_active FROM venues ORDER BY name`)).rows;
    console.log(`\nVerification — venues now holds ${rows.length} row(s):`);
    for (const r of rows) console.log(`   [${r.name}]  rate=${r.rate}  active=${r.is_active}`);
    const anyRate = rows.some((r) => r.rate !== 0);
    const anyInactive = rows.some((r) => r.is_active !== true);
    const hasTest = rows.some((r) => r.name === 'Test Venue');
    console.log(`\n  any rate != 0     = ${anyRate}   (expect false)`);
    console.log(`  any not-active    = ${anyInactive} (expect false)`);
    console.log(`  'Test Venue' present = ${hasTest} (expect false)`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
