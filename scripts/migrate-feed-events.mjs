// Gate F2 migration — creates feed_events + feed_event_likes. ADDITIVE ONLY.
// House discipline: dry-run first, hand-applied on go.
//   node scripts/migrate-feed-events.mjs --dry-run
//   node scripts/migrate-feed-events.mjs --apply
import pg from 'pg';

const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const SQL = `
CREATE TABLE IF NOT EXISTS feed_events (
  id varchar PRIMARY KEY,
  type text NOT NULL,
  subject_player_id varchar,
  game_result_id varchar,
  session_id varchar,
  related_tag_id varchar,
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  superseded_by_event_id varchar,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_event_dedupe ON feed_events (type, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_feed_events_created ON feed_events (created_at);
CREATE INDEX IF NOT EXISTS idx_feed_events_subject ON feed_events (subject_player_id);

CREATE TABLE IF NOT EXISTS feed_event_likes (
  event_id varchar NOT NULL,
  player_id varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const existing = (await db.query(
  `SELECT table_name FROM information_schema.tables WHERE table_name IN ('feed_events', 'feed_event_likes')`,
)).rows.map((r) => r.table_name);
console.log(`existing tables: ${existing.length ? existing.join(', ') : 'none'}`);
console.log(`SQL to run:\n${SQL}`);
if (MODE === 'apply') {
  await db.query(SQL);
  for (const t of ['feed_events', 'feed_event_likes']) {
    const cols = (await db.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t],
    )).rows;
    console.log(`APPLIED ${t} (${cols.length} cols): ${cols.map((c) => `${c.column_name}:${c.data_type}`).join(', ')}`);
  }
} else {
  console.log('DRY RUN — nothing executed.');
}
await db.end();
