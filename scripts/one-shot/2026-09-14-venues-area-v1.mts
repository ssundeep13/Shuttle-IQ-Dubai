// One-shot migration: venues.area (IQ Pass Gate 11 — the picker cards show the venue's area).
//
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-14-venues-area-v1.mts --dry-run
//   DATABASE_URL=<railway public url> npx tsx scripts/one-shot/2026-09-14-venues-area-v1.mts
//
// Additive only: ADD COLUMN IF NOT EXISTS area text, then one UPDATE per venue whose saved
// location matches an area rule below. Venues whose location matches nothing are listed and
// left NULL (the UI shows no area line for them). Records itself in
// system_one_shot_migrations so a re-run is a no-op. Run BEFORE deploying the code that
// selects venues.area.
import { pool } from '../../server/db';

const KEY = 'venues_area_v1';
const DRY_RUN = process.argv.includes('--dry-run');

// First match wins. Dubai districts as players say them; "Al Barsha" before "Umm Suqeim"
// because Bloom Academy's address names both and sits in Al Barsha 2.
const AREA_RULES: Array<[RegExp, string]> = [
  [/investment park|\bDIP\b/i, 'Dubai Investment Park'],
  [/green community|jabal ali|jebel ali/i, 'Green Community'],
  [/silicon oasis|\bDSO\b/i, 'Dubai Silicon Oasis'],
  [/dubailand|wadi al safa/i, 'Dubailand'],
  [/al barsha|al-barsh|\bbarsha\b/i, 'Al Barsha'],
  [/al quoz|al qouz|khail gate/i, 'Al Quoz'],
  [/al manara/i, 'Al Manara'],
  [/al wasl/i, 'Al Wasl'],
  [/umm suqeim|umm sequim/i, 'Umm Suqeim'],
  [/motor city/i, 'Motor City'],
  [/sports city/i, 'Dubai Sports City'],
  [/jumeirah village|\bJVC\b/i, 'Jumeirah Village Circle'],
  [/mirdif/i, 'Mirdif'],
  [/al nahda/i, 'Al Nahda'],
  [/business bay/i, 'Business Bay'],
  [/marina/i, 'Dubai Marina'],
  [/jumeirah lakes|\bJLT\b/i, 'Jumeirah Lakes Towers'],
  [/deira/i, 'Deira'],
  [/karama/i, 'Al Karama'],
  [/satwa/i, 'Al Satwa'],
  [/al furjan/i, 'Al Furjan'],
  [/discovery gardens/i, 'Discovery Gardens'],
  [/arjan/i, 'Arjan'],
  [/academic city/i, 'Academic City'],
  [/international city/i, 'International City'],
  [/al warqa/i, 'Al Warqa'],
  [/muhaisnah/i, 'Muhaisnah'],
  [/sharjah/i, 'Sharjah'],
  [/ajman/i, 'Ajman'],
];

export function areaFromLocation(location: string | null | undefined): string | null {
  const text = String(location ?? '');
  for (const [re, area] of AREA_RULES) if (re.test(text)) return area;
  return null;
}

const client = await pool.connect();
try {
  const done = await client.query('SELECT ran_at::text AS ran_at FROM system_one_shot_migrations WHERE key = $1', [KEY]);
  const col = await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'area'`);
  const venues = await client.query<{ id: string; name: string; location: string | null; is_active: boolean }>('SELECT id, name, location, is_active FROM venues ORDER BY name');
  console.log(`registry ${KEY}: ${done.rowCount ? `already ran at ${done.rows[0].ran_at}` : 'not run'}`);
  console.log(`venues.area column: ${col.rowCount ? `present (nullable ${col.rows[0].is_nullable})` : 'absent'}`);
  const plan = venues.rows.map((v) => ({ ...v, area: areaFromLocation(v.location) }));
  console.log('PLAN:');
  console.log('  ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "area" text');
  for (const v of plan) console.log(`  ${v.area ? `UPDATE venues SET area = '${v.area}'` : 'LEAVE area NULL     '}  WHERE name = '${v.name}'   -- ${v.is_active ? 'active' : 'inactive'} | location: ${v.location ?? '(none)'}`);
  console.log(`  INSERT INTO system_one_shot_migrations (key) VALUES ('${KEY}')`);
  const unknown = plan.filter((v) => !v.area);
  console.log(`UNKNOWN (${unknown.length}): ${unknown.map((v) => `${v.name} [${v.location ?? 'no location'}]`).join(' | ') || 'none'}`);

  if (DRY_RUN) {
    console.log('DRY RUN — nothing written.');
  } else if (done.rowCount) {
    console.log(`SKIP — ${KEY} already ran.`);
  } else {
    await client.query('BEGIN');
    await client.query('ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "area" text');
    let updated = 0;
    for (const v of plan) {
      if (!v.area) continue;
      const r = await client.query('UPDATE venues SET area = $1 WHERE id = $2 AND (area IS NULL OR area = $1)', [v.area, v.id]);
      updated += r.rowCount ?? 0;
    }
    await client.query('INSERT INTO system_one_shot_migrations (key) VALUES ($1)', [KEY]);
    await client.query('COMMIT');
    const back = await client.query(`SELECT count(*)::int AS with_area, (SELECT count(*)::int FROM venues) AS total FROM venues WHERE area IS NOT NULL`);
    console.log(`COMMITTED — column added, ${updated} venue(s) updated; read-back: ${back.rows[0].with_area} of ${back.rows[0].total} venues carry an area.`);
  }
} catch (e) {
  try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
