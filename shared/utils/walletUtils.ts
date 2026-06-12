// Wallet checkout defaults (Layer 2a) — CLIENT-SIDE ONLY policy.
// The server contract is untouched: wallet applies only when the request
// explicitly sends applyWallet=true, so stale client bundles keep their old
// behaviour bit-for-bit. These helpers are unit-tested in
// tests/wallet-checkout-default.test.ts.

// Opt-OUT default: the "Use wallet credit" switch is ON whenever the player
// has credit, unless they explicitly toggled it (override). `override` is null
// until the player touches the switch — which also solves the async-load trap:
// the balance arrives after mount, so a static useState(true) default would
// evaluate before the balance is known. Deriving from (override ?? balance>0)
// makes the default flip on the moment credit loads, while any explicit player
// choice always wins.
export function resolveUseWallet(override: boolean | null, balanceFils: number): boolean {
  if (override !== null) return override;
  return balanceFils > 0;
}

// Callout math: what the player is told. applied = min(balance, total),
// pay = remainder (never negative). Pure mirror of the server's
// computeWalletApplication — display only; the server recomputes at submit.
export function walletCallout(balanceFils: number, totalFils: number): {
  appliedFils: number;
  payFils: number;
  coversAll: boolean;
} {
  const appliedFils = Math.max(0, Math.min(balanceFils, totalFils));
  const payFils = Math.max(0, totalFils - appliedFils);
  return { appliedFils, payFils, coversAll: totalFils > 0 && payFils === 0 };
}
