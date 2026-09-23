// Tournament registration — the three emails. Pure builders (subject + HTML from
// plain inputs, testable without Resend) plus senders that go through
// emailClient.sendTransactionalEmail, which RETHROWS: callers write their
// "*_sent_at" stamp only after a send that went out. Broadcasts are in-app only
// (Q8); these are transactional. The sponsorship deck link never appears here.
import { sendTransactionalEmail } from "../emailClient";
import { formatDubaiDeadline } from "@shared/dubaiTime";
import type { Tournament, TournamentRegistration } from "@shared/schema";

export const TOURNAMENT_PAGE_LINK = 'https://shuttleiq.ai/marketplace/tournament';
export const MY_GAMES_LINK = 'https://shuttleiq.ai/marketplace/my-bookings';
/** Q14 / spec: the one sponsor-interest email goes here. */
export const SPONSOR_INBOX = 'sandeep@shuttleiq.ai';

export const tournamentConfirmIdempotencyKey = (registrationId: string): string => `tournament-confirm/${registrationId}`;
export const tournamentPromotionIdempotencyKey = (registrationId: string, promotedAt: Date | string | null): string =>
  `tournament-promote/${registrationId}/${promotedAt ? new Date(promotedAt).getTime() : 0}`;
export const tournamentSponsorIdempotencyKey = (registrationId: string): string => `tournament-sponsor-interest/${registrationId}`;

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "BASELINE SPORTS ACADEMY DIP" → "Baseline Sports Academy DIP": words of 3 letters or fewer keep their case. */
export function displayVenue(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

type EventFields = Pick<Tournament, 'name' | 'startsAt' | 'endsAt' | 'venueName' | 'venueLocation' | 'venueMapUrl' | 'entryFeeAed' | 'withdrawDeadlineAt'>;

/** "6:00 pm on Sat 17 Oct at Baseline Sports Academy DIP" */
export function eventLine(t: Pick<Tournament, 'startsAt' | 'venueName'>): string {
  return `${formatDubaiDeadline(t.startsAt)} at ${displayVenue(t.venueName)}`;
}

/** The last moment a withdrawal is refunded, as players read it: one second before the exclusive instant. */
export function refundWithdrawBy(t: Pick<Tournament, 'withdrawDeadlineAt'>): string {
  return formatDubaiDeadline(new Date(new Date(t.withdrawDeadlineAt).getTime() - 1000));
}

function shell(heading: string, rows: string, cta: { href: string; label: string } | null, footnote: string): string {
  const button = cta
    ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background-color:#00766C;border-radius:6px;">
              <a href="${cta.href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(cta.label)}</a>
            </td></tr>
          </table>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F2ECE1;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2ECE1;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#002C84;padding:28px 40px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">ShuttleIQ</p>
          <p style="margin:4px 0 0;font-size:13px;color:#C7D2F0;">Premier League</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 20px;font-size:17px;font-weight:600;color:#002C84;line-height:1.5;">${esc(heading)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${rows}</table>
          ${button}
          <p style="margin:0;font-size:13px;color:#5C6577;line-height:1.6;">${esc(footnote)}</p>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#F9F5EC;">
          <p style="margin:0;font-size:12px;color:#626A7C;">ShuttleIQ · Dubai</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const row = (text: string) =>
  `<tr><td style="padding:6px 0;font-size:14px;color:#1A1F2B;border-bottom:1px solid #E6DFD3;">${text}</td></tr>`;

export function buildTournamentConfirmationEmail(input: {
  registration: Pick<TournamentRegistration, 'id' | 'tier' | 'tShirtSize' | 'amountAed'>;
  name: string;
  tournament: EventFields;
}): { subject: string; html: string } {
  const t = input.tournament;
  const r = input.registration;
  const map = t.venueMapUrl ? ` · <a href="${esc(t.venueMapUrl)}" style="color:#006B5F;">${esc(t.venueMapUrl)}</a>` : '';
  const rows = [
    row(`Player: ${esc(input.name)}`),
    row(`Tier: ${esc(r.tier)}`),
    row(`When: ${esc(formatDubaiDeadline(t.startsAt))} to ${esc(formatDubaiDeadline(t.endsAt).split(' on ')[0])}`),
    row(`Where: ${esc(displayVenue(t.venueName))}${t.venueLocation ? `, ${esc(t.venueLocation)}` : ''}${map}`),
    row(`T-shirt: ${esc(r.tShirtSize)}`),
    row(`Entry paid: AED ${r.amountAed}`),
  ].join('');
  return {
    subject: `You're in: ${t.name}`,
    html: shell(
      `You're in the ${t.name}. Teams are drafted on Sun 11 Oct.`,
      rows,
      { href: MY_GAMES_LINK, label: 'See your entry' },
      `Can't make it? Withdraw from My games before ${refundWithdrawBy(t)} for a full refund. After that your spot is released without a refund.`,
    ),
  };
}

export function buildTournamentPromotionEmail(input: {
  registration: Pick<TournamentRegistration, 'id' | 'tier' | 'amountAed' | 'holdExpiresAt'>;
  name: string;
  tournament: EventFields;
}): { subject: string; html: string } {
  const t = input.tournament;
  const r = input.registration;
  const payBy = r.holdExpiresAt ? formatDubaiDeadline(r.holdExpiresAt) : 'the deadline';
  const rows = [
    row(`Player: ${esc(input.name)}`),
    row(`Tier: ${esc(r.tier)}`),
    row(`Event: ${esc(eventLine(t))}`),
    row(`Pay AED ${r.amountAed} by ${esc(payBy)}`),
  ].join('');
  return {
    subject: 'A Premier League spot opened up for you',
    html: shell(
      `A spot opened up in the ${t.name}. It is yours if you pay by ${payBy}.`,
      rows,
      { href: `${TOURNAMENT_PAGE_LINK}?pay=${encodeURIComponent(r.id)}`, label: `Pay AED ${r.amountAed}` },
      'If you do not pay in time, the spot goes to the next player on the waitlist.',
    ),
  };
}

export function buildSponsorInterestEmail(input: { name: string; company: string | null; phone: string | null }): { subject: string; html: string } {
  const company = input.company?.trim() || null;
  const rows = [
    row(`Player: ${esc(input.name)}`),
    row(`Company: ${company ? esc(company) : 'not provided'}`),
    row(`Phone: ${input.phone ? esc(input.phone) : 'not provided'}`),
  ].join('');
  return {
    subject: `Sponsor interest: ${input.name}${company ? ` (${company})` : ''}`,
    html: shell('A player ticked "my company may sponsor a team" while registering for the Premier League.', rows, null, 'Sent once per registration.'),
  };
}

// ─── Senders (rethrow) ─────────────────────────────────────────────────────

export async function sendTournamentConfirmationEmail(to: string, input: Parameters<typeof buildTournamentConfirmationEmail>[0]): Promise<void> {
  const { subject, html } = buildTournamentConfirmationEmail(input);
  const id = await sendTransactionalEmail(to, subject, html, tournamentConfirmIdempotencyKey(input.registration.id));
  console.log(`[Tournament] confirmation email sent (registration ${input.registration.id}, resend ${id ?? 'n/a'})`);
}

export async function sendTournamentPromotionEmail(
  to: string,
  input: Parameters<typeof buildTournamentPromotionEmail>[0] & { registration: { promotedAt: Date | null } },
): Promise<void> {
  const { subject, html } = buildTournamentPromotionEmail(input);
  const id = await sendTransactionalEmail(to, subject, html, tournamentPromotionIdempotencyKey(input.registration.id, input.registration.promotedAt));
  console.log(`[Tournament] promotion email sent (registration ${input.registration.id}, resend ${id ?? 'n/a'})`);
}

export async function sendSponsorInterestEmail(registrationId: string, input: Parameters<typeof buildSponsorInterestEmail>[0]): Promise<void> {
  const { subject, html } = buildSponsorInterestEmail(input);
  const id = await sendTransactionalEmail(SPONSOR_INBOX, subject, html, tournamentSponsorIdempotencyKey(registrationId));
  console.log(`[Tournament] sponsor-interest email sent (registration ${registrationId}, resend ${id ?? 'n/a'})`);
}
