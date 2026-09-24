// ShuttleIQ League — every player-facing string of the tournament screens.
// Brand voice (Sandeep, 2026-09-23): direct, no emoji, tier display names only
// (Professional, Competitive, Intermediate, Beginner). Times are Asia/Dubai.
import { formatDubaiDeadline, formatDubaiTime } from '@shared/dubaiTime';

/**
 * The deck link ships ONLY together with the PDF (a test pins this to the file's
 * existence). Shipped 2026-09-24 with client/public/docs/shuttleiq-league-sponsorship.pdf
 * (Sandeep's renamed deck, SHA-256 de2df57a…c61b).
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
