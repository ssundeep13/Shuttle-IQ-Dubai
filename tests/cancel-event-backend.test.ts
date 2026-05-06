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
