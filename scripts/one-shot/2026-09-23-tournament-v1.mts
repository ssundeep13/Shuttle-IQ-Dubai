// One-shot migration: tournament registration v1 schema (Tournament Gate 1).
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-23-tournament-v1.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-23-tournament-v1.mts --rehearse
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-23-tournament-v1.mts
//
// --dry-run   prints the plan and the pre-checks (SELECT only), writes nothing.
// --rehearse  runs every statement inside BEGIN … ROLLBACK against the real
//             database to prove the SQL, then rolls back. Nothing persists.
// (no flag)   EXECUTES in one transaction and records itself in
//             system_one_shot_migrations so a re-run is a no-op.
//
// WHY NOT the drizzle-kit schema-push tool: it plans destructive statements on
// existing tables against this database; `npm run db:push` is guarded.
// Every statement is additive: two new tables, their indexes, and one nullable
// column + partial index on payments. No existing row is read or written.
//
// ORDER OF OPERATIONS: run this BEFORE deploying the code that adds
// payments.tournament_registration_id to the Drizzle schema — every
// select().from(payments) selects it.
import { pool } from '../../server/db';

const KEY = 'tournament_v1';
const DRY_RUN = process.argv.includes('--dry-run');
const REHEARSE = process.argv.includes('--rehearse');

const STATEMENTS = [
  `CREATE TABLE "tournaments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue_name" text NOT NULL,
	"venue_location" text,
	"venue_map_url" text,
	"entry_fee_aed" integer NOT NULL,
	"tier_caps" jsonb NOT NULL,
	"waitlist_cap_per_tier" integer DEFAULT 2 NOT NULL,
	"hold_minutes" integer DEFAULT 1440 NOT NULL,
	"registration_opens_at_members" timestamp with time zone,
	"registration_opens_at" timestamp with time zone NOT NULL,
	"registration_closes_at" timestamp with time zone NOT NULL,
	"withdraw_deadline_at" timestamp with time zone NOT NULL,
	"draft_cutoff_at" timestamp with time zone NOT NULL,
	"deck_url" text,
	"members_open_notified_at" timestamp with time zone,
	"open_notified_at" timestamp with time zone,
	"three_days_notified_at" timestamp with time zone,
	"one_day_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE UNIQUE INDEX "uq_tournaments_slug" ON "tournaments" ("slug")`,
  `CREATE TABLE "tournament_registrations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tournament_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"tier" text NOT NULL,
	"level_at_registration" text NOT NULL,
	"skill_score_at_registration" integer NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"amount_aed" integer NOT NULL,
	"ziina_payment_intent_id" text,
	"payment_method" text,
	"hold_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"refund_status" text,
	"refunded_at" timestamp with time zone,
	"t_shirt_size" text NOT NULL,
	"company" text,
	"share_with_sponsors" boolean DEFAULT false NOT NULL,
	"sponsor_interest" boolean DEFAULT false NOT NULL,
	"sponsor_interest_emailed_at" timestamp with time zone,
	"confirmation_email_sent_at" timestamp with time zone,
	"promotion_notified_at" timestamp with time zone,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE UNIQUE INDEX "uq_tournament_regs_active" ON "tournament_registrations" ("tournament_id", "user_id") WHERE status IN ('pending_payment', 'confirmed', 'waitlisted')`,
  `CREATE UNIQUE INDEX "uq_tournament_regs_active_player" ON "tournament_registrations" ("tournament_id", "player_id") WHERE status IN ('pending_payment', 'confirmed', 'waitlisted')`,
  `CREATE UNIQUE INDEX "uq_tournament_regs_intent" ON "tournament_registrations" ("ziina_payment_intent_id") WHERE ziina_payment_intent_id IS NOT NULL`,
  `CREATE INDEX "idx_tournament_regs_tier_status" ON "tournament_registrations" ("tournament_id", "tier", "status")`,
  `CREATE INDEX "idx_tournament_regs_user_status" ON "tournament_registrations" ("user_id", "status")`,
  `CREATE INDEX "idx_tournament_regs_hold" ON "tournament_registrations" ("hold_expires_at") WHERE status = 'pending_payment'`,
  `ALTER TABLE "payments" ADD COLUMN "tournament_registration_id" varchar;`,
  `CREATE INDEX "idx_payments_tournament_reg" ON "payments" ("tournament_registration_id") WHERE tournament_registration_id IS NOT NULL`,
];

const PROBE = `
  SELECT
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('tournaments', 'tournament_registrations')) AS tables,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'tournament_registration_id') AS payments_col,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
       'uq_tournaments_slug', 'uq_tournament_regs_active', 'uq_tournament_regs_active_player', 'uq_tournament_regs_intent',
       'idx_tournament_regs_tier_status', 'idx_tournament_regs_user_status', 'idx_tournament_regs_hold', 'idx_payments_tournament_reg')) AS indexes`;

const client = await pool.connect();
try {
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const before = (await client.query(PROBE)).rows[0];
  const paymentsRows = (await client.query('SELECT count(*)::int AS n FROM payments')).rows[0].n;
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`objects present now: tables ${before.tables}/2, payments.tournament_registration_id ${before.payments_col}/1, indexes ${before.indexes}/8`);
  console.log(`payments rows (untouched by this migration): ${paymentsRows}`);
  console.log('PLAN (one transaction, lock_timeout 5s):');
  for (const s of STATEMENTS) console.log('  ' + s.split('\n')[0] + (s.includes('\n') ? ' …' : ''));
  console.log(`  INSERT INTO system_one_shot_migrations (key) VALUES ('${KEY}')`);

  const anyPresent = before.tables > 0 || before.payments_col > 0 || before.indexes > 0;
  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else if (anyPresent) {
    console.error('ABORT — some tournament objects already exist but the registry has no record; investigate before running.');
    process.exit(2);
  } else {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    for (const s of STATEMENTS) {
      await client.query(s);
      console.log('ran:', s.split('\n')[0]);
    }
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    const mid = (await client.query(PROBE)).rows[0];
    console.log(`inside the transaction: tables ${mid.tables}/2, payments column ${mid.payments_col}/1, indexes ${mid.indexes}/8`);
    if (REHEARSE) {
      await client.query('ROLLBACK');
      const after = (await client.query(PROBE)).rows[0];
      const reg = await client.query('SELECT 1 FROM system_one_shot_migrations WHERE key = $1', [KEY]);
      console.log(`REHEARSAL ROLLED BACK — after rollback: tables ${after.tables}, payments column ${after.payments_col}, indexes ${after.indexes}, registry rows ${reg.rowCount}`);
    } else {
      if (mid.tables !== 2 || mid.payments_col !== 1 || mid.indexes !== 8) throw new Error('post-condition failed; rolling back');
      await client.query('COMMIT');
      const cols = await client.query(
        `SELECT table_name, count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name IN ('tournaments', 'tournament_registrations') GROUP BY 1 ORDER BY 1`);
      console.log(`COMMITTED — ${KEY}; ` + cols.rows.map((r) => `${r.table_name} ${r.n} columns`).join(', '));
    }
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('ROLLED BACK —', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
