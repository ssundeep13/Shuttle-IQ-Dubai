// Tournament registration — the player actions, over an injected deps object
// so the rules are tested without a database: register, pay (a new or promoted
// hold), withdraw, the sponsor tick, my entry, and the public view that feeds
// the home banner, the pinned Sessions row and the per-tier counter.
// buildTournamentDeps wires the real store, Ziina client and notices.
import { buildTournamentReturnUrls } from "../ziinaReturn";
import { createZiinaPaymentIntent, retrieveZiinaPaymentIntent, isZiinaPaymentSuccessful } from "../ziinaClient";
import { ziinaIntentIsDead } from "../rebookGuard";
import { TOURNAMENT_TIERS, tournamentTierFor } from "@shared/tournamentTiers";
import type { Tournament, TournamentRegistration } from "@shared/schema";
import { previewUserIds } from "./flag";
import { accessFor, decideRegistration, holdExpiresAt, registrationPhase } from "./rules";
import { isTournamentMember } from "./membership";
import { tournamentStore, type Account, type CreateRegistrationInput, type CreateRegistrationResult, type TierCounts, type WithdrawTxResult } from "./store";
import { confirmRegistrationByIntentId, type ConfirmOutcome } from "./confirm";
import { notifyPromotedRegistrations } from "./jobs";
import { sendSponsorInterestEmail } from "./email";

export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
/** Ziina receipt line (50-byte cap): fixed, no name, no tier. */
export const TOURNAMENT_ZIINA_MESSAGE = 'ShuttleIQ Premier League entry';
const COMPANY_MAX = 100;

export type TournamentDeps = {
  now(): Date;
  getCurrentTournament(): Promise<Tournament | undefined>;
  getTournament(id: string): Promise<Tournament | undefined>;
  getAccount(userId: string): Promise<Account | undefined>;
  getPlayer(playerId: string): Promise<{ id: string; level: string; skillScore: number } | undefined>;
  isMember(userId: string): Promise<boolean>;
  isPreviewUser(userId: string): boolean;
  countsByTier(tournamentId: string): Promise<TierCounts>;
  getRegistration(id: string): Promise<TournamentRegistration | undefined>;
  getActiveRegistrationForUser(tournamentId: string, userId: string): Promise<TournamentRegistration | undefined>;
  createRegistration(input: CreateRegistrationInput): Promise<CreateRegistrationResult>;
  /** Conditional: only over `expectedCurrent` (null = none yet). False when another request attached first. */
  attachIntent(registrationId: string, intentId: string, expectedCurrent: string | null): Promise<boolean>;
  /** Cancel a fresh hold whose intent could not be created (only while no intent is attached); the freed seat is offered to the waitlist. */
  cancelHold(registrationId: string, reason: string): Promise<{ cancelled: boolean; promoted: TournamentRegistration[] }>;
  withdraw(registrationId: string, userId: string, now: Date): Promise<WithdrawTxResult>;
  setSponsorInterest(registrationId: string, userId: string, interested: boolean): Promise<TournamentRegistration | undefined>;
  createIntent(input: { amountAed: number; message: string; successUrl: string; cancelUrl: string; failureUrl: string }): Promise<{ id: string; redirect_url: string }>;
  retrieveIntent(intentId: string): Promise<{ status: string; redirect_url?: string; success_url?: string }>;
  isSuccessful(status: string): boolean;
  /** Can this intent never be paid? NOT true for "requires_payment_instrument" — that is every fresh, unpaid intent (the Gate 15 lesson). */
  isIntentDead(status: string): boolean;
  confirm(intentId: string): Promise<ConfirmOutcome>;
  /** Fire-and-forget: the ONE sponsor-interest email (stamped). */
  onSponsorInterest(registrationId: string): void;
  onPromoted(promoted: TournamentRegistration[]): Promise<void>;
  allowedSchemes(): string[];
  baseUrl(): string;
};

export type Out = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Out => ({ status, body: { error } });
const ok = (body: Record<string, unknown>): Out => ({ status: 200, body });

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** What a player sees of their own entry. */
export function toRegistrationView(r: TournamentRegistration) {
  return {
    id: r.id,
    tournamentId: r.tournamentId,
    tier: r.tier,
    status: r.status,
    amountAed: r.amountAed,
    holdExpiresAt: iso(r.holdExpiresAt),
    paidAt: iso(r.paidAt),
    promotedAt: iso(r.promotedAt),
    withdrawnAt: iso(r.withdrawnAt),
    refundStatus: r.refundStatus ?? null,
    tShirtSize: r.tShirtSize,
    company: r.company ?? null,
    shareWithSponsors: r.shareWithSponsors,
    sponsorInterest: r.sponsorInterest,
    createdAt: iso(r.createdAt),
  };
}

function publicTournament(t: Tournament) {
  return {
    id: t.id,
    name: t.name,
    startsAt: iso(t.startsAt),
    endsAt: iso(t.endsAt),
    venueName: t.venueName,
    venueLocation: t.venueLocation ?? null,
    venueMapUrl: t.venueMapUrl ?? null,
    entryFeeAed: t.entryFeeAed,
    registrationOpensAtMembers: iso(t.registrationOpensAtMembers),
    registrationOpensAt: iso(t.registrationOpensAt),
    registrationClosesAt: iso(t.registrationClosesAt),
    withdrawDeadlineAt: iso(t.withdrawDeadlineAt),
    draftCutoffAt: iso(t.draftCutoffAt),
    deckUrl: t.deckUrl ?? null,
  };
}

async function accessOf(t: Tournament, userId: string | null, now: Date, deps: TournamentDeps) {
  const phase = registrationPhase(t, now);
  const isPreview = userId ? deps.isPreviewUser(userId) : false;
  const isMember = userId && phase === 'members_only' && !isPreview ? await deps.isMember(userId) : false;
  return { phase, ...accessFor(phase, { isMember, isPreview }) };
}

/**
 * The payment step for a hold: Ziina first. A paid intent is confirmed; a live
 * one is reused (never a second intent for the same entry); a terminally
 * unpaid one is replaced. A new hold whose intent cannot be created is cancelled.
 */
async function startOrResumePayment(
  reg: TournamentRegistration,
  t: Tournament,
  opts: { isNewHold: boolean; returnScheme?: string },
  deps: TournamentDeps,
): Promise<Out> {
  const now = deps.now();
  if (reg.ziinaPaymentIntentId) {
    let intent: { status: string; redirect_url?: string };
    try { intent = await deps.retrieveIntent(reg.ziinaPaymentIntentId); }
    catch { return fail(502, 'payment_status_unavailable'); }
    if (deps.isSuccessful(intent.status)) {
      await deps.confirm(reg.ziinaPaymentIntentId);
      const fresh = (await deps.getRegistration(reg.id)) ?? reg;
      return ok({ registration: toRegistrationView(fresh) });
    }
    if (reg.holdExpiresAt && new Date(reg.holdExpiresAt).getTime() <= now.getTime()) return fail(409, 'hold_expired');
    // A live intent is never replaced: the player may still pay on the page it opened.
    if (!deps.isIntentDead(intent.status)) {
      return intent.redirect_url
        ? ok({ registration: toRegistrationView(reg), redirectUrl: intent.redirect_url })
        : fail(409, 'payment_in_progress');
    }
    // Dead intent: a fresh one replaces it below (conditional on that same dead id).
  } else if (reg.holdExpiresAt && new Date(reg.holdExpiresAt).getTime() <= now.getTime()) {
    return fail(409, 'hold_expired');
  }

  const urls = buildTournamentReturnUrls({ baseUrl: deps.baseUrl(), registrationId: reg.id, returnScheme: opts.returnScheme, allowedSchemes: deps.allowedSchemes() });
  let intent: { id: string; redirect_url: string };
  try {
    intent = await deps.createIntent({ amountAed: reg.amountAed ?? t.entryFeeAed, message: TOURNAMENT_ZIINA_MESSAGE, ...urls });
  } catch (e) {
    console.error('[Tournament] intent creation failed', { registrationId: reg.id, error: e instanceof Error ? e.message : e });
    if (opts.isNewHold) {
      const c = await deps.cancelHold(reg.id, 'intent_failed');
      if (c.promoted.length > 0) {
        try { await deps.onPromoted(c.promoted); }
        catch (err) { console.error('[Tournament] promotion notices after a failed start failed:', err instanceof Error ? err.message : err); }
      }
    }
    return fail(502, 'payment_start_failed');
  }
  if (await deps.attachIntent(reg.id, intent.id, reg.ziinaPaymentIntentId ?? null)) {
    return ok({ registration: toRegistrationView({ ...reg, ziinaPaymentIntentId: intent.id }), redirectUrl: intent.redirect_url });
  }
  // Lost the race (a double submit attached its intent first): hand back the WINNER's link.
  // Our own intent is never shown to anyone, so it can never be paid.
  const winner = await deps.getRegistration(reg.id);
  if (!winner) return fail(404, 'not_found');
  if (winner.status === 'confirmed') return ok({ registration: toRegistrationView(winner) });
  if (winner.status !== 'pending_payment' || !winner.ziinaPaymentIntentId) return fail(409, 'not_payable');
  let live: { status: string; redirect_url?: string };
  try { live = await deps.retrieveIntent(winner.ziinaPaymentIntentId); }
  catch { return fail(502, 'payment_status_unavailable'); }
  if (deps.isSuccessful(live.status)) {
    await deps.confirm(winner.ziinaPaymentIntentId);
    return ok({ registration: toRegistrationView((await deps.getRegistration(reg.id)) ?? winner) });
  }
  if (live.redirect_url && !deps.isIntentDead(live.status)) return ok({ registration: toRegistrationView(winner), redirectUrl: live.redirect_url });
  return fail(409, 'payment_in_progress');
}

export async function registerForTournament(input: { userId: string; body: unknown }, deps: TournamentDeps): Promise<Out> {
  const t = await deps.getCurrentTournament();
  if (!t || t.status !== 'published') return fail(404, 'not_found');

  const account = await deps.getAccount(input.userId);
  if (!account) return fail(400, 'user_not_found');
  if (!account.linkedPlayerId) return fail(403, 'link_player_first');
  const player = await deps.getPlayer(account.linkedPlayerId);
  if (!player) return fail(403, 'link_player_first');
  const tier = tournamentTierFor(player.level);
  if (!tier) return fail(409, 'tier_unresolved');

  const b = (input.body ?? {}) as Record<string, unknown>;
  if (typeof b.tShirtSize !== 'string' || !(TSHIRT_SIZES as readonly string[]).includes(b.tShirtSize)) return fail(400, 'invalid_t_shirt_size');
  let company: string | null = null;
  if (b.company !== undefined && b.company !== null) {
    if (typeof b.company !== 'string') return fail(400, 'invalid_company');
    const c = b.company.trim();
    if (c.length > COMPANY_MAX) return fail(400, 'invalid_company');
    company = c || null;
  }
  for (const k of ['shareWithSponsors', 'sponsorInterest'] as const) {
    if (b[k] !== undefined && typeof b[k] !== 'boolean') return fail(400, 'invalid_opt_in');
  }
  const shareWithSponsors = b.shareWithSponsors === true;
  const sponsorInterest = b.sponsorInterest === true;
  const returnScheme = typeof b.returnScheme === 'string' && b.returnScheme ? b.returnScheme : undefined;

  const now = deps.now();
  const access = await accessOf(t, input.userId, now, deps);
  if (!access.canRegister) return access.phase === 'closed' ? fail(409, 'registration_closed') : fail(403, 'registration_not_open');

  const result = await deps.createRegistration({
    tournamentId: t.id,
    userId: input.userId,
    playerId: player.id,
    tier,
    levelAtRegistration: player.level,
    skillScoreAtRegistration: player.skillScore,
    tShirtSize: b.tShirtSize,
    company,
    shareWithSponsors,
    sponsorInterest,
    amountAed: t.entryFeeAed,
    now,
    holdExpiresAt: holdExpiresAt(now, t.holdMinutes, t.draftCutoffAt),
  });
  if (result.kind === 'full') return fail(409, 'tier_full');
  if (result.kind === 'conflict') return fail(409, 'already_registered');

  const reg = result.registration;
  if (result.kind === 'created' && reg.sponsorInterest) {
    try { deps.onSponsorInterest(reg.id); } catch (e) { console.error('[Tournament] sponsor hook failed:', e instanceof Error ? e.message : e); }
  }
  if (reg.status !== 'pending_payment') return ok({ registration: toRegistrationView(reg) });
  return startOrResumePayment(reg, t, { isNewHold: result.kind === 'created', returnScheme }, deps);
}

export async function payRegistration(input: { userId: string; registrationId: string; returnScheme?: string }, deps: TournamentDeps): Promise<Out> {
  const reg = await deps.getRegistration(input.registrationId);
  if (!reg || reg.userId !== input.userId) return fail(404, 'not_found');
  if (reg.status === 'confirmed') return ok({ registration: toRegistrationView(reg) });
  if (reg.status !== 'pending_payment') return fail(409, 'not_payable');
  const t = await deps.getTournament(reg.tournamentId);
  if (!t) return fail(404, 'not_found');
  return startOrResumePayment(reg, t, { isNewHold: false, returnScheme: input.returnScheme }, deps);
}

export async function withdrawRegistration(input: { userId: string; registrationId: string }, deps: Pick<TournamentDeps, 'now' | 'withdraw' | 'onPromoted'>): Promise<Out> {
  const r = await deps.withdraw(input.registrationId, input.userId, deps.now());
  if (r.kind === 'not_found') return fail(404, 'not_found');
  if (r.kind === 'not_allowed') return fail(409, r.reason === 'after_cutoff' ? 'withdraw_closed' : 'not_active');
  if (r.promoted.length > 0) {
    try { await deps.onPromoted(r.promoted); }
    catch (e) { console.error('[Tournament] promotion notices after a withdrawal failed:', e instanceof Error ? e.message : e); }
  }
  return ok({ registration: toRegistrationView(r.registration), refund: r.refund });
}

export async function setSponsorInterest(input: { userId: string; registrationId: string; interested: unknown }, deps: TournamentDeps): Promise<Out> {
  if (typeof input.interested !== 'boolean') return fail(400, 'invalid_opt_in');
  const reg = await deps.setSponsorInterest(input.registrationId, input.userId, input.interested);
  if (!reg) return fail(404, 'not_found');
  if (input.interested) {
    try { deps.onSponsorInterest(reg.id); } catch (e) { console.error('[Tournament] sponsor hook failed:', e instanceof Error ? e.message : e); }
  }
  return ok({ registration: toRegistrationView(reg) });
}

export async function getMyEntry(userId: string, deps: TournamentDeps): Promise<Out> {
  const t = await deps.getCurrentTournament();
  if (!t || t.status !== 'published') return ok({ tournament: null, registration: null, eligibleTier: null, canRegister: false });
  const [reg, account] = await Promise.all([deps.getActiveRegistrationForUser(t.id, userId), deps.getAccount(userId)]);
  const access = await accessOf(t, userId, deps.now(), deps);
  let eligibleTier: string | null = null;
  let reason: string | undefined;
  if (!account?.linkedPlayerId) reason = 'link_player_first';
  else {
    const player = await deps.getPlayer(account.linkedPlayerId);
    eligibleTier = player ? tournamentTierFor(player.level) : null;
    if (!eligibleTier) reason = player ? 'tier_unresolved' : 'link_player_first';
  }
  return ok({
    tournament: access.visible || reg ? publicTournament(t) : null,
    registration: reg ? toRegistrationView(reg) : null,
    eligibleTier,
    // Whether registration is open to this player at all (phase + a resolvable tier); the UI shows the entry when one exists.
    canRegister: access.canRegister && !!eligibleTier,
    ...(reason ? { reason } : {}),
  });
}

export async function getPublicView(viewerUserId: string | null, deps: TournamentDeps): Promise<Out> {
  const t = await deps.getCurrentTournament();
  if (!t || t.status !== 'published') return ok({ visible: false });
  const access = await accessOf(t, viewerUserId, deps.now(), deps);
  if (!access.visible) return ok({ visible: false });
  const counts = await deps.countsByTier(t.id);
  const tiers = TOURNAMENT_TIERS.map((tier) => {
    const cap = Number((t.tierCaps as Record<string, number>)[tier] ?? 0);
    const c = counts[tier] ?? { held: 0, waitlisted: 0 };
    const d = decideRegistration(c, { cap, waitlistCap: t.waitlistCapPerTier });
    return { tier, cap, held: c.held, waitlisted: c.waitlisted, waitlistCap: t.waitlistCapPerTier, state: d === 'hold' ? 'open' : d };
  });
  return ok({ visible: true, phase: access.phase, canRegister: access.canRegister, tournament: publicTournament(t), tiers });
}

// ─── Production wiring ────────────────────────────────────────────────────

/** Send the ONE sponsor-interest email for a registration: skipped when not ticked or already stamped. */
export async function sendSponsorInterestOnce(registrationId: string): Promise<void> {
  const reg = await tournamentStore.getRegistration(registrationId);
  if (!reg || !reg.sponsorInterest || reg.sponsorInterestEmailedAt) return;
  const [account, player] = await Promise.all([tournamentStore.getAccount(reg.userId), tournamentStore.getPlayer(reg.playerId)]);
  await sendSponsorInterestEmail(reg.id, {
    name: account?.name ?? 'A player',
    company: reg.company ?? null,
    phone: account?.phone || player?.phone || null,
  });
  await tournamentStore.markSponsorEmailed(reg.id, new Date());
}

export function buildTournamentDeps(opts: { baseUrl(): string; allowedSchemes(): string[] }): TournamentDeps {
  return {
    now: () => new Date(),
    getCurrentTournament: () => tournamentStore.getCurrentTournament(),
    getTournament: (id) => tournamentStore.getTournament(id),
    getAccount: (userId) => tournamentStore.getAccount(userId),
    getPlayer: (playerId) => tournamentStore.getPlayer(playerId),
    isMember: (userId) => isTournamentMember(userId),
    isPreviewUser: (userId) => previewUserIds().has(userId),
    countsByTier: (id) => tournamentStore.countsByTier(id),
    getRegistration: (id) => tournamentStore.getRegistration(id),
    getActiveRegistrationForUser: (tid, uid) => tournamentStore.getActiveRegistrationForUser(tid, uid),
    createRegistration: (input) => tournamentStore.createRegistration(input),
    attachIntent: (id, intentId, expected) => tournamentStore.attachIntent(id, intentId, expected),
    cancelHold: (id, reason) => tournamentStore.cancelHold(id, reason),
    withdraw: (id, userId, now) => tournamentStore.withdraw(id, userId, now),
    setSponsorInterest: (id, userId, interested) => tournamentStore.setSponsorInterest(id, userId, interested),
    createIntent: (input) => createZiinaPaymentIntent(input),
    retrieveIntent: (intentId) => retrieveZiinaPaymentIntent(intentId),
    isSuccessful: (status) => isZiinaPaymentSuccessful(status),
    isIntentDead: (status) => ziinaIntentIsDead(status),
    confirm: (intentId) => confirmRegistrationByIntentId(intentId),
    onSponsorInterest: (id) => {
      sendSponsorInterestOnce(id).catch((e) => console.error(`[Tournament] sponsor-interest email failed for ${id} (not stamped):`, e instanceof Error ? e.message : e));
    },
    onPromoted: (promoted) => notifyPromotedRegistrations(promoted),
    allowedSchemes: opts.allowedSchemes,
    baseUrl: opts.baseUrl,
  };
}
