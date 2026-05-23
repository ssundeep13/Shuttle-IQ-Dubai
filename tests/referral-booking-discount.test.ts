import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Route-level integration test: POST /api/marketplace/bookings — referral discount ───
//
// Confirms that the referral first-game 50% discount is auto-applied on the
// backend whenever:
//   • paymentMethod is 'ziina' (not cash)
//   • no manual discountCode is provided
//   • the user has a referral row (linked via apply-code or signup)
//   • the user has 0 prior confirmed bookings
//
// The frontend (makeBooking in SessionDetails.tsx / InlineBookingPanel) does NOT
// need to forward any referral context — the backend detects it automatically
// via getReferralByRefereeUserId(userId).  This test suite documents and locks
// in that contract.

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = { userId: 'user-ref-1', name: 'Referred User', email: 'referred@example.com' };
    next();
  },
}));

const { sendBookingConfirmationEmailMock, createZiinaIntentMock } = vi.hoisted(() => ({
  sendBookingConfirmationEmailMock: vi.fn().mockResolvedValue(undefined),
  createZiinaIntentMock: vi.fn(),
}));

vi.mock('../server/emailClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, sendBookingConfirmationEmail: sendBookingConfirmationEmailMock };
});
vi.mock('../server/ziinaClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, createZiinaPaymentIntent: createZiinaIntentMock };
});

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

async function loadBookingHandler(): Promise<Handler> {
  const { registerMarketplaceRoutes } = await import('../server/marketplace-routes');
  let bookingHandler: Handler | undefined;
  const noop = () => {};
  const fakeApp = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'post') {
        return (path: string, ...handlers: Handler[]) => {
          if (path === '/api/marketplace/bookings') {
            bookingHandler = handlers[handlers.length - 1];
          }
        };
      }
      return noop;
    },
  });
  registerMarketplaceRoutes(fakeApp as unknown as Parameters<typeof registerMarketplaceRoutes>[0]);
  if (!bookingHandler) throw new Error('booking handler not registered');
  return bookingHandler;
}

function makeRes() {
  const captured: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(body: unknown) { captured.body = body; return res; },
  };
  return { res, captured };
}

const SESSION_ID = 'sess-ref-disc-1';

const baseBookableSession = {
  id: SESSION_ID,
  title: 'Referral Discount Test Session',
  venueName: 'Test Court',
  date: '2026-12-31',
  startTime: '19:00',
  endTime: '21:00',
  priceAed: 100,
  capacity: 16,
  status: 'upcoming',
  spotsRemaining: 16,
  spotsBooked: 0,
  confirmedBookings: 0,
  waitlistCount: 0,
  availableSpots: 16,
  linkedSessionId: null,
  linkedQueueSessionId: null,
};

const primaryUser = {
  id: 'user-ref-1',
  name: 'Referred User',
  email: 'referred@example.com',
  linkedPlayerId: null,
  phone: null,
  photoUrl: null,
};

const baseBooking = {
  id: 'booking-ref-1',
  userId: 'user-ref-1',
  sessionId: SESSION_ID,
  status: 'pending',
  paymentMethod: 'ziina',
  amountAed: 50,
  spotsBooked: 1,
  discountCodeId: null,
  discountAmountAed: 50,
  ziinaPaymentIntentId: null,
  cashPaid: false,
  waitlistPosition: null,
  walletAmountUsed: 0,
  lateFeeApplied: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  cancellationReason: null,
  resumeTokenHash: null,
  resumeTokenExpiresAt: null,
};

/** Shared request body for a Ziina booking with no manual discount code */
const ziinaReqBody = {
  sessionId: SESSION_ID,
  paymentMethod: 'ziina',
  guests: [],
  applyWallet: false,
};

const authUser = { userId: 'user-ref-1', name: 'Referred User', email: 'referred@example.com' };

describe('POST /api/marketplace/bookings — referral first-game discount (auto-apply)', () => {
  let handler: Handler;

  beforeAll(async () => {
    handler = await loadBookingHandler();
  }, 30_000);

  beforeEach(() => {
    sendBookingConfirmationEmailMock.mockClear();
    createZiinaIntentMock.mockReset();
  });

  it('applies 50% discount to createBooking and passes discounted amount to Ziina when user has a referral row and 0 prior bookings', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getUserBookingForSession').mockResolvedValue(undefined);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(primaryUser as never);
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'ref-row-1' } as never);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(0);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 50,
      discountAmountAed: 50,
    } as never);

    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'createPaymentResumeToken').mockResolvedValue({} as never);
    vi.spyOn(storage, 'updateBooking').mockResolvedValue({ ...baseBooking } as never);

    createZiinaIntentMock.mockResolvedValue({
      id: 'pi_test_referral',
      redirect_url: 'https://ziina.com/pay/referral-test',
      status: 'pending',
    });

    const { res, captured } = makeRes();
    await handler({ user: authUser, body: ziinaReqBody, params: {} }, res);

    // booking INSERT must carry the 50% discount (50 off 100 AED session)
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amountAed: 50,
        discountAmountAed: 50,
      }),
    );

    // Ziina must be called with the discounted amount (50 AED), NOT the full 100 AED
    expect(createZiinaIntentMock).toHaveBeenCalledTimes(1);
    expect(createZiinaIntentMock.mock.calls[0][0]).toMatchObject({ amountAed: 50 });

    expect(captured.status).toBe(200);
    const body = captured.body as Record<string, unknown>;
    expect(body.discountAmountAed).toBe(50);
  });

  it('does NOT apply the referral discount for cash bookings', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getUserBookingForSession').mockResolvedValue(undefined);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(primaryUser as never);
    const referralSpy = vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'ref-row-1' } as never);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      paymentMethod: 'cash',
      status: 'confirmed',
      amountAed: 100,
      discountAmountAed: 0,
    } as never);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'getBookingWithDetails').mockResolvedValue({ id: 'booking-ref-1' } as never);

    const { res, captured } = makeRes();
    await handler({
      user: authUser,
      body: { ...ziinaReqBody, paymentMethod: 'cash' },
      params: {},
    }, res);

    // Referral row should never be checked for cash bookings
    expect(referralSpy).not.toHaveBeenCalled();

    // Cash booking stored at full price
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountAed: 100, paymentMethod: 'cash' }),
    );

    expect(captured.status).toBe(200);
  });

  it('does NOT apply the referral discount when there is no referral row', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getUserBookingForSession').mockResolvedValue(undefined);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(primaryUser as never);
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue(undefined);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 100,
      discountAmountAed: 0,
    } as never);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'createPaymentResumeToken').mockResolvedValue({} as never);

    createZiinaIntentMock.mockResolvedValue({
      id: 'pi_no_ref',
      redirect_url: 'https://ziina.com/pay/no-ref',
      status: 'pending',
    });

    const { res, captured } = makeRes();
    await handler({ user: authUser, body: ziinaReqBody, params: {} }, res);

    // Full price stored — no discount
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountAed: 100 }),
    );

    // Ziina charged the full 100 AED
    expect(createZiinaIntentMock).toHaveBeenCalledTimes(1);
    expect(createZiinaIntentMock.mock.calls[0][0]).toMatchObject({ amountAed: 100 });

    expect(captured.status).toBe(200);
    const body = captured.body as Record<string, unknown>;
    expect(body.discountAmountAed).toBeUndefined();
  });

  it('does NOT apply the referral discount when the user has prior confirmed bookings', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getUserBookingForSession').mockResolvedValue(undefined);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(primaryUser as never);
    vi.spyOn(storage, 'getReferralByRefereeUserId').mockResolvedValue({ id: 'ref-row-1' } as never);
    vi.spyOn(storage, 'countConfirmedBookingsForUser').mockResolvedValue(2);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 100,
      discountAmountAed: 0,
    } as never);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'createPaymentResumeToken').mockResolvedValue({} as never);

    createZiinaIntentMock.mockResolvedValue({
      id: 'pi_prior_bookings',
      redirect_url: 'https://ziina.com/pay/prior',
      status: 'pending',
    });

    const { res, captured } = makeRes();
    await handler({ user: authUser, body: ziinaReqBody, params: {} }, res);

    // Full price — user already had prior bookings so referral discount no longer applies
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountAed: 100 }),
    );
    expect(createZiinaIntentMock.mock.calls[0][0]).toMatchObject({ amountAed: 100 });

    expect(captured.status).toBe(200);
  });

  it('uses the manual discountCode and skips the referral auto-apply when a discountCode is present in the request', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getUserBookingForSession').mockResolvedValue(undefined);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue(primaryUser as never);

    // Referral row exists but should be ignored when discountCode is explicitly provided
    const referralAutoSpy = vi.spyOn(storage, 'getReferralByRefereeUserId');

    vi.spyOn(storage, 'validateDiscountCode').mockResolvedValue({
      valid: true,
      discountCode: { id: 'dc-manual', code: 'PROMO30' },
      discountAmountAed: 30,
      discountType: 'fixed_aed',
      discountValue: 30,
      discountLabel: 'AED 30 off',
    } as never);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 70,
      discountCodeId: 'dc-manual',
      discountAmountAed: 30,
    } as never);

    vi.spyOn(storage, 'applyDiscountCode').mockResolvedValue(undefined);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'createPaymentResumeToken').mockResolvedValue({} as never);

    createZiinaIntentMock.mockResolvedValue({
      id: 'pi_manual_code',
      redirect_url: 'https://ziina.com/pay/manual',
      status: 'pending',
    });

    const { res, captured } = makeRes();
    await handler({
      user: authUser,
      body: { ...ziinaReqBody, discountCode: 'PROMO30' },
      params: {},
    }, res);

    // The referral auto-apply branch must be completely skipped
    expect(referralAutoSpy).not.toHaveBeenCalled();

    // Manual discount (AED 30) applied
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountAed: 70, discountCodeId: 'dc-manual', discountAmountAed: 30 }),
    );

    expect(captured.status).toBe(200);
  });
});
