// IQ Pass — moves and re-picks. A seat moves in ONE step (new seat inserted,
// old seat cancelled, same transaction) until 5 hours before the session it
// is leaving (ruling E3a); a free re-pick spends a credit granted when
// ShuttleIQ cancelled a picked session. Targets come from the same rolling
// 4-week calendar the player sees; the 50% pack cap is purchase-time only.
// Orchestration over injected deps; the transactions live in store.ts.
import type { Booking, Pack } from "@shared/schema";
import { storage } from "../storage";
import { promoteWaitlistForFreedSpots } from "../guestSlotRefund";
import { IQ_PASS_TIERS, canMoveSeat, todayDubai, windowFor, isPackTier, type PackTier } from "./rules";
import { iqPassStore, PickConflictError, type MoveSession } from "./store";

export type MoveDeps = {
  now(): Date;
  getBooking(id: string): Promise<Booking | undefined>;
  getPack(id: string): Promise<Pack | undefined>;
  getSessionForMove(id: string): Promise<MoveSession | undefined>;
  hasActiveGuests(bookingId: string): Promise<boolean>;
  getUser(userId: string): Promise<{ id: string; name: string; email: string } | undefined>;
  moveSeatTx(input: { source: Booking; toSessionId: string; user: { name: string; email: string | null }; tier: PackTier; now: Date }): Promise<{ newBookingId: string }>;
  repickSeatTx(input: { pack: Pack; toSessionId: string; user: { name: string; email: string | null }; tier: PackTier; now: Date }): Promise<{ newBookingId: string }>;
  promote(sessionId: string, maxPromotions: number): Promise<number>;
  notify(input: { userId: string; type: string; title: string; message: string; relatedBookingId?: string }): Promise<unknown>;
};

export const defaultMoveDeps: MoveDeps = {
  now: () => new Date(),
  getBooking: (id) => storage.getBooking(id),
  getPack: (id) => iqPassStore.getPack(id),
  getSessionForMove: (id) => iqPassStore.getSessionForMove(id),
  hasActiveGuests: (bookingId) => iqPassStore.hasActiveGuests(bookingId),
  getUser: (userId) => iqPassStore.getUser(userId),
  moveSeatTx: (input) => iqPassStore.moveSeatTx(input),
  repickSeatTx: (input) => iqPassStore.repickSeatTx(input),
  promote: (sessionId, max) => promoteWaitlistForFreedSpots(sessionId, max),
  notify: (input) => storage.createMarketplaceNotification(input),
};

export type MoveResult = { ok: true; newBookingId: string } | { ok: false; status: 400 | 403 | 404 | 409; error: string };
const err = (status: 400 | 403 | 404 | 409, error: string): MoveResult => ({ ok: false, status, error });

/** Target session rules shared by move and re-pick: upcoming + linked, inside the rolling 4-week window from today, at least one free spot. */
async function checkTarget(toSessionId: string, deps: MoveDeps): Promise<{ ok: true; target: MoveSession } | MoveResult> {
  const target = await deps.getSessionForMove(toSessionId);
  if (!target) return err(404, 'session_not_found');
  if (target.status !== 'upcoming' || !target.linked) return err(400, 'session_unavailable');
  const window = windowFor(todayDubai(deps.now()), null);
  if (target.dateDubai < window.start || target.dateDubai > window.end) return err(400, 'out_of_window');
  if (target.spotsRemaining < 1) return err(409, 'session_full');
  return { ok: true, target };
}

export async function moveSeat(input: { userId: string; bookingId: string; toSessionId: string }, deps: MoveDeps = defaultMoveDeps): Promise<MoveResult> {
  const source = await deps.getBooking(input.bookingId);
  if (!source) return err(404, 'booking_not_found');
  if (source.userId !== input.userId) return err(403, 'not_owner');
  if (!source.packId) return err(400, 'not_pack_seat');
  if (source.status !== 'confirmed') return err(409, 'seat_not_confirmed');
  const pack = await deps.getPack(source.packId);
  if (!pack || pack.status !== 'active') return err(409, 'pack_not_active');
  if (input.toSessionId === source.sessionId) return err(400, 'same_session');
  const tier = isPackTier(pack.tier) ? pack.tier : 'club';

  const from = await deps.getSessionForMove(source.sessionId);
  if (from && !canMoveSeat(from.dateDubai, from.startTime, deps.now())) return err(409, 'move_cutoff_passed');
  if (await deps.hasActiveGuests(source.id)) return err(409, 'move_with_guests');

  const t = await checkTarget(input.toSessionId, deps);
  if (!t.ok) return t;

  const user = await deps.getUser(input.userId);
  if (!user) return err(400, 'user_not_found');
  let moved: { newBookingId: string };
  try {
    moved = await deps.moveSeatTx({ source, toSessionId: input.toSessionId, user: { name: user.name, email: user.email }, tier, now: deps.now() });
  } catch (e) {
    if (e instanceof PickConflictError) return err(e.conflict.status === 400 ? 400 : 409, e.conflict.error);
    throw e;
  }

  try { await deps.promote(source.sessionId, 1); } catch (e) { console.error('[IQ Pass] waitlist promotion after move failed:', e instanceof Error ? e.message : e); }
  try {
    await deps.notify({
      userId: input.userId,
      type: 'iq_pass_moved',
      title: 'Game moved',
      message: `Your IQ Pass game has been moved. See your updated games under My Bookings.`,
      relatedBookingId: moved.newBookingId,
    });
  } catch (e) { console.error('[IQ Pass] move notification failed:', e instanceof Error ? e.message : e); }
  console.log(`[IQ Pass] seat ${source.id} moved to session ${input.toSessionId} as ${moved.newBookingId}`);
  return { ok: true, newBookingId: moved.newBookingId };
}

export async function repickSeat(input: { userId: string; packId: string; toSessionId: string }, deps: MoveDeps = defaultMoveDeps): Promise<MoveResult> {
  const pack = await deps.getPack(input.packId);
  if (!pack) return err(404, 'pack_not_found');
  if (pack.userId !== input.userId) return err(403, 'not_owner');
  if (pack.status !== 'active') return err(409, 'pack_not_active');
  if (pack.repickCredits < 1) return err(409, 'no_repick_credit');
  const tier = isPackTier(pack.tier) ? pack.tier : 'club';

  const t = await checkTarget(input.toSessionId, deps);
  if (!t.ok) return t;

  const user = await deps.getUser(input.userId);
  if (!user) return err(400, 'user_not_found');
  let picked: { newBookingId: string };
  try {
    picked = await deps.repickSeatTx({ pack, toSessionId: input.toSessionId, user: { name: user.name, email: user.email }, tier, now: deps.now() });
  } catch (e) {
    if (e instanceof PickConflictError) return err(e.conflict.status === 400 ? 400 : 409, e.conflict.error);
    throw e;
  }
  try {
    await deps.notify({
      userId: input.userId,
      type: 'iq_pass_repicked',
      title: 'Game re-picked',
      message: `Your free re-pick is booked. See your games under My Bookings.`,
      relatedBookingId: picked.newBookingId,
    });
  } catch (e) { console.error('[IQ Pass] re-pick notification failed:', e instanceof Error ? e.message : e); }
  console.log(`[IQ Pass] pack ${pack.id} re-pick booked as ${picked.newBookingId} (${IQ_PASS_TIERS[tier].label})`);
  return { ok: true, newBookingId: picked.newBookingId };
}
