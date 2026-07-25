// Pure decision helpers for the add-guest money path (batch 2). Extracted so the
// dedup / ceiling / sweep logic is unit-testable in isolation. These encode the
// exact behaviour wired into:
//   - the add-guest route (server/marketplace-routes.ts) — findReusableInflightGuest + canAddGuest
//   - the orphan sweep (server/storage.ts getExpiredAddGuestOrphans) — isSweepableGuestOrphan
//     is the canonical spec; that SQL is its 1:1 DB translation.

export interface GuestLike {
  id: string;
  name: string;
  email: string | null;
  isPrimary: boolean;
  status: string;
  cancellationToken?: string | null;
}

// Case- and whitespace-insensitive normalisation for the dedup key.
export function normGuestKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// Dedup: find an in-flight (non-primary, pending) guest on this booking that
// matches the same name+email — the row to REUSE on retry instead of inserting a
// duplicate (collapses the 3-"Shiela" case to one row).
export function findReusableInflightGuest<T extends GuestLike>(
  guests: T[],
  guestName: string,
  guestEmail: string | null | undefined,
): T | undefined {
  return guests.find(
    (g) =>
      !g.isPrimary &&
      g.status === "pending" &&
      normGuestKey(g.name) === normGuestKey(guestName) &&
      normGuestKey(g.email) === normGuestKey(guestEmail),
  );
}

// Ceiling: may we proceed with this add-guest? Reusing a duplicate is always
// allowed (it adds no new row/spot); a NEW distinct guest is blocked once the
// in-flight pending count has reached the per-booking cap.
export function canAddGuest(opts: {
  inflightCount: number;
  isDuplicate: boolean;
  max: number;
}): boolean {
  if (opts.isDuplicate) return true;
  return opts.inflightCount < opts.max;
}

// Capacity (Gate G1): does the session's provisional-spot reservation block
// this add-guest? Every in-flight pending guest on the session reserves one
// spot — but the reservation belonging to THIS request's own reusable row
// must not block its retry (the 10:35/10:39 incident: the first attempt
// reserved the last spot, then the retry was refused by the very spot held
// for it, and the reuse path downstream never ran).
export function capacityBlocksGuestAdd(opts: {
  spotsRemaining: number;
  sessionInflight: number;
  reusesOwnRow: boolean;
}): boolean {
  const reserved = opts.sessionInflight - (opts.reusesOwnRow ? 1 : 0);
  return opts.spotsRemaining - reserved < 1;
}

// Sweep predicate (canonical spec): is this pending guest a sweepable add-guest
// orphan? True only for a non-primary, still-pending slot that has a Ziina intent
// which never produced a completed payment, on a non-cancelled parent booking,
// whose window has elapsed. getExpiredAddGuestOrphans' SQL mirrors this exactly.
export function isSweepableGuestOrphan(
  guest: {
    isPrimary: boolean;
    status: string;
    pendingPaymentIntentId: string | null;
    createdAt: Date;
  },
  ctx: {
    parentBookingStatus: string;
    hasCompletedPayment: boolean;
    nowMs: number;
    windowMs: number;
  },
): boolean {
  if (guest.isPrimary) return false;
  if (guest.status !== "pending") return false;
  if (!guest.pendingPaymentIntentId) return false;
  if (ctx.parentBookingStatus === "cancelled") return false;
  if (ctx.hasCompletedPayment) return false;
  const ageMs = ctx.nowMs - guest.createdAt.getTime();
  return ageMs > ctx.windowMs;
}
