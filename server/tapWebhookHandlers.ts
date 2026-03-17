import crypto from 'crypto';
import { storage } from './storage';

export function verifyTapWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.TAP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('TAP_WEBHOOK_SECRET not set — skipping webhook signature verification in dev mode');
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const computed = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'utf-8'), Buffer.from(signature, 'utf-8'));
  } catch {
    return false;
  }
}

function extractCharge(payload: any): { charge: any; status: string } | null {
  if (!payload || typeof payload !== 'object') return null;

  // Case 1: Direct charge payload (Tap sends charge object directly)
  // e.g. { id: 'chg_xxx', status: 'CAPTURED', ... }
  if (payload.id && payload.status && typeof payload.status === 'string') {
    return { charge: payload, status: payload.status };
  }

  // Case 2: Event envelope with nested charge
  // e.g. { type: 'charge.completed', data: { id: 'chg_xxx', status: 'CAPTURED', ... } }
  if (payload.type && payload.data) {
    const charge = payload.data;
    const status = charge?.status ?? '';
    if (charge?.id && status) {
      return { charge, status };
    }
  }

  // Case 3: Event envelope with 'object' key
  // e.g. { event_type: 'charge.completed', object: { id: 'chg_xxx', status: 'CAPTURED', ... } }
  if (payload.object?.id && payload.object?.status) {
    return { charge: payload.object, status: payload.object.status };
  }

  // Case 4: Event type with charge embedded at root
  // e.g. { event_type: 'charge.completed', id: 'chg_xxx', status: 'CAPTURED', ... }
  if ((payload.event_type || payload.type) && payload.id && payload.status) {
    return { charge: payload, status: payload.status };
  }

  return null;
}

export class TapWebhookHandlers {
  static async processWebhook(payload: any): Promise<void> {
    try {
      const extracted = extractCharge(payload);
      if (!extracted) {
        console.warn('Tap webhook: unrecognized payload shape — could not extract charge', JSON.stringify(payload).slice(0, 200));
        return;
      }

      const { charge, status } = extracted;
      const chargeId = charge.id;

      if (status === 'CAPTURED') {
        await TapWebhookHandlers.handleChargeSucceeded(charge);
      } else if (['DECLINED', 'CANCELLED', 'VOID', 'FAILED'].includes(status)) {
        await TapWebhookHandlers.handleChargeFailed(charge);
      } else {
        console.log(`Tap webhook: unhandled charge status "${status}" for charge ${chargeId}`);
      }
    } catch (error: any) {
      console.error('Tap webhook handler error:', error.message);
    }
  }

  static async handleChargeSucceeded(charge: any): Promise<void> {
    const chargeId = charge.id;
    const metadata = charge.metadata || {};
    const bookingId = metadata.bookingId;

    if (!bookingId) {
      console.warn(`Tap webhook: CAPTURED charge ${chargeId} has no bookingId in metadata`);
      return;
    }

    const booking = await storage.getBooking(bookingId);
    if (!booking) {
      console.warn(`Tap webhook: booking ${bookingId} not found for charge ${chargeId}`);
      return;
    }

    if (booking.status === 'confirmed') {
      console.log(`Tap webhook: booking ${bookingId} already confirmed, skipping`);
      return;
    }

    await storage.updateBooking(bookingId, { status: 'confirmed' });

    // Idempotency: only create payment record if one doesn't already exist for this charge
    const existingPayments = await storage.getPaymentsByBookingId(bookingId);
    const alreadyRecorded = existingPayments.some(p => p.tapChargeId === chargeId);
    if (!alreadyRecorded) {
      await storage.createPayment({
        bookingId: booking.id,
        tapChargeId: chargeId,
        amount: booking.amountAed,
        currency: 'aed',
        status: 'completed',
      });
    }

    console.log(`Tap webhook: Booking ${bookingId} confirmed via CAPTURED charge ${chargeId}`);
  }

  static async handleChargeFailed(charge: any): Promise<void> {
    const chargeId = charge.id;
    const status = charge.status;
    const metadata = charge.metadata || {};
    const bookingId = metadata.bookingId;

    if (!bookingId) {
      console.warn(`Tap webhook: ${status} charge ${chargeId} has no bookingId in metadata`);
      return;
    }

    const booking = await storage.getBooking(bookingId);
    if (!booking) {
      console.warn(`Tap webhook: booking ${bookingId} not found for charge ${chargeId}`);
      return;
    }

    if (booking.status !== 'pending') {
      console.log(`Tap webhook: booking ${bookingId} is already in status "${booking.status}", skipping cancellation`);
      return;
    }

    await storage.updateBooking(bookingId, { status: 'cancelled', cancelledAt: new Date() });

    console.log(`Tap webhook: Booking ${bookingId} cancelled via ${status} charge ${chargeId}`);
  }
}
