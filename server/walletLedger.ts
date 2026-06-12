// Wallet ledger core (Layer 1). One entry point — applyWalletDelta — performs
// the balance mutation AND its append-only ledger row on the SAME transaction
// handle, fixing the audit P1 "wallet writes aren't transactional" gap at every
// inventory site. The UPDATE … RETURNING gives a row-lock-serialised
// balance_after, so two concurrent debits can never both read the same starting
// balance. Pure decision helpers live alongside for unit tests.
import { randomUUID } from "crypto";
import { sql, eq, and } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./db";
import { players, walletTransactions, type WalletTransactionType } from "@shared/schema";

// Either the root db or a Drizzle transaction handle — every site passes the
// handle it is already inside, or wraps itself in db.transaction.
export type DbOrTx = typeof db | PgTransaction<any, any, any>;

// ── Pure helpers (unit-tested in tests/wallet-ledger.test.ts) ───────────────

// Debit guard: a delta may apply unless it would take the balance negative.
// NOTHING may drive a balance below zero (DB CHECK constraint backs this);
// clawbacks floor at 0 via computeClawbackSplit + applyClawbackWithFloor.
export function canApplyDelta(balanceFils: number, deltaFils: number): boolean {
  if (deltaFils >= 0) return true;
  return balanceFils + deltaFils >= 0;
}

// Clawback floor-at-0 split: how much of a clawback is actually recoverable
// from the wallet (debit) and how much must be written off (shortfall).
// Defensive: a (legacy) negative balance recovers nothing — everything is
// shortfall; a clawback never credits.
export function computeClawbackSplit(balanceFils: number, clawbackFils: number): { debit: number; shortfall: number } {
  const debit = Math.min(Math.max(balanceFils, 0), Math.max(clawbackFils, 0));
  return { debit, shortfall: Math.max(clawbackFils, 0) - debit };
}

// Checkout application: how much wallet applies to an amount, and the remainder.
// (Mirrors deductWalletForBooking's existing math exactly.)
export function computeWalletApplication(balanceFils: number, amountFils: number): { applied: number; remaining: number } {
  const applied = Math.max(0, Math.min(balanceFils, amountFils));
  return { applied, remaining: amountFils - applied };
}

// Reconciliation predicate: a player's ledger replays to their balance.
export function ledgerMatchesBalance(entries: { amountFils: number }[], balanceFils: number): boolean {
  return entries.reduce((sum, e) => sum + e.amountFils, 0) === balanceFils;
}

// ── The atomic write ────────────────────────────────────────────────────────

export interface WalletDeltaOpts {
  playerId: string;
  deltaFils: number; // signed: + credit / − debit
  type: WalletTransactionType;
  relatedBookingId?: string | null;
  relatedReferralId?: string | null;
  description?: string | null;
  createdBy?: string; // 'system' | 'player' | admin user id
}

// Applies the delta and writes the ledger row on the SAME handle. Returns the
// post-write balance, or null when the guard refused (insufficient balance for
// a non-negative-enforced debit, or unknown player). Callers that were already
// guarding with `WHERE wallet_balance >= x` keep identical semantics via the
// guard built into this UPDATE.
export async function applyWalletDelta(
  dbh: DbOrTx,
  opts: WalletDeltaOpts,
): Promise<{ balanceAfterFils: number } | null> {
  const guard = opts.deltaFils < 0
    ? and(eq(players.id, opts.playerId), sql`${players.walletBalance} + ${opts.deltaFils} >= 0`)
    : eq(players.id, opts.playerId);

  const [updated] = await dbh
    .update(players)
    .set({ walletBalance: sql`${players.walletBalance} + ${opts.deltaFils}` })
    .where(guard)
    .returning({ walletBalance: players.walletBalance });
  if (!updated) return null;

  await dbh.insert(walletTransactions).values({
    id: randomUUID(),
    playerId: opts.playerId,
    amountFils: opts.deltaFils,
    balanceAfterFils: updated.walletBalance,
    type: opts.type,
    relatedBookingId: opts.relatedBookingId ?? null,
    relatedReferralId: opts.relatedReferralId ?? null,
    description: opts.description ?? null,
    createdBy: opts.createdBy ?? "system",
  });

  return { balanceAfterFils: updated.walletBalance };
}

// Clawback with floor-at-0 (policy decided 2026-06-13): debit only what the
// wallet holds; the unrecoverable remainder is written off. The ledger tells
// the FULL story as a replay-consistent pair in the same transaction:
//   row 1  referral_clawback  −clawbackFils       (the full reversal attempted)
//   row 2  adjustment         +shortfall          (the write-off forgiving it)
// Net ledger movement = −debit, exactly matching the single balance UPDATE, so
// ledger-sum == balance and per-row replay (prev + amount = balance_after)
// both hold. No shortfall → only row 1 is written (amount = −debit = −clawback).
export async function applyClawbackWithFloor(
  dbh: DbOrTx,
  opts: {
    playerId: string;
    clawbackFils: number;
    relatedReferralId: string;
    description?: string;
  },
): Promise<{ recoveredFils: number; shortfallFils: number }> {
  // One row-locked UPDATE that returns both old and new balance; recovers only
  // from the non-negative part of the balance (defensive for legacy negatives).
  const result = await dbh.execute(sql`
    UPDATE ${players} SET wallet_balance = ${players.walletBalance} - LEAST(GREATEST(${players.walletBalance}, 0), ${opts.clawbackFils})
    FROM (SELECT id AS lock_id, wallet_balance AS old_bal FROM ${players} WHERE id = ${opts.playerId} FOR UPDATE) locked
    WHERE ${players.id} = locked.lock_id
    RETURNING ${players.walletBalance} AS new_bal, locked.old_bal
  `);
  const row = (result.rows as any[])[0];
  if (!row) return { recoveredFils: 0, shortfallFils: opts.clawbackFils };
  const newBal = Number(row.new_bal);
  const oldBal = Number(row.old_bal);
  const recovered = oldBal - newBal;
  const shortfall = opts.clawbackFils - recovered;

  await dbh.insert(walletTransactions).values({
    id: randomUUID(),
    playerId: opts.playerId,
    amountFils: -opts.clawbackFils,
    balanceAfterFils: newBal - shortfall, // replay-consistent intermediate
    type: "referral_clawback",
    relatedReferralId: opts.relatedReferralId,
    description: opts.description ?? "Referral reward reversed (clawback)",
    createdBy: "system",
  });
  if (shortfall > 0) {
    await dbh.insert(walletTransactions).values({
      id: randomUUID(),
      playerId: opts.playerId,
      amountFils: shortfall,
      balanceAfterFils: newBal,
      type: "adjustment",
      relatedReferralId: opts.relatedReferralId,
      description: "referral clawback shortfall write-off",
      createdBy: "system",
    });
  }
  return { recoveredFils: recovered, shortfallFils: shortfall };
}
