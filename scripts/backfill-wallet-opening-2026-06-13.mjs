// One-time wallet ledger backfill — writes ONE opening 'balance_import' entry
// per player whose balance is not yet explained by their ledger. The amount is
// the DELTA (current wallet_balance − sum of existing wallet_transactions),
// NOT the raw balance — players may have transacted between deploy and this
// backfill, and those writes are already ledgered. Players whose delta is zero
// are skipped. Idempotent: re-running finds delta 0 everywhere and writes
// nothing. Origin of the imported amount is unverifiable (pre-ledger) and the
// description says so. Run AFTER migration + deploy.
// Run with: TZ=UTC node scripts/backfill-wallet-opening-2026-06-13.mjs
import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { rows } = await pool.query(`
  SELECT p.id, p.name, p.wallet_balance,
         COALESCE(SUM(wt.amount_fils), 0)::int AS ledger_sum,
         (p.wallet_balance - COALESCE(SUM(wt.amount_fils), 0))::int AS delta
  FROM players p
  LEFT JOIN wallet_transactions wt ON wt.player_id = p.id
  GROUP BY p.id, p.name, p.wallet_balance
  HAVING p.wallet_balance <> COALESCE(SUM(wt.amount_fils), 0)
  ORDER BY p.wallet_balance DESC
`);
console.log(`Players whose balance is not yet ledger-explained: ${rows.length}`);

let written = 0;
for (const p of rows) {
  // balance_after = the current balance: opening delta + existing ledger sum.
  await pool.query(
    `INSERT INTO wallet_transactions
       (id, player_id, amount_fils, balance_after_fils, type, description, created_by)
     VALUES ($1, $2, $3, $4, 'balance_import',
       'Opening balance import — accumulated before the ledger existed; origin unverifiable',
       'system')`,
    [randomUUID(), p.id, p.delta, p.wallet_balance]
  );
  console.log(
    `  opened ${p.name ?? p.id}: delta ${p.delta} fils (balance ${p.wallet_balance}, ` +
    `pre-existing ledger ${p.ledger_sum}) → AED ${(p.delta / 100).toFixed(2)} imported`
  );
  written++;
}
console.log(`Done. ${written} opening entr${written === 1 ? 'y' : 'ies'} written.`);

// Immediate verification: any mismatches left?
const check = await pool.query(`
  SELECT count(*)::int AS bad FROM (
    SELECT p.id FROM players p
    LEFT JOIN wallet_transactions wt ON wt.player_id = p.id
    GROUP BY p.id, p.wallet_balance
    HAVING p.wallet_balance <> COALESCE(SUM(wt.amount_fils), 0)
  ) t
`);
console.log(`Post-backfill mismatches: ${check.rows[0].bad} (expect 0)`);
await pool.end();
