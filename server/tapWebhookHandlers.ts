import { storage } from './storage';

export class TapWebhookHandlers {
  static async processWebhook(payload: any): Promise<void> {
    try {
      const chargeId = payload?.id;
      const status = payload?.status;

      if (!chargeId || !status) return;

      if (status === 'CAPTURED') {
        await TapWebhookHandlers.handleChargeSucceeded(payload);
      } else if (status === 'DECLINED' || status === 'CANCELLED' || status === 'VOID') {
        await TapWebhookHandlers.handleChargeFailed(payload);
      }
    } catch (error: any) {
      console.error('Tap webhook handler error:', error.message);
    }
  }

  static async handleChargeSucceeded(charge: any): Promise<void> {
    const chargeId = charge.id;
    const metadata = charge.metadata || {};
    const bookingId = metadata.bookingId;

    if (!bookingId) return;

    const booking = await storage.getBooking(bookingId);
    if (!booking || booking.status === 'confirmed') return;

    await storage.updateBooking(bookingId, { status: 'confirmed' });

    await storage.createPayment({
      bookingId: booking.id,
      tapChargeId: chargeId,
      amount: booking.amountAed,
      currency: 'aed',
      status: 'completed',
    });

    console.log(`Tap Webhook: Booking ${bookingId} confirmed via charge.CAPTURED`);
  }

  static async handleChargeFailed(charge: any): Promise<void> {
    const chargeId = charge.id;
    const metadata = charge.metadata || {};
    const bookingId = metadata.bookingId;

    if (!bookingId) return;

    const booking = await storage.getBooking(bookingId);
    if (!booking || booking.status !== 'pending') return;

    await storage.updateBooking(bookingId, { status: 'cancelled', cancelledAt: new Date() });

    console.log(`Tap Webhook: Booking ${bookingId} cancelled via charge.${charge.status} (charge: ${chargeId})`);
  }
}
