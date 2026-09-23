// Tournament registration — HTTP handlers. Kept out of marketplace-routes.ts so
// they can be mounted on a throwaway express app in tests and hit over HTTP.
// With the flag off every handler answers the same JSON 404 the app already
// returns for an unknown /api path (server/index.ts).
import type { Request, Response } from "express";
import { isTournamentEnabled } from "./flag";

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

/**
 * GET /api/marketplace/tournament/config — the client's only way to learn the
 * tournament flag. Deliberately separate from /api/marketplace/config, which
 * 404s whenever IQ Pass is off: neither flag's off-path depends on the other.
 */
export function tournamentConfigHandler(_req: Request, res: Response) {
  if (!isTournamentEnabled()) return notFound(res);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ tournamentEnabled: true });
}
