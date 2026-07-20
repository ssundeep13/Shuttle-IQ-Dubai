// Consistency badges (Gate 2b). Insider and Inner Circle are recomputed on
// every read from verified check-ins — a single aggregate over bookings is
// trivial at this player count and can never go stale. Founding Court is
// permanent: the first read that detects 3 consecutive qualifying 30-day
// windows persists an award row (founding_court_awards), and the badge is
// served from that row forever after — never revoked, uncapped.
//
// Verified check-in = attended_at IS NOT NULL AND status != 'cancelled'
// (waitlisted/pending bookings with attended_at count — Gate 2b ruling).
// Windows are rolling from now: m1 (0-30d], m2 (30-60d], m3 (60-90d] —
// same methodology as the Gate 1 calibration.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { foundingCourtAwards } from "@shared/schema";

export const BADGE_WINDOW_DAYS = 30;
export const BADGE_THRESHOLDS = { insider: 4, inner_circle: 8 } as const;

// User-facing display names — internal keys must NEVER appear in API
// responses. There is deliberately no lookup-by-arbitrary-string here:
// every path below assigns from this map explicitly.
const DISPLAY = {
  insider: "Insider",
  inner_circle: "Inner Circle",
  founding_court: "Founding Court",
} as const;

export interface BadgeInfo {
  /** Display name ("Insider" | "Inner Circle" | "Founding Court") or null. */
  badge: string | null;
  /** 'active' | 'dormant', null when badge is null. */
  badgeStatus: "active" | "dormant" | null;
  /** Verified check-ins still needed to reactivate a dormant badge. */
  sessionsToReactivate?: number;
  /** Powers the profile progress card for every player, badged or not. */
  progress: {
    currentCheckins: number;
    threshold: number;
    windowDays: number;
  };
  foundingCourtEarnedDate?: string;
  /** Internal: this read detected founding qualification (award write due). */
  qualifiesFoundingNow: boolean;
}

/**
 * Pure badge rules from the three window counts. Ladder on the current
 * window: Inner Circle (8+), Insider (4+). Founding Court overrides both
 * once held (hasFoundingAward) or first detected (all three windows 8+) —
 * permanent, so it is always 'active' regardless of current check-ins.
 * Dormancy: no active tier this window but a tier was met last window →
 * that tier shows 'dormant' with the check-ins needed to re-clear its
 * threshold. Progress threshold is the next milestone (4 until Insider,
 * 8 beyond) — for dormant players it is the dormant tier's own threshold,
 * so sessionsToReactivate === threshold - currentCheckins.
 */
export function computeBadge(
  m1: number,
  m2: number,
  m3: number,
  hasFoundingAward: boolean,
): BadgeInfo {
  const qualifiesFoundingNow = m1 >= BADGE_THRESHOLDS.inner_circle
    && m2 >= BADGE_THRESHOLDS.inner_circle
    && m3 >= BADGE_THRESHOLDS.inner_circle;

  if (hasFoundingAward || qualifiesFoundingNow) {
    return {
      badge: DISPLAY.founding_court,
      badgeStatus: "active",
      progress: { currentCheckins: m1, threshold: BADGE_THRESHOLDS.inner_circle, windowDays: BADGE_WINDOW_DAYS },
      qualifiesFoundingNow,
    };
  }

  if (m1 >= BADGE_THRESHOLDS.inner_circle) {
    return {
      badge: DISPLAY.inner_circle,
      badgeStatus: "active",
      progress: { currentCheckins: m1, threshold: BADGE_THRESHOLDS.inner_circle, windowDays: BADGE_WINDOW_DAYS },
      qualifiesFoundingNow,
    };
  }
  if (m1 >= BADGE_THRESHOLDS.insider) {
    return {
      badge: DISPLAY.insider,
      badgeStatus: "active",
      // Active Insiders see progress toward Inner Circle.
      progress: { currentCheckins: m1, threshold: BADGE_THRESHOLDS.inner_circle, windowDays: BADGE_WINDOW_DAYS },
      qualifiesFoundingNow,
    };
  }

  // No active tier — dormant if the previous window met one.
  if (m2 >= BADGE_THRESHOLDS.insider) {
    const dormantThreshold = m2 >= BADGE_THRESHOLDS.inner_circle
      ? BADGE_THRESHOLDS.inner_circle
      : BADGE_THRESHOLDS.insider;
    return {
      badge: m2 >= BADGE_THRESHOLDS.inner_circle ? DISPLAY.inner_circle : DISPLAY.insider,
      badgeStatus: "dormant",
      sessionsToReactivate: dormantThreshold - m1,
      progress: { currentCheckins: m1, threshold: dormantThreshold, windowDays: BADGE_WINDOW_DAYS },
      qualifiesFoundingNow,
    };
  }

  return {
    badge: null,
    badgeStatus: null,
    progress: { currentCheckins: m1, threshold: BADGE_THRESHOLDS.insider, windowDays: BADGE_WINDOW_DAYS },
    qualifiesFoundingNow,
  };
}

/**
 * Batch ACTIVE badge display names for public surfaces (queue cards, match
 * screens — badge Gate 4), keyed by operational player id. One grouped
 * aggregate + the award join, READ-ONLY: no award persistence here (that
 * stays on the own-profile read), and dormancy is never computed — this
 * function cannot express a dormant badge, which is the server-side half
 * of the no-dormant-leak guarantee (the client half is BadgeTag itself).
 * Players with no linked account or no active badge are simply absent.
 */
export async function getActiveBadgesForPlayers(playerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (playerIds.length === 0) return out;
  const agg = await db.execute(sql`
    SELECT mu.linked_player_id AS player_id,
      count(b.id) FILTER (WHERE b.attended_at >  now() - interval '30 days')::int AS m1,
      count(b.id) FILTER (WHERE b.attended_at <= now() - interval '30 days' AND b.attended_at > now() - interval '60 days')::int AS m2,
      count(b.id) FILTER (WHERE b.attended_at <= now() - interval '60 days' AND b.attended_at > now() - interval '90 days')::int AS m3,
      bool_or(fca.user_id IS NOT NULL) AS has_award
    FROM marketplace_users mu
    LEFT JOIN bookings b ON b.user_id = mu.id AND b.attended_at IS NOT NULL AND b.status != 'cancelled'
    LEFT JOIN founding_court_awards fca ON fca.user_id = mu.id
    WHERE mu.linked_player_id = ANY(${playerIds})
    GROUP BY mu.linked_player_id
  `);
  for (const r of agg.rows as Array<{ player_id: string; m1: number; m2: number; m3: number; has_award: boolean }>) {
    const founding = r.has_award
      || (r.m1 >= BADGE_THRESHOLDS.inner_circle && r.m2 >= BADGE_THRESHOLDS.inner_circle && r.m3 >= BADGE_THRESHOLDS.inner_circle);
    const display = founding ? DISPLAY.founding_court
      : r.m1 >= BADGE_THRESHOLDS.inner_circle ? DISPLAY.inner_circle
      : r.m1 >= BADGE_THRESHOLDS.insider ? DISPLAY.insider
      : null;
    if (display) out.set(r.player_id, display);
  }
  return out;
}

/**
 * Badge info for a marketplace user: one aggregate over their verified
 * check-ins + the founding award row. Persists the Founding Court award on
 * first detection (idempotent — PK on user_id, ON CONFLICT DO NOTHING).
 * The award write is best-effort inside this read path: if it fails, the
 * badge still serves from the computed qualification and the next read
 * retries the write.
 */
export async function getBadgeForUser(userId: string): Promise<Omit<BadgeInfo, "qualifiesFoundingNow">> {
  const agg = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE attended_at >  now() - interval '30 days')::int AS m1,
      count(*) FILTER (WHERE attended_at <= now() - interval '30 days' AND attended_at > now() - interval '60 days')::int AS m2,
      count(*) FILTER (WHERE attended_at <= now() - interval '60 days' AND attended_at > now() - interval '90 days')::int AS m3
    FROM bookings
    WHERE user_id = ${userId} AND attended_at IS NOT NULL AND status != 'cancelled'
  `);
  const row = agg.rows[0] as { m1: number; m2: number; m3: number } | undefined;
  const m1 = row?.m1 ?? 0, m2 = row?.m2 ?? 0, m3 = row?.m3 ?? 0;

  let award = (await db.execute(sql`SELECT earned_at FROM founding_court_awards WHERE user_id = ${userId} LIMIT 1`))
    .rows[0] as { earned_at: Date } | undefined;

  const info = computeBadge(m1, m2, m3, !!award);

  if (info.qualifiesFoundingNow && !award) {
    try {
      await db.insert(foundingCourtAwards).values({ userId }).onConflictDoNothing();
      award = (await db.execute(sql`SELECT earned_at FROM founding_court_awards WHERE user_id = ${userId} LIMIT 1`))
        .rows[0] as { earned_at: Date } | undefined;
    } catch (err) {
      console.error("[Badges] founding award write failed (badge still served):", err instanceof Error ? err.message : err);
    }
  }

  const { qualifiesFoundingNow: _q, ...dto } = info;
  if (award) dto.foundingCourtEarnedDate = new Date(award.earned_at).toISOString();
  return dto;
}
