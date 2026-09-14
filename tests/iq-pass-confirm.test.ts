// IQ Pass Gate 2 — atomic confirm. The transaction itself lives in
// server/iqPass/store.ts (pinned in iq-pass-guards.test.ts); this file tests
// the orchestration around it (hooks once, notification, email, no side
// effects on the refused paths) and the webhook dispatch order
// booking → pack (flag on only) → guest.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

process.env.JWT_SECRET = 'test-main-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const storageMock = vi.hoisted(() => ({
  getBookingByZiinaPaymentIntentId: vi.fn(),
  getBookingGuestByPendingPaymentIntentId: vi.fn(),
  getBooking: vi.fn(), getMarketplaceUser: vi.fn(), getBookableSession: vi.fn(), getBookingGuests: vi.fn(),
  getPaymentsByBookingId: vi.fn(), createPayment: vi.fn(), updateBooking: vi.fn(), updateBookingGuest: vi.fn(),
  createMarketplaceNotification: vi.fn(), getBookableSessionWithAvailability: vi.fn(), getWaitlistCountForSession: vi.fn(),
  updateMarketplaceUser: vi.fn(),
}));
const storeMock = vi.hoisted(() => ({ getPackByIntent: vi.fn() }));
const confirmMock = vi.hoisted(() => ({ confirmPackByIntentId: vi.fn() }));
vi.mock('../server/storage', () => ({ storage: storageMock }));
vi.mock('../server/iqPass/store', () => ({ iqPassStore: storeMock, PickConflictError: class extends Error {} }));
vi.mock('../server/iqPass/confirm', async (orig) => ({ ...(await orig<any>()), confirmPackByIntentId: confirmMock.confirmPackByIntentId }));
vi.mock('../server/referrals', () => ({ fireReferralOnPayment: vi.fn() }));
vi.mock('../server/venueAwards', () => ({ syncFoundingMemberForUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../server/dubailandPromo', () => ({ applyDubailandPromo: vi.fn().mockResolvedValue('skipped') }));
vi.mock('../server/goodwillCredit', () => ({ fireGoodwillCredit: vi.fn() }));
vi.mock('../server/emailClient', () => ({
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined), sendGuestBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendRefundProcessedEmail: vi.fn().mockResolvedValue(undefined), sendIqPassConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { confirmPackByIntentId: realConfirm } = await vi.importActual<typeof import('../server/iqPass/confirm')>('../server/iqPass/confirm');
const { confirmZiinaBookingByIntentId } = await import('../server/webhookHandler');

const NOW = new Date('2026-09-14T08:00:00.000Z');
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-1', userId: 'u-1', tier: 'club_plus', gamesTotal: 8, priceAed: 360, status: 'active', ziinaPaymentIntentId: 'pi_pack',
  windowStart: '2026-09-14', windowEnd: '2026-10-11', holdExpiresAt: NOW, paidAt: NOW, cancelledAt: null, cancellationReason: null,
  repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, renewalEmailSentAt: null, followupEmailSentAt: null, createdAt: NOW, ...over,
});
const seatSessions = Array.from({ length: 8 }, (_, i) => ({ bookingId: `b${i}`, session: { title: 'Smash', venueName: 'Smash Sports Academy', date: '2026-09-20T00:00:00.000Z', startTime: '20:00', endTime: '22:00' } }));

function fakeDeps(over: Record<string, any> = {}) {
  return {
    now: () => NOW,
    confirmTx: vi.fn().mockResolvedValue({ kind: 'confirmed', pack: pack(), bookingIds: seatSessions.map((s) => s.bookingId) }),
    getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com' }),
    getPackSeatSessions: vi.fn().mockResolvedValue(seatSessions),
    fireReferral: vi.fn(),
    syncFoundingMember: vi.fn().mockResolvedValue(undefined),
    fireGoodwill: vi.fn(),
    notify: vi.fn().mockResolvedValue(undefined),
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('confirmPackByIntentId — orchestration', () => {
  it('confirmed: referral once (first seat), founding once, goodwill per seat, one notification, one email with the pack summary', async () => {
    const deps = fakeDeps();
    const r = await realConfirm('pi_pack', deps);
    expect(r).toEqual({ confirmed: true });
    expect(deps.confirmTx).toHaveBeenCalledWith('pi_pack', NOW);
    expect(deps.fireReferral).toHaveBeenCalledTimes(1);
    expect(deps.fireReferral).toHaveBeenCalledWith('u-1', 'b0');
    expect(deps.syncFoundingMember).toHaveBeenCalledTimes(1);
    expect(deps.fireGoodwill).toHaveBeenCalledTimes(8);
    expect(deps.fireGoodwill).toHaveBeenCalledWith('b3', 'iq-pass-confirm');
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', type: 'iq_pass_active', title: 'Your IQ Pass is active' }));
    expect(deps.notify.mock.calls[0][0].message).toContain('8 games locked');
    expect(deps.sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendConfirmationEmail).toHaveBeenCalledWith('t@example.com', expect.objectContaining({ packId: 'pk-1', name: 'Test Player', tierLabel: 'Club Plus', gamesTotal: 8 }));
    expect(deps.sendConfirmationEmail.mock.calls[0][1].sessions).toHaveLength(8);
  });

  it('already active → alreadyConfirmed, no hooks, no email', async () => {
    const deps = fakeDeps({ confirmTx: vi.fn().mockResolvedValue({ kind: 'already', pack: pack() }) });
    expect(await realConfirm('pi_pack', deps)).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(deps.fireReferral).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('hold already gone (paid after the 30 minutes) → refused, no hooks (the tx recorded the payment + refund_required)', async () => {
    const deps = fakeDeps({ confirmTx: vi.fn().mockResolvedValue({ kind: 'hold_gone', pack: pack({ status: 'cancelled' }) }) });
    expect(await realConfirm('pi_pack', deps)).toEqual({ confirmed: false, error: 'pack_hold_expired' });
    expect(deps.fireReferral).not.toHaveBeenCalled();
    expect(deps.fireGoodwill).not.toHaveBeenCalled();
    expect(deps.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('unknown intent → pack_not_found', async () => {
    const deps = fakeDeps({ confirmTx: vi.fn().mockResolvedValue({ kind: 'not_found' }) });
    expect(await realConfirm('pi_zz', deps)).toEqual({ confirmed: false, error: 'pack_not_found' });
  });

  it('hook / email failures never fail the confirmation', async () => {
    const deps = fakeDeps({
      syncFoundingMember: vi.fn().mockRejectedValue(new Error('badge down')),
      sendConfirmationEmail: vi.fn().mockRejectedValue(new Error('resend down')),
      notify: vi.fn().mockRejectedValue(new Error('notif down')),
    });
    expect(await realConfirm('pi_pack', deps)).toEqual({ confirmed: true });
  });
});

describe('webhook dispatch: booking → pack (flag on) → guest', () => {
  const prev = process.env.IQ_PASS_ENABLED;
  afterAll(() => { if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });
  beforeEach(() => {
    for (const fn of Object.values(storageMock)) fn.mockReset();
    storeMock.getPackByIntent.mockReset(); confirmMock.confirmPackByIntentId.mockReset();
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue(undefined);
    storageMock.getBookingGuestByPendingPaymentIntentId.mockResolvedValue(undefined);
  });

  it('flag ON and the intent belongs to a pack → confirmPackByIntentId, guest path untouched', async () => {
    process.env.IQ_PASS_ENABLED = 'true';
    storeMock.getPackByIntent.mockResolvedValue(pack({ status: 'pending_payment' }));
    confirmMock.confirmPackByIntentId.mockResolvedValue({ confirmed: true });
    expect(await confirmZiinaBookingByIntentId('pi_pack', 'completed')).toEqual({ confirmed: true });
    expect(confirmMock.confirmPackByIntentId).toHaveBeenCalledWith('pi_pack');
    expect(storageMock.getBookingGuestByPendingPaymentIntentId).not.toHaveBeenCalled();
  });

  it('flag ON but no pack for the intent → falls through to the guest path exactly as before', async () => {
    process.env.IQ_PASS_ENABLED = 'true';
    storeMock.getPackByIntent.mockResolvedValue(undefined);
    expect(await confirmZiinaBookingByIntentId('pi_guest', 'completed')).toEqual({ confirmed: false, error: 'guest_not_found' });
    expect(storageMock.getBookingGuestByPendingPaymentIntentId).toHaveBeenCalledWith('pi_guest');
  });

  it('flag OFF → the pack store is never consulted (byte-identical path)', async () => {
    delete process.env.IQ_PASS_ENABLED;
    expect(await confirmZiinaBookingByIntentId('pi_pack', 'completed')).toEqual({ confirmed: false, error: 'guest_not_found' });
    expect(storeMock.getPackByIntent).not.toHaveBeenCalled();
    expect(confirmMock.confirmPackByIntentId).not.toHaveBeenCalled();
  });

  it('a booking hit never consults the pack store, flag on or off', async () => {
    process.env.IQ_PASS_ENABLED = 'true';
    storageMock.getBookingByZiinaPaymentIntentId.mockResolvedValue({ id: 'bk', status: 'confirmed', cancelledAt: null });
    expect(await confirmZiinaBookingByIntentId('pi_b', 'completed')).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(storeMock.getPackByIntent).not.toHaveBeenCalled();
  });
});
