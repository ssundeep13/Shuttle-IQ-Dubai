// Venue price-book routes (Phase 1 — per-session cost foundation).
// Super-admin only, mirroring the guards on financeRoutes.ts (requireAuth +
// requireSuperAdmin). CRUD over the `venues` table (gate a). No auto-fill and no
// session logic here — that wiring is gate (d).
//
// MONEY UNIT: courtRateFilsPerHour is stored in FILS (per court, per hour). The
// admin UI enters/reads AED and bridges ×100 (gate c CHANGE 3); this API is fils.
import type { Express } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { requireAuth, requireAdmin, requireSuperAdmin } from "./auth/middleware";

export function registerVenueRoutes(app: Express): void {
  // ── List ───────────────────────────────────────────────────────────────────
  // requireAdmin (not super) on purpose: the session create/edit form (any admin,
  // gate d) reads this list for its venue dropdown. Mutations below stay super-admin,
  // and the Venues management tab remains super-admin-gated in the UI.
  app.get("/api/venues", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listVenues();
      res.json(rows);
    } catch (err: unknown) {
      console.error("[Venues] list error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load venues" });
    }
  });

  // ── Create ─────────────────────────────────────────────────────────────────
  app.post("/api/venues", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().trim().min(1).max(120),
        courtRateFilsPerHour: z.number().int().min(0),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      // name is UNIQUE — pre-check for a friendly 409 (the DB unique index is the backstop).
      const existing = await storage.getVenueByName(data.name);
      if (existing) return res.status(409).json({ error: "A venue with that name already exists." });
      const venue = await storage.createVenue(data);
      res.status(201).json(venue);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Venues] create error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to create venue" });
    }
  });

  // ── Update ─────────────────────────────────────────────────────────────────
  app.patch("/api/venues/:id", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().trim().min(1).max(120).optional(),
        courtRateFilsPerHour: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      });
      const updates = schema.parse(req.body);
      // If renaming, guard the unique name against a DIFFERENT existing venue.
      if (updates.name) {
        const existing = await storage.getVenueByName(updates.name);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ error: "A venue with that name already exists." });
        }
      }
      const venue = await storage.updateVenue(req.params.id, updates);
      if (!venue) return res.status(404).json({ error: "Venue not found" });
      res.json(venue);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Venues] update error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update venue" });
    }
  });
}
