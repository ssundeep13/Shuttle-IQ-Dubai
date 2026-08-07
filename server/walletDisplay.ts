// Player-facing labels for wallet ledger rows. Same principle as tier display
// names: raw enums and machine-flavoured descriptions NEVER leave the server —
// every row gets a human label here, and anything unrecognised (including
// future types) falls back to a clean generic, never the raw value.
//
// The ledger's 'adjustment' type is the grab-bag (promos, merges, write-offs),
// so it maps by description prefix; every other type maps by the enum alone.

export function walletDisplayLabel(type: string, description: string | null): string {
  const d = description ?? "";
  if (type === "adjustment") {
    if (d.startsWith("Dubailand promo reversal")) return "Credit reversed — booking cancelled";
    if (d.startsWith("Dubailand promo")) return "Dubailand promo credit";
    if (d.startsWith("launch week credit")) return "Launch week credit";
    return "Wallet adjustment";
  }
  switch (type) {
    case "booking_payment": return "Applied at checkout";
    case "booking_credit_return": return "Credit returned — booking cancelled";
    case "cancellation_refund": return "Refund to wallet";
    case "event_cancel_refund": return "Refund — session cancelled";
    case "referral_reward": return "Referral reward";
    case "referral_clawback": return "Referral reward reversed";
    case "signup_credit": return "Signup credit";
    case "balance_import": return "Opening balance";
    default: return "Wallet adjustment";
  }
}
