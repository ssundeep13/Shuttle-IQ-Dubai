import { describe, it, expect } from "vitest";
import {
  canApplyDelta,
  computeWalletApplication,
  ledgerMatchesBalance,
} from "../server/walletLedger";

// The pure decision layer of the wallet ledger. The SQL in applyWalletDelta is
// the 1:1 DB translation of these predicates (guarded UPDATE … RETURNING);
// true concurrency is enforced by the row lock, which a unit test cannot
// exercise — these specs lock the guard SEMANTICS the SQL implements.

describe("canApplyDelta (debit guard)", () => {
  it("credits always apply", () => {
    expect(canApplyDelta(0, 500, false)).toBe(true);
    expect(canApplyDelta(-100, 500, true)).toBe(true);
  });

  it("debit within balance applies", () => {
    expect(canApplyDelta(9800, -9800, false)).toBe(true); // exact drain to 0
    expect(canApplyDelta(9800, -100, false)).toBe(true);
  });

  it("insufficient-balance debit is REJECTED", () => {
    expect(canApplyDelta(9800, -9801, false)).toBe(false);
    expect(canApplyDelta(0, -1, false)).toBe(false);
  });

  it("clawback (allowNegative) may take the balance below zero — existing design", () => {
    expect(canApplyDelta(500, -1500, true)).toBe(true);
  });

  it("concurrent-debit correctness: after one debit drains the balance, the second's guard must fail", () => {
    // Two requests both computed a full-balance debit from the same read.
    // The row lock serialises them: the first applies, then the second is
    // re-evaluated against the NEW balance and must be refused.
    const start = 9800;
    const debit = -9800;
    expect(canApplyDelta(start, debit, false)).toBe(true); // first wins
    const afterFirst = start + debit; // 0
    expect(canApplyDelta(afterFirst, debit, false)).toBe(false); // second refused
  });
});

describe("computeWalletApplication (checkout math)", () => {
  it("caps the application at the balance", () => {
    expect(computeWalletApplication(5000, 9800)).toEqual({ applied: 5000, remaining: 4800 });
  });
  it("caps the application at the amount", () => {
    expect(computeWalletApplication(9800, 4900)).toEqual({ applied: 4900, remaining: 0 });
  });
  it("zero balance applies nothing", () => {
    expect(computeWalletApplication(0, 9800)).toEqual({ applied: 0, remaining: 9800 });
  });
  it("negative balance (post-clawback) applies nothing", () => {
    expect(computeWalletApplication(-500, 9800)).toEqual({ applied: 0, remaining: 9800 });
  });
});

describe("ledgerMatchesBalance (reconciliation predicate)", () => {
  it("ledger sum equals balance → clean", () => {
    const entries = [
      { amountFils: 9800 },  // balance_import
      { amountFils: -4900 }, // booking_payment
      { amountFils: 1500 },  // referral_reward
    ];
    expect(ledgerMatchesBalance(entries, 6400)).toBe(true);
  });

  it("drifted balance → mismatch flagged", () => {
    expect(ledgerMatchesBalance([{ amountFils: 9800 }], 9700)).toBe(false);
  });

  it("no entries: only a zero balance is clean", () => {
    expect(ledgerMatchesBalance([], 0)).toBe(true);
    expect(ledgerMatchesBalance([], 9800)).toBe(false); // un-imported balance
  });

  it("credit then full debit then credit replays to the balance", () => {
    const entries = [
      { amountFils: 9800 },
      { amountFils: -9800 },
      { amountFils: 1500 },
    ];
    expect(ledgerMatchesBalance(entries, 1500)).toBe(true);
  });
});
