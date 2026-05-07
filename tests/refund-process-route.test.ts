import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Route-level test: POST /api/marketplace/admin/refunds/:id/process ─────
// Covers the contract guarantees that protect real money:
//   1. unresolved-row guard — refuses to refund a row that was already
//      manually marked resolved (no Ziina re-charge by mistake).
//   2. Ziina is called exactly once on the happy path; storage records the
//      refund and the notification flips to resolved.
//   3. Idempotent re-call after success short-circuits without hitting Ziina
//      again, returning alreadyRefunded=true.
//   4. Failure path: Ziina rejection leaves the notification UNresolved so
//      the admin can retry, and surfaces the upstream error message.

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { createZiinaRefundMock, sendRefundProcessedEmailMock } = vi.hoisted(() => ({
  createZiinaRefundMock: vi.fn(),
  sendRefundProcessedEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../server/ziinaClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, createZiinaRefund: createZiinaRefundMock };
});
vi.mock('../server/emailClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, sendRefundProcessedEmail: sendRefundProcessedEmailMock };
});

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

async function loadHandler(): Promise<Handler> {
  const { registerMarketplaceRoutes } = await import('../server/marketplace-routes');
  let processHandler: Handler | undefined;
  const noop = () => {};
  const fakeApp = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'post') {
        return (path: string, ...handlers: Handler[]) => {
          if (path === '/api/marketplace/admin/refunds/:notificationId/process') {
            processHandler = handlers[handlers.length - 1];
          }
        };
      }
      return noop;
    },
  });
  registerMarketplaceRoutes(fakeApp as unknown as Parameters<typeof registerMarketplaceRoutes>[0]);
  if (!processHandler) throw new Error('process handler not registered');
  return processHandler;
}

function makeRes() {
  const captured: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(body: unknown) { captured.body = body; return res; },
  };
  return { res, captured };
}

const baseRefund = {
  id: 'notif-1',
  message: 'refund owed',
  createdAt: new Date(),
  read: false,
  relatedBookingId: 'booking-1',
  amountAed: 50,
  spotsBooked: 1,
  paymentMethod: 'ziina' as const,
  ziinaPaymentIntentId: 'pi_test_xyz',
  bookingSessionId: 'sess-1',
  playerName: 'Alice',
  playerEmail: 'alice@example.com',
  sessionTitle: 'Friday Night',
  sessionDate: new Date(),
  sessionVenueName: 'Court',
  refundStatus: null as string | null,
  refundedAt: null as Date | null,
  refundedAmount: null as number | null,
  ziinaRefundId: null as string | null,
};

describe('POST /api/marketplace/admin/refunds/:notificationId/process', () => {
  let handler: Handler;
  beforeAll(async () => { handler = await loadHandler(); }, 30000);
  beforeEach(() => {
    createZiinaRefundMock.mockReset();
    sendRefundProcessedEmailMock.mockClear();
    vi.restoreAllMocks();
  });

  it('refunds via Ziina, records the refund, resolves the notification, and emails the player', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({ ...baseRefund } as never);
    const recordSpy = vi.spyOn(storage, 'recordZiinaRefund').mockResolvedValue(undefined as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(undefined as never);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue({ id: 'sess-1', title: 'Friday Night' } as never);

    createZiinaRefundMock.mockResolvedValue({ id: 're_1', status: 'completed', payment_intent_id: 'pi_test_xyz', amount: 5000 });


    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    expect(createZiinaRefundMock).toHaveBeenCalledTimes(1);
    expect(createZiinaRefundMock.mock.calls[0][0]).toMatchObject({
      intentId: 'pi_test_xyz',
      amountFils: 5000,
      idempotencyKey: 'refund-notif-1',
    });
    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ refundId: 're_1', amountFils: 5000 }));
    expect(resolveSpy).toHaveBeenCalledWith('notif-1');
    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ success: true, refundId: 're_1' });
    // Email is fire-and-forget; allow microtasks to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledTimes(1);
  });

  it('refuses (409) to process a row that was already manually resolved without a refund', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({ ...baseRefund, read: true } as never);
    const recordSpy = vi.spyOn(storage, 'recordZiinaRefund').mockResolvedValue(undefined as never);


    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    expect(createZiinaRefundMock).not.toHaveBeenCalled();
    expect(recordSpy).not.toHaveBeenCalled();
    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({ error: expect.stringMatching(/already resolved/i) });
  });

  it('is idempotent: a re-call after a successful refund short-circuits without hitting Ziina again', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({
      ...baseRefund,
      read: true,
      refundStatus: 'completed',
      refundedAmount: 5000,
      refundedAt: new Date(),
      ziinaRefundId: 're_1',
    } as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(undefined as never);


    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    expect(createZiinaRefundMock).not.toHaveBeenCalled();
    expect(resolveSpy).toHaveBeenCalledWith('notif-1');
    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ success: true, alreadyRefunded: true, refundId: 're_1' });
  });

  it('persists status=pending and does NOT resolve / does NOT email when Ziina returns a non-terminal status', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({ ...baseRefund } as never);
    const recordSpy = vi.spyOn(storage, 'recordZiinaRefund').mockResolvedValue(undefined as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(undefined as never);
    createZiinaRefundMock.mockResolvedValue({ id: 're_2', status: 'pending', payment_intent_id: 'pi_test_xyz', amount: 5000 });

    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    // The refund was attempted and persisted with pending status + null
    // settlement timestamp — but the notification is NOT resolved and NO
    // success email is sent. Webhook will finalize later.
    expect(createZiinaRefundMock).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', refundedAt: null }));
    expect(resolveSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled();
    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ success: true, pending: true, status: 'pending', refundedAt: null });
  });

  it('returns 502 and does NOT resolve when Ziina synchronously reports a terminal failure status', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({ ...baseRefund } as never);
    const recordSpy = vi.spyOn(storage, 'recordZiinaRefund').mockResolvedValue(undefined as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(undefined as never);
    createZiinaRefundMock.mockResolvedValue({ id: 're_3', status: 'failed', payment_intent_id: 'pi_test_xyz', amount: 5000 });

    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled();
    expect(captured.status).toBe(502);
    expect(captured.body).toMatchObject({ error: expect.stringMatching(/failed/i) });
  });

  it('leaves the notification pending and surfaces the Ziina error when the refund call fails', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'getRefundNotification').mockResolvedValue({ ...baseRefund } as never);
    const recordSpy = vi.spyOn(storage, 'recordZiinaRefund').mockResolvedValue(undefined as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(undefined as never);
    createZiinaRefundMock.mockRejectedValue(new Error('Ziina insufficient balance'));


    const { res, captured } = makeRes();
    await handler({ params: { notificationId: 'notif-1' }, user: { id: 'admin', role: 'admin' } }, res);

    expect(createZiinaRefundMock).toHaveBeenCalledTimes(1);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(captured.status).toBe(502);
    expect(captured.body).toMatchObject({ error: 'Ziina insufficient balance' });
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled();
  });
});
