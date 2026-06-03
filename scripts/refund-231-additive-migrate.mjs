// #231 schema migration — additive only, IF NOT EXISTS for idempotency.
// Re-adds the 4 Ziina-refund tracking columns to `payments` that were dropped
// during the earlier drift cleanup. Bypasses drizzle-kit push deliberately:
// the live DB has unrelated drift (discount_codes, onboarding_*, etc.) that
// push would want to DROP. This script only ADDs, never drops.
//
// Columns (all nullable, no default) — must match shared/schema.ts payments:
//   ziina_refund_id  text       -> ziinaRefundId
//   refunded_amount  integer    -> refundedAmount (fils)
//   refunded_at      timestamp  -> refundedAt
//   refund_status    text       -> refundStatus (null|'pending'|'completed'|'failed')
//
// Run once per environment BEFORE deploying the #231 code:
//   node scripts/refund-231-additive-migrate.mjs
import pg from 'pg';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')];}));
const { Pool } = pg;
const p = new Pool({ connectionString: env.DATABASE_URL });

const STATEMENTS = [
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS ziina_refund_id text`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount integer`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at timestamp`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status text`,
];

const client = await p.connect();
try {
  await client.query('BEGIN');
  for (const sql of STATEMENTS) {
    console.log('→', sql);
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

// Verify the new columns exist now.
const r1 = await p.query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'payments'
     AND column_name = ANY($1::text[]) ORDER BY column_name`,
  [['ziina_refund_id','refunded_amount','refunded_at','refund_status']]);
console.log('\nNew columns now present on payments:');
console.table(r1.rows);

if (r1.rows.length !== 4) {
  console.error(`\n❌ Expected 4 refund columns, found ${r1.rows.length}.`);
  process.exitCode = 1;
}

await p.end();
