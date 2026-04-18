// Minimal Twilio SMS client used for player-link OTP delivery.
// Uses the Twilio REST API directly (no SDK) so the server stays
// dependency-free. SMS delivery is opt-in: if TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are not all present in
// the environment, isSmsConfigured() returns false and callers
// should fall back to a different channel (or surface a clear error).

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

export function isSmsConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!isSmsConfigured()) {
    throw new Error("SMS_NOT_CONFIGURED");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: FROM_NUMBER!, Body: body });
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Twilio SMS error ${res.status}: ${errText.slice(0, 300)}`);
  }
}

export async function sendPlayerLinkOtpSms(toPhone: string, code: string): Promise<void> {
  const body = `Your ShuttleIQ link code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`;
  await sendSms(toPhone, body);
}
