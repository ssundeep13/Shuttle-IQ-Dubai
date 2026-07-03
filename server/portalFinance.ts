// Phase 3 — portal finance reports. Assembles the per-session finance rows (June 2026
// onwards, locked decision 2) and aggregates them into the P&L / weekly / runner-pay
// shapes. ALL money math flows through computeSessionProfitsBatchFils — the single
// profit implementation — this file only buckets and sums.
//
// Attribution is BY SESSION DATE everywhere (locked decision 3): a booking's revenue
// lands in the month/week of its session, not of its created_at. This intentionally
// differs from the main app's finance tab.
//
// MONEY UNIT: fils throughout; the API layer divides by 100 at the edge.
// The pure aggregate* functions take plain rows so tests can pin the bucketing and the
// 25% zero-floor-per-session pay rule without a DB.

import { bookableSessions, sessionCosts, sessionRunners, expenses } from "@shared/schema";
import { eq, gte, sql } from "drizzle-orm";
import { computeSessionProfitsBatchFils } from "./sessionProfit";
import { isoWeekOf } from "@shared/isoWeek";

// The P&L epoch: before this date costs lived in the expenses table (old model) and
// there are no session_costs — the two accounting models must never be mixed.
export const PORTAL_EPOCH_ISO = "2026-06-01";

// A session runner's pay share: 25% of each session's profit, zero-floored PER SESSION
// (the floor lives inside computeProfitFils — profitFils is already >= 0 here).
export const RUNNER_PROFIT_SHARE = 0.25;

export interface SessionFinanceRow {
  sessionId: string;
  dateIso: string; // YYYY-MM-DD (session date — the attribution key)
  venue: string;
  captainId: string | null;
  captainName: string | null;
  revenueFils: number; // collected, refund-netted
  courtCostFils: number;
  shuttleCostFils: number;
  waterCostFils: number;
  profitFils: number; // zero-floored per session
}

export interface GeneralExpenseRow {
  dateIso: string;
  amountFils: number;
}

export interface PeriodPnlFils {
  collectedRevenueFils: number;
  sessionCostsFils: number;
  generalExpensesFils: number;
  netProfitFils: number; // plain arithmetic — NOT floored (a losing month shows negative)
}

// ── DB assembly ───────────────────────────────────────────────────────────────

// Every bookable session dated >= the epoch, regardless of status or whether a
// session_costs row exists yet (LEFT JOINs) — nothing silently vanishes; a costless
// session shows zero costs. Profit numbers come from the batch (3 queries total).
export async function loadSessionFinanceRows(): Promise<SessionFinanceRow[]> {
  const { db } = await import("./db");

  const sessions = await db
    .select({
      id: bookableSessions.id,
      dateIso: sql<string>`to_char(${bookableSessions.date}, 'YYYY-MM-DD')`,
      venue: bookableSessions.venueName,
      captainId: sessionCosts.captainId,
      captainName: sessionRunners.name,
    })
    .from(bookableSessions)
    .leftJoin(sessionCosts, eq(sessionCosts.sessionId, bookableSessions.id))
    .leftJoin(sessionRunners, eq(sessionRunners.id, sessionCosts.captainId))
    .where(gte(bookableSessions.date, new Date(`${PORTAL_EPOCH_ISO}T00:00:00Z`)))
    .orderBy(bookableSessions.date);

  const profits = await computeSessionProfitsBatchFils(sessions.map((s) => s.id));

  return sessions.map((s) => {
    const p = profits.get(s.id)!;
    return {
      sessionId: s.id,
      dateIso: s.dateIso,
      venue: s.venue,
      captainId: s.captainId ?? null,
      captainName: s.captainName ?? null,
      revenueFils: p.revenueFils,
      courtCostFils: p.courtCostFils,
      shuttleCostFils: p.shuttleCostFils,
      waterCostFils: p.waterCostFils,
      profitFils: p.profitFils,
    };
  });
}

export async function loadGeneralExpenseRows(): Promise<GeneralExpenseRow[]> {
  const { db } = await import("./db");
  const rows = await db
    .select({
      dateIso: sql<string>`to_char(${expenses.date}, 'YYYY-MM-DD')`,
      amountAed: expenses.amountAed,
    })
    .from(expenses)
    .where(gte(expenses.date, new Date(`${PORTAL_EPOCH_ISO}T00:00:00Z`)));
  return rows.map((r) => ({ dateIso: r.dateIso, amountFils: r.amountAed * 100 }));
}

// ── Pure aggregation (unit-tested) ────────────────────────────────────────────

function emptyPnl(): PeriodPnlFils {
  return { collectedRevenueFils: 0, sessionCostsFils: 0, generalExpensesFils: 0, netProfitFils: 0 };
}

function addSession(p: PeriodPnlFils, r: SessionFinanceRow): void {
  p.collectedRevenueFils += r.revenueFils;
  p.sessionCostsFils += r.courtCostFils + r.shuttleCostFils + r.waterCostFils;
}

function finishPnl(p: PeriodPnlFils): void {
  p.netProfitFils = p.collectedRevenueFils - p.sessionCostsFils - p.generalExpensesFils;
}

// Month rows from the epoch month through `throughMonth` ('YYYY-MM') inclusive —
// months with no activity still appear (a zero month is information, not noise).
export function aggregateMonthlyPnl(
  rows: SessionFinanceRow[],
  generalExpenses: GeneralExpenseRow[],
  throughMonth: string,
): Array<{ month: string } & PeriodPnlFils> {
  const months: string[] = [];
  let [y, m] = PORTAL_EPOCH_ISO.slice(0, 7).split("-").map(Number);
  while (true) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push(key);
    if (key >= throughMonth) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  const byMonth = new Map<string, PeriodPnlFils>(months.map((k) => [k, emptyPnl()]));
  for (const r of rows) {
    const p = byMonth.get(r.dateIso.slice(0, 7));
    if (p) addSession(p, r); // sessions past throughMonth are out of scope
  }
  for (const e of generalExpenses) {
    const p = byMonth.get(e.dateIso.slice(0, 7));
    if (p) p.generalExpensesFils += e.amountFils;
  }
  for (const p of Array.from(byMonth.values())) finishPnl(p);

  return months.map((month) => ({ month, ...byMonth.get(month)! }));
}

// ISO-week rows — only weeks that have any activity, ascending by week start.
export function aggregateWeeklyPnl(
  rows: SessionFinanceRow[],
  generalExpenses: GeneralExpenseRow[],
): Array<{ label: string; weekStart: string; weekEnd: string } & PeriodPnlFils> {
  const byWeek = new Map<string, { label: string; weekStart: string; weekEnd: string } & PeriodPnlFils>();
  const bucket = (dateIso: string) => {
    const w = isoWeekOf(dateIso);
    let p = byWeek.get(w.label);
    if (!p) {
      p = { label: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd, ...emptyPnl() };
      byWeek.set(w.label, p);
    }
    return p;
  };
  for (const r of rows) addSession(bucket(r.dateIso), r);
  for (const e of generalExpenses) bucket(e.dateIso).generalExpensesFils += e.amountFils;
  const weeks = Array.from(byWeek.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const w of weeks) finishPnl(w);
  return weeks;
}

// Runner pay: per ISO week, per runner — each session's profit × 25%, rounded to whole
// fils PER SESSION, summed. Sessions with captainId null land in the 'Unassigned'
// bucket so a missed captain assignment is visible, never silently dropped.
export interface RunnerPaySession {
  dateIso: string;
  venue: string;
  profitFils: number;
  payFils: number;
}
export interface RunnerPayWeek {
  label: string;
  weekStart: string;
  weekEnd: string;
  runners: Array<{
    runnerKey: string; // captainId or 'unassigned'
    runnerName: string;
    sessions: RunnerPaySession[];
    totalPayFils: number;
  }>;
}

export function aggregateRunnerPay(rows: SessionFinanceRow[]): RunnerPayWeek[] {
  const byWeek = new Map<string, Map<string, { runnerName: string; sessions: RunnerPaySession[] }>>();
  const weekMeta = new Map<string, { weekStart: string; weekEnd: string }>();

  for (const r of rows) {
    const w = isoWeekOf(r.dateIso);
    weekMeta.set(w.label, { weekStart: w.weekStart, weekEnd: w.weekEnd });
    const runnerKey = r.captainId ?? "unassigned";
    const runnerName = r.captainId ? (r.captainName ?? "(unknown runner)") : "Unassigned";
    let runners = byWeek.get(w.label);
    if (!runners) { runners = new Map(); byWeek.set(w.label, runners); }
    let entry = runners.get(runnerKey);
    if (!entry) { entry = { runnerName, sessions: [] }; runners.set(runnerKey, entry); }
    entry.sessions.push({
      dateIso: r.dateIso,
      venue: r.venue,
      profitFils: r.profitFils,
      payFils: Math.round(r.profitFils * RUNNER_PROFIT_SHARE),
    });
  }

  // Most recent week first; runners alphabetical with Unassigned last.
  return Array.from(byWeek.entries())
    .sort((a, b) => weekMeta.get(b[0])!.weekStart.localeCompare(weekMeta.get(a[0])!.weekStart))
    .map(([label, runners]) => ({
      label,
      ...weekMeta.get(label)!,
      runners: Array.from(runners.entries())
        .sort((a, b) => {
          if (a[0] === "unassigned") return 1;
          if (b[0] === "unassigned") return -1;
          return a[1].runnerName.localeCompare(b[1].runnerName);
        })
        .map(([runnerKey, e]) => ({
          runnerKey,
          runnerName: e.runnerName,
          sessions: e.sessions,
          totalPayFils: e.sessions.reduce((s: number, x: RunnerPaySession) => s + x.payFils, 0),
        })),
    }));
}
