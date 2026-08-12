// Smash Dubailand goodwill credit — AED 15 per player, per session.
//
//   npx tsx scripts/dubailand-goodwill-credit.mts <sessionId> --mode booked
//   npx tsx scripts/dubailand-goodwill-credit.mts <sessionId> --mode booked-or-played
//   ... add --include-pending to also credit unpaid/awaiting-payment holders
//   ... add --execute to actually write (omitted = dry run, writes nothing)
//
// SESSION ID: pass either the OPERATIONAL session id (sessions.id) or the
// bookable session id — both resolve to the same pair. The idempotency marker
// always uses the OPERATIONAL id, so passing the other id on a later run can
// never double-credit the same session.
//
// MODES
//   booked           — qualified = holds an ACTIVE slot on this session.
//                      Credit lands as soon as they book; no waiting for the
//                      session to end. Re-run as new bookings arrive.
//   booked-or-played — the above PLUS anyone with recorded game participation.
//                      For sessions already played where guests/walk-ins have
//                      no booking of their own (10 Aug).
//
// WHO IS "ACTIVE" (the spot-holder rule, matching the app's own display rule):
//   A. Booking holder: booking status confirmed/attended AND their own
//      is_primary slot is not cancelled. A booker who cancelled just their own
//      spot (Option A) keeps the booking alive for their guests but is NOT
//      playing — so they are NOT credited.
//   B. Guest slot: a non-primary booking_guests row with status 'confirmed' on
//      a confirmed booking, linked to a marketplace user with a player.
//   Bookings still awaiting payment ('pending' / 'pending_payment') are NOT
//   counted by default — they have not secured a spot. They are listed in the
//   dry run and can be included with --include-pending.
//
// HOW IT PAYS: applyWalletDelta only — balance UPDATE plus the append-only
// ledger row on one transaction handle. No raw SQL touches money.
//
// IDEMPOTENT: the ledger description is "Dubailand goodwill · session <id>".
// A player already holding that exact marker for this session is skipped, so
// re-running as bookings trickle in never double-pays.
//
// CAP: AED 45 per player across the promo — a player already holding 3
// "Dubailand goodwill" markers is skipped and reported, even on a new session.
import { pool, db } from '../server/db';
import { applyWalletDelta } from '../server/walletLedger';

const CREDIT_FILS = 1500;          // AED 15
const MAX_CREDITS_PER_PLAYER = 3;  // AED 45 ceiling across the promo
const MARKER_PREFIX = 'Dubailand goodwill · session ';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const INCLUDE_PENDING = args.includes('--include-pending');
// A player row with no marketplace account cannot SEE or spend a wallet credit
// (the wallet is only reachable through the app). Usually it means a captain-
// created walk-in duplicate of an account the same human already has — credit
// that record and the money is stranded, and the human is paid twice.
const SKIP_UNLINKED = args.includes('--skip-unlinked');
const modeIdx = args.indexOf('--mode');
const MODE = modeIdx >= 0 ? args[modeIdx + 1] : undefined;
const INPUT_ID = args.find((a, i) => !a.startsWith('--') && i !== modeIdx + 1);

if (!INPUT_ID || (MODE !== 'booked' && MODE !== 'booked-or-played')) {
  console.error('Usage: npx tsx scripts/dubailand-goodwill-credit.mts <sessionId> --mode booked|booked-or-played [--include-pending] [--execute]');
  process.exit(1);
}

const ACTIVE_BOOKING_STATUSES = INCLUDE_PENDING
  ? ['confirmed', 'attended', 'pending', 'pending_payment']
  : ['confirmed', 'attended'];
const ACTIVE_GUEST_STATUSES = INCLUDE_PENDING ? ['confirmed', 'pending'] : ['confirmed'];

// ── Resolve the session pair from either id ─────────────────────────────────
const [pair] = (await pool.query(
  `SELECT s.id  AS ops_id, s.venue_name, s.date, s.status AS ops_status,
          bs.id AS bookable_id, bs.title, bs.start_time, bs.venue_location
     FROM sessions s
     LEFT JOIN bookable_sessions bs ON bs.linked_session_id = s.id
    WHERE s.id = $1 OR bs.id = $1`,
  [INPUT_ID],
)).rows;

if (!pair) {
  console.error(`No session found for id ${INPUT_ID} (tried sessions.id and bookable_sessions.id)`);
  process.exit(1);
}

const OPS_ID: string = pair.ops_id;
const BOOKABLE_ID: string | null = pair.bookable_id;
const marker = `${MARKER_PREFIX}${OPS_ID}`;
const uaeDate = new Date(pair.date).toLocaleDateString('en-GB', {
  timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});

interface Row {
  playerId: string;
  playerName: string;
  personName: string;
  bookingId: string | null;
  source: 'booking' | 'guest' | 'played';
  balanceFils: number;
  alreadyCredited: boolean;
  promoCredits: number;
  hasAccount: boolean;
}

const byPlayer = new Map<string, Row>();
const excludedPending: { personName: string; status: string; kind: string }[] = [];
const excludedPrimaryCancelled: { personName: string; playerId: string }[] = [];

if (BOOKABLE_ID) {
  // A — booking holders whose OWN primary slot is still active.
  const holders = (await pool.query(
    `SELECT mu.linked_player_id AS "playerId", p.name AS "playerName", mu.name AS "personName",
            b.id AS "bookingId", p.wallet_balance AS "balanceFils",
            EXISTS (SELECT 1 FROM booking_guests bg
                     WHERE bg.booking_id = b.id AND bg.is_primary AND bg.status = 'cancelled') AS "primaryCancelled"
       FROM bookings b
       JOIN marketplace_users mu ON mu.id = b.user_id
       JOIN players p ON p.id = mu.linked_player_id
      WHERE b.session_id = $1 AND b.status = ANY($2)
      ORDER BY mu.name`,
    [BOOKABLE_ID, ACTIVE_BOOKING_STATUSES],
  )).rows;

  for (const h of holders as any[]) {
    if (h.primaryCancelled) {
      excludedPrimaryCancelled.push({ personName: h.personName, playerId: h.playerId });
      continue;
    }
    byPlayer.set(h.playerId, {
      playerId: h.playerId, playerName: h.playerName, personName: h.personName,
      bookingId: h.bookingId, source: 'booking', balanceFils: h.balanceFils,
      alreadyCredited: false, promoCredits: 0, hasAccount: true,
    });
  }

  // B — active guest slots on qualifying bookings.
  const guests = (await pool.query(
    `SELECT mu.linked_player_id AS "playerId", p.name AS "playerName", bg.name AS "personName",
            b.id AS "bookingId", p.wallet_balance AS "balanceFils"
       FROM booking_guests bg
       JOIN bookings b ON b.id = bg.booking_id
       JOIN marketplace_users mu ON mu.id = bg.linked_user_id
       JOIN players p ON p.id = mu.linked_player_id
      WHERE b.session_id = $1 AND b.status = ANY($2)
        AND bg.is_primary = false AND bg.status = ANY($3)
      ORDER BY bg.name`,
    [BOOKABLE_ID, ACTIVE_BOOKING_STATUSES, ACTIVE_GUEST_STATUSES],
  )).rows;

  for (const g of guests as any[]) {
    if (!byPlayer.has(g.playerId)) {
      byPlayer.set(g.playerId, {
        playerId: g.playerId, playerName: g.playerName, personName: g.personName,
        bookingId: g.bookingId, source: 'guest', balanceFils: g.balanceFils,
        alreadyCredited: false, promoCredits: 0, hasAccount: true,
      });
    }
  }

  // Visibility: awaiting-payment rows deliberately left out (unless flagged in).
  if (!INCLUDE_PENDING) {
    const pend = (await pool.query(
      `SELECT mu.name AS "personName", b.status, 'booking' AS kind
         FROM bookings b JOIN marketplace_users mu ON mu.id = b.user_id
        WHERE b.session_id = $1 AND b.status IN ('pending','pending_payment')
        UNION ALL
       SELECT bg.name AS "personName", bg.status, 'guest slot' AS kind
         FROM booking_guests bg JOIN bookings b ON b.id = bg.booking_id
        WHERE b.session_id = $1 AND bg.is_primary = false AND bg.status = 'pending'`,
      [BOOKABLE_ID],
    )).rows;
    excludedPending.push(...(pend as any[]));
  }
}

// C — actually played (mode booked-or-played only).
if (MODE === 'booked-or-played') {
  const played = (await pool.query(
    `SELECT DISTINCT p.id AS "playerId", p.name AS "playerName", p.name AS "personName",
            p.wallet_balance AS "balanceFils"
       FROM game_participants gp
       JOIN game_results gr ON gr.id = gp.game_id
       JOIN players p ON p.id = gp.player_id
      WHERE gr.session_id = $1
      ORDER BY p.name`,
    [OPS_ID],
  )).rows;
  for (const pl of played as any[]) {
    if (!byPlayer.has(pl.playerId)) {
      byPlayer.set(pl.playerId, {
        playerId: pl.playerId, playerName: pl.playerName, personName: pl.personName,
        bookingId: null, source: 'played', balanceFils: pl.balanceFils,
        alreadyCredited: false, promoCredits: 0, hasAccount: false, // resolved below
      });
    }
  }
}

const rows = [...byPlayer.values()];

// Idempotency + promo cap, both read from the ledger.
if (rows.length > 0) {
  const ids = rows.map(r => r.playerId);
  const credited = new Set(
    (await pool.query(`SELECT DISTINCT player_id FROM wallet_transactions WHERE description = $1`, [marker]))
      .rows.map((r: { player_id: string }) => r.player_id),
  );
  const promoCounts = new Map<string, number>(
    (await pool.query(
      `SELECT player_id, count(*)::int AS n FROM wallet_transactions
        WHERE description LIKE $1 || '%' AND player_id = ANY($2) GROUP BY player_id`,
      [MARKER_PREFIX, ids],
    )).rows.map((r: { player_id: string; n: number }) => [r.player_id, r.n]),
  );
  for (const r of rows) {
    r.alreadyCredited = credited.has(r.playerId);
    r.promoCredits = promoCounts.get(r.playerId) ?? 0;
  }

  // Reachability: which of these player rows can actually see a wallet?
  const linked = new Set(
    (await pool.query(
      `SELECT DISTINCT linked_player_id FROM marketplace_users WHERE linked_player_id = ANY($1)`, [ids],
    )).rows.map((r: { linked_player_id: string }) => r.linked_player_id),
  );
  for (const r of rows) r.hasAccount = linked.has(r.playerId);
}

// Same-human warning: two player rows whose names share a normalised first
// token (the live duplicate-player class — a captain walk-in beside the
// person's own account). Warning only; never auto-merges or auto-skips.
const nameKey = (n: string) => String(n).trim().toLowerCase().split(/\s+/)[0];
const dupeGroups = new Map<string, Row[]>();
for (const r of rows) {
  const k = nameKey(r.playerName);
  if (!dupeGroups.has(k)) dupeGroups.set(k, []);
  dupeGroups.get(k)!.push(r);
}
const suspectedDupes = [...dupeGroups.values()].filter(g => g.length > 1);

const eligible = (r: Row) =>
  !r.alreadyCredited && r.promoCredits < MAX_CREDITS_PER_PLAYER && !(SKIP_UNLINKED && !r.hasAccount);
const atCap = rows.filter(r => !r.alreadyCredited && r.promoCredits >= MAX_CREDITS_PER_PLAYER);
const toCredit = rows.filter(eligible);
const skipped = rows.filter(r => r.alreadyCredited);
const unlinked = rows.filter(r => !r.hasAccount);

console.log(`\nDubailand goodwill — AED ${CREDIT_FILS / 100} (${CREDIT_FILS} fils) per player`);
console.log(`Session : ${pair.title ?? pair.venue_name}`);
console.log(`          ${uaeDate} (UAE)  ${pair.start_time ?? ''}  ${pair.venue_location ?? pair.venue_name}`);
console.log(`          ops ${OPS_ID} [${pair.ops_status}]   bookable ${BOOKABLE_ID ?? '— none linked —'}`);
console.log(`Mode    : ${MODE}${INCLUDE_PENDING ? '  +include-pending' : ''}`);
console.log(`Ledger  : type='adjustment'  created_by='admin'  description='${marker}'\n`);

console.log(`QUALIFYING (${rows.length})`);
if (rows.length === 0) {
  console.log('  (nobody qualifies yet)');
} else {
  console.log('  ' + 'person'.padEnd(26) + 'src'.padEnd(9) + 'balance'.padEnd(10) + 'new'.padEnd(10) + 'action');
  console.log('  ' + '-'.repeat(74));
  for (const r of rows.sort((a, b) => String(a.personName).localeCompare(String(b.personName)))) {
    const willCredit = eligible(r);
    const next = willCredit ? r.balanceFils + CREDIT_FILS : r.balanceFils;
    console.log('  ' + String(r.personName).slice(0, 25).padEnd(26)
      + r.source.padEnd(9)
      + String(r.balanceFils).padEnd(10)
      + String(next).padEnd(10)
      + (r.alreadyCredited ? 'SKIP — already credited this session'
        : r.promoCredits >= MAX_CREDITS_PER_PLAYER ? `SKIP — at AED ${MAX_CREDITS_PER_PLAYER * CREDIT_FILS / 100} promo cap`
        : !r.hasAccount ? (SKIP_UNLINKED ? 'SKIP — no app account (unreachable)' : 'CREDIT +1500  ** no app account **')
        : 'CREDIT +1500'));
  }
  console.log('  ' + '-'.repeat(74));
}
console.log(`  to credit: ${toCredit.length}   already credited: ${skipped.length}   at cap: ${atCap.length}`);
console.log(`  payout this run: ${toCredit.length} x ${CREDIT_FILS} = ${toCredit.length * CREDIT_FILS} fils (AED ${toCredit.length * CREDIT_FILS / 100})\n`);

if (unlinked.length > 0) {
  console.log(`WARNING — qualifying player rows with NO app account (${unlinked.length}): a wallet credit here is`);
  console.log(`  unreachable until that row is linked/merged. Usually a captain walk-in duplicate of an existing`);
  console.log(`  account. ${SKIP_UNLINKED ? 'Skipped this run (--skip-unlinked).' : 'Credited this run — pass --skip-unlinked to hold them back.'}`);
  for (const u of unlinked) console.log(`  ${String(u.playerName).slice(0, 25).padEnd(26)} player ${u.playerId}  [${u.source}]`);
  console.log('');
}
if (suspectedDupes.length > 0) {
  console.log(`WARNING — possible same-human duplicates in this run (name match). Verify before crediting:`);
  for (const g of suspectedDupes) {
    for (const r of g) console.log(`  ${String(r.playerName).slice(0, 25).padEnd(26)} player ${r.playerId}  [${r.source}]  account=${r.hasAccount ? 'yes' : 'NO'}`);
    console.log('  ---');
  }
  console.log('');
}
if (excludedPrimaryCancelled.length > 0) {
  console.log(`NOT COUNTED — booker cancelled their OWN spot, booking still live for guests (${excludedPrimaryCancelled.length}):`);
  for (const e of excludedPrimaryCancelled) console.log(`  ${e.personName}  (player ${e.playerId})`);
  console.log('');
}
if (excludedPending.length > 0) {
  console.log(`NOT COUNTED — awaiting payment, no secured spot (${excludedPending.length}) — add --include-pending to credit these:`);
  for (const e of excludedPending) console.log(`  ${String(e.personName).padEnd(26)} ${e.kind} [${e.status}]`);
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
      deltaFils: CREDIT_FILS,
      type: 'adjustment',
      relatedBookingId: r.bookingId ?? undefined,
      description: marker,
      createdBy: 'admin',
    });
    if (!res) throw new Error(`applyWalletDelta refused for player ${r.playerId} (${r.personName}) — aborting, nothing written`);
    written.push({ name: r.personName, playerId: r.playerId, balanceAfter: res.balanceAfterFils });
  }
});

console.log(`CREDITED ${written.length} player(s):`);
for (const w of written) console.log('  ' + String(w.name).slice(0, 25).padEnd(26) + 'new balance ' + w.balanceAfter + ' fils');

// Post-write proof: every touched balance must replay from the ledger.
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
