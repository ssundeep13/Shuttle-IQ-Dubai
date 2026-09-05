// One player, one fixed wallet credit, one ledger row.
//
//   npx tsx scripts/wallet-credit-one.mts --player SIQ-00517 --amount-fils 9800 --label "why — who — when"
//   ... add --execute to actually write (omitted = dry run, writes nothing)
//   optional: --type adjustment (default)   --created-by admin (default)
//
// --player accepts a player id or a SIQ number. --amount-fils must be a whole
// number of fils greater than zero (this script credits; debits go through
// the app's own paths). --label becomes the ledger description verbatim AND
// the idempotency key: a player already holding a ledger row with that exact
// description is skipped, so a re-run can never double-credit.
//
// HOW IT PAYS: applyWalletDelta only, inside one transaction — the balance
// UPDATE and the append-only ledger row land together or not at all. No raw
// SQL touches balances or the ledger here.
//
// After a write it replays the player's whole ledger (prev + amount ==
// balance_after, row by row) and compares the final figure to
// players.wallet_balance, so the proof of integrity is in the same output.
import { pool, db } from '../server/db';
import { applyWalletDelta } from '../server/walletLedger';
import { WALLET_TRANSACTION_TYPES, type WalletTransactionType } from '../shared/schema';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const EXECUTE = args.includes('--execute');
const PLAYER_ARG = flag('--player');
const AMOUNT_FILS = Number(flag('--amount-fils'));
const LABEL = flag('--label');
const TYPE = (flag('--type') ?? 'adjustment') as WalletTransactionType;
const CREATED_BY = flag('--created-by') ?? 'admin';

function usage(msg: string): never {
  console.error(`ERROR: ${msg}`);
  console.error('Usage: npx tsx scripts/wallet-credit-one.mts --player <playerId|SIQ-xxxxx> --amount-fils <n> --label "<text>" [--type adjustment] [--created-by admin] [--execute]');
  process.exit(1);
}
if (!PLAYER_ARG) usage('--player is required');
if (!Number.isInteger(AMOUNT_FILS) || AMOUNT_FILS <= 0) usage('--amount-fils must be a whole number greater than 0');
if (!LABEL || !LABEL.trim()) usage('--label is required');
if (!(WALLET_TRANSACTION_TYPES as readonly string[]).includes(TYPE)) usage(`--type must be one of: ${WALLET_TRANSACTION_TYPES.join(', ')}`);

// ── Resolve the player ───────────────────────────────────────────────────────
const bySiq = /^SIQ-/i.test(PLAYER_ARG);
const player = (await pool.query(
  `SELECT id, shuttle_iq_id, name, wallet_balance FROM players WHERE ${bySiq ? 'upper(shuttle_iq_id) = upper($1)' : 'id = $1'}`,
  [PLAYER_ARG],
)).rows[0] as { id: string; shuttle_iq_id: string | null; name: string; wallet_balance: number } | undefined;
if (!player) usage(`no player matches ${PLAYER_ARG}`);

const before = Number(player.wallet_balance);
console.log(`PLAYER   ${player.name}  (${player.shuttle_iq_id ?? 'no SIQ'}, ${player.id})`);
console.log(`BALANCE  ${before} fils  (AED ${(before / 100).toFixed(2)})`);

// ── Idempotency: same player + identical description = already done ─────────
const existing = (await pool.query(
  `SELECT id, amount_fils, created_at::text AS created_at FROM wallet_transactions WHERE player_id = $1 AND description = $2 ORDER BY created_at`,
  [player.id, LABEL],
)).rows as { id: string; amount_fils: number; created_at: string }[];
if (existing.length > 0) {
  console.log(`SKIP     a ledger row with this exact description already exists for this player:`);
  for (const e of existing) console.log(`         ${e.id}  ${e.amount_fils} fils  ${e.created_at} UTC`);
  console.log('Nothing written.');
  await pool.end();
  process.exit(0);
}

// ── The row that would be written ────────────────────────────────────────────
console.log(`\nWOULD ${EXECUTE ? 'WRITE' : 'WRITE (dry run)'}:`);
console.log(`  UPDATE players SET wallet_balance = ${before} + ${AMOUNT_FILS} = ${before + AMOUNT_FILS}   (AED ${((before + AMOUNT_FILS) / 100).toFixed(2)})`);
console.log(`  INSERT wallet_transactions`);
console.log(`    id                  = <uuid at write>`);
console.log(`    player_id           = ${player.id}`);
console.log(`    amount_fils         = ${AMOUNT_FILS}`);
console.log(`    balance_after_fils  = ${before + AMOUNT_FILS}`);
console.log(`    type                = '${TYPE}'`);
console.log(`    related_booking_id  = NULL`);
console.log(`    related_referral_id = NULL`);
console.log(`    description         = '${LABEL}'`);
console.log(`    created_by          = '${CREATED_BY}'`);
console.log(`    created_at          = now()`);

if (!EXECUTE) {
  console.log('\nDRY RUN — nothing written. Re-run with --execute to credit.');
  await pool.end();
  process.exit(0);
}

// ── Write: applyWalletDelta inside one transaction ───────────────────────────
const result = await db.transaction(async (tx) => {
  const res = await applyWalletDelta(tx, {
    playerId: player.id,
    deltaFils: AMOUNT_FILS,
    type: TYPE,
    relatedBookingId: null,
    relatedReferralId: null,
    description: LABEL,
    createdBy: CREATED_BY,
  });
  if (!res) throw new Error('applyWalletDelta refused — nothing written');
  return res;
});

const inserted = (await pool.query(
  `SELECT id, created_at::text AS created_at FROM wallet_transactions WHERE player_id = $1 AND description = $2 ORDER BY created_at DESC LIMIT 1`,
  [player.id, LABEL],
)).rows[0] as { id: string; created_at: string };
console.log(`\nWRITTEN  ${before} → ${result.balanceAfterFils} fils   ledger row ${inserted.id}  (${inserted.created_at} UTC)`);

// ── Replay proof ─────────────────────────────────────────────────────────────
const rows = (await pool.query(
  `SELECT id, amount_fils, balance_after_fils, type, created_at::text AS created_at FROM wallet_transactions WHERE player_id = $1 ORDER BY created_at, id`,
  [player.id],
)).rows as { id: string; amount_fils: number; balance_after_fils: number; type: string; created_at: string }[];
let prev = 0, rowMismatches = 0;
for (const r of rows) {
  const ok = prev + Number(r.amount_fils) === Number(r.balance_after_fils);
  if (!ok) rowMismatches++;
  console.log(`  ${ok ? 'ok ' : 'BAD'} ${r.created_at} ${String(r.type).padEnd(18)} ${String(r.amount_fils).padStart(7)} → ${String(r.balance_after_fils).padStart(7)}`);
  prev = Number(r.balance_after_fils);
}
const finalBalance = Number((await pool.query(`SELECT wallet_balance FROM players WHERE id = $1`, [player.id])).rows[0].wallet_balance);
const finalMismatch = finalBalance === prev ? 0 : 1;
console.log(`REPLAY   ${rows.length} rows, ${rowMismatches} row mismatch(es); ledger end ${prev} vs balance ${finalBalance} → ${finalMismatch} mismatch`);
console.log(rowMismatches + finalMismatch === 0 ? 'Balance replays exactly from the ledger.' : '*** LEDGER INTEGRITY FAILURE — INVESTIGATE ***');

await pool.end();
process.exit(rowMismatches + finalMismatch === 0 ? 0 : 2);
