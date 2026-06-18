// Additive migration — booking_guests.linked_player_id. Lets a checked-in guest
// carry a direct Player link (especially an auto-created pure-guest player), so
// re-opening the Add Player modal never creates a duplicate. Account guests keep
// resolving via linked_user_id → marketplace_users.linked_player_id; this column
// is the anchor for guests that have no account.
// Run with: TZ=UTC node scripts/migrate-guest-linked-player-2026-06-15.mjs
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; })
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await pool.query('ALTER TABLE booking_guests ADD COLUMN IF NOT EXISTS linked_player_id varchar');
console.log('OK: ALTER TABLE booking_guests ADD COLUMN IF NOT EXISTS linked_player_id varchar');

const col = await pool.query(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'booking_guests' AND column_name = 'linked_player_id'`
);
console.log('verified:', JSON.stringify(col.rows));
await pool.end();
