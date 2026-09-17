// Finance portal — the IQ Pass tab. READ-ONLY: two SELECTs and a pure report over plain
// rows; no writes, no wallet, no payment calls. Owner-only at the route.
//
// Numbers mirror the player-facing pass line (server/iqPass/store.ts getActiveTierForUser):
//   picked    = seats not cancelled (a moved seat counts once — the new one)
//   played    = live seats whose session has ended (Dubai wall-clock) or was attended
//   remaining = live seats still ahead (upcoming)
// Pack status: the DB status, with one derivation — an 'active' pack whose window has
// closed reads 'expired' (the daily job marks a pack 'completed' when its last picked
// game is past; a pack that never picked, or a job lag, would otherwise sit 'active'
// forever). Holds (pending payment, cancelled unpaid) are reported separately from
// paid packs so the main table is money only.

import { eq, isNotNull, sql } from "drizzle-orm";
import { bookings, bookableSessions, marketplaceUsers, packs } from "@shared/schema";
import { IQ_PASS_TIER_LABELS, isPackTier, type PackTier } from "@shared/iqPassTiers";
import { sessionStartEpochMs } from "@shared/sessionTime";
import { todayDubai } from "../iqPass/rules";

export interface IqPassPackInput {
  id: string;
  userId: string;
  playerName: string;
  playerEmail: string;
  tier: string;
  gamesTotal: number;
  priceAed: number;
  status: string; // pending_payment | active | completed | cancelled
  ziinaPaymentIntentId: string | null;
  windowStart: string; // Dubai calendar day
  windowEnd: string;
  holdExpiresAt: Date | string | null;
  paidAt: Date | string | null;
  cancelledAt: Date | string | null;
  cancellationReason: string | null;
  repickCredits: number;
  jerseySize: string | null;
  jerseyHandedOverAt: Date | string | null;
  createdAt: Date | string;
}

export interface IqPassSeatInput {
  bookingId: string;
  packId: string;
  status: string; // pending_payment | confirmed | attended | cancelled
  cancellationReason: string | null;
  movedFromBookingId: string | null;
  attendedAt: Date | string | null;
  sessionId: string;
  sessionDateIso: string; // YYYY-MM-DD (Dubai calendar day)
  startTime: string;
  endTime: string;
  venue: string;
  sessionStatus: string;
}

export interface IqPassInput { packs: IqPassPackInput[]; seats: IqPassSeatInput[] }

export type IqPassPackStatus = "active" | "completed" | "expired" | "pending_payment" | "cancelled_hold" | "cancelled";
export type IqPassSeatState = "upcoming" | "played" | "moved" | "cancelled_credit" | "held" | "hold_lost";

export const PACK_STATUS_LABELS: Record<IqPassPackStatus, string> = {
  active: "Active", completed: "Completed", expired: "Expired",
  pending_payment: "Pending payment", cancelled_hold: "Cancelled hold", cancelled: "Cancelled",
};
export const SEAT_STATE_LABELS: Record<IqPassSeatState, string> = {
  upcoming: "Upcoming", played: "Played", moved: "Moved", cancelled_credit: "Cancelled · re-pick credit", held: "Held", hold_lost: "Hold lost",
};

export interface IqPassSeatView {
  bookingId: string;
  sessionId: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  venue: string;
  state: IqPassSeatState;
  stateLabel: string;
}

export interface IqPassPackView {
  packId: string;
  playerName: string;
  playerEmail: string;
  tier: string;
  tierLabel: string;
  priceAed: number;
  paidAt: string | null; // ISO
  paidAtDubai: string | null; // "17 Sep 2026, 03:27"
  createdAt: string; // ISO
  createdAtDubai: string | null; // the hold's start — "17 Sep 2026, 11:25"
  purchaseMonth: string; // YYYY-MM in Dubai — paidAt for paid packs, createdAt for holds
  ziinaRef: string | null;
  gamesTotal: number;
  gamesPicked: number;
  gamesPlayed: number;
  gamesRemaining: number;
  repickCredits: number;
  windowStart: string;
  windowEnd: string;
  firstGame: string | null;
  lastGame: string | null;
  status: IqPassPackStatus;
  statusLabel: string;
  holdExpiresAt: string | null;
  holdExpiresDubai: string | null;
  jerseySize: string | null;
  jerseyHandedOverAt: string | null;
  jerseyHandedOverDubai: string | null;
  jerseyOwed: boolean;
  seats: IqPassSeatView[];
}

export interface IqPassSummary {
  sold: number;
  soldByTier: Record<PackTier, number>;
  revenueAed: number;
  revenueAedByTier: Record<PackTier, number>;
  active: number;
  completed: number;
  expired: number;
  pendingHolds: number;
  cancelledHolds: number;
  jerseysOwed: number;
}

export interface IqPassReport { summary: IqPassSummary; packs: IqPassPackView[]; holds: IqPassPackView[] }

// ── Dubai formatting (deterministic: numeric parts + our own month names) ─────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DUBAI_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function dubaiParts(d: Date | string | null | undefined): { y: string; m: number; d: number; hh: string; mm: string } | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const parts = DUBAI_PARTS.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: Number(get("month")), d: Number(get("day")), hh: get("hour"), mm: get("minute") };
}
/** "17 Sep 2026, 03:27" in Asia/Dubai, 24-hour; null for no timestamp. */
export function formatDubai(d: Date | string | null | undefined): string | null {
  const p = dubaiParts(d);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${p.hh}:${p.mm}` : null;
}
function dubaiMonth(d: Date | string | null | undefined): string | null {
  const p = dubaiParts(d);
  return p ? `${p.y}-${String(p.m).padStart(2, "0")}` : null;
}
const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// ── Pure report ───────────────────────────────────────────────────────────────
function seatState(s: IqPassSeatInput, nowMs: number): IqPassSeatState {
  if (s.status === "pending_payment") return "held";
  if (s.status === "cancelled") {
    if (s.cancellationReason === "iq_pass_move") return "moved";
    if (s.cancellationReason === "iq_pass_hold_expired" || s.cancellationReason === "iq_pass_intent_failed" || s.cancellationReason === "iq_pass_seats_lost") return "hold_lost";
    return "cancelled_credit"; // a ShuttleIQ cancellation — the pack earned a re-pick credit
  }
  if (s.sessionStatus === "cancelled") return "cancelled_credit";
  const ended = sessionStartEpochMs(s.sessionDateIso, s.endTime || "23:59") < nowMs;
  return s.attendedAt || ended ? "played" : "upcoming";
}

function packStatus(p: IqPassPackInput, today: string): IqPassPackStatus {
  if (p.status === "pending_payment") return "pending_payment";
  if (p.status === "cancelled") return p.paidAt ? "cancelled" : "cancelled_hold";
  if (p.status === "completed") return "completed";
  if (p.status === "active") return p.windowEnd < today ? "expired" : "active";
  return p.paidAt ? "cancelled" : "cancelled_hold";
}

const isHold = (s: IqPassPackStatus) => s === "pending_payment" || s === "cancelled_hold";
const isPaid = (s: IqPassPackStatus) => s === "active" || s === "completed" || s === "expired";
const ms = (d: Date | string | null | undefined): number => (d ? new Date(d).getTime() : 0);

export function buildIqPassReport(input: IqPassInput, now: Date): IqPassReport {
  const nowMs = now.getTime();
  const today = todayDubai(now);
  const seatsByPack = new Map<string, IqPassSeatInput[]>();
  for (const s of input.seats) {
    const l = seatsByPack.get(s.packId) ?? [];
    l.push(s);
    seatsByPack.set(s.packId, l);
  }

  const views: IqPassPackView[] = input.packs.map((p) => {
    const status = packStatus(p, today);
    const tier = isPackTier(p.tier) ? p.tier : null;
    const seats = (seatsByPack.get(p.id) ?? [])
      .slice()
      .sort((a, b) => a.sessionDateIso.localeCompare(b.sessionDateIso) || a.startTime.localeCompare(b.startTime))
      .map((s): IqPassSeatView => {
        const state = seatState(s, nowMs);
        return { bookingId: s.bookingId, sessionId: s.sessionId, date: s.sessionDateIso, startTime: s.startTime, venue: s.venue, state, stateLabel: SEAT_STATE_LABELS[state] };
      });
    const live = seats.filter((s) => s.state === "upcoming" || s.state === "played" || s.state === "held");
    const played = live.filter((s) => s.state === "played").length;
    const remaining = live.filter((s) => s.state === "upcoming").length;
    const paid = isPaid(status);
    const jerseyOwed = paid && tier === "club_elite" && !p.jerseyHandedOverAt;
    return {
      packId: p.id,
      playerName: p.playerName,
      playerEmail: p.playerEmail,
      tier: p.tier,
      tierLabel: tier ? IQ_PASS_TIER_LABELS[tier] : p.tier,
      priceAed: p.priceAed,
      paidAt: iso(p.paidAt),
      paidAtDubai: formatDubai(p.paidAt),
      createdAt: iso(p.createdAt) ?? "",
      createdAtDubai: formatDubai(p.createdAt),
      purchaseMonth: dubaiMonth(p.paidAt ?? p.createdAt) ?? "",
      ziinaRef: p.ziinaPaymentIntentId,
      gamesTotal: p.gamesTotal,
      gamesPicked: live.length,
      gamesPlayed: played,
      gamesRemaining: remaining,
      repickCredits: p.repickCredits,
      windowStart: p.windowStart,
      windowEnd: p.windowEnd,
      firstGame: live.length ? live[0].date : null,
      lastGame: live.length ? live[live.length - 1].date : null,
      status,
      statusLabel: PACK_STATUS_LABELS[status],
      holdExpiresAt: iso(p.holdExpiresAt),
      holdExpiresDubai: formatDubai(p.holdExpiresAt),
      jerseySize: p.jerseySize,
      jerseyHandedOverAt: iso(p.jerseyHandedOverAt),
      jerseyHandedOverDubai: formatDubai(p.jerseyHandedOverAt),
      jerseyOwed,
      seats,
    };
  });

  const packsOut = views.filter((v) => !isHold(v.status)).sort((a, b) => (ms(b.paidAt ?? b.createdAt) - ms(a.paidAt ?? a.createdAt)));
  const holdsOut = views.filter((v) => isHold(v.status)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));

  const zero = (): Record<PackTier, number> => ({ club: 0, club_plus: 0, club_elite: 0 });
  const summary: IqPassSummary = {
    sold: 0, soldByTier: zero(), revenueAed: 0, revenueAedByTier: zero(),
    active: 0, completed: 0, expired: 0, pendingHolds: 0, cancelledHolds: 0, jerseysOwed: 0,
  };
  for (const v of views) {
    if (isPaid(v.status)) {
      summary.sold += 1;
      summary.revenueAed += v.priceAed;
      if (isPackTier(v.tier)) { summary.soldByTier[v.tier] += 1; summary.revenueAedByTier[v.tier] += v.priceAed; }
      if (v.jerseyOwed) summary.jerseysOwed += 1;
    }
    if (v.status === "active") summary.active += 1;
    else if (v.status === "completed") summary.completed += 1;
    else if (v.status === "expired") summary.expired += 1;
    else if (v.status === "pending_payment") summary.pendingHolds += 1;
    else if (v.status === "cancelled_hold") summary.cancelledHolds += 1;
  }
  return { summary, packs: packsOut, holds: holdsOut };
}

// ── DB loader (SELECTs only) ─────────────────────────────────────────────────
export async function loadIqPassInput(): Promise<IqPassInput> {
  const { db } = await import("../db");
  const packRows = await db
    .select({
      id: packs.id,
      userId: packs.userId,
      playerName: marketplaceUsers.name,
      playerEmail: marketplaceUsers.email,
      tier: packs.tier,
      gamesTotal: packs.gamesTotal,
      priceAed: packs.priceAed,
      status: packs.status,
      ziinaPaymentIntentId: packs.ziinaPaymentIntentId,
      windowStart: packs.windowStart,
      windowEnd: packs.windowEnd,
      holdExpiresAt: packs.holdExpiresAt,
      paidAt: packs.paidAt,
      cancelledAt: packs.cancelledAt,
      cancellationReason: packs.cancellationReason,
      repickCredits: packs.repickCredits,
      jerseySize: packs.jerseySize,
      jerseyHandedOverAt: packs.jerseyHandedOverAt,
      createdAt: packs.createdAt,
    })
    .from(packs)
    .leftJoin(marketplaceUsers, eq(marketplaceUsers.id, packs.userId));
  const seatRows = await db
    .select({
      bookingId: bookings.id,
      packId: bookings.packId,
      status: bookings.status,
      cancellationReason: bookings.cancellationReason,
      movedFromBookingId: bookings.movedFromBookingId,
      attendedAt: bookings.attendedAt,
      sessionId: bookings.sessionId,
      sessionDateIso: sql<string>`to_char(${bookableSessions.date}, 'YYYY-MM-DD')`,
      startTime: bookableSessions.startTime,
      endTime: bookableSessions.endTime,
      venue: bookableSessions.venueName,
      sessionStatus: bookableSessions.status,
    })
    .from(bookings)
    .innerJoin(bookableSessions, eq(bookableSessions.id, bookings.sessionId))
    .where(isNotNull(bookings.packId));
  return {
    packs: packRows.map((r) => ({ ...r, playerName: r.playerName ?? "(unknown account)", playerEmail: r.playerEmail ?? "" })),
    seats: seatRows.map((r) => ({ ...r, packId: r.packId! })),
  };
}
