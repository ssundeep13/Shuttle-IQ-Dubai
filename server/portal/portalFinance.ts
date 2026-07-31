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

// THE single implementation of a session's accrued pay (25% of VALUE profit, rounded to
// whole fils per session). Both the Runner Pay tab and the P&L's runner-pay line call
// this — never re-derive the share anywhere else.
export function accruedPayFils(valueProfitFils: number): number {
  return Math.round(valueProfitFils * RUNNER_PROFIT_SHARE);
}

// Social media manager: 15% of each session's COLLECTED-basis profit (profitFils —
// max(0, collected − court − shuttle − water)), rounded to whole fils per session.
// DELIBERATELY a different revenue basis from runner pay (owner ruling): the runner is
// paid on VALUE (collected + wallet); she is paid on actual collections only. The
// zero floor is already inside profitFils, so a losing session contributes nothing
// and the monthly sum can never go negative — no period-level floor exists or is
// needed. Unlike runner pay this accrues on EVERY session, captain assigned or not.
export const SOCIAL_MEDIA_PROFIT_SHARE = 0.15;
export function accruedSocialMediaPayFils(profitFils: number): number {
  return Math.round(profitFils * SOCIAL_MEDIA_PROFIT_SHARE);
}

// Her contract start (Mon 27 Jul 2026, opening ISO week W31). Sessions dated before
// this contribute ZERO regardless of profit — attribution is by session date, the
// locked rule. ISO dateIso strings compare correctly with plain <.
export const SOCIAL_MEDIA_PAY_START = "2026-07-27";

// THE per-session social-media accrual — cutoff + formula in one place. Both the
// monthly P&L line and the weekly pay view call this; they can never drift. (Weekly
// and monthly period totals may differ by a few fils across a month boundary week —
// both sum these same per-session values, only the grouping differs.)
export function sessionSocialMediaPayFils(r: Pick<SessionFinanceRow, "dateIso" | "profitFils">): number {
  if (r.dateIso < SOCIAL_MEDIA_PAY_START) return 0;
  return accruedSocialMediaPayFils(r.profitFils);
}

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
  profitFils: number; // COLLECTED-basis, zero-floored per session
  walletPaidFils: number;  // display-only info (P&L/session views); part of the VALUE basis
  valueFils: number;       // collected + wallet — runner pay's revenue basis
  valueProfitFils: number; // max(0, value − costs) — what runner pay is 25% of
  unpaidCashFils: number;  // excluded from BOTH bases; surfaced so exclusions are visible
}

export interface GeneralExpenseRow {
  dateIso: string;
  amountFils: number;
}

export interface PeriodPnlFils {
  collectedRevenueFils: number;
  sessionCostsFils: number;
  generalExpensesFils: number;
  netProfitFils: number; // BEFORE runner pay — plain arithmetic, NOT floored
  walletPaidFils: number; // informational only — NOT part of the net formula
  // Build A (monthly P&L only; weekly leaves these at zero/net):
  runnerPayFils: number;        // accrued pay, ASSIGNED captains only — Unassigned pays nobody
  socialMediaPayFils: number;   // 15% of per-session COLLECTED profit, every session
  managementProfitFils: number; // netProfitFils − runnerPayFils − socialMediaPayFils (may go negative)
}

// ── DB assembly ───────────────────────────────────────────────────────────────

// Every bookable session dated >= the epoch, regardless of status or whether a
// session_costs row exists yet (LEFT JOINs) — nothing silently vanishes; a costless
// session shows zero costs. Profit numbers come from the batch (3 queries total).
export async function loadSessionFinanceRows(): Promise<SessionFinanceRow[]> {
  const { db } = await import("../db");

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
      walletPaidFils: p.walletPaidFils,
      valueFils: p.valueFils,
      valueProfitFils: p.valueProfitFils,
      unpaidCashFils: p.unpaidCashFils,
    };
  });
}

export async function loadGeneralExpenseRows(): Promise<GeneralExpenseRow[]> {
  const { db } = await import("../db");
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
  return {
    collectedRevenueFils: 0, sessionCostsFils: 0, generalExpensesFils: 0,
    netProfitFils: 0, walletPaidFils: 0, runnerPayFils: 0, socialMediaPayFils: 0,
    managementProfitFils: 0,
  };
}

function addSession(p: PeriodPnlFils, r: SessionFinanceRow): void {
  p.collectedRevenueFils += r.revenueFils;
  p.sessionCostsFils += r.courtCostFils + r.shuttleCostFils + r.waterCostFils;
  p.walletPaidFils += r.walletPaidFils; // info only — finishPnl never reads it
}

function finishPnl(p: PeriodPnlFils): void {
  p.netProfitFils = p.collectedRevenueFils - p.sessionCostsFils - p.generalExpensesFils;
  p.managementProfitFils = p.netProfitFils - p.runnerPayFils - p.socialMediaPayFils;
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
    if (!p) continue; // sessions past throughMonth are out of scope
    addSession(p, r);
    // Runner-pay line: accrued via the SAME rule as the Runner Pay tab, but ASSIGNED
    // captains only — an Unassigned session pays nobody, so its profit stays with
    // management and contributes ZERO here. Monthly only; weekly never accumulates this.
    if (r.captainId) p.runnerPayFils += accruedPayFils(r.valueProfitFils);
    // Social-media line: 15% of COLLECTED profit, per session, UNCONDITIONAL — she is
    // paid on every session whether or not a captain is assigned. Contract-start
    // cutoff lives inside the shared helper. Monthly P&L only; the P&L's weekly
    // aggregation never accumulates this (her weekly figures have their own view).
    p.socialMediaPayFils += sessionSocialMediaPayFils(r);
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

// Social-media pay, weekly — the dedicated pay view. ISO weeks, newest first,
// mirroring the runner view's convention: a week appears iff it has at least one
// session on/after the contract start (a zero-pay week with sessions is information,
// like a runner session listed at pay 0); pre-start weeks never appear. Each week
// sums the SAME per-session accruals the monthly P&L sums — one helper, no drift.
export interface SocialMediaPayWeek {
  label: string;
  weekStart: string;
  weekEnd: string;
  payFils: number;
}

export function aggregateSocialMediaPayWeekly(rows: SessionFinanceRow[]): SocialMediaPayWeek[] {
  const byWeek = new Map<string, SocialMediaPayWeek>();
  for (const r of rows) {
    if (r.dateIso < SOCIAL_MEDIA_PAY_START) continue; // pre-start sessions create no weeks
    const w = isoWeekOf(r.dateIso);
    let entry = byWeek.get(w.label);
    if (!entry) {
      entry = { label: w.label, weekStart: w.weekStart, weekEnd: w.weekEnd, payFils: 0 };
      byWeek.set(w.label, entry);
    }
    entry.payFils += sessionSocialMediaPayFils(r);
  }
  // Newest first, matching the runner pay view.
  return Array.from(byWeek.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// Runner pay: per ISO week, per runner — each session's VALUE profit × 25%, rounded to
// whole fils PER SESSION, summed. VALUE basis (locked rule change): collected + wallet,
// refund-netted; unpaid cash EXCLUDED (user decision — no payout on uncollected money)
// but surfaced per session so the exclusion is visible. Sessions with captainId null
// land in the 'Unassigned' bucket so a missed captain assignment is never dropped.
export interface RunnerPaySession {
  dateIso: string;
  venue: string;
  valueFils: number;       // the pay basis: collected + wallet, refund-netted
  walletPaidFils: number;  // portion of value that was wallet-paid
  unpaidCashFils: number;  // excluded from the basis; >0 flags the session
  valueProfitFils: number; // max(0, value − costs)
  payFils: number;         // round(valueProfit × 25%) per session
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

// Build B — server-side wall for role='runner': keep ONLY the bucket matching the
// caller's runner id in every week; weeks without it disappear entirely. Other runners'
// names/totals and the Unassigned bucket (runnerKey 'unassigned') never survive this —
// nothing about anyone else leaves the server. Pure; unit-tested with a 2-runner fixture.
export function filterRunnerPayWeeksForRunner(weeks: RunnerPayWeek[], runnerId: string | null): RunnerPayWeek[] {
  if (!runnerId) return []; // a runner login with no runner_id sees nothing, not everything
  return weeks
    .map((w) => ({ ...w, runners: w.runners.filter((r) => r.runnerKey === runnerId) }))
    .filter((w) => w.runners.length > 0);
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
      valueFils: r.valueFils,
      walletPaidFils: r.walletPaidFils,
      unpaidCashFils: r.unpaidCashFils,
      valueProfitFils: r.valueProfitFils,
      payFils: accruedPayFils(r.valueProfitFils),
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
