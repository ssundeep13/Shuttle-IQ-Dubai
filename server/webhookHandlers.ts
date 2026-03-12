import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString());
      switch (event.type) {
        case 'checkout.session.completed':
          await WebhookHandlers.handleCheckoutCompleted(event.data.object);
          break;
        case 'payment_intent.succeeded':
          await WebhookHandlers.handlePaymentIntentSucceeded(event.data.object);
          break;
      }
    } catch (error: any) {
      console.error('Business webhook handler error:', error.message);
    }
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return;

    const booking = await storage.getBooking(bookingId);
    if (!booking) return;
    if (booking.status === 'confirmed') return;

    if (session.payment_status === 'paid') {
      await storage.updateBooking(bookingId, { status: 'confirmed' });

      await storage.createPayment({
        bookingId: booking.id,
        stripePaymentIntentId: session.payment_intent as string,
        amount: booking.amountAed,
        currency: "aed",
        status: "completed",
      });

      console.log(`Webhook: Booking ${bookingId} confirmed via checkout.session.completed`);
    }
  }

  static async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    const { sessionId, userId } = paymentIntent.metadata || {};
    if (!sessionId || !userId) return;

    const bookings = await storage.getSessionBookings(sessionId);
    const booking = bookings.find(
      (b: any) => b.paymentIntentId === paymentIntent.id && b.status === 'pending'
    );
    if (!booking) return;

    await storage.updateBooking(booking.id, { status: 'confirmed' });

    await storage.createPayment({
      bookingId: booking.id,
      stripePaymentIntentId: paymentIntent.id,
      amount: booking.amountAed,
      currency: "aed",
      status: "completed",
    });

    console.log(`Webhook: Booking ${booking.id} confirmed via payment_intent.succeeded`);
  }
}
