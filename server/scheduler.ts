import { storage } from "./storage";
import { sendSessionReminderEmail } from "./emailClient";

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function runReminderJob(): Promise<void> {
  try {
    const bookings = await storage.getBookingsNeedingReminder();
    if (bookings.length === 0) return;

    console.log(`[Scheduler] Processing ${bookings.length} session reminder(s)...`);
    for (const booking of bookings) {
      if (!booking.user?.email) continue;
      try {
        // sendSessionReminderEmail rethrows on failure — only mark sent when it succeeds
        await sendSessionReminderEmail(booking.user.email, booking.user.name, booking.session);
        await storage.updateBooking(booking.id, { reminderSentAt: new Date() });
      } catch (emailErr) {
        // Log but leave reminderSentAt unset so the next scheduler run retries
        console.error(`[Scheduler] Reminder failed for booking ${booking.id} (${booking.user.email}):`, emailErr);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Reminder job error:', err);
  }
}

export function startScheduler(): void {
  console.log('[Scheduler] Session reminder scheduler started (runs every 30 min)');
  setInterval(runReminderJob, INTERVAL_MS);
  runReminderJob();
}
