// IQ Pass — the "your pass is active" email. Pure: builds subject + HTML from
// plain inputs so it renders in tests without Resend; the send lives in
// emailClient.ts (same sender as every other transactional email). One email
// per pack (Resend idempotency key), sent once from the confirm path.
// Never shows per-game maths or savings; no emoji.
export const IQ_PASS_BOOKINGS_LINK = 'https://shuttleiq.ai/marketplace/my-bookings';

export const iqPassConfirmIdempotencyKey = (packId: string): string => `iq-pass-confirm/${packId}`;

export interface IqPassEmailSession {
  title: string;
  venueName: string;
  date: Date | string;   // bookable_sessions.date — Dubai calendar day stored as UTC midnight
  startTime: string;     // "HH:MM" Dubai
  endTime: string;
}

export interface IqPassConfirmationEmailInput {
  packId: string;
  name: string;
  tierLabel: string;     // 'Club' | 'Club Plus' | 'Club Elite'
  gamesTotal: number;
  priceAed: number;      // the pack total (a receipt line, never per game)
  sessions: IqPassEmailSession[];
}

/** Brief, verbatim. */
export function iqPassOpeningLine(tierLabel: string, gamesTotal: number): string {
  return `You're now a ${tierLabel} member of ShuttleIQ. Your IQ Pass is active — ${gamesTotal} games locked.`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 16 Sep · 20:00–22:00 · Venue" from the stored date's UTC Y-M-D (= the Dubai calendar day). */
export function formatSessionLineDubai(s: IqPassEmailSession): string {
  const d = new Date(s.date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${s.startTime}–${s.endTime} · ${s.venueName}`;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildIqPassConfirmationEmail(input: IqPassConfirmationEmailInput): { subject: string; html: string } {
  const subject = `Your IQ Pass is active — ${input.tierLabel}`;
  const lines = input.sessions.map((s) =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#1A1F2B;border-bottom:1px solid #E6DFD3;">${esc(formatSessionLineDubai(s))}</td></tr>`,
  ).join('');
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F2ECE1;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2ECE1;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#002C84;padding:28px 40px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">ShuttleIQ</p>
          <p style="margin:4px 0 0;font-size:13px;color:#C7D2F0;">IQ Pass</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 20px;font-size:17px;font-weight:600;color:#002C84;line-height:1.5;">${esc(iqPassOpeningLine(input.tierLabel, input.gamesTotal))}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#5C6577;line-height:1.6;">Hi ${esc(input.name)}, here are your games. Your month is locked.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${lines}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:4px 0;font-size:14px;color:#5C6577;width:140px;">Pass</td>
              <td style="padding:4px 0;font-size:14px;color:#1A1F2B;font-weight:600;">${esc(input.tierLabel)} · ${input.gamesTotal} games</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:14px;color:#5C6577;">Paid</td>
              <td style="padding:4px 0;font-size:14px;color:#1A1F2B;">AED ${input.priceAed}</td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background-color:#00766C;border-radius:6px;">
              <a href="${IQ_PASS_BOOKINGS_LINK}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">See my games</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#5C6577;line-height:1.6;">You can move any game up to five hours before it starts from My Bookings. Games that are not played expire with the pass.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#F9F5EC;">
          <p style="margin:0;font-size:12px;color:#626A7C;">ShuttleIQ · Dubai</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}
