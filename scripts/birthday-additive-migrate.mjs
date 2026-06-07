// Birthday feature — additive migration (IF NOT EXISTS, idempotent, single tx).
// Bypasses drizzle-kit push deliberately (live DB has unrelated drift). ADD only.
//   node scripts/birthday-additive-migrate.mjs
//
// marketplace_users:
//   birth_day                integer    -> birthDay (1-31)
//   birth_month              integer    -> birthMonth (1-12)
//   birth_year               integer    -> birthYear (optional)
//   birthday_discount_used_at timestamp -> birthdayDiscountUsedAt (300-day reset)
//   birthday_email_sent_at   timestamp  -> birthdayEmailSentAt (reminder de-dupe)
// bookings:
//   birthday_discount_applied boolean NOT NULL DEFAULT false -> birthdayDiscountApplied
import pg from 'pg';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')];}));
const { Pool } = pg;
const p = new Pool({ connectionString: env.DATABASE_URL });

const STATEMENTS = [
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS birth_day integer`,
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS birth_month integer`,
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS birth_year integer`,
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS birthday_discount_used_at timestamp`,
  `ALTER TABLE marketplace_users ADD COLUMN IF NOT EXISTS birthday_email_sent_at timestamp`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS birthday_discount_applied boolean NOT NULL DEFAULT false`,
];

const client = await p.connect();
try {
  await client.query('BEGIN');
  for (const sql of STATEMENTS) { console.log('→', sql); await client.query(sql); }
  await client.query('COMMIT');
  console.log('\n✓ Birthday columns applied.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed, rolled back:', err); process.exitCode = 1;
} finally { client.release(); }

const r = await p.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE (table_name='marketplace_users' AND column_name IN ('birth_day','birth_month','birth_year','birthday_discount_used_at','birthday_email_sent_at'))
     OR (table_name='bookings' AND column_name='birthday_discount_applied')
  ORDER BY table_name, column_name`);
console.log('\nNew columns now present:');
console.table(r.rows);
if (r.rows.length !== 6) { console.error(`❌ Expected 6 columns, found ${r.rows.length}.`); process.exitCode = 1; }
await p.end();
