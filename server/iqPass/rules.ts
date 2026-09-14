// IQ Pass — pure rules. No DB, no HTTP, no clock of its own (callers pass
// `now`). Tier table, the 50% pack-seat cap, the rolling 4-week window, pick
// validation at purchase, the 5-hour move cutoff and jersey eligibility.
// Every number here is the locked product spec; players never see the
// per-seat allocation (finance only).
import { sessionStartEpochMs } from "@shared/sessionTime";

export type PackTier = 'club' | 'club_plus' | 'club_elite';

export const PACK_TIER_ORDER: readonly PackTier[] = ['club', 'club_plus', 'club_elite'] as const;

export const IQ_PASS_TIERS: Record<PackTier, { label: string; games: number; priceAed: number; allocationAed: number }> = {
  // allocationAed × games === priceAed exactly — no rounding drift into finance.
  club:       { label: 'Club',       games: 4,  priceAed: 188, allocationAed: 47 },
  club_plus:  { label: 'Club Plus',  games: 8,  priceAed: 360, allocationAed: 45 },
  club_elite: { label: 'Club Elite', games: 12, priceAed: 516, allocationAed: 43 },
};

export function isPackTier(x: unknown): x is PackTier {
  return typeof x === 'string' && (PACK_TIER_ORDER as readonly string[]).includes(x);
}

/** Club Plus and Club Elite — priority waitlist. */
export function isPlusOrAbove(tier: PackTier): boolean {
  return tier !== 'club';
}

export const HOLD_MINUTES = 30;
export const PACK_CAP_RATIO = 0.5;
export const WINDOW_DAYS = 28;
export const MOVE_CUTOFF_MS = 5 * 60 * 60 * 1000;

/** Pack seats allowed on a session: half its capacity, floored (18→9, 24→12, 36→18). */
export function packSeatCap(capacity: number): number {
  return Math.floor(Math.max(0, capacity) * PACK_CAP_RATIO);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Plain 'YYYY-MM-DD' arithmetic (no timezone involved). */
export function addDaysDubai(dateYmd: string, days: number): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Today's Dubai calendar day. Asia/Dubai is UTC+4 with no DST (same rule as shared/sessionTime.ts). */
export function todayDubai(now: Date = new Date()): string {
  return ymd(new Date(now.getTime() + 4 * 60 * 60 * 1000));
}

/**
 * The 4-week window a purchase may pick from. With a current pass the window
 * opens the day after its last picked game (never in the past).
 */
export function windowFor(today: string, currentPassLastGame: string | null): { start: string; end: string } {
  let start = today;
  if (currentPassLastGame) {
    const next = addDaysDubai(currentPassLastGame, 1);
    if (next > start) start = next;
  }
  return { start, end: addDaysDubai(start, WINDOW_DAYS - 1) };
}

export type CalendarSession = {
  id: string;
  dateDubai: string;       // 'YYYY-MM-DD'
  status: string;          // bookable_sessions.status
  linked: boolean;         // linked_session_id IS NOT NULL (only linked sessions are bookable)
  capacity: number;
  spotsRemaining: number;  // live: capacity − (confirmed + attended + pending_payment)
  packSeats: number;       // live: pack seats already on the session (non-cancelled)
};

export type PickError =
  | 'pick_count' | 'duplicate_pick' | 'unknown_session' | 'session_unavailable' | 'out_of_window'
  | 'already_booked' | 'session_full' | 'pack_cap_reached';

export type PickValidation = { ok: true } | { ok: false; status: 400 | 409; error: PickError; sessionId?: string };

/** Every purchase-time rule in one place. Order: shape errors (400) before state conflicts (409). */
export function validatePicks(input: {
  tier: PackTier;
  picks: string[];
  window: { start: string; end: string };
  sessions: CalendarSession[];
  alreadyBookedSessionIds: Set<string>;
}): PickValidation {
  const need = IQ_PASS_TIERS[input.tier].games;
  if (input.picks.length !== need) return { ok: false, status: 400, error: 'pick_count' };
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const seen = new Set<string>();
  for (const id of input.picks) {
    if (seen.has(id)) return { ok: false, status: 400, error: 'duplicate_pick', sessionId: id };
    seen.add(id);
    const s = byId.get(id);
    if (!s) return { ok: false, status: 400, error: 'unknown_session', sessionId: id };
    if (s.status !== 'upcoming' || !s.linked) return { ok: false, status: 400, error: 'session_unavailable', sessionId: id };
    if (s.dateDubai < input.window.start || s.dateDubai > input.window.end) return { ok: false, status: 400, error: 'out_of_window', sessionId: id };
    if (input.alreadyBookedSessionIds.has(id)) return { ok: false, status: 409, error: 'already_booked', sessionId: id };
    if (s.spotsRemaining < 1) return { ok: false, status: 409, error: 'session_full', sessionId: id };
    if (s.packSeats >= packSeatCap(s.capacity)) return { ok: false, status: 409, error: 'pack_cap_reached', sessionId: id };
  }
  return { ok: true };
}

/** Ruling E3(a): a seat can move until 5 hours before the session it is leaving. */
export function canMoveSeat(sessionDate: Date | string, startTime: string, now: Date): boolean {
  return now.getTime() < sessionStartEpochMs(sessionDate, startTime) - MOVE_CUTOFF_MS;
}

/** Jersey: first Club Elite purchase only. */
export function jerseyEligible(tier: PackTier, priorElitePacks: number): boolean {
  return tier === 'club_elite' && priorElitePacks === 0;
}

/**
 * Priority waitlist (Club Plus / Club Elite first). Stable within each group;
 * returns the SAME array when nobody has priority so a flag-off app keeps
 * today's created_at order byte for byte.
 */
export function sortWaitlistWithPriority<T extends { userId: string }>(rows: T[], priorityUserIds: Set<string>): T[] {
  if (priorityUserIds.size === 0) return rows;
  const first: T[] = [];
  const rest: T[] = [];
  for (const r of rows) (priorityUserIds.has(r.userId) ? first : rest).push(r);
  return first.length === 0 ? rows : [...first, ...rest];
}
