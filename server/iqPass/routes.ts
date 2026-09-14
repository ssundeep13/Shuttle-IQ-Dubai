// IQ Pass — HTTP handlers. Kept out of marketplace-routes.ts so they can be
// mounted on a throwaway express app in tests and hit over HTTP behind the
// real auth middleware. With the flag off every handler answers the same JSON
// 404 the app already returns for an unknown /api path (server/index.ts).
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireMarketplaceAuth, requireAdmin, type AuthRequest } from "../auth/middleware";
import { isIqPassEnabled } from "./flag";
import { IQ_PASS_TIERS } from "./rules";
import { PACK_TIER_ORDER } from "@shared/iqPassTiers";
import { buildCalendar, startPurchase, type PurchaseDeps } from "./purchase";
import { moveSeat, repickSeat, type MoveDeps } from "./moves";
import type { MyPacksView } from "./store";
import type { Pack } from "@shared/schema";

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

/** GET /api/marketplace/config — the client's only way to learn the flag. */
export function iqPassConfigHandler(_req: Request, res: Response) {
  if (!isIqPassEnabled()) return notFound(res);
  res.setHeader("Cache-Control", "no-store");
  // Gate 12: the player-facing tier table (label, games, pass price) — public, so the landing page can
  // show prices before sign-in. No allocation, no per-game maths.
  return res.json({
    iqPassEnabled: true,
    iqPassTiers: PACK_TIER_ORDER.map((tier) => ({ tier, label: IQ_PASS_TIERS[tier].label, games: IQ_PASS_TIERS[tier].games, priceAed: IQ_PASS_TIERS[tier].priceAed })),
  });
}

export type IqPassRouterDeps = {
  purchase: PurchaseDeps;
  confirm: {
    getPack(id: string): Promise<Pack | undefined>;
    retrieveIntent(intentId: string): Promise<{ status: string }>;
    isSuccessful(status: string): boolean;
    confirm(intentId: string): Promise<{ confirmed: boolean; alreadyConfirmed?: boolean; error?: string }>;
  };
  moves?: MoveDeps;
  me?: { getMyPacks(userId: string, now: Date): Promise<MyPacksView> };
  tiers?: { getActiveTiersPublic(): Promise<Record<string, string>> };
  admin?: {
    listPacks(): Promise<unknown[]>;
    markJerseyHandedOver(packId: string, at: Date): Promise<{ id: string; jerseyHandedOverAt: Date | string | null } | null>;
  };
};

/** All pack routes. The flag gate runs first so a flag-off app never reveals the routes exist. */
export function createIqPassRouter(deps: IqPassRouterDeps): Router {
  const r = Router();
  const gate = (_req: Request, res: Response, next: NextFunction) => (isIqPassEnabled() ? next() : notFound(res));
  const fail = (res: Response, label: string, e: unknown) => {
    console.error(`[IQ Pass] ${label} failed:`, e instanceof Error ? e.message : e);
    return res.status(500).json({ error: `Failed to ${label}` });
  };

  r.get("/api/marketplace/iq-pass/calendar", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildCalendar(req.user!.userId, deps.purchase));
    } catch (e) { return fail(res, 'load the IQ Pass calendar', e); }
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
    } catch (e) { return fail(res, 'start the IQ Pass purchase', e); }
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
    } catch (e) { return fail(res, 'confirm the IQ Pass', e); }
  });

  // ── Gate 4: moves, re-picks, my packs ────────────────────────────────────
  r.post("/api/marketplace/iq-pass/bookings/:bookingId/move", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!deps.moves) return fail(res, 'move the game', new Error('moves not configured'));
      const toSessionId = (req.body ?? {}).toSessionId;
      if (typeof toSessionId !== 'string' || !toSessionId) return res.status(400).json({ error: 'to_session_required' });
      const result = await moveSeat({ userId: req.user!.userId, bookingId: req.params.bookingId, toSessionId }, deps.moves);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json({ newBookingId: result.newBookingId });
    } catch (e) { return fail(res, 'move the game', e); }
  });

  r.post("/api/marketplace/iq-pass/packs/:packId/repick", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!deps.moves) return fail(res, 're-pick the game', new Error('moves not configured'));
      const toSessionId = (req.body ?? {}).toSessionId;
      if (typeof toSessionId !== 'string' || !toSessionId) return res.status(400).json({ error: 'to_session_required' });
      const result = await repickSeat({ userId: req.user!.userId, packId: req.params.packId, toSessionId }, deps.moves);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json({ newBookingId: result.newBookingId });
    } catch (e) { return fail(res, 're-pick the game', e); }
  });

  // Gate 5: public overlay for Rankings — { playerId: tier } for every linked
  // player with an active pass. No auth: player ids are already public on the
  // Rankings projection; no names, no money. 404 while the flag is off.
  r.get("/api/marketplace/iq-pass/tiers", gate, async (_req: Request, res) => {
    try {
      if (!deps.tiers) return fail(res, 'load IQ Pass tiers', new Error('tiers not configured'));
      res.setHeader("Cache-Control", "no-store");
      res.json(await deps.tiers.getActiveTiersPublic());
    } catch (e) { return fail(res, 'load IQ Pass tiers', e); }
  });

  // Gate 7: admin — every pack with its buyer; mark a Club Elite jersey handed over.
  r.get("/api/admin/iq-pass/packs", gate, requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      if (!deps.admin) return fail(res, 'list IQ Pass packs', new Error('admin not configured'));
      res.setHeader("Cache-Control", "no-store");
      res.json(await deps.admin.listPacks());
    } catch (e) { return fail(res, 'list IQ Pass packs', e); }
  });

  r.post("/api/admin/iq-pass/packs/:id/jersey-handed-over", gate, requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (!deps.admin) return fail(res, 'mark the jersey handed over', new Error('admin not configured'));
      const out = await deps.admin.markJerseyHandedOver(req.params.id, new Date());
      if (!out) return res.status(404).json({ error: "Pack not found" });
      res.json(out);
    } catch (e) { return fail(res, 'mark the jersey handed over', e); }
  });

  r.get("/api/marketplace/iq-pass/me", gate, requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      if (!deps.me) return fail(res, 'load your IQ Pass', new Error('me not configured'));
      res.setHeader("Cache-Control", "no-store");
      res.json(await deps.me.getMyPacks(req.user!.userId, new Date()));
    } catch (e) { return fail(res, 'load your IQ Pass', e); }
  });

  return r;
}
