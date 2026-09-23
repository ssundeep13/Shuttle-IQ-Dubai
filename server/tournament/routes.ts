// Tournament registration — HTTP handlers. Kept out of marketplace-routes.ts so
// they can be mounted on a throwaway express app in tests and hit over HTTP
// behind the real auth middleware. With the flag off every handler answers the
// same JSON 404 the app already returns for an unknown /api path (server/index.ts).
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireMarketplaceAuth, type AuthRequest } from "../auth/middleware";
import { verifyAccessToken } from "../auth/utils";
import { isTournamentEnabled } from "./flag";
import {
  getMyEntry, getPublicView, payRegistration, registerForTournament, setSponsorInterest, withdrawRegistration,
  type Out, type TournamentDeps,
} from "./register";

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

/** The public read works signed out; a valid marketplace token only adds the member / preview view. Never a 401. */
function optionalViewer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const payload = verifyAccessToken(h.substring(7));
  return payload && payload.role === 'marketplace_player' ? payload.userId : null;
}

/** All tournament routes. The flag gate runs first so a flag-off app never reveals the routes exist. */
export function createTournamentRouter(deps: TournamentDeps): Router {
  const r = Router();
  const gate = (_req: Request, res: Response, next: NextFunction) => (isTournamentEnabled() ? next() : notFound(res));
  const player = [gate, requireAuth, requireMarketplaceAuth] as const;
  const send = (res: Response, out: Out) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(out.status).json(out.body);
  };
  const fail = (res: Response, label: string, e: unknown) => {
    console.error(`[Tournament] ${label} failed:`, e instanceof Error ? e.message : e);
    return res.status(500).json({ error: `Failed to ${label}` });
  };
  const returnScheme = (req: Request) => {
    const s = (req.body ?? {}).returnScheme;
    return typeof s === 'string' && s ? s : undefined;
  };

  // Public: the banner, the pinned Sessions row and the per-tier counter.
  r.get("/api/marketplace/tournament", gate, async (req: Request, res) => {
    try { return send(res, await getPublicView(optionalViewer(req), deps)); }
    catch (e) { return fail(res, 'load the tournament', e); }
  });

  r.post("/api/marketplace/tournament/register", ...player, async (req: AuthRequest, res) => {
    try { return send(res, await registerForTournament({ userId: req.user!.userId, body: req.body }, deps)); }
    catch (e) { return fail(res, 'register for the tournament', e); }
  });

  r.get("/api/marketplace/tournament/me", ...player, async (req: AuthRequest, res) => {
    try { return send(res, await getMyEntry(req.user!.userId, deps)); }
    catch (e) { return fail(res, 'load your tournament entry', e); }
  });

  r.post("/api/marketplace/tournament/registrations/:id/pay", ...player, async (req: AuthRequest, res) => {
    try { return send(res, await payRegistration({ userId: req.user!.userId, registrationId: req.params.id, returnScheme: returnScheme(req) }, deps)); }
    catch (e) { return fail(res, 'start the tournament payment', e); }
  });

  r.post("/api/marketplace/tournament/registrations/:id/withdraw", ...player, async (req: AuthRequest, res) => {
    try { return send(res, await withdrawRegistration({ userId: req.user!.userId, registrationId: req.params.id }, deps)); }
    catch (e) { return fail(res, 'withdraw from the tournament', e); }
  });

  r.post("/api/marketplace/tournament/registrations/:id/sponsor-interest", ...player, async (req: AuthRequest, res) => {
    try { return send(res, await setSponsorInterest({ userId: req.user!.userId, registrationId: req.params.id, interested: (req.body ?? {}).interested }, deps)); }
    catch (e) { return fail(res, 'update sponsor interest', e); }
  });

  // Poll fallback for the return page — no auth: the registration UUID is the
  // secret, exactly like the booking and IQ Pass confirm polls. Ziina decides.
  r.post("/api/marketplace/tournament/registrations/:id/confirm", gate, async (req: Request, res) => {
    try {
      const reg = await deps.getRegistration(req.params.id);
      if (!reg) return res.status(404).json({ error: "Registration not found" });
      if (reg.status === 'confirmed') return res.json({ confirmed: true, alreadyConfirmed: true });
      if (!reg.ziinaPaymentIntentId) return res.status(400).json({ error: "No payment associated with this registration" });
      const intent = await deps.retrieveIntent(reg.ziinaPaymentIntentId);
      if (!deps.isSuccessful(intent.status)) return res.json({ confirmed: false, status: intent.status });
      return res.json(await deps.confirm(reg.ziinaPaymentIntentId));
    } catch (e) { return fail(res, 'confirm the tournament payment', e); }
  });

  return r;
}
