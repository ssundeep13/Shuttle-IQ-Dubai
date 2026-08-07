// Dubailand opening promo — instant AED 15 wallet credit for ONE session, with
// automatic clawback on cancellation.
//
//   Session: Smash Sports Academy (The Aquila School, DubaiLand)
//            Fri 7 Aug 2026, 20:00–22:00 — hard-pinned by id below.
//
// RULES (owner ruling, 2026-08-05):
//   CREDIT   — the moment a booking on THE session is confirmed AND paid
//              (amount_aed > 0; cash counts only once cash_paid). No attendance
//              requirement — this deliberately differs from the launch-week
//              script's paid+played rule.
//   ONE EVER — one credit per player for this promo, across cancel-and-rebook
//              cycles. The append-only ledger is the memory: a credit row with
//              this promo's marker means "already used", whether or not it was
//              later reversed. Rebooking after a reversal re-credits nothing.
//   CLAWBACK — when a credited player no longer holds any confirmed+paid
//              booking on the session (cancelled/refunded), reverse the credit.
//              Floor at the wallet: deduct min(15, balance), log any shortfall
//              in the reversal row — a promo reversal never drives a balance
//              negative (mirrors the referral clawback policy).
//   STACKING — approved: Silicon Oasis launch-week credit holders still qualify.
//
// MONEY PATH: applyWalletDelta only (balance + append-only ledger row on one
// transaction handle), type 'adjustment' — the same sanctioned shape as the
// launch-week credit and merge adjustments. The player row is locked FOR UPDATE
// before the marker check so a double-fire (webhook + confirm poll racing)
// serialises instead of double-crediting.
import { pool, db } from "./db";
import { sql } from "drizzle-orm";
import { applyWalletDelta } from "./walletLedger";

export const DUBAILAND_PROMO_SESSION_ID = "e689b399-4b15-4d54-9399-f58dbbee7dc9";
export const DUBAILAND_PROMO_CREDIT_FILS = 1500;

/** Ledger description = finance trace = idempotency key (same convention as the
 *  launch-week script). The reversal row may append a shortfall note, so its
 *  lookups match on prefix. */
export const DUBAILAND_PROMO_CREDIT_MARKER = `Dubailand promo · session ${DUBAILAND_PROMO_SESSION_ID}`;
export const DUBAILAND_PROMO_REVERSAL_MARKER = `Dubailand promo reversal · session ${DUBAILAND_PROMO_SESSION_ID}`;

/** Paid, by the house definition (the collected-revenue predicate): Ziina and
 *  wallet money is banked at confirmation; cash counts only once marked paid. */
export function isPaidBooking(b: { paymentMethod: string; cashPaid: boolean }): boolean {
  return b.paymentMethod === "ziina" || b.paymentMethod === "wallet" || (b.paymentMethod === "cash" && b.cashPaid);
}

/** Clawback floor split — pure, mirrors computeClawbackSplit's policy. */
export function computeReversalSplit(balanceFils: number): { deductFils: number; shortfallFils: number } {
  const deductFils = Math.min(Math.max(balanceFils, 0), DUBAILAND_PROMO_CREDIT_FILS);
  return { deductFils, shortfallFils: DUBAILAND_PROMO_CREDIT_FILS - deductFils };
}

interface Resolved { playerId: string; bookingId: string | null }

/** The player behind a marketplace user, plus their qualifying booking on THE
 *  session (confirmed + amount>0 + paid), if any. Everything is scoped to the
 *  single pinned session id — no other session can ever match. */
async function resolve(userId: string): Promise<Resolved | null> {
  const { rows } = await pool.query(
    `SELECT mu.linked_player_id AS "playerId",
            (SELECT b.id FROM bookings b
              WHERE b.user_id = mu.id
                AND b.session_id = $2
                AND b.status = 'confirmed'
                AND b.amount_aed > 0
                AND (b.payment_method IN ('ziina','wallet')
                     OR (b.payment_method = 'cash' AND b.cash_paid))
              ORDER BY b.created_at LIMIT 1) AS "bookingId"
     FROM marketplace_users mu WHERE mu.id = $1 AND mu.linked_player_id IS NOT NULL`,
    [userId, DUBAILAND_PROMO_SESSION_ID],
  );
  if (rows.length === 0) return null;
  return { playerId: rows[0].playerId, bookingId: rows[0].bookingId ?? null };
}

/** Credit — idempotent for life. Returns what happened, for the log line. */
export async function applyDubailandPromo(userId: string): Promise<"credited" | "already_used" | "not_eligible"> {
  const r = await resolve(userId);
  if (!r || !r.bookingId) return "not_eligible";
  return db.transaction(async (tx) => {
    // Lock the player row FIRST so a concurrent confirm serialises here, then
    // check the lifetime marker under that lock.
    await tx.execute(sql`SELECT id FROM players WHERE id = ${r.playerId} FOR UPDATE`);
    const seen = await tx.execute(
      sql`SELECT 1 FROM wallet_transactions WHERE player_id = ${r.playerId} AND description = ${DUBAILAND_PROMO_CREDIT_MARKER} LIMIT 1`,
    );
    if ((seen.rows as unknown[]).length > 0) return "already_used" as const;
    const res = await applyWalletDelta(tx, {
      playerId: r.playerId,
      deltaFils: DUBAILAND_PROMO_CREDIT_FILS,
      type: "adjustment",
      relatedBookingId: r.bookingId,
      description: DUBAILAND_PROMO_CREDIT_MARKER,
      createdBy: "system",
    });
    if (!res) throw new Error(`applyWalletDelta refused promo credit for player ${r.playerId}`);
    return "credited" as const;
  });
}

/** Clawback — fires only when a credited player holds NO qualifying booking any
 *  more (the recount pattern: cancel of a dupe row while another confirmed
 *  booking survives reverses nothing). Floored, never negative, exactly once. */
export async function reverseDubailandPromo(userId: string): Promise<"reversed" | "reversed_short" | "unchanged"> {
  const r = await resolve(userId);
  if (!r) return "unchanged";
  if (r.bookingId) return "unchanged"; // still holds a qualifying booking — keep the credit
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id, wallet_balance FROM players WHERE id = ${r.playerId} FOR UPDATE`);
    const hist = await tx.execute(sql`
      SELECT bool_or(description = ${DUBAILAND_PROMO_CREDIT_MARKER}) AS credited,
             bool_or(description LIKE ${DUBAILAND_PROMO_REVERSAL_MARKER + "%"}) AS reversed
      FROM wallet_transactions WHERE player_id = ${r.playerId}`);
    const h = (hist.rows as Array<{ credited: boolean | null; reversed: boolean | null }>)[0];
    if (!h?.credited || h?.reversed) return "unchanged" as const;
    const bal = await tx.execute(sql`SELECT wallet_balance FROM players WHERE id = ${r.playerId}`);
    const balance = Number((bal.rows as Array<{ wallet_balance: number }>)[0].wallet_balance);
    const { deductFils, shortfallFils } = computeReversalSplit(balance);
    // The reversal row is ALWAYS written (delta may be 0) — its existence is the
    // exactly-once guarantee, and the shortfall lives in its description.
    const res = await applyWalletDelta(tx, {
      playerId: r.playerId,
      deltaFils: -deductFils,
      type: "adjustment",
      description: shortfallFils > 0
        ? `${DUBAILAND_PROMO_REVERSAL_MARKER} (shortfall ${shortfallFils} fils)`
        : DUBAILAND_PROMO_REVERSAL_MARKER,
      createdBy: "system",
    });
    if (!res) throw new Error(`applyWalletDelta refused promo reversal for player ${r.playerId}`);
    return shortfallFils > 0 ? "reversed_short" : "reversed";
  });
}

/** Session-wide reversal sweep — for the admin cancel-event path, where every
 *  booking on the session dies at once and per-user hooks don't fire. */
export async function sweepDubailandPromoReversals(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT DISTINCT b.user_id FROM bookings b
      JOIN marketplace_users mu ON mu.id = b.user_id
      JOIN wallet_transactions wt ON wt.player_id = mu.linked_player_id
     WHERE b.session_id = $1 AND wt.description = $2`,
    [DUBAILAND_PROMO_SESSION_ID, DUBAILAND_PROMO_CREDIT_MARKER],
  );
  let reversed = 0;
  for (const row of rows as Array<{ user_id: string }>) {
    const out = await reverseDubailandPromo(row.user_id);
    if (out !== "unchanged") reversed += 1;
  }
  return reversed;
}
