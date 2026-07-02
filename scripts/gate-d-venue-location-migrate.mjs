// Gate (d) addendum — venues + location + map_url. ADDITIVE, IDEMPOTENT. Follows the
// house pattern (scripts/multitenancy-gate1-additive-migrate.mjs): ADD COLUMN IF NOT
// EXISTS, no drops, no FKs. Includes a one-time best-effort backfill: for each venue,
// copy location / map_url from its MOST RECENT bookable_session (name-match) that has a
// non-empty value — only where the venue's own value is still NULL (so a re-run, or an
// admin-set value, is never overwritten).
//
// Re-runnable: a second run makes ZERO changes.
// Reversible: DROP COLUMN venues.location; DROP COLUMN venues.map_url; (both new, nullable).
//
// USAGE:
//   node scripts/gate-d-venue-location-migrate.mjs           # DRY-RUN (prints, writes nothing)
//   node scripts/gate-d-venue-location-migrate.mjs --apply    # ADD COLUMNs + backfill, one txn

import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

export const DDL = [
  { label: 'add venues.location', sql: `ALTER TABLE venues ADD COLUMN IF NOT EXISTS location text` },
  { label: 'add venues.map_url',  sql: `ALTER TABLE venues ADD COLUMN IF NOT EXISTS map_url text` },
];

// Read-only preview: what each venue WOULD get (does not reference the new columns).
const PREVIEW_SQL = `
  SELECT v.name,
    (SELECT bs.venue_location FROM bookable_sessions bs
     WHERE bs.venue_name = v.name AND bs.venue_location IS NOT NULL AND btrim(bs.venue_location) <> ''
     ORDER BY bs.date DESC LIMIT 1) AS proposed_location,
    (SELECT bs.venue_map_url FROM bookable_sessions bs
     WHERE bs.venue_name = v.name AND bs.venue_map_url IS NOT NULL AND btrim(bs.venue_map_url) <> ''
     ORDER BY bs.date DESC LIMIT 1) AS proposed_map_url
  FROM venues v ORDER BY v.name`;

// Backfill only where the venue value is still NULL (idempotent, non-destructive).
const BACKFILL_LOCATION = `
  UPDATE venues v SET location = (
    SELECT bs.venue_location FROM bookable_sessions bs
    WHERE bs.venue_name = v.name AND bs.venue_location IS NOT NULL AND btrim(bs.venue_location) <> ''
    ORDER BY bs.date DESC LIMIT 1)
  WHERE v.location IS NULL
    AND EXISTS (SELECT 1 FROM bookable_sessions bs
      WHERE bs.venue_name = v.name AND bs.venue_location IS NOT NULL AND btrim(bs.venue_location) <> '')`;

const BACKFILL_MAP_URL = `
  UPDATE venues v SET map_url = (
    SELECT bs.venue_map_url FROM bookable_sessions bs
    WHERE bs.venue_name = v.name AND bs.venue_map_url IS NOT NULL AND btrim(bs.venue_map_url) <> ''
    ORDER BY bs.date DESC LIMIT 1)
  WHERE v.map_url IS NULL
    AND EXISTS (SELECT 1 FROM bookable_sessions bs
      WHERE bs.venue_name = v.name AND bs.venue_map_url IS NOT NULL AND btrim(bs.venue_map_url) <> '')`;

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const conn = env.DATABASE_URL;
const needsSsl = !/localhost|127\.0\.0\.1|\.railway\.internal/.test(conn);
const { Pool } = pg;
const pool = new Pool({ connectionString: conn, ssl: needsSsl ? { rejectUnauthorized: false } : false });
const client = await pool.connect();

try {
  // Preview (read-only) — what each venue would receive from the backfill.
  const rows = (await client.query(PREVIEW_SQL)).rows;
  let withLoc = 0, withMap = 0;
  console.log(`Backfill preview (${rows.length} venues):`);
  for (const r of rows) {
    if (r.proposed_location) withLoc++;
    if (r.proposed_map_url) withMap++;
    console.log(`  [${r.name}]`);
    console.log(`     location → ${r.proposed_location ? `"${r.proposed_location}"` : '(none in sessions)'}`);
    console.log(`     map_url  → ${r.proposed_map_url ? r.proposed_map_url : '(none in sessions)'}`);
  }
  console.log(`\nSummary: ${withLoc}/${rows.length} venues would get a location, ${withMap}/${rows.length} a map_url.`);

  if (!APPLY) {
    console.log('\nWould run (schema):'); for (const s of DDL) console.log('  →', s.label);
    console.log('DRY-RUN — nothing written. Re-run with --apply to add the columns + backfill.');
  } else {
    await client.query('BEGIN');
    for (const s of DDL) { console.log('→', s.label); await client.query(s.sql); }
    const loc = await client.query(BACKFILL_LOCATION);
    const map = await client.query(BACKFILL_MAP_URL);
    await client.query('COMMIT');
    console.log(`\n✓ Applied — location backfilled: ${loc.rowCount ?? 0} rows; map_url backfilled: ${map.rowCount ?? 0} rows.`);
    const cols = (await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='venues' AND column_name IN ('location','map_url') ORDER BY column_name`)).rows.map(r => r.column_name);
    console.log('Verification — venues columns present:', JSON.stringify(cols));
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
