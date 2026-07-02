// Finance-portal API namespace (Phase 2). Everything here lives under /api/portal/* and
// is gated by the portal identity (portal_users + PORTAL_JWT_SECRET), which is entirely
// separate from the main app's users/roles. The host wall (server/portal/hostGate.ts)
// additionally ensures these routes are reachable ONLY on finance.shuttleiq.ai.
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { signPortalToken, verifyPortalToken, isPortalConfigured } from "./portal/portalAuth";

// Attach the verified portal identity to the request.
export interface PortalRequest extends Request {
  portalUser?: { portalUserId: string; email: string };
}

// Guard: requires a valid portal JWT (signed with PORTAL_JWT_SECRET, aud 'portal').
// A main-app JWT fails here (wrong secret) → 401. Fails closed if unconfigured.
export function requirePortalAuth(req: PortalRequest, res: Response, next: NextFunction): void {
  if (!isPortalConfigured()) {
    console.error("[Portal] PORTAL_JWT_SECRET is not set — portal auth is disabled.");
    res.status(500).json({ error: "Portal is not configured." });
    return;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const payload = verifyPortalToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  req.portalUser = { portalUserId: payload.portalUserId, email: payload.email };
  next();
}

export function registerPortalRoutes(app: Express): void {
  // ── Login ─────────────────────────────────────────────────────────────────
  app.post("/api/portal/auth/login", async (req: Request, res: Response) => {
    // Fail closed if the portal secret is missing — never fall back to JWT_SECRET.
    if (!isPortalConfigured()) {
      console.error("[Portal] login blocked — PORTAL_JWT_SECRET is not set.");
      res.status(500).json({ error: "Portal is not configured." });
      return;
    }
    // Generic failure — never reveal which part (email vs password) was wrong.
    const invalid = () => res.status(401).json({ error: "Invalid credentials." });
    try {
      const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return invalid();

      const email = parsed.data.email.trim().toLowerCase();
      const user = await storage.getPortalUserByEmail(email);
      if (!user || !user.isActive) return invalid();

      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return invalid();

      const token = signPortalToken({ portalUserId: user.id, email: user.email });
      res.json({ token, email: user.email });
    } catch (err: unknown) {
      console.error("[Portal] login error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Login failed." });
    }
  });

  // ── Who am I ─────────────────────────────────────────────────────────────
  app.get("/api/portal/auth/me", requirePortalAuth, (req: PortalRequest, res: Response) => {
    res.json({ email: req.portalUser!.email });
  });

  // ── The one number: collected revenue this month (live prod DB) ───────────
  app.get("/api/portal/finance/summary", requirePortalAuth, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      const summary = await storage.getFinanceSummary(from, to);
      res.json({
        collectedAed: summary.revenue.collectedAed,
        month: from.toISOString().slice(0, 7), // YYYY-MM
      });
    } catch (err: unknown) {
      console.error("[Portal] finance summary error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load finance summary." });
    }
  });
}
