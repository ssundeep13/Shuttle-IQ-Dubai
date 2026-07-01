// Session profit — the SINGLE source of truth for "what did this session earn".
// Everything downstream (Shannon's weekly pay, profit-based member LTV, the P&L
// cost side) MUST call these functions — do not re-derive the formula anywhere.
//
// MONEY UNIT: everything here is in FILS (1 AED = 100 fils). The one place the
// mixed-unit schema is bridged: bookings.amountAed is WHOLE AED, so we ×100 to fils
// (exact for integer AED). session_costs.*_fils and payments.refundedAmount are
// already fils.
//
// The file is split into a PURE function (computeProfitFils) that is unit-testable
// with plain fixtures, and a thin DB WRAPPER (computeSessionProfitFils) that only
// assembles the inputs. The wrapper LAZY-imports ./db inside the function body on
// purpose: server/db.ts throws if DATABASE_URL is unset and opens a pool, so a
// top-level import would make the pure function un-importable in a DB-less test.

import { bookings, payments, sessionCosts } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export interface ProfitInputsFils {
  revenueFils: number;
  courtCostFils: number;
  shuttleCostFils: number;
  waterCostFils: number;
}

export interface ProfitBreakdownFils extends ProfitInputsFils {
  profitFils: number;
}

// ── THE definition ───────────────────────────────────────────────────────────
// session profit = max(0, revenue − (court + shuttle + water)), all in fils.
// ZERO FLOOR: a loss-making session yields 0, never a negative number (mirrors the
// Court-Captain share model and Shannon's-pay rule). This is the single formula
// every downstream reader must go through.
export function computeProfitFils(inputs: ProfitInputsFils): number {
  const totalCostFils =
    inputs.courtCostFils + inputs.shuttleCostFils + inputs.waterCostFils;
  return Math.max(0, inputs.revenueFils - totalCostFils);
}

// ── DB wrapper ────────────────────────────────────────────────────────────────
// Assembles the inputs for one bookable session and calls computeProfitFils.
//
// REVENUE (fils) = COLLECTED money only, using the SAME predicate as the existing P&L
// (getFinanceSummary → collectedAed, server/storage.ts ~3719–3724): a confirmed/attended
// booking counts toward revenue ONLY when
//     paymentMethod = 'ziina'  OR  (paymentMethod = 'cash' AND cashPaid = true).
// Confirmed-but-unpaid cash is charged-but-not-collected → EXCLUDED. Any other
// paymentMethod (neither 'ziina' nor 'cash') is also excluded.
//   revenue = Σ (amountAed × 100) over COLLECTED bookings
//           − Σ payments.refundedAmount (fils) for those collected bookings, EXCLUDING
//             rows whose refundStatus = 'failed' (a failed refund returned no money,
//             though the webhook can still leave refundedAmount populated).
//   pending + completed refunds ARE subtracted.
//
// Deliberately NOT counted:
//   • Whole-booking cancels flip status out of confirmed/attended → self-exclude.
//   • Confirmed-but-unpaid cash (charged, not collected) → excluded by the predicate.
//   • walletAmountUsed is NOT added back: wallet credit is already-banked money and
//     amountAed is the charged figure that already reflects it.
//
// KNOWN LIMITATION (flagged for Phase 3): a refund an admin issued straight on the
// Ziina dashboard and marked via markRefundAsManuallyProcessed sets
// refundStatus='completed' but leaves refundedAmount NULL — so it is NOT subtracted
// here. Only refunds with a recorded refundedAmount (the Ziina-API refund path)
// reduce revenue.
//
// COSTS come from the session_costs row; if none exists yet, all three are 0.
// sessionId anchors to bookableSessions.id (what bookings.sessionId points at).
export async function computeSessionProfitFils(sessionId: string): Promise<ProfitBreakdownFils> {
  const { db } = await import("./db"); // lazy — keeps computeProfitFils DB-import-free

  // 1) confirmed/attended bookings → keep only COLLECTED for gross revenue (fils)
  const bookingRows = await db
    .select({
      id: bookings.id,
      amountAed: bookings.amountAed,
      paymentMethod: bookings.paymentMethod,
      cashPaid: bookings.cashPaid,
    })
    .from(bookings)
    .where(and(
      eq(bookings.sessionId, sessionId),
      inArray(bookings.status, ['confirmed', 'attended']),
    ));

  // COLLECTED predicate — identical to getFinanceSummary's collectedAed: card
  // ('ziina') always counts; cash counts only once cashPaid; anything else excluded.
  const isCollected = (b: { paymentMethod: string; cashPaid: boolean }) =>
    b.paymentMethod === 'ziina' || (b.paymentMethod === 'cash' && b.cashPaid);
  const collectedRows = bookingRows.filter(isCollected);

  const grossFils = collectedRows.reduce((sum, b) => sum + b.amountAed * 100, 0);

  // 2) refunds (fils) for the COLLECTED bookings, excluding failed refunds
  let refundedFils = 0;
  if (collectedRows.length > 0) {
    const bookingIds = collectedRows.map((b) => b.id);
    const [row] = await db
      .select({
        refunded: sql<number>`cast(coalesce(sum(${payments.refundedAmount}), 0) as integer)`,
      })
      .from(payments)
      .where(and(
        inArray(payments.bookingId, bookingIds),
        sql`${payments.refundStatus} IS DISTINCT FROM 'failed'`,
      ));
    refundedFils = row?.refunded ?? 0;
  }

  const revenueFils = grossFils - refundedFils;

  // 3) per-session costs (0 if no session_costs row yet)
  const [costRow] = await db
    .select({
      court: sessionCosts.courtCostFils,
      shuttle: sessionCosts.shuttleCostFils,
      water: sessionCosts.waterCostFils,
    })
    .from(sessionCosts)
    .where(eq(sessionCosts.sessionId, sessionId));

  const courtCostFils = costRow?.court ?? 0;
  const shuttleCostFils = costRow?.shuttle ?? 0;
  const waterCostFils = costRow?.water ?? 0;

  const profitFils = computeProfitFils({
    revenueFils, courtCostFils, shuttleCostFils, waterCostFils,
  });

  return { revenueFils, courtCostFils, shuttleCostFils, waterCostFils, profitFils };
}
