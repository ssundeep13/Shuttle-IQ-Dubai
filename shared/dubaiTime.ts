// Explicit Asia/Dubai clock formatting for player-facing deadline copy.
// The server runs on UTC (Railway) — formatting a payment deadline with the
// process default would state a time hours off from the one the player reads
// on their phone. Every payment-window message goes through here.
export function formatDubaiTime(when: Date | string | number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(when));
}

/** e.g. "5:28 PM on Sat 26 Jul" — the full deadline phrase for notifications. */
export function formatDubaiDeadline(when: Date | string | number): string {
  const d = new Date(when);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  return `${formatDubaiTime(d)} on ${day}`;
}

export const PAYMENT_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Deadline instant for a waitlist-promoted hold. */
export function paymentDeadline(promotedAt: Date | string | number): Date {
  return new Date(new Date(promotedAt).getTime() + PAYMENT_WINDOW_MS);
}
