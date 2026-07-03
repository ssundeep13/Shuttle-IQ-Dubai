// Phase 4 — Ziina CSV reconciliation engine. STATELESS by design: the uploaded CSV is
// parsed in memory, matched against read-only DB rows, and the buckets are returned as
// JSON. NOTHING is written — no table, no file, no UPDATE. Corrections (refund
// backfills, phantom fixes) are separate hand-run scripts, never this module.
//
// Everything here is grounded in the STEP 1/1.5 dry-runs against the real export:
//  • Match key: CSV "Transaction ID" ↔ payments.ziinaPaymentIntentId (proven; 0 dupes).
//  • CSV rows AGGREGATE per booking before amount checks (add-guest = multiple charges).
//  • Clock offset between CSV Time and our completedAt is EMPIRICAL (measured ≈ +4.00h
//    constant on the real export) — computed from matched pairs, never hardcoded. If
//    unstable, all time-based logic is disabled rather than guessed.
//  • Payments completed after the export's last row are "not covered", never flags.
//  • Expected card amount = bookings.amountAed×100 − walletAmountUsed (fils), NOT
//    payments.amount (partial-wallet hazard).

import { sql } from "drizzle-orm";

// ── CSV parsing ───────────────────────────────────────────────────────────────
export interface CsvTx {
  rawTime: string;
  time: Date | null; // CSV clock domain, parsed as-if-UTC+4 (offset corrected later)
  id: string;
  type: string;
  currency: string;
  grossFils: number;
  netFils: number;
  feeFils: number;
  message: string;
  performedBy: string;
  customerMasked: string; // initials + card last-4 — raw PII never leaves the parser
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const maskName = (n: string | null | undefined) =>
  (n || "").trim().split(/\s+/).map((w) => (w[0] || "").toUpperCase() + ".").join("") || "(blank)";
const cardLast4 = (c: string | undefined) => {
  const m = (c || "").match(/(\d{4})\s*$/);
  return m ? `····${m[1]}` : "";
};

const REQUIRED_COLS = ["Time", "Transaction ID", "Type", "Currency", "Amount", "Amount Received", "Fee"] as const;

export function parseZiinaCsv(text: string): CsvTx[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV appears empty.");
  const header = rows[0];
  const col = (n: string) => header.indexOf(n);
  for (const c of REQUIRED_COLS) if (col(c) < 0) throw new Error(`CSV is missing the "${c}" column — is this the Ziina transactions export?`);
  const C = {
    time: col("Time"), id: col("Transaction ID"), type: col("Type"), cur: col("Currency"),
    amount: col("Amount"), net: col("Amount Received"), fee: col("Fee"),
    msg: col("Message"), by: col("Performed By"), customer: col("Customer"), card: col("Customer Card Number"),
  };
  const parseTime = (s: string): Date | null => {
    const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    // Parsed as-if the export were Dubai (+4); the empirical offset pass corrects the
    // residual drift, so this base assumption never has to be right on its own.
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 4, +m[5], +m[6])) : null;
  };
  const txs = rows.slice(1).map((r) => ({
    rawTime: r[C.time] ?? "",
    time: parseTime(r[C.time] ?? ""),
    id: (r[C.id] || "").trim(),
    type: r[C.type] || "",
    currency: (r[C.cur] || "").trim().toUpperCase(),
    grossFils: Math.round(parseFloat(r[C.amount] || "0") * 100),
    netFils: Math.round(parseFloat(r[C.net] || "0") * 100),
    feeFils: Math.round(parseFloat(r[C.fee] || "0") * 100),
    message: C.msg >= 0 ? r[C.msg] || "" : "",
    performedBy: C.by >= 0 ? (r[C.by] || "").trim() : "",
    customerMasked: `${maskName(C.customer >= 0 ? r[C.customer] : "")} ${cardLast4(C.card >= 0 ? r[C.card] : "")}`.trim(),
  }));
  const badCur = txs.filter((t) => t.currency && t.currency !== "AED");
  if (badCur.length) throw new Error(`CSV contains ${badCur.length} non-AED row(s) (found "${badCur[0].currency}") — only AED exports are supported.`);
  return txs;
}

// ── DB input (read-only) ──────────────────────────────────────────────────────
export interface DbPaymentRow {
  paymentId: string;
  bookingId: string | null;
  intent: string | null;
  payAed: number;            // payments.amount — whole AED
  status: string;
  completedAt: Date | null;  // ours (UTC)
  createdAt: Date;
  ziinaRefundId: string | null;
  refundedAmountFils: number | null;
  refundStatus: string | null;
  refundedAt: Date | null;
  bookingAmountAed: number | null;
  walletAmountUsedFils: number | null;
  bookingStatus: string | null;
  sessionDate: string | null; // YYYY-MM-DD
  userName: string | null;
}
export interface DbBookingIntentRow {
  bookingId: string;
  intent: string;
  bookingAmountAed: number;
  walletAmountUsedFils: number;
  bookingStatus: string;
  sessionDate: string | null;
  userName: string | null;
}
export interface ReconcileDbInput {
  payments: DbPaymentRow[];
  bookingIntents: DbBookingIntentRow[];
}

export async function loadReconcileInput(): Promise<ReconcileDbInput> {
  const { db } = await import("../db");
  const pRes = await db.execute(sql`
    SELECT p.id AS payment_id, p.booking_id, p.ziina_payment_intent_id AS intent,
           p.amount AS pay_aed, p.status, p.completed_at, p.created_at,
           p.ziina_refund_id, p.refunded_amount, p.refund_status, p.refunded_at,
           b.amount_aed, b.wallet_amount_used, b.status AS bstatus,
           to_char(s.date,'YYYY-MM-DD') AS session_date, mu.name AS user_name
    FROM payments p
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN bookable_sessions s ON s.id = b.session_id
    LEFT JOIN marketplace_users mu ON mu.id = b.user_id`);
  const bRes = await db.execute(sql`
    SELECT b.id AS booking_id, b.ziina_payment_intent_id AS intent, b.amount_aed,
           b.wallet_amount_used, b.status AS bstatus,
           to_char(s.date,'YYYY-MM-DD') AS session_date, mu.name AS user_name
    FROM bookings b
    LEFT JOIN bookable_sessions s ON s.id = b.session_id
    LEFT JOIN marketplace_users mu ON mu.id = b.user_id
    WHERE b.ziina_payment_intent_id IS NOT NULL`);
  // Postgres `timestamp` (no tz) columns arrive as NAIVE strings from raw execute, and
  // our columns hold true UTC. Parsing them with plain new Date() would adopt the
  // SERVER-LOCAL timezone (correct on Railway/UTC, 4h skewed on a Dubai dev machine) —
  // pin them to UTC explicitly so every environment reads the same instant.
  const d = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    return new Date(String(v).replace(" ", "T") + "Z");
  };
  return {
    payments: (pRes.rows as any[]).map((r) => ({
      paymentId: r.payment_id, bookingId: r.booking_id, intent: r.intent,
      payAed: Number(r.pay_aed), status: r.status,
      completedAt: d(r.completed_at), createdAt: d(r.created_at)!,
      ziinaRefundId: r.ziina_refund_id, refundedAmountFils: r.refunded_amount == null ? null : Number(r.refunded_amount),
      refundStatus: r.refund_status, refundedAt: d(r.refunded_at),
      bookingAmountAed: r.amount_aed == null ? null : Number(r.amount_aed),
      walletAmountUsedFils: r.wallet_amount_used == null ? null : Number(r.wallet_amount_used),
      bookingStatus: r.bstatus, sessionDate: r.session_date, userName: r.user_name,
    })),
    bookingIntents: (bRes.rows as any[]).map((r) => ({
      bookingId: r.booking_id, intent: r.intent,
      bookingAmountAed: Number(r.amount_aed), walletAmountUsedFils: Number(r.wallet_amount_used ?? 0),
      bookingStatus: r.bstatus, sessionDate: r.session_date, userName: r.user_name,
    })),
  };
}

// ── Result shape ──────────────────────────────────────────────────────────────
interface BucketRow {
  date: string;             // display/filter date (session date when known, else CSV date)
  amountAed: number;        // gross CSV sum for the row
  deltaAed?: number;        // over/under rows only: the amount OVER- or UNDER-charged —
                            // headers must sum THIS, not the gross (live display bug fix)
  customer: string;         // masked
  detail: string;
}
export interface ReconcileResult {
  meta: {
    csvRows: number; invoices: number; refunds: number;
    withdrawals: { count: number; totalAed: number };
    csvFrom: string | null; csvTo: string | null;
    offset: { stable: boolean; medianHours: number; spreadMinutes: number; pairs: number } | null;
    warnings: string[];
  };
  matchedConsistent: { count: number; totalAed: number; rows: BucketRow[] };
  overCapture: { count: number; totalAed: number; rows: BucketRow[] };
  underCollection: { count: number; totalAed: number; rows: BucketRow[] };
  noAppRecord: Array<{ label: string; informational: true; count: number; totalAed: number; rows: BucketRow[] }>;
  phantoms: {
    inWindow: { count: number; totalAed: number; rows: BucketRow[] };
    afterCutoff: { count: number; totalAed: number; rows: BucketRow[] };
    preWindowCount: number;
  } | null; // null when time alignment unavailable
  refundLeg: {
    csvRefunds: BucketRow[];
    gapProposals: Array<{ bookingShort: string; customer: string; sessionDate: string | null; payAed: number; candidate: { date: string; amountAed: number; customer: string; deltaDays: number } | null }>;
  };
  advisory: Array<{ month: string; phantomAed: number; runnerPayDeltaAed: number }>;
  fees: { totalAed: number; byMonth: Array<{ month: string; feeAed: number }> };
}

const aed = (fils: number) => Math.round(fils) / 100;
const short = (id: string | null) => (id ? id.slice(0, 8) + "…" : "(none)");

function classifyNoAppMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("test")) return "test bookings";
  if (m.startsWith("shuttleiq extra spot")) return "legacy extra-spot invoices";
  if (m.startsWith("shuttleiq")) return "legacy venue-labelled charges";
  if (/-\s*\d+(st|nd|rd|th)\s+/i.test(msg)) return "booking charges with no surviving booking (deleted / cancelled session)";
  return "other app charges";
}

// ── The engine (pure) ─────────────────────────────────────────────────────────
export function reconcileZiinaCsv(csvText: string, dbIn: ReconcileDbInput): ReconcileResult {
  const txs = parseZiinaCsv(csvText);
  const warnings: string[] = [];

  const invoices = txs.filter((t) => t.type === "Invoice");
  const refunds = txs.filter((t) => t.type === "Refund");
  const withdrawals = txs.filter((t) => t.type === "Withdrawal");
  const unknownTypes = txs.filter((t) => !["Invoice", "Refund", "Withdrawal"].includes(t.type));
  if (unknownTypes.length) warnings.push(`${unknownTypes.length} row(s) with unrecognised Type were ignored.`);

  const payByIntent = new Map<string, DbPaymentRow>();
  for (const p of dbIn.payments) if (p.intent && !payByIntent.has(p.intent)) payByIntent.set(p.intent, p);
  const bookByIntent = new Map(dbIn.bookingIntents.map((b) => [b.intent, b]));

  // 1) id-match invoices
  type Matched = { tx: CsvTx; bookingId: string; expectedFils: number | null; sessionDate: string | null; customer: string; bookingShort: string };
  const matched: Matched[] = [];
  const noAppRows: CsvTx[] = [];
  for (const t of invoices) {
    const p = payByIntent.get(t.id);
    const b = p ? null : bookByIntent.get(t.id);
    if (p && p.bookingId) {
      matched.push({
        tx: t, bookingId: p.bookingId,
        expectedFils: p.bookingAmountAed == null ? null : p.bookingAmountAed * 100 - (p.walletAmountUsedFils ?? 0),
        sessionDate: p.sessionDate, customer: `${maskName(p.userName)}`, bookingShort: short(p.bookingId),
      });
    } else if (b) {
      matched.push({
        tx: t, bookingId: b.bookingId,
        expectedFils: b.bookingAmountAed * 100 - b.walletAmountUsedFils,
        sessionDate: b.sessionDate, customer: maskName(b.userName), bookingShort: short(b.bookingId),
      });
    } else {
      noAppRows.push(t);
    }
  }

  // 2) empirical clock offset from matched pairs (never hardcoded)
  const deltas = matched
    .filter((m) => m.tx.time && payByIntent.get(m.tx.id)?.completedAt)
    .map((m) => m.tx.time!.getTime() - payByIntent.get(m.tx.id)!.completedAt!.getTime())
    .sort((a, b) => a - b);
  let offsetMs: number | null = null;
  let offsetMeta: ReconcileResult["meta"]["offset"] = null;
  if (deltas.length >= 5) {
    const median = deltas[Math.floor(deltas.length / 2)];
    const p10 = deltas[Math.floor(deltas.length * 0.1)];
    const p90 = deltas[Math.floor(deltas.length * 0.9)];
    const spreadMin = (p90 - p10) / 60000;
    const stable = spreadMin <= 15;
    offsetMeta = { stable, medianHours: median / 3600e3, spreadMinutes: Math.round(spreadMin * 10) / 10, pairs: deltas.length };
    if (stable) offsetMs = median;
    else warnings.push(`Clock offset between the CSV and our records is UNSTABLE (p10–p90 spread ${spreadMin.toFixed(0)} min) — time-based checks (export cutoff, phantom windowing) are disabled; id-only matching applies.`);
  } else {
    warnings.push("Too few id-matched rows to calibrate the clock offset — time-based checks disabled.");
  }

  // 3) per-booking aggregation → consistent / over / under
  const byBooking = new Map<string, Matched[]>();
  for (const m of matched) {
    const list = byBooking.get(m.bookingId) ?? [];
    list.push(m); byBooking.set(m.bookingId, list);
  }
  const consistent: BucketRow[] = [], over: BucketRow[] = [], under: BucketRow[] = [];
  let overFils = 0, underFils = 0, consistentFils = 0;
  for (const [bookingId, list] of Array.from(byBooking.entries())) {
    const sumFils = list.reduce((s, m) => s + m.tx.grossFils, 0);
    const expected = list[0].expectedFils;
    const row: BucketRow = {
      date: list[0].sessionDate ?? list[0].tx.rawTime.slice(6, 10) + "-" + list[0].tx.rawTime.slice(3, 5) + "-" + list[0].tx.rawTime.slice(0, 2),
      amountAed: aed(sumFils),
      customer: list[0].customer,
      detail: `booking ${short(bookingId)} · ${list.length} charge(s) AED ${aed(sumFils)} vs booking AED ${expected == null ? "?" : aed(expected)}`,
    };
    if (expected == null || sumFils === expected) { consistent.push(row); consistentFils += sumFils; }
    else if (sumFils > expected) { overFils += sumFils - expected; over.push({ ...row, deltaAed: aed(sumFils - expected), detail: row.detail + ` → OVER by AED ${aed(sumFils - expected)}` }); }
    else { underFils += expected - sumFils; under.push({ ...row, deltaAed: aed(expected - sumFils), detail: row.detail + ` → UNDER by AED ${aed(expected - sumFils)}` }); }
  }

  // 4) in-Ziina-no-app-record, grouped; manual/off-app first-class, informational
  const groups = new Map<string, CsvTx[]>();
  for (const t of noAppRows) {
    const label = t.performedBy ? `off-app collections (performed by ${t.performedBy})` : classifyNoAppMessage(t.message);
    const list = groups.get(label) ?? []; list.push(t); groups.set(label, list);
  }
  const noAppRecord = Array.from(groups.entries()).map(([label, list]) => ({
    label, informational: true as const, count: list.length,
    totalAed: aed(list.reduce((s, t) => s + t.grossFils, 0)),
    rows: list.map((t) => ({
      date: t.time ? t.time.toISOString().slice(0, 10) : t.rawTime,
      amountAed: aed(t.grossFils), customer: t.customerMasked,
      detail: t.message ? `msg: "${t.message.slice(0, 40)}"` : "(no message)",
    })),
  })).sort((a, b) => b.totalAed - a.totalAed);

  // 5) phantoms — only with a stable offset (window mapped into OUR clock domain)
  const csvTimes = txs.map((t) => t.time).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()) as Date[];
  let phantoms: ReconcileResult["phantoms"] = null;
  if (offsetMs != null && csvTimes.length) {
    const csvMinOur = new Date(csvTimes[0].getTime() - offsetMs);
    const csvMaxOur = new Date(csvTimes[csvTimes.length - 1].getTime() - offsetMs);
    const csvInvoiceIds = new Set(invoices.map((t) => t.id));
    const absent = dbIn.payments.filter((p) => p.status === "completed" && p.intent && !csvInvoiceIds.has(p.intent));
    const eff = (p: DbPaymentRow) => p.completedAt ?? p.createdAt;
    const inWin = absent.filter((p) => eff(p) >= csvMinOur && eff(p) <= csvMaxOur);
    const afterWin = absent.filter((p) => eff(p) > csvMaxOur);
    const preCount = absent.filter((p) => eff(p) < csvMinOur).length;
    const toRow = (p: DbPaymentRow): BucketRow => ({
      date: p.sessionDate ?? eff(p).toISOString().slice(0, 10),
      amountAed: p.payAed,
      customer: maskName(p.userName),
      detail: `booking ${short(p.bookingId)} · intent ${short(p.intent)} · paid ${eff(p).toISOString().slice(0, 10)} · session ${p.sessionDate ?? "?"} · booking status ${p.bookingStatus ?? "?"}`,
    });
    phantoms = {
      inWindow: { count: inWin.length, totalAed: inWin.reduce((s, p) => s + p.payAed, 0), rows: inWin.map(toRow) },
      afterCutoff: { count: afterWin.length, totalAed: afterWin.reduce((s, p) => s + p.payAed, 0), rows: afterWin.map(toRow) },
      preWindowCount: preCount,
    };
  }

  // 6) refund leg — list + READ-ONLY backfill proposals for the refundedAmount-NULL gap
  const refundRows: BucketRow[] = refunds.map((t) => ({
    date: t.time ? t.time.toISOString().slice(0, 10) : t.rawTime,
    amountAed: aed(t.grossFils), customer: t.customerMasked,
    detail: t.performedBy ? `performed by ${t.performedBy}` : "app refund",
  }));
  const gapRows = dbIn.payments.filter((p) => p.refundStatus === "completed" && p.refundedAmountFils == null);
  const gapProposals = gapRows.map((p) => {
    const anchor = (p.refundedAt ?? p.completedAt ?? p.createdAt).getTime() + (offsetMs ?? 0);
    const cand = refunds
      .filter((t) => t.time)
      .map((t) => ({ t, dt: Math.abs(t.time!.getTime() - anchor) }))
      .sort((a, b) => a.dt - b.dt)[0];
    return {
      bookingShort: short(p.bookingId), customer: maskName(p.userName), sessionDate: p.sessionDate,
      payAed: p.payAed,
      candidate: cand ? { date: cand.t.time!.toISOString().slice(0, 10), amountAed: aed(cand.t.grossFils), customer: cand.t.customerMasked, deltaDays: Math.round((cand.dt / 86400e3) * 10) / 10 } : null,
    };
  });

  // 7) advisory (display-only; P&L/runner-pay figures are never rewritten here)
  const phantomByMonth = new Map<string, number>();
  if (phantoms) for (const r of phantoms.inWindow.rows) {
    const month = r.date.slice(0, 7);
    phantomByMonth.set(month, (phantomByMonth.get(month) ?? 0) + r.amountAed);
  }
  const advisory = Array.from(phantomByMonth.entries()).sort()
    .map(([month, phantomAed]) => ({ month, phantomAed, runnerPayDeltaAed: Math.round(phantomAed * 25) / 100 }));

  // 8) fees (info only; P&L stays gross/collected)
  const feeByMonth = new Map<string, number>();
  for (const t of [...invoices, ...refunds]) {
    if (!t.time) continue;
    const month = t.time.toISOString().slice(0, 7);
    feeByMonth.set(month, (feeByMonth.get(month) ?? 0) + t.feeFils);
  }
  const fees = {
    totalAed: aed(Array.from(feeByMonth.values()).reduce((s, f) => s + f, 0)),
    byMonth: Array.from(feeByMonth.entries()).sort().map(([month, f]) => ({ month, feeAed: aed(f) })),
  };

  return {
    meta: {
      csvRows: txs.length, invoices: invoices.length, refunds: refunds.length,
      withdrawals: { count: withdrawals.length, totalAed: aed(withdrawals.reduce((s, t) => s + t.grossFils, 0)) },
      csvFrom: csvTimes[0]?.toISOString().slice(0, 10) ?? null,
      csvTo: csvTimes[csvTimes.length - 1]?.toISOString().slice(0, 10) ?? null,
      offset: offsetMeta, warnings,
    },
    matchedConsistent: { count: consistent.length, totalAed: aed(consistentFils), rows: consistent },
    overCapture: { count: over.length, totalAed: aed(overFils), rows: over },
    underCollection: { count: under.length, totalAed: aed(underFils), rows: under },
    noAppRecord,
    phantoms,
    refundLeg: { csvRefunds: refundRows, gapProposals },
    advisory,
    fees,
  };
}
