// ShuttleIQ League — every player-facing string of the tournament screens.
// Brand voice (Sandeep, 2026-09-23): direct, no emoji, tier display names only
// (Professional, Competitive, Intermediate, Beginner). Times are Asia/Dubai.
import { formatDubaiDeadline, formatDubaiTime } from '@shared/dubaiTime';

/**
 * The deck link ships ONLY together with the PDF (a test pins this to the file's
 * existence). Shipped 2026-09-24 with client/public/docs/shuttleiq-league-sponsorship.pdf
 * (Sandeep's renamed deck; footer fix 2026-09-24, SHA-256 aa7735f0…8556).
 */
export const TOURNAMENT_DECK_AVAILABLE = true;
/** Absolute on purpose: a relative link would stay inside the native shell, which cannot render PDFs. */
export const TOURNAMENT_DECK_URL = 'https://shuttleiq.ai/docs/shuttleiq-league-sponsorship.pdf';

export const SPONSOR_HEADING = 'Want to sponsor a team?';
export const SPONSOR_LINE = 'Team sponsor AED 1,500 · Title sponsor AED 6,000 · in-kind welcome';
export const SPONSOR_DECK_LABEL = 'View sponsorship deck';
export const SPONSOR_TICK = 'My company may sponsor a team';
export const SHARE_TICK = 'Share my details with sponsors';

export const PAGE_UNAVAILABLE = 'The ShuttleIQ League is not open right now.';
export const PAGE_NOT_OPEN_YET = 'ShuttleIQ League registration is not open yet.';
export const SIGN_IN_LABEL = 'Sign in to register';
export const COMPLETE_PROFILE_LABEL = 'Finish your player profile to register';

export type TierState = { tier: string; cap: number; held: number; waitlisted: number; waitlistCap: number; state: 'open' | 'waitlist' | 'full' };

/** "Competitive · 12 of 18 filled" (holds count as filled). */
export function counterLine(t: TierState): string {
  const base = `${t.tier} · ${t.held} of ${t.cap} filled`;
  if (t.state === 'waitlist') return `${base} · waitlist open`;
  if (t.state === 'full') return `${base} · waitlist full`;
  return base;
}

/** "BASELINE SPORTS ACADEMY DIP" → "Baseline Sports Academy DIP" (same rule as the server emails). */
export function displayVenue(name: string): string {
  return name.split(/\s+/).filter(Boolean)
    .map((w) => (w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Sat 17 Oct, 6:00 pm to 10:00 pm · Baseline Sports Academy DIP" */
export function eventLine(t: { startsAt: string; endsAt: string; venueName: string }): string {
  return `${dayFmt.format(new Date(t.startsAt))}, ${formatDubaiTime(t.startsAt)} to ${formatDubaiTime(t.endsAt)} · ${displayVenue(t.venueName)}`;
}

/** The last registrable minute of an exclusive deadline, as players read it: "Thu 8 Oct 23:59". */
export function refundDeadlineLabel(exclusiveIso: string): string {
  const d = new Date(new Date(exclusiveIso).getTime() - 60_000);
  return `${dayFmt.format(d)} ${hmFmt.format(d)}`;
}

// ─── Home banner / Dashboard card (redesign, Sandeep 2026-09-24) ─────────────

const dubaiParts = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return { h12: h % 12 === 0 ? 12 : h % 12, m, suffix: h < 12 ? 'am' : 'pm' };
};
const shortClock = (x: { h12: number; m: number }) => (x.m === 0 ? String(x.h12) : `${x.h12}:${String(x.m).padStart(2, '0')}`);

/** "BASELINE SPORTS ACADEMY DIP" → "Baseline DIP" (the banner's short venue). */
export function shortVenue(name: string): string {
  return displayVenue(name).split(' ').filter((w) => !/^(sports|academy)$/i.test(w)).join(' ');
}

/** "Sat 17 Oct · 6–10 pm · Baseline DIP" */
export function bannerMetaLine(t: { startsAt: string; endsAt: string; venueName: string }): string {
  const a = dubaiParts(t.startsAt);
  const b = dubaiParts(t.endsAt);
  const range = a.suffix === b.suffix ? `${shortClock(a)}–${shortClock(b)} ${b.suffix}` : `${shortClock(a)} ${a.suffix}–${shortClock(b)} ${b.suffix}`;
  return `${dayFmt.format(new Date(t.startsAt))} · ${range} · ${shortVenue(t.venueName)}`;
}

export const BANNER_FEE_SUB = 'entry';

/** "FRI 6:00 PM" — an opening instant in Dubai, for the overline. */
export function opensLabel(iso: string): string {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short' }).format(new Date(iso));
  return `${day} ${formatDubaiTime(iso)}`.toUpperCase();
}

type BannerViewish = { phase: 'before_open' | 'members_only' | 'open' | 'closed'; canRegister: boolean; tournament: { registrationOpensAtMembers: string | null; registrationOpensAt: string; registrationClosesAt: string } };

export function bannerOverline(v: BannerViewish): string {
  if (v.phase === 'closed') return 'TOURNAMENT · REGISTRATION CLOSED';
  if (v.phase === 'open') return 'TOURNAMENT · REGISTRATION OPEN';
  if (v.phase === 'members_only' && v.canRegister) return 'TOURNAMENT · IQ PASS EARLY ACCESS';
  const next = v.phase === 'before_open' ? (v.tournament.registrationOpensAtMembers ?? v.tournament.registrationOpensAt) : v.tournament.registrationOpensAt;
  return `TOURNAMENT · OPENS ${opensLabel(next)}`;
}

/** The card's single action: "Your entry" → My games when the player has an entry, else Register / See details. */
export function bannerAction(v: BannerViewish, hasEntry: boolean): { label: string; href: string } {
  if (hasEntry) return { label: 'Your entry', href: '/marketplace/my-bookings' };
  if ((v.phase === 'open' || v.phase === 'members_only') && v.canRegister) return { label: 'Register', href: '/marketplace/tournament' };
  return { label: 'See details', href: '/marketplace/tournament' };
}

/** "Closes Thu 8 Oct · your tier is locked at registration" (the close instant is exclusive). */
export function bannerFootLine(v: Pick<BannerViewish, 'phase' | 'tournament'>): string {
  const day = dayFmt.format(new Date(new Date(v.tournament.registrationClosesAt).getTime() - 60_000));
  return v.phase === 'closed' ? `Registration closed ${day}` : `Closes ${day} · your tier is locked at registration`;
}

export type TierTile = { kind: 'count'; filled: number; cap: number } | { kind: 'waitlist'; text: string } | { kind: 'full'; text: string };

export function tierTile(t: TierState): TierTile {
  if (t.state === 'waitlist') return { kind: 'waitlist', text: `Full · waitlist ${t.waitlisted}/${t.waitlistCap}` };
  if (t.state === 'full') return { kind: 'full', text: 'Full' };
  return { kind: 'count', filled: t.held, cap: t.cap };
}

export function earlyAccessLine(registrationOpensAt: string): string {
  return `Early access for IQ Pass members. Registration opens to everyone at ${formatDubaiDeadline(registrationOpensAt)}.`;
}

export function closedLine(registrationClosesAt: string): string {
  return `Registration closed on ${refundDeadlineLabel(registrationClosesAt)}.`;
}

export function registerButtonLabel(t: TierState | undefined, feeAed: number): string {
  if (!t || t.state === 'open') return `Pay AED ${feeAed}`;
  if (t.state === 'waitlist') return 'Join the waitlist';
  return `${t.tier} is full`;
}

export function statusLine(r: { status: string; tier: string; holdExpiresAt: string | null; amountAed: number }): string {
  switch (r.status) {
    case 'pending_payment':
      return `${r.tier} · awaiting payment · pay AED ${r.amountAed}${r.holdExpiresAt ? ` by ${formatDubaiDeadline(r.holdExpiresAt)}` : ''}`;
    case 'confirmed': return `${r.tier} · you're in`;
    case 'waitlisted': return `${r.tier} · on the waitlist · we'll tell you if a spot opens`;
    case 'withdrawn': return `${r.tier} · withdrawn`;
    default: return `${r.tier} · spot released`;
  }
}

export function withdrawDialogCopy(input: { withdrawDeadlineAt: string; paid: boolean; now: Date; amountAed?: number }): { title: string; body: string; confirm: string } {
  const label = refundDeadlineLabel(input.withdrawDeadlineAt);
  const amount = input.amountAed ?? 100;
  const title = 'Withdraw from the ShuttleIQ League?';
  if (!input.paid) {
    return { title, body: 'You have not paid, so there is nothing to refund. Your spot goes to the next player on the waitlist.', confirm: 'Withdraw' };
  }
  if (input.now.getTime() >= new Date(input.withdrawDeadlineAt).getTime()) {
    return { title, body: `The refund deadline (${label}) has passed, so withdrawing now gives no refund. Your spot goes to the next player on the waitlist.`, confirm: 'Withdraw without refund' };
  }
  return {
    title,
    body: `Withdraw before ${label} for a full refund of AED ${amount}. After that your spot is released with no refund. Refunds are handled manually via Ziina within 5 working days.`,
    confirm: 'Withdraw and request refund',
  };
}

const ERRORS: Record<string, string> = {
  tier_full: 'Your tier is full, including the waitlist.',
  registration_closed: 'Registration has closed.',
  registration_not_open: 'Registration is not open to you yet.',
  link_player_first: 'Finish your player profile first, so we know your tier.',
  tier_unresolved: 'We could not confirm your tier. Message us and we will sort it out.',
  hold_expired: 'Your 24 hours to pay have passed and the spot was released.',
  payment_in_progress: 'Your payment is still being set up. Try again in a minute.',
  payment_start_failed: 'We could not start the card payment. Try again in a moment.',
  payment_status_unavailable: 'We could not reach the payment provider. Try again in a moment.',
  already_registered: 'This player is already registered.',
  withdraw_closed: 'Withdrawals closed at the draft cut-off.',
  not_payable: 'This entry has nothing to pay.',
  invalid_t_shirt_size: 'Choose a T-shirt size.',
  invalid_company: 'Company name must be 100 characters or fewer.',
  not_active: 'This entry is no longer active.',
};
export function errorCopy(code: string | null | undefined): string {
  return (code && ERRORS[code]) || 'Something went wrong. Please try again.';
}
