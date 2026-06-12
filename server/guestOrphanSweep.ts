import { storage } from "./storage";

// ── Add-guest orphan sweep (batch 2a) ──────────────────────────────────────
// The add-guest path writes a guest row (status='pending') BEFORE the Ziina
// charge. An abandoned/declined/timed-out payment leaves that row 'pending'
// forever. This mirrors the pending_payment BOOKING expiry (server/scheduler.ts
// runExpiredPaymentJob): same 4-hour window, and it MARKS the row cancelled
// (status='cancelled' + cancelledAt) rather than deleting — consistent with how
// expired bookings are handled, and the admin roster already hides non-confirmed
// guests (batch 1).
const GUEST_PAYMENT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4h — mirrors PAYMENT_WINDOW_MS

// No-overlap guard so a slow run is never re-entered by the next scheduled tick.
// (The audit flagged the 15s auto-approve sweep for lacking exactly this.)
let sweepRunning = false;

export async function runExpiredPendingGuestSweep(): Promise<void> {
  if (sweepRunning) {
    console.log("[GuestSweep] Previous run still in progress — skipping this tick");
    return;
  }
  sweepRunning = true;
  try {
    // Targets ONLY: non-primary, status='pending', with a Ziina intent, older
    // than the window, on a non-cancelled booking, whose intent never produced a
    // completed payment. (Cannot race the reconciliation sweep: a guest it has
    // already confirmed is status='confirmed' and excluded; and the cancel below
    // is CAS-guarded on status='pending'.)
    const orphans = await storage.getExpiredAddGuestOrphans(GUEST_PAYMENT_WINDOW_MS);
    if (orphans.length === 0) return;

    console.log(`[GuestSweep] Found ${orphans.length} expired unpaid add-guest orphan(s)`);
    let cancelled = 0;
    for (const g of orphans) {
      try {
        // CAS on status='pending' — if the webhook/reconciliation confirmed it in
        // the meantime, this no-ops and the now-paid guest is left untouched. The
        // intent is nulled so a late webhook finds no pending guest to resurrect.
        const did = await storage.cancelPendingGuestById(g.id);
        if (did) {
          cancelled++;
          console.log(
            `[GuestSweep] Cancelled orphan guest ${g.id} ("${g.name}") on booking ` +
            `${g.bookingId} (intent ${g.pendingPaymentIntentId})`,
          );
        }
      } catch (err) {
        console.error(`[GuestSweep] Error cancelling guest ${g.id}:`, err);
      }
    }
    if (cancelled > 0) console.log(`[GuestSweep] Complete: ${cancelled} orphan guest(s) cancelled`);
  } catch (err) {
    console.error("[GuestSweep] Sweep error:", err);
  } finally {
    sweepRunning = false;
  }
}

export { GUEST_PAYMENT_WINDOW_MS };
