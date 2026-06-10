// ONE-TIME retroactive decay heal — 2026-06-10.
// Recomputes every currently-decayed player (skill_score < skill_score_baseline)
// under the new "Very Gentle" curve (30-day grace, -1/wk, cap -15) against their
// preserved baseline and current inactivity, and RAISES their score to the new
// target (plus tier). Deliberately allowed to raise scores — the recurring decay
// job only ever lowers. Idempotent: a second run finds score >= target and
// writes nothing. Run with: TZ=UTC node scripts/heal-decay-2026-06-10.mjs
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const MIN_SKILL_SCORE = 10;
function newDecayPoints(daysInactive) {
  if (daysInactive < 30) return 0;
  return Math.min(Math.floor((daysInactive - 30) / 7), 15);
}
// Same thresholds as scheduler.getSkillTierFromScore / skillUtils.getSkillTier
function tierFromScore(s) {
  if (s < 40) return 'Novice';
  if (s < 70) return 'Beginner';
  if (s < 90) return 'lower_intermediate';
  if (s < 110) return 'upper_intermediate';
  if (s < 160) return 'Advanced';
  return 'Professional';
}

const { rows } = await pool.query(
  `SELECT id, name, skill_score, skill_score_baseline, last_played_at, level
   FROM players
   WHERE skill_score_baseline IS NOT NULL AND skill_score < skill_score_baseline`
);
console.log(`Heal candidates (score < baseline): ${rows.length}`);

const now = Date.now();
let healed = 0;
for (const p of rows) {
  const days = p.last_played_at ? (now - p.last_played_at.getTime()) / 86400000 : 0;
  const target = Math.max(MIN_SKILL_SCORE, p.skill_score_baseline - newDecayPoints(days));
  if (p.skill_score >= target) continue; // raise-only; never lower
  const newLevel = tierFromScore(target);
  await pool.query(
    `UPDATE players SET skill_score = $1, level = $2 WHERE id = $3 AND skill_score < $1`,
    [target, newLevel, p.id]
  );
  console.log(
    `  healed ${p.name}: ${p.skill_score} -> ${target} (baseline ${p.skill_score_baseline}, ` +
    `${Math.floor(days)}d inactive)${p.level !== newLevel ? ` | tier ${p.level} -> ${newLevel}` : ''}`
  );
  healed++;
}
console.log(`Done. ${healed} player(s) healed.`);
await pool.end();
