// Player-driven auto-matchmaking orchestrator.
//
// Triggered fire-and-forget from the marketplace check-in handler and from
// the marketplace score-submit handler. Replaces the old single-court
// runP3BackgroundMatchmaking helper.
//
// Threshold rules:
//   - First match of the session (zero completed games AND zero in-flight
//     suggestions) → 6 waiting players required.
//   - Every subsequent match → 4 waiting players required.
//
// Brain selection:
//   - The very first iteration of the very first match attempt asks
//     Claude AI for the best 2v2 split. On any failure (timeout, error,
//     unknown player name, missing key) we silently fall back to the
//     standard generateBracketedLineups for that iteration.
//   - Every subsequent iteration in the same loop, and every later call,
//     uses generateBracketedLineups directly. Claude is never called more
//     than once per session.
//
// Concurrency:
//   - Wrapped in a Postgres advisory lock keyed off the session id, so two
//     near-simultaneous check-ins (or a check-in racing a score submit)
//     collapse to a single matchmaking pass — the loser logs and exits.

import { db } from './db';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { storage } from './storage';
import {
  generateBracketedLineups,
  buildRestStatesFromHistory,
  buildPartnerHistoryFromHistory,
  loadRestStatesFromDb,
  getPlayerRestState,
  getSittingOutPlayers,
} from './matchmaking';
import {
  matchSuggestions,
  matchSuggestionPlayers,
  gameResults,
} from '@shared/schema';
import {
  requestClaudeMatchmaking,
  type ClaudeSessionState,
} from './claude-matchmaking';

const PENDING_WINDOW_MS = 90_000;
const FIRST_MATCH_THRESHOLD = 6;
const SUBSEQUENT_MATCH_THRESHOLD = 4;

// drizzle's neon driver returns either `{ rows: [...] }` (current versions)
// or a bare array (older paths). This helper normalises both into a
// single-row generic so call sites stay strongly typed.
function firstRow<T>(result: unknown): T | undefined {
  if (result && typeof result === 'object') {
    const withRows = result as { rows?: unknown };
    if (Array.isArray(withRows.rows) && withRows.rows.length > 0) {
      return withRows.rows[0] as T;
    }
    if (Array.isArray(result) && result.length > 0) {
      return result[0] as T;
    }
  }
  return undefined;
}

// Stable advisory-lock keyed off the session UUID. Two near-simultaneous
// check-ins or a check-in racing a score submit collapse to a single
// matchmaking pass — the loser logs and exits.
//
// IMPORTANT: We use `pg_try_advisory_xact_lock` *inside a transaction* so
// the lock is bound to the transaction's backend connection and is
// auto-released at COMMIT/ROLLBACK on that same connection. Using
// session-level `pg_try_advisory_lock` over a connection Pool is unsafe
// because the unlock call can land on a different backend connection,
// silently leaking the lock and breaking subsequent runs.
async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  return await db.transaction(async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${sessionId})) AS locked`,
    );
    const row = firstRow<{ locked: boolean }>(result);
    if (!row?.locked) {
      console.log(`[auto-matchmaking] session=${sessionId} skipped — another worker holds the lock`);
      return undefined;
    }
    return await fn();
  });
}

// Counts completed games + in-flight (pending/approved/playing) suggestions.
// Both must be zero for the very first match condition.
async function isFirstMatchOfSession(sessionId: string): Promise<boolean> {
  const completedRows = await db
    .select({ id: gameResults.id })
    .from(gameResults)
    .where(eq(gameResults.sessionId, sessionId))
    .limit(1);
  if (completedRows.length > 0) return false;

  const inFlightRows = await db
    .select({ id: matchSuggestions.id })
    .from(matchSuggestions)
    .where(and(
      eq(matchSuggestions.sessionId, sessionId),
      inArray(matchSuggestions.status, ['pending', 'approved', 'playing']),
    ))
    .limit(1);
  return inFlightRows.length === 0;
}

// All player IDs already locked into a pending/approved/playing suggestion
// for this session — they MUST NOT be reassigned to a new court.
async function getPlayersOnInFlightSuggestions(sessionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ playerId: matchSuggestionPlayers.playerId })
    .from(matchSuggestionPlayers)
    .innerJoin(matchSuggestions, eq(matchSuggestions.id, matchSuggestionPlayers.suggestionId))
    .where(and(
      eq(matchSuggestions.sessionId, sessionId),
      inArray(matchSuggestions.status, ['pending', 'approved', 'playing']),
    ));
  return new Set(rows.map(r => r.playerId));
}

// Court IDs that already have a pending/approved/playing suggestion — they
// MUST NOT receive a second one.
async function getCourtsWithInFlightSuggestions(sessionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ courtId: matchSuggestions.courtId })
    .from(matchSuggestions)
    .where(and(
      eq(matchSuggestions.sessionId, sessionId),
      inArray(matchSuggestions.status, ['pending', 'approved', 'playing']),
    ));
  return new Set(rows.map(r => r.courtId));
}

interface Lineup {
  team1Ids: string[];
  team2Ids: string[];
}

// Try Claude exactly once for the first match. Returns null on any failure
// (the caller falls back to the standard algorithm). All failures are logged
// here, so the caller doesn't need to.
async function tryClaudeFirstMatch(
  sessionId: string,
  poolPlayerIds: string[],
  allPlayers: Awaited<ReturnType<typeof storage.getAllPlayers>>,
): Promise<Lineup | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      `[auto-matchmaking] fell back to standard algorithm session=${sessionId} ` +
      `elapsedMs=0 reason="ANTHROPIC_API_KEY not set"`,
    );
    return null;
  }

  const poolIdSet = new Set(poolPlayerIds);
  const poolPlayers = allPlayers.filter(p => poolIdSet.has(p.id));
  if (poolPlayers.length < 4) {
    console.log(
      `[auto-matchmaking] fell back to standard algorithm session=${sessionId} ` +
      `elapsedMs=0 reason="pool size ${poolPlayers.length} < 4 after resolving ids"`,
    );
    return null;
  }

  const restStates = poolPlayers.map(p => getPlayerRestState(sessionId, p.id));
  const totalGames = restStates.reduce((sum, rs) => sum + (rs.gamesThisSession || 0), 0);
  const avgGames = poolPlayers.length > 0 ? totalGames / poolPlayers.length : 0;

  const sessionState: ClaudeSessionState = {
    availableCourts: 1, // we only need ONE lineup from Claude
    avgGames: Math.round(avgGames * 10) / 10,
    players: poolPlayers.map(p => {
      const rs = getPlayerRestState(sessionId, p.id);
      return {
        name: p.name,
        score: p.skillScore || 90,
        tier: p.level || 'lower_intermediate',
        gender: p.gender || 'male',
        gamesThisSession: rs.gamesThisSession || 0,
        gamesWaited: rs.gamesWaited || 0,
      };
    }),
  };

  const startedAt = Date.now();
  try {
    const parsed = await requestClaudeMatchmaking(sessionState, { timeoutMs: 5000 });
    const first = parsed.suggestions[0];
    if (!first || !Array.isArray(first.team1) || !Array.isArray(first.team2)) {
      throw new Error('AI response missing first suggestion');
    }

    const playersByNameLower = new Map(allPlayers.map(p => [p.name.toLowerCase(), p]));
    const resolveTeam = (team: { name: string }[]): string[] =>
      team.map(raw => {
        const found = playersByNameLower.get(raw.name.toLowerCase());
        if (!found) throw new Error(`Unknown player name from AI: "${raw.name}"`);
        if (!poolIdSet.has(found.id)) {
          throw new Error(`AI picked player not in waiting pool: "${raw.name}"`);
        }
        return found.id;
      });

    const team1Ids = resolveTeam(first.team1);
    const team2Ids = resolveTeam(first.team2);
    if (team1Ids.length !== 2 || team2Ids.length !== 2) {
      throw new Error(`AI returned malformed lineup (${team1Ids.length}v${team2Ids.length})`);
    }
    const allIds = new Set([...team1Ids, ...team2Ids]);
    if (allIds.size !== 4) {
      throw new Error('AI returned duplicate player ids across teams');
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[auto-matchmaking] used Claude AI session=${sessionId} elapsedMs=${elapsedMs} ` +
      `lineup=[${team1Ids.join(',')}]vs[${team2Ids.join(',')}] reasoning="${first.reasoning ?? ''}"`,
    );
    return { team1Ids, team2Ids };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : String(err);
    console.log(
      `[auto-matchmaking] fell back to standard algorithm session=${sessionId} ` +
      `elapsedMs=${elapsedMs} reason="${reason}"`,
    );
    return null;
  }
}

// Build a 2v2 lineup from the pool using the existing bracketed generator.
// Returns null if the generator can't produce a viable combo.
function pickStandardLineup(
  sessionId: string,
  poolPlayerIds: string[],
  allPlayers: Awaited<ReturnType<typeof storage.getAllPlayers>>,
): Lineup | null {
  const { brackets } = generateBracketedLineups(sessionId, poolPlayerIds, allPlayers, 1);
  const top = brackets[0];
  if (!top || !top.combination) return null;
  const combo = top.combination;
  const team1Ids = combo.team1.map(p => p.id);
  const team2Ids = combo.team2.map(p => p.id);
  if (team1Ids.length !== 2 || team2Ids.length !== 2) return null;
  return { team1Ids, team2Ids };
}

export async function tryAutoMatchmaking(sessionId: string): Promise<void> {
  try {
    await withSessionLock(sessionId, async () => {
      const session = await storage.getSession(sessionId);
      if (!session || session.status !== 'active') {
        console.log(`[auto-matchmaking] session=${sessionId} skipped — session missing or not active`);
        return;
      }

      const firstMatch = await isFirstMatchOfSession(sessionId);
      const threshold = firstMatch ? FIRST_MATCH_THRESHOLD : SUBSEQUENT_MATCH_THRESHOLD;

      // Hydrate rest states + partner history from completed games so the
      // standard generator and the Claude prompt both see the right
      // gamesThisSession / gamesWaited / partner history.
      await loadRestStatesFromDb(sessionId);
      const history = await storage.getSessionGameParticipants(sessionId);
      const queue = await storage.getQueue(sessionId);
      buildRestStatesFromHistory(sessionId, history, queue);
      buildPartnerHistoryFromHistory(sessionId, history);

      const sittingOut = new Set(getSittingOutPlayers(sessionId));
      const onInFlight = await getPlayersOnInFlightSuggestions(sessionId);

      // Waiting pool: queue order preserved (so the standard generator's
      // queue-priority logic matches the live admin endpoint), filtered to
      // players who can actually be assigned right now.
      let pool = queue.filter(id => !sittingOut.has(id) && !onInFlight.has(id));

      if (pool.length < threshold) {
        console.log(
          `[auto-matchmaking] session=${sessionId} skipped — ` +
          `pool=${pool.length} < threshold=${threshold} (firstMatch=${firstMatch})`,
        );
        return;
      }

      const courts = await storage.getCourtsBySession(sessionId);
      const courtsWithInFlight = await getCourtsWithInFlightSuggestions(sessionId);
      const availableCourts = courts.filter(
        c => c.status === 'available' && !courtsWithInFlight.has(c.id),
      );

      if (availableCourts.length === 0) {
        console.log(`[auto-matchmaking] session=${sessionId} skipped — no available courts`);
        return;
      }

      const allPlayers = await storage.getAllPlayers();

      let iterationIndex = 0;
      let suggestionsCreated = 0;
      while (pool.length >= 4 && availableCourts.length > 0) {
        const isVeryFirstIteration = iterationIndex === 0 && firstMatch;
        const court = availableCourts.shift()!;

        let lineup: Lineup | null = null;
        if (isVeryFirstIteration) {
          lineup = await tryClaudeFirstMatch(sessionId, pool, allPlayers);
        }
        if (!lineup) {
          // Either Claude declined / failed, or this is not the first
          // iteration — use the standard algorithm.
          lineup = pickStandardLineup(sessionId, pool, allPlayers);
          if (!lineup) {
            console.log(
              `[auto-matchmaking] session=${sessionId} court=${court.id} ` +
              `iteration=${iterationIndex} skipped — bracket generator returned no viable lineup`,
            );
            iterationIndex++;
            continue;
          }
        }

        try {
          await storage.createMatchSuggestion({
            sessionId,
            courtId: court.id,
            pendingUntil: new Date(Date.now() + PENDING_WINDOW_MS),
            players: [
              ...lineup.team1Ids.map(id => ({ playerId: id, team: 1 as const })),
              ...lineup.team2Ids.map(id => ({ playerId: id, team: 2 as const })),
            ],
          });
          suggestionsCreated++;
          console.log(
            `[auto-matchmaking] session=${sessionId} court=${court.id} ` +
            `iteration=${iterationIndex} suggestion created`,
          );
        } catch (createErr) {
          console.error(
            `[auto-matchmaking] session=${sessionId} court=${court.id} ` +
            `iteration=${iterationIndex} createMatchSuggestion failed:`,
            createErr,
          );
          iterationIndex++;
          continue;
        }

        const usedIds = new Set([...lineup.team1Ids, ...lineup.team2Ids]);
        pool = pool.filter(id => !usedIds.has(id));
        iterationIndex++;
      }

      console.log(
        `[auto-matchmaking] session=${sessionId} done — ` +
        `created=${suggestionsCreated} firstMatch=${firstMatch}`,
      );
    });
  } catch (err) {
    console.error(`[auto-matchmaking] session=${sessionId} unhandled:`, err);
  }
}
