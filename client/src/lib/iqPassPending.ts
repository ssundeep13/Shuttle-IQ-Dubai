// IQ Pass — a hold awaiting payment, as one state every surface can render the same way:
//   pending  the 30-minute hold is still live → "Complete payment" (reopens the SAME Ziina intent) + "Hold expires HH:mm"
//   expired  the hold lapsed (not yet swept) or the sweep cancelled it → "Hold expired — pick again" (to the picker)
// Pure functions over the /api/marketplace/iq-pass/me packs list; the Dubai wall clock for the expiry line.

export type PendingPassState =
  | { kind: 'pending'; packId: string; label: string; holdExpiresAt: string }
  | { kind: 'expired'; packId: string; label: string };

export type PackForPending = {
  id: string;
  label: string;
  status: string;
  holdExpiresAt?: string | Date | null;
  cancellationReason?: string | null;
};

/** How long a lapsed hold keeps showing "Hold expired — pick again" before the surfaces go back to the promo. */
export const EXPIRED_NOTICE_MS = 24 * 60 * 60 * 1000;

const ms = (d: string | Date | null | undefined): number => (d ? new Date(d).getTime() : Number.NaN);

/**
 * A live hold wins (there is money and a clock on it, even beside an active pass). Otherwise, with no active pass,
 * the newest pack decides: a lapsed hold or a hold the sweep cancelled (cancellation_reason hold_expired) reads as
 * expired for 24 hours after its expiry; anything else is nothing.
 */
export function pendingPassOf(packs: PackForPending[], now: number = Date.now()): PendingPassState | null {
  const live = packs.find((p) => p.status === 'pending_payment' && ms(p.holdExpiresAt) > now);
  if (live) return { kind: 'pending', packId: live.id, label: live.label, holdExpiresAt: new Date(live.holdExpiresAt as string | Date).toISOString() };
  if (packs.some((p) => p.status === 'active')) return null;
  const newest = [...packs].sort((a, b) => ms(b.holdExpiresAt) - ms(a.holdExpiresAt))[0];
  if (!newest) return null;
  const expiry = ms(newest.holdExpiresAt);
  if (!Number.isFinite(expiry) || expiry > now || now - expiry > EXPIRED_NOTICE_MS) return null;
  const lapsed = newest.status === 'pending_payment';
  const swept = newest.status === 'cancelled' && newest.cancellationReason === 'hold_expired';
  return lapsed || swept ? { kind: 'expired', packId: newest.id, label: newest.label } : null;
}

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "18:31" — the Dubai wall clock, 24-hour. */
export function dubaiTimeHm(at: string | Date): string {
  return hm.format(new Date(at));
}

/** "Hold expires 18:31" */
export function holdExpiresLabel(at: string | Date): string {
  return `Hold expires ${dubaiTimeHm(at)}`;
}
