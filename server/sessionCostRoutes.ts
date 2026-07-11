// Session-cost read routes (Phase 1 gate d, step 1). READ-ONLY, additive — feeds the
// session create/edit form's captain dropdown and its cost prefill. Nothing writes here
// (the create/edit write wiring is gate d steps 3–4).
//
// GATING: requireAuth + requireAdmin — the same guard as the session create/edit
// endpoints (/api/sessions/unified, PATCH /api/sessions/:id, PATCH /api/marketplace/
// sessions/:id), so any admin who can open the form can also load these dropdowns. (The
// venue dropdown reads GET /api/venues, relaxed to requireAdmin for the same reason.)
import type { Express } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { requireAuth, requireCaptain } from "./auth/middleware";

export function registerSessionCostRoutes(app: Express): void {
  // ── Session runners (captain list) ───────────────────────────────────────────
  // Returns ALL runners (active + inactive) so the edit form can DISPLAY an already-
  // stored inactive runner on an old session; the picker itself filters to active.
  app.get("/api/session-runners", requireAuth, requireCaptain, async (_req, res) => {
    try {
      const runners = await storage.listSessionRunners();
      res.json(runners);
    } catch (err: unknown) {
      console.error("[SessionCost] runners error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load session runners" });
    }
  });

  // ── A bookable session's cost row (for edit-form prefill) ─────────────────────
  // Returns { courtCostFils, shuttleCostFils, waterCostFils, captainId,
  // courtCostOverridden } or null if no session_costs row exists yet.
  app.get("/api/sessions/:id/costs", requireAuth, requireCaptain, async (req, res) => {
    try {
      const sessionId = z.string().min(1).parse(req.params.id);
      const costs = await storage.getSessionCosts(sessionId);
      res.json(costs ? {
        courtCostFils: costs.courtCostFils,
        shuttleCostFils: costs.shuttleCostFils,
        waterCostFils: costs.waterCostFils,
        captainId: costs.captainId,
        courtCostOverridden: costs.courtCostOverridden,
      } : null);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[SessionCost] costs error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load session costs" });
    }
  });
}
