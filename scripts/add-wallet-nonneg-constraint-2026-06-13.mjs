// Adds the DB-level non-negative wallet constraint (deferred in Layer 1, now
// safe: clawbacks floor at 0 and Sanuja's -1500 has been waived). MUST run
// AFTER scripts/waive-sanuja-clawback-2026-06-13.mjs — the constraint cannot
// validate while any balance is negative. Aborts (no change) if a negative
// balance still exists. Idempotent via IF NOT EXISTS check.
// Run with: TZ=UTC node scripts/add-wallet-nonneg-constraint-2026-06-13.mjs
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const neg = await pool.query('SELECT id, name, wallet_balance FROM players WHERE wallet_balance < 0');
if (neg.rows.length > 0) {
  console.log('ABORT — negative balances still exist; run the waiver first:');
  neg.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${r.wallet_balance}`));
  await pool.end();
  process.exit(1);
}

const exists = await pool.query(
  `SELECT 1 FROM pg_constraint WHERE conname = 'players_wallet_balance_non_negative'`
);
if (exists.rows.length > 0) {
  console.log('Constraint already present — nothing to do (idempotent).');
} else {
  await pool.query(
    `ALTER TABLE players ADD CONSTRAINT players_wallet_balance_non_negative CHECK (wallet_balance >= 0)`
  );
  console.log('Constraint added: players_wallet_balance_non_negative CHECK (wallet_balance >= 0)');
}
const verify = await pool.query(
  `SELECT conname FROM pg_constraint WHERE conname = 'players_wallet_balance_non_negative'`
);
console.log('Verified present: ' + (verify.rows.length === 1));
await pool.end();
