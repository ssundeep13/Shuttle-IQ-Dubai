// Cancellation refund-choice — additive migration (IF NOT EXISTS, idempotent).
// Bypasses drizzle-kit push deliberately (live DB has unrelated drift). ADD only.
//   node scripts/refund-choice-migrate.mjs
//
// bookings:
//   refund_method      text       -> refundMethod ('wallet' | 'ziina' | null)
//   wallet_refunded_at timestamp  -> walletRefundedAt (idempotency guard)
import pg from 'pg';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')];}));
const { Pool } = pg;
const p = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const STATEMENTS = [
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_method text`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_refunded_at timestamp`,
];

const client = await p.connect();
try {
  await client.query('BEGIN');
  for (const sql of STATEMENTS) { console.log('→', sql); await client.query(sql); }
  await client.query('COMMIT');
  console.log('\n✓ Refund-choice columns applied.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed, rolled back:', err); process.exitCode = 1;
} finally { client.release(); }

const r = await p.query(`SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name='bookings' AND column_name IN ('refund_method','wallet_refunded_at')
  ORDER BY column_name`);
console.log('\nNew columns now present on bookings:');
console.table(r.rows);
if (r.rows.length !== 2) { console.error(`❌ Expected 2 columns, found ${r.rows.length}.`); process.exitCode = 1; }
await p.end();
