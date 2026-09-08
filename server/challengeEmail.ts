// Player Challenges C6 — the "you've been challenged" email. Pure: builds the
// subject + HTML from plain inputs so it can be rendered in tests without
// Resend; the send lives in emailClient.ts (same sender + footer text as the
// booking confirmation). Transactional only — no unsubscribe footer.
//
// Idempotency: one email per challenge id. The create route is the only send
// site (it runs once per inserted row — the partial unique index on open
// pairs stops a double tap creating two rows), and the send carries Resend's
// idempotency key `challenge-received/<challengeId>`, so a retried send of the
// same challenge inside Resend's 24h window returns the original message
// instead of a second delivery. No schema change.
import { getTierDisplayName } from "@shared/utils/skillUtils";
import { firstName } from "@shared/utils/challengeViews";
import { recordLine } from "@shared/utils/headToHeadCopy";
import type { HeadToHeadRecord } from "./headToHead";

// C7: the Challenges card lives on the Stats page (/marketplace/my-scores).
export const CHALLENGES_DEEP_LINK = 'https://shuttleiq.ai/marketplace/my-scores#challenges';

export const challengeEmailIdempotencyKey = (challengeId: string): string => `challenge-received/${challengeId}`;

/** The challenged player's marketplace account email, or null (skip silently). */
export function challengeEmailRecipient(user: { email?: string | null } | null | undefined): string | null {
  const email = user?.email?.trim() ?? '';
  return email.length > 0 ? email : null;
}

export interface ChallengeEmailPlayer {
  name: string;
  level: string;       // DB enum — rendered through getTierDisplayName only
  skillScore: number;
}

export interface ChallengeReceivedEmailInput {
  challengeId: string;
  challenger: ChallengeEmailPlayer;
  challenged: ChallengeEmailPlayer;
  /** Head-to-head from the CHALLENGED player's side (me = challenged). */
  headToHead: HeadToHeadRecord;
  expiresAt: Date | string;
}

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 'Mon 14 Sep, 3:53 pm' in Dubai time (en-US parts, so September is "Sep", not "Sept"). */
export function formatExpiryDubai(when: Date | string): string {
  const d = when instanceof Date ? when : new Date(when);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

const NAVY = '#003E8C';
const CREAM = '#F5EFE0';
const INK = '#1A1F2B';
const INK_SUB = '#5C6577';
const RULE = '#E6DFD3';
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export function buildChallengeReceivedEmail(input: ChallengeReceivedEmailInput): { subject: string; html: string } {
  const challengerFirst = firstName(input.challenger.name) || input.challenger.name;
  const challengedFirst = firstName(input.challenged.name) || input.challenged.name;
  const subject = `${challengerFirst} has challenged you`;
  const h2h = recordLine(input.headToHead, challengerFirst);
  const expiry = formatExpiryDubai(input.expiresAt);
  const year = new Date().getFullYear();
  const cf = esc(challengerFirst);
  const df = esc(challengedFirst);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid ${RULE};border-radius:8px;">
          <tr>
            <td style="padding:36px 40px 32px;">
              <p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${NAVY};">ShuttleIQ</p>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${cf} has challenged you</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">Hi ${df}, ${cf} (${esc(getTierDisplayName(input.challenger.level))} &middot; ${input.challenger.skillScore} pts) has challenged you (${esc(getTierDisplayName(input.challenged.level))} &middot; ${input.challenged.skillScore} pts).</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;font-weight:700;color:${NAVY};">${esc(h2h)}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${INK_SUB};">Accept and the challenge settles itself the next time you play on opposite sides of the net &mdash; the captain's score decides it.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background-color:${NAVY};border-radius:6px;">
                    <a href="${CHALLENGES_DEEP_LINK}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Accept challenge</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:${INK_SUB};"><a href="${CHALLENGES_DEEP_LINK}" style="color:${NAVY};text-decoration:underline;">Decline</a> if you'd rather not.</p>
              <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 20px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_SUB};">This challenge expires on ${esc(expiry)} if you don't respond. Only you and ${cf} can see this challenge until it's accepted.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM};padding:20px 40px;border-top:1px solid ${RULE};">
              <p style="margin:0;font-size:12px;color:${INK_SUB};text-align:center;">&copy; ${year} ShuttleIQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
