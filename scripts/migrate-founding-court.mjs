// Gate 2b — additive migration: founding_court_awards table.
// One row per marketplace user, written on first read-time detection of
// Founding Court qualification; never deleted. Safe to re-run (IF NOT EXISTS).
import pg from 'pg';

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1|\.railway\.internal/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});
await db.connect();

await db.query(`
  CREATE TABLE IF NOT EXISTS founding_court_awards (
    user_id varchar PRIMARY KEY,
    earned_at timestamp NOT NULL DEFAULT now()
  )
`);
const [{ n }] = (await db.query(`SELECT count(*)::int n FROM founding_court_awards`)).rows;
console.log(`founding_court_awards ready — ${n} existing rows`);
await db.end();
