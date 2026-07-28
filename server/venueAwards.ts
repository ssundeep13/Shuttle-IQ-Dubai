// Venue-scoped badge awards — Founding Member, Silicon Oasis launch week.
// Separate table and rule from the Founding Court consistency badge; no shared
// code path, and founding_court_awards is never read or written here.
//
// Lifecycle: awarded LIVE the moment a qualifying booking is confirmed
// (payment success, including a waitlist promotion that gets paid), revoked if
// a cancellation leaves the player with zero qualifying bookings, and reinstated
// on rebooking — all of that only until the seal. After SEAL_TIME the cohort is
// frozen: no writes, ever.
//
// Revocation is SOFT — revoked_at is stamped, the row is never deleted, and a
// reinstatement clears it. That is what makes seen_at survive a revoke→rebook
// round trip, so the one-time award screen never replays. The invariant this
// buys costs one thing: EVERY read here must filter revoked_at IS NULL.
import { pool, db } from "./db";
import { venueAwards } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

/** Rochester Institute of Technology, Dubai Silicon Oasis. */
export const SILICON_OASIS_VENUE_ID = "67feab63-109f-41fc-8252-8645801ca9a2";
export const FOUNDING_MEMBER_BADGE = "founding_member";
export const FOUNDING_MEMBER_LABEL = "Founding Member";
export const FOUNDING_MEMBER_SUBTITLE = "Silicon Oasis · July 2026";

/** The three launch-week sessions, listed explicitly rather than derived from
 *  venue+date so a fourth session at this venue can never silently widen the
 *  cohort. Mon 27 / Wed 29 / Fri 31 Jul 2026, 20:00–22:00. */
export const FOUNDING_MEMBER_SESSION_IDS = [
  "b4674701-dc3e-4564-ba67-fd8edc3435f4", // Mon 27 Jul
  "a0ed2873-9595-4a43-92fb-d9691201aee2", // Wed 29 Jul
  "2d884572-6ba9-4009-91ad-e88bc732722e", // Fri 31 Jul
] as const;

/** Paid AND holding a spot. 'pending_payment' is a waitlist hold with no money
 *  taken, 'waitlisted' never had a seat, 'pending' is an abandoned checkout —
 *  none of them qualify. A promoted player earns the badge when they pay, which
 *  lands on the same confirmation hook as any other booking. */
export const QUALIFYING_STATUSES = ["confirmed", "attended"] as const;

/** 2026-07-31 23:59 Asia/Dubai (UTC+4, no DST) === 19:59Z the same day.
 *  After this instant the cohort is frozen in both directions. */
export const SEAL_TIME = new Date("2026-07-31T19:59:00.000Z");

export function isBookedStatus(status: string): boolean {
  return (QUALIFYING_STATUSES as readonly string[]).includes(status);
}

export function isBeforeSeal(now: Date = new Date()): boolean {
  return now.getTime() < SEAL_TIME.getTime();
}

/** Qualifying bookings this user holds across the three launch sessions.
 *  Raw pool.query for the array params: drizzle's sql template serialises a JS
 *  array such that `= ANY($1)` silently matches nothing (house lesson). */
export async function countQualifyingBookings(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM bookings
     WHERE user_id = $1 AND session_id = ANY($2) AND status = ANY($3)`,
    [userId, FOUNDING_MEMBER_SESSION_IDS as unknown as string[], QUALIFYING_STATUSES as unknown as string[]],
  );
  return Number(rows[0].n);
}

/** Composite-PK predicate for this user's Founding Member row. */
function awardRow(userId: string) {
  return and(
    eq(venueAwards.userId, userId),
    eq(venueAwards.venueId, SILICON_OASIS_VENUE_ID),
    eq(venueAwards.badgeType, FOUNDING_MEMBER_BADGE),
  );
}

/**
 * Idempotent award, in two explicit steps because a soft-revoked row already
 * occupies the primary key:
 *   1. INSERT ... ON CONFLICT DO NOTHING — a genuinely new award.
 *   2. If nothing inserted, clear revoked_at on a revoked row — a reinstatement.
 * Neither step ever touches seen_at, which is the whole point of the soft
 * revoke: a player who is revoked and rebooks does NOT see the award screen
 * again. An already-active row matches neither step and stays untouched.
 */
export async function awardFoundingMember(
  userId: string,
  now: Date = new Date(),
): Promise<'inserted' | 'reinstated' | 'unchanged'> {
  if (!isBeforeSeal(now)) return 'unchanged';
  if ((await countQualifyingBookings(userId)) < 1) return 'unchanged';
  const written = await db
    .insert(venueAwards)
    .values({ userId, venueId: SILICON_OASIS_VENUE_ID, badgeType: FOUNDING_MEMBER_BADGE })
    .onConflictDoNothing()
    .returning({ userId: venueAwards.userId });
  if (written.length > 0) return 'inserted';
  const revived = await db
    .update(venueAwards)
    .set({ revokedAt: null })
    .where(and(awardRow(userId), sql`${venueAwards.revokedAt} IS NOT NULL`))
    .returning({ userId: venueAwards.userId });
  return revived.length > 0 ? 'reinstated' : 'unchanged';
}

/** Revoke when a cancellation leaves zero qualifying bookings. SOFT — stamps
 *  revoked_at, never deletes, so seen_at survives. Before the seal only; after
 *  it, a late cancellation can no longer take the badge away. */
export async function revokeFoundingMemberIfUnqualified(userId: string, now: Date = new Date()): Promise<boolean> {
  if (!isBeforeSeal(now)) return false;
  if ((await countQualifyingBookings(userId)) > 0) return false;
  const revoked = await db
    .update(venueAwards)
    .set({ revokedAt: now })
    .where(and(awardRow(userId), sql`${venueAwards.revokedAt} IS NULL`))
    .returning({ userId: venueAwards.userId });
  return revoked.length > 0;
}

/** The live hook. One call covers both directions: award (or reinstate) on
 *  confirmation, revoke on the cancellation that drops the last qualifying
 *  booking. Safe to call on any booking change for any user — non-cohort users
 *  no-op. */
export async function syncFoundingMemberForUser(
  userId: string,
  now: Date = new Date(),
): Promise<'awarded' | 'reinstated' | 'revoked' | 'unchanged'> {
  if (!isBeforeSeal(now)) return 'unchanged';
  if ((await countQualifyingBookings(userId)) > 0) {
    const result = await awardFoundingMember(userId, now);
    return result === 'inserted' ? 'awarded' : result === 'reinstated' ? 'reinstated' : 'unchanged';
  }
  return (await revokeFoundingMemberIfUnqualified(userId, now)) ? 'revoked' : 'unchanged';
}

export interface FoundingMemberView {
  badge: string;
  subtitle: string;
  venueId: string;
  awardedAt: string;
  seenAt: string | null;
}

/** Read path for the award screen + profile card. Display strings only.
 *  revoked_at IS NULL — a soft-revoked row must read as no badge at all. */
export async function getFoundingMemberForUser(userId: string): Promise<FoundingMemberView | null> {
  const { rows } = await pool.query(
    `SELECT earned_at, seen_at FROM venue_awards
     WHERE user_id = $1 AND venue_id = $2 AND badge_type = $3
       AND revoked_at IS NULL LIMIT 1`,
    [userId, SILICON_OASIS_VENUE_ID, FOUNDING_MEMBER_BADGE],
  );
  if (rows.length === 0) return null;
  return {
    badge: FOUNDING_MEMBER_LABEL,
    subtitle: FOUNDING_MEMBER_SUBTITLE,
    venueId: SILICON_OASIS_VENUE_ID,
    awardedAt: new Date(rows[0].earned_at).toISOString(),
    seenAt: rows[0].seen_at ? new Date(rows[0].seen_at).toISOString() : null,
  };
}

/** Dismissal — stamps seen_at once and never re-stamps, so the screen can't
 *  replay and neither a re-award nor a reinstatement disturbs it. Deliberately
 *  NOT filtered on revoked_at: this is the one write that should still land on
 *  a revoked row, because the whole point is that the dismissal outlives it. */
export async function markFoundingMemberSeen(userId: string): Promise<void> {
  await db
    .update(venueAwards)
    .set({ seenAt: new Date() })
    .where(and(awardRow(userId), sql`${venueAwards.seenAt} IS NULL`));
}

/** Batch seal lookup for public surfaces, keyed by OPERATIONAL player id
 *  (queue cards, match screens and the Who's Playing grid all speak player
 *  ids, while awards are keyed by marketplace user). */
export async function getFoundingMemberPlayerIds(playerIds: string[]): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();
  const { rows } = await pool.query(
    `SELECT mu.linked_player_id AS "playerId"
     FROM venue_awards va
     JOIN marketplace_users mu ON mu.id = va.user_id
     WHERE va.venue_id = $1 AND va.badge_type = $2 AND va.revoked_at IS NULL
       AND mu.linked_player_id = ANY($3)`,
    [SILICON_OASIS_VENUE_ID, FOUNDING_MEMBER_BADGE, playerIds],
  );
  return new Set(rows.map(r => r.playerId as string));
}

// ── Backfill CLI support ────────────────────────────────────────────────────
export interface CohortRow { userId: string; name: string; linkedPlayerId: string | null; sessions: number }

export interface AwardReport {
  venueId: string;
  badgeType: string;
  sessionIds: string[];
  eligible: CohortRow[];
  excluded: { waitlistedOnly: number; pendingOnly: number; holdOnly: number; cancelledOnly: number; linkedGuestsNotBooked: number };
  alreadyHeld: number;
  inserted: string[];
  /** Eligible players whose row was soft-revoked and is now un-revoked. */
  reinstated: string[];
  /** Holders whose qualifying bookings have since dropped to zero — the
   *  reconciliation side, covering any cancel path that is not live-hooked
   *  (whole-event cancellation, direct DB edits). */
  staleHolders: string[];
  revoked: string[];
  executed: boolean;
  tableExists: boolean;
  beforeSeal: boolean;
}

async function loadCohort(): Promise<CohortRow[]> {
  const { rows } = await pool.query(
    `SELECT b.user_id AS "userId", mu.name, mu.linked_player_id AS "linkedPlayerId",
            count(DISTINCT b.session_id)::int AS sessions
     FROM bookings b
     JOIN marketplace_users mu ON mu.id = b.user_id
     WHERE b.session_id = ANY($1) AND b.status = ANY($2)
     GROUP BY b.user_id, mu.name, mu.linked_player_id
     ORDER BY mu.name`,
    [FOUNDING_MEMBER_SESSION_IDS as unknown as string[], QUALIFYING_STATUSES as unknown as string[]],
  );
  return rows as CohortRow[];
}

async function countExcluded() {
  const ids = FOUNDING_MEMBER_SESSION_IDS as unknown as string[];
  const ok = QUALIFYING_STATUSES as unknown as string[];
  const one = async (q: string, p: unknown[]) => Number((await pool.query(q, p)).rows[0].n);
  const soleStatus = (status: string) => one(
    `SELECT count(*)::int n FROM (
       SELECT b.user_id FROM bookings b WHERE b.session_id = ANY($1)
       GROUP BY b.user_id
       HAVING bool_or(b.status = $2) AND NOT bool_or(b.status = ANY($3))) t`,
    [ids, status, ok],
  );
  return {
    waitlistedOnly: await soleStatus("waitlisted"),
    pendingOnly: await soleStatus("pending"),
    holdOnly: await soleStatus("pending_payment"),
    cancelledOnly: await one(
      `SELECT count(*)::int n FROM (
         SELECT b.user_id FROM bookings b WHERE b.session_id = ANY($1)
         GROUP BY b.user_id HAVING bool_and(b.status = 'cancelled')) t`,
      [ids],
    ),
    linkedGuestsNotBooked: await one(
      `SELECT count(DISTINCT bg.linked_user_id)::int n
       FROM booking_guests bg JOIN bookings b ON b.id = bg.booking_id
       WHERE b.session_id = ANY($1) AND bg.is_primary = false
         AND bg.status = 'confirmed' AND bg.linked_user_id IS NOT NULL
         AND b.status <> 'cancelled'
         AND NOT EXISTS (SELECT 1 FROM bookings ob WHERE ob.session_id = ANY($1)
                           AND ob.user_id = bg.linked_user_id AND ob.status = ANY($2))`,
      [ids, ok],
    ),
  };
}

/**
 * Backfill pass for players who already qualified before the live hook existed.
 * Same idempotent insert as the hook, so running it alongside live awards is
 * safe and repeatable. Refuses to write after the seal.
 */
export async function awardFoundingMembers(opts: { execute: boolean }): Promise<AwardReport> {
  const eligible = await loadCohort();
  const excluded = await countExcluded();
  const beforeSeal = isBeforeSeal();

  const tableExists = Boolean((await pool.query(`SELECT to_regclass('public.venue_awards') AS t`)).rows[0].t);
  if (!tableExists && opts.execute) {
    throw new Error('venue_awards table does not exist — run: node scripts/migrate-venue-awards.mjs --execute');
  }
  if (!beforeSeal && opts.execute) {
    throw new Error(`Cohort sealed at ${SEAL_TIME.toISOString()} — no further awards can be written.`);
  }
  // Active holders only — a soft-revoked row is not a holder.
  const holders: string[] = tableExists
    ? (await pool.query(
        `SELECT user_id FROM venue_awards
         WHERE venue_id = $1 AND badge_type = $2 AND revoked_at IS NULL`,
        [SILICON_OASIS_VENUE_ID, FOUNDING_MEMBER_BADGE],
      )).rows.map((r: { user_id: string }) => r.user_id)
    : [];
  const alreadyHeld = holders.length;
  // Reconciliation: a holder no longer in the eligible cohort has cancelled
  // every qualifying booking, through a hooked path or otherwise.
  const eligibleIds = new Set(eligible.map(e => e.userId));
  const staleHolders = holders.filter(id => !eligibleIds.has(id));

  let inserted: string[] = [];
  let reinstated: string[] = [];
  let revoked: string[] = [];
  if (opts.execute && eligible.length > 0) {
    const written = await db
      .insert(venueAwards)
      .values(eligible.map(e => ({ userId: e.userId, venueId: SILICON_OASIS_VENUE_ID, badgeType: FOUNDING_MEMBER_BADGE })))
      .onConflictDoNothing()
      .returning({ userId: venueAwards.userId });
    inserted = written.map(w => w.userId);
    // Soft-revoked rows occupy the PK, so the insert above skips them. Clear
    // revoked_at for anyone eligible again — seen_at is left alone.
    const revived = await pool.query(
      `UPDATE venue_awards SET revoked_at = NULL
       WHERE venue_id = $1 AND badge_type = $2 AND revoked_at IS NOT NULL
         AND user_id = ANY($3) RETURNING user_id`,
      [SILICON_OASIS_VENUE_ID, FOUNDING_MEMBER_BADGE, eligible.map(e => e.userId)],
    );
    reinstated = revived.rows.map((r: { user_id: string }) => r.user_id);
  }
  if (opts.execute && staleHolders.length > 0) {
    for (const userId of staleHolders) {
      if (await revokeFoundingMemberIfUnqualified(userId)) revoked.push(userId);
    }
  }

  return {
    venueId: SILICON_OASIS_VENUE_ID,
    badgeType: FOUNDING_MEMBER_BADGE,
    sessionIds: [...FOUNDING_MEMBER_SESSION_IDS],
    eligible, excluded, alreadyHeld, inserted, reinstated, staleHolders, revoked,
    executed: opts.execute, tableExists, beforeSeal,
  };
}
