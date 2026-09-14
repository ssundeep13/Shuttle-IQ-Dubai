// Gate 0 (IQ Pass prerequisite) — the single predicate for "this booking has
// been paid": a completed payments row that has not been refunded. Shared by
// the webhook race branch, every waitlist-promotion site and initiate-payment
// so they can never disagree about whether money is already on file.
export type PaymentLike = { status: string; refundStatus?: string | null };

export function hasCompletedPayment(payments: PaymentLike[]): boolean {
  return payments.some((p) => p.status === 'completed' && p.refundStatus !== 'completed');
}
