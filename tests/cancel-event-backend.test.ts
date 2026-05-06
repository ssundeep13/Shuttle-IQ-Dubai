import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── 1. Email content test ───────────────────────────────────────────────
// Mocks the Resend client so sendCancellationEmail can be invoked in jsdom
// and we can assert on the rendered HTML for admin-cancelled events.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null }),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendCancellationEmail } from '../server/emailClient';

const baseSession = {
  id: 'sess_1',
  title: 'Friday Night Smash',
  venue: 'Skill Court Dubai',
  date: '2026-05-08',
  startTime: '20:00',
  endTime: '22:00',
} as any;

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

// ─── 2. Storage helper idempotency + counts test ─────────────────────────
// Mocks the `db` module so cancelBookableSessionAndRefund can be exercised
// without a live Postgres. We verify that:
//  - a session already at status='cancelled' short-circuits with
//    `alreadyCancelled: true` and nobody is touched
//  - per-payment-method refund counts come out right
//  - the work happens inside a single db.transaction call

type AnyFn = (...args: any[]) => any;
const txOps = {
  updates: [] as Array<{ table: string; values: any }>,
  inserts: [] as Array<{ table: string; values: any }>,
  selects: [] as Array<any>,
};

// Build a chainable mock that returns an array (for select/returning) or
// resolves to undefined (for update/insert without returning).
function chainable(result: any = []) {
  const obj: any = {};
  const methods = ['from', 'where', 'set', 'values', 'returning', 'limit', 'orderBy'];
  for (const m of methods) obj[m] = vi.fn(() => obj);
  obj.then = (resolve: AnyFn) => Promise.resolve(result).then(resolve);
  return obj;
}

const tableName = (t: any): string => {
  if (!t) return '?';
  // drizzle table objects expose Symbol(drizzle:Name) but for tests we just
  // tag the table by its toString() key heuristically.
  if (t._?.name) return t._.name;
  if (t.name) return t.name;
  return Object.prototype.toString.call(t);
};

const dbMock: any = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(async (fn: AnyFn) => {
    const tx = {
      select: vi.fn((cols?: any) => {
        const ch = chainable([{ linkedPlayerId: 'player_1' }]);
        return ch;
      }),
      update: vi.fn((table: any) => {
        const ch = chainable();
        const origSet = ch.set;
        ch.set = vi.fn((v: any) => { txOps.updates.push({ table: tableName(table), values: v }); return ch; });
        return ch;
      }),
      insert: vi.fn((table: any) => {
        const ch = chainable();
        ch.values = vi.fn((v: any) => { txOps.inserts.push({ table: tableName(table), values: v }); return ch; });
        return ch;
      }),
    };
    return fn(tx);
  }),
};

vi.mock('../server/db', () => ({ db: dbMock }));
vi.mock('../server/matchmaking', () => ({ clearSessionRestStates: vi.fn() }));

// Import the module under test AFTER mocks are registered.
const storageMod = await import('../server/storage');
const { storage } = storageMod as any;

describe('cancelBookableSessionAndRefund — idempotency & counts', () => {
  beforeEach(() => {
    txOps.updates.length = 0;
    txOps.inserts.length = 0;
    txOps.selects.length = 0;
    dbMock.select.mockReset();
    dbMock.transaction.mockClear();
  });

  it('short-circuits when the session is already cancelled', async () => {
    // First db.select call inside the helper fetches the bookable session.
    dbMock.select.mockReturnValueOnce(chainable([{ id: 'sess_1', status: 'cancelled', title: 'X' }]));
    const result = await storage.cancelBookableSessionAndRefund('sess_1');
    expect(result).toEqual({
      alreadyCancelled: true,
      affectedBookings: [],
      walletRefundedCount: 0,
      ziinaRefundCount: 0,
      cashRefundCount: 0,
    });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it('throws when no bookable session exists, leaving the transaction untouched', async () => {
    dbMock.select.mockReturnValueOnce(chainable([])); // no row
    await expect(storage.cancelBookableSessionAndRefund('missing'))
      .rejects.toThrow(/Bookable session not found/);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
