// IQ Pass — the DB glue. Thin Drizzle queries plus the two transactions the
// product depends on: createHold (row-locked pick validation + hold rows) and
// confirmTx (all seats confirmed together or not at all, one payment row).
// Orchestration lives in purchase.ts / confirm.ts / jobs.ts over an injected
// deps object, so this module is exercised on staging and pinned at source.
import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { packs, bookings, bookingGuests, bookableSessions, payments, marketplaceNotifications, type Pack } from "@shared/schema";
import { IQ_PASS_TIERS, validatePicks, type CalendarSession, type PackTier } from "./rules";

/** Thrown inside createHold when the row-locked re-validation fails (or a unique index fires). */
export class PickConflictError extends Error {
  constructor(public readonly conflict: { status: 400 | 409; error: string; sessionId?: string }) {
    super(conflict.error);
  }
}

export type CalendarRow = CalendarSession & {
  title: string;
  venueName: string;
  venueLocation: string | null;
  startTime: string;
  endTime: string;
  priceAed: number;
};

export type HoldInput = {
  userId: string;
  user: { name: string; email: string | null };
  tier: PackTier;
  sessionIds: string[];
  jerseySize: string | null;
  window: { start: string; end: string };
  holdExpiresAt: Date;
};

export type ConfirmTxResult =
  | { kind: "not_found" }
  | { kind: "already"; pack: Pack }
  | { kind: "hold_gone"; pack: Pack }
  | { kind: "confirmed"; pack: Pack; bookingIds: string[] };

export type SeatSession = {
  bookingId: string;
  sessionId: string;
  status: string;
  session: { title: string; venueName: string; date: Date; startTime: string; endTime: string };
};

// bookable_sessions.date is the Dubai calendar day stored as UTC midnight; take
// the Y-M-D in SQL so node-pg's local-time parsing never shifts it (see memory:
// naive-UTC columns read 4h early on the Dubai box).
const dateYmd = sql<string>`to_char(${bookableSessions.date}, 'YYYY-MM-DD')`;
const HELD = sql`${bookings.status} IN ('confirmed', 'attended', 'pending_payment')`;

export const iqPassStore = {
  async getPack(id: string): Promise<Pack | undefined> {
    const [p] = await db.select().from(packs).where(eq(packs.id, id));
    return p;
  },

  async getPackByIntent(intentId: string): Promise<Pack | undefined> {
    const [p] = await db.select().from(packs).where(eq(packs.ziinaPaymentIntentId, intentId));
    return p;
  },

  async getPacksForUser(userId: string): Promise<Pack[]> {
    return db.select().from(packs).where(eq(packs.userId, userId)).orderBy(desc(packs.createdAt));
  },

  /** 'YYYY-MM-DD' of the latest non-cancelled seat on the pack, or null. */
  async getLastPickedGameDate(packId: string): Promise<string | null> {
    const [r] = await db
      .select({ d: sql<string | null>`to_char(max(${bookableSessions.date}), 'YYYY-MM-DD')` })
      .from(bookings)
      .innerJoin(bookableSessions, eq(bookableSessions.id, bookings.sessionId))
      .where(and(eq(bookings.packId, packId), sql`${bookings.status} <> 'cancelled'`));
    return r?.d ?? null;
  },

  /** Bounded, linked-only, one aggregate per session — never the unbounded upcoming list. */
  async listCalendarSessions(start: string, end: string): Promise<CalendarRow[]> {
    const rows = await db
      .select({
        id: bookableSessions.id,
        title: bookableSessions.title,
        venueName: bookableSessions.venueName,
        venueLocation: bookableSessions.venueLocation,
        dateDubai: dateYmd,
        startTime: bookableSessions.startTime,
        endTime: bookableSessions.endTime,
        status: bookableSessions.status,
        linked: sql<boolean>`${bookableSessions.linkedSessionId} IS NOT NULL`,
        capacity: bookableSessions.capacity,
        priceAed: bookableSessions.priceAed,
        taken: sql<number>`(SELECT coalesce(sum(b.spots_booked), 0)::int FROM bookings b WHERE b.session_id = ${bookableSessions.id} AND b.status IN ('confirmed', 'attended', 'pending_payment'))`,
        packSeats: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.session_id = ${bookableSessions.id} AND b.pack_id IS NOT NULL AND b.status IN ('confirmed', 'attended', 'pending_payment'))`,
      })
      .from(bookableSessions)
      .where(and(
        isNotNull(bookableSessions.linkedSessionId),
        eq(bookableSessions.status, "upcoming"),
        sql`to_char(${bookableSessions.date}, 'YYYY-MM-DD') >= ${start}`,
        sql`to_char(${bookableSessions.date}, 'YYYY-MM-DD') <= ${end}`,
      ))
      .orderBy(asc(bookableSessions.date), asc(bookableSessions.startTime));
    return rows.map(({ taken, ...r }) => ({ ...r, spotsRemaining: Math.max(0, r.capacity - taken) }));
  },

  async getActiveBookingSessionIdsForUser(userId: string): Promise<Set<string>> {
    const rows = await db
      .select({ sessionId: bookings.sessionId })
      .from(bookings)
      .where(and(eq(bookings.userId, userId), sql`${bookings.status} <> 'cancelled'`));
    return new Set(rows.map((r) => r.sessionId));
  },

  async getUser(userId: string): Promise<{ id: string; name: string; email: string } | undefined> {
    const u = await storage.getMarketplaceUser(userId);
    return u ? { id: u.id, name: u.name, email: u.email } : undefined;
  },

  /**
   * One transaction: lock the picked sessions (deterministic order), recount
   * seats + pack seats under the lock, validate, then insert the pack, its
   * pending_payment seats (allocation as amount, promoted_at NULL so the
   * 4-hour sweep never sees them) and a primary guest slot per seat.
   */
  async createHold(input: HoldInput): Promise<{ packId: string; bookingIds: string[] }> {
    const tier = IQ_PASS_TIERS[input.tier];
    const ids = Array.from(new Set(input.sessionIds)).sort();
    try {
      return await db.transaction(async (tx) => {
        const locked = await tx
          .select({
            id: bookableSessions.id,
            dateDubai: dateYmd,
            status: bookableSessions.status,
            linked: sql<boolean>`${bookableSessions.linkedSessionId} IS NOT NULL`,
            capacity: bookableSessions.capacity,
          })
          .from(bookableSessions)
          .where(inArray(bookableSessions.id, ids))
          .orderBy(asc(bookableSessions.id))
          .for('update');
        const counts = await tx
          .select({
            sessionId: bookings.sessionId,
            taken: sql<number>`coalesce(sum(${bookings.spotsBooked}), 0)::int`,
            packSeats: sql<number>`count(*) FILTER (WHERE ${bookings.packId} IS NOT NULL)::int`,
          })
          .from(bookings)
          .where(and(inArray(bookings.sessionId, ids), HELD))
          .groupBy(bookings.sessionId);
        const mine = await tx
          .select({ sessionId: bookings.sessionId })
          .from(bookings)
          .where(and(eq(bookings.userId, input.userId), inArray(bookings.sessionId, ids), sql`${bookings.status} <> 'cancelled'`));
        const byId = new Map(counts.map((c) => [c.sessionId, c]));
        const sessions: CalendarSession[] = locked.map((r) => ({
          id: r.id,
          dateDubai: r.dateDubai,
          status: r.status,
          linked: r.linked,
          capacity: r.capacity,
          spotsRemaining: Math.max(0, r.capacity - (byId.get(r.id)?.taken ?? 0)),
          packSeats: byId.get(r.id)?.packSeats ?? 0,
        }));
        const v = validatePicks({
          tier: input.tier,
          picks: input.sessionIds,
          window: input.window,
          sessions,
          alreadyBookedSessionIds: new Set(mine.map((m) => m.sessionId)),
        });
        if (!v.ok) throw new PickConflictError(v);

        const packId = randomUUID();
        await tx.insert(packs).values({
          id: packId,
          userId: input.userId,
          tier: input.tier,
          gamesTotal: tier.games,
          priceAed: tier.priceAed,
          status: 'pending_payment',
          windowStart: input.window.start,
          windowEnd: input.window.end,
          holdExpiresAt: input.holdExpiresAt,
          jerseySize: input.jerseySize,
        });
        const bookingIds: string[] = [];
        for (const sessionId of input.sessionIds) {
          const bookingId = randomUUID();
          await tx.insert(bookings).values({
            id: bookingId,
            userId: input.userId,
            sessionId,
            status: 'pending_payment',
            paymentMethod: 'iq_pass',
            amountAed: tier.allocationAed,
            cashPaid: false,
            spotsBooked: 1,
            promotedAt: null,
            walletAmountUsed: 0,
            packId,
          });
          await tx.insert(bookingGuests).values({
            id: randomUUID(),
            bookingId,
            name: input.user.name,
            email: input.user.email,
            isPrimary: true,
            status: 'pending',
            linkedUserId: input.userId,
          });
          bookingIds.push(bookingId);
        }
        return { packId, bookingIds };
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        // unique_active_booking_per_session or uq_packs_one_hold fired under concurrency.
        throw new PickConflictError(
          String(err.constraint ?? '').includes('uq_packs_one_hold')
            ? { status: 409, error: 'hold_in_progress' }
            : { status: 409, error: 'already_booked' },
        );
      }
      throw err;
    }
  },

  async attachIntent(packId: string, intentId: string): Promise<void> {
    await db.update(packs).set({ ziinaPaymentIntentId: intentId }).where(eq(packs.id, packId));
  },

  /** Cancel a hold that is still pending_payment (pack + its seats + guest slots). Returns null if it was not pending. */
  async cancelHold(packId: string, reason: string): Promise<{ sessionIds: string[] } | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx
        .update(packs)
        .set({ status: 'cancelled', cancelledAt: now, cancellationReason: reason })
        .where(and(eq(packs.id, packId), eq(packs.status, 'pending_payment')))
        .returning({ id: packs.id });
      if (claimed.length === 0) return null;
      const seats = await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: now, cancellationReason: `iq_pass_${reason}` })
        .where(and(eq(bookings.packId, packId), eq(bookings.status, 'pending_payment')))
        .returning({ id: bookings.id, sessionId: bookings.sessionId });
      if (seats.length > 0) {
        await tx
          .update(bookingGuests)
          .set({ status: 'cancelled', cancelledAt: now })
          .where(and(inArray(bookingGuests.bookingId, seats.map((s) => s.id)), eq(bookingGuests.status, 'pending')));
      }
      return { sessionIds: seats.map((s) => s.sessionId) };
    });
  },

  /**
   * The atomic confirm. Pack row locked; every held seat flipped in one UPDATE
   * whose RETURNING count must equal games_total (else the transaction
   * throws and nothing is written); guest slots confirmed; pack → active; ONE
   * payments row carrying pack_id and no booking_id. A payment that lands
   * after the hold lapsed is recorded and routed to the Refunds tab instead.
   */
  async confirmTx(intentId: string, now: Date): Promise<ConfirmTxResult> {
    return db.transaction(async (tx) => {
      const [pack] = await tx.select().from(packs).where(eq(packs.ziinaPaymentIntentId, intentId)).for('update');
      if (!pack) return { kind: 'not_found' as const };
      if (pack.status === 'active' || pack.status === 'completed') return { kind: 'already' as const, pack };
      const existing = await tx.select({ id: payments.id }).from(payments).where(eq(payments.ziinaPaymentIntentId, intentId));
      const paymentRow = () => ({
        id: randomUUID(),
        packId: pack.id,
        bookingId: null,
        ziinaPaymentIntentId: intentId,
        amount: pack.priceAed,
        currency: 'aed',
        status: 'completed',
        completedAt: now,
      });
      if (pack.status !== 'pending_payment') {
        if (existing.length === 0) {
          await tx.insert(payments).values(paymentRow());
          await tx.insert(marketplaceNotifications).values({
            id: randomUUID(),
            userId: pack.userId,
            type: 'refund_required',
            title: 'Refund needed — IQ Pass paid after the hold lapsed',
            message: `An IQ Pass payment of AED ${pack.priceAed} completed after its 30-minute hold had expired. The seats were NOT confirmed — refund the payment in the Ziina dashboard (intent ${intentId}).`,
            refundAmountFils: pack.priceAed * 100,
            refundPreference: 'bank',
          });
        }
        return { kind: 'hold_gone' as const, pack };
      }
      const flipped = await tx
        .update(bookings)
        .set({ status: 'confirmed' })
        .where(and(eq(bookings.packId, pack.id), eq(bookings.status, 'pending_payment')))
        .returning({ id: bookings.id });
      if (flipped.length !== pack.gamesTotal) {
        throw new Error(`[IQ Pass] pack ${pack.id}: expected ${pack.gamesTotal} held seats, found ${flipped.length} — rolled back`);
      }
      const ids = flipped.map((f) => f.id);
      await tx
        .update(bookingGuests)
        .set({ status: 'confirmed' })
        .where(and(inArray(bookingGuests.bookingId, ids), eq(bookingGuests.status, 'pending')));
      await tx.update(packs).set({ status: 'active', paidAt: now }).where(eq(packs.id, pack.id));
      if (existing.length === 0) await tx.insert(payments).values(paymentRow());
      return { kind: 'confirmed' as const, pack: { ...pack, status: 'active', paidAt: now }, bookingIds: ids };
    });
  },

  /** Cancel every hold whose 30 minutes are up. Returns the freed sessions per pack. */
  async expireHolds(now: Date): Promise<Array<{ packId: string; userId: string; sessionIds: string[] }>> {
    const lapsed = await db
      .select({ id: packs.id, userId: packs.userId })
      .from(packs)
      .where(and(eq(packs.status, 'pending_payment'), sql`${packs.holdExpiresAt} < ${now}`));
    const out: Array<{ packId: string; userId: string; sessionIds: string[] }> = [];
    for (const p of lapsed) {
      const r = await iqPassStore.cancelHold(p.id, 'hold_expired');
      if (r) out.push({ packId: p.id, userId: p.userId, sessionIds: r.sessionIds });
    }
    return out;
  },

  /** Packs with an intent, no recorded payment, created within the window — pending holds and lapsed ones alike (money must never go invisible). */
  async getPacksPendingReconciliation(withinMs: number): Promise<Pack[]> {
    const cutoff = new Date(Date.now() - withinMs);
    return db
      .select()
      .from(packs)
      .where(and(
        isNotNull(packs.ziinaPaymentIntentId),
        gte(packs.createdAt, cutoff),
        sql`${packs.status} IN ('pending_payment', 'cancelled')`,
        sql`NOT EXISTS (SELECT 1 FROM payments p WHERE p.ziina_payment_intent_id = ${packs.ziinaPaymentIntentId})`,
      ));
  },

  async getPackSeatSessions(packId: string): Promise<SeatSession[]> {
    const rows = await db
      .select({
        bookingId: bookings.id,
        sessionId: bookings.sessionId,
        status: bookings.status,
        title: bookableSessions.title,
        venueName: bookableSessions.venueName,
        date: bookableSessions.date,
        startTime: bookableSessions.startTime,
        endTime: bookableSessions.endTime,
      })
      .from(bookings)
      .innerJoin(bookableSessions, eq(bookableSessions.id, bookings.sessionId))
      .where(and(eq(bookings.packId, packId), sql`${bookings.status} <> 'cancelled'`))
      .orderBy(asc(bookableSessions.date), asc(bookableSessions.startTime));
    return rows.map((r) => ({
      bookingId: r.bookingId,
      sessionId: r.sessionId,
      status: r.status,
      session: { title: r.title, venueName: r.venueName, date: r.date, startTime: r.startTime, endTime: r.endTime },
    }));
  },
};
