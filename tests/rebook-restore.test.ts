// A payment that lands on a booking the re-book guard superseded (cancellation_reason 'rebook_superseded') must
// never go invisible again: the confirm path restores the booking when the player's seat is still free (cancelling
// an unpaid duplicate sibling if that is what took it), and otherwise records the money and flags it for admin.
// A booking the PLAYER cancelled is still never resurrected.
//
// Review fixes (adversarial pass, 2026-09-15): the money recorded / flagged / restored is what Ziina CAPTURED (the
// wallet share was returned at supersede; amountAed is the gross); the duplicate sibling is cancelled only once the
// restore is certain (never leave the player with two cancelled rows); an admin-cancelled session flags rather than
// restores; a flag is terminal ('rebook_refund_pending') so the sweep cannot later flip "refund it" into "restore it";
// the payment row and the refund notification are idempotent independently.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.JWT_SECRET ??= 'test-main-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const storageMock = vi.hoisted(() => ({
  getBookingByZiinaPaymentIntentId: vi.fn(),
  getUserBookingForSession: vi.fn(),
  getPaymentsByBookingId: vi.fn(),
  getBookableSessionWithAvailability: vi.fn(),
  getWaitlistCountForSession: vi.fn(),
  getRefundNotificationByBooking: vi.fn(),
  updateBooking: vi.fn(),
  createPayment: vi.fn(),
  createMarketplaceNotification: vi.fn(),
  getBookingGuests: vi.fn(),
  getMarketplaceUser: vi.fn(),
  getBookableSession: vi.fn(),
  updateBookingGuest: vi.fn(),
  updateMarketplaceUser: vi.fn(),
}));
const ziinaMock = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock('../server/storage', () => ({ storage: storageMock }));
vi.mock('../server/ziinaClient', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), retrieveZiinaPaymentIntent: ziinaMock.retrieve }));
vi.mock('../server/referrals', () => ({ fireReferralOnPayment: vi.fn() }));
vi.mock('../server/venueAwards', () => ({ syncFoundingMemberForUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../server/dubailandPromo', () => ({ applyDubailandPromo: vi.fn().mockResolvedValue('skipped') }));
vi.mock('../server/goodwillCredit', () => ({ fireGoodwillCredit: vi.fn() }));
vi.mock('../server/emailClient', () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendGuestBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendRefundProcessedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { confirmZiinaBookingByIntentId } = await import('../server/webhookHandler');
const { REBOOK_SUPERSEDED_REASON, REBOOK_REFUND_PENDING_REASON } = await import('../server/rebookGuard');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

const INTENT = 'pi_paid';
const NOW = new Date('2026-09-14T09:43:00.000Z');
const superseded = (over: Record<string, unknown> = {}) => ({
  id: 'bk-paid', userId: 'u-1', sessionId: 's-1', status: 'cancelled', paymentMethod: 'ziina', amountAed: 49, spotsBooked: 1, walletAmountUsed: 0,
  ziinaPaymentIntentId: INTENT, createdAt: new Date(NOW.getTime() - 60_000), cancelledAt: new Date(NOW.getTime() - 59_000), cancellationReason: REBOOK_SUPERSEDED_REASON, birthdayDiscountApplied: false, ...over,
});
const sibling = (over: Record<string, unknown> = {}) => ({
  id: 'bk-dup', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina', amountAed: 49, spotsBooked: 1, walletAmountUsed: 0,
  ziinaPaymentIntentId: 'pi_dup', createdAt: new Date(NOW.getTime() - 58_000), cancelledAt: null, cancellationReason: null, ...over,
});
const paidRow = { id: 'p-1', bookingId: 'bk-paid', ziinaPaymentIntentId: INTENT, status: 'completed', refundStatus: null };

beforeEach(() => {
  for (const fn of Object.values(storageMock)) fn.mockReset();
  ziinaMock.retrieve.mockReset();
  ziinaMock.retrieve.mockResolvedValue({ id: INTENT, status: 'completed', amount: 4900, currency_code: 'AED' });
  storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(superseded());
  storageMock.getUserBookingForSession.mockResolvedValue(undefined);
  storageMock.getPaymentsByBookingId.mockResolvedValue([]);
  storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'upcoming', spotsRemaining: 5, priceAed: 49 });
  storageMock.getWaitlistCountForSession.mockResolvedValue(0);
  storageMock.getRefundNotificationByBooking.mockResolvedValue(undefined);
  storageMock.updateBooking.mockResolvedValue(undefined);
  storageMock.createPayment.mockResolvedValue(undefined);
  storageMock.createMarketplaceNotification.mockResolvedValue(undefined);
  storageMock.getBookingGuests.mockResolvedValue([]);
  storageMock.getMarketplaceUser.mockResolvedValue(undefined);
  storageMock.getBookableSession.mockResolvedValue(undefined);
});

describe('confirmZiinaBookingByIntentId on a guard-superseded booking', () => {
  it('seat still free, no sibling → the booking is restored and confirmed, the payment recorded once', async () => {
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: true, restored: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending', cancelledAt: null, cancellationReason: null }));
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', { status: 'confirmed' });
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-paid', ziinaPaymentIntentId: INTENT, amount: 49, status: 'completed' }));
    expect(storageMock.createMarketplaceNotification).not.toHaveBeenCalled();
  });

  it('an UNPAID duplicate sibling holds the seat (the 09:42:52 booking) → the sibling is superseded, the paid one restored; a REFUNDED payment on the sibling still counts as unpaid', async () => {
    storageMock.getUserBookingForSession.mockResolvedValue(sibling());
    storageMock.getPaymentsByBookingId.mockImplementation(async (id: string) => (id === 'bk-dup' ? [{ id: 'p-dup', bookingId: 'bk-dup', ziinaPaymentIntentId: 'pi_dup', status: 'completed', refundStatus: 'completed' }] : []));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: true, restored: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-dup', expect.objectContaining({ status: 'cancelled', cancellationReason: REBOOK_SUPERSEDED_REASON }));
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending', cancelledAt: null, cancellationReason: null }));
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', { status: 'confirmed' });
  });

  it('a PAID sibling (the player paid twice) → no restore; the money is recorded on the superseded row and flagged "paid twice" for admin; the flag is terminal', async () => {
    storageMock.getUserBookingForSession.mockResolvedValue(sibling({ status: 'confirmed' }));
    storageMock.getPaymentsByBookingId.mockImplementation(async (id: string) => (id === 'bk-dup' ? [{ id: 'p-dup', bookingId: 'bk-dup', ziinaPaymentIntentId: 'pi_dup', status: 'completed', refundStatus: null }] : []));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-paid', ziinaPaymentIntentId: INTENT, amount: 49, status: 'completed' }));
    expect(storageMock.createMarketplaceNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', type: 'refund_required', title: expect.stringMatching(/paid twice/i), relatedBookingId: 'bk-paid', refundAmountFils: 4900, refundPreference: 'bank' }));
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', { cancellationReason: REBOOK_REFUND_PENDING_REASON });
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending' }));
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-dup', expect.anything());
  });

  it('seat gone (session full, no sibling) → no restore; money recorded and flagged for admin', async () => {
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'upcoming', spotsRemaining: 0, priceAed: 49 });
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
    expect(storageMock.createMarketplaceNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'refund_required', title: expect.stringMatching(/seat/i), relatedBookingId: 'bk-paid', refundAmountFils: 4900 }));
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending' }));
  });

  it('seat gone AND an unpaid sibling → the sibling is LEFT ALONE (never two cancelled rows); the money is flagged', async () => {
    storageMock.getUserBookingForSession.mockResolvedValue(sibling());
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'upcoming', spotsRemaining: 0, priceAed: 49 });
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-dup', expect.anything());
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending' }));
  });

  it('a seat-holding sibling (pending_payment, promoted from the waitlist) gives its spots back when superseded, so the restore is not refused for a seat the player already holds', async () => {
    storageMock.getUserBookingForSession.mockResolvedValue(sibling({ status: 'pending_payment' }));
    // Availability counts the pending_payment seat until the duplicate is cancelled — then one seat comes back.
    storageMock.getBookableSessionWithAvailability.mockImplementation(async () => ({
      id: 's-1', status: 'upcoming', priceAed: 49,
      spotsRemaining: storageMock.updateBooking.mock.calls.some(([id]) => id === 'bk-dup') ? 1 : 0,
    }));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: true, restored: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-dup', expect.objectContaining({ status: 'cancelled', cancellationReason: REBOOK_SUPERSEDED_REASON }));
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending' }));
  });

  it('the session was cancelled by admin (availability still reports seats) → flagged "cancelled session", never restored', async () => {
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'cancelled', spotsRemaining: 5, priceAed: 49 });
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.createMarketplaceNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'refund_required', title: expect.stringMatching(/cancelled session/i), refundAmountFils: 4900 }));
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending' }));
  });

  it('an unpaid sibling that used wallet credit is left alone (its credit would be lost) → flagged, not restored', async () => {
    storageMock.getUserBookingForSession.mockResolvedValue(sibling({ walletAmountUsed: 1500 }));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.updateBooking).not.toHaveBeenCalledWith('bk-dup', expect.anything());
  });

  it('flagging is idempotent: a second webhook delivery adds no second payment row or notification', async () => {
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'upcoming', spotsRemaining: 0, priceAed: 49 });
    storageMock.getPaymentsByBookingId.mockResolvedValue([paidRow]);
    storageMock.getRefundNotificationByBooking.mockResolvedValue({ id: 'n-1', read: false, refundAmountFils: 4900 });
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.createPayment).not.toHaveBeenCalled();
    expect(storageMock.createMarketplaceNotification).not.toHaveBeenCalled();
  });

  it('the payment row and the notification are idempotent INDEPENDENTLY: a payment row without a notification (the insert failed last time) gets its notification on the next pass', async () => {
    storageMock.getBookableSessionWithAvailability.mockResolvedValue({ id: 's-1', status: 'upcoming', spotsRemaining: 0, priceAed: 49 });
    storageMock.getPaymentsByBookingId.mockResolvedValue([paidRow]);
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.createPayment).not.toHaveBeenCalled();
    expect(storageMock.createMarketplaceNotification).toHaveBeenCalledTimes(1);
  });

  it('a row already flagged (rebook_refund_pending) is terminal: the confirm path answers paid+flagged and writes nothing', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(superseded({ cancellationReason: REBOOK_REFUND_PENDING_REASON }));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toEqual({ confirmed: false, paid: true, flagged: true });
    expect(storageMock.updateBooking).not.toHaveBeenCalled();
    expect(storageMock.createPayment).not.toHaveBeenCalled();
    expect(storageMock.createMarketplaceNotification).not.toHaveBeenCalled();
  });

  it('a booking the PLAYER cancelled (no guard reason) is still never resurrected and writes nothing', async () => {
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(superseded({ cancellationReason: null }));
    expect(await confirmZiinaBookingByIntentId(INTENT, 'completed')).toEqual({ confirmed: false });
    expect(storageMock.updateBooking).not.toHaveBeenCalled();
    expect(storageMock.createPayment).not.toHaveBeenCalled();
    expect(storageMock.createMarketplaceNotification).not.toHaveBeenCalled();
  });
});

describe('the money is what Ziina captured, not the gross (the wallet share was returned at supersede)', () => {
  // AED 49 booking, AED 15 wallet credit applied at booking time → Ziina intent for AED 34. The guard returned the
  // 1500 fils and zeroed walletAmountUsed; amountAed still says 49.
  it('flag: the payment row, the refund amount and the message carry the captured AED 34', async () => {
    ziinaMock.retrieve.mockResolvedValue({ id: INTENT, status: 'completed', amount: 3400, currency_code: 'AED' });
    storageMock.getUserBookingForSession.mockResolvedValue(sibling({ status: 'confirmed' }));
    storageMock.getPaymentsByBookingId.mockImplementation(async (id: string) => (id === 'bk-dup' ? [{ id: 'p-dup', bookingId: 'bk-dup', ziinaPaymentIntentId: 'pi_dup', status: 'completed', refundStatus: null }] : []));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: false, paid: true, flagged: true });
    expect(ziinaMock.retrieve).toHaveBeenCalledWith(INTENT);
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-paid', amount: 34 }));
    expect(storageMock.createMarketplaceNotification).toHaveBeenCalledWith(expect.objectContaining({ refundAmountFils: 3400, message: expect.stringContaining('AED 34') }));
    expect(storageMock.createMarketplaceNotification).not.toHaveBeenCalledWith(expect.objectContaining({ refundAmountFils: 4900 }));
  });

  it('restore: the restored row is re-priced to the captured AED 34 (wallet share 0) so a later cancel refunds what was paid, and the confirm records AED 34', async () => {
    ziinaMock.retrieve.mockResolvedValue({ id: INTENT, status: 'completed', amount: 3400, currency_code: 'AED' });
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: true, restored: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending', cancelledAt: null, cancellationReason: null, amountAed: 34 }));
    expect(storageMock.createPayment).toHaveBeenCalledTimes(1);
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'bk-paid', amount: 34 }));
  });

  it('Ziina unreachable → falls back to gross minus the row\'s wallet share and still honours the payment (never drops it)', async () => {
    ziinaMock.retrieve.mockRejectedValue(new Error('ziina down'));
    const r = await confirmZiinaBookingByIntentId(INTENT, 'completed');
    expect(r).toMatchObject({ confirmed: true, restored: true });
    expect(storageMock.updateBooking).toHaveBeenCalledWith('bk-paid', expect.objectContaining({ status: 'pending', amountAed: 49 }));
    expect(storageMock.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 49 }));
  });
});

describe('source pins', () => {
  it('the poll route honours the delegate: a refused confirm never answers confirmed:true', () => {
    const src = read('server/marketplace-routes.ts');
    const i = src.indexOf('app.post("/api/marketplace/bookings/:id/confirm"');
    const route = src.slice(i, i + 2600);
    expect(route.includes('if (!result.confirmed)')).toBe(true);
  });
  it('the reconciliation sweep sees guard-superseded rows and nothing else that is cancelled', () => {
    const st = read('server/storage.ts');
    const i = st.indexOf('async getBookingsPendingZiinaReconciliation');
    const fn = st.slice(i, i + 2000);
    expect(fn.includes(`cancellationReason} = 'rebook_superseded'`)).toBe(true);
  });
  it('the drop-in submit is locked against a double tap on the client too (SessionDetails: ref lock, disabled button, stays locked through the redirect)', () => {
    const src = read('client/src/pages/marketplace/SessionDetails.tsx');
    expect(src.includes('const submitInFlight = useRef(false);')).toBe(true);
    expect(src.includes('if (submitInFlight.current) return;')).toBe(true);
    const btn = src.slice(src.indexOf('data-testid="button-pay-card"') - 700, src.indexOf('data-testid="button-pay-card"'));
    expect(btn.includes('disabled={processing}')).toBe(true);
  });
});
