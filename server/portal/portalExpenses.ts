// Phase 6 full extraction — the expense/category CRUD and the pending-cash workflow,
// moved from the main app's /api/finance/* into the portal boundary. Handlers are the
// financeRoutes.ts logic ported verbatim (same storage calls, same validation); only
// the guards changed: portal auth + OWNER-ONLY on every route (runner → 403).
// Same DB tables, no schema changes. The mark-cash-paid write reuses the SAME
// fireReferralOnPayment primitive as the old marketplace toggle — no forked semantics.
//
// Guards are injected by the caller (portalRoutes) to avoid an import cycle; the
// registration test asserts every route carries both.

import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { expenseCategories, bookings, bookableSessions, marketplaceUsers, EXPENSE_PAID_BY_OPTIONS } from "@shared/schema";
import { sql, eq, and, inArray } from "drizzle-orm";
import { fireReferralOnPayment } from "../referrals";
import { applyDubailandPromo } from "../dubailandPromo";

const DEFAULT_CATEGORIES = [
  { name: "Court Booking",  icon: "map-pin",        color: "#3B82F6" },
  { name: "Venue Rent",     icon: "building-2",      color: "#8B5CF6" },
  { name: "Staff & Wages",  icon: "users",           color: "#10B981" },
  { name: "Equipment",      icon: "package",         color: "#F59E0B" },
  { name: "Marketing",      icon: "megaphone",       color: "#EF4444" },
  { name: "Utilities",      icon: "zap",             color: "#6366F1" },
  { name: "Transport",      icon: "car",             color: "#EC4899" },
  { name: "Miscellaneous",  icon: "circle",          color: "#6B7280" },
];

export async function seedExpenseCategories(): Promise<void> {
  const { db } = await import("../db");
  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(expenseCategories)
      .values({ id: randomUUID(), ...cat })
      .onConflictDoNothing({ target: expenseCategories.name });
  }
}

// ── validation schemas (exported for tests) ───────────────────────────────────
export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().min(1).default("circle"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
});
export const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  icon: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
export const expenseCreateSchema = z.object({
  categoryId: z.string().min(1),
  amountAed: z.number().int().positive(),
  description: z.string().min(1).max(500),
  vendor: z.string().max(200).optional().nullable(),
  paidBy: z.enum(EXPENSE_PAID_BY_OPTIONS).optional().nullable(),
  date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().max(1000).optional().nullable(),
});
export const expenseUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  amountAed: z.number().int().positive().optional(),
  description: z.string().min(1).max(500).optional(),
  vendor: z.string().max(200).optional().nullable(),
  paidBy: z.enum(EXPENSE_PAID_BY_OPTIONS).optional().nullable(),
  date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export function registerPortalExpenseRoutes(
  app: Express,
  requirePortalAuth: RequestHandler,
  requirePortalOwner: RequestHandler,
): void {
  const guards = [requirePortalAuth, requirePortalOwner] as const;

  // ── Categories ──────────────────────────────────────────────────────────────
  app.get("/api/portal/expenses/categories", ...guards, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getAllExpenseCategories());
    } catch (err: unknown) {
      console.error("[Portal expenses] categories error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load categories" });
    }
  });

  app.post("/api/portal/expenses/categories", ...guards, async (req: Request, res: Response) => {
    try {
      const data = categoryCreateSchema.parse(req.body);
      res.status(201).json(await storage.createExpenseCategory(data));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
      console.error("[Portal expenses] create category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.patch("/api/portal/expenses/categories/:id", ...guards, async (req: Request, res: Response) => {
    try {
      const updates = categoryUpdateSchema.parse(req.body);
      const cat = await storage.updateExpenseCategory(req.params.id, updates);
      if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
      res.json(cat);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
      console.error("[Portal expenses] update category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/portal/expenses/categories/:id", ...guards, async (req: Request, res: Response) => {
    try {
      const linked = await storage.getAllExpenses({ categoryId: req.params.id });
      if (linked.length > 0) {
        res.status(403).json({ error: `Cannot delete: ${linked.length} expense(s) use this category. Reassign them first.` });
        return;
      }
      await storage.deleteExpenseCategory(req.params.id);
      res.status(204).send();
    } catch (err: unknown) {
      console.error("[Portal expenses] delete category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // ── Expenses ────────────────────────────────────────────────────────────────
  app.get("/api/portal/expenses", ...guards, async (req: Request, res: Response) => {
    try {
      const { from, to, categoryId, paidBy } = req.query as Record<string, string>;
      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;
      if (from && isNaN(fromDate!.getTime())) { res.status(400).json({ error: "Invalid 'from' date. Use YYYY-MM-DD format." }); return; }
      if (to && isNaN(toDate!.getTime())) { res.status(400).json({ error: "Invalid 'to' date. Use YYYY-MM-DD format." }); return; }
      if (fromDate && toDate && fromDate > toDate) { res.status(400).json({ error: "'from' date must be before or equal to 'to' date." }); return; }
      if (paidBy && !EXPENSE_PAID_BY_OPTIONS.includes(paidBy as typeof EXPENSE_PAID_BY_OPTIONS[number])) {
        res.status(400).json({ error: "Invalid 'paidBy' value." });
        return;
      }
      res.json(await storage.getAllExpenses({
        from: fromDate, to: toDate,
        categoryId: categoryId || undefined,
        paidBy: paidBy || undefined,
      }));
    } catch (err: unknown) {
      console.error("[Portal expenses] list error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load expenses" });
    }
  });

  app.post("/api/portal/expenses", ...guards, async (req: Request, res: Response) => {
    try {
      const raw = expenseCreateSchema.parse(req.body);
      const expense = await storage.createExpense({
        ...raw,
        date: new Date(raw.date),
        vendor: raw.vendor ?? null,
        paidBy: raw.paidBy ?? null,
        notes: raw.notes ?? null,
      });
      res.status(201).json(expense);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
      console.error("[Portal expenses] create error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/portal/expenses/:id", ...guards, async (req: Request, res: Response) => {
    try {
      const raw = expenseUpdateSchema.parse(req.body);
      const expense = await storage.updateExpense(req.params.id, {
        ...raw,
        date: raw.date ? new Date(raw.date) : undefined,
      });
      if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
      res.json(expense);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
      console.error("[Portal expenses] update error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/portal/expenses/:id", ...guards, async (req: Request, res: Response) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
      await storage.deleteExpense(req.params.id);
      res.status(204).send();
    } catch (err: unknown) {
      console.error("[Portal expenses] delete error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // ── Pending cash (the mark-cash-paid workflow) ──────────────────────────────
  app.get("/api/portal/expenses/pending-payments", ...guards, async (_req: Request, res: Response) => {
    try {
      const { db } = await import("../db");
      const rows = await db
        .select({
          bookingId: bookings.id,
          userId: bookings.userId,
          sessionId: bookings.sessionId,
          amountAed: bookings.amountAed,
          spotsBooked: bookings.spotsBooked,
          bookingStatus: bookings.status,
          createdAt: bookings.createdAt,
          playerName: marketplaceUsers.name,
          playerEmail: marketplaceUsers.email,
          sessionTitle: bookableSessions.title,
          sessionDate: bookableSessions.date,
          sessionStartTime: bookableSessions.startTime,
          venueName: bookableSessions.venueName,
        })
        .from(bookings)
        .innerJoin(marketplaceUsers, eq(bookings.userId, marketplaceUsers.id))
        .innerJoin(bookableSessions, eq(bookings.sessionId, bookableSessions.id))
        .where(and(
          eq(bookings.paymentMethod, "cash"),
          eq(bookings.cashPaid, false),
          inArray(bookings.status, ["confirmed", "attended"]),
        ))
        .orderBy(sql`${bookableSessions.date} ASC`);

      const grouped: Record<string, { month: string; totalAed: number; count: number; bookings: typeof rows }> = {};
      for (const row of rows) {
        const d = new Date(row.sessionDate);
        const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!grouped[monthKey]) grouped[monthKey] = { month: monthKey, totalAed: 0, count: 0, bookings: [] };
        grouped[monthKey].totalAed += row.amountAed;
        grouped[monthKey].count += 1;
        grouped[monthKey].bookings.push(row);
      }
      res.json({
        totalPendingAed: rows.reduce((s, r) => s + r.amountAed, 0),
        months: Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month)),
      });
    } catch (err: unknown) {
      console.error("[Portal expenses] pending-payments error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load pending payments" });
    }
  });

  // Same semantics as the old marketplace admin toggle: only cash bookings; the
  // false→true transition fires the referral-completion primitive (shared, not forked).
  app.patch("/api/portal/expenses/pending-payments/:id/cash-paid", ...guards, async (req: Request, res: Response) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
      if (booking.paymentMethod !== "cash") { res.status(400).json({ error: "Only cash bookings can be toggled" }); return; }
      const newCashPaid = !!req.body.cashPaid;
      const wasFalseTransitioningToTrue = !booking.cashPaid && newCashPaid;
      const updated = await storage.updateBooking(req.params.id, { cashPaid: newCashPaid });
      if (wasFalseTransitioningToTrue) {
        fireReferralOnPayment(booking.userId, booking.id);
        // Dubailand promo: for a cash booking, THIS is the "paid" moment.
        // Idempotent, session-pinned, fire-and-forget.
        applyDubailandPromo(booking.userId)
          .then(r => { if (r === 'credited') console.log(`[DubailandPromo] credited ${booking.userId} (cash-paid-toggle)`); })
          .catch(err => console.error('[DubailandPromo] credit failed at cash-paid-toggle:', err instanceof Error ? err.message : err));
      }
      res.json(updated);
    } catch (err: unknown) {
      console.error("[Portal expenses] cash-paid error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update cash payment status" });
    }
  });
}
