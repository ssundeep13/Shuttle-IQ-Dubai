// IQ Pass — HTTP handlers. Kept out of marketplace-routes.ts so they can be
// mounted on a throwaway express app in tests and hit over HTTP behind the
// real auth middleware. With the flag off every handler answers the same JSON
// 404 the app already returns for an unknown /api path (server/index.ts).
import type { Request, Response } from "express";
import { isIqPassEnabled } from "./flag";

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

/** GET /api/marketplace/config — the client's only way to learn the flag. */
export function iqPassConfigHandler(_req: Request, res: Response) {
  if (!isIqPassEnabled()) return notFound(res);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ iqPassEnabled: true });
}
