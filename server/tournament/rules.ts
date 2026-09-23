// Tournament registration — pure rules. No DB, no clock: callers pass `now`.
// Every deadline on the tournaments row is an EXCLUSIVE instant (open while
// now < X), so "closes 23:59 Thu 8 Oct Dubai" is stored as 2026-10-08T20:00:00Z
// and a registration at 23:59:59 still counts (Sandeep, Q1, 2026-09-23).

export type RegistrationDecision = 'hold' | 'waitlist' | 'full';

/**
 * held = confirmed + pending_payment rows of the tier (a held seat is taken).
 * A newcomer gets a seat only when every waiting player could be seated first:
 * a freed seat belongs to the waitlist, never to whoever registers next.
 */
export function decideRegistration(
  counts: { held: number; waitlisted: number },
  limits: { cap: number; waitlistCap: number },
): RegistrationDecision {
  if (counts.held + counts.waitlisted < limits.cap) return 'hold';
  if (counts.waitlisted < limits.waitlistCap) return 'waitlist';
  return 'full';
}

export type RegistrationPhase = 'before_open' | 'members_only' | 'open' | 'closed';

/** Two-stage open (2026-09-23): Club Plus + Elite members first, then everyone. */
export function registrationPhase(
  t: { registrationOpensAtMembers: Date | null; registrationOpensAt: Date; registrationClosesAt: Date },
  now: Date,
): RegistrationPhase {
  const ms = now.getTime();
  if (ms >= t.registrationClosesAt.getTime()) return 'closed';
  if (ms >= t.registrationOpensAt.getTime()) return 'open';
  if (t.registrationOpensAtMembers && ms >= t.registrationOpensAtMembers.getTime()) return 'members_only';
  return 'before_open';
}

export function canRegister(phase: RegistrationPhase, isMember: boolean): boolean {
  return phase === 'open' || (phase === 'members_only' && isMember);
}

/** Page, home banner and pinned Sessions row: hidden before the open, members-only in the members stage. */
export function isVisibleTo(phase: RegistrationPhase, isMember: boolean): boolean {
  if (phase === 'before_open') return false;
  if (phase === 'members_only') return isMember;
  return true;
}

/** 24 h (hold_minutes) to pay, never past the draft cut-off (Q3). */
export function holdExpiresAt(from: Date, holdMinutes: number, draftCutoffAt: Date): Date {
  return new Date(Math.min(from.getTime() + holdMinutes * 60_000, draftCutoffAt.getTime()));
}

/** Waitlist promotions stop at the draft cut-off (exclusive). */
export function canPromote(now: Date, draftCutoffAt: Date): boolean {
  return now.getTime() < draftCutoffAt.getTime();
}

export const ACTIVE_REGISTRATION_STATUSES = ['pending_payment', 'confirmed', 'waitlisted'] as const;

export type WithdrawOutcome =
  | { allowed: true; refund: 'pending' | 'not_due' | null }
  | { allowed: false; reason: 'after_cutoff' | 'not_active' };

/**
 * Q4: before the withdraw deadline a paid entry is owed a refund (the app records
 * it; the refund itself is done in the Ziina dashboard). From the deadline to the
 * draft cut-off a withdrawal frees the seat with no refund. From the cut-off it
 * is blocked. Nothing paid → nothing to refund.
 */
export function withdrawOutcome(
  reg: { status: string; paid: boolean },
  now: Date,
  t: { withdrawDeadlineAt: Date; draftCutoffAt: Date },
): WithdrawOutcome {
  if (!(ACTIVE_REGISTRATION_STATUSES as readonly string[]).includes(reg.status)) return { allowed: false, reason: 'not_active' };
  if (now.getTime() >= t.draftCutoffAt.getTime()) return { allowed: false, reason: 'after_cutoff' };
  if (!reg.paid) return { allowed: true, refund: null };
  return { allowed: true, refund: now.getTime() < t.withdrawDeadlineAt.getTime() ? 'pending' : 'not_due' };
}

/**
 * Gate 2: what the caller may do in a phase. Members (any ACTIVE IQ Pass) get the
 * members stage. Accounts on TOURNAMENT_PREVIEW_USER_IDS see the page and may
 * register before the open (Sandeep's pre-open AED 100 test), never after the close.
 */
export function accessFor(
  phase: RegistrationPhase,
  who: { isMember: boolean; isPreview: boolean },
): { visible: boolean; canRegister: boolean } {
  if (who.isPreview && phase !== 'closed') return { visible: true, canRegister: true };
  return { visible: isVisibleTo(phase, who.isMember), canRegister: canRegister(phase, who.isMember) };
}

/** Member = holds an ACTIVE IQ Pass of any type (Sandeep, 2026-09-23). */
export function isMemberFromPacks(packs: Array<{ tier: string; status: string }>): boolean {
  return packs.some((p) => p.status === 'active');
}
