// PR1 schema migration — additive only, IF NOT EXISTS for idempotency.
// Bypasses drizzle-kit push because the live DB has unrelated drift
// (discount_codes, onboarding_*, refund_*, etc.) that push wants to drop.
import pg from 'pg';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')];}));
const { Pool } = pg;
const p = new Pool({ connectionString: env.DATABASE_URL });

const STATEMENTS = [
  // players additions (C-2: milestone-emailed flags, sticky-true once sent)
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS referral_milestone_5_emailed boolean NOT NULL DEFAULT false`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS referral_milestone_10_emailed boolean NOT NULL DEFAULT false`,

  // referrals additions (trigger trace + clawback bookkeeping)
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS triggering_booking_id varchar`,
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS completion_method text`,
  `ALTER TABLE referrals ADD COLUMN IF NOT EXISTS clawed_back_at timestamp`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_triggering_booking ON referrals(triggering_booking_id)`,

  // marketplace_users addition (Dashboard nudge dismissal, PR4)
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS referral_nudge_dismissed_at timestamp`,
];

const client = await p.connect();
try {
  await client.query('BEGIN');
  for (const sql of STATEMENTS) {
    console.log('→', sql.slice(0, 90) + (sql.length > 90 ? '…' : ''));
    await client.query(sql);
  }
  await client.query('COMMIT');
  console.log('\n✓ All additive changes applied successfully.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed, transaction rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
}

// Verify the new columns + index exist now.
const r1 = await p.query(
  `SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE column_name = ANY($1::text[]) ORDER BY table_name, column_name`,
  [['triggering_booking_id','completion_method','clawed_back_at',
    'referral_milestone_5_emailed','referral_milestone_10_emailed',
    'referral_nudge_dismissed_at']]);
console.log('\nNew columns now present:');
console.table(r1.rows);

const r2 = await p.query(
  `SELECT indexname FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_referrals_triggering_booking'`);
console.log('\nNew index:');
console.table(r2.rows);

// And confirm the drift the abort protected is still safe.
const r3 = await p.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_name IN ('discount_codes','system_one_shot_migrations','player_link_requests')`);
console.log('\nDrift tables still untouched (proof we did not run destructive push):');
console.table(r3.rows);

await p.end();
