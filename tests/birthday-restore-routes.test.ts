// Birthday free game — restore on cancel: where each path offers, consumes and restores (source pins, the house pattern
// for the marketplace routes: behaviour lives in server/birthdayRestore.ts and is tested in birthday-restore.test.ts;
// these pins prove every route calls it in the right place, and that the paths that never confirm never touch it).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const between = (src: string, start: string, end: string) => {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`start marker not found: ${start}`);
  const b = src.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`end marker not found after ${start}: ${end}`);
  return src.slice(a, b);
};
const routes = read('server/marketplace-routes.ts');
const webhook = read('server/webhookHandler.ts');
const storageSrc = read('server/storage.ts');
const scheduler = read('server/scheduler.ts');

const CREATE = between(routes, 'app.post("/api/marketplace/bookings", requireAuth', 'app.post("/api/marketplace/bookings/:id/confirm-guest"');
const WHOLE_CANCEL = between(routes, 'app.post("/api/marketplace/bookings/:id/cancel"', 'app.post("/api/marketplace/bookings/:id/attend"');
const SLOT_DELETE = between(routes, 'app.delete("/api/marketplace/bookings/:bookingId/guests/:guestId"', 'app.patch("/api/marketplace/bookings/:bookingId/guests/:guestId"');
const ABANDON = between(routes, 'app.post("/api/marketplace/bookings/:id/abandon"', 'app.post("/api/marketplace/bookings/:id/cancel"');
const RELEASE = between(routes, 'app.post("/api/admin/bookings/:id/payment-not-received"', 'app.post("/api/marketplace/bookings/:id/admin-confirm"');
const ADMIN_CONFIRM = between(routes, 'app.post("/api/marketplace/bookings/:id/admin-confirm"', '\n  app.');
const SUPERSEDE = between(routes, 'async function supersedePendingBooking(', '\n}\n');
const SESSION_CANCEL = between(storageSrc, 'async cancelBookableSessionAndRefund(', '\n  async ');
const EXPIRY = between(scheduler, 'async function runExpiredPaymentJob(', '\n}\n');
const ZIINA_CONFIRM = between(webhook, 'export async function confirmZiinaBookingByIntentId(', 'export async function restoreSupersededBooking(');
const LATE_RESTORE = between(webhook, 'export async function restoreSupersededBooking(', 'export async function confirmPromotedBookingIfPaid(');

describe('offer — booking create', () => {
  it('the free spot comes from decideBirthdayOffer (never the bare marker check) and the booking stores the window key', () => {
    expect(CREATE).toContain('decideBirthdayOffer(');
    expect(CREATE).not.toMatch(/isBirthdayDiscountAvailable\(primaryUser/);
    expect(CREATE).toMatch(/birthdayWindowKey:\s*offer\.windowKey/);
  });
  it('a race loser on the one-live-free-booking rule answers 409 with the stable copy — never a charge', () => {
    expect(CREATE).toContain('isBirthdayConflict(');
    expect(CREATE).toMatch(/status\(409\)\.json\(\{\s*error:\s*BIRTHDAY_ALREADY_BOOKED/);
  });
  it('the waitlist insert is never flagged free', () => {
    const waitlist = between(CREATE, "status: 'waitlisted'", '});');
    expect(waitlist).not.toMatch(/birthdayDiscountApplied|birthdayWindowKey/);
  });
});

describe('consume — every confirm path', () => {
  it('the immediate confirm (nothing left to pay) consumes through the helper; the old closure is gone', () => {
    expect(CREATE).toContain('consumeBirthdayDiscount(');
    expect(routes).not.toContain('markBirthdayUsedIfConfirmedNow');
  });
  it('the Ziina confirm consumes through the helper', () => {
    expect(ZIINA_CONFIRM).toContain('consumeBirthdayDiscount(');
  });
  it('admin force-confirm consumes too (missing before)', () => {
    expect(ADMIN_CONFIRM).toContain('consumeBirthdayDiscount(');
  });
  it('nothing in server/ writes the marker except the storage helpers', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(__dirname, '..', dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && /updateMarketplaceUser\([^)]*birthdayDiscountUsedAt/.test(read(p))) hits.push(p);
      }
    };
    walk('server');
    expect(hits).toEqual([]);
    expect(storageSrc).toContain('async setBirthdayMarker(');
    expect(storageSrc).toContain('async clearBirthdayMarker(');
    expect(storageSrc).toContain('async releaseBirthdayWindowKey(');
    expect(storageSrc).toContain('async hasLiveBirthdayBooking(');
  });
});

describe('restore — the cancel paths', () => {
  it('whole-booking cancel: the status claim and the restore run in ONE transaction, fed the late-fee decision', () => {
    const tx = between(WHOLE_CANCEL, 'db.transaction(async (tx)', '\n      });');
    expect(tx).toMatch(/tx\s*\.update\(bookings\)\s*\.set\(\{ status: 'cancelled', cancelledAt: new Date\(\), lateFeeApplied \}\)/);
    expect(tx).toContain('restoreBirthdayDiscount(');
    expect(tx).toMatch(/withinLateWindow:\s*lateFeeApplied/);
    expect(tx.indexOf('restoreBirthdayDiscount(')).toBeGreaterThan(tx.indexOf('.update(bookings)'));
  });
  it('per-slot cancel of the primary slot: restores in a transaction; the booking stays live when slots remain (amendment)', () => {
    expect(SLOT_DELETE).toContain('restoreBirthdayDiscount(');
    expect(SLOT_DELETE).toMatch(/slotIsPrimary:\s*guest\.isPrimary/);
    expect(SLOT_DELETE).toMatch(/bookingStaysLive:\s*true/);
    expect(SLOT_DELETE).toMatch(/bookingStaysLive:\s*false/);
    expect(SLOT_DELETE).toContain('db.transaction(');
  });
  it('admin cancels the whole session: restores, ignoring the 5-hour rule (decision 3)', () => {
    expect(SESSION_CANCEL).toContain('restoreBirthdayDiscount(');
    expect(SESSION_CANCEL).toMatch(/withinLateWindow:\s*false/);
  });
  it('a late payment on a superseded booking that collides with a live free booking goes to the refund flag', () => {
    expect(LATE_RESTORE).toContain('isBirthdayConflict(');
  });
  it('the paths that only ever cancel UNPAID bookings never restore (the marker is only set on confirmation)', () => {
    for (const [name, src] of [['abandon', ABANDON], ['admin release', RELEASE], ['supersede', SUPERSEDE], ['waitlist expiry', EXPIRY]] as const) {
      expect(src, name).not.toContain('restoreBirthdayDiscount');
      expect(src, name).not.toMatch(/birthdayDiscountUsedAt|clearBirthdayMarker/);
    }
  });
  it('primary slots are created without a cancellation token, so no guest-token route can cancel a free primary spot', () => {
    const slots = between(routes, 'const createAllSlotsForBooking = async (', '// Additional guest slots');
    expect(slots).toMatch(/isPrimary: true,[\s\S]*cancellationToken: null/);
  });
});
