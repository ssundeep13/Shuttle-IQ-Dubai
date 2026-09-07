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
import { challenges, players, type Challenge } from "@shared/schema";
import { TIER_ORDER } from "./feedEvents";
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
