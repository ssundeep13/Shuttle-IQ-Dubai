import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BookableSession } from '../shared/schema';

// ─── 1. Email content test ───────────────────────────────────────────────
// Mocks the Resend client so sendCancellationEmail can be invoked in jsdom
// and we can assert on the rendered HTML for admin-cancelled events.

type SendArgs = { from: string; to: string | string[]; subject: string; html: string };
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn<(args: SendArgs) => Promise<{ data: { id: string } | null; error: null }>>()
    .mockResolvedValue({ data: { id: 'msg_1' }, error: null }),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendCancellationEmail } from '../server/emailClient';

const baseSession: BookableSession = {
  id: 'sess_1',
  title: 'Friday Night Smash',
  description: null,
  venueName: 'Skill Court Dubai',
  date: '2026-05-08',
  startTime: '20:00',
  endTime: '22:00',
  capacity: 16,
  pricePerPerson: 4500,
  format: '2v2',
  skillLevel: 'Intermediate',
  imageUrl: null,
  status: 'upcoming',
  linkedSessionId: null,
  linkedQueueSessionId: null,
  cancellationDeadlineHours: 5,
  reminderSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as BookableSession;

describe('sendCancellationEmail — event cancelled by admin', () => {
  beforeEach(() => sendMock.mockClear());

  it('includes refund amount and Ziina 3–5 working day note for ziina bookings', async () => {
    await sendCancellationEmail(
      'p@example.com',
      'Pat',
      baseSession,
      false,
      45,
      { eventCancelledByAdmin: true, paymentMethod: 'ziina', walletAmountUsedAed: 0 },
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe('Event cancelled: Friday Night Smash');
    expect(call.html).toContain('Full refund of AED 45.00');
    expect(call.html).toContain('Ziina');
    expect(call.html).toContain('3–5 working days');
    expect(call.html).toContain('Event cancelled');
  });

  it('uses cash-collection wording for cash bookings', async () => {
    await sendCancellationEmail(
      'p@example.com',
      'Pat',
      baseSession,
      false,
      30,
      { eventCancelledByAdmin: true, paymentMethod: 'cash' },
    );
    const html = sendMock.mock.calls[0][0].html;
    expect(html).toContain('Full refund of AED 30.00');
    expect(html).toContain('cash');
    expect(html).not.toContain('3–5 working days');
  });

  it('mentions wallet credit being returned when walletAmountUsedAed > 0', async () => {
    await sendCancellationEmail(
      'p@example.com',
      'Pat',
      baseSession,
      false,
      20,
      { eventCancelledByAdmin: true, paymentMethod: 'ziina', walletAmountUsedAed: 15 },
    );
    const html = sendMock.mock.calls[0][0].html;
    expect(html).toContain('AED 15.00 wallet credit');
    expect(html).toContain('returned to your ShuttleIQ wallet');
  });

  it('falls back to a no-payment notice when nothing was charged', async () => {
    await sendCancellationEmail(
      'p@example.com',
      'Pat',
      baseSession,
      false,
      0,
      { eventCancelledByAdmin: true, paymentMethod: null, walletAmountUsedAed: 0 },
    );
    const html = sendMock.mock.calls[0][0].html;
    expect(html).toContain('No payment was taken');
  });

  it('preserves the existing late-fee branch when not an admin cancel', async () => {
    await sendCancellationEmail('p@example.com', 'Pat', baseSession, true, 25);
    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe('Booking cancelled: Friday Night Smash');
    expect(call.html).toContain('Late cancellation fee applied');
    expect(call.html).not.toContain('Refund details');
  });
});

// ─── 2. Storage idempotency contract ─────────────────────────────────────
// We validate the helper's documented short-circuits (already-cancelled,
// missing-session) without wiring a live Postgres. A minimal typed db mock
// is provided so failures here surface real contract regressions, not
// random mock plumbing issues.

type SelectChain = {
  from: (table: unknown) => SelectChain;
  where: (...args: unknown[]) => SelectChain;
  limit: (n: number) => SelectChain;
  orderBy: (...args: unknown[]) => SelectChain;
  then: <T>(resolve: (rows: unknown[]) => T) => Promise<T>;
};
function makeSelect(rows: unknown[]): SelectChain {
  const chain: SelectChain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const dbMock = {
  select: vi.fn<() => SelectChain>(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('../server/db', () => ({ db: dbMock }));
vi.mock('../server/matchmaking', () => ({ clearSessionRestStates: vi.fn() }));

const storageMod = await import('../server/storage');
const storage = storageMod.storage;

describe('cancelBookableSessionAndRefund — idempotency contract', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.transaction.mockReset();
  });

  it('short-circuits with alreadyCancelled when the session is already cancelled', async () => {
    dbMock.select.mockReturnValueOnce(
      makeSelect([{ id: 'sess_1', status: 'cancelled', title: 'Already Off' }]),
    );
    const result = await storage.cancelBookableSessionAndRefund('sess_1');
    expect(result).toEqual({
      alreadyCancelled: true,
      affectedBookings: [],
      walletRefundedCount: 0,
      ziinaRefundCount: 0,
      cashRefundCount: 0,
    });
    // Critical: the transaction never opens, so re-runs of the admin
    // action are guaranteed not to double-cancel or double-refund.
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it('throws when no bookable session exists, leaving the transaction untouched', async () => {
    dbMock.select.mockReturnValueOnce(makeSelect([]));
    await expect(storage.cancelBookableSessionAndRefund('missing'))
      .rejects.toThrow(/Bookable session not found/);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});

// ─── 3. Refund-row gating: only confirmed/attended bookings get refunds ──
// Exercises the in-transaction logic with a fully mocked tx so we can
// assert which bookings produce a refund_required notification. This
// guards against the regression flagged in code review where a
// pending_payment Ziina booking with an intent ID would falsely produce
// a refund row.

type RefundInsert = { type: string; relatedBookingId: string };

describe('cancelBookableSessionAndRefund — refund-row gating by booking status', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.transaction.mockReset();
  });

  it('queues refund rows only for confirmed/attended bookings, never pending or pending_payment', async () => {
    // Spy on the helper's two read dependencies so we don't have to model
    // the multi-select join chain in getSessionBookings.
    const sessionRow = { id: 'sess_1', status: 'upcoming', title: 'Mixed Status Night' };
    const getSessionSpy = vi.spyOn(storage, 'getBookableSession')
      .mockResolvedValue(sessionRow as never);

    // Mix of statuses — helper is documented to filter out 'cancelled' itself.
    const bookings = [
      // SHOULD refund (Ziina, confirmed, has intent)
      { id: 'b_paid_ziina', userId: 'u1', status: 'confirmed', paymentMethod: 'ziina',
        ziinaPaymentIntentId: 'pi_1', cashPaid: false, walletAmountUsed: 0, amountAed: 50 },
      // SHOULD refund (cash, attended, marked paid)
      { id: 'b_paid_cash', userId: 'u2', status: 'attended', paymentMethod: 'cash',
        ziinaPaymentIntentId: null, cashPaid: true, walletAmountUsed: 0, amountAed: 30 },
      // MUST NOT refund — pending_payment with a Ziina intent ID
      // (regression case from code review)
      { id: 'b_pending_ziina', userId: 'u3', status: 'pending_payment', paymentMethod: 'ziina',
        ziinaPaymentIntentId: 'pi_unfinished', cashPaid: false, walletAmountUsed: 0, amountAed: 50 },
      // MUST NOT refund — pending cash, not yet paid
      { id: 'b_pending_cash', userId: 'u4', status: 'pending', paymentMethod: 'cash',
        ziinaPaymentIntentId: null, cashPaid: false, walletAmountUsed: 0, amountAed: 30 },
      // Already cancelled — filtered out by helper, included to prove it
      { id: 'b_cancelled', userId: 'u5', status: 'cancelled', paymentMethod: 'ziina',
        ziinaPaymentIntentId: 'pi_old', cashPaid: false, walletAmountUsed: 0, amountAed: 50 },
    ];
    const getBookingsSpy = vi.spyOn(storage, 'getSessionBookings')
      .mockResolvedValue(bookings as never);

    // Capture refund_required inserts inside the transaction.
    const refundInserts: RefundInsert[] = [];
    dbMock.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: () => ({
          set: () => ({ where: () => Promise.resolve(undefined) }),
        }),
        select: () => makeSelect([{ linkedPlayerId: null }]),
        insert: () => ({
          values: (v: { type: string; relatedBookingId: string }) => {
            if (v?.type === 'refund_required') {
              refundInserts.push({ type: v.type, relatedBookingId: v.relatedBookingId });
            }
            return Promise.resolve(undefined);
          },
        }),
      };
      await fn(tx);
    });

    const result = await storage.cancelBookableSessionAndRefund('sess_1');

    // Only the two paid bookings should produce refund rows.
    expect(refundInserts).toHaveLength(2);
    const refundedIds = refundInserts.map((r) => r.relatedBookingId).sort();
    expect(refundedIds).toEqual(['b_paid_cash', 'b_paid_ziina']);

    // Counts must reflect ziina vs cash split, not raw booking count.
    expect(result.ziinaRefundCount).toBe(1);
    expect(result.cashRefundCount).toBe(1);
    expect(result.walletRefundedCount).toBe(0);

    // affectedBookings excludes the already-cancelled row but includes all
    // others (including the pending ones — they are still cancelled,
    // just not refunded).
    expect(result.affectedBookings).toHaveLength(4);
    expect(result.affectedBookings.map((b) => b.id)).not.toContain('b_cancelled');

    getSessionSpy.mockRestore();
    getBookingsSpy.mockRestore();
  });
});
