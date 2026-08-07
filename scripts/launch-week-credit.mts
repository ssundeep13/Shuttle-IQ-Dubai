// Launch-week AED 15 wallet credit — one session per run.
//
//   npx tsx scripts/launch-week-credit.mts <sessionId>            # dry run, writes nothing
//   npx tsx scripts/launch-week-credit.mts <sessionId> --execute  # credit
//   npx tsx scripts/launch-week-credit.mts <sessionId> --label "Dubailand promo" --execute
//
// --label sets the ledger description AND idempotency key as
// "<label> · session <id>". Omitted, it defaults to "launch week credit" so
// every past run stays matched and re-runs stay idempotent.
//
// WHO QUALIFIES — paid AND played:
//   A. Booking holders: a CONFIRMED booking on this session with amount_aed > 0
//      and attended_at set. Excludes AED 0 bookings, cancelled, and unpaid
//      waitlisted/pending rows.
//   B. Paid guest slots: a CONFIRMED non-primary guest on a confirmed, paid
//      booking, linked to a marketplace user with an operational player.
//      A guest has no booking of their own, so there is no attended_at to read —
//      their attendance proof is direct match participation in the session's
//      linked operational session. Guests with no participation are SKIPPED and
//      listed, never silently dropped.
//
// HOW IT PAYS: applyWalletDelta only — balance UPDATE and the append-only ledger
// row on one transaction handle. No raw SQL touches money. Type 'adjustment',
// which is in the declared enum and already has live write paths
// (walletLedger.applyClawbackWithFloor, playerMerge).
//
// IDEMPOTENT: the ledger description is a deterministic marker containing the
// session id. A player already holding that exact marker is skipped, so re-runs
// never double-pay. All credits for a run share ONE transaction — a failure
// anywhere writes nothing and the run can simply be repeated.
import { pool, db } from '../server/db';
import { applyWalletDelta } from '../server/walletLedger';

const LAUNCH_CREDIT_FILS = 1500;
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const labelIdx = args.indexOf('--label');
const LABEL = labelIdx >= 0 && args[labelIdx + 1] ? args[labelIdx + 1] : 'launch week credit';
// The session id is the first non-flag arg that is NOT the --label value.
const SESSION_ID = args.find((a, i) => !a.startsWith('--') && i !== labelIdx + 1);

if (!SESSION_ID) {
  console.error('Usage: npx tsx scripts/launch-week-credit.mts <sessionId> [--label "<promo label>"] [--execute]');
  process.exit(1);
}

/** The idempotency key AND the finance trace, in one string. */
const marker = (sessionId: string) => `${LABEL} · session ${sessionId}`;

interface Row {
  playerId: string;
  playerName: string;
  personName: string;
  bookingId: string;
  source: 'booking' | 'guest';
  paidAed: number;
  balanceFils: number;
  alreadyCredited: boolean;
}

const [session] = (await pool.query(
  `SELECT id, title, date, start_time, end_time, status, venue_name, linked_session_id
     FROM bookable_sessions WHERE id = $1`,
  [SESSION_ID],
)).rows;
if (!session) {
  console.error(`No bookable session with id ${SESSION_ID}`);
  process.exit(1);
}

// A — paid booking holders who attended.
const holders = (await pool.query(
  `SELECT mu.linked_player_id AS "playerId", p.name AS "playerName", mu.name AS "personName",
          b.id AS "bookingId", b.amount_aed AS "paidAed", p.wallet_balance AS "balanceFils"
     FROM bookings b
     JOIN marketplace_users mu ON mu.id = b.user_id
     JOIN players p ON p.id = mu.linked_player_id
    WHERE b.session_id = $1
      AND b.status = 'confirmed'
      AND b.amount_aed > 0
      AND b.attended_at IS NOT NULL
    ORDER BY mu.name`,
  [SESSION_ID],
)).rows;

// B — paid guest slots, attendance proven by match participation.
const guests = (await pool.query(
  `SELECT mu.linked_player_id AS "playerId", p.name AS "playerName", bg.name AS "personName",
          b.id AS "bookingId", b.amount_aed AS "paidAed", p.wallet_balance AS "balanceFils",
          COALESCE((SELECT count(*) FROM game_participants gp
                      JOIN game_results gr ON gr.id = gp.game_id
                     WHERE gp.player_id = mu.linked_player_id
                       AND gr.session_id = $2), 0)::int AS "games"
     FROM booking_guests bg
     JOIN bookings b ON b.id = bg.booking_id
     JOIN marketplace_users mu ON mu.id = bg.linked_user_id
     JOIN players p ON p.id = mu.linked_player_id
    WHERE b.session_id = $1
      AND bg.is_primary = false
      AND bg.status = 'confirmed'
      AND b.status = 'confirmed'
      AND b.amount_aed > 0
    ORDER BY bg.name`,
  [SESSION_ID, session.linked_session_id],
)).rows;

const guestsPlayed = guests.filter((g: any) => g.games > 0);
const guestsNoPlay = guests.filter((g: any) => g.games === 0);

// Merge, de-duplicating by player: a booking holder outranks a guest slot.
const byPlayer = new Map<string, Row>();
for (const h of holders as any[]) {
  byPlayer.set(h.playerId, { ...h, source: 'booking', alreadyCredited: false });
}
for (const g of guestsPlayed as any[]) {
  if (!byPlayer.has(g.playerId)) byPlayer.set(g.playerId, { ...g, source: 'guest', alreadyCredited: false });
}
const rows = [...byPlayer.values()];

// Idempotency: who already holds this session's marker?
const credited = new Set(
  (await pool.query(
    `SELECT DISTINCT player_id FROM wallet_transactions WHERE description = $1`,
    [marker(SESSION_ID)],
  )).rows.map((r: { player_id: string }) => r.player_id),
);
for (const r of rows) r.alreadyCredited = credited.has(r.playerId);

const toCredit = rows.filter(r => !r.alreadyCredited);
const skipped = rows.filter(r => r.alreadyCredited);

console.log(`\nLaunch-week credit — AED ${LAUNCH_CREDIT_FILS / 100} (${LAUNCH_CREDIT_FILS} fils)`);
console.log(`Session : ${session.title}`);
console.log(`          ${String(session.date).slice(0, 15)}  ${session.start_time}-${session.end_time}  ${session.venue_name}`);
console.log(`          ${session.id}  [${session.status}]`);
console.log(`Ledger  : type='adjustment'  created_by='admin'  description='${marker(SESSION_ID)}'\n`);

console.log(`QUALIFYING (${rows.length}) — ${holders.length} paid attendees + ${guestsPlayed.length} paid guests`);
console.log('  ' + 'player'.padEnd(26) + 'src'.padEnd(9) + 'paid'.padEnd(9) + 'balance'.padEnd(10) + 'new'.padEnd(10) + 'action');
console.log('  ' + '-'.repeat(78));
for (const r of rows.sort((a, b) => a.personName.localeCompare(b.personName))) {
  const next = r.alreadyCredited ? r.balanceFils : r.balanceFils + LAUNCH_CREDIT_FILS;
  console.log('  ' + String(r.personName).slice(0, 25).padEnd(26)
    + r.source.padEnd(9)
    + ('AED ' + r.paidAed).padEnd(9)
    + String(r.balanceFils).padEnd(10)
    + String(next).padEnd(10)
    + (r.alreadyCredited ? 'SKIP — already credited' : 'CREDIT +1500'));
}
console.log('  ' + '-'.repeat(78));
console.log(`  to credit: ${toCredit.length}   already credited: ${skipped.length}`);
console.log(`  payout this run: ${toCredit.length} x 1500 = ${toCredit.length * LAUNCH_CREDIT_FILS} fils (AED ${toCredit.length * LAUNCH_CREDIT_FILS / 100})\n`);

if (guestsNoPlay.length > 0) {
  console.log(`GUESTS SKIPPED — paid slot but no match participation (${guestsNoPlay.length}):`);
  for (const g of guestsNoPlay as any[]) console.log(`  ${g.personName}  (player ${g.playerId})`);
  console.log('');
}

if (!EXECUTE) {
  console.log('DRY RUN — nothing written. Re-run with --execute to credit.');
  await pool.end();
  process.exit(0);
}

if (toCredit.length === 0) {
  console.log('Nothing to credit — every qualifying player already holds this session\'s credit.');
  await pool.end();
  process.exit(0);
}

// One transaction for the whole run: a failure anywhere writes nothing.
const written: { name: string; playerId: string; balanceAfter: number }[] = [];
await db.transaction(async (tx) => {
  for (const r of toCredit) {
    const res = await applyWalletDelta(tx, {
      playerId: r.playerId,
      deltaFils: LAUNCH_CREDIT_FILS,
      type: 'adjustment',
      relatedBookingId: r.bookingId,
      description: marker(SESSION_ID),
      createdBy: 'admin',
    });
    if (!res) throw new Error(`applyWalletDelta refused for player ${r.playerId} (${r.personName}) — aborting, nothing written`);
    written.push({ name: r.personName, playerId: r.playerId, balanceAfter: res.balanceAfterFils });
  }
});

console.log(`CREDITED ${written.length} player(s):`);
for (const w of written) console.log('  ' + String(w.name).slice(0, 25).padEnd(26) + 'new balance ' + w.balanceAfter + ' fils');

// Post-write proof: balance must replay from the ledger for everyone touched.
const check = (await pool.query(
  `SELECT p.name, p.wallet_balance AS balance,
          COALESCE((SELECT SUM(wt.amount_fils) FROM wallet_transactions wt WHERE wt.player_id = p.id), 0) AS ledger_sum
     FROM players p WHERE p.id = ANY($1)`,
  [written.map(w => w.playerId)],
)).rows;
const mismatches = check.filter((c: any) => Number(c.balance) !== Number(c.ledger_sum));
console.log(`\nINTEGRITY: ${check.length} credited players checked, ${mismatches.length} mismatch(es).`);
for (const m of mismatches as any[]) console.log(`  MISMATCH ${m.name}: balance ${m.balance} vs ledger ${m.ledger_sum}`);
console.log(mismatches.length === 0 ? 'All balances replay exactly from the ledger.' : '*** LEDGER INTEGRITY FAILURE — INVESTIGATE ***');

await pool.end();
process.exit(0);
