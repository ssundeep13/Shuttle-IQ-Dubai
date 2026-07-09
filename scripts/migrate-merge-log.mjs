// Gate M1 migration — creates player_merge_log. ADDITIVE ONLY: no existing
// table is touched. Hand-run with dry-run discipline:
//   node scripts/migrate-merge-log.mjs --dry-run   (prints SQL + current state)
//   node scripts/migrate-merge-log.mjs --apply
import pg from 'pg';

const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const SQL = `
CREATE TABLE IF NOT EXISTS player_merge_log (
  id varchar PRIMARY KEY,
  survivor_id varchar NOT NULL,
  absorbed_id varchar NOT NULL,
  admin_id varchar NOT NULL,
  absorbed_snapshot jsonb NOT NULL,
  survivor_snapshot jsonb NOT NULL,
  repointed jsonb NOT NULL,
  restore_rows jsonb NOT NULL,
  wallet_moved_fils integer NOT NULL DEFAULT 0,
  wallet_debit_tx_id varchar,
  wallet_credit_tx_id varchar,
  account_link_moved_user_id varchar,
  status text NOT NULL DEFAULT 'applied',
  created_at timestamp NOT NULL DEFAULT now(),
  undone_at timestamp,
  undone_by_admin_id varchar
);`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const exists = (await db.query(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'player_merge_log'`,
)).rows[0].n > 0;
console.log(`player_merge_log currently exists: ${exists}`);
console.log(`SQL to run:\n${SQL}`);
if (MODE === 'apply') {
  await db.query(SQL);
  const after = (await db.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'player_merge_log' ORDER BY ordinal_position`,
  )).rows;
  console.log(`APPLIED. Columns (${after.length}):`);
  for (const c of after) console.log(`  ${c.column_name}: ${c.data_type}`);
} else {
  console.log('DRY RUN — nothing executed.');
}
await db.end();
