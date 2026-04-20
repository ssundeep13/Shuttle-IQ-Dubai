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

// ─── Email Verification ───────────────────────────────────────────────────

export async function sendEmailVerificationEmail(toEmail: string, name: string, verifyUrl: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Verify your email</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      Hi ${name}, confirm this is your email so you can link your ShuttleIQ player profile, recover your account, and receive booking updates.
      This link expires in <strong>24 hours</strong>.
    </p>
    ${ctaButton(verifyUrl, 'Verify My Email')}
    <p style="margin:0 0 8px;font-size:13px;color:#718096;">If the button above doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 28px;font-size:13px;color:#0a7ea4;word-break:break-all;"><a href="${verifyUrl}" style="color:#0a7ea4;">${verifyUrl}</a></p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't create a ShuttleIQ account, you can safely ignore this email.</p>
  `;
  try {
    await sendEmail(toEmail, 'Verify your ShuttleIQ email', emailWrapper(body));
    console.log(`[Email] Verification sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendEmailVerificationEmail failed:', err);
    throw err;
  }
}

// ─── Player Link OTP ──────────────────────────────────────────────────────

export async function sendPlayerLinkOtpEmail(toEmail: string, playerName: string, code: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Confirm your player profile</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.6;">
      Someone is trying to link the ShuttleIQ player profile <strong>${playerName}</strong> to their marketplace account.
      If that's you, enter the code below to finish linking. The code expires in <strong>10 minutes</strong>.
    </p>
    <div style="margin:0 0 24px;padding:18px 24px;background-color:#f7f9fb;border-radius:6px;text-align:center;">
      <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:6px;color:#0a2540;">${code}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't request this, you can safely ignore this email — your player profile will stay unlinked.</p>
  `;
  try {
    await sendEmail(toEmail, `Your ShuttleIQ link code: ${code}`, emailWrapper(body));
  } catch (err) {
    console.error('[Email] sendPlayerLinkOtpEmail failed:', err);
    throw err;
  }
}

export async function sendPlayerContactChangeOtpEmail(toEmail: string, playerName: string, code: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Confirm your new email</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.6;">
      Someone is trying to update the contact email on the ShuttleIQ player profile <strong>${playerName}</strong> to this address.
      If that's you, enter the code below to confirm. The code expires in <strong>10 minutes</strong>.
    </p>
    <div style="margin:0 0 24px;padding:18px 24px;background-color:#f7f9fb;border-radius:6px;text-align:center;">
      <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:6px;color:#0a2540;">${code}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't request this, you can safely ignore this email — the player profile contact info won't change.</p>
  `;
  try {
    await sendEmail(toEmail, `Confirm your ShuttleIQ contact update: ${code}`, emailWrapper(body));
  } catch (err) {
    console.error('[Email] sendPlayerContactChangeOtpEmail failed:', err);
    throw err;
  }
}

export async function sendMarketplaceContactChangeOtpEmail(toEmail: string, code: string): Promise<void> {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Confirm your new email</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.6;">
      Someone requested to change the email address on a ShuttleIQ marketplace account to this address.
      If that's you, enter the code below to confirm. The code expires in <strong>10 minutes</strong>.
    </p>
    <div style="margin:0 0 24px;padding:18px 24px;background-color:#f7f9fb;border-radius:6px;text-align:center;">
      <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:6px;color:#0a2540;">${code}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you didn't request this, you can safely ignore this email — the account email won't change.</p>
  `;
  try {
    await sendEmail(toEmail, `Confirm your ShuttleIQ account email update: ${code}`, emailWrapper(body));
  } catch (err) {
    console.error('[Email] sendMarketplaceContactChangeOtpEmail failed:', err);
    throw err;
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(toEmail: string, name: string, marketplaceUrl: string, referrerName?: string): Promise<void> {
  const referralNote = referrerName
    ? `<p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">You were referred by <strong>${referrerName}</strong> — attend your first session and they'll earn a reward!</p>`
    : '';
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Welcome to ShuttleIQ, ${name}!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      Your account is ready. Browse upcoming badminton sessions, book your spot, and track your stats — all in one place.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      We've sent you a separate email with a link to verify your address. Verifying lets you link your existing player profile and recover your account if you forget your password.
    </p>
    ${referralNote}
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
  checkoutUrl?: string,
): Promise<void> {
  const paymentNote = checkoutUrl
    ? `<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.6;">
        To secure your spot, please complete payment within the next <strong>4 hours</strong>. Your spot will be released to the next player on the waitlist if payment is not received in time.
       </p>
       <p style="margin:0 0 28px;">
         <a href="${checkoutUrl}" style="display:inline-block;background-color:#003e8c;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Complete Payment</a>
       </p>`
    : `<p style="margin:0 0 28px;font-size:14px;color:#4a5568;line-height:1.6;">See you on the court!</p>`;

  const headline = checkoutUrl
    ? `A spot opened up — complete payment to confirm!`
    : `Great news — you're confirmed!`;
  const subline = checkoutUrl
    ? `Hi ${name}, a spot just opened up and you've been moved from the waitlist for:`
    : `Hi ${name}, a spot just opened up and you've been moved from the waitlist to confirmed for:`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">${headline}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">${subline}</p>
    ${sessionBlock(session)}
    ${paymentNote}
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">If you can no longer make it, please cancel as soon as possible so another player can take your spot.</p>
  `;
  const subject = checkoutUrl
    ? `Spot available — complete payment to confirm: ${session.title}`
    : `You're confirmed: ${session.title}`;
  try {
    await sendEmail(toEmail, subject, emailWrapper(body));
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

// ─── Guest Booking Notification ───────────────────────────────────────────────

export async function sendGuestBookingEmail(
  toEmail: string,
  guestName: string,
  bookedByName: string,
  session: BookableSession,
  cancelUrl: string,
  signupUrl?: string,
): Promise<void> {
  const signupCta = signupUrl
    ? `<hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
       <p style="margin:0 0 16px;font-size:13px;color:#718096;line-height:1.6;">Want to track your stats, manage your bookings, and join future sessions? Create a free ShuttleIQ account — your email is already pre-filled!</p>
       <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#0e7490;border-radius:6px;"><a href="${signupUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Create Your ShuttleIQ Account</a></td></tr></table>`
    : '';
  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:#0a2540;">You've been booked in!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">Hi ${guestName}, <strong>${bookedByName}</strong> has reserved a spot for you at an upcoming badminton session. Here are your details:</p>
    ${sessionBlock(session)}
    <p style="margin:0 0 28px;font-size:14px;color:#4a5568;line-height:1.6;">Please arrive a few minutes early. Don't forget your racket and non-marking shoes.</p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0 0 16px;font-size:13px;color:#718096;line-height:1.6;">Can't make it? You can cancel your spot using the link below. Please cancel as soon as possible so another player can take your spot.</p>
    ${ctaButton(cancelUrl, 'Cancel My Spot')}
    <p style="margin:0 0 24px;font-size:12px;color:#a0aec0;line-height:1.6;">This link is unique to you. Please do not share it.</p>
    ${signupCta}
  `;
  try {
    await sendEmail(toEmail, `You've been booked: ${session.title}`, emailWrapper(body));
    console.log(`[Email] Guest booking notification sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendGuestBookingEmail failed:', err);
  }
}

// ─── Referral Credit Earned ──────────────────────────────────────────────

export async function sendReferralCreditEmail(
  toEmail: string,
  referrerName: string,
  refereeName: string,
  newBalanceFils: number,
): Promise<void> {
  const balanceAed = (newBalanceFils / 100).toFixed(2);
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">You earned AED 15!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      Hi ${referrerName}, your friend <strong>${refereeName}</strong> just attended their first session. As a thank you for referring them, we've added <strong>AED 15</strong> to your ShuttleIQ wallet.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Your wallet balance</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#0a2540;">AED ${balanceAed}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;color:#4a5568;line-height:1.6;">
      Use your wallet credit on your next booking. Keep referring friends to earn more!
    </p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">Wallet credit is automatically applied at checkout.</p>
  `;
  try {
    await sendEmail(toEmail, 'You earned AED 15 — Referral reward!', emailWrapper(body));
    console.log(`[Email] Referral credit email sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendReferralCreditEmail failed:', err);
  }
}

// ─── Referral Milestone ─────────────────────────────────────────────────

export async function sendReferralMilestoneEmail(
  toEmail: string,
  name: string,
  milestone: 5 | 10,
): Promise<void> {
  const isFive = milestone === 5;
  const headline = isFive
    ? 'You made the Referral Leaderboard!'
    : 'You\'re a ShuttleIQ Ambassador!';
  const description = isFive
    ? `You've referred <strong>5 friends</strong> who attended their first session. You're now featured on the ShuttleIQ referral leaderboard — nice work!`
    : `You've referred <strong>10 friends</strong> who attended their first session. You've earned <strong>Ambassador status</strong> and a ShuttleIQ jersey is on its way to you!`;
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">${headline}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
      Hi ${name}, ${description}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:40px;font-weight:700;color:#0a7ea4;">${milestone}</p>
          <p style="margin:0;font-size:14px;color:#4a5568;">Successful Referrals</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;color:#4a5568;line-height:1.6;">
      ${isFive ? 'Keep going — at 10 referrals you earn Ambassador status and a free ShuttleIQ jersey!' : 'Thank you for being an incredible part of the ShuttleIQ community.'}
    </p>
    <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">
    <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">Share your referral code with friends to keep growing the community.</p>
  `;
  try {
    await sendEmail(toEmail, headline, emailWrapper(body));
    console.log(`[Email] Referral milestone (${milestone}) email sent to ${toEmail}`);
  } catch (err) {
    console.error('[Email] sendReferralMilestoneEmail failed:', err);
  }
}

// ─── Score Dispute Resolution ────────────────────────────────────────────

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
