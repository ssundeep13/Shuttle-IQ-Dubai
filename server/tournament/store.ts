// Tournament registration — the DB glue. Thin Drizzle reads plus the
// transactions the product depends on. EVERY transaction that can change who
// holds a seat takes the same lock first — SELECT … FOR UPDATE on the
// tournaments row — then counts the tier under that lock: registration,
// hold expiry + promotion, confirm (incl. money after expiry) and withdraw.
// That single lock is what keeps a tier from going past its cap when two
// players, a sweep and a webhook land at once. The partial unique indexes
// (one active entry per account and per player, one row per intent) are the
// backstop. Orchestration lives in register.ts / confirm.ts / jobs.ts over
// injected deps; this module is proven against a real Postgres.
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { iqPassStore } from "../iqPass/store";
import { TEST_ACCOUNT_NAME_PREFIXES } from "../playerRoutes";
import {
  tournaments, tournamentRegistrations, payments, marketplaceNotifications, marketplaceUsers, players,
  type Tournament, type TournamentRegistration,
} from "@shared/schema";
import { TOURNAMENT_TIERS, type TournamentTier } from "@shared/tournamentTiers";
import { ACTIVE_REGISTRATION_STATUSES, canPromote, decideRegistration, holdExpiresAt, withdrawOutcome } from "./rules";
import { MEMBER_EXISTS_FOR_U } from "./membership";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Tx | typeof db;

export type Account = { id: string; name: string; email: string; phone: string | null; linkedPlayerId: string | null };
export type TierCounts = Record<TournamentTier, { held: number; waitlisted: number }>;

export type CreateRegistrationInput = {
  tournamentId: string;
  userId: string;
  playerId: string;
  tier: TournamentTier;
  levelAtRegistration: string;
  skillScoreAtRegistration: number;
  tShirtSize: string;
  company: string | null;
  shareWithSponsors: boolean;
  sponsorInterest: boolean;
  amountAed: number;
  now: Date;
  holdExpiresAt: Date;
};
export type CreateRegistrationResult =
  | { kind: 'created' | 'existing'; registration: TournamentRegistration }
  | { kind: 'full' }
  | { kind: 'conflict' };

export type ConfirmTxResult =
  | { kind: 'not_found' }
  | { kind: 'already' | 'confirmed' | 'restored' | 'refund_owed'; registration: TournamentRegistration };

export type WithdrawTxResult =
  | { kind: 'not_found' }
  | { kind: 'not_allowed'; reason: 'after_cutoff' | 'not_active' }
  | { kind: 'withdrawn'; registration: TournamentRegistration; refund: 'pending' | 'not_due' | null; promoted: TournamentRegistration[] };

const ACTIVE = [...ACTIVE_REGISTRATION_STATUSES] as string[];

/** Confirmed + pending_payment of a tier = seats held; waitlisted counted apart. Call under the tournament lock. */
async function countTier(ex: Exec, tournamentId: string, tier: string): Promise<{ held: number; waitlisted: number }> {
  const [row] = await ex
    .select({
      held: sql<number>`count(*) FILTER (WHERE ${tournamentRegistrations.status} IN ('confirmed', 'pending_payment'))::int`,
      waitlisted: sql<number>`count(*) FILTER (WHERE ${tournamentRegistrations.status} = 'waitlisted')::int`,
    })
    .from(tournamentRegistrations)
    .where(and(eq(tournamentRegistrations.tournamentId, tournamentId), eq(tournamentRegistrations.tier, tier)));
  return { held: Number(row?.held ?? 0), waitlisted: Number(row?.waitlisted ?? 0) };
}

const capFor = (t: Tournament, tier: string): number => Number((t.tierCaps as Record<string, number>)[tier] ?? 0);

async function lockTournament(tx: Tx, id: string): Promise<Tournament | undefined> {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for('update');
  return t;
}

/**
 * Offer every free seat of a tier to the waitlist, oldest first (created_at),
 * each with a fresh hold capped at the draft cut-off. Call under the tournament lock.
 */
async function fillFreeSeats(tx: Tx, t: Tournament, tier: string, now: Date): Promise<TournamentRegistration[]> {
  if (!canPromote(now, t.draftCutoffAt)) return [];
  const cap = capFor(t, tier);
  const counts = await countTier(tx, t.id, tier);
  const promoted: TournamentRegistration[] = [];
  while (counts.held < cap && counts.waitlisted > 0) {
    const [next] = await tx
      .select({ id: tournamentRegistrations.id })
      .from(tournamentRegistrations)
      .where(and(eq(tournamentRegistrations.tournamentId, t.id), eq(tournamentRegistrations.tier, tier), eq(tournamentRegistrations.status, 'waitlisted')))
      .orderBy(asc(tournamentRegistrations.createdAt), asc(tournamentRegistrations.id))
      .limit(1);
    if (!next) break;
    const [row] = await tx
      .update(tournamentRegistrations)
      .set({ status: 'pending_payment', promotedAt: now, holdExpiresAt: holdExpiresAt(now, t.holdMinutes, t.draftCutoffAt) })
      .where(and(eq(tournamentRegistrations.id, next.id), eq(tournamentRegistrations.status, 'waitlisted')))
      .returning();
    if (!row) break;
    promoted.push(row);
    counts.held++;
    counts.waitlisted--;
  }
  return promoted;
}

/** Test accounts (the "ZZ-" sandbox rows and TEST PLAYER) never get broadcasts. */
const NOT_TEST_ACCOUNT_FOR_U = sql.join(
  TEST_ACCOUNT_NAME_PREFIXES.map((p) => sql`ltrim(coalesce(u.name, '')) NOT LIKE ${`${p}%`}`),
  sql` AND `,
);

async function queueRefund(tx: Tx, r: TournamentRegistration, why: string, intentId: string | null): Promise<void> {
  const [u] = await tx.select({ name: marketplaceUsers.name }).from(marketplaceUsers).where(eq(marketplaceUsers.id, r.userId));
  await tx.insert(marketplaceNotifications).values({
    id: randomUUID(),
    userId: r.userId,
    type: 'refund_required',
    title: 'Refund needed — ShuttleIQ League entry',
    message: `ShuttleIQ League entry of AED ${r.amountAed} for ${u?.name ?? 'a player'} (${r.tier}): ${why}. Refund it in the Ziina dashboard${intentId ? ` (intent ${intentId})` : ''}.`,
    refundAmountFils: r.amountAed * 100,
    refundPreference: 'bank',
  });
}

export const tournamentStore = {
  /** The event players see: the earliest not-cancelled tournament that has not ended (14-day tail for My games). */
  async getCurrentTournament(): Promise<Tournament | undefined> {
    const [t] = await db
      .select()
      .from(tournaments)
      .where(and(sql`${tournaments.status} <> 'cancelled'`, sql`${tournaments.endsAt} > now() - interval '14 days'`))
      .orderBy(asc(tournaments.startsAt))
      .limit(1);
    return t;
  },

  async getTournament(id: string): Promise<Tournament | undefined> {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return t;
  },

  async getAccount(userId: string): Promise<Account | undefined> {
    const [u] = await db
      .select({ id: marketplaceUsers.id, name: marketplaceUsers.name, email: marketplaceUsers.email, phone: marketplaceUsers.phone, linkedPlayerId: marketplaceUsers.linkedPlayerId })
      .from(marketplaceUsers)
      .where(eq(marketplaceUsers.id, userId));
    return u;
  },

  async getPlayer(playerId: string): Promise<{ id: string; level: string; skillScore: number; phone: string | null } | undefined> {
    const [p] = await db
      .select({ id: players.id, level: players.level, skillScore: players.skillScore, phone: players.phone })
      .from(players)
      .where(eq(players.id, playerId));
    return p;
  },

  async countsByTier(tournamentId: string): Promise<TierCounts> {
    const rows = await db
      .select({
        tier: tournamentRegistrations.tier,
        held: sql<number>`count(*) FILTER (WHERE ${tournamentRegistrations.status} IN ('confirmed', 'pending_payment'))::int`,
        waitlisted: sql<number>`count(*) FILTER (WHERE ${tournamentRegistrations.status} = 'waitlisted')::int`,
      })
      .from(tournamentRegistrations)
      .where(eq(tournamentRegistrations.tournamentId, tournamentId))
      .groupBy(tournamentRegistrations.tier);
    const out = Object.fromEntries(TOURNAMENT_TIERS.map((t) => [t, { held: 0, waitlisted: 0 }])) as TierCounts;
    for (const r of rows) {
      if ((TOURNAMENT_TIERS as readonly string[]).includes(r.tier)) out[r.tier as TournamentTier] = { held: Number(r.held), waitlisted: Number(r.waitlisted) };
    }
    return out;
  },

  async getRegistration(id: string): Promise<TournamentRegistration | undefined> {
    const [r] = await db.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.id, id));
    return r;
  },

  async getRegistrationByIntent(intentId: string): Promise<TournamentRegistration | undefined> {
    const [r] = await db.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.ziinaPaymentIntentId, intentId));
    return r;
  },

  async getActiveRegistrationForUser(tournamentId: string, userId: string): Promise<TournamentRegistration | undefined> {
    const [r] = await db
      .select()
      .from(tournamentRegistrations)
      .where(and(eq(tournamentRegistrations.tournamentId, tournamentId), eq(tournamentRegistrations.userId, userId), inArray(tournamentRegistrations.status, ACTIVE)))
      .limit(1);
    return r;
  },

  /**
   * One transaction: lock the tournament row, return an active entry for this
   * account (or refuse one held by the same player under another account),
   * count the tier under the lock, decide hold / waitlist / full, insert.
   */
  async createRegistration(input: CreateRegistrationInput): Promise<CreateRegistrationResult> {
    try {
      return await db.transaction(async (tx) => {
        const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, input.tournamentId)).for('update');
        if (!t) throw new Error(`[Tournament] tournament ${input.tournamentId} not found`);
        const [existing] = await tx
          .select()
          .from(tournamentRegistrations)
          .where(and(
            eq(tournamentRegistrations.tournamentId, t.id),
            or(eq(tournamentRegistrations.userId, input.userId), eq(tournamentRegistrations.playerId, input.playerId)),
            inArray(tournamentRegistrations.status, ACTIVE),
          ))
          .limit(1);
        if (existing) return existing.userId === input.userId ? { kind: 'existing' as const, registration: existing } : { kind: 'conflict' as const };

        const counts = await countTier(tx, t.id, input.tier);
        const decision = decideRegistration(counts, { cap: capFor(t, input.tier), waitlistCap: t.waitlistCapPerTier });
        if (decision === 'full') return { kind: 'full' as const };

        const [row] = await tx
          .insert(tournamentRegistrations)
          .values({
            id: randomUUID(),
            tournamentId: t.id,
            userId: input.userId,
            playerId: input.playerId,
            tier: input.tier,
            levelAtRegistration: input.levelAtRegistration,
            skillScoreAtRegistration: input.skillScoreAtRegistration,
            status: decision === 'hold' ? 'pending_payment' : 'waitlisted',
            amountAed: input.amountAed,
            holdExpiresAt: decision === 'hold' ? input.holdExpiresAt : null,
            tShirtSize: input.tShirtSize,
            company: input.company,
            shareWithSponsors: input.shareWithSponsors,
            sponsorInterest: input.sponsorInterest,
            createdAt: input.now,
          })
          .returning();
        return { kind: 'created' as const, registration: row };
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        // A concurrent submit won the partial unique index: hand back its row (idempotent double submit).
        const again = await tournamentStore.getActiveRegistrationForUser(input.tournamentId, input.userId);
        return again ? { kind: 'existing', registration: again } : { kind: 'conflict' };
      }
      throw err;
    }
  },

  /**
   * Attach a new intent ONLY over the intent the caller saw (NULL for a fresh
   * hold, or the dead one it is replacing). False when another request got
   * there first — the caller then hands back THAT intent, so a payment link
   * already shown to the player is never swapped (the Gate 15 double-submit class).
   */
  async attachIntent(registrationId: string, intentId: string, expectedCurrent: string | null): Promise<boolean> {
    const rows = await db
      .update(tournamentRegistrations)
      .set({ ziinaPaymentIntentId: intentId })
      .where(and(
        eq(tournamentRegistrations.id, registrationId),
        eq(tournamentRegistrations.status, 'pending_payment'),
        expectedCurrent === null
          ? isNull(tournamentRegistrations.ziinaPaymentIntentId)
          : eq(tournamentRegistrations.ziinaPaymentIntentId, expectedCurrent),
      ))
      .returning({ id: tournamentRegistrations.id });
    return rows.length > 0;
  },

  /**
   * Cancel a fresh hold whose intent could not be created — under the tournament
   * lock, only while NO intent is attached (a concurrent request may already have
   * shown the player a live payment link), then offer the freed seat to the waitlist.
   */
  async cancelHold(registrationId: string, reason: string): Promise<{ cancelled: boolean; promoted: TournamentRegistration[] }> {
    return db.transaction(async (tx) => {
      const [r0] = await tx.select({ tournamentId: tournamentRegistrations.tournamentId }).from(tournamentRegistrations).where(eq(tournamentRegistrations.id, registrationId));
      if (!r0) return { cancelled: false, promoted: [] };
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, r0.tournamentId)).for('update');
      if (!t) return { cancelled: false, promoted: [] };
      const now = new Date();
      const [row] = await tx
        .update(tournamentRegistrations)
        .set({ status: 'cancelled', cancelledAt: now, cancellationReason: reason })
        .where(and(
          eq(tournamentRegistrations.id, registrationId),
          eq(tournamentRegistrations.status, 'pending_payment'),
          isNull(tournamentRegistrations.ziinaPaymentIntentId),
        ))
        .returning();
      if (!row) return { cancelled: false, promoted: [] };
      const promoted = await fillFreeSeats(tx, t, row.tier, now);
      return { cancelled: true, promoted };
    });
  },

  /** Holds past their deadline, oldest first. The job asks Ziina about each before expiring it. */
  async getLapsedHolds(now: Date): Promise<TournamentRegistration[]> {
    return db
      .select()
      .from(tournamentRegistrations)
      .where(and(eq(tournamentRegistrations.status, 'pending_payment'), sql`${tournamentRegistrations.holdExpiresAt} < ${now}`))
      .orderBy(asc(tournamentRegistrations.holdExpiresAt))
      .limit(100);
  },

  /**
   * Expire ONE lapsed hold with a status-guarded claim (never touches a
   * confirmed row — the 10bbb24 lesson), then give the freed seat to the
   * waitlist under the same tournament lock.
   */
  async expireAndPromote(registrationId: string, now: Date): Promise<{ expired: boolean; registration?: TournamentRegistration; promoted: TournamentRegistration[] }> {
    return db.transaction(async (tx) => {
      const [r0] = await tx.select({ tournamentId: tournamentRegistrations.tournamentId }).from(tournamentRegistrations).where(eq(tournamentRegistrations.id, registrationId));
      if (!r0) return { expired: false, promoted: [] };
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, r0.tournamentId)).for('update');
      if (!t) return { expired: false, promoted: [] };
      const [claimed] = await tx
        .update(tournamentRegistrations)
        .set({ status: 'expired', cancelledAt: now, cancellationReason: 'hold_expired' })
        .where(and(
          eq(tournamentRegistrations.id, registrationId),
          eq(tournamentRegistrations.status, 'pending_payment'),
          sql`${tournamentRegistrations.holdExpiresAt} < ${now}`,
        ))
        .returning();
      if (!claimed) return { expired: false, promoted: [] };
      const promoted = await fillFreeSeats(tx, t, claimed.tier, now);
      return { expired: true, registration: claimed, promoted };
    });
  },

  /**
   * The one confirm transaction (webhook, return-page poll, reconciliation).
   * Locks the tournament, then the registration. A pending hold is confirmed
   * with ONE payments row carrying tournament_registration_id. Money that lands
   * after the hold lapsed (Q5): restored if the tier still has a seat under the
   * lock, otherwise recorded and a refund queued. Money after a withdrawal is
   * always recorded and refunded.
   */
  async confirmTx(intentId: string, now: Date): Promise<ConfirmTxResult> {
    return db.transaction(async (tx) => {
      const [r0] = await tx.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.ziinaPaymentIntentId, intentId));
      if (!r0) return { kind: 'not_found' as const };
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, r0.tournamentId)).for('update');
      const [r] = await tx.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.id, r0.id)).for('update');
      if (!t || !r) return { kind: 'not_found' as const };
      if (r.status === 'confirmed') return { kind: 'already' as const, registration: r };

      const [existingPayment] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.ziinaPaymentIntentId, intentId));
      const recordPayment = async (): Promise<boolean> => {
        if (existingPayment) return false;
        await tx.insert(payments).values({
          id: randomUUID(),
          bookingId: null,
          packId: null,
          tournamentRegistrationId: r.id,
          ziinaPaymentIntentId: intentId,
          amount: r.amountAed,
          currency: 'aed',
          status: 'completed',
          completedAt: now,
        });
        return true;
      };

      if (r.status === 'pending_payment') {
        const [row] = await tx
          .update(tournamentRegistrations)
          .set({ status: 'confirmed', paidAt: now, paymentMethod: 'ziina' })
          .where(and(eq(tournamentRegistrations.id, r.id), eq(tournamentRegistrations.status, 'pending_payment')))
          .returning();
        await recordPayment();
        return { kind: 'confirmed' as const, registration: row };
      }

      if (r.status === 'expired' || r.status === 'cancelled') {
        const [other] = await tx
          .select({ id: tournamentRegistrations.id })
          .from(tournamentRegistrations)
          .where(and(
            eq(tournamentRegistrations.tournamentId, t.id),
            or(eq(tournamentRegistrations.userId, r.userId), eq(tournamentRegistrations.playerId, r.playerId)),
            inArray(tournamentRegistrations.status, ACTIVE),
          ))
          .limit(1);
        const counts = await countTier(tx, t.id, r.tier);
        if (!other && counts.held < capFor(t, r.tier)) {
          const [row] = await tx
            .update(tournamentRegistrations)
            .set({
              status: 'confirmed', paidAt: now, paymentMethod: 'ziina', cancelledAt: null, cancellationReason: null,
              adminNote: `Restored ${now.toISOString()}: payment landed after the hold ${r.status === 'expired' ? 'expired' : 'was cancelled'} and the tier still had a seat.`,
            })
            .where(eq(tournamentRegistrations.id, r.id))
            .returning();
          await recordPayment();
          return { kind: 'restored' as const, registration: row };
        }
      }

      const fresh = await recordPayment();
      const [row] = await tx
        .update(tournamentRegistrations)
        .set({ refundStatus: sql`coalesce(${tournamentRegistrations.refundStatus}, 'pending')` })
        .where(eq(tournamentRegistrations.id, r.id))
        .returning();
      if (fresh) {
        const why = r.status === 'withdrawn'
          ? 'paid after the player withdrew'
          : 'paid after the hold lapsed and the tier had no free seat';
        await queueRefund(tx, r, why, intentId);
      }
      return { kind: 'refund_owed' as const, registration: row };
    });
  },

  /**
   * Withdraw (Q4) under the tournament lock: refund pending before the deadline
   * (queued for the Refunds tab in the same transaction), none from the deadline
   * to the draft cut-off, blocked after. A freed seat goes to the waitlist.
   */
  async withdraw(registrationId: string, userId: string, now: Date): Promise<WithdrawTxResult> {
    return db.transaction(async (tx) => {
      const [r0] = await tx.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.id, registrationId));
      if (!r0 || r0.userId !== userId) return { kind: 'not_found' as const };
      const t = await lockTournament(tx, r0.tournamentId);
      const [r] = await tx.select().from(tournamentRegistrations).where(eq(tournamentRegistrations.id, registrationId)).for('update');
      if (!t || !r) return { kind: 'not_found' as const };
      const outcome = withdrawOutcome({ status: r.status, paid: r.paidAt != null }, now, t);
      if (!outcome.allowed) return { kind: 'not_allowed' as const, reason: outcome.reason };
      const heldSeat = r.status === 'confirmed' || r.status === 'pending_payment';
      const [row] = await tx
        .update(tournamentRegistrations)
        .set({ status: 'withdrawn', withdrawnAt: now, refundStatus: outcome.refund })
        .where(and(eq(tournamentRegistrations.id, r.id), inArray(tournamentRegistrations.status, ACTIVE)))
        .returning();
      if (!row) return { kind: 'not_allowed' as const, reason: 'not_active' as const };
      if (outcome.refund === 'pending') await queueRefund(tx, r, 'withdrew before the refund deadline', r.ziinaPaymentIntentId);
      const promoted = heldSeat ? await fillFreeSeats(tx, t, r.tier, now) : [];
      return { kind: 'withdrawn' as const, registration: row, refund: outcome.refund, promoted };
    });
  },

  async setSponsorInterest(registrationId: string, userId: string, interested: boolean): Promise<TournamentRegistration | undefined> {
    const [row] = await db
      .update(tournamentRegistrations)
      .set({ sponsorInterest: interested })
      .where(and(eq(tournamentRegistrations.id, registrationId), eq(tournamentRegistrations.userId, userId), inArray(tournamentRegistrations.status, ACTIVE)))
      .returning();
    return row;
  },

  async markConfirmationEmailed(registrationId: string, at: Date): Promise<void> {
    await db.update(tournamentRegistrations).set({ confirmationEmailSentAt: at })
      .where(and(eq(tournamentRegistrations.id, registrationId), isNull(tournamentRegistrations.confirmationEmailSentAt)));
  },

  async markPromotionNotified(registrationId: string, at: Date): Promise<void> {
    await db.update(tournamentRegistrations).set({ promotionNotifiedAt: at }).where(eq(tournamentRegistrations.id, registrationId));
  },

  /** Stamp the ONE sponsor email; false when it was already stamped (another request sent it). */
  async markSponsorEmailed(registrationId: string, at: Date): Promise<boolean> {
    const rows = await db.update(tournamentRegistrations).set({ sponsorInterestEmailedAt: at })
      .where(and(eq(tournamentRegistrations.id, registrationId), isNull(tournamentRegistrations.sponsorInterestEmailedAt)))
      .returning({ id: tournamentRegistrations.id });
    return rows.length > 0;
  },

  /** Intents with no payments row: every pending hold, and lapsed / withdrawn ones within the window (money must never go invisible). */
  async getReconcileCandidates(now: Date, windowMs: number): Promise<Array<{ id: string; ziinaPaymentIntentId: string | null }>> {
    const since = new Date(now.getTime() - windowMs);
    return db
      .select({ id: tournamentRegistrations.id, ziinaPaymentIntentId: tournamentRegistrations.ziinaPaymentIntentId })
      .from(tournamentRegistrations)
      .where(and(
        isNotNull(tournamentRegistrations.ziinaPaymentIntentId),
        sql`NOT EXISTS (SELECT 1 FROM payments p WHERE p.ziina_payment_intent_id = ${tournamentRegistrations.ziinaPaymentIntentId})`,
        or(
          eq(tournamentRegistrations.status, 'pending_payment'),
          and(
            inArray(tournamentRegistrations.status, ['expired', 'cancelled', 'withdrawn']),
            sql`coalesce(${tournamentRegistrations.cancelledAt}, ${tournamentRegistrations.withdrawnAt}, ${tournamentRegistrations.createdAt}) > ${since}`,
          ),
        ),
      ))
      .limit(200);
  },

  /**
   * Claim the members "registration open" stamp and, in the same transaction,
   * insert one in-app notification per member account (non-test). null when
   * another instance already claimed it.
   */
  async notifyMembersOpen(tournamentId: string, now: Date, copy: { title: string; message: string }): Promise<number | null> {
    return db.transaction(async (tx) => {
      const claimed = await tx.update(tournaments).set({ membersOpenNotifiedAt: now })
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.membersOpenNotifiedAt)))
        .returning({ id: tournaments.id });
      if (claimed.length === 0) return null;
      const res = await tx.execute(sql`
        INSERT INTO marketplace_notifications (id, user_id, type, title, message)
        SELECT gen_random_uuid()::text, u.id, 'tournament_open_members', ${copy.title}, ${copy.message}
        FROM marketplace_users u
        WHERE ${NOT_TEST_ACCOUNT_FOR_U} AND ${MEMBER_EXISTS_FOR_U}`);
      return Number((res as any).rowCount ?? 0);
    });
  },

  /** The same for everyone, skipping accounts that already got the members notice for this event. */
  async notifyEveryoneOpen(tournamentId: string, now: Date, copy: { title: string; message: string }): Promise<number | null> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx.update(tournaments).set({ openNotifiedAt: now })
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.openNotifiedAt)))
        .returning({ id: tournaments.id, membersAt: tournaments.membersOpenNotifiedAt });
      if (!claimed) return null;
      // marketplace_notifications.created_at is naive UTC; compare against the members stamp in UTC, with an hour of slack.
      const skipMembers = claimed.membersAt
        ? sql`AND NOT EXISTS (SELECT 1 FROM marketplace_notifications n WHERE n.user_id = u.id AND n.type = 'tournament_open_members'
              AND n.created_at >= (${claimed.membersAt}::timestamptz AT TIME ZONE 'UTC') - interval '1 hour')`
        : sql``;
      const res = await tx.execute(sql`
        INSERT INTO marketplace_notifications (id, user_id, type, title, message)
        SELECT gen_random_uuid()::text, u.id, 'tournament_open', ${copy.title}, ${copy.message}
        FROM marketplace_users u
        WHERE ${NOT_TEST_ACCOUNT_FOR_U} ${skipMembers}`);
      return Number((res as any).rowCount ?? 0);
    });
  },

  startJobRun: (jobName: string) => iqPassStore.startJobRun(jobName),
  finishJobRun: (id: string, status: 'ok' | 'error', details: Record<string, number>, error?: string) => iqPassStore.finishJobRun(id, status, details, error),
};
