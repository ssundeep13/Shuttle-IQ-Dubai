import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Webhook async-finalization tests ─────────────────────────────────────
// When Ziina settles a previously-pending refund asynchronously, the
// `refund.completed` webhook MUST:
//   1. update the payment row's refund state (markZiinaRefundFromWebhook)
//   2. resolve the corresponding refund_required notification so the row
//      moves out of the admin's "Pending Refunds" section
//   3. email the player exactly once (sendRefundProcessedEmail)
// `refund.failed` MUST update the payment row but NOT resolve / NOT email.

const { sendRefundProcessedEmailMock } = vi.hoisted(() => ({
  sendRefundProcessedEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../server/emailClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, sendRefundProcessedEmail: sendRefundProcessedEmailMock };
});

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

async function loadWebhookHandler(): Promise<Handler> {
  const { registerZiinaWebhookRoute } = await import('../server/webhookHandler');
  let webhookHandler: Handler | undefined;
  const noop = () => {};
  const fakeApp = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'post') {
        return (path: string, ...args: unknown[]) => {
          if (typeof path === 'string' && path.includes('webhook')) {
            const last = args[args.length - 1];
            if (typeof last === 'function') webhookHandler = last as Handler;
          }
        };
      }
      return noop;
    },
  });
  registerZiinaWebhookRoute(fakeApp as unknown as Parameters<typeof registerZiinaWebhookRoute>[0]);
  if (!webhookHandler) throw new Error('webhook handler not registered');
  return webhookHandler;
}

function makeReq(eventBody: unknown) {
  return {
    body: Buffer.from(JSON.stringify(eventBody), 'utf8'),
    headers: {},
  };
}

function makeRes() {
  const captured: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(body: unknown) { captured.body = body; return res; },
    send(body: unknown) { captured.body = body; return res; },
  };
  return { res, captured };
}

const baseNotif = {
  id: 'notif-async-1',
  message: 'refund owed',
  createdAt: new Date(),
  read: false,
  relatedBookingId: 'booking-async-1',
  amountAed: 50,
  spotsBooked: 1,
  paymentMethod: 'ziina' as const,
  ziinaPaymentIntentId: 'pi_async_1',
  bookingSessionId: 'sess-async-1',
  playerName: 'Async Alice',
  playerEmail: 'async@example.com',
  sessionTitle: 'Async Night',
  sessionDate: new Date(),
  sessionVenueName: 'Court',
  refundStatus: 'pending' as string | null,
  refundedAt: null as Date | null,
  refundedAmount: 5000 as number | null,
  ziinaRefundId: 're_async_1' as string | null,
};

describe('Ziina webhook — async refund finalization', () => {
  let webhookHandler: Handler;
  beforeAll(async () => { webhookHandler = await loadWebhookHandler(); }, 30000);
  beforeEach(() => {
    vi.restoreAllMocks();
    sendRefundProcessedEmailMock.mockReset().mockResolvedValue(undefined);
    delete process.env.ZIINA_WEBHOOK_SECRET;
  });

  it('refund.completed: marks payment, resolves the notification, and emails the player exactly once', async () => {
    const { storage } = await import('../server/storage');
    const markSpy = vi.spyOn(storage, 'markZiinaRefundFromWebhook')
      .mockResolvedValue({ matched: true, bookingId: 'booking-async-1' } as never);
    const lookupSpy = vi.spyOn(storage, 'getUnresolvedRefundNotificationByBooking')
      .mockResolvedValue({ ...baseNotif } as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(true as never);
    vi.spyOn(storage, 'getBookableSession').mockResolvedValue({ id: 'sess-async-1', title: 'Async Night' } as never);

    const { res, captured } = makeRes();
    await webhookHandler(makeReq({
      event: 'refund.completed',
      refund: { id: 're_done_1', payment_intent_id: 'pi_async_1', status: 'completed', amount: 5000 },
    }), res);

    expect(captured.status).toBe(200);
    expect(markSpy).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'pi_async_1', refundId: 're_done_1', status: 'completed',
    }));
    expect(lookupSpy).toHaveBeenCalledWith('booking-async-1');
    expect(resolveSpy).toHaveBeenCalledWith('notif-async-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendRefundProcessedEmailMock.mock.calls[0][0]).toBe('async@example.com');
  });

  it('refund.completed when admin already resolved: skips re-resolve and does NOT email twice', async () => {
    const { storage } = await import('../server/storage');
    vi.spyOn(storage, 'markZiinaRefundFromWebhook')
      .mockResolvedValue({ matched: true, bookingId: 'booking-async-1' } as never);
    // Admin already clicked the button → no unresolved notification remains.
    const lookupSpy = vi.spyOn(storage, 'getUnresolvedRefundNotificationByBooking')
      .mockResolvedValue(undefined as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(true as never);

    const { res } = makeRes();
    await webhookHandler(makeReq({
      event: 'refund.completed',
      refund: { id: 're_done_1', payment_intent_id: 'pi_async_1', status: 'completed', amount: 5000 },
    }), res);

    expect(lookupSpy).toHaveBeenCalledWith('booking-async-1');
    expect(resolveSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled();
  });

  it('refund.failed: marks payment but does NOT resolve and does NOT email', async () => {
    const { storage } = await import('../server/storage');
    const markSpy = vi.spyOn(storage, 'markZiinaRefundFromWebhook')
      .mockResolvedValue({ matched: true, bookingId: 'booking-async-1' } as never);
    const lookupSpy = vi.spyOn(storage, 'getUnresolvedRefundNotificationByBooking')
      .mockResolvedValue({ ...baseNotif } as never);
    const resolveSpy = vi.spyOn(storage, 'resolveRefundNotification').mockResolvedValue(true as never);

    const { res, captured } = makeRes();
    await webhookHandler(makeReq({
      event: 'refund.failed',
      refund: { id: 're_fail_1', payment_intent_id: 'pi_async_1', status: 'failed', amount: 5000 },
    }), res);

    expect(captured.status).toBe(200);
    expect(markSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    // Lookup is gated behind isZiinaRefundSuccessful, so a failed event must
    // never even attempt to resolve / email.
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled();
  });
});
