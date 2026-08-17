// Automatic goodwill credit at booking confirmation.
//
// WHY: the promo used to be a human remembering to run
// scripts/dubailand-goodwill-credit.mts. On 2026-08-14 that memory failed and
// 20 players who had paid were never credited. This hook makes the credit a
// property of confirmation itself; the script survives as a manual sweep.
//
// TURN-ON: sessions.goodwill_credit_fils (nullable). NULL — or anything <= 0 —
// means no promo. Nothing about Dubailand is hardcoded: flagging a session is a
// data change, not a deploy. The flag lives on the OPERATIONAL session row, the
// same row whose id forms the ledger marker, so the flag and the marker can
// never drift apart.
//
// THE RULE — deliberately identical to the script's `booked` mode, so hook and
// script always agree (an active spot, not a captured payment: a wallet- or
// cash-confirmed booking qualifies the moment it is confirmed):
//   holder — booking confirmed/attended AND their own primary slot not cancelled
//   guest  — a non-primary slot on such a booking, status 'confirmed'
//   both   — must resolve to a linked player, else there is no wallet to credit
//
// IDEMPOTENT: the ledger description is the key, byte-identical to the script's
// (`Dubailand goodwill · session <ops-id>`). One credit per player per session,
// forever — a cancel-and-rebook never re-credits, because the marker is the
// memory. Checked twice: once in the pure plan, then again under a row lock so
// two confirms racing (webhook + admin click) serialise instead of double-pay.
//
// NO CLAWBACK: approved policy. A cancellation after the credit keeps the money.
//
// FAILURE ISOLATION: every call site uses fireGoodwillCredit, which is void and
// never awaited — the credit runs after the booking write has already committed.
// A credit failure is logged and dropped; it can never fail, roll back or delay
// a booking or a payment. Per player, too: one player's failure still credits
// the rest of the booking.
//
// MONEY PATH: applyWalletDelta only — balance UPDATE plus append-only ledger row
// on one transaction handle. No raw SQL touches money.
import { pool, db } from "./db";
import { sql } from "drizzle-orm";
import { applyWalletDelta } from "./walletLedger";

/** Ledger description = finance trace = idempotency key. The manual script
 *  imports this same builder, so the two can never drift. */
export const GOODWILL_MARKER_PREFIX = "Dubailand goodwill · session ";
export function goodwillMarker(opsSessionId: string): string {
  return `${GOODWILL_MARKER_PREFIX}${opsSessionId}`;
}

const QUALIFYING_BOOKING_STATUSES = ["confirmed", "attended"];

/** Lifetime ceiling across the whole promo — AED 45 at the current 1500-fils
 *  credit. The manual script imports this same constant, so hook and sweep can
 *  never disagree about who is finished. Counted from goodwill markers on the
 *  ledger, so it spans sessions and survives any redeploy. */
export const MAX_GOODWILL_CREDITS_PER_PLAYER = 3;
export function atGoodwillCap(existingGoodwillCredits: number): boolean {
  return existingGoodwillCredits >= MAX_GOODWILL_CREDITS_PER_PLAYER;
}

export interface GoodwillSessionFlag {
  /** The operational session id — null when a bookable session has no linked
   *  ops row, in which case no marker can be formed and nothing is credited. */
  opsSessionId: string | null;
  goodwillCreditFils: number | null;
}

export interface GoodwillCandidate {
  playerId: string | null;
  personName: string;
  kind: "holder" | "guest";
  slotInactive: boolean;
}

export interface GoodwillContext {
  bookingId: string;
  bookingStatus: string;
  session: GoodwillSessionFlag;
  candidates: GoodwillCandidate[];
  alreadyCredited: string[];
}

export type GoodwillSkipReason = "unlinked" | "slot_inactive" | "already_credited" | "at_cap";

/** What the write layer did. Both refusals are normal outcomes, not errors. */
export type GoodwillCreditOutcome = "credited" | "already_credited" | "at_cap";

export interface GoodwillPlan {
  marker: string | null;
  creditFils: number;
  credits: { playerId: string; personName: string; kind: "holder" | "guest" }[];
  skipped: { playerId: string | null; personName: string; reason: GoodwillSkipReason }[];
}

const emptyPlan = (): GoodwillPlan => ({ marker: null, creditFils: 0, credits: [], skipped: [] });

/** Pure decision. Everything the hook does is decided here, so the rule is
 *  testable without a database and reads as the policy it implements. */
export function planGoodwillCredits(input: {
  session: GoodwillSessionFlag;
  bookingStatus: string;
  candidates: GoodwillCandidate[];
  alreadyCredited: string[];
}): GoodwillPlan {
  const { opsSessionId, goodwillCreditFils } = input.session;
  // Promo off, or no ops row to key the marker on → nothing, and no marker.
  if (!opsSessionId || !goodwillCreditFils || goodwillCreditFils <= 0) return emptyPlan();
  if (!QUALIFYING_BOOKING_STATUSES.includes(input.bookingStatus)) return emptyPlan();

  const plan: GoodwillPlan = {
    marker: goodwillMarker(opsSessionId),
    creditFils: goodwillCreditFils,
    credits: [],
    skipped: [],
  };
  const credited = new Set(input.alreadyCredited);
  const seen = new Set<string>();

  // Holders first, so a player who is both holder and guest is counted once
  // (the same precedence the script's by-player map applies).
  for (const c of [...input.candidates].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "holder" ? -1 : 1))) {
    if (c.slotInactive) {
      plan.skipped.push({ playerId: c.playerId, personName: c.personName, reason: "slot_inactive" });
      continue;
    }
    if (!c.playerId) {
      // No account, no wallet. Skipped silently here; the sweep report names them.
      plan.skipped.push({ playerId: null, personName: c.personName, reason: "unlinked" });
      continue;
    }
    if (seen.has(c.playerId)) continue;
    seen.add(c.playerId);
    if (credited.has(c.playerId)) {
      plan.skipped.push({ playerId: c.playerId, personName: c.personName, reason: "already_credited" });
      continue;
    }
    plan.credits.push({ playerId: c.playerId, personName: c.personName, kind: c.kind });
  }
  return plan;
}

// ── The database boundary ───────────────────────────────────────────────────

export interface GoodwillDeps {
  loadContext(bookingId: string): Promise<GoodwillContext | null>;
  creditPlayer(c: { playerId: string; personName: string; marker: string; creditFils: number; bookingId: string }): Promise<GoodwillCreditOutcome>;
}

/** Writes one credit, or refuses. The player row is locked BEFORE either refusal
 *  is evaluated, so a concurrent confirm blocks here and then sees the row the
 *  winner wrote — neither the per-session marker nor the lifetime cap can be
 *  beaten by a stale read. */
async function creditPlayerReal(c: {
  playerId: string; personName: string; marker: string; creditFils: number; bookingId: string;
}): Promise<GoodwillCreditOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM players WHERE id = ${c.playerId} FOR UPDATE`);
    const seen = await tx.execute(
      sql`SELECT 1 FROM wallet_transactions WHERE player_id = ${c.playerId} AND description = ${c.marker} LIMIT 1`,
    );
    if ((seen.rows as unknown[]).length > 0) return "already_credited";
    // Lifetime promo ceiling, counted on the marker PREFIX so it spans every
    // flagged session. Inside the lock, before any money moves.
    const promo = await tx.execute(
      sql`SELECT count(*)::int AS n FROM wallet_transactions
           WHERE player_id = ${c.playerId} AND description LIKE ${GOODWILL_MARKER_PREFIX + "%"}`,
    );
    const held = Number((promo.rows as Array<{ n: number }>)[0]?.n ?? 0);
    if (atGoodwillCap(held)) return "at_cap";
    const res = await applyWalletDelta(tx, {
      playerId: c.playerId,
      deltaFils: c.creditFils,
      type: "adjustment",
      relatedBookingId: c.bookingId,
      description: c.marker,
      createdBy: "system",
    });
    if (!res) throw new Error(`applyWalletDelta refused goodwill credit for player ${c.playerId}`);
    return "credited";
  });
}

/** One booking → the flag, the booking state, and every person on it. */
async function loadContextReal(bookingId: string): Promise<GoodwillContext | null> {
  const { rows: head } = await pool.query(
    `SELECT b.status AS booking_status,
            bs.linked_session_id AS ops_id,
            s.goodwill_credit_fils AS credit_fils
       FROM bookings b
       LEFT JOIN bookable_sessions bs ON bs.id = b.session_id
       LEFT JOIN sessions s ON s.id = bs.linked_session_id
      WHERE b.id = $1`,
    [bookingId],
  );
  if (head.length === 0) return null;

  const { rows: people } = await pool.query(
    `SELECT 'holder' AS kind, mu.linked_player_id AS player_id, mu.name AS person_name,
            EXISTS (SELECT 1 FROM booking_guests bg
                     WHERE bg.booking_id = b.id AND bg.is_primary AND bg.status = 'cancelled') AS slot_inactive
       FROM bookings b JOIN marketplace_users mu ON mu.id = b.user_id
      WHERE b.id = $1
      UNION ALL
     SELECT 'guest', mu.linked_player_id, bg.name, (bg.status <> 'confirmed')
       FROM booking_guests bg
       LEFT JOIN marketplace_users mu ON mu.id = bg.linked_user_id
      WHERE bg.booking_id = $1 AND bg.is_primary = false`,
    [bookingId],
  );

  const candidates: GoodwillCandidate[] = people.map((r: any) => ({
    playerId: r.player_id ?? null,
    personName: r.person_name ?? "(unnamed)",
    kind: r.kind,
    slotInactive: !!r.slot_inactive,
  }));

  const opsId: string | null = head[0].ops_id ?? null;
  const ids = candidates.map((c) => c.playerId).filter((x): x is string => !!x);
  let alreadyCredited: string[] = [];
  if (opsId && ids.length > 0) {
    // pool.query, not Drizzle: a Drizzle ANY(array) binding silently matches
    // nothing here and would re-credit everyone.
    const { rows } = await pool.query(
      `SELECT DISTINCT player_id FROM wallet_transactions WHERE description = $1 AND player_id = ANY($2)`,
      [goodwillMarker(opsId), ids],
    );
    alreadyCredited = rows.map((r: { player_id: string }) => r.player_id);
  }

  return {
    bookingId,
    bookingStatus: head[0].booking_status,
    session: { opsSessionId: opsId, goodwillCreditFils: head[0].credit_fils ?? null },
    candidates,
    alreadyCredited,
  };
}

const realDeps: GoodwillDeps = { loadContext: loadContextReal, creditPlayer: creditPlayerReal };

/** Credits everyone this booking newly qualifies. Best-effort per player: one
 *  player's failure is logged and the rest are still paid. Returns what
 *  actually happened. */
export async function applyGoodwillCreditForBooking(
  bookingId: string,
  deps: GoodwillDeps = realDeps,
): Promise<GoodwillPlan> {
  const ctx = await deps.loadContext(bookingId);
  if (!ctx) return emptyPlan();

  const plan = planGoodwillCredits({
    session: ctx.session,
    bookingStatus: ctx.bookingStatus,
    candidates: ctx.candidates,
    alreadyCredited: ctx.alreadyCredited,
  });
  if (!plan.marker || plan.credits.length === 0) return plan;

  const written: GoodwillPlan["credits"] = [];
  const refused: GoodwillPlan["skipped"] = [];
  for (const c of plan.credits) {
    try {
      const outcome = await deps.creditPlayer({
        playerId: c.playerId, personName: c.personName,
        marker: plan.marker, creditFils: plan.creditFils, bookingId,
      });
      if (outcome === "credited") written.push(c);
      else refused.push({ playerId: c.playerId, personName: c.personName, reason: outcome });
    } catch (err) {
      console.error(
        `[GoodwillCredit] credit failed for player ${c.playerId} (${c.personName}) on booking ${bookingId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { ...plan, credits: written, skipped: [...plan.skipped, ...refused] };
}

/** The ONLY thing call sites use. Void, unawaited, self-catching: the credit is
 *  best-effort work that happens after the booking has already committed, and a
 *  failure here must never fail or roll back a booking or a payment. */
export function fireGoodwillCredit(bookingId: string, site: string, deps?: GoodwillDeps): void {
  applyGoodwillCreditForBooking(bookingId, deps)
    .then((plan) => {
      if (plan.credits.length > 0) {
        console.log(`[GoodwillCredit] credited ${plan.credits.length} player(s) on booking ${bookingId} (${site}): ${plan.credits.map((c) => c.personName).join(", ")}`);
      }
      const unlinked = plan.skipped.filter((s) => s.reason === "unlinked");
      if (unlinked.length > 0) {
        console.warn(`[GoodwillCredit] ${unlinked.length} unlinked person(s) skipped on booking ${bookingId} (${site}): ${unlinked.map((s) => s.personName).join(", ")} — link them and run the sweep`);
      }
    })
    .catch((err) => console.error(`[GoodwillCredit] hook failed at ${site} for booking ${bookingId}:`, err instanceof Error ? err.message : err));
}
