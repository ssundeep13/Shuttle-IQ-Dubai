import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Route-level integration test: POST /api/marketplace/bookings (with discount) ─────
// Validates the highest-risk persistence paths for the discount feature:
//   1. Booking INSERT stores discountCodeId + discountAmountAed
//   2. applyDiscountCode is called (records discount_code_uses + increments usedCount)
//   3. Discount-only zero-balance path confirms without Ziina, returns
//      paymentMethod:'discount' and amount == discountedTotal (not pre-discount total)
//   4. Partial discount goes to Ziina with the reduced amount

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = { userId: 'user-test-1', name: 'Test User', email: 'test@example.com' };
    next();
  },
}));

// Stub email and Ziina so no external calls leave the test
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

const baseBookableSession = {
  id: 'sess-dc-1',
  title: 'Discount Test Session',
  venueName: 'Test Court',
  date: '2026-12-31',
  startTime: '19:00',
  endTime: '21:00',
  priceAed: 100,
  capacity: 16,
  status: 'upcoming',
  spotsBooked: 0,
  confirmedBookings: 0,
  waitlistCount: 0,
  availableSpots: 16,
  linkedSessionId: null,
  linkedQueueSessionId: null,
};

const baseDiscountCode = {
  id: 'dc-1',
  code: 'NEWBIE',
  discountType: 'percentage' as const,
  discountValue: 50,
  firstTimeOnly: true,
  maxUses: null,
  usedCount: 0,
  expiresAt: null,
  isActive: true,
  createdAt: new Date(),
};

const baseBooking = {
  id: 'booking-dc-1',
  userId: 'user-test-1',
  sessionId: 'sess-dc-1',
  status: 'pending',
  paymentMethod: 'ziina',
  amountAed: 0,
  spotsBooked: 1,
  discountCodeId: 'dc-1',
  discountAmountAed: 100,
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

describe('POST /api/marketplace/bookings — discount code paths', () => {
  let handler: Handler;

  beforeAll(async () => {
    handler = await loadBookingHandler();
  }, 30_000);

  beforeEach(() => {
    sendBookingConfirmationEmailMock.mockClear();
    createZiinaIntentMock.mockReset();
  });

  it('discount-only (100% covered): confirms without Ziina, returns paymentMethod="discount" and amount=discountedTotal (0)', async () => {
    const { storage } = await import('../server/storage');

    // Fixed AED 100 discount covers the full AED 100 session price
    const fullDiscountCode = { ...baseDiscountCode, discountType: 'fixed_aed' as const, discountValue: 100 };

    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue({
      id: 'user-test-1', name: 'Test User', email: 'test@example.com',
      linkedPlayerId: null, phone: null, photoUrl: null,
    } as never);
    vi.spyOn(storage, 'validateDiscountCode').mockResolvedValue({
      valid: true,
      discountCode: fullDiscountCode,
      discountAmountAed: 100,
      discountType: 'fixed_aed',
      discountValue: 100,
      discountLabel: 'AED 100 off',
    } as never);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 0,
      discountCodeId: 'dc-1',
      discountAmountAed: 100,
    } as never);

    const applyDiscountSpy = vi.spyOn(storage, 'applyDiscountCode').mockResolvedValue(undefined);
    const updateBookingSpy = vi.spyOn(storage, 'updateBooking').mockResolvedValue({ ...baseBooking } as never);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    vi.spyOn(storage, 'getBookingWithDetails').mockResolvedValue({ id: 'booking-dc-1' } as never);

    const { res, captured } = makeRes();
    await handler({
      user: { userId: 'user-test-1', name: 'Test User', email: 'test@example.com' },
      body: {
        sessionId: 'sess-dc-1',
        paymentMethod: 'ziina',
        spotsBooked: 1,
        discountCode: 'NEWBIE',
        applyWallet: false,
        guests: [],
      },
      params: {},
    }, res);

    // Route must NOT call Ziina for a fully-covered booking
    expect(createZiinaIntentMock).not.toHaveBeenCalled();

    // Booking updated to confirmed with paymentMethod = 'discount'
    expect(updateBookingSpy).toHaveBeenCalledWith(
      'booking-dc-1',
      expect.objectContaining({ status: 'confirmed', paymentMethod: 'discount' }),
    );

    // Discount usage recorded (audit trail + usedCount increment)
    expect(applyDiscountSpy).toHaveBeenCalledWith('booking-dc-1', 'dc-1', 100, 'user-test-1');

    // Booking INSERT stored discount fields
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        discountCodeId: 'dc-1',
        discountAmountAed: 100,
        amountAed: 0,
      }),
    );

    // Response: amount = discountedTotal (0), not originalTotal (100)
    expect(captured.status).toBe(200);
    const body = captured.body as Record<string, unknown>;
    expect(body.paymentMethod).toBe('discount');
    expect(body.amount).toBe(0);
    expect(body.originalAmount).toBe(100);
    expect(body.discountAmountAed).toBe(100);
  });

  it('partial discount (50% NEWBIE): Ziina charged the reduced amount; discount fields stored in booking INSERT', async () => {
    const { storage } = await import('../server/storage');

    vi.spyOn(storage, 'getBookableSession').mockResolvedValue(baseBookableSession as never);
    vi.spyOn(storage, 'getMarketplaceUser').mockResolvedValue({
      id: 'user-test-1', name: 'Test User', email: 'test@example.com',
      linkedPlayerId: null, phone: null, photoUrl: null,
    } as never);
    // NEWBIE 50% off AED 100 → discountedTotal = 50
    vi.spyOn(storage, 'validateDiscountCode').mockResolvedValue({
      valid: true,
      discountCode: baseDiscountCode,
      discountAmountAed: 50,
      discountType: 'percentage',
      discountValue: 50,
      discountLabel: '50% off',
    } as never);

    const createBookingSpy = vi.spyOn(storage, 'createBooking').mockResolvedValue({
      ...baseBooking,
      amountAed: 50,
      discountCodeId: 'dc-1',
      discountAmountAed: 50,
    } as never);

    vi.spyOn(storage, 'applyDiscountCode').mockResolvedValue(undefined);
    vi.spyOn(storage, 'updateBooking').mockResolvedValue({ ...baseBooking } as never);
    vi.spyOn(storage, 'createBookingGuest').mockResolvedValue({ id: 'slot-1' } as never);
    // mintPaymentResumeParam calls createPaymentResumeToken internally
    vi.spyOn(storage, 'createPaymentResumeToken').mockResolvedValue({} as never);

    createZiinaIntentMock.mockResolvedValue({
      id: 'pi_test_partial',
      redirect_url: 'https://ziina.com/pay/test',
      status: 'pending',
    });

    const { res, captured } = makeRes();
    await handler({
      user: { userId: 'user-test-1', name: 'Test User', email: 'test@example.com' },
      body: {
        sessionId: 'sess-dc-1',
        paymentMethod: 'ziina',
        spotsBooked: 1,
        discountCode: 'NEWBIE',
        applyWallet: false,
        guests: [],
      },
      params: {},
    }, res);

    // Ziina IS called with the discounted amount (50, not 100)
    expect(createZiinaIntentMock).toHaveBeenCalledTimes(1);
    expect(createZiinaIntentMock.mock.calls[0][0]).toMatchObject({ amountAed: 50 });

    // Booking INSERT stored discount fields
    expect(createBookingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        discountCodeId: 'dc-1',
        discountAmountAed: 50,
        amountAed: 50,
      }),
    );

    expect(captured.status).toBe(200);
    const body = captured.body as Record<string, unknown>;
    expect(body.amount).toBe(50);
    expect(body.discountAmountAed).toBe(50);
  });
});
