import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'ShuttleIQ <onboarding@resend.dev>';

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: 'Reset your ShuttleIQ password',
    html: `
<!DOCTYPE html>
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

          <!-- Header -->
          <tr>
            <td style="background-color:#0a2540;padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">ShuttleIQ</p>
              <p style="margin:4px 0 0;font-size:13px;color:#94b8d0;">Badminton Court Management</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#0a2540;">Reset your password</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.6;">
                We received a request to reset the password for your ShuttleIQ account.
                Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#0a7ea4;border-radius:6px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#718096;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:13px;color:#0a7ea4;word-break:break-all;">
                <a href="${resetUrl}" style="color:#0a7ea4;">${resetUrl}</a>
              </p>

              <hr style="border:none;border-top:1px solid #e8edf2;margin:0 0 24px;">

              <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7f9fb;padding:20px 40px;border-top:1px solid #e8edf2;">
              <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">
                &copy; ${new Date().getFullYear()} ShuttleIQ. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });

  if (error) {
    console.error('[Resend] Failed to send password reset email:', error);
    throw new Error('Failed to send email');
  }
}
