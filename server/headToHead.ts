// Player Challenges C4.1 — head-to-head record between two players.
//
// A "meeting" is a recorded game (game_results) in a NON-sandbox session where
// both players took part on OPPOSITE teams; games where they were partners do
// not count. The SQL joins game_participants twice on game_id and filters by
// both player ids, so an index on game_participants(player_id) would serve it
// directly. Aggregation is pure so it can be unit-tested without a database.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { getTierDisplayName } from "@shared/utils/skillUtils";

type DbLike = { execute: (q: any) => Promise<{ rows: unknown[] }> };

export interface HeadToHeadRow {
  gameId: string;
  myTeam: number;
  theirTeam: number;
  winningTeam: number;
  team1Score: number;
  team2Score: number;
  /** ISO timestamp (game_results.created_at is naive UTC on this database). */
  playedAt: string;
  isSandbox: boolean | null;
}

export interface HeadToHeadLast {
  myScore: number;
  theirScore: number;
  playedAt: string;
}

export interface HeadToHeadRecord {
  met: number;
  myWins: number;
  theirWins: number;
  last: HeadToHeadLast | null;
}

export interface HeadToHeadPlayer {
  name: string;
  skillScore: number;
  tierLabel: string;
}

export interface HeadToHeadView extends HeadToHeadRecord {
  me: HeadToHeadPlayer;
  them: HeadToHeadPlayer;
}

const toIso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

/** Opposite-team, non-sandbox games only; `last` is the most recent of them. */
export function aggregateHeadToHead(rows: HeadToHeadRow[]): HeadToHeadRecord {
  const meetings = rows
    .filter((r) => r.isSandbox !== true && r.myTeam !== r.theirTeam)
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
  let myWins = 0;
  let theirWins = 0;
  for (const g of meetings) {
    if (g.winningTeam === g.myTeam) myWins += 1;
    else if (g.winningTeam === g.theirTeam) theirWins += 1;
  }
  const newest = meetings[0];
  const last: HeadToHeadLast | null = newest
    ? {
        myScore: newest.myTeam === 1 ? newest.team1Score : newest.team2Score,
        theirScore: newest.theirTeam === 1 ? newest.team1Score : newest.team2Score,
        playedAt: newest.playedAt,
      }
    : null;
  return { met: meetings.length, myWins, theirWins, last };
}

/** Every game both players appear in (any teams); sandbox sessions excluded in SQL, newest first. */
export async function loadHeadToHeadRows(myPlayerId: string, theirPlayerId: string, dbh: DbLike = db as unknown as DbLike): Promise<HeadToHeadRow[]> {
  const { rows } = await dbh.execute(sql`
    SELECT gr.id AS game_id,
           me.team AS my_team,
           them.team AS their_team,
           gr.winning_team,
           gr.team1_score,
           gr.team2_score,
           gr.created_at AS played_at,
           s.is_sandbox
      FROM game_participants me
      JOIN game_participants them ON them.game_id = me.game_id AND them.player_id = ${theirPlayerId}
      JOIN game_results gr ON gr.id = me.game_id
      JOIN sessions s ON s.id = gr.session_id
     WHERE me.player_id = ${myPlayerId}
       AND (s.is_sandbox = false OR s.is_sandbox IS NULL)
     ORDER BY gr.created_at DESC`);
  return (rows as any[]).map((r) => ({
    gameId: String(r.game_id),
    myTeam: Number(r.my_team),
    theirTeam: Number(r.their_team),
    winningTeam: Number(r.winning_team),
    team1Score: Number(r.team1_score),
    team2Score: Number(r.team2_score),
    playedAt: toIso(r.played_at),
    isSandbox: r.is_sandbox === null || r.is_sandbox === undefined ? null : Boolean(r.is_sandbox),
  }));
}

type PlayerLike = { name: string; skillScore: number; level: string };

/** Display-only view: tier labels via getTierDisplayName, never the DB enum. */
export function headToHeadView(rows: HeadToHeadRow[], me: PlayerLike, them: PlayerLike): HeadToHeadView {
  const label = (p: PlayerLike): HeadToHeadPlayer => ({ name: p.name, skillScore: p.skillScore, tierLabel: getTierDisplayName(p.level) });
  return { ...aggregateHeadToHead(rows), me: label(me), them: label(them) };
}
