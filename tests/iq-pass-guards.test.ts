// IQ Pass Gate 2 — source pins. (1) Pack seats are managed only through pack
// routes: every existing booking mutation refuses a booking with pack_id
// BEFORE its first write. (2) The store's two transactions carry the shape
// the plan requires (row locks, validation inside the lock, exact insert
// values, the RETURNING count check, the single pack payment row).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const routes = read('server/marketplace-routes.ts');
const slice = (from: string, to: string) => {
  const a = routes.indexOf(from); const b = routes.indexOf(to, a + 1);
  expect(a, from).toBeGreaterThan(-1); expect(b, to).toBeGreaterThan(a);
  return routes.slice(a, b);
};

describe('existing booking routes refuse pack seats before any write (400 iq_pass_seat)', () => {
  const cases: Array<[string, string, string]> = [
    ['player cancel', 'app.post("/api/marketplace/bookings/:id/cancel"', 'app.post("/api/marketplace/bookings/:id/attend"'],
    ['initiate-payment', 'app.post("/api/marketplace/bookings/:id/initiate-payment"', 'app.post("/api/marketplace/guests/cancel"'],
    ['admin cash-paid', 'app.patch("/api/marketplace/bookings/:id/cash-paid"', 'app.post("/api/admin/bookings/:id/payment-not-received"'],
    ['admin payment-not-received', 'app.post("/api/admin/bookings/:id/payment-not-received"', 'app.post("/api/marketplace/bookings/:id/admin-confirm"'],
    ['admin-confirm', 'app.post("/api/marketplace/bookings/:id/admin-confirm"', 'app.post("/api/marketplace/bookings/:id/admin-promote"'],
    ['admin-promote', 'app.post("/api/marketplace/bookings/:id/admin-promote"', 'app.get("/api/marketplace/sessions/:id/players"'],
  ];
  for (const [label, from, to] of cases) {
    it(label, () => {
      const src = slice(from, to);
      const guard = src.indexOf('if (booking.packId)');
      const refuse = src.indexOf('error: "iq_pass_seat"');
      const firstWrite = Math.min(...['storage.updateBooking(', 'db.update(', 'storage.createPayment(', 'createZiinaPaymentIntent(', 'storage.updateBookingGuest(']
        .map((w) => src.indexOf(w)).filter((i) => i > -1));
      expect(guard, `${label}: guard`).toBeGreaterThan(-1);
      expect(refuse, `${label}: refusal`).toBeGreaterThan(guard);
      expect(firstWrite, `${label}: guard precedes the first write`).toBeGreaterThan(guard);
    });
  }
});

describe('store transactions (server/iqPass/store.ts)', () => {
  const store = read('server/iqPass/store.ts');
  const hold = store.slice(store.indexOf('async createHold('), store.indexOf('async attachIntent('));
  const confirm = store.slice(store.indexOf('async confirmTx('), store.indexOf('async expireHolds('));

  it('createHold: one transaction, picked sessions locked FOR UPDATE, validatePicks runs inside the lock, then the inserts', () => {
    expect(hold.includes('db.transaction(')).toBe(true);
    const lock = hold.indexOf(".for('update')");
    const validate = hold.indexOf('validatePicks(');
    const packInsert = hold.indexOf('.insert(packs)');
    const seatInsert = hold.indexOf('.insert(bookings)');
    const guestInsert = hold.indexOf('.insert(bookingGuests)');
    expect(lock).toBeGreaterThan(-1);
    expect(validate).toBeGreaterThan(lock);
    expect(packInsert).toBeGreaterThan(validate);
    expect(seatInsert).toBeGreaterThan(packInsert);
    expect(guestInsert).toBeGreaterThan(seatInsert);
  });

  it('createHold: seat rows are pending_payment / iq_pass / allocation / 1 spot / promoted_at NULL / no wallet; the pack starts pending_payment', () => {
    expect(hold.includes("status: 'pending_payment'")).toBe(true);
    expect(hold.includes("paymentMethod: 'iq_pass'")).toBe(true);
    expect(hold.includes('amountAed: tier.allocationAed')).toBe(true);
    expect(hold.includes('spotsBooked: 1')).toBe(true);
    expect(hold.includes('promotedAt: null')).toBe(true);
    expect(hold.includes('walletAmountUsed: 0')).toBe(true);
    expect(hold.includes('isPrimary: true')).toBe(true);
    expect(hold.includes("status: 'pending'")).toBe(true); // primary guest slot
    expect(hold.includes("code === '23505'")).toBe(true);  // unique-index race → PickConflictError
  });

  it('confirmTx: pack locked FOR UPDATE; seats flipped with RETURNING and the count must equal games_total or the tx throws; guests confirmed; pack active + paid_at; ONE payments row with pack_id and NO booking_id', () => {
    const lock = confirm.indexOf(".for('update')");
    const flip = confirm.indexOf(".update(bookings)");
    const returning = confirm.indexOf('.returning(', flip);
    const countCheck = confirm.indexOf('!== pack.gamesTotal');
    const guests = confirm.indexOf('.update(bookingGuests)');
    const activate = confirm.indexOf("status: 'active'");
    const pay = confirm.lastIndexOf('.insert(payments)'); // the confirmed path's insert (the hold_gone branch records earlier)
    expect(lock).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(lock);
    expect(returning).toBeGreaterThan(flip);
    expect(countCheck).toBeGreaterThan(returning);
    expect(guests).toBeGreaterThan(countCheck);
    expect(activate).toBeGreaterThan(countCheck);
    expect(pay).toBeGreaterThan(countCheck);
    expect(confirm.includes('throw new Error(')).toBe(true);
    expect(confirm.includes('packId: pack.id')).toBe(true);
    expect(confirm.includes('bookingId: null')).toBe(true);
    expect(confirm.includes("status: 'completed'")).toBe(true);
    expect(confirm.includes('amount: pack.priceAed')).toBe(true);
  });

  it('confirmTx: a payment landing after the hold lapsed records the money + a refund_required row and never confirms seats', () => {
    const gone = confirm.indexOf("kind: 'hold_gone'");
    const refund = confirm.indexOf("type: 'refund_required'");
    expect(gone).toBeGreaterThan(-1);
    expect(refund).toBeGreaterThan(-1);
    expect(refund).toBeLessThan(gone);
    expect(confirm.includes('refundAmountFils: pack.priceAed * 100')).toBe(true);
  });

  it('no pack code reads bookings.amount_aed for money (amendment 1) — the only amount written is the allocation', () => {
    for (const f of ['server/iqPass/store.ts', 'server/iqPass/purchase.ts', 'server/iqPass/confirm.ts', 'server/iqPass/jobs.ts', 'server/iqPass/routes.ts']) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\.amountAed\b(?!:)/);
    }
  });
});
