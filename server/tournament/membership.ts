// Tournament registration — who counts as a member for the early (12:00 Dubai)
// stage. Sandeep, 2026-09-23: any account holding an ACTIVE IQ Pass of any type
// (Club, Club Plus, Club Elite, and any pass type added later). No tier filter.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { packs } from "@shared/schema";

export async function isTournamentMember(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: packs.id })
    .from(packs)
    .where(and(eq(packs.userId, userId), eq(packs.status, 'active')))
    .limit(1);
  return rows.length > 0;
}

/** For the pre-deploy report and the admin page: distinct accounts that count as members right now. */
export async function countTournamentMembers(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(DISTINCT ${packs.userId})::int` })
    .from(packs)
    .where(eq(packs.status, 'active'));
  return row?.n ?? 0;
}

/** The same rule, set-based, for a query over marketplace_users aliased as u (the members notification). */
export const MEMBER_EXISTS_FOR_U = sql`EXISTS (SELECT 1 FROM packs p WHERE p.user_id = u.id AND p.status = 'active')`;
