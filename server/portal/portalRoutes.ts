// Finance-portal API namespace (Phase 2). Everything here lives under /api/portal/* and
// is gated by the portal identity (portal_users + PORTAL_JWT_SECRET), which is entirely
// separate from the main app's users/roles. The host wall (server/portal/hostGate.ts)
// additionally ensures these routes are reachable ONLY on finance.shuttleiq.ai.
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { signPortalToken, verifyPortalToken, isPortalConfigured, isTokenStale } from "./portalAuth";
import {
  loadSessionFinanceRows,
  loadGeneralExpenseRows,
  aggregateMonthlyPnl,
  aggregateWeeklyPnl,
  aggregateRunnerPay,
  filterRunnerPayWeeksForRunner,
} from "./portalFinance";
import { reconcileZiinaCsv, loadReconcileInput } from "./portalReconcile";
import { buildGrowthReport } from "./portalGrowth";
import { registerPortalExpenseRoutes } from "./portalExpenses";

// fils → AED at the API edge (integer fils, so /100 is exact to 2dp).
const filsToAed = (f: number) => Math.round(f) / 100;

// ── Change-password core (Phase 6) — exported for tests ──────────────────────
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(12, "New password must be at least 12 characters."),
});

// Verifies the current password and produces the new bcrypt hash (cost 10 — same as
// every existing portal hash) plus the instant that kills all older tokens.
export async function performPasswordChange(
  currentHash: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ newHash: string; changedAt: Date } | { error: string }> {
  const ok = await bcrypt.compare(currentPassword, currentHash);
  if (!ok) return { error: "Current password is incorrect." };
  return { newHash: await bcrypt.hash(newPassword, 10), changedAt: new Date() };
}

// Attach the verified portal identity to the request. role/runnerId come from the DB
// row, NOT the token (Build B).
export interface PortalRequest extends Request {
  portalUser?: { portalUserId: string; email: string; role: string; runnerId: string | null };
}

// Guard: requires a valid portal JWT (signed with PORTAL_JWT_SECRET, aud 'portal').
// A main-app JWT fails here (wrong secret) → 401. Fails closed if unconfigured.
// Build B: after the signature check, role/runner_id/is_active are read FRESH from
// portal_users on EVERY request — deactivating a login or changing a role takes effect
// on the next request, with no token invalidation dance.
export async function requirePortalAuth(req: PortalRequest, res: Response, next: NextFunction): Promise<void> {
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
  try {
    const user = await storage.getPortalUserById(payload.portalUserId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }
    // Phase 6 — tokens issued before the user's last password change are dead.
    if (isTokenStale(payload.iat, user.passwordChangedAt ?? null)) {
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }
    req.portalUser = { portalUserId: user.id, email: user.email, role: user.role, runnerId: user.runnerId ?? null };
    next();
  } catch (err: unknown) {
    console.error("[Portal] auth lookup error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Authentication failed." });
  }
}

// Build B — the owner wall. Everything except the caller's own runner-pay is
// owner-only; a runner gets 403 here regardless of what the SPA shows or hides.
export function requirePortalOwner(req: PortalRequest, res: Response, next: NextFunction): void {
  if (req.portalUser?.role !== "owner") {
    res.status(403).json({ error: "Not available for this login." });
    return;
  }
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
      // role is informational for the SPA shell — the wall re-reads it per request.
      res.json({ token, email: user.email, role: user.role });
    } catch (err: unknown) {
      console.error("[Portal] login error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Login failed." });
    }
  });

  // ── Who am I ─────────────────────────────────────────────────────────────
  app.get("/api/portal/auth/me", requirePortalAuth, (req: PortalRequest, res: Response) => {
    res.json({ email: req.portalUser!.email, role: req.portalUser!.role });
  });

  // ── Change password (Phase 6) ─────────────────────────────────────────────
  // Any authenticated portal user changes their OWN password — there is no
  // admin-changes-someone-else path by design. On success every previously issued
  // token is dead (iat < passwordChangedAt); a fresh token is returned so the
  // changer stays logged in.
  app.post("/api/portal/auth/change-password", requirePortalAuth, async (req: PortalRequest, res: Response) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
        return;
      }
      const user = await storage.getPortalUserById(req.portalUser!.portalUserId);
      if (!user) { res.status(401).json({ error: "Invalid or expired session." }); return; }

      const result = await performPasswordChange(user.passwordHash, parsed.data.currentPassword, parsed.data.newPassword);
      if ("error" in result) { res.status(400).json({ error: result.error }); return; }

      await storage.updatePortalUserPassword(user.id, result.newHash, result.changedAt);
      const token = signPortalToken({ portalUserId: user.id, email: user.email });
      res.json({ ok: true, token });
    } catch (err: unknown) {
      console.error("[Portal] change-password error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Password change failed." });
    }
  });

  // (Phase 6: the Phase-2 one-number /finance/summary endpoint was removed — no UI
  // called it since the Phase-3 reports shipped.)

  // ── Phase 3 reports — all attributed BY SESSION DATE (differs from the main
  // app's created_at-based finance tab by design; locked decision 3) ──────────

  // Monthly P&L, June 2026 → current month.
  // net = collected revenue − session costs − general expenses (NOT floored).
  app.get("/api/portal/finance/pnl", requirePortalAuth, requirePortalOwner, async (_req: Request, res: Response) => {
    try {
      const [rows, expensesRows] = await Promise.all([loadSessionFinanceRows(), loadGeneralExpenseRows()]);
      const months = aggregateMonthlyPnl(rows, expensesRows, new Date().toISOString().slice(0, 7));
      res.json({
        months: months.map((p) => ({
          month: p.month,
          collectedRevenueAed: filsToAed(p.collectedRevenueFils),
          sessionCostsAed: filsToAed(p.sessionCostsFils),
          generalExpensesAed: filsToAed(p.generalExpensesFils),
          netProfitAed: filsToAed(p.netProfitFils), // BEFORE runner pay
          runnerPayAed: filsToAed(p.runnerPayFils), // accrued, assigned captains only
          socialMediaPayAed: filsToAed(p.socialMediaPayFils), // 15% of collected profit, every session
          managementProfitAed: filsToAed(p.managementProfitFils), // net − runner pay − social media (can be negative)
          walletPaidAed: filsToAed(p.walletPaidFils), // informational — not in the net formula
        })),
      });
    } catch (err: unknown) {
      console.error("[Portal] pnl error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load P&L." });
    }
  });

  // Weekly P&L, ISO weeks (Mon–Sun), June 2026 onwards.
  app.get("/api/portal/finance/weekly", requirePortalAuth, requirePortalOwner, async (_req: Request, res: Response) => {
    try {
      const [rows, expensesRows] = await Promise.all([loadSessionFinanceRows(), loadGeneralExpenseRows()]);
      const weeks = aggregateWeeklyPnl(rows, expensesRows);
      res.json({
        weeks: weeks.map((w) => ({
          label: w.label,
          weekStart: w.weekStart,
          weekEnd: w.weekEnd,
          collectedRevenueAed: filsToAed(w.collectedRevenueFils),
          sessionCostsAed: filsToAed(w.sessionCostsFils),
          generalExpensesAed: filsToAed(w.generalExpensesFils),
          netProfitAed: filsToAed(w.netProfitFils),
        })),
      });
    } catch (err: unknown) {
      console.error("[Portal] weekly error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load weekly report." });
    }
  });

  // Per-session reconciliation table, June 2026 onwards.
  app.get("/api/portal/finance/sessions", requirePortalAuth, requirePortalOwner, async (_req: Request, res: Response) => {
    try {
      const rows = await loadSessionFinanceRows();
      res.json({
        sessions: rows.map((r) => ({
          sessionId: r.sessionId,
          date: r.dateIso,
          venue: r.venue,
          captain: r.captainName ?? (r.captainId ? "(unknown runner)" : "Unassigned"),
          collectedAed: filsToAed(r.revenueFils),
          walletPaidAed: filsToAed(r.walletPaidFils),
          courtAed: filsToAed(r.courtCostFils),
          shuttleAed: filsToAed(r.shuttleCostFils),
          waterAed: filsToAed(r.waterCostFils),
          profitAed: filsToAed(r.profitFils),
        })),
      });
    } catch (err: unknown) {
      console.error("[Portal] sessions error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load sessions." });
    }
  });

  // Runner pay: per ISO week per runner, 25% of each session's VALUE profit
  // (collected + wallet − costs, zero-floored PER SESSION; unpaid cash excluded
  // but surfaced), null captains under 'Unassigned'.
  app.get("/api/portal/finance/runner-pay", requirePortalAuth, async (req: PortalRequest, res: Response) => {
    try {
      const rows = await loadSessionFinanceRows();
      const all = aggregateRunnerPay(rows);
      // Build B — server-side wall: a runner receives ONLY their own bucket; other
      // runners' names/totals and the Unassigned bucket never leave the server.
      const weeks = req.portalUser!.role === "owner"
        ? all
        : filterRunnerPayWeeksForRunner(all, req.portalUser!.runnerId);
      res.json({
        weeks: weeks.map((w) => ({
          label: w.label,
          weekStart: w.weekStart,
          weekEnd: w.weekEnd,
          runners: w.runners.map((r) => ({
            runnerName: r.runnerName,
            totalPayAed: filsToAed(r.totalPayFils),
            sessions: r.sessions.map((s) => ({
              date: s.dateIso,
              venue: s.venue,
              valueAed: filsToAed(s.valueFils),
              walletPaidAed: filsToAed(s.walletPaidFils),
              unpaidCashAed: filsToAed(s.unpaidCashFils),
              valueProfitAed: filsToAed(s.valueProfitFils),
              payAed: filsToAed(s.payFils),
            })),
          })),
        })),
      });
    } catch (err: unknown) {
      console.error("[Portal] runner-pay error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load runner pay." });
    }
  });

  // Phase 5 — growth reports. READ-ONLY aggregation over existing data; owner-only.
  // One endpoint carries all 8 metric blocks; ?lapsedDays tunes the lapsed cutoff.
  app.get("/api/portal/growth", requirePortalAuth, requirePortalOwner, async (req: Request, res: Response) => {
    try {
      const parsed = parseInt(String(req.query.lapsedDays ?? "30"), 10);
      const lapsedDays = Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : 30;
      const report = await buildGrowthReport(lapsedDays, new Date().toISOString().slice(0, 10));
      res.json(report);
    } catch (err: unknown) {
      console.error("[Portal] growth error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load growth report." });
    }
  });

  // Phase 4 — Ziina CSV reconciliation. STATELESS: the CSV arrives as the raw request
  // body (any content type; the dashboard exports text/csv), is parsed and matched in
  // memory, and only the bucket JSON leaves. Nothing is persisted server-side and the
  // engine performs zero DB writes. Auth first, then the body parser (5 MB cap).
  app.post(
    "/api/portal/reconcile",
    requirePortalAuth,
    requirePortalOwner,
    express.text({ type: () => true, limit: "5mb" }),
    async (req: Request, res: Response) => {
      try {
        if (typeof req.body !== "string" || req.body.trim().length === 0) {
          res.status(400).json({ error: "Upload the Ziina transactions CSV as the request body." });
          return;
        }
        const dbIn = await loadReconcileInput(); // read-only SELECTs
        const result = reconcileZiinaCsv(req.body, dbIn);
        res.json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Reconciliation failed.";
        // Parse/validation problems are the user's CSV, not a server fault → 400.
        console.error("[Portal] reconcile error:", message);
        res.status(400).json({ error: message });
      }
    },
  );

  // Phase 6 full extraction — expense CRUD + pending-cash workflow, owner-only.
  // Guards passed in to avoid an import cycle; the registration test pins them.
  registerPortalExpenseRoutes(app, requirePortalAuth, requirePortalOwner);
}
