import { describe, it, expect } from "vitest";
import { resolveUseWallet, walletCallout } from "../shared/utils/walletUtils";

describe("resolveUseWallet (Layer 2a opt-OUT default — client-side only)", () => {
  it("defaults ON when the player has credit and hasn't touched the switch", () => {
    expect(resolveUseWallet(null, 9800)).toBe(true);
  });

  it("defaults OFF with zero (or negative-legacy) balance", () => {
    expect(resolveUseWallet(null, 0)).toBe(false);
    expect(resolveUseWallet(null, -1)).toBe(false);
  });

  it("async-load trap: default flips ON the moment the balance arrives", () => {
    // Before the wallet query resolves the balance reads 0 → OFF; once it
    // loads, the same untouched override derives ON.
    expect(resolveUseWallet(null, 0)).toBe(false);
    expect(resolveUseWallet(null, 9800)).toBe(true);
  });

  it("an explicit opt-OUT always wins over credit", () => {
    expect(resolveUseWallet(false, 9800)).toBe(false);
  });

  it("an explicit opt-IN wins even if balance later reads 0 (server re-caps anyway)", () => {
    expect(resolveUseWallet(true, 0)).toBe(true);
  });
});

describe("walletCallout (display math — server recomputes at submit)", () => {
  it("partial credit: applied caps at the balance, remainder is paid", () => {
    expect(walletCallout(5000, 9800)).toEqual({ appliedFils: 5000, payFils: 4800, coversAll: false });
  });

  it("full cover: pay 0, coversAll", () => {
    expect(walletCallout(9800, 9800)).toEqual({ appliedFils: 9800, payFils: 0, coversAll: true });
    expect(walletCallout(20000, 9800)).toEqual({ appliedFils: 9800, payFils: 0, coversAll: true });
  });

  it("zero balance applies nothing", () => {
    expect(walletCallout(0, 9800)).toEqual({ appliedFils: 0, payFils: 9800, coversAll: false });
  });

  it("free booking (birthday zero total) is never reported as wallet-covered", () => {
    expect(walletCallout(9800, 0)).toEqual({ appliedFils: 0, payFils: 0, coversAll: false });
  });

  it("stale display race: balance emptied between load and submit — the callout with the fresh balance shows full price", () => {
    // The server is authoritative (it recomputes min(balance, total) at submit
    // and falls through to a full Ziina intent); the client mirrors that once
    // the wallet query refetches.
    expect(walletCallout(0, 9800).payFils).toBe(9800);
  });
});
