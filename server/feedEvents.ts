// Gate F2 — feed event generation. Pure builders (unit-tested) + guarded
// emission. Emission runs inside a NESTED transaction (Postgres savepoint)
// wrapped in try/catch, so a feed bug can never fail the parent
// transaction's core purpose (score entry). Dedupe: the (type, dedupe_key)
// unique index + onConflictDoNothing make every generator safely
// re-runnable — a conflict is a silent no-op.
import { randomUUID } from "crypto";
import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "./db";
import { feedEvents } from "@shared/schema";
import { getTierDisplayName } from "@shared/utils/skillUtils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TIER_ORDER = ["Novice", "Beginner", "lower_intermediate", "upper_intermediate", "Advanced", "Professional"];
const tierIndex = (level: string) => TIER_ORDER.indexOf(level);

export interface FeedEventInsert {
  type: string;
  subjectPlayerId: string | null;
  gameResultId: string | null;
  sessionId: string | null;
  relatedTagId: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export interface GamePlayerContext {
  playerId: string;
  name: string;
  prevLevel: string;
  newLevel: string;
  prevWins: number;
  prevGames: number;
  newGames: number;
  isWinner: boolean;
}

export interface GameFeedInput {
  gameResultId: string;
  sessionId: string;
  isSandbox: boolean;
  perPlayer: GamePlayerContext[];
  /** consecutive wins INCLUDING this game, winners only (sandbox-excluded) */
  streaks: Map<string, number>;
  /** leaderboard rank (1-based, by skill score) before/after this game */
  ranks: Map<string, { before: number; after: number }>;
}

// ── Pure builders ───────────────────────────────────────────────────────────

export const MILESTONE_GAMES = [50, 100];
export const STREAK_MIN = 3;
export const RANK_MOVE_MIN = 3;
export const RANK_TOP_N = 20;

export function buildGameFeedEvents(input: GameFeedInput): FeedEventInsert[] {
  if (input.isSandbox) return []; // sandbox sessions never reach the feed
  const out: FeedEventInsert[] = [];
  const base = { gameResultId: input.gameResultId, sessionId: input.sessionId, relatedTagId: null };

  for (const p of input.perPlayer) {
    // tier_promotion — promotions only (never demotions), display tiers only.
    if (p.newLevel !== p.prevLevel && tierIndex(p.newLevel) > tierIndex(p.prevLevel)) {
      out.push({
        ...base,
        type: "tier_promotion",
        subjectPlayerId: p.playerId,
        dedupeKey: `${input.gameResultId}:${p.playerId}`,
        payload: {
          playerName: p.name,
          fromTier: getTierDisplayName(p.prevLevel),
          toTier: getTierDisplayName(p.newLevel),
        },
      });
    }

    // milestones — first game, first win, 50th, 100th.
    const milestones: Array<{ kind: string; when: boolean }> = [
      { kind: "first_game", when: p.prevGames === 0 },
      { kind: "first_win", when: p.prevWins === 0 && p.isWinner },
      ...MILESTONE_GAMES.map((n) => ({ kind: `game_${n}`, when: p.newGames === n })),
    ];
    for (const m of milestones) {
      if (!m.when) continue;
      out.push({
        ...base,
        type: "milestone",
        subjectPlayerId: p.playerId,
        dedupeKey: `${m.kind}:${p.playerId}`,
        payload: { playerName: p.name, milestone: m.kind, games: p.newGames },
      });
    }

    // win_streak — 3+ consecutive wins including this game.
    const streak = input.streaks.get(p.playerId) ?? 0;
    if (p.isWinner && streak >= STREAK_MIN) {
      out.push({
        ...base,
        type: "win_streak",
        subjectPlayerId: p.playerId,
        dedupeKey: `${input.gameResultId}:${p.playerId}`,
        payload: { playerName: p.name, streak },
      });
    }

    // leaderboard_move — 3+ places, landing in the top 20.
    const rank = input.ranks.get(p.playerId);
    if (rank && rank.after <= RANK_TOP_N && rank.before - rank.after >= RANK_MOVE_MIN) {
      out.push({
        ...base,
        type: "leaderboard_move",
        subjectPlayerId: p.playerId,
        dedupeKey: `${input.gameResultId}:${p.playerId}`,
        payload: { playerName: p.name, fromRank: rank.before, toRank: rank.after },
      });
    }
  }
  return out;
}

export interface TagFeedInput {
  gameResultId: string;
  sessionId: string | null;
  isSandbox: boolean;
  entries: Array<{ receiverId: string; receiverName: string; giverName: string; tagId: string; tagLabel: string }>;
}

export function buildTagFeedEvents(input: TagFeedInput): FeedEventInsert[] {
  if (input.isSandbox) return [];
  return input.entries.map((e) => ({
    type: "tag_received",
    subjectPlayerId: e.receiverId,
    gameResultId: input.gameResultId,
    sessionId: input.sessionId,
    relatedTagId: e.tagId,
    dedupeKey: `${input.gameResultId}:${e.giverName}:${e.receiverId}:${e.tagId}`,
    payload: { receiverName: e.receiverName, giverName: e.giverName, tagLabel: e.tagLabel },
  }));
}

// Correction (winner flip / tier change): replacement tier_promotion events.
// Deterministic dedupe key per corrected outcome so re-running the same
// correction is a no-op.
export function buildCorrectionReplacements(input: {
  gameResultId: string;
  sessionId: string;
  newWinningTeam: number;
  perPlayer: Array<{ playerId: string; name: string; prevLevel: string; newLevel: string }>;
}): FeedEventInsert[] {
  const out: FeedEventInsert[] = [];
  for (const p of input.perPlayer) {
    if (p.newLevel !== p.prevLevel && tierIndex(p.newLevel) > tierIndex(p.prevLevel)) {
      out.push({
        type: "tier_promotion",
        subjectPlayerId: p.playerId,
        gameResultId: input.gameResultId,
        sessionId: input.sessionId,
        relatedTagId: null,
        dedupeKey: `corr:${input.gameResultId}:${p.playerId}:${input.newWinningTeam}`,
        payload: { playerName: p.name, fromTier: getTierDisplayName(p.prevLevel), toTier: getTierDisplayName(p.newLevel), corrected: true },
      });
    }
  }
  return out;
}

// ── Emission ────────────────────────────────────────────────────────────────

export async function insertFeedEvents(dbh: Tx | typeof db, events: FeedEventInsert[]): Promise<void> {
  if (events.length === 0) return;
  await dbh
    .insert(feedEvents)
    .values(events.map((e) => ({ id: randomUUID(), ...e, status: "published", visibility: "public" })))
    .onConflictDoNothing({ target: [feedEvents.type, feedEvents.dedupeKey] });
}

/**
 * Runs INSIDE completeGameTransaction. All feed SQL (streak lookups, the
 * rank scan, the insert) executes in a nested transaction so any error rolls
 * back to the savepoint and the caught exception leaves the PARENT
 * transaction healthy — a feed bug can never block score entry.
 */
export async function emitGameFeedEventsInTx(
  tx: Tx,
  ctx: {
    gameResultId: string;
    sessionId: string;
    isSandbox: boolean;
    perPlayer: Array<GamePlayerContext & { prevScore: number; newScore: number }>;
  },
): Promise<void> {
  if (ctx.isSandbox) return;
  try {
    await tx.transaction(async (ftx) => {
      // Win streaks: consecutive wins from the most recent non-sandbox games
      // (this game's rows are already visible inside the parent tx).
      const streaks = new Map<string, number>();
      for (const p of ctx.perPlayer) {
        if (!p.isWinner) continue;
        const rows = (await ftx.execute(sql`
          SELECT (gr.winning_team = gp.team) AS won
          FROM game_participants gp
          JOIN game_results gr ON gr.id = gp.game_id
          JOIN sessions s ON s.id = gr.session_id
          WHERE gp.player_id = ${p.playerId} AND (s.is_sandbox = false OR s.is_sandbox IS NULL)
          ORDER BY gr.created_at DESC, gr.id DESC
          LIMIT 10`)).rows as Array<{ won: boolean }>;
        let n = 0;
        for (const r of rows) {
          if (r.won) n++;
          else break;
        }
        streaks.set(p.playerId, n);
      }

      // Leaderboard ranks: one full scan (players table already carries the
      // post-game scores at this point in the parent tx); "before" substitutes
      // the participants' pre-game scores.
      const all = (await ftx.execute(sql`SELECT id, skill_score FROM players`)).rows as Array<{ id: string; skill_score: number }>;
      const rankWith = (overrides: Map<string, number>, mineId: string): number => {
        const mine = overrides.get(mineId) ?? all.find((a) => a.id === mineId)?.skill_score ?? 0;
        let higher = 0;
        for (const a of all) {
          if (a.id === mineId) continue;
          const s = overrides.get(a.id) ?? a.skill_score;
          if (s > mine) higher++;
        }
        return higher + 1;
      };
      const beforeOverrides = new Map(ctx.perPlayer.map((p) => [p.playerId, p.prevScore]));
      const afterOverrides = new Map<string, number>();
      const ranks = new Map(ctx.perPlayer.map((p) => [
        p.playerId,
        { before: rankWith(beforeOverrides, p.playerId), after: rankWith(afterOverrides, p.playerId) },
      ]));

      const events = buildGameFeedEvents({
        gameResultId: ctx.gameResultId,
        sessionId: ctx.sessionId,
        isSandbox: ctx.isSandbox,
        perPlayer: ctx.perPlayer,
        streaks,
        ranks,
      });
      await insertFeedEvents(ftx, events);
    });
  } catch (err) {
    console.error("[FeedEvents] emission failed (score entry unaffected):", err instanceof Error ? err.message : err);
  }
}

// ── Feed API helpers (Gate F3) ──────────────────────────────────────────────
// Keyset cursor over (created_at, id) DESC — stable under concurrent inserts.
export const FEED_PAGE_SIZE = 20;
export const SESSION_FEED_TYPES = ["session_recap", "scarcity"]; // F5/F7 types — filter built now, returns empty
export type FeedFilter = "all" | "you" | "sessions";

export function parseFeedFilter(v: unknown): FeedFilter {
  return v === "you" || v === "sessions" ? v : "all";
}

export function encodeFeedCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeFeedCursor(cursor: unknown): { createdAt: Date; id: string } | null {
  if (typeof cursor !== "string" || !cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Correction path: supersede published game-anchored events + insert replacements. */
export async function supersedeGameFeedEvents(
  gameResultId: string,
  replacements: FeedEventInsert[],
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const marker = randomUUID(); // groups this correction's supersede pass
      await tx
        .update(feedEvents)
        .set({ status: "superseded", supersededByEventId: marker })
        .where(and(
          eq(feedEvents.gameResultId, gameResultId),
          eq(feedEvents.status, "published"),
          inArray(feedEvents.type, ["tier_promotion", "milestone", "win_streak", "leaderboard_move"]),
        ));
      await insertFeedEvents(tx, replacements);
    });
  } catch (err) {
    console.error("[FeedEvents] supersede failed (correction unaffected):", err instanceof Error ? err.message : err);
  }
}
