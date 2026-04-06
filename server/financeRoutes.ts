import type { Express } from "express";
import { storage } from "./storage";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./auth/middleware";
import { db } from "./db";
import { expenseCategories, bookings, bookableSessions, marketplaceUsers, payments } from "@shared/schema";
import { sql, eq, and, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

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
  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(expenseCategories)
      .values({ id: randomUUID(), ...cat })
      .onConflictDoNothing({ target: expenseCategories.name });
  }
}

export function registerFinanceRoutes(app: Express): void {
  // ── Summary / P&L ─────────────────────────────────────────────────────────

  app.get("/api/finance/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { from, to } = req.query as Record<string, string>;

      // Default: current calendar month
      const now = new Date();
      const fromDate = from
        ? new Date(from)
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const toDate = to
        ? new Date(to)
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD format." });
      }
      if (fromDate > toDate) {
        return res.status(400).json({ error: "'from' date must be before or equal to 'to' date." });
      }

      const summary = await storage.getFinanceSummary(fromDate, toDate);
      res.json(summary);
    } catch (err: unknown) {
      console.error("[Finance] summary error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load finance summary" });
    }
  });

  // ── Expense Categories ─────────────────────────────────────────────────────

  app.get("/api/finance/expense-categories", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const cats = await storage.getAllExpenseCategories();
      res.json(cats);
    } catch (err: unknown) {
      console.error("[Finance] categories error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load categories" });
    }
  });

  app.post("/api/finance/expense-categories", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(80),
        icon: z.string().min(1).default("circle"),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
      });
      const data = schema.parse(req.body);
      const cat = await storage.createExpenseCategory(data);
      res.status(201).json(cat);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Finance] create category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.patch("/api/finance/expense-categories/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(80).optional(),
        icon: z.string().min(1).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      });
      const updates = schema.parse(req.body);
      const cat = await storage.updateExpenseCategory(req.params.id, updates);
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json(cat);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Finance] update category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/finance/expense-categories/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Check if any expenses reference this category
      const linked = await storage.getAllExpenses({ categoryId: req.params.id });
      if (linked.length > 0) {
        return res.status(403).json({
          error: `Cannot delete: ${linked.length} expense(s) use this category. Reassign them first.`,
        });
      }
      await storage.deleteExpenseCategory(req.params.id);
      res.status(204).send();
    } catch (err: unknown) {
      console.error("[Finance] delete category error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // ── Expenses ───────────────────────────────────────────────────────────────

  app.get("/api/finance/expenses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { from, to, categoryId } = req.query as Record<string, string>;
      const fromDate = from ? new Date(from) : undefined;
      const toDate = to ? new Date(to) : undefined;

      if (from && isNaN(fromDate!.getTime())) {
        return res.status(400).json({ error: "Invalid 'from' date. Use YYYY-MM-DD format." });
      }
      if (to && isNaN(toDate!.getTime())) {
        return res.status(400).json({ error: "Invalid 'to' date. Use YYYY-MM-DD format." });
      }
      if (fromDate && toDate && fromDate > toDate) {
        return res.status(400).json({ error: "'from' date must be before or equal to 'to' date." });
      }

      const list = await storage.getAllExpenses({
        from: fromDate,
        to: toDate,
        categoryId: categoryId || undefined,
      });
      res.json(list);
    } catch (err: unknown) {
      console.error("[Finance] expenses error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load expenses" });
    }
  });

  app.post("/api/finance/expenses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        categoryId: z.string().min(1),
        amountAed: z.number().int().positive(),
        description: z.string().min(1).max(500),
        vendor: z.string().max(200).optional().nullable(),
        date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        notes: z.string().max(1000).optional().nullable(),
      });
      const raw = schema.parse(req.body);
      const expense = await storage.createExpense({
        ...raw,
        date: new Date(raw.date),
        vendor: raw.vendor ?? null,
        notes: raw.notes ?? null,
      });
      res.status(201).json(expense);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Finance] create expense error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/finance/expenses/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        categoryId: z.string().min(1).optional(),
        amountAed: z.number().int().positive().optional(),
        description: z.string().min(1).max(500).optional(),
        vendor: z.string().max(200).optional().nullable(),
        date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        notes: z.string().max(1000).optional().nullable(),
      });
      const raw = schema.parse(req.body);
      const updates = {
        ...raw,
        date: raw.date ? new Date(raw.date) : undefined,
      };
      const expense = await storage.updateExpense(req.params.id, updates);
      if (!expense) return res.status(404).json({ error: "Expense not found" });
      res.json(expense);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[Finance] update expense error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/finance/expenses/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const expense = await storage.getExpense(req.params.id);
      if (!expense) return res.status(404).json({ error: "Expense not found" });
      await storage.deleteExpense(req.params.id);
      res.status(204).send();
    } catch (err: unknown) {
      console.error("[Finance] delete expense error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // ── Pending Cash Payments ──────────────────────────────────────────────────

  app.get("/api/finance/pending-payments", requireAuth, requireAdmin, async (_req, res) => {
    try {
      // Fetch all cash bookings that are not yet collected
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
        .where(
          and(
            eq(bookings.paymentMethod, 'cash'),
            eq(bookings.cashPaid, false),
            inArray(bookings.status, ['confirmed', 'attended'])
          )
        )
        .orderBy(sql`${bookableSessions.date} ASC`);

      // Group by calendar month of the session date (YYYY-MM)
      const grouped: Record<string, {
        month: string;
        totalAed: number;
        count: number;
        bookings: typeof rows;
      }> = {};

      for (const row of rows) {
        const d = new Date(row.sessionDate);
        const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!grouped[monthKey]) {
          grouped[monthKey] = { month: monthKey, totalAed: 0, count: 0, bookings: [] };
        }
        grouped[monthKey].totalAed += row.amountAed;
        grouped[monthKey].count += 1;
        grouped[monthKey].bookings.push(row);
      }

      const result = Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month));

      const totalPendingAed = rows.reduce((s, r) => s + r.amountAed, 0);

      res.json({ totalPendingAed, months: result });
    } catch (err: unknown) {
      console.error("[Finance] pending-payments error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load pending payments" });
    }
  });

  // ── Ziina Payment History ──────────────────────────────────────────────────

  app.get("/api/finance/ziina-payments", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({
          paymentId: payments.id,
          bookingId: payments.bookingId,
          ziinaPaymentIntentId: payments.ziinaPaymentIntentId,
          amountAed: payments.amount,
          completedAt: payments.completedAt,
          createdAt: payments.createdAt,
          playerName: marketplaceUsers.name,
          playerEmail: marketplaceUsers.email,
          sessionTitle: bookableSessions.title,
          sessionDate: bookableSessions.date,
          venueName: bookableSessions.venueName,
        })
        .from(payments)
        .innerJoin(bookings, eq(payments.bookingId, bookings.id))
        .innerJoin(marketplaceUsers, eq(bookings.userId, marketplaceUsers.id))
        .innerJoin(bookableSessions, eq(bookings.sessionId, bookableSessions.id))
        .where(
          and(
            eq(payments.status, 'completed'),
            eq(bookings.paymentMethod, 'ziina')
          )
        )
        .orderBy(desc(bookableSessions.date));

      // Group by calendar month of the session date (YYYY-MM), newest first
      const grouped: Record<string, {
        month: string;
        totalAed: number;
        count: number;
        payments: typeof rows;
      }> = {};

      for (const row of rows) {
        const d = new Date(row.sessionDate);
        const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!grouped[monthKey]) {
          grouped[monthKey] = { month: monthKey, totalAed: 0, count: 0, payments: [] };
        }
        grouped[monthKey].totalAed += row.amountAed;
        grouped[monthKey].count += 1;
        grouped[monthKey].payments.push(row);
      }

      const months = Object.values(grouped).sort((a, b) => b.month.localeCompare(a.month));
      const totalCollectedAed = rows.reduce((s, r) => s + r.amountAed, 0);

      res.json({ totalCollectedAed, months });
    } catch (err: unknown) {
      console.error("[Finance] ziina-payments error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Failed to load Ziina payment history" });
    }
  });
}
