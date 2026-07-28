// Gate 1 — additive migration: venue_awards table (venue-scoped badges).
// DRY-RUN BY DEFAULT: prints the exact DDL and the current state, writes
// nothing. Re-run with --execute to apply. Safe to re-run either way
// (IF NOT EXISTS); founding_court_awards is never touched.
//
//   node scripts/migrate-venue-awards.mjs            # preview
//   node scripts/migrate-venue-awards.mjs --execute  # apply
import pg from 'pg';

const EXECUTE = process.argv.includes('--execute');
const DDL = `CREATE TABLE IF NOT EXISTS venue_awards (
  user_id    varchar   NOT NULL,
  venue_id   varchar   NOT NULL,
  badge_type text      NOT NULL,
  earned_at  timestamp NOT NULL DEFAULT now(),
  seen_at    timestamp NULL,
  revoked_at timestamp NULL,
  PRIMARY KEY (user_id, venue_id, badge_type)
)`;
// Additive guards for the case where an earlier shape was already applied.
const DDL_SEEN_AT = `ALTER TABLE venue_awards ADD COLUMN IF NOT EXISTS seen_at timestamp NULL`;
const DDL_REVOKED_AT = `ALTER TABLE venue_awards ADD COLUMN IF NOT EXISTS revoked_at timestamp NULL`;

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});
await db.connect();

const exists = (await db.query(`SELECT to_regclass('public.venue_awards') AS t`)).rows[0].t;
console.log(`[venue_awards] table exists: ${exists ? 'YES' : 'no'}`);
console.log(`[venue_awards] founding_court_awards rows (must be untouched): ${(await db.query('SELECT count(*)::int n FROM founding_court_awards')).rows[0].n}`);
console.log('\n--- DDL ---\n' + DDL + ';\n' + DDL_SEEN_AT + ';\n' + DDL_REVOKED_AT + '\n-----------\n');

if (!EXECUTE) {
  console.log('DRY RUN — nothing written. Re-run with --execute to apply.');
} else {
  await db.query(DDL);
  await db.query(DDL_SEEN_AT);
  await db.query(DDL_REVOKED_AT);
  const cols = (await db.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'venue_awards' ORDER BY ordinal_position`)).rows;
  const pk = (await db.query(
    `SELECT a.attname FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = 'venue_awards'::regclass AND i.indisprimary`)).rows.map(r => r.attname);
  console.log('APPLIED. columns:', cols.map(c => `${c.column_name}:${c.data_type}`).join(', '));
  console.log('APPLIED. primary key:', pk.join(' + '));
  console.log('venue_awards rows:', (await db.query('SELECT count(*)::int n FROM venue_awards')).rows[0].n);
}
await db.end();
