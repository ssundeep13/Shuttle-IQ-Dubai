// IQ Pass — HTTP handlers. Kept out of marketplace-routes.ts so they can be
// mounted on a throwaway express app in tests and hit over HTTP behind the
// real auth middleware. With the flag off every handler answers the same JSON
// 404 the app already returns for an unknown /api path (server/index.ts).
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireMarketplaceAuth, type AuthRequest } from "../auth/middleware";
import { isIqPassEnabled } from "./flag";
import { buildCalendar, startPurchase, type PurchaseDeps } from "./purchase";
import type { Pack } from "@shared/schema";

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

/** GET /api/marketplace/config — the client's only way to learn the flag. */
export function iqPassConfigHandler(_req: Request, res: Response) {
  if (!isIqPassEnabled()) return notFound(res);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ iqPassEnabled: true });
}

export type IqPassRouterDeps = {
  purchase: PurchaseDeps;
  confirm: {
    getPack(id: string): Promise<Pack | undefined>;
    retrieveIntent(intentId: string): Promise<{ status: string }>;
    isSuccessful(status: string): boolean;
    confirm(intentId: string): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean; error?: string }>;
  };
};

/** All pack routes. The flag gate runs first so a flag-off app never reveals the routes exist. */
export function createIqPassRouter(deps: IqPassRouterDeps): Router {
  const r = Router();
  const gate = (_req: Request, res: Response, next: NextFunction) => (isIqPassEnabled() ? next() : notFound(res));

  r.get("/api/marketplace/iq-pass/calendar", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildCalendar(req.user!.userId, deps.purchase));
    } catch (e) {
      console.error('[IQ Pass] calendar failed:', e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Failed to load the IQ Pass calendar" });
    }
  });

  r.post("/api/marketplace/iq-pass/purchase", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await startPurchase(
        { userId: req.user!.userId, tier: body.tier, sessionIds: body.sessionIds, jerseySize: body.jerseySize, returnScheme: typeof body.returnScheme === 'string' ? body.returnScheme : undefined },
        deps.purchase,
      );
      if (!result.ok) return res.status(result.status).json({ error: result.error, ...(result.sessionId ? { sessionId: result.sessionId } : {}) });
      return res.json({ packId: result.packId, redirectUrl: result.redirectUrl });
    } catch (e) {
      console.error('[IQ Pass] purchase failed:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "Failed to start the IQ Pass purchase" });
    }
  });

  // Poll fallback for the success page — no auth: the pack UUID is the secret,
  // exactly like POST /bookings/:id/confirm.
  r.post("/api/marketplace/iq-pass/packs/:id/confirm", gate, async (req: Request, res) => {
    try {
      const pack = await deps.confirm.getPack(req.params.id);
      if (!pack) return res.status(404).json({ error: "Pack not found" });
      if (pack.status === 'active' || pack.status === 'completed') return res.json({ confirmed: true, alreadyConfirmed: true });
      if (!pack.ziinaPaymentIntentId) return res.status(400).json({ error: "No payment associated with this pack" });
      const intent = await deps.confirm.retrieveIntent(pack.ziinaPaymentIntentId);
      if (!deps.confirm.isSuccessful(intent.status)) return res.json({ confirmed: false, status: intent.status });
      return res.json(await deps.confirm.confirm(pack.ziinaPaymentIntentId));
    } catch (e) {
      console.error('[IQ Pass] confirm poll failed:', e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "Failed to confirm the IQ Pass" });
    }
  });

  return r;
}
