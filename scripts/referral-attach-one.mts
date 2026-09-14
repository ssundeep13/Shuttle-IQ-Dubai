// Attach ONE marketplace user to a referrer as a referral — the admin path for
// the case the 30-day self-service window (/api/referrals/link) has closed —
// and then complete it through the ORDINARY first-payment logic against the
// user's earliest confirmed booking, so the referral row and both wallet
// ledger entries are indistinguishable from organic ones.
//
//   npx tsx scripts/referral-attach-one.mts --referrer SIQ-00280 --referee-email someone@example.com \
//       --note "manual admin attach — <who asked>, <date>"
//   ... add --execute to actually write (omitted = dry run, writes nothing)
//
// --referrer accepts a SIQ number or a referral code. --note is recorded in
// system_one_shot_migrations (key = "referral-attach:<refereeUserId> — <note>")
// as the attribution + idempotency record: a second run is a SKIP.
//
// HOW IT WRITES: storage.createReferral (a plain pending row, exactly what the
// signup path inserts) and then referrals.completeReferralOnPayment, which is
// the same function the Ziina webhook / cash PATCH / admin force-confirm call.
// That function credits both wallets inside one transaction through
// applyWalletDelta only. No raw SQL touches balances, the ledger, or the
// referral row here; the pool is used for reads and for the registry row.
//
// Guards (all abort before any write): referee already has a referral row;
// referee is the referrer's own player (self-referral); referee has no
// confirmed/attended booking (nothing to complete against); registry key
// already present.
import { pool } from '../server/db';
import { storage } from '../server/storage';
import { completeReferralOnPayment } from '../server/referrals';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const EXECUTE = args.includes('--execute');
const REFERRER_ARG = flag('--referrer');
const REFEREE_EMAIL = flag('--referee-email');
const NOTE = flag('--note');
const CREDIT_FILS = 1500; // REFERRAL_CREDIT_FILS in server/referrals.ts (not exported); read back proves the real figure

function usage(msg: string): never {
  console.error(`ERROR: ${msg}`);
  console.error('Usage: npx tsx scripts/referral-attach-one.mts --referrer <SIQ-xxxxx|referral code> --referee-email <email> --note "<text>" [--execute]');
  process.exit(1);
}
if (!REFERRER_ARG) usage('--referrer is required');
if (!REFEREE_EMAIL) usage('--referee-email is required');
if (!NOTE || !NOTE.trim()) usage('--note is required');

const aed = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;

// ── Resolve both sides (reads) ────────────────────────────────────────────────
const referrer = (await pool.query(
  `SELECT id, name, shuttle_iq_id, referral_code, email, wallet_balance, leaderboard_mention, ambassador_status,
          (SELECT count(*)::int FROM referrals r WHERE r.referrer_id = players.id AND r.status = 'completed') AS completed
     FROM players WHERE upper(shuttle_iq_id) = upper($1) OR upper(referral_code) = upper($1)`,
  [REFERRER_ARG],
)).rows[0] as { id: string; name: string; shuttle_iq_id: string | null; referral_code: string | null; email: string | null; wallet_balance: number; leaderboard_mention: boolean; ambassador_status: boolean; completed: number } | undefined;
if (!referrer) usage(`no player matches referrer ${REFERRER_ARG}`);

const referee = (await pool.query(
  `SELECT u.id, u.name, u.email, u.linked_player_id, u.pending_signup_credit_fils, u.created_at::text AS created_at,
          p.name AS player_name, p.shuttle_iq_id, p.wallet_balance
     FROM marketplace_users u LEFT JOIN players p ON p.id = u.linked_player_id
    WHERE lower(u.email) = lower($1)`,
  [REFEREE_EMAIL],
)).rows[0] as { id: string; name: string; email: string; linked_player_id: string | null; pending_signup_credit_fils: number; created_at: string; player_name: string | null; shuttle_iq_id: string | null; wallet_balance: number | null } | undefined;
if (!referee) usage(`no marketplace user matches ${REFEREE_EMAIL}`);

const REGISTRY_KEY = `referral-attach:${referee.id} — ${NOTE.trim()}`;

console.log(`REFERRER  ${referrer.name}  (${referrer.shuttle_iq_id ?? 'no SIQ'}, code ${referrer.referral_code ?? 'none'}, ${referrer.id})`);
console.log(`          wallet ${referrer.wallet_balance} fils (${aed(Number(referrer.wallet_balance))}) · completed referrals ${referrer.completed} · leaderboardMention ${referrer.leaderboard_mention} · ambassador ${referrer.ambassador_status} · player email ${referrer.email ?? 'NULL'}`);
console.log(`REFEREE   ${referee.name} <${referee.email}>  (user ${referee.id}, signed up ${referee.created_at} UTC)`);
console.log(`          linked player ${referee.player_name ?? 'NONE'} (${referee.shuttle_iq_id ?? 'no SIQ'}, ${referee.linked_player_id ?? '-'}) · wallet ${referee.wallet_balance ?? 'n/a'} fils · pending signup credit ${referee.pending_signup_credit_fils} fils`);

// ── Guards ────────────────────────────────────────────────────────────────────
const existing = await storage.getReferralByRefereeUserId(referee.id);
if (existing) { console.error(`ABORT — referee already has referral ${existing.id} (status ${existing.status}, referrer ${existing.referrerId})`); process.exit(2); }
if (referee.linked_player_id && referee.linked_player_id === referrer.id) { console.error('ABORT — self-referral'); process.exit(2); }
const booking = await storage.getEarliestConfirmedBookingForUser(referee.id);
if (!booking) { console.error('ABORT — referee has no confirmed/attended booking to complete against'); process.exit(2); }
const registry = await pool.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [REGISTRY_KEY]);
if (registry.rowCount) { console.log(`SKIP — already ran at ${registry.rows[0].ran_at} (${REGISTRY_KEY})`); await pool.end(); process.exit(0); }

const bookingSession = (await pool.query(
  `SELECT bs.title, to_char(bs.date, 'YYYY-MM-DD') AS d FROM bookable_sessions bs WHERE bs.id = $1`, [booking.sessionId],
)).rows[0] as { title: string; d: string } | undefined;

// ── Plan ──────────────────────────────────────────────────────────────────────
const refereeAfter = referee.linked_player_id ? Number(referee.wallet_balance ?? 0) + CREDIT_FILS : null;
const completedAfter = referrer.completed + 1;
const milestone5 = completedAfter >= 5 && !referrer.leaderboard_mention;
const milestone10 = completedAfter >= 10 && !referrer.ambassador_status;
console.log('');
console.log('PLAN');
console.log(`  1. referrals INSERT  { referrerId: ${referrer.id}, refereeUserId: ${referee.id}, refereePlayerId: ${referee.linked_player_id ?? 'null'}, status: 'pending' }`);
console.log(`  2. completeReferralOnPayment(refereeUserId, booking ${booking.id})  ← ${bookingSession?.title ?? '?'} on ${bookingSession?.d ?? '?'}, status ${booking.status}, ${booking.paymentMethod} ${booking.amountAed} AED`);
console.log(`     → referral status completed, completion_method 'first_payment', triggering_booking_id = that booking`);
console.log(`     → wallet delta referrer  ${referrer.name}: ${referrer.wallet_balance} → ${Number(referrer.wallet_balance) + CREDIT_FILS} fils  (+${aed(CREDIT_FILS)})  type referral_reward, "Referral reward — friend completed first paid game"`);
if (referee.linked_player_id) console.log(`     → wallet delta referee   ${referee.player_name}: ${referee.wallet_balance} → ${refereeAfter} fils  (+${aed(CREDIT_FILS)})  type referral_reward, "Referral reward — welcome credit"`);
else console.log(`     → referee is UNLINKED: ${CREDIT_FILS} fils staged on pending_signup_credit_fils (${referee.pending_signup_credit_fils} → ${referee.pending_signup_credit_fils + CREDIT_FILS})`);
console.log(`     → completed referrals ${referrer.completed} → ${completedAfter}; milestone: ${milestone10 ? 'AMBASSADOR (10)' : milestone5 ? 'LEADERBOARD MENTION (5) — leaderboard_mention flips true' : 'none'}`);
console.log(`     → emails (fire-and-forget, organic): referrer credit email ${referrer.email ? `to ${referrer.email}` : 'SKIPPED (players.email is NULL)'}; friend credit email to ${referee.email}; milestone email ${milestone5 || milestone10 ? (referrer.email ? `to ${referrer.email}` : 'SKIPPED (players.email is NULL)') : 'n/a'}`);
console.log(`  3. registry INSERT system_one_shot_migrations key = "${REGISTRY_KEY}"`);

if (!EXECUTE) { console.log(''); console.log('DRY RUN — nothing written. Re-run with --execute to apply.'); await pool.end(); process.exit(0); }

// ── Execute ───────────────────────────────────────────────────────────────────
console.log('');
console.log('EXECUTING');
const recheck = await storage.getReferralByRefereeUserId(referee.id);
if (recheck) { console.error(`ABORT — a referral row appeared for the referee just now (${recheck.id}); nothing written`); await pool.end(); process.exit(2); }
const created = await storage.createReferral({
  referrerId: referrer.id,
  refereeUserId: referee.id,
  refereePlayerId: referee.linked_player_id ?? null,
  status: 'pending',
});
console.log(`  referral inserted ${created.id} (status ${created.status}, created_at ${new Date(created.createdAt).toISOString()})`);
const outcome = await completeReferralOnPayment(referee.id, booking.id);
console.log(`  completion outcome: ${JSON.stringify(outcome)}`);
if (!outcome.applied) { console.error('  completion did NOT apply — the pending row stays; use POST /api/referrals/:id/complete (admin) or investigate. Registry NOT written.'); await pool.end(); process.exit(3); }
await pool.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [REGISTRY_KEY]);

// ── Read back ─────────────────────────────────────────────────────────────────
const row = (await pool.query(
  `SELECT id, status, completion_method, triggering_booking_id, referee_player_id, created_at::text AS created_at, completed_at::text AS completed_at FROM referrals WHERE id = $1`, [created.id],
)).rows[0];
console.log('');
console.log('READ BACK');
console.log(`  referral: ${JSON.stringify(row)}`);
const ledger = (await pool.query(
  `SELECT id, player_id, amount_fils, balance_after_fils, type, description, created_by, related_referral_id, created_at::text AS created_at
     FROM wallet_transactions WHERE related_referral_id = $1 OR (type = 'referral_reward' AND player_id = ANY($2::text[]) AND created_at > now() - interval '2 minutes')
    ORDER BY created_at`, [created.id, [referrer.id, referee.linked_player_id ?? '']],
)).rows;
for (const l of ledger) console.log(`  ledger: ${JSON.stringify(l)}`);
const after = (await pool.query(
  `SELECT id, name, wallet_balance, leaderboard_mention, ambassador_status,
          (SELECT count(*)::int FROM referrals r WHERE r.referrer_id = players.id AND r.status = 'completed') AS completed
     FROM players WHERE id = ANY($1::text[])`, [[referrer.id, referee.linked_player_id ?? '']],
)).rows;
for (const a of after) console.log(`  player after: ${JSON.stringify(a)}`);
await pool.end();
