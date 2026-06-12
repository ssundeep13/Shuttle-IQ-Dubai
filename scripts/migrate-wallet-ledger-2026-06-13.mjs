// Wallet ledger migration (Layer 1) — ADDITIVE ONLY. Creates the append-only
// wallet_transactions table, its index, and the DB-level append-only trigger
// (UPDATE/DELETE on the table raise). No existing table is altered.
// Run with: TZ=UTC node scripts/migrate-wallet-ledger-2026-06-13.mjs
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const statements = [
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
     id varchar PRIMARY KEY,
     player_id varchar NOT NULL,
     amount_fils integer NOT NULL,
     balance_after_fils integer NOT NULL,
     type text NOT NULL,
     related_booking_id varchar,
     related_referral_id varchar,
     description text,
     created_by text NOT NULL DEFAULT 'system',
     created_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_tx_player_created
     ON wallet_transactions (player_id, created_at)`,
  // APPEND-ONLY enforcement at the DB level: any UPDATE or DELETE raises.
  // Corrections are new offsetting 'adjustment' rows, never edits.
  `CREATE OR REPLACE FUNCTION wallet_tx_append_only() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'wallet_transactions is append-only — corrections are new offsetting entries';
   END $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_wallet_tx_append_only ON wallet_transactions`,
  `CREATE TRIGGER trg_wallet_tx_append_only
     BEFORE UPDATE OR DELETE ON wallet_transactions
     FOR EACH ROW EXECUTE FUNCTION wallet_tx_append_only()`,
];

for (const sqlText of statements) {
  await pool.query(sqlText);
  console.log('OK: ' + sqlText.trim().split('\n')[0]);
}
const cols = await pool.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'wallet_transactions' ORDER BY ordinal_position`
);
console.log('wallet_transactions columns: ' + cols.rows.map(r => r.column_name).join(', '));
await pool.end();
