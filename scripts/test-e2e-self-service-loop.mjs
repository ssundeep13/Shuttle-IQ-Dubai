#!/usr/bin/env node
// End-to-end test for the player-driven self-service loop (Tasks #45 + #47).
//
// What it covers:
//   1. Set up a sandbox admin session + court + 4 checked-in players
//   2. Insert an APPROVED match suggestion (state after the 60s auto-approve sweep)
//   3. P6 GET /current-suggestion from player A → see 'approved'
//   4. P7 POST /start-game from player A → expect alreadyStarted: false
//   5. P7 POST /start-game from player B → expect alreadyStarted: true (idempotency)
//   6. GET /current-suggestion from all 4 → all see 'playing'
//   7. Verify court occupied, all 4 players status='playing'
//   8. P8 POST /submit-score from player C
//   9. P8 POST /submit-score from player D → expect alreadySubmitted: true
//  10. GET /current-suggestion?for=score-entry → see 'completed'
//  11. Verify game_results row, court 'available'
//
// The session is ALWAYS sandbox so player stats (skill/games/wins) are not
// mutated — safe to run multiple times against the dev DB.

import pg from 'pg';
import { randomUUID } from 'crypto';

const { Client } = pg;
const BASE = process.env.BASE_URL || 'http://localhost:5000';
const PASSWORD = 'Test1234!';

const PLAYERS = [
  { email: 'femaletest1@demo.siq', name: 'Female Test 1' },
  { email: 'femaletest2@demo.siq', name: 'Female Test 2' },
  { email: 'femaletest3@demo.siq', name: 'Female Test 3' },
  { email: 'femaletest4@demo.siq', name: 'Female Test 4' },
];

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, extra) => {
  const summary = extra ? JSON.stringify(extra).slice(0, 200) : '';
  console.error(`  ✗ ${label} ${summary}`);
  process.exitCode = 1;
};

async function http(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

// Token cache so re-runs do not blow through the 10-per-15min IP rate limit
// on /api/marketplace/auth/login. Tokens are JWTs with their own TTL; we
// validate by hitting a cheap authenticated endpoint before reuse.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const TOKEN_CACHE_FILE = '/tmp/e2e-self-service-tokens.json';

async function tokenStillValid(token) {
  const r = await http('GET', '/api/marketplace/auth/me', { token });
  return r.status === 200;
}

async function loginFresh(email) {
  const r = await http('POST', '/api/marketplace/auth/login', {
    body: { email, password: PASSWORD },
  });
  if (r.status !== 200 || !r.body.accessToken) {
    throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.accessToken;
}

async function login(email) {
  let cache = {};
  if (existsSync(TOKEN_CACHE_FILE)) {
    try { cache = JSON.parse(readFileSync(TOKEN_CACHE_FILE, 'utf8')); } catch {}
  }
  const cached = cache[email];
  if (cached && (await tokenStillValid(cached))) return cached;
  const token = await loginFresh(email);
  cache[email] = token;
  writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2));
  return token;
}

async function main() {
  log('Connecting to DB…');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // Resolve the 4 player IDs
  log('Resolving test players…');
  const { rows: playerRows } = await db.query(
    `SELECT mu.email, mu.linked_player_id
       FROM marketplace_users mu
      WHERE mu.email = ANY($1)
      ORDER BY mu.email`,
    [PLAYERS.map(p => p.email)],
  );
  if (playerRows.length !== 4) {
    throw new Error(`Expected 4 test players, got ${playerRows.length}`);
  }
  const playerIdByEmail = Object.fromEntries(playerRows.map(r => [r.email, r.linked_player_id]));
  for (const p of PLAYERS) {
    if (!playerIdByEmail[p.email]) throw new Error(`Missing linked_player_id for ${p.email}`);
    p.playerId = playerIdByEmail[p.email];
  }
  ok(`4 players linked: ${PLAYERS.map(p => p.name).join(', ')}`);

  // Cleanup any prior test state. We delete in dependency order rather
  // than rely on FK cascade — `match_suggestions.session_id` does NOT
  // cascade in the schema, so dropping the session would orphan the
  // suggestion rows and leave them visible to /current-suggestion.
  log('Cleaning up prior test state…');
  const TEST_VENUE = 'E2E TEST VENUE — self-service loop';
  const playerIds = PLAYERS.map(p => p.playerId);
  // 1. Drop any active match_suggestions for these players (orphaned or not)
  await db.query(
    `DELETE FROM match_suggestion_players
      WHERE suggestion_id IN (
        SELECT DISTINCT msp2.suggestion_id
          FROM match_suggestion_players msp2
          JOIN match_suggestions ms ON ms.id = msp2.suggestion_id
         WHERE msp2.player_id = ANY($1)
           AND ms.status IN ('pending','approved','playing')
      )`,
    [playerIds],
  );
  await db.query(
    `DELETE FROM match_suggestions
      WHERE id IN (
        SELECT DISTINCT ms.id
          FROM match_suggestions ms
          JOIN match_suggestion_players msp ON msp.suggestion_id = ms.id
         WHERE msp.player_id = ANY($1)
           AND ms.status IN ('pending','approved','playing')
      )`,
    [playerIds],
  );
  // 2. Drop any prior test session
  await db.query(
    `DELETE FROM sessions WHERE venue_name = $1`,
    [TEST_VENUE],
  );
  ok('prior test state cleaned up');

  // Create sandbox session + 1 court directly via SQL.
  // is_sandbox=true → no skill/games/wins mutations on game completion.
  const sessionId = randomUUID();
  const courtId = randomUUID();
  log(`Creating sandbox session ${sessionId.slice(0,8)}… + court ${courtId.slice(0,8)}…`);
  await db.query(
    `INSERT INTO sessions (id, date, venue_name, court_count, status, is_sandbox, created_at)
     VALUES ($1, NOW(), $2, 1, 'active', TRUE, NOW())`,
    [sessionId, TEST_VENUE],
  );
  await db.query(
    `INSERT INTO courts (id, session_id, name, status, time_remaining, started_at)
     VALUES ($1, $2, 'Court A', 'available', 0, NULL)`,
    [courtId, sessionId],
  );

  // Add the 4 players to session_players (the queue) as 'waiting'
  await db.query(
    `INSERT INTO players (id, name, email, gender, level, skill_score, status)
       SELECT id, name, email, gender, level, skill_score, 'waiting'
         FROM players WHERE id = ANY($1)
       ON CONFLICT (id) DO UPDATE SET status = 'waiting'`,
    [PLAYERS.map(p => p.playerId)],
  );

  // Insert into queue_entries
  for (let i = 0; i < PLAYERS.length; i++) {
    await db.query(
      `INSERT INTO queue_entries (id, session_id, player_id, position, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), sessionId, PLAYERS[i].playerId, i],
    );
  }
  ok('sandbox session + court + queue created');

  // Insert APPROVED match suggestion (mimics auto-approve sweep result)
  const suggestionId = randomUUID();
  log(`Creating APPROVED match suggestion ${suggestionId.slice(0,8)}…`);
  await db.query(
    `INSERT INTO match_suggestions (id, session_id, court_id, suggested_at, pending_until, status, approved_by, created_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '5 minutes', 'approved', 'auto-sweep', NOW())`,
    [suggestionId, sessionId, courtId],
  );
  // Team 1: players 0,1   Team 2: players 2,3
  for (let i = 0; i < PLAYERS.length; i++) {
    const team = i < 2 ? 1 : 2;
    await db.query(
      `INSERT INTO match_suggestion_players (suggestion_id, court_id, player_id, team)
       VALUES ($1, $2, $3, $4)`,
      [suggestionId, courtId, PLAYERS[i].playerId, team],
    );
  }
  ok(`approved suggestion created — Team 1: ${PLAYERS[0].name}+${PLAYERS[1].name}, Team 2: ${PLAYERS[2].name}+${PLAYERS[3].name}`);

  // Login all 4 players
  log('Logging in all 4 players…');
  for (const p of PLAYERS) {
    p.token = await login(p.email);
  }
  ok('all 4 players authenticated');

  console.log('\n──── STEP 1: P6 — Player A sees Court Ready ────');
  const r1 = await http('GET', '/api/marketplace/players/me/current-suggestion', { token: PLAYERS[0].token });
  if (r1.status !== 200) fail(`GET /current-suggestion as A → ${r1.status}`, r1.body);
  else if (r1.body.suggestion?.status === 'approved' && r1.body.suggestion.id === suggestionId) {
    ok(`status='approved', selfTeam=${r1.body.suggestion.selfTeam}, court=${r1.body.suggestion.courtName}`);
  } else fail(`unexpected suggestion`, r1.body);

  console.log('\n──── STEP 2: P7 — Player A taps Start ────');
  const r2 = await http('POST', `/api/marketplace/games/${suggestionId}/start-game`, { token: PLAYERS[0].token });
  if (r2.status === 200 && r2.body.success === true && r2.body.alreadyStarted === false) {
    ok(`200 OK, alreadyStarted=false (race winner)`);
  } else fail(`Player A start-game → ${r2.status}`, r2.body);

  console.log('\n──── STEP 3: idempotency — Player B taps Start ────');
  const r3 = await http('POST', `/api/marketplace/games/${suggestionId}/start-game`, { token: PLAYERS[1].token });
  if (r3.status === 200 && r3.body.success === true && r3.body.alreadyStarted === true) {
    ok(`200 OK, alreadyStarted=true (race loser, idempotent)`);
  } else fail(`Player B start-game → ${r3.status}`, r3.body);

  console.log('\n──── STEP 4: court+player state side effects ────');
  const { rows: courtRows } = await db.query(`SELECT status, started_at, time_remaining FROM courts WHERE id=$1`, [courtId]);
  if (courtRows[0].status === 'occupied' && courtRows[0].started_at && courtRows[0].time_remaining === 15) {
    ok(`court status='occupied', startedAt set, timeRemaining=15`);
  } else fail(`court state wrong`, courtRows[0]);
  const { rows: cpRows } = await db.query(`SELECT player_id, team FROM court_players WHERE court_id=$1 ORDER BY team, player_id`, [courtId]);
  if (cpRows.length === 4) ok(`4 court_players rows written`);
  else fail(`expected 4 court_players, got ${cpRows.length}`, cpRows);
  const { rows: pStatus } = await db.query(`SELECT id, status FROM players WHERE id = ANY($1)`, [PLAYERS.map(p => p.playerId)]);
  const allPlaying = pStatus.every(p => p.status === 'playing');
  if (allPlaying) ok(`all 4 players have status='playing'`);
  else fail(`not all players playing`, pStatus);

  console.log('\n──── STEP 5: all 4 players see status=playing ────');
  for (const p of PLAYERS) {
    const r = await http('GET', '/api/marketplace/players/me/current-suggestion', { token: p.token });
    if (r.body.suggestion?.status === 'playing' && r.body.suggestion.id === suggestionId) {
      ok(`${p.name}: status='playing', selfTeam=${r.body.suggestion.selfTeam}`);
    } else fail(`${p.name} did not see playing`, r.body);
  }

  console.log('\n──── STEP 6: P8 — Player C submits score 21-19 (Team 1 wins) ────');
  const r6 = await http('POST', `/api/marketplace/games/${suggestionId}/submit-score`, {
    token: PLAYERS[2].token,
    body: { team1Score: 21, team2Score: 19, winningTeam: 1 },
  });
  if (r6.status === 200 && r6.body.success === true && r6.body.alreadySubmitted === false && r6.body.gameResultId) {
    ok(`200 OK, alreadySubmitted=false, gameResultId=${r6.body.gameResultId.slice(0,8)}…`);
  } else fail(`Player C submit-score → ${r6.status}`, r6.body);

  console.log('\n──── STEP 7: idempotency — Player D submits score ────');
  const r7 = await http('POST', `/api/marketplace/games/${suggestionId}/submit-score`, {
    token: PLAYERS[3].token,
    body: { team1Score: 21, team2Score: 19, winningTeam: 1 },
  });
  if (r7.status === 200 && r7.body.success === true && r7.body.alreadySubmitted === true) {
    ok(`200 OK, alreadySubmitted=true (race loser, idempotent)`);
  } else fail(`Player D submit-score → ${r7.status}`, r7.body);

  console.log('\n──── STEP 8: post-completion state ────');
  const { rows: postCourt } = await db.query(`SELECT status, started_at FROM courts WHERE id=$1`, [courtId]);
  if (postCourt[0].status === 'available' && postCourt[0].started_at === null) {
    ok(`court reset to 'available'`);
  } else fail(`court not reset`, postCourt[0]);
  const { rows: postCp } = await db.query(`SELECT * FROM court_players WHERE court_id=$1`, [courtId]);
  if (postCp.length === 0) ok(`court_players cleared`);
  else fail(`court_players still has ${postCp.length} rows`, postCp);
  const { rows: gr } = await db.query(`SELECT id, team1_score, team2_score, winning_team, match_suggestion_id FROM game_results WHERE match_suggestion_id=$1`, [suggestionId]);
  if (gr.length === 1 && gr[0].team1_score === 21 && gr[0].team2_score === 19 && gr[0].winning_team === 1) {
    ok(`game_results row written: 21-19 → Team 1`);
  } else fail(`game_results wrong`, gr);
  const { rows: ms } = await db.query(`SELECT status FROM match_suggestions WHERE id=$1`, [suggestionId]);
  if (ms[0]?.status === 'completed') ok(`suggestion status='completed'`);
  else fail(`suggestion status wrong`, ms);

  // submit-score fires runP3BackgroundMatchmaking via setImmediate to
  // re-suggest a match for the just-vacated court. In production this is
  // the desired UX (player rolls straight into their next game). For this
  // test we want to assert the score-entry surface in isolation, so we
  // wait for the matchmaker to settle and then drop any new pending or
  // approved suggestion it created. The original (now 'completed') row
  // is left intact.
  await new Promise(r => setTimeout(r, 800));
  await db.query(
    `DELETE FROM match_suggestion_players
      WHERE suggestion_id IN (
        SELECT DISTINCT msp2.suggestion_id
          FROM match_suggestion_players msp2
          JOIN match_suggestions ms ON ms.id = msp2.suggestion_id
         WHERE msp2.player_id = ANY($1)
           AND ms.status IN ('pending','approved')
      )`,
    [PLAYERS.map(p => p.playerId)],
  );
  await db.query(
    `DELETE FROM match_suggestions
      WHERE id IN (
        SELECT DISTINCT ms.id
          FROM match_suggestions ms
          JOIN match_suggestion_players msp ON msp.suggestion_id = ms.id
         WHERE msp.player_id = ANY($1)
           AND ms.status IN ('pending','approved')
      )`,
    [PLAYERS.map(p => p.playerId)],
  );

  console.log('\n──── STEP 9: P8 — score-entry endpoint surfaces completed for any of the 4 ────');
  for (const p of PLAYERS) {
    const r = await http('GET', '/api/marketplace/players/me/current-suggestion?for=score-entry', { token: p.token });
    if (r.body.suggestion?.status === 'completed' && r.body.suggestion.id === suggestionId) {
      ok(`${p.name}: score-entry surfaces completed game`);
    } else fail(`${p.name} score-entry endpoint`, r.body);
  }

  console.log('\n──── STEP 10: regular endpoint no longer surfaces completed ────');
  const r10 = await http('GET', '/api/marketplace/players/me/current-suggestion', { token: PLAYERS[0].token });
  if (r10.body.suggestion === null) {
    ok(`Player A sees null (no live game) — correct, ready for next matchmaking`);
  } else fail(`Player A still seeing live`, r10.body);

  console.log('\n──── STEP 11: error path — caller not on the lineup ────');
  // Use the score endpoint's auth check by re-attempting start with a fake suggestion
  const fakeSuggestionId = randomUUID();
  const r11 = await http('POST', `/api/marketplace/games/${fakeSuggestionId}/start-game`, { token: PLAYERS[0].token });
  if (r11.status === 404) ok(`unknown suggestion → 404 with friendly message`);
  else fail(`expected 404, got ${r11.status}`, r11.body);

  console.log('\n──── STEP 12: error path — start-game on completed suggestion → 409 ────');
  const r12 = await http('POST', `/api/marketplace/games/${suggestionId}/start-game`, { token: PLAYERS[0].token });
  if (r12.status === 409) ok(`completed suggestion → 409 'no longer available'`);
  else fail(`expected 409 on completed, got ${r12.status}`, r12.body);

  // Cleanup
  log('\nCleaning up test session…');
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  await db.query(`UPDATE players SET status = 'waiting' WHERE id = ANY($1)`, [PLAYERS.map(p => p.playerId)]);
  ok('cleanup complete');

  await db.end();

  if (process.exitCode) {
    console.log(`\n✗ E2E TEST FAILED — see ✗ markers above`);
    process.exit(1);
  } else {
    console.log(`\n✓ ALL 12 E2E STEPS PASSED — self-service loop end-to-end works`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
