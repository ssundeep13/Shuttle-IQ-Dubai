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
import { and, inArray, sql } from "drizzle-orm";

export interface ProfitInputsFils {
  revenueFils: number;
  courtCostFils: number;
  shuttleCostFils: number;
  waterCostFils: number;
}

export interface ProfitBreakdownFils extends ProfitInputsFils {
  profitFils: number;       // COLLECTED-basis profit (P&L, session views)
  // Phase 3 follow-up — the second revenue basis. VALUE = collected + wallet-paid
  // (wallet spend is real session value even though the cash was banked when the
  // credit was issued). Runner pay reads valueProfitFils; everything else keeps
  // reading revenueFils/profitFils. Unpaid cash is in NEITHER basis (user decision:
  // don't pay out on money nobody has collected) — surfaced via unpaidCashFils.
  walletPaidFils: number;   // confirmed/attended 'wallet' bookings, refund-netted
  valueFils: number;        // revenueFils + walletPaidFils
  valueProfitFils: number;  // max(0, valueFils − costs), zero-floored per session
  unpaidCashFils: number;   // confirmed/attended cash with cashPaid=false (gross flag)
}

// ── Revenue bases (pure) ─────────────────────────────────────────────────────
// Classifies each confirmed/attended booking into exactly one bucket and nets the
// booking's own non-failed refunds against its bucket. This is THE single place the
// collected-vs-value distinction lives — the batch feeds it rows; tests feed it
// fixtures. Collected here is bit-identical to the original implementation:
// Σ(gross − refunds) over the collected set ≡ Σgross(collected) − Σrefunds(collected).
export interface BookingForRevenueFils {
  id: string;
  amountAed: number; // whole AED (×100 bridge happens here)
  paymentMethod: string;
  cashPaid: boolean;
}

export interface RevenueBasesFils {
  revenueFils: number;     // collected: ziina + paid cash, refund-netted
  walletPaidFils: number;  // wallet, refund-netted
  valueFils: number;       // collected + wallet
  unpaidCashFils: number;  // cash not yet marked paid (gross; excluded from both bases)
}

export function computeRevenueBasesFils(
  bookings: BookingForRevenueFils[],
  refundedFilsByBookingId: Map<string, number>, // non-failed refunds only
): RevenueBasesFils {
  let collected = 0, wallet = 0, unpaidCash = 0;
  for (const b of bookings) {
    const grossFils = b.amountAed * 100;
    const refundedFils = refundedFilsByBookingId.get(b.id) ?? 0;
    if (b.paymentMethod === 'ziina' || (b.paymentMethod === 'cash' && b.cashPaid)) {
      collected += grossFils - refundedFils;
    } else if (b.paymentMethod === 'wallet') {
      wallet += grossFils - refundedFils;
    } else if (b.paymentMethod === 'cash' && !b.cashPaid) {
      unpaidCash += grossFils; // flag only — no refund netting on uncollected money
    }
    // any other paymentMethod: excluded everywhere (unchanged behaviour)
  }
  return {
    revenueFils: collected,
    walletPaidFils: wallet,
    valueFils: collected + wallet,
    unpaidCashFils: unpaidCash,
  };
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
//
// SINGLE vs BATCH: computeSessionProfitFils(sessionId) DELEGATES to the batch of one,
// so there is exactly ONE implementation of the revenue/refund/cost assembly — the
// portal's report endpoints (Phase 3) use the batch over ~20+ sessions in 3 queries
// total instead of 3 queries per session, and the numbers cannot diverge.
export async function computeSessionProfitFils(sessionId: string): Promise<ProfitBreakdownFils> {
  const map = await computeSessionProfitsBatchFils([sessionId]);
  return map.get(sessionId)!; // batch guarantees an entry (zeros) for every requested id
}

export async function computeSessionProfitsBatchFils(
  sessionIds: string[],
): Promise<Map<string, ProfitBreakdownFils>> {
  const { db } = await import("./db"); // lazy — keeps computeProfitFils DB-import-free

  // Every requested id gets an entry, defaulting to all-zeros (no bookings, no costs).
  const result = new Map<string, ProfitBreakdownFils>();
  for (const id of sessionIds) {
    result.set(id, {
      revenueFils: 0, courtCostFils: 0, shuttleCostFils: 0, waterCostFils: 0, profitFils: 0,
      walletPaidFils: 0, valueFils: 0, valueProfitFils: 0, unpaidCashFils: 0,
    });
  }
  if (sessionIds.length === 0) return result;

  // 1) confirmed/attended bookings → keep only COLLECTED for gross revenue (fils)
  const bookingRows = await db
    .select({
      id: bookings.id,
      sessionId: bookings.sessionId,
      amountAed: bookings.amountAed,
      paymentMethod: bookings.paymentMethod,
      cashPaid: bookings.cashPaid,
    })
    .from(bookings)
    .where(and(
      inArray(bookings.sessionId, sessionIds),
      inArray(bookings.status, ['confirmed', 'attended']),
    ));

  // Group per session; refunds are looked up for every booking that can carry
  // refund-netted money (the collected set PLUS wallet — the two revenue bases).
  const bookingsBySession = new Map<string, BookingForRevenueFils[]>();
  const refundLookupIds: string[] = [];
  for (const b of bookingRows) {
    let list = bookingsBySession.get(b.sessionId);
    if (!list) { list = []; bookingsBySession.set(b.sessionId, list); }
    list.push({ id: b.id, amountAed: b.amountAed, paymentMethod: b.paymentMethod, cashPaid: b.cashPaid });
    if (b.paymentMethod === 'ziina' || (b.paymentMethod === 'cash' && b.cashPaid) || b.paymentMethod === 'wallet') {
      refundLookupIds.push(b.id);
    }
  }

  // 2) refunds (fils) per booking, excluding failed refunds
  const refundedFilsByBookingId = new Map<string, number>();
  if (refundLookupIds.length > 0) {
    const refundRows = await db
      .select({
        bookingId: payments.bookingId,
        refundedAmount: payments.refundedAmount,
      })
      .from(payments)
      .where(and(
        inArray(payments.bookingId, refundLookupIds),
        sql`${payments.refundStatus} IS DISTINCT FROM 'failed'`,
      ));
    for (const r of refundRows) {
      if (!r.bookingId) continue;
      refundedFilsByBookingId.set(
        r.bookingId,
        (refundedFilsByBookingId.get(r.bookingId) ?? 0) + (r.refundedAmount ?? 0),
      );
    }
  }

  // 3) per-session costs (0 if no session_costs row yet)
  const costRows = await db
    .select({
      sessionId: sessionCosts.sessionId,
      court: sessionCosts.courtCostFils,
      shuttle: sessionCosts.shuttleCostFils,
      water: sessionCosts.waterCostFils,
    })
    .from(sessionCosts)
    .where(inArray(sessionCosts.sessionId, sessionIds));
  const costsBySession = new Map(costRows.map((c) => [c.sessionId, c]));

  for (const id of sessionIds) {
    const bases = computeRevenueBasesFils(bookingsBySession.get(id) ?? [], refundedFilsByBookingId);
    const cost = costsBySession.get(id);
    const courtCostFils = cost?.court ?? 0;
    const shuttleCostFils = cost?.shuttle ?? 0;
    const waterCostFils = cost?.water ?? 0;
    const profitFils = computeProfitFils({
      revenueFils: bases.revenueFils, courtCostFils, shuttleCostFils, waterCostFils,
    });
    const valueProfitFils = computeProfitFils({
      revenueFils: bases.valueFils, courtCostFils, shuttleCostFils, waterCostFils,
    });
    result.set(id, {
      revenueFils: bases.revenueFils,
      courtCostFils, shuttleCostFils, waterCostFils,
      profitFils,
      walletPaidFils: bases.walletPaidFils,
      valueFils: bases.valueFils,
      valueProfitFils,
      unpaidCashFils: bases.unpaidCashFils,
    });
  }

  return result;
}
