// Player list + search handlers for the ops app (Gate 1 lockdown, 2026-09-09).
//
// Both used to be registered inline in routes.ts with NO auth and answered
// anyone with full player rows — email, phone, wallet balance, referral code,
// tier-candidate fields — for all ~494 players. They now sit behind
// requireAuth + a role guard in registerRoutes:
//   GET /api/players         requireCaptain  — the live-session screen (Home),
//                                              AddPlayerModal, PlayerMergeTool,
//                                              PlayerRegistry and SessionsManagement
//                                              all read the full list; captains run
//                                              sessions, so they need it.
//   GET /api/players/search  requireAdmin    — no caller in the codebase today;
//                                              kept for admin tooling only.
// The handlers live here so tests can mount them on a throwaway express app
// behind the real middleware and hit them over HTTP.
import type { Request, Response } from "express";
import { storage } from "./storage";

export async function playerListHandler(_req: Request, res: Response) {
  try {
    const players = await storage.getAllPlayers();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch players" });
  }
}

export async function playerSearchHandler(req: Request, res: Response) {
  try {
    const query = (req.query.q as string) || "";
    if (!query) {
      return res.json([]);
    }
    const players = await storage.searchPlayers(query);
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: "Failed to search players" });
  }
}

/** The public projection the marketplace Rankings page reads (Option A of the
 *  Gate 1 lockdown): the seven fields the page renders, nothing else. Served by
 *  GET /api/players/public with NO auth — the rankings are public by design,
 *  the contact/wallet columns never were. */
export const PUBLIC_PLAYER_KEYS = ["id", "name", "shuttleIqId", "level", "skillScore", "gamesPlayed", "wins"] as const;

export type PublicPlayer = {
  id: string;
  name: string;
  shuttleIqId: string | null;
  level: string;
  skillScore: number;
  gamesPlayed: number;
  wins: number;
};

export function publicPlayer(p: {
  id: string; name: string; shuttleIqId: string | null; level: string; skillScore: number; gamesPlayed: number; wins: number;
}): PublicPlayer {
  return { id: p.id, name: p.name, shuttleIqId: p.shuttleIqId, level: p.level, skillScore: p.skillScore, gamesPlayed: p.gamesPlayed, wins: p.wins };
}

export async function publicPlayerListHandler(_req: Request, res: Response) {
  try {
    const players = await storage.getAllPlayers();
    res.json(players.map(publicPlayer));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch players" });
  }
}

/** The only player fields a signed-in player may see from a search result. */
export const PUBLIC_PLAYER_SEARCH_KEYS = ["id", "name", "shuttleIqId", "level", "skillScore"] as const;

export type PublicPlayerSearchResult = {
  id: string;
  name: string;
  shuttleIqId: string | null;
  level: string;
  skillScore: number;
};

export function publicPlayerSearchResult(p: {
  id: string; name: string; shuttleIqId: string | null; level: string; skillScore: number;
}): PublicPlayerSearchResult {
  return { id: p.id, name: p.name, shuttleIqId: p.shuttleIqId, level: p.level, skillScore: p.skillScore };
}
