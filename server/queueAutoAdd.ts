import { storage } from "./storage";

// Booking → Queue auto-add helpers. Extracted into their own module so they
// can be imported from both webhookHandler.ts and marketplace-routes.ts
// without creating a circular dependency.

export type EnqueueResult =
  | { added: true; playerId: string; sessionId: string }
  | {
      added: false;
      reason:
        | 'booking_not_found'
        | 'booking_not_confirmed'
        | 'no_player_link'
        | 'no_session_link'
        | 'session_not_active'
        | 'already_in_queue';
    };

// Add a booking's player to the live queue if (a) the booking is confirmed/
// attended, (b) the booker is linked to a player, (c) the bookable session is
// linked to a queue session, and (d) that queue session is currently active.
// Idempotent — safe to call repeatedly.
export async function enqueueBookingIfLive(bookingId: string): Promise<EnqueueResult> {
  const booking = await storage.getBooking(bookingId);
  if (!booking) return { added: false, reason: 'booking_not_found' };
  if (booking.status !== 'confirmed' && booking.status !== 'attended') {
    return { added: false, reason: 'booking_not_confirmed' };
  }

  const user = await storage.getMarketplaceUser(booking.userId);
  if (!user?.linkedPlayerId) return { added: false, reason: 'no_player_link' };

  const bookableSession = await storage.getBookableSession(booking.sessionId);
  if (!bookableSession?.linkedSessionId) return { added: false, reason: 'no_session_link' };

  const queueSession = await storage.getSession(bookableSession.linkedSessionId);
  if (!queueSession || queueSession.status !== 'active') {
    return { added: false, reason: 'session_not_active' };
  }

  const queue = await storage.getQueue(bookableSession.linkedSessionId);
  if (queue.includes(user.linkedPlayerId)) {
    return { added: false, reason: 'already_in_queue' };
  }

  await storage.addToQueue(bookableSession.linkedSessionId, user.linkedPlayerId);
  return { added: true, playerId: user.linkedPlayerId, sessionId: bookableSession.linkedSessionId };
}

// Convenience wrapper: provision a player for the booker if needed, then
// attempt to enqueue. Used at booking-confirmation time and by the admin
// "Provision & enqueue" button. Failures here are logged but never thrown so
// they cannot break booking flows.
export async function provisionAndEnqueueForBooking(bookingId: string): Promise<{
  provisioned?: { playerId: string; created: boolean; claimed: boolean };
  enqueue: EnqueueResult;
}> {
  try {
    const booking = await storage.getBooking(bookingId);
    if (!booking) return { enqueue: { added: false, reason: 'booking_not_found' } };

    let provisioned: { playerId: string; created: boolean; claimed: boolean } | undefined;
    try {
      const result = await storage.ensurePlayerForMarketplaceUser(booking.userId);
      provisioned = { playerId: result.player.id, created: result.created, claimed: result.claimed };
    } catch (err) {
      console.error('[provisionAndEnqueueForBooking] ensurePlayerForMarketplaceUser failed', {
        bookingId,
        userId: booking.userId,
        error: err instanceof Error ? err.message : err,
      });
    }

    const enqueue = await enqueueBookingIfLive(bookingId);
    return { provisioned, enqueue };
  } catch (err) {
    console.error('[provisionAndEnqueueForBooking] unexpected error', {
      bookingId,
      error: err instanceof Error ? err.message : err,
    });
    return { enqueue: { added: false, reason: 'booking_not_found' } };
  }
}

// Used by the session-activation route. Walks every confirmed/attended
// booking attached to the bookable session linked to the activated queue
// session, provisions players where missing, and adds them to the queue.
export async function autoImportConfirmedBookingsForSession(linkedSessionId: string): Promise<{
  processed: number;
  enqueued: number;
  provisioned: number;
  skipped: number;
}> {
  const summary = { processed: 0, enqueued: 0, provisioned: 0, skipped: 0 };
  try {
    const bookableSession = await storage.getBookableSessionByLinkedSessionId(linkedSessionId);
    if (!bookableSession) return summary;

    const sessionBookings = await storage.getSessionBookings(bookableSession.id);
    for (const b of sessionBookings) {
      if (b.status !== 'confirmed' && b.status !== 'attended') continue;
      summary.processed += 1;
      const result = await provisionAndEnqueueForBooking(b.id);
      if (result.provisioned?.created) summary.provisioned += 1;
      if (result.enqueue.added) summary.enqueued += 1;
      else summary.skipped += 1;
    }
  } catch (err) {
    console.error('[autoImportConfirmedBookingsForSession] failed', {
      linkedSessionId,
      error: err instanceof Error ? err.message : err,
    });
  }
  console.log(
    `[autoImportConfirmedBookingsForSession] session=${linkedSessionId} processed=${summary.processed} enqueued=${summary.enqueued} provisioned=${summary.provisioned} skipped=${summary.skipped}`,
  );
  return summary;
}
