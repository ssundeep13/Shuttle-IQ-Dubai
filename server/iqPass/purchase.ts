// IQ Pass — purchase orchestration. Calendar (the 4-week window + live seat
// counts) and startPurchase (hold → one Ziina intent for the pack price →
// intent attached). Everything runs over an injected deps object so the
// rules can be tested without a database; defaultPurchaseDeps wires the real
// store + Ziina client in marketplace-routes.ts.
import { buildZiinaReturnUrls } from "../ziinaReturn";
import { HOLD_MINUTES, IQ_PASS_TIERS, isPackTier, jerseyEligible, packSeatCap, todayDubai, validatePicks, windowFor, type PackTier } from "./rules";
import { PickConflictError, type CalendarRow, type HoldInput } from "./store";
import type { Pack } from "@shared/schema";

export { PickConflictError };

export const JERSEY_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

export type PurchaseDeps = {
  now(): Date;
  getPacksForUser(userId: string): Promise<Pack[]>;
  getLastPickedGameDate(packId: string): Promise<string | null>;
  listCalendarSessions(start: string, end: string): Promise<CalendarRow[]>;
  getActiveBookingSessionIdsForUser(userId: string): Promise<Set<string>>;
  getUser(userId: string): Promise<{ id: string; name: string; email: string } | undefined>;
  createHold(input: HoldInput): Promise<{ packId: string; bookingIds: string[] }>;
  attachIntent(packId: string, intentId: string): Promise<void>;
  cancelHold(packId: string, reason: string): Promise<unknown>;
  mintResumeParam(userId: string, bookingId: string): Promise<string>;
  createIntent(input: { amountAed: number; message: string; successUrl: string; cancelUrl: string; failureUrl: string }): Promise<{ id: string; redirect_url: string }>;
  allowedSchemes(): string[];
  baseUrl(): string;
};

export type CalendarView = {
  window: { start: string; end: string };
  currentPass: { id: string; tier: PackTier; label: string; gamesTotal: number; lastGameDate: string | null } | null;
  jerseyEligibleForElite: boolean;
  sessions: Array<CalendarRow & { packSeatsLeft: number; alreadyBooked: boolean }>;
};

export type PurchaseResult =
  | { ok: true; packId: string; redirectUrl: string }
  | { ok: false; status: 400 | 409 | 502; error: string; sessionId?: string };

const err = (status: 400 | 409 | 502, error: string, sessionId?: string): PurchaseResult => ({ ok: false, status, error, sessionId });

function priorElitePacks(all: Pack[]): number {
  return all.filter((p) => p.tier === 'club_elite' && (p.status === 'active' || p.status === 'completed')).length;
}

export async function buildCalendar(userId: string, deps: PurchaseDeps): Promise<CalendarView> {
  const today = todayDubai(deps.now());
  const all = await deps.getPacksForUser(userId);
  const active = all.filter((p) => p.status === 'active');
  let lastGame: string | null = null;
  let current: CalendarView['currentPass'] = null;
  for (const p of active) {
    const d = await deps.getLastPickedGameDate(p.id);
    if (d && (!lastGame || d > lastGame)) lastGame = d;
    if (!current || (d ?? '') > (current.lastGameDate ?? '')) {
      current = { id: p.id, tier: p.tier as PackTier, label: IQ_PASS_TIERS[p.tier as PackTier].label, gamesTotal: p.gamesTotal, lastGameDate: d };
    }
  }
  const window = windowFor(today, lastGame);
  const [rows, booked] = await Promise.all([
    deps.listCalendarSessions(window.start, window.end),
    deps.getActiveBookingSessionIdsForUser(userId),
  ]);
  return {
    window,
    currentPass: current,
    jerseyEligibleForElite: jerseyEligible('club_elite', priorElitePacks(all)),
    sessions: rows.map((r) => ({
      ...r,
      packSeatsLeft: Math.max(0, packSeatCap(r.capacity) - r.packSeats),
      alreadyBooked: booked.has(r.id),
    })),
  };
}

export async function startPurchase(
  input: { userId: string; tier: unknown; sessionIds: unknown; jerseySize?: unknown; returnScheme?: string },
  deps: PurchaseDeps,
): Promise<PurchaseResult> {
  if (!isPackTier(input.tier)) return err(400, 'invalid_tier');
  const tier = input.tier;
  if (!Array.isArray(input.sessionIds) || !input.sessionIds.every((s) => typeof s === 'string')) return err(400, 'invalid_picks');
  const sessionIds = input.sessionIds as string[];
  const t = IQ_PASS_TIERS[tier];

  const all = await deps.getPacksForUser(input.userId);
  if (all.some((p) => p.status === 'pending_payment')) return err(409, 'hold_in_progress');

  // Jersey: first Club Elite purchase only; size is required then, ignored otherwise.
  let jerseySize: string | null = null;
  if (jerseyEligible(tier, priorElitePacks(all))) {
    const raw = input.jerseySize;
    if (raw === undefined || raw === null || raw === '') return err(400, 'jersey_size_required');
    if (typeof raw !== 'string' || !(JERSEY_SIZES as readonly string[]).includes(raw)) return err(400, 'invalid_jersey_size');
    jerseySize = raw;
  }

  const cal = await buildCalendar(input.userId, deps);
  const v = validatePicks({
    tier,
    picks: sessionIds,
    window: cal.window,
    sessions: cal.sessions,
    alreadyBookedSessionIds: new Set(cal.sessions.filter((s) => s.alreadyBooked).map((s) => s.id)),
  });
  if (!v.ok) return err(v.status, v.error, v.sessionId);

  const user = await deps.getUser(input.userId);
  if (!user) return err(400, 'user_not_found');

  const now = deps.now();
  let hold: { packId: string; bookingIds: string[] };
  try {
    hold = await deps.createHold({
      userId: input.userId,
      user: { name: user.name, email: user.email },
      tier,
      sessionIds,
      jerseySize,
      window: cal.window,
      holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60 * 1000),
    });
  } catch (e) {
    if (e instanceof PickConflictError) return err(e.conflict.status, e.conflict.error, e.conflict.sessionId);
    throw e;
  }

  const resumeParam = await deps.mintResumeParam(input.userId, hold.bookingIds[0]);
  const urls = buildZiinaReturnUrls({
    baseUrl: deps.baseUrl(),
    bookingId: hold.bookingIds[0],
    packId: hold.packId,
    resumeParam,
    returnScheme: input.returnScheme,
    allowedSchemes: deps.allowedSchemes(),
  });
  let intent: { id: string; redirect_url: string };
  try {
    intent = await deps.createIntent({
      amountAed: t.priceAed,
      message: `ShuttleIQ IQ Pass · ${t.label}`,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      failureUrl: urls.failureUrl,
    });
  } catch (e) {
    console.error('[IQ Pass] intent creation failed — hold cancelled', { packId: hold.packId, error: e instanceof Error ? e.message : e });
    await deps.cancelHold(hold.packId, 'intent_failed');
    return err(502, 'payment_start_failed');
  }
  await deps.attachIntent(hold.packId, intent.id);
  return { ok: true, packId: hold.packId, redirectUrl: intent.redirect_url };
}
