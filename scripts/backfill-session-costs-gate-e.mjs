// Gate (e) — backfill session_costs for bookable_sessions dated 2026-06-01 onwards that
// don't yet have a cost row. INSERT-ONLY (ON CONFLICT (session_id) DO NOTHING); shuttle/
// water = 0; courtCostOverridden = false; capturedBy = 'backfill-gate-e'. Court cost is
// auto-filled exactly like the server: venue rate (name-match) × courtCount × durationHrs,
// or 0 (with a reason) when no venue / rate 0 / duration NaN. captainId = Shannon.
//
// Re-run-safe (ON CONFLICT DO NOTHING). Rollback: DELETE FROM session_costs WHERE
// captured_by = 'backfill-gate-e';
//
// USAGE:
//   node scripts/backfill-session-costs-gate-e.mjs           # DRY-RUN (prints, writes nothing)
//   node scripts/backfill-session-costs-gate-e.mjs --apply    # inserts, one transaction

import pg from 'pg';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const FROM = '2026-06-01';

// duration in decimal hours from "HH:MM" (mirror shared/sessionTime.ts; NaN if end<=start)
const durH = (s, e) => {
  const tm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const a = tm(s), b = tm(e);
  return (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) ? NaN : (b - a) / 60;
};
const courtFils = (rate, courts, s, e) => {
  const h = durH(s, e);
  if (!rate || rate <= 0) return { fils: 0, reason: 'rate not set (0)' };
  if (!Number.isFinite(h)) return { fils: 0, reason: `duration NaN (${s}->${e})` };
  return { fils: Math.round(rate * courts * h), reason: `${rate}×${courts}×${h}h` };
};

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const shannon = (await client.query(`SELECT id FROM session_runners WHERE name = 'Shannon'`)).rows[0];
  if (!shannon) throw new Error("session_runner 'Shannon' not found — aborting.");
  console.log(`captain = Shannon (id ${shannon.id})\n`);

  // ── STEP 1 — venues used by June+ POPULATION (no cost row yet), with rate ──
  const venSummary = (await client.query(`
    SELECT bs.venue_name, COALESCE(v.court_rate_fils_per_hour, 0)::int AS rate, count(*)::int AS sessions
    FROM bookable_sessions bs LEFT JOIN venues v ON v.name = bs.venue_name
    WHERE bs.date >= $1 AND NOT EXISTS (SELECT 1 FROM session_costs sc WHERE sc.session_id = bs.id)
    GROUP BY bs.venue_name, v.court_rate_fils_per_hour ORDER BY bs.venue_name`, [FROM])).rows;
  console.log('STEP 1 — venues used by June+ sessions needing a cost row:');
  let zeroVenues = 0;
  for (const r of venSummary) {
    const flag = r.rate > 0 ? `AED ${r.rate / 100}/court/hr` : '⚠ RATE 0 (court cost will backfill 0)';
    if (r.rate === 0) zeroVenues++;
    console.log(`   ${String(r.sessions).padStart(2)} sess  [${r.venue_name}]  ${flag}`);
  }
  const totJune = (await client.query(`SELECT count(*)::int n FROM bookable_sessions WHERE date >= $1`, [FROM])).rows[0].n;
  const withRow = (await client.query(`SELECT count(*)::int n FROM bookable_sessions bs WHERE bs.date >= $1 AND EXISTS (SELECT 1 FROM session_costs sc WHERE sc.session_id = bs.id)`, [FROM])).rows[0].n;
  const pop = (await client.query(`SELECT count(*)::int n FROM bookable_sessions bs WHERE bs.date >= $1 AND NOT EXISTS (SELECT 1 FROM session_costs sc WHERE sc.session_id = bs.id)`, [FROM])).rows[0].n;
  console.log(`\n   June+ sessions: ${totJune} total · ${withRow} already have a cost row (untouched) · ${pop} to backfill (the population).`);
  console.log(`   venues at rate 0: ${zeroVenues}/${venSummary.length} (their sessions backfill court cost 0).`);

  // ── STEP 2 — per-session dry-run ──
  const rows = (await client.query(`
    SELECT bs.id, to_char(bs.date,'YYYY-MM-DD') d, bs.venue_name, bs.court_count::int courts,
           bs.start_time, bs.end_time, COALESCE(v.court_rate_fils_per_hour, 0)::int rate,
           (v.name IS NOT NULL) AS venue_found
    FROM bookable_sessions bs LEFT JOIN venues v ON v.name = bs.venue_name
    WHERE bs.date >= $1 AND NOT EXISTS (SELECT 1 FROM session_costs sc WHERE sc.session_id = bs.id)
    ORDER BY bs.date, bs.venue_name`, [FROM])).rows;

  console.log(`\nSTEP 2 — DRY-RUN preview (${rows.length} sessions):`);
  let realCost = 0, zeroCost = 0, sumFils = 0;
  const inserts = [];
  for (const r of rows) {
    let cc;
    if (!r.venue_found) cc = { fils: 0, reason: 'no venue match' };
    else cc = courtFils(r.rate, r.courts, r.start_time, r.end_time);
    if (cc.fils > 0) realCost++; else zeroCost++;
    sumFils += cc.fils;
    inserts.push({ id: r.id, fils: cc.fils });
    console.log(`   ${r.d}  [${r.venue_name}]  ${r.courts}c ${r.start_time}-${r.end_time}  rate=${r.rate}  → court AED ${cc.fils / 100}  (${cc.reason})  captain=Shannon`);
  }
  console.log(`\n   Totals: ${realCost} with a real court cost, ${zeroCost} at 0. Summed court cost = AED ${sumFils / 100}.`);
  console.log(`   Every row: shuttle 0, water 0, courtCostOverridden false, capturedBy 'backfill-gate-e'.`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to insert ${inserts.length} rows (ON CONFLICT DO NOTHING).`);
  } else {
    await client.query('BEGIN');
    let inserted = 0;
    for (const it of inserts) {
      const r = await client.query(
        `INSERT INTO session_costs (id, session_id, court_cost_fils, shuttle_cost_fils, water_cost_fils, court_cost_overridden, captain_id, captured_by)
         VALUES ($1, $2, $3, 0, 0, false, $4, 'backfill-gate-e') ON CONFLICT (session_id) DO NOTHING`,
        [randomUUID(), it.id, it.fils, shannon.id]);
      inserted += r.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`\n✓ Applied — ${inserted} session_costs rows inserted (0 = already present).`);
  }
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
