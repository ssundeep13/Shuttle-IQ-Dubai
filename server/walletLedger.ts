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

// Debit guard: a delta may apply unless it would take the balance negative and
// negative is not allowed for this event type. (referral_clawback allows
// negative by existing design — a future top-up absorbs it.)
export function canApplyDelta(balanceFils: number, deltaFils: number, allowNegative: boolean): boolean {
  if (deltaFils >= 0) return true;
  if (allowNegative) return true;
  return balanceFils + deltaFils >= 0;
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
  allowNegative?: boolean; // referral_clawback only
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
  const guard = opts.deltaFils < 0 && !opts.allowNegative
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
