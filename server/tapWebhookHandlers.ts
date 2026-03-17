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

export class TapWebhookHandlers {
  static async processWebhook(payload: any): Promise<void> {
    try {
      const chargeId = payload?.id;
      const status = payload?.status;

      if (!chargeId || !status) {
        console.warn('Tap webhook: missing id or status in payload');
        return;
      }

      if (status === 'CAPTURED') {
        await TapWebhookHandlers.handleChargeSucceeded(payload);
      } else if (status === 'DECLINED' || status === 'CANCELLED' || status === 'VOID' || status === 'FAILED') {
        await TapWebhookHandlers.handleChargeFailed(payload);
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

    await storage.createPayment({
      bookingId: booking.id,
      tapChargeId: chargeId,
      amount: booking.amountAed,
      currency: 'aed',
      status: 'completed',
    });

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
