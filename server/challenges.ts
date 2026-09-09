// Player Challenges — rules (pure, unit-tested) + the DB helpers the routes
// and the settlement path share.
//
// A challenge is between two PLAYERS (operational player ids), created only
// through the marketplace routes by a linked player. One open challenge per
// unordered pair (pair_key + partial unique index), at most MAX_OUTGOING open
// outgoing per player, and a pending challenge lapses after EXPIRY_DAYS.
//
// Payloads carry display names and DISPLAY tier labels only — never the DB
// tier enums.
import { randomUUID } from "crypto";
import { sql, eq, and, or, inArray, desc, lte } from "drizzle-orm";
import { db } from "./db";
import { challenges, players, marketplaceUsers, marketplaceNotifications, feedEvents, type Challenge } from "@shared/schema";
import { TIER_ORDER, insertFeedEvents, buildChallengeSettledEvent } from "./feedEvents";
import { getTierDisplayName } from "@shared/utils/skillUtils";

export { TIER_ORDER };

export const OPEN_STATUSES = ['pending', 'accepted'] as const;
export const MAX_OUTGOING = 3;
export const EXPIRY_DAYS = 7;
export const SETTLED_LIMIT = 10;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

// ── Pure rules ───────────────────────────────────────────────────────────────

/** Within one rung of each other on the tier ladder. Unknown levels are never in range. */
export function canChallenge(levelA: string, levelB: string): boolean {
  const i = TIER_ORDER.indexOf(levelA);
  const j = TIER_ORDER.indexOf(levelB);
  if (i < 0 || j < 0) return false;
  return Math.abs(i - j) <= 1;
}

/** One key per unordered pair. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function expiresAtFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/** Only a PENDING challenge can lapse; an accepted one waits for a game. */
export function isExpired(c: { status: string; expiresAt: Date | string }, now: Date = new Date()): boolean {
  return c.status === 'pending' && new Date(c.expiresAt).getTime() <= now.getTime();
}

export type Direction = 'incoming' | 'outgoing';
export function challengeDirection(c: { challengerPlayerId: string; challengedPlayerId: string }, viewerPlayerId: string): Direction {
  return c.challengedPlayerId === viewerPlayerId ? 'incoming' : 'outgoing';
}

export interface CreateGuardInput {
  challengerId: string;
  challengedId: string;
  challengerLevel: string;
  challengedLevel: string;
  challengedExists: boolean;
  openOutgoingCount: number;
  existingOpenForPair: { id: string; status: string } | null;
}
export type CreateGuardResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** The whole 4xx ladder for POST /challenges, in precedence order. */
export function checkCreateGuards(i: CreateGuardInput): CreateGuardResult {
  if (i.challengerId === i.challengedId) return { ok: false, status: 400, error: 'You cannot challenge yourself' };
  if (!i.challengedExists) return { ok: false, status: 404, error: 'Player not found' };
  if (!canChallenge(i.challengerLevel, i.challengedLevel)) return { ok: false, status: 403, error: 'Out of range' };
  if (i.existingOpenForPair) return { ok: false, status: 409, error: 'Open challenge already exists' };
  if (i.openOutgoingCount >= MAX_OUTGOING) return { ok: false, status: 409, error: `You have ${MAX_OUTGOING} open challenges` };
  return { ok: true };
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/** Lapses every pending challenge past its expiry. Returns how many. */
export async function expireStaleChallenges(now: Date = new Date(), dbh: DbOrTx = db): Promise<number> {
  const rows = await dbh
    .update(challenges)
    .set({ status: 'expired' })
    .where(and(eq(challenges.status, 'pending'), lte(challenges.expiresAt, now)))
    .returning({ id: challenges.id });
  return rows.length;
}

export async function getChallenge(id: string, dbh: DbOrTx = db): Promise<Challenge | undefined> {
  const [row] = await dbh.select().from(challenges).where(eq(challenges.id, id));
  return row;
}

export async function findOpenForPair(a: string, b: string, dbh: DbOrTx = db): Promise<Challenge | undefined> {
  const [row] = await dbh
    .select()
    .from(challenges)
    .where(and(eq(challenges.pairKey, pairKey(a, b)), inArray(challenges.status, [...OPEN_STATUSES])));
  return row;
}

export async function countOpenOutgoing(playerId: string, dbh: DbOrTx = db): Promise<number> {
  const [{ n }] = await dbh
    .select({ n: sql<number>`count(*)::int` })
    .from(challenges)
    .where(and(eq(challenges.challengerPlayerId, playerId), inArray(challenges.status, [...OPEN_STATUSES])));
  return Number(n);
}

/** Open (pending|accepted) challenges where BOTH players are in the given
 *  list — the input for settlement (C2) and captain visibility (C5). */
export async function findOpenChallengeForPlayers(playerIds: string[], dbh: DbOrTx = db, statuses: readonly string[] = OPEN_STATUSES): Promise<Challenge[]> {
  if (playerIds.length < 2) return [];
  return dbh
    .select()
    .from(challenges)
    .where(and(
      inArray(challenges.status, [...statuses]),
      inArray(challenges.challengerPlayerId, playerIds),
      inArray(challenges.challengedPlayerId, playerIds),
    ));
}

export async function createChallenge(challengerId: string, challengedId: string, dbh: DbOrTx = db): Promise<Challenge> {
  const createdAt = new Date();
  const [row] = await dbh
    .insert(challenges)
    .values({
      id: randomUUID(),
      challengerPlayerId: challengerId,
      challengedPlayerId: challengedId,
      pairKey: pairKey(challengerId, challengedId),
      status: 'pending',
      createdAt,
      expiresAt: expiresAtFrom(createdAt),
    })
    .returning();
  return row;
}

/** Pending → accepted|declined. Returns undefined when the row was not pending
 *  any more (the UPDATE is guarded so two taps can't both win). */
export async function respondToChallenge(id: string, status: 'accepted' | 'declined', dbh: DbOrTx = db): Promise<Challenge | undefined> {
  const [row] = await dbh
    .update(challenges)
    .set({ status, respondedAt: new Date() })
    .where(and(eq(challenges.id, id), eq(challenges.status, 'pending')))
    .returning();
  return row;
}

// ── Views (display names + display tiers, never DB enums) ───────────────────

export interface ChallengePlayerView { id: string; name: string; tier: string }
export interface ChallengeView {
  id: string;
  status: string;
  direction: Direction;
  challenger: ChallengePlayerView;
  challenged: ChallengePlayerView;
  winner: ChallengePlayerView | null;
  gameResultId: string | null;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  settledAt: string | null;
}

async function loadPlayerViews(ids: string[], dbh: DbOrTx = db): Promise<Map<string, ChallengePlayerView>> {
  const uniq = Array.from(new Set(ids));
  if (uniq.length === 0) return new Map();
  const rows = await dbh.select({ id: players.id, name: players.name, level: players.level }).from(players).where(inArray(players.id, uniq));
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, tier: getTierDisplayName(r.level) }]));
}

export async function toViews(rows: Challenge[], viewerPlayerId: string, dbh: DbOrTx = db): Promise<ChallengeView[]> {
  const people = await loadPlayerViews(rows.flatMap((r) => [r.challengerPlayerId, r.challengedPlayerId, ...(r.winnerPlayerId ? [r.winnerPlayerId] : [])]), dbh);
  const unknown = (id: string): ChallengePlayerView => ({ id, name: 'Player', tier: '' });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    direction: challengeDirection(r, viewerPlayerId),
    challenger: people.get(r.challengerPlayerId) ?? unknown(r.challengerPlayerId),
    challenged: people.get(r.challengedPlayerId) ?? unknown(r.challengedPlayerId),
    winner: r.winnerPlayerId ? (people.get(r.winnerPlayerId) ?? unknown(r.winnerPlayerId)) : null,
    gameResultId: r.gameResultId ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
    respondedAt: r.respondedAt ? new Date(r.respondedAt).toISOString() : null,
    settledAt: r.settledAt ? new Date(r.settledAt).toISOString() : null,
  }));
}

export interface MineView { incoming: ChallengeView[]; outgoing: ChallengeView[]; active: ChallengeView[]; settled: ChallengeView[] }

/** Everything the viewer can act on or should know about. */
export async function listMine(viewerPlayerId: string, dbh: DbOrTx = db): Promise<MineView> {
  const mine = or(eq(challenges.challengerPlayerId, viewerPlayerId), eq(challenges.challengedPlayerId, viewerPlayerId));
  const open = await dbh.select().from(challenges)
    .where(and(mine, inArray(challenges.status, [...OPEN_STATUSES])))
    .orderBy(desc(challenges.createdAt));
  const settled = await dbh.select().from(challenges)
    .where(and(mine, eq(challenges.status, 'settled')))
    .orderBy(desc(challenges.settledAt))
    .limit(SETTLED_LIMIT);
  const views = await toViews([...open, ...settled], viewerPlayerId, dbh);
  return {
    incoming: views.filter((v) => v.status === 'pending' && v.direction === 'incoming'),
    outgoing: views.filter((v) => v.status === 'pending' && v.direction === 'outgoing'),
    active: views.filter((v) => v.status === 'accepted'),
    settled: views.filter((v) => v.status === 'settled'),
  };
}

export interface StatusView {
  canChallenge: boolean;
  reason?: string;
  existing?: { id: string; status: string; direction: Direction };
}

// ── Settlement (C2) ─────────────────────────────────────────────────────────
// A game settles every ACCEPTED challenge whose two players stood on OPPOSITE
// teams; the winner is whichever of them was on the winning side. Same team
// = not this game. The decision is pure; the write is savepoint-guarded.

export interface SettleParticipant { playerId: string; team: number; isWinner: boolean }
export interface SettlementPick { challengeId: string; winnerPlayerId: string; loserPlayerId: string }

export function pickSettlements(
  open: Array<{ id: string; challengerPlayerId: string; challengedPlayerId: string; status: string }>,
  perPlayer: SettleParticipant[],
): SettlementPick[] {
  const byId = new Map(perPlayer.map((p) => [p.playerId, p]));
  const out: SettlementPick[] = [];
  for (const c of open) {
    if (c.status !== 'accepted') continue;
    const a = byId.get(c.challengerPlayerId);
    const b = byId.get(c.challengedPlayerId);
    if (!a || !b || a.team === b.team) continue;
    const winner = a.isWinner ? a : b.isWinner ? b : null;
    if (!winner) continue;
    const loser = winner === a ? b : a;
    out.push({ challengeId: c.id, winnerPlayerId: winner.playerId, loserPlayerId: loser.playerId });
  }
  return out;
}

/** After a score edit: the settled winner under the NEW winning team, or null
 *  when nothing changes (or the pair isn't on opposite teams of this game). */
export function flipWinnerFor(
  c: { challengerPlayerId: string; challengedPlayerId: string; winnerPlayerId: string | null },
  newWinningTeam: number,
  teamOf: Map<string, number>,
): string | null {
  const ta = teamOf.get(c.challengerPlayerId);
  const tb = teamOf.get(c.challengedPlayerId);
  if (ta === undefined || tb === undefined || ta === tb) return null;
  const newWinner = ta === newWinningTeam ? c.challengerPlayerId : tb === newWinningTeam ? c.challengedPlayerId : null;
  if (!newWinner || newWinner === c.winnerPlayerId) return null;
  return newWinner;
}

export interface SettledChallenge {
  id: string;
  challengerPlayerId: string;
  challengedPlayerId: string;
  winnerPlayerId: string;
  loserPlayerId: string;
  winnerName: string;
  loserName: string;
}

/** Runs inside the score-entry transaction, in its OWN savepoint with its own
 *  try/catch (exactly like emitGameFeedEventsInTx): a failure here can never
 *  fail score entry. Sandbox games settle nothing. Returns what settled. */
export async function settleChallengesInTx(
  tx: Tx,
  input: { gameResultId: string; sessionId: string; isSandbox: boolean; perPlayer: SettleParticipant[]; team1Score?: number; team2Score?: number },
): Promise<SettledChallenge[]> {
  if (input.isSandbox) return [];
  try {
    return await tx.transaction(async (stx) => {
      const ids = input.perPlayer.map((p) => p.playerId);
      const open = await findOpenChallengeForPlayers(ids, stx, ['accepted']);
      const picks = pickSettlements(open, input.perPlayer);
      if (picks.length === 0) return [];
      const teamOf = new Map(input.perPlayer.map((p) => [p.playerId, p.team]));
      const scoreOfTeam = (team: number | undefined) => (team === 1 ? input.team1Score : team === 2 ? input.team2Score : undefined) ?? 0;

      const nameRows = await stx.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ids));
      const names = new Map(nameRows.map((r) => [r.id, r.name]));
      const userRows = await stx
        .select({ id: marketplaceUsers.id, linkedPlayerId: marketplaceUsers.linkedPlayerId })
        .from(marketplaceUsers)
        .where(inArray(marketplaceUsers.linkedPlayerId, ids));
      const userByPlayer = new Map(userRows.map((u) => [u.linkedPlayerId, u.id]));

      const now = new Date();
      const settled: SettledChallenge[] = [];
      for (const pick of picks) {
        // Guarded: only an accepted row settles, so a retried score entry can't re-settle.
        const [row] = await stx
          .update(challenges)
          .set({ status: 'settled', gameResultId: input.gameResultId, winnerPlayerId: pick.winnerPlayerId, settledAt: now })
          .where(and(eq(challenges.id, pick.challengeId), eq(challenges.status, 'accepted')))
          .returning();
        if (!row) continue;
        const winnerName = names.get(pick.winnerPlayerId) ?? 'Player';
        const loserName = names.get(pick.loserPlayerId) ?? 'Player';
        settled.push({
          id: row.id,
          challengerPlayerId: row.challengerPlayerId,
          challengedPlayerId: row.challengedPlayerId,
          winnerPlayerId: pick.winnerPlayerId,
          loserPlayerId: pick.loserPlayerId,
          winnerName,
          loserName,
        });
        for (const pid of [pick.winnerPlayerId, pick.loserPlayerId]) {
          const userId = userByPlayer.get(pid);
          if (!userId) continue;
          await stx.insert(marketplaceNotifications).values({
            id: randomUUID(),
            userId,
            type: 'challenge_settled',
            title: 'Challenge settled',
            message: `${winnerName} beat ${loserName} — challenge settled`,
          });
        }
        // Feed card (C3), in the SAME savepoint as the settlement write.
        await insertFeedEvents(stx, [buildChallengeSettledEvent({
          challengeId: row.id,
          gameResultId: input.gameResultId,
          sessionId: input.sessionId,
          winner: { id: pick.winnerPlayerId, name: winnerName },
          loser: { id: pick.loserPlayerId, name: loserName },
          score: { winner: scoreOfTeam(teamOf.get(pick.winnerPlayerId)), loser: scoreOfTeam(teamOf.get(pick.loserPlayerId)) },
        })]);
      }
      return settled;
    });
  } catch (err) {
    console.error('[Challenges] settlement failed (score entry unaffected):', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Score-edit path (C3): the settled card is anchored to the game, so after a
 *  winner flip we supersede every published challenge_settled card for that
 *  game and insert a corrected card (its own dedupe key) per settled
 *  challenge. Self-guarded — never fails the correction. Returns the count. */
export async function supersedeChallengeCardsForGame(
  gameResultId: string,
  input: { sessionId: string; newWinningTeam: number; team1Score: number; team2Score: number; participants: Array<{ playerId: string; team: number }> },
): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(challenges)
        .where(and(eq(challenges.gameResultId, gameResultId), eq(challenges.status, 'settled')));
      if (rows.length === 0) return 0;
      const ids = rows.flatMap((r) => [r.challengerPlayerId, r.challengedPlayerId]);
      const nameRows = await tx.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ids));
      const names = new Map(nameRows.map((r) => [r.id, r.name]));
      const teamOf = new Map(input.participants.map((p) => [p.playerId, p.team]));
      const scoreOfTeam = (team: number | undefined) => (team === 1 ? input.team1Score : team === 2 ? input.team2Score : 0);

      const marker = randomUUID();
      await tx
        .update(feedEvents)
        .set({ status: 'superseded', supersededByEventId: marker })
        .where(and(eq(feedEvents.gameResultId, gameResultId), eq(feedEvents.type, 'challenge_settled'), eq(feedEvents.status, 'published')));

      let n = 0;
      for (const c of rows) {
        const winnerId = c.winnerPlayerId ?? (teamOf.get(c.challengerPlayerId) === input.newWinningTeam ? c.challengerPlayerId : c.challengedPlayerId);
        const loserId = winnerId === c.challengerPlayerId ? c.challengedPlayerId : c.challengerPlayerId;
        await insertFeedEvents(tx, [buildChallengeSettledEvent({
          challengeId: c.id,
          gameResultId,
          sessionId: input.sessionId,
          winner: { id: winnerId, name: names.get(winnerId) ?? 'Player' },
          loser: { id: loserId, name: names.get(loserId) ?? 'Player' },
          score: { winner: scoreOfTeam(teamOf.get(winnerId)), loser: scoreOfTeam(teamOf.get(loserId)) },
          correction: true,
        })]);
        n++;
      }
      return n;
    });
  } catch (err) {
    console.error('[Challenges] card supersede failed (correction unaffected):', err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Score-edit path: re-point the winner of every challenge settled by this
 *  game when the winning team changed. Self-guarded; returns how many flipped. */
export async function flipSettledWinnersForGame(
  gameResultId: string,
  newWinningTeam: number,
  participants: Array<{ playerId: string; team: number }>,
  dbh: DbOrTx = db,
): Promise<number> {
  try {
    const rows = await dbh
      .select()
      .from(challenges)
      .where(and(eq(challenges.gameResultId, gameResultId), eq(challenges.status, 'settled')));
    const teamOf = new Map(participants.map((p) => [p.playerId, p.team]));
    let flipped = 0;
    for (const c of rows) {
      const newWinner = flipWinnerFor(c, newWinningTeam, teamOf);
      if (!newWinner) continue;
      const [u] = await dbh.update(challenges).set({ winnerPlayerId: newWinner }).where(eq(challenges.id, c.id)).returning();
      if (u) flipped++;
    }
    return flipped;
  } catch (err) {
    console.error('[Challenges] winner flip failed (correction unaffected):', err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── Captain visibility (C5) ─────────────────────────────────────────────────

export interface SessionChallenge {
  challengeId: string;
  status: string;
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  createdAt: string;
  respondedAt: string | null;
}

/** Open (pending|accepted) challenges where BOTH players hold a confirmed or
 *  attended booking in the session. `id` may be the bookable session id or
 *  the operational session id (resolved via linked_session_id). */
export async function listSessionChallenges(id: string, dbh: DbOrTx = db): Promise<SessionChallenge[]> {
  const { rows } = await dbh.execute(sql`
    WITH target AS (
      SELECT bs.id FROM bookable_sessions bs WHERE bs.id = ${id}
      UNION ALL
      SELECT bs.id FROM bookable_sessions bs WHERE bs.linked_session_id = ${id}
      LIMIT 1
    ), booked AS (
      SELECT DISTINCT u.linked_player_id AS player_id
        FROM bookings b
        JOIN marketplace_users u ON u.id = b.user_id
       WHERE b.session_id = (SELECT id FROM target)
         AND b.status IN ('confirmed', 'attended')
         AND u.linked_player_id IS NOT NULL
    )
    SELECT c.id, c.status,
           c.challenger_player_id AS a_id, pa.name AS a_name,
           c.challenged_player_id AS b_id, pb.name AS b_name,
           c.created_at, c.responded_at
      FROM challenges c
      JOIN players pa ON pa.id = c.challenger_player_id
      JOIN players pb ON pb.id = c.challenged_player_id
     WHERE c.status IN ('pending', 'accepted')
       AND c.challenger_player_id IN (SELECT player_id FROM booked)
       AND c.challenged_player_id IN (SELECT player_id FROM booked)
     ORDER BY c.created_at`);
  return (rows as any[]).map((r) => ({
    challengeId: r.id,
    status: r.status,
    aId: r.a_id,
    aName: r.a_name,
    bId: r.b_id,
    bName: r.b_name,
    createdAt: new Date(r.created_at).toISOString(),
    respondedAt: r.responded_at ? new Date(r.responded_at).toISOString() : null,
  }));
}

/** Whether `viewer` may challenge `target` right now, and why not. */
export async function statusFor(viewerPlayerId: string, target: { id: string; level: string }, viewerLevel: string, dbh: DbOrTx = db): Promise<StatusView> {
  if (viewerPlayerId === target.id) return { canChallenge: false, reason: 'This is you' };
  const existing = await findOpenForPair(viewerPlayerId, target.id, dbh);
  if (existing) {
    return {
      canChallenge: false,
      reason: existing.status === 'pending' ? 'Challenge pending' : 'Challenge active',
      existing: { id: existing.id, status: existing.status, direction: challengeDirection(existing, viewerPlayerId) },
    };
  }
  if (!canChallenge(viewerLevel, target.level)) return { canChallenge: false, reason: 'Out of your range' };
  if ((await countOpenOutgoing(viewerPlayerId, dbh)) >= MAX_OUTGOING) return { canChallenge: false, reason: `You have ${MAX_OUTGOING} open challenges` };
  return { canChallenge: true };
}

/** Feed Gate 2: the player ids behind a page of challenge cards — ONE query
 *  for all challenge ids on the page; empty input makes no query. */
export async function loadChallengePlayerIds(
  ids: string[],
  dbh: DbOrTx = db,
): Promise<Map<string, { id: string; challengerPlayerId: string; challengedPlayerId: string; winnerPlayerId: string | null }>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (unique.length === 0) return new Map();
  const rows = await dbh
    .select({
      id: challenges.id,
      challengerPlayerId: challenges.challengerPlayerId,
      challengedPlayerId: challenges.challengedPlayerId,
      winnerPlayerId: challenges.winnerPlayerId,
    })
    .from(challenges)
    .where(inArray(challenges.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}
