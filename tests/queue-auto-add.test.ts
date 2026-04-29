import { describe, it, expect, beforeEach, vi } from 'vitest';

// We mock the storage singleton so queueAutoAdd can be exercised without a
// real database. Each test resets the mocks and seeds them with the minimal
// state needed to drive a single code path through enqueueBookingIfLive /
// provisionAndEnqueueForBooking / autoImportConfirmedBookingsForSession.
vi.mock('../server/storage', () => {
  const m = {
    getBooking: vi.fn(),
    getMarketplaceUser: vi.fn(),
    getBookableSession: vi.fn(),
    getBookableSessionByLinkedSessionId: vi.fn(),
    getSession: vi.fn(),
    getQueue: vi.fn(),
    addToQueue: vi.fn(),
    ensurePlayerForMarketplaceUser: vi.fn(),
    getSessionBookings: vi.fn(),
  };
  return { storage: m };
});

import { storage as mockedStorage } from '../server/storage';
import {
  enqueueBookingIfLive,
  provisionAndEnqueueForBooking,
  autoImportConfirmedBookingsForSession,
} from '../server/queueAutoAdd';

const storage = mockedStorage as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  for (const fn of Object.values(storage)) fn.mockReset();
});

describe('enqueueBookingIfLive — gating', () => {
  it('rejects when booking does not exist', async () => {
    storage.getBooking.mockResolvedValue(undefined);
    const res = await enqueueBookingIfLive('missing');
    expect(res).toEqual({ added: false, reason: 'booking_not_found' });
  });

  it('rejects when booking is not confirmed/attended', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'pending_payment' });
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: false, reason: 'booking_not_confirmed' });
  });

  it('rejects when the marketplace user has no linked player', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: null });
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: false, reason: 'no_player_link' });
  });

  it('rejects when bookable session is not linked to a queue session', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p1' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: null });
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: false, reason: 'no_session_link' });
  });

  it('rejects when the linked queue session is not active (e.g. ended)', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p1' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: 'qs1' });
    storage.getSession.mockResolvedValue({ id: 'qs1', status: 'ended' });
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: false, reason: 'session_not_active' });
  });

  it('is idempotent — does not re-add a player already in the queue', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p1' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: 'qs1' });
    storage.getSession.mockResolvedValue({ id: 'qs1', status: 'active' });
    storage.getQueue.mockResolvedValue(['p1', 'pX']);
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: false, reason: 'already_in_queue' });
    expect(storage.addToQueue).not.toHaveBeenCalled();
  });

  it('adds the player to the queue when every condition is met', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p1' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: 'qs1' });
    storage.getSession.mockResolvedValue({ id: 'qs1', status: 'active' });
    storage.getQueue.mockResolvedValue(['pX']);
    storage.addToQueue.mockResolvedValue(undefined);
    const res = await enqueueBookingIfLive('b1');
    expect(res).toEqual({ added: true, playerId: 'p1', sessionId: 'qs1' });
    expect(storage.addToQueue).toHaveBeenCalledWith('qs1', 'p1');
  });
});

describe('provisionAndEnqueueForBooking', () => {
  it('returns booking_not_found and skips provisioning when booking is missing', async () => {
    storage.getBooking.mockResolvedValue(undefined);
    const res = await provisionAndEnqueueForBooking('missing');
    expect(res.provisioned).toBeUndefined();
    expect(res.enqueue).toEqual({ added: false, reason: 'booking_not_found' });
    expect(storage.ensurePlayerForMarketplaceUser).not.toHaveBeenCalled();
  });

  it('reports provisioning details (created path) and then enqueues', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.ensurePlayerForMarketplaceUser.mockResolvedValue({
      player: { id: 'p1' },
      created: true,
      claimed: false,
    });
    // After provisioning, the user is now linked → enqueue path runs.
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p1' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: 'qs1' });
    storage.getSession.mockResolvedValue({ id: 'qs1', status: 'active' });
    storage.getQueue.mockResolvedValue([]);
    storage.addToQueue.mockResolvedValue(undefined);

    const res = await provisionAndEnqueueForBooking('b1');
    expect(res.provisioned).toEqual({ playerId: 'p1', created: true, claimed: false });
    expect(res.enqueue).toEqual({ added: true, playerId: 'p1', sessionId: 'qs1' });
  });

  it('reports provisioning details (claimed path) when an existing player was uniquely matched', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.ensurePlayerForMarketplaceUser.mockResolvedValue({
      player: { id: 'p7' },
      created: false,
      claimed: true,
    });
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: 'p7' });
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId: 'qs1' });
    storage.getSession.mockResolvedValue({ id: 'qs1', status: 'active' });
    storage.getQueue.mockResolvedValue([]);
    storage.addToQueue.mockResolvedValue(undefined);

    const res = await provisionAndEnqueueForBooking('b1');
    expect(res.provisioned).toEqual({ playerId: 'p7', created: false, claimed: true });
    expect(res.enqueue.added).toBe(true);
  });

  it('still tries to enqueue when ensurePlayer throws — never breaks the booking flow', async () => {
    storage.getBooking.mockResolvedValue({ id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' });
    storage.ensurePlayerForMarketplaceUser.mockRejectedValue(new Error('db down'));
    // Without provisioning, the user has no linked player → enqueue gracefully reports no_player_link.
    storage.getMarketplaceUser.mockResolvedValue({ id: 'u1', linkedPlayerId: null });

    const res = await provisionAndEnqueueForBooking('b1');
    expect(res.provisioned).toBeUndefined();
    expect(res.enqueue).toEqual({ added: false, reason: 'no_player_link' });
  });
});

describe('autoImportConfirmedBookingsForSession — idempotency on re-activation', () => {
  it('only enqueues confirmed/attended bookings, and re-runs are no-ops once players are queued', async () => {
    const linkedSessionId = 'qs1';
    storage.getBookableSessionByLinkedSessionId.mockResolvedValue({ id: 's1', linkedSessionId });
    storage.getSessionBookings.mockResolvedValue([
      { id: 'b1', userId: 'u1', sessionId: 's1', status: 'confirmed' },
      { id: 'b2', userId: 'u2', sessionId: 's1', status: 'cancelled' }, // skipped
      { id: 'b3', userId: 'u3', sessionId: 's1', status: 'attended' },
    ]);

    // For each booking, ensurePlayer succeeds and links a player; then the
    // enqueue path runs against the live queue. Track queue state across
    // calls to assert idempotency.
    const linkedPlayers: Record<string, string> = { u1: 'p1', u3: 'p3' };
    storage.ensurePlayerForMarketplaceUser.mockImplementation(async (userId: string) => ({
      player: { id: linkedPlayers[userId] ?? `auto-${userId}` },
      created: false,
      claimed: false,
    }));
    storage.getBooking.mockImplementation(async (bookingId: string) => {
      const all = (await storage.getSessionBookings()) as Array<{ id: string; userId: string; sessionId: string; status: string }>;
      return all.find(b => b.id === bookingId);
    });
    storage.getMarketplaceUser.mockImplementation(async (userId: string) => ({
      id: userId,
      linkedPlayerId: linkedPlayers[userId] ?? null,
    }));
    storage.getBookableSession.mockResolvedValue({ id: 's1', linkedSessionId });
    storage.getSession.mockResolvedValue({ id: linkedSessionId, status: 'active' });
    const queue: string[] = [];
    storage.getQueue.mockImplementation(async () => [...queue]);
    storage.addToQueue.mockImplementation(async (_sid: string, pid: string) => { queue.push(pid); });

    const first = await autoImportConfirmedBookingsForSession(linkedSessionId);
    expect(first.processed).toBe(2); // cancelled is skipped
    expect(first.enqueued).toBe(2);
    expect(queue).toEqual(['p1', 'p3']);

    // Second call (e.g. admin re-activates the session) must NOT re-enqueue.
    const second = await autoImportConfirmedBookingsForSession(linkedSessionId);
    expect(second.processed).toBe(2);
    expect(second.enqueued).toBe(0);
    expect(second.skipped).toBe(2);
    expect(queue).toEqual(['p1', 'p3']); // unchanged
  });

  it('returns a zero summary and does not throw when the session has no booking source', async () => {
    storage.getBookableSessionByLinkedSessionId.mockResolvedValue(undefined);
    const summary = await autoImportConfirmedBookingsForSession('orphan-qs');
    expect(summary).toEqual({ processed: 0, enqueued: 0, provisioned: 0, skipped: 0 });
  });
});
