// Gate F2 — feed event generation. Pure builders (unit-tested) + guarded
// emission. Emission runs inside a NESTED transaction (Postgres savepoint)
// wrapped in try/catch, so a feed bug can never fail the parent
// transaction's core purpose (score entry). Dedupe: the (type, dedupe_key)
// unique index + onConflictDoNothing make every generator safely
// re-runnable — a conflict is a silent no-op.
import { randomUUID } from "crypto";
import { sql, eq, and, inArray, ne } from "drizzle-orm";
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
// F2.1: win_streak emits ONLY when a streak crosses one of these exact
// values (streaks grow by 1 per game, so crossing = equality). Every game
// at >=3 was feed spam — 47 cards in one night.
export const STREAK_THRESHOLDS = [3, 5, 10, 15, 20];
export const RANK_MOVE_MIN = 3;
export const RANK_TOP_N = 20;

export function buildGameFeedEvents(input: GameFeedInput): FeedEventInsert[] {
  if (input.isSandbox) return []; // sandbox sessions never reach the feed
  const out: FeedEventInsert[] = [];
  const base = { gameResultId: input.gameResultId, sessionId: input.sessionId, relatedTagId: null };

  for (const p of input.perPlayer) {
    // tier_promotion — promotions only (never demotions), and only when the
    // DISPLAY name changes (F2.1): the Advanced→Professional enum crossing
    // is the same public tier, so no card.
    const fromDisplay = getTierDisplayName(p.prevLevel);
    const toDisplay = getTierDisplayName(p.newLevel);
    if (toDisplay !== fromDisplay && tierIndex(p.newLevel) > tierIndex(p.prevLevel)) {
      out.push({
        ...base,
        type: "tier_promotion",
        subjectPlayerId: p.playerId,
        dedupeKey: `${input.gameResultId}:${p.playerId}`,
        payload: {
          playerName: p.name,
          fromTier: fromDisplay,
          toTier: toDisplay,
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

    // win_streak — only when the streak crosses a threshold exactly. The
    // emitter supersedes the player's previous streak card so the feed
    // shows one current-best card per player.
    const streak = input.streaks.get(p.playerId) ?? 0;
    if (p.isWinner && STREAK_THRESHOLDS.includes(streak)) {
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
  entries: Array<{ receiverId: string; receiverName: string; giverId: string; giverName: string; tagId: string; tagLabel: string }>;
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
    // F4 forward-fix: player IDs ride in NEW payloads so the "you" filter can
    // match giver-side activity. Old payloads lack them — consumers must
    // null-safe skip (no backfill).
    payload: { receiverName: e.receiverName, giverName: e.giverName, tagLabel: e.tagLabel, giverPlayerId: e.giverId, receiverPlayerId: e.receiverId },
  }));
}

// ── Tag wall assembly (Gate F3.5) — render-side only ────────────────────────
// One giver tagging a whole session floods the feed with near-identical
// cards. Two tiers, applied PER PAGE after fetch (pagination keys untouched;
// a group splitting across a page boundary is accepted — rare, harmless):
//   1. tag_received events sharing (subjectPlayerId, sessionId) collapse
//      into one tag_received_group. Solo tags pass through unchanged.
//   2. If one sessionId still yields >4 tag clusters on the page, the top 4
//      (most tags, ties by recency) stay as cards and the rest fold into a
//      single tag_overflow item at the first folded position.
// Like state rides on the cluster's NEWEST event (likeTarget).

export const TAG_WALL_MAX_GROUPS_PER_SESSION = 4;

export interface WallEventBase {
  id: string;
  type: string;
  createdAt: Date | string;
  subjectPlayerId: string | null;
  sessionId?: string | null;
  payload: Record<string, any>;
  session?: { venueName: string; date: Date | string } | null;
  likeCount?: number;
  likedByMe?: boolean;
  likePreview?: string[];
}

export interface TagGroupItem<T extends WallEventBase> {
  type: "tag_received_group";
  id: string; // likeTarget — stable key + like anchor
  eventIds: string[];
  subjectPlayerId: string | null;
  subjectName: string;
  giverNames: string[]; // deduped, first-seen order
  tagLabels: string[];
  sessionId: string | null;
  session: T["session"] | null;
  createdAt: T["createdAt"]; // newest member
  likeTarget: string;
  likeCount: number;
  likedByMe: boolean;
  likePreview: string[];
}

export interface TagOverflowItem<T extends WallEventBase> {
  type: "tag_overflow";
  id: string;
  sessionId: string;
  session: T["session"] | null;
  groups: Array<TagGroupItem<T>>;
  playerCount: number;
  previewNames: string[];
}

export type FeedWallItem<T extends WallEventBase> = T | TagGroupItem<T> | TagOverflowItem<T>;

function toGroupItem<T extends WallEventBase>(members: T[]): TagGroupItem<T> {
  const newest = members[0]; // page is newest-first
  const giverNames: string[] = [];
  for (const m of members) {
    const g = m.payload.giverName ?? "A player";
    if (!giverNames.includes(g)) giverNames.push(g);
  }
  return {
    type: "tag_received_group",
    id: newest.id,
    eventIds: members.map((m) => m.id),
    subjectPlayerId: newest.subjectPlayerId,
    subjectName: newest.payload.receiverName ?? "A player",
    giverNames,
    tagLabels: members.map((m) => m.payload.tagLabel ?? ""),
    sessionId: newest.sessionId ?? null,
    session: newest.session ?? null,
    createdAt: newest.createdAt,
    likeTarget: newest.id,
    likeCount: newest.likeCount ?? 0,
    likedByMe: newest.likedByMe ?? false,
    likePreview: newest.likePreview ?? [],
  };
}

export function assembleTagWall<T extends WallEventBase>(items: T[]): Array<FeedWallItem<T>> {
  // Cluster tag events by (subject, session); remember each cluster's members
  // in page (newest-first) order.
  const clusterKey = (e: T) => `${e.subjectPlayerId ?? "none"}|${e.sessionId ?? "none"}`;
  const clusters = new Map<string, T[]>();
  for (const e of items) {
    if (e.type !== "tag_received") continue;
    const key = clusterKey(e);
    const list = clusters.get(key) ?? [];
    list.push(e);
    clusters.set(key, list);
  }

  // Burst cap per non-null session: rank clusters by (size desc, newest desc).
  const foldedKeys = new Set<string>();
  const overflowGroups = new Map<string, string[]>(); // sessionId → folded cluster keys, rank order
  const bySession = new Map<string, string[]>();
  for (const [key, members] of Array.from(clusters.entries())) {
    const sid = members[0].sessionId ?? null;
    if (!sid) continue;
    const list = bySession.get(sid) ?? [];
    list.push(key);
    bySession.set(sid, list);
  }
  for (const [sid, keys] of Array.from(bySession.entries())) {
    if (keys.length <= TAG_WALL_MAX_GROUPS_PER_SESSION) continue;
    const ranked = [...keys].sort((a, b) => {
      const A = clusters.get(a)!, B = clusters.get(b)!;
      if (B.length !== A.length) return B.length - A.length;
      return new Date(B[0].createdAt).getTime() - new Date(A[0].createdAt).getTime();
    });
    const folded = ranked.slice(TAG_WALL_MAX_GROUPS_PER_SESSION);
    for (const k of folded) foldedKeys.add(k);
    overflowGroups.set(sid, folded);
  }

  // Walk the page in order, emitting each cluster (or its overflow) once, at
  // its first member's position. Non-tag events pass through untouched.
  const out: Array<FeedWallItem<T>> = [];
  const emittedClusters = new Set<string>();
  const emittedOverflows = new Set<string>();
  for (const e of items) {
    if (e.type !== "tag_received") {
      out.push(e);
      continue;
    }
    const key = clusterKey(e);
    if (emittedClusters.has(key)) continue;
    if (foldedKeys.has(key)) {
      const sid = e.sessionId!;
      if (!emittedOverflows.has(sid)) {
        emittedOverflows.add(sid);
        const groups = (overflowGroups.get(sid) ?? []).map((k) => toGroupItem(clusters.get(k)!));
        for (const k of overflowGroups.get(sid) ?? []) emittedClusters.add(k);
        out.push({
          type: "tag_overflow",
          id: `overflow:${sid}`,
          sessionId: sid,
          session: e.session ?? null,
          groups,
          playerCount: groups.length,
          previewNames: groups.slice(0, 2).map((g) => g.subjectName),
        });
      }
      continue;
    }
    emittedClusters.add(key);
    const members = clusters.get(key)!;
    if (members.length === 1) {
      out.push(e); // solo tag passes through UNCHANGED
    } else {
      out.push(toGroupItem(members));
    }
  }
  return out;
}

/** Short human headline for an event — used by notification messages. */
export function feedEventHeadline(type: string, payload: Record<string, any>): string {
  switch (type) {
    case "tier_promotion": return `${payload.playerName} is now ${payload.toTier}`;
    case "tag_received": return `${payload.receiverName} earned "${payload.tagLabel}"`;
    case "milestone": return `${payload.playerName}'s milestone`;
    case "win_streak": return `${payload.playerName}'s ${payload.streak}-win streak`;
    case "leaderboard_move": return `${payload.playerName}'s leaderboard climb`;
    default: return "your post";
  }
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
    const fromDisplay = getTierDisplayName(p.prevLevel);
    const toDisplay = getTierDisplayName(p.newLevel);
    if (toDisplay !== fromDisplay && tierIndex(p.newLevel) > tierIndex(p.prevLevel)) {
      out.push({
        type: "tier_promotion",
        subjectPlayerId: p.playerId,
        gameResultId: input.gameResultId,
        sessionId: input.sessionId,
        relatedTagId: null,
        dedupeKey: `corr:${input.gameResultId}:${p.playerId}:${input.newWinningTeam}`,
        payload: { playerName: p.name, fromTier: fromDisplay, toTier: toDisplay, corrected: true },
      });
    }
  }
  return out;
}

// ── Emission ────────────────────────────────────────────────────────────────

export async function insertFeedEvents(
  dbh: Tx | typeof db,
  events: FeedEventInsert[],
): Promise<Array<{ id: string; type: string; subjectPlayerId: string | null }>> {
  if (events.length === 0) return [];
  // .returning() only yields rows that actually inserted — dedupe conflicts
  // (silent no-ops) are absent, so callers can react to FIRST emissions only.
  return await dbh
    .insert(feedEvents)
    .values(events.map((e) => ({ id: randomUUID(), ...e, status: "published", visibility: "public" })))
    .onConflictDoNothing({ target: [feedEvents.type, feedEvents.dedupeKey] })
    .returning({ id: feedEvents.id, type: feedEvents.type, subjectPlayerId: feedEvents.subjectPlayerId });
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
      const inserted = await insertFeedEvents(ftx, events);

      // F2.1: a new streak-threshold card supersedes the player's previous
      // win_streak card in the SAME savepoint — the feed shows one
      // current-best streak per player. Dedupe no-ops (re-runs) return no
      // rows from insertFeedEvents, so this never re-fires.
      for (const row of inserted) {
        if (row.type !== "win_streak" || !row.subjectPlayerId) continue;
        await ftx
          .update(feedEvents)
          .set({ status: "superseded", supersededByEventId: row.id })
          .where(and(
            eq(feedEvents.type, "win_streak"),
            eq(feedEvents.subjectPlayerId, row.subjectPlayerId),
            eq(feedEvents.status, "published"),
            ne(feedEvents.id, row.id),
          ));
      }
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

// The cursor timestamp is carried as Postgres's own ::text rendering and
// never round-tripped through a JS Date: Date has millisecond precision,
// but created_at is stored with MICROseconds — truncation would place the
// cursor slightly before the true boundary and silently drop every row
// sharing that millisecond (found live: page 2 of a 24-event feed came
// back empty because one insert batch shared a single timestamp).
const CURSOR_TS_SHAPE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

export function encodeFeedCursor(createdAt: Date | string, id: string): string {
  const ts = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return Buffer.from(`${ts}|${id}`).toString("base64url");
}

export function decodeFeedCursor(cursor: unknown): { createdAt: string; id: string } | null {
  if (typeof cursor !== "string" || !cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const createdAt = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!id || !CURSOR_TS_SHAPE.test(createdAt)) return null;
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
