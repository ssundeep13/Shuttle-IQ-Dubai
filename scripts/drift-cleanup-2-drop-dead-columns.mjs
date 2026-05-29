// Drift cleanup, Step 3 (DROP): remove 9 confirmed-dead columns from the
// Railway DB. All drops are explicit (no IF EXISTS) so a re-run after
// success fails loudly. Pre-checks confirm every column still exists at
// start; post-checks confirm all 9 are gone at end. Single transaction —
// either all 9 drop, or none.
//
// Dropped (with non-null counts at the time of audit):
//
//   payments:
//     ziina_refund_id  text       0 / 169 non-null
//     refunded_amount  integer    0 / 169
//     refunded_at      timestamp  0 / 169
//     refund_status    text       0 / 169
//
//   marketplace_users:
//     onboarding_completed     boolean NOT NULL DEFAULT false   174/174 (16 true)
//     onboarding_experience    smallint nullable                 13/174
//     onboarding_rallies       smallint nullable                 13/174
//     onboarding_games         smallint nullable                 13/174
//     onboarding_completed_at  timestamp nullable                16/174
//
// The 16 user-set onboarding values reflect the old onboarding flow that
// was superseded by the SkillAssessmentStepper → assessmentAnswers path
// (which writes players.skillScore + level directly). The audit value of
// these columns is not worth carrying forward — the current "completed
// signup" signal is marketplace_users.linkedPlayerId IS NOT NULL.

import pg from 'pg'; import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('='))
    .map(l => { const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,'')]; }));
const p = new pg.Pool({ connectionString: env.DATABASE_URL });

const TARGETS = [
  // [table, column]
  ['payments',          'ziina_refund_id'],
  ['payments',          'refunded_amount'],
  ['payments',          'refunded_at'],
  ['payments',          'refund_status'],
  ['marketplace_users', 'onboarding_completed'],
  ['marketplace_users', 'onboarding_experience'],
  ['marketplace_users', 'onboarding_rallies'],
  ['marketplace_users', 'onboarding_games'],
  ['marketplace_users', 'onboarding_completed_at'],
];

// Pivot TARGETS to a {table → [col, …]} map for per-table ANY() queries.
const byTable = TARGETS.reduce((m, [t, c]) => ((m[t] ??= []).push(c), m), {});

// ─── Pre-check: every target column MUST still exist ─────────────────────
const preCheck = await p.query(
  `SELECT table_name, column_name FROM information_schema.columns
   WHERE (table_name = 'payments' AND column_name = ANY($1::text[]))
      OR (table_name = 'marketplace_users' AND column_name = ANY($2::text[]))
   ORDER BY table_name, column_name`,
  [byTable.payments, byTable.marketplace_users]);
const present = new Set(preCheck.rows.map(r => `${r.table_name}.${r.column_name}`));
const missing = TARGETS.filter(([t, c]) => !present.has(`${t}.${c}`));
if (missing.length > 0) {
  console.error('❌ PRE-CHECK FAILED — these target columns are not present:');
  console.table(missing.map(([t, c]) => ({ table: t, column: c })));
  console.error('\nHas this script already been run? Refusing to continue.');
  process.exit(2);
}
console.log('Pre-check: all 9 target columns are present in the DB ✓');

// ─── Row-count snapshots (post-check must match — drop should not lose rows) ─
const tableSet = [...new Set(TARGETS.map(([t]) => t))];
const beforeCounts = {};
for (const t of tableSet) {
  beforeCounts[t] = (await p.query(`SELECT COUNT(*)::int AS c FROM "${t}"`)).rows[0].c;
}
console.log('Row counts before drop:', beforeCounts);

// ─── Drop, single transaction ────────────────────────────────────────────
const client = await p.connect();
try {
  await client.query('BEGIN');
  for (const [t, c] of TARGETS) {
    const sql = `ALTER TABLE "${t}" DROP COLUMN "${c}"`;
    console.log('→', sql);
    await client.query(sql);
  }
  await client.query('COMMIT');
  console.log('\n✓ All 9 columns dropped (single tx).');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('\n❌ Drop transaction failed, rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
}

// ─── Post-check: every target column MUST be gone ────────────────────────
const postCheck = await p.query(
  `SELECT table_name, column_name FROM information_schema.columns
   WHERE (table_name = 'payments' AND column_name = ANY($1::text[]))
      OR (table_name = 'marketplace_users' AND column_name = ANY($2::text[]))`,
  [byTable.payments, byTable.marketplace_users]);
if (postCheck.rows.length > 0) {
  console.error('\n❌ POST-CHECK FAILED — these columns still exist:');
  console.table(postCheck.rows);
  process.exitCode = 1;
} else {
  console.log('\nPost-check: all 9 target columns confirmed dropped ✓');
}

// Row counts should be unchanged.
const afterCounts = {};
for (const t of tableSet) {
  afterCounts[t] = (await p.query(`SELECT COUNT(*)::int AS c FROM "${t}"`)).rows[0].c;
}
console.log('Row counts after drop:', afterCounts);
for (const t of tableSet) {
  if (beforeCounts[t] !== afterCounts[t]) {
    console.error(`❌ Row count changed for ${t}: ${beforeCounts[t]} → ${afterCounts[t]} (column drop should not lose rows)`);
    process.exitCode = 1;
  }
}
if (process.exitCode !== 1) console.log('Row counts unchanged ✓');

await p.end();
