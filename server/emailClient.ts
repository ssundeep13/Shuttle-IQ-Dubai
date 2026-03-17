import { Resend } from 'resend';
import type { BookableSession } from '../shared/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'ShuttleIQ <noreply@shuttleiq.org>';

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0a2540;padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">ShuttleIQ</p>
              <p style="margin:4px 0 0;font-size:13px;color:#94b8d0;">Badminton Court Management</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f7f9fb;padding:20px 40px;border-top:1px solid #e8edf2;">
              <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">&copy; ${new Date().getFullYear()} ShuttleIQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr>
      <td style="background-color:#0a7ea4;border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function sessionBlock(session: BookableSession): string {
  const dateStr = new Date(session.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const mapLink = session.venueMapUrl
    ? `<a href="${session.venueMapUrl}" style="color:#0a7ea4;font-size:13px;text-decoration:none;" target="_blank">View on Google Maps &rarr;</a>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fb;border-radius:6px;margin-bottom:24px;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0a2540;">${session.title}</p>
        <p style="margin:0 0 2px;font-size:14px;color:#4a5568;">${session.venueName}${session.venueLocation ? `, ${session.venueLocation}` : ''}</p>
        ${mapLink ? `<p style="margin:0 0 4px;">${mapLink}</p>` : ''}
        <p style="margin:0 0 2px;font-size:14px;color:#4a5568;">${dateStr}</p>
        <p style="margin:0;font-size:14px;color:#4a5568;">${session.startTime} &ndash; ${session.endTime}</p>
      </td>
    </tr>
  </table>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
}

// ─── Password Reset ────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Reset your password</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      We received a request to reset the password for your ShuttleIQ account.
      Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
    </p>
    ${ctaButton(resetUrl, 'Reset My Password')}
    <p style="margin:0 0 8px;font-size:13px;color:#718096;">If the button above doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 28px;font-size:13px;color:#0a7ea4;word-break:break-all;"><a href="${resetUrl}" style="color:#0a7ea4;">${resetUrl}</a></p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  `;
  try {
    await sendEmail(toEmail, 'Reset your ShuttleIQ password', emailWrapper(body));
  } catch (err) {
    console.error('[Email] sendPasswordResetEmail failed:', err);
    throw err;
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(toEmail: string, name: string, marketplaceUrl: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Welcome to ShuttleIQ, ${name}!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      Your account is ready. Browse upcoming badminton sessions, book your spot, and track your stats — all in one place.
    </p>
    ${ctaButton(marketplaceUrl, 'Browse Sessions')}
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't create this account, please ignore this email.</p>
  `;
  try {
    await sendEmail(toEmail, 'Welcome to ShuttleIQ!', emailWrapper(body));
    console.log(`[Email] Welcome sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendWelcomeEmail failed:', err);
  }
}

// ─── Booking Confirmation ──────────────────────────────────────────────────

export async function sendBookingConfirmationEmail(
  toEmail: string,
  name: string,
  session: BookableSession,
  paymentMethod: string,
  amountAed: number,
): Promise<void> {
  const paymentLabel = paymentMethod === 'cash' ? 'Cash (pay at venue)' : 'Card (paid online)';
  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">Booking confirmed!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${name}, your spot is locked in. Here are your booking details:</p>
    ${sessionBlock(session)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#718096;width:140px;">Amount</td>
        <td style="padding:4px 0;font-size:14px;color:#0a2540;font-weight:600;">AED ${amountAed}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#718096;">Payment</td>
        <td style="padding:4px 0;font-size:14px;color:#0a2540;">${paymentLabel}</td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">Please arrive a few minutes early. Don't forget your racket and non-marking shoes.</p>
  `;
  try {
    await sendEmail(toEmail, `Booking confirmed: ${session.title}`, emailWrapper(body));
    console.log(`[Email] Booking confirmation sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendBookingConfirmationEmail failed:', err);
  }
}

// ─── Waitlist Promotion ───────────────────────────────────────────────────

export async function sendWaitlistPromotionEmail(
  toEmail: string,
  name: string,
  session: BookableSession,
): Promise<void> {
  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">Great news — you're confirmed!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${name}, a spot just opened up and you've been moved from the waitlist to confirmed for:</p>
    ${sessionBlock(session)}
    <p style="margin:0 0 28px;font-size:14px;color:#4a5568;line-height:1.6;">Your original payment or booking method remains in place. See you on the court!</p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you can no longer make it, please cancel as soon as possible so another player can take your spot.</p>
  `;
  try {
    await sendEmail(toEmail, `You're confirmed: ${session.title}`, emailWrapper(body));
    console.log(`[Email] Waitlist promotion sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendWaitlistPromotionEmail failed:', err);
  }
}

// ─── Cancellation Confirmation ────────────────────────────────────────────

export async function sendCancellationEmail(
  toEmail: string,
  name: string,
  session: BookableSession,
  lateFeeApplied: boolean,
  amountAed: number,
): Promise<void> {
  const lateFeeNote = lateFeeApplied
    ? `<p style="margin:0 0 20px;font-size:14px;color:#c53030;line-height:1.6;background-color:#fff5f5;border-radius:6px;padding:12px 16px;">
        <strong>Late cancellation fee applied:</strong> Because this cancellation was made within 5 hours of the session, your payment of AED ${amountAed} has been retained as per our cancellation policy.
       </p>`
    : '';
  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">Booking cancelled</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${name}, your booking for the following session has been cancelled:</p>
    ${sessionBlock(session)}
    ${lateFeeNote}
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">We hope to see you at a future session.</p>
  `;
  try {
    await sendEmail(toEmail, `Booking cancelled: ${session.title}`, emailWrapper(body));
    console.log(`[Email] Cancellation email sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendCancellationEmail failed:', err);
  }
}

// ─── Session Reminder ─────────────────────────────────────────────────────
// NOTE: This function rethrows on failure so the scheduler can track success/failure
// and only mark reminderSentAt when the email actually delivered.

export async function sendSessionReminderEmail(
  toEmail: string,
  name: string,
  session: BookableSession,
): Promise<void> {
  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">Your session is tomorrow!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${name}, just a reminder that you have a badminton session coming up:</p>
    ${sessionBlock(session)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-radius:6px;margin-bottom:28px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0a2540;">What to bring</p>
          <p style="margin:0 0 4px;font-size:14px;color:#4a5568;">&#x2713;&nbsp; Badminton racket</p>
          <p style="margin:0 0 4px;font-size:14px;color:#4a5568;">&#x2713;&nbsp; Non-marking indoor shoes</p>
          <p style="margin:0 0 4px;font-size:14px;color:#4a5568;">&#x2713;&nbsp; Water bottle</p>
          <p style="margin:0;font-size:14px;color:#4a5568;">&#x2713;&nbsp; Sports clothing</p>
        </td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you can no longer make it, please cancel as soon as possible so another player can take your spot.</p>
  `;
  // Intentionally rethrows so the scheduler can distinguish success from failure
  // and only set reminderSentAt when the email actually delivers.
  await sendEmail(toEmail, `Reminder: ${session.title} is tomorrow`, emailWrapper(body));
  console.log(`[Email] Reminder sent to ${toEmail}`);
}

export async function sendDisputeResolutionEmail(
  toEmail: string,
  params: {
    playerName: string;
    status: 'resolved' | 'dismissed';
    gameScore: string;
    gameDate: Date;
    adminNote?: string | null;
  }
): Promise<void> {
  const { playerName, status, gameScore, gameDate, adminNote } = params;
  const dateStr = gameDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isResolved = status === 'resolved';
  const statusLabel = isResolved ? 'Resolved' : 'Dismissed';
  const statusColor = isResolved ? '#059669' : '#a0aec0';
  const adminNoteHtml = adminNote
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fb;border-radius:6px;margin-bottom:24px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0a2540;">Note from the admin</p>
            <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;">${adminNote}</p>
          </td>
        </tr>
      </table>`
    : '';
  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a2540;letter-spacing:-0.3px;">Score Dispute Update</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${playerName}, your score dispute has been reviewed.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fb;border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px;color:#6b7280;padding-bottom:6px;">Game</td>
              <td style="font-size:13px;color:#6b7280;padding-bottom:6px;text-align:right;">Status</td>
            </tr>
            <tr>
              <td>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a2540;">${gameScore}</p>
                <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${dateStr}</p>
              </td>
              <td style="text-align:right;">
                <span style="display:inline-block;padding:4px 12px;border-radius:20px;background-color:${statusColor}20;color:${statusColor};font-size:13px;font-weight:600;">${statusLabel}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${adminNoteHtml}

    <p style="margin:0 0 24px;font-size:14px;color:#4a5568;line-height:1.6;">
      ${isResolved
        ? 'Your dispute has been reviewed and the game score has been updated accordingly. Your updated stats will be reflected in your profile.'
        : 'Your dispute has been reviewed by our team. After careful consideration, the original score has been kept as recorded.'}
    </p>

    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you have further questions, please contact the session organiser directly.</p>
  `;
  await sendEmail(toEmail, `Score Dispute ${statusLabel} — ShuttleIQ`, emailWrapper(body));
  console.log(`[Email] Dispute resolution email sent to ${toEmail} (${status})`);
}
