// Gate (e) part 2 — shuttle + water on the backfill-gate-e session_costs rows.
// Shuttle: courtCount <= 4 → 2 tubes; >= 5 → 3 tubes; AED 70/tube (7000 fils) →
//   2 tubes = 14000 fils, 3 tubes = 21000 fils.
// Water: 100 fils × SUM(spotsBooked) over the session's confirmed/attended bookings.
// Scope: rows WHERE captured_by = 'backfill-gate-e' AND shuttle_cost_fils = 0 AND
//   water_cost_fils = 0 (never overwrite a typed value). Court cost / captain / override
//   untouched. Re-run-safe (shuttle always becomes >= 14000, so eligibility never re-hits).
// Rollback: UPDATE session_costs SET shuttle_cost_fils=0, water_cost_fils=0 WHERE captured_by='backfill-gate-e'; (if desired)
//
// USAGE: node scripts/backfill-shuttle-water-gate-e.mjs [--apply]

import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TUBE_FILS = 7000; // AED 70

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const total = (await client.query(`SELECT count(*)::int n FROM session_costs WHERE captured_by = 'backfill-gate-e'`)).rows[0].n;
  console.log(`session_costs rows with captured_by='backfill-gate-e': ${total}`);
  if (total === 0) {
    console.log(`\n⚠ NONE exist — Gate (e) part 1 backfill has NOT been applied. Nothing to update.`);
    console.log(`  Apply part 1 first (node scripts/backfill-session-costs-gate-e.mjs --apply), then re-run this.`);
    await client.query('ROLLBACK').catch(() => {});
    process.exit(0);
  }

  const rows = (await client.query(`
    SELECT sc.id AS sc_id, sc.shuttle_cost_fils AS shuttle, sc.water_cost_fils AS water,
           to_char(bs.date,'YYYY-MM-DD') d, bs.venue_name, bs.court_count::int courts,
           COALESCE((SELECT SUM(b.spots_booked)::int FROM bookings b
                     WHERE b.session_id = bs.id AND b.status IN ('confirmed','attended')), 0) AS players
    FROM session_costs sc JOIN bookable_sessions bs ON bs.id = sc.session_id
    WHERE sc.captured_by = 'backfill-gate-e'
    ORDER BY bs.date`)).rows;

  console.log(`\nDRY-RUN preview (${rows.length} rows):`);
  let sumShuttle = 0, sumWater = 0, eligible = 0, skipped = 0;
  const updates = [];
  for (const r of rows) {
    const tubes = r.courts <= 4 ? 2 : 3;
    const shuttleFils = tubes * TUBE_FILS;
    const waterFils = r.players * 100;
    const isEligible = r.shuttle === 0 && r.water === 0;
    const mark = isEligible ? '' : '  [SKIP — already has a value]';
    if (isEligible) { eligible++; sumShuttle += shuttleFils; sumWater += waterFils; updates.push({ scId: r.sc_id, shuttleFils, waterFils }); }
    else skipped++;
    console.log(`   ${r.d}  [${r.venue_name}]  ${r.courts}c → ${tubes} tubes = AED ${shuttleFils / 100} shuttle  · players=${r.players} → AED ${waterFils / 100} water${mark}`);
  }
  console.log(`\n   Eligible (both 0): ${eligible}  ·  Skipped (already set): ${skipped}`);
  console.log(`   Totals over eligible: shuttle AED ${sumShuttle / 100}  ·  water AED ${sumWater / 100}  ·  combined AED ${(sumShuttle + sumWater) / 100}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to update ${eligible} rows.`);
  } else {
    await client.query('BEGIN');
    let updated = 0;
    for (const u of updates) {
      const r = await client.query(
        `UPDATE session_costs SET shuttle_cost_fils = $1, water_cost_fils = $2
         WHERE id = $3 AND captured_by = 'backfill-gate-e' AND shuttle_cost_fils = 0 AND water_cost_fils = 0`,
        [u.shuttleFils, u.waterFils, u.scId]);
      updated += r.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`\n✓ Applied — ${updated} rows updated (shuttle + water).`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
