// One-shot migration: birthday free game — restore on cancel (Sandeep, 2026-09-25; PLAN.md §3.2, decision 1).
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-25-birthday-restore-v1.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-25-birthday-restore-v1.mts --rehearse
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-25-birthday-restore-v1.mts
//
// --dry-run   prints the plan and previews every backfill (SELECT only), writes nothing.
// --rehearse  runs every statement inside BEGIN … ROLLBACK against the real database to prove the SQL, then rolls
//             back. Nothing persists.
// (no flag)   EXECUTES in one transaction and records itself in system_one_shot_migrations (a re-run is a no-op).
//
// Additive only: two nullable columns, two backfills that only fill those new columns, one partial unique index.
//   marketplace_users.birthday_discount_booking_id — which booking consumed this year's free game (restore clears the
//     marker only for that booking).
//   bookings.birthday_window_key — the anchor birthday (YYYY-MM-DD, Dubai date) of the window a free booking belongs to.
//   uq_bookings_one_live_birthday — at most one live free booking per (user, window key): the database-level backstop
//     against a double-free. Created only after a duplicate check inside the same transaction.
//
// ORDER OF OPERATIONS: run this BEFORE deploying the code that adds the two columns to the Drizzle schema — every
// select().from(bookings) and select().from(marketplace_users) selects them.
import { pool } from '../../server/db';

const KEY = 'birthday_restore_v1';
const DRY_RUN = process.argv.includes('--dry-run');
const REHEARSE = process.argv.includes('--rehearse');

// Anchor birthday for a Dubai calendar date d: the birthday in d's year −1/0/+1 that lies within 4 days of d. The
// make_date(yr, m, 1) + (day − 1) form rolls 29 Feb over to 1 Mar in non-leap years, exactly like Date.UTC in
// shared/birthday.ts.
const DUBAI_CREATED = `((b2.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dubai')::date`;
const ANCHOR = `(make_date(yr, u.birth_month, 1) + (u.birth_day - 1))`;
const KEYS_CTE = `
  SELECT b2.id, b2.user_id, b2.status, to_char(a.anchor, 'YYYY-MM-DD') AS window_key
    FROM bookings b2
    JOIN marketplace_users u ON u.id = b2.user_id
    CROSS JOIN LATERAL (
      SELECT ${ANCHOR} AS anchor
        FROM generate_series(extract(year FROM ${DUBAI_CREATED})::int - 1, extract(year FROM ${DUBAI_CREATED})::int + 1) AS yr
       WHERE abs(${DUBAI_CREATED} - ${ANCHOR}) <= 4
       ORDER BY abs(${DUBAI_CREATED} - ${ANCHOR})
       LIMIT 1
    ) a
   WHERE b2.birthday_discount_applied AND u.birth_day IS NOT NULL AND u.birth_month IS NOT NULL`;
// The booking that consumed a marker: the latest free booking of that player created at or before the marker instant
// (the marker is written on confirmation, which follows creation).
const LINK_CTE = `
  SELECT u.id AS user_id,
         (SELECT b.id FROM bookings b
           WHERE b.user_id = u.id AND b.birthday_discount_applied AND b.created_at <= u.birthday_discount_used_at + interval '1 minute'
           ORDER BY b.created_at DESC LIMIT 1) AS booking_id
    FROM marketplace_users u
   WHERE u.birthday_discount_used_at IS NOT NULL`;

const ADD_USER_COLUMN = `ALTER TABLE "marketplace_users" ADD COLUMN "birthday_discount_booking_id" varchar`;
const ADD_BOOKING_COLUMN = `ALTER TABLE "bookings" ADD COLUMN "birthday_window_key" text`;
const BACKFILL_KEYS = `UPDATE "bookings" SET "birthday_window_key" = k.window_key FROM (${KEYS_CTE}) k WHERE "bookings".id = k.id`;
const BACKFILL_LINKS = `UPDATE "marketplace_users" SET "birthday_discount_booking_id" = l.booking_id FROM (${LINK_CTE}) l WHERE "marketplace_users".id = l.user_id AND l.booking_id IS NOT NULL`;
const DUPLICATES = `SELECT user_id, birthday_window_key, count(*)::int AS n FROM bookings
  WHERE birthday_discount_applied AND status <> 'cancelled' AND birthday_window_key IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1`;
const CREATE_INDEX = `CREATE UNIQUE INDEX "uq_bookings_one_live_birthday" ON "bookings" ("user_id", "birthday_window_key") WHERE "birthday_discount_applied" AND "status" <> 'cancelled'`;

const PROBE = `
  SELECT
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public'
       AND ((table_name = 'marketplace_users' AND column_name = 'birthday_discount_booking_id')
         OR (table_name = 'bookings' AND column_name = 'birthday_window_key'))) AS columns,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_bookings_one_live_birthday') AS indexes`;

const client = await pool.connect();
try {
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const before = (await client.query(PROBE)).rows[0];
  const counts = (await client.query(`SELECT
      (SELECT count(*)::int FROM bookings) AS bookings,
      (SELECT count(*)::int FROM bookings WHERE birthday_discount_applied) AS free_bookings,
      (SELECT count(*)::int FROM bookings WHERE birthday_discount_applied AND status <> 'cancelled') AS live_free,
      (SELECT count(*)::int FROM marketplace_users) AS users,
      (SELECT count(*)::int FROM marketplace_users WHERE birthday_discount_used_at IS NOT NULL) AS markers`)).rows[0];
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`objects present now: columns ${before.columns}/2, index ${before.indexes}/1`);
  console.log(`rows: bookings ${counts.bookings} (free ${counts.free_bookings}, live free ${counts.live_free}); users ${counts.users} (marker set ${counts.markers})`);

  // Previews (SELECT only) of exactly what the two backfills will write.
  const keys = (await client.query(`SELECT k.window_key, k.status, count(*)::int AS n FROM (${KEYS_CTE}) k GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
  const keyed = keys.reduce((a: number, r: { n: number }) => a + r.n, 0);
  console.log(`backfill 1 — window keys for free bookings: ${keyed} of ${counts.free_bookings} get a key (the rest: no birthday on the account now, or booked outside a window)`);
  for (const r of keys) console.log(`    ${r.window_key}  ${r.status.padEnd(10)} ${r.n}`);
  const unkeyed = (await client.query(`SELECT b.id, b.status, to_char((b.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dubai', 'DD Mon YYYY HH24:MI') AS created_dubai,
      u.birth_day, u.birth_month FROM bookings b JOIN marketplace_users u ON u.id = b.user_id
    WHERE b.birthday_discount_applied AND b.id NOT IN (SELECT id FROM (${KEYS_CTE}) k) ORDER BY b.created_at`)).rows;
  for (const r of unkeyed) console.log(`    no key: ${r.id} ${r.status} created ${r.created_dubai} Dubai, birthday now ${r.birth_day ?? '-'}/${r.birth_month ?? '-'}`);
  const dupPreview = (await client.query(`SELECT user_id, window_key, count(*)::int AS n FROM (${KEYS_CTE}) k WHERE status <> 'cancelled' GROUP BY 1, 2 HAVING count(*) > 1`)).rows;
  console.log(`duplicate live window keys after backfill (must be 0 for the index): ${dupPreview.length}`);
  const links = (await client.query(`SELECT u.name, to_char((u.birthday_discount_used_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dubai', 'DD Mon YYYY HH24:MI') AS marker_dubai,
      l.booking_id, b.status AS booking_status
    FROM (${LINK_CTE}) l JOIN marketplace_users u ON u.id = l.user_id LEFT JOIN bookings b ON b.id = l.booking_id ORDER BY u.birthday_discount_used_at DESC`)).rows;
  console.log(`backfill 2 — markers linked to the booking that set them: ${links.filter((r: { booking_id: string | null }) => r.booking_id).length} of ${links.length}`);
  for (const r of links) console.log(`    ${String(r.name).padEnd(24)} marker ${r.marker_dubai} Dubai → ${r.booking_id ?? '(no free booking on record — left NULL)'}${r.booking_status ? ` (${r.booking_status})` : ''}`);

  console.log('PLAN (one transaction, lock_timeout 5s):');
  for (const s of [ADD_USER_COLUMN, ADD_BOOKING_COLUMN, 'UPDATE "bookings" SET "birthday_window_key" = … (backfill 1)', 'UPDATE "marketplace_users" SET "birthday_discount_booking_id" = … (backfill 2)', 'check: duplicate live window keys = 0, else ROLLBACK', CREATE_INDEX]) console.log('  ' + s);
  console.log(`  INSERT INTO system_one_shot_migrations (key) VALUES ('${KEY}')`);

  const anyPresent = before.columns > 0 || before.indexes > 0;
  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else if (anyPresent) {
    console.error('ABORT — some birthday objects already exist but the registry has no record; investigate before running.');
    process.exit(2);
  } else {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query(ADD_USER_COLUMN); console.log('ran: add marketplace_users.birthday_discount_booking_id');
    await client.query(ADD_BOOKING_COLUMN); console.log('ran: add bookings.birthday_window_key');
    const k = await client.query(BACKFILL_KEYS); console.log(`ran: backfill 1 — ${k.rowCount} bookings keyed`);
    const l = await client.query(BACKFILL_LINKS); console.log(`ran: backfill 2 — ${l.rowCount} markers linked`);
    const dups = (await client.query(DUPLICATES)).rows;
    if (dups.length) throw new Error(`duplicate live window keys: ${JSON.stringify(dups)} — cannot create the index`);
    console.log('check: duplicate live window keys = 0');
    await client.query(CREATE_INDEX); console.log('ran: create uq_bookings_one_live_birthday');
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    const mid = (await client.query(PROBE)).rows[0];
    console.log(`inside the transaction: columns ${mid.columns}/2, index ${mid.indexes}/1; bookings keyed ${k.rowCount}, markers linked ${l.rowCount}`);
    if (REHEARSE) {
      await client.query('ROLLBACK');
      const after = (await client.query(PROBE)).rows[0];
      const reg = await client.query('SELECT 1 FROM system_one_shot_migrations WHERE key = $1', [KEY]);
      console.log(`REHEARSAL ROLLED BACK — after rollback: columns ${after.columns}, index ${after.indexes}, registry rows ${reg.rowCount}`);
    } else {
      if (mid.columns !== 2 || mid.indexes !== 1) throw new Error('post-condition failed; rolling back');
      await client.query('COMMIT');
      console.log(`COMMITTED — ${KEY}`);
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
