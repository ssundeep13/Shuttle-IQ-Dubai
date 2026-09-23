// One-shot seed: the ShuttleIQ Premier League 2026 tournament row (Tournament Gate 1).
// Runs AFTER scripts/one-shot/2026-09-23-tournament-v1.mts.
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-23-tournament-seed-premier-league.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-23-tournament-seed-premier-league.mts
//
// Inserts exactly ONE tournaments row and ONE registry row, in one transaction.
// Every instant is UTC; Asia/Dubai is UTC+4 with no DST. Deadlines are
// EXCLUSIVE instants (compare now < X): "closes 23:59 Thu 8 Oct Dubai" is
// stored as 2026-10-08T20:00:00Z so a registration at 23:59:59 still succeeds.
// Nothing is visible to players while TOURNAMENT_ENABLED is off, and with it on
// the page stays hidden until the open: Club Plus + Elite members from
// registration_opens_at_members, everyone from registration_opens_at
// (Sandeep, 2026-09-23).
import { randomUUID } from 'crypto';
import { pool } from '../../server/db';

const KEY = 'tournament_seed_premier_league_2026';
const DRY_RUN = process.argv.includes('--dry-run');

const ROW = {
  slug: 'premier-league-2026',
  name: 'ShuttleIQ Premier League',
  status: 'published',                                   // visible from registration_opens_at once the flag is on
  starts_at: '2026-10-17T14:00:00Z',                     // Sat 17 Oct 18:00 Dubai
  ends_at: '2026-10-17T18:00:00Z',                       // Sat 17 Oct 22:00 Dubai
  venue_name: 'BASELINE SPORTS ACADEMY DIP',            // venues.99dddcef (same strings as its sessions)
  venue_location: 'Dubai Investment Park Second - Dubai',
  venue_map_url: 'https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9',
  entry_fee_aed: 100,                                    // whole AED
  tier_caps: { Professional: 6, Competitive: 18, Intermediate: 18, Beginner: 6 },
  waitlist_cap_per_tier: 2,
  hold_minutes: 1440,                                    // 24 h to pay
  registration_opens_at_members: '2026-09-25T08:00:00Z', // Fri 25 Sep 12:00 Dubai — Club Plus + Elite members
  registration_opens_at: '2026-09-25T14:00:00Z',         // Fri 25 Sep 18:00 Dubai — everyone
  registration_closes_at: '2026-10-08T20:00:00Z',        // exclusive: last second Thu 8 Oct 23:59:59 Dubai
  withdraw_deadline_at: '2026-10-08T20:00:00Z',          // exclusive: refund-eligible withdrawals end with registration
  draft_cutoff_at: '2026-10-10T20:00:00Z',               // exclusive: last second Sat 10 Oct 23:59:59 Dubai (no promotions / withdrawals after)
  deck_url: 'https://shuttleiq.ai/docs/shuttleiq-premier-league-sponsorship.pdf',
};

const dubai = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));

const client = await pool.connect();
try {
  const table = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tournaments'`);
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const existing = table.rowCount ? (await client.query('SELECT count(*)::int AS n FROM tournaments WHERE slug = $1', [ROW.slug])).rows[0].n : 0;
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`tournaments table: ${table.rowCount ? 'present' : 'ABSENT (run tournament_v1 first)'} | rows with slug ${ROW.slug}: ${existing}`);
  console.log('ROW to insert (UTC → Asia/Dubai):');
  for (const [k, v] of Object.entries(ROW)) {
    const shown = typeof v === 'object' ? JSON.stringify(v) : String(v);
    console.log(`  ${k.padEnd(24)} ${shown}${typeof v === 'string' && /Z$/.test(v) ? `   (${dubai(v)} Dubai)` : ''}`);
  }
  console.log('EXPECTED: 1 row into tournaments, 1 row into system_one_shot_migrations; no other table touched.');

  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else if (!table.rowCount) {
    console.error('ABORT — tournaments table is absent; run the tournament_v1 migration first.');
    process.exit(2);
  } else if (existing) {
    console.error(`ABORT — a tournament with slug ${ROW.slug} exists but the registry has no record; investigate before running.`);
    process.exit(2);
  } else {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO tournaments (id, slug, name, status, starts_at, ends_at, venue_name, venue_location, venue_map_url,
         entry_fee_aed, tier_caps, waitlist_cap_per_tier, hold_minutes, registration_opens_at_members, registration_opens_at,
         registration_closes_at, withdraw_deadline_at, draft_cutoff_at, deck_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [randomUUID(), ROW.slug, ROW.name, ROW.status, ROW.starts_at, ROW.ends_at, ROW.venue_name, ROW.venue_location, ROW.venue_map_url,
       ROW.entry_fee_aed, JSON.stringify(ROW.tier_caps), ROW.waitlist_cap_per_tier, ROW.hold_minutes, ROW.registration_opens_at_members,
       ROW.registration_opens_at, ROW.registration_closes_at, ROW.withdraw_deadline_at, ROW.draft_cutoff_at, ROW.deck_url],
    );
    if (ins.rowCount !== 1) throw new Error(`expected 1 inserted row, got ${ins.rowCount}`);
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    await client.query('COMMIT');
    const back = (await client.query(
      `SELECT id, slug, status, venue_name, starts_at::text, registration_opens_at_members::text, registration_opens_at::text, registration_closes_at::text, draft_cutoff_at::text, tier_caps::text
         FROM tournaments WHERE slug = $1`, [ROW.slug])).rows[0];
    console.log('COMMITTED — 1 tournaments row:', JSON.stringify(back));
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('ROLLED BACK —', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
