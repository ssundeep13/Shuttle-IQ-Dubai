// THE single rule for "was this booking's money collected?" (IQ Pass Gate 3,
// amendment 1). Every revenue reader — the portal's session profit, the public
// analytics, the admin finance summary — classifies through here; none of them
// may spell out a payment method again. Pure, no DB.
//
//   collected   ziina | bank_transfer | iq_pass (a pack seat at its per-seat
//               allocation — the pack's single payment is already in the bank)
//               | cash that has been marked paid
//   wallet      paid with wallet credit (money already collected when the credit
//               was issued — reported, never added to collected)
//   unpaid_cash cash not yet received (flagged, excluded from both bases)
//   excluded    anything else (unknown / comp / legacy values) — counted nowhere
export type RevenueTender = { paymentMethod: string; cashPaid: boolean };
export type RevenueBucket = 'collected' | 'wallet' | 'unpaid_cash' | 'excluded';

export const COLLECTED_METHODS = ['ziina', 'bank_transfer', 'iq_pass'] as const;
/** The public analytics "card" bucket — electronic drop-in money. Packs report separately. */
export const CARD_METHODS = ['ziina', 'bank_transfer'] as const;

export function classifyRevenue(b: RevenueTender): RevenueBucket {
  if ((COLLECTED_METHODS as readonly string[]).includes(b.paymentMethod)) return 'collected';
  if (b.paymentMethod === 'cash') return b.cashPaid ? 'collected' : 'unpaid_cash';
  if (b.paymentMethod === 'wallet') return 'wallet';
  return 'excluded';
}

export const isCollected = (b: RevenueTender): boolean => classifyRevenue(b) === 'collected';
export const isUnpaidCash = (b: RevenueTender): boolean => classifyRevenue(b) === 'unpaid_cash';
export const isCardTender = (b: RevenueTender): boolean => (CARD_METHODS as readonly string[]).includes(b.paymentMethod);
export const isIqPassTender = (b: RevenueTender): boolean => b.paymentMethod === 'iq_pass';
