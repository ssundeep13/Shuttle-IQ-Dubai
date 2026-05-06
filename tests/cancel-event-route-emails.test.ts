import { describe, it, expect, vi } from 'vitest';

// ─── Route-level test: every affected booker is emailed ───────────────────
// The cancel-event admin route MUST email every booker whose seat was
// cancelled — including unpaid (pending / pending_payment) bookings — so
// nobody is left thinking the event is still on. This file uses dedicated
// module mocks (separate from cancel-event-backend.test.ts so the email
// content tests there can call the real sendCancellationEmail).

vi.mock('../server/auth/middleware', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMarketplaceAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { sendCancellationEmailMock } = vi.hoisted(() => ({
  sendCancellationEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../server/emailClient', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, sendCancellationEmail: sendCancellationEmailMock };
});

describe('POST /api/marketplace/admin/sessions/:id/cancel — emails every affected booker', () => {
  it('sends one cancellation email per affected booking, including unpaid statuses', async () => {
    const { storage: storageImpl } = await import('../server/storage');
    const { registerMarketplaceRoutes } = await import('../server/marketplace-routes');

    type Handler = (req: unknown, res: unknown) => Promise<void> | void;
    let cancelHandler: Handler | undefined;
    const noop = () => {};
    const fakeApp = new Proxy({} as Record<string, unknown>, {
      get: (_t, prop) => {
        if (prop === 'post') {
          return (path: string, ...handlers: Handler[]) => {
            if (path === '/api/marketplace/admin/sessions/:id/cancel') {
              cancelHandler = handlers[handlers.length - 1];
            }
          };
        }
        return noop;
      },
    });

    registerMarketplaceRoutes(fakeApp as unknown as Parameters<typeof registerMarketplaceRoutes>[0]);
    expect(cancelHandler, 'cancel route handler should be registered').toBeDefined();

    const sessionRow = { id: 'sess_email_all', title: 'Cancelled Night', venueName: 'Court' };
    vi.spyOn(storageImpl, 'getBookableSession').mockResolvedValue(sessionRow as never);

    const affectedBookings = [
      { id: 'b1', userId: 'u1', status: 'confirmed', paymentMethod: 'ziina',
        amountAed: 50, walletAmountUsed: 0,
        user: { id: 'u1', email: 'paid@example.com', name: 'Paid User' } },
      { id: 'b2', userId: 'u2', status: 'pending_payment', paymentMethod: 'ziina',
        amountAed: 50, walletAmountUsed: 0,
        user: { id: 'u2', email: 'pending@example.com', name: 'Pending User' } },
      { id: 'b3', userId: 'u3', status: 'pending', paymentMethod: 'cash',
        amountAed: 30, walletAmountUsed: 0,
        user: { id: 'u3', email: 'unpaid@example.com', name: 'Unpaid User' } },
    ];

    vi.spyOn(storageImpl, 'cancelBookableSessionAndRefund').mockResolvedValue({
      alreadyCancelled: false,
      affectedBookings,
      walletRefundedCount: 0,
      ziinaRefundCount: 1,
      cashRefundCount: 0,
    } as never);

    sendCancellationEmailMock.mockClear();

    let jsonBody: Record<string, unknown> | undefined;
    const res = {
      status: () => res,
      json: (body: Record<string, unknown>) => { jsonBody = body; return res; },
    };
    const req = { params: { id: 'sess_email_all' }, user: { id: 'admin', role: 'admin' } };

    await cancelHandler!(req, res);

    expect(sendCancellationEmailMock).toHaveBeenCalledTimes(3);
    const recipients = sendCancellationEmailMock.mock.calls.map((c) => c[0]);
    expect(recipients).toEqual(
      expect.arrayContaining(['paid@example.com', 'pending@example.com', 'unpaid@example.com']),
    );

    // Unpaid email uses the "no payment was taken" fallback (amount=0,
    // paymentMethod=null) so the template renders the right copy.
    const unpaidCall = sendCancellationEmailMock.mock.calls.find((c) => c[0] === 'unpaid@example.com');
    expect(unpaidCall?.[4]).toBe(0);
    expect(unpaidCall?.[5]).toMatchObject({ paymentMethod: null, eventCancelledByAdmin: true });

    expect(jsonBody?.emailsSent).toBe(3);
    expect(jsonBody?.bookingsCancelled).toBe(3);
  });
});
