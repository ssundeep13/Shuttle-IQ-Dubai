// One-time goodwill waiver — Sanuja (player 972a9f71-bf6a-4967-bb89-65b6f7acc3fe)
// carries -1500 fils from a pre-floor-policy referral clawback. Decision
// 2026-06-13: waive it. Writes a +1500 'adjustment' ledger entry and brings the
// balance to exactly 0. Idempotent: the CAS UPDATE only fires while the balance
// is exactly -1500 AND no prior waiver row exists. MUST run BEFORE the
// non-negative CHECK constraint migration.
// Run with: TZ=UTC node scripts/waive-sanuja-clawback-2026-06-13.mjs
import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const PLAYER_ID = '972a9f71-bf6a-4967-bb89-65b6f7acc3fe';
const WAIVER_FILS = 1500;
const WAIVER_DESC = 'Goodwill waiver of referral clawback debt — one-time exception (2026-06-13)';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query('BEGIN');

  const prior = await client.query(
    `SELECT 1 FROM wallet_transactions WHERE player_id = $1 AND type = 'adjustment' AND description = $2`,
    [PLAYER_ID, WAIVER_DESC]
  );
  if (prior.rows.length > 0) {
    console.log('Waiver already applied — nothing to do (idempotent).');
    await client.query('ROLLBACK');
  } else {
    // CAS: only while the balance is exactly -1500 (the known debt).
    const upd = await client.query(
      `UPDATE players SET wallet_balance = wallet_balance + $2
       WHERE id = $1 AND wallet_balance = -$2
       RETURNING wallet_balance`,
      [PLAYER_ID, WAIVER_FILS]
    );
    if (upd.rows.length !== 1) {
      await client.query('ROLLBACK');
      console.log('ABORT: balance is no longer exactly -1500 fils — investigate before waiving. No change.');
    } else {
      await client.query(
        `INSERT INTO wallet_transactions
           (id, player_id, amount_fils, balance_after_fils, type, description, created_by)
         VALUES ($1, $2, $3, $4, 'adjustment', $5, 'admin')`,
        [randomUUID(), PLAYER_ID, WAIVER_FILS, upd.rows[0].wallet_balance, WAIVER_DESC]
      );
      await client.query('COMMIT');
      console.log(`Waiver applied: +${WAIVER_FILS} fils → balance now ${upd.rows[0].wallet_balance} (expect 0).`);
    }
  }
} finally {
  client.release();
  await pool.end();
}
