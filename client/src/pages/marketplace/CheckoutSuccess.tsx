import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import type { BookingWithDetails } from '@shared/schema';

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [attempt, setAttempt] = useState(0);
  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');

    if (!bookingId) {
      setStatus('error');
      setErrorMessage('Missing booking information');
      return;
    }

    const token = localStorage.getItem('mp_accessToken');
    if (!token) {
      setStatus('error');
      setErrorMessage('Not authenticated');
      return;
    }

    // Poll the confirm endpoint up to MAX_ATTEMPTS times with a delay between each.
    // Ziina sometimes redirects before it finishes updating the payment status on
    // their side, so we give them a few seconds to settle before giving up.
    let cancelled = false;

    async function pollConfirm() {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        if (i > 0) {
          setAttempt(i);
          await sleep(RETRY_DELAY_MS);
        }
        if (cancelled) return;

        try {
          const res = await fetch(`/api/marketplace/bookings/${bookingId}/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });
          const data = await res.json();

          if (data.confirmed) {
            setStatus('success');
            setBooking(data.booking);
            return;
          }

          // If it's the last attempt, surface the error
          if (i === MAX_ATTEMPTS - 1) {
            setStatus('error');
            setErrorMessage(
              data.status
                ? `Payment status: ${data.status}. Please contact support if you were charged.`
                : 'Payment not confirmed. Please contact support.'
            );
          }
          // Otherwise loop around and retry
        } catch {
          if (i === MAX_ATTEMPTS - 1) {
            setStatus('error');
            setErrorMessage('Failed to verify payment. Please check My Bookings or contact support.');
          }
        }
      }
    }

    pollConfirm();
    return () => { cancelled = true; };
  }, []);

  const verifyingLabel = attempt > 0
    ? `Checking with payment provider… (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`
    : 'Verifying your payment…';

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <Card>
        <CardHeader className="text-center">
          {status === 'verifying' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <CardTitle>{verifyingLabel}</CardTitle>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <CardTitle data-testid="text-booking-confirmed">Booking Confirmed!</CardTitle>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <CardTitle>Something went wrong</CardTitle>
            </>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'success' && booking && (
            <>
              <p className="text-muted-foreground">
                Your spot for <span className="font-semibold text-foreground">{booking.session?.title}</span> has been reserved.
              </p>
              <p className="text-sm text-muted-foreground">
                Amount paid: AED {booking.amountAed}
              </p>
            </>
          )}
          {status === 'success' && !booking && (
            <p className="text-muted-foreground">
              Your payment is being processed. Your booking will be confirmed shortly.
            </p>
          )}
          {status === 'error' && (
            <p className="text-muted-foreground">{errorMessage}</p>
          )}
          {status !== 'verifying' && (
            <div className="flex gap-3 justify-center flex-wrap pt-2">
              <Link href="/marketplace/my-bookings">
                <Button data-testid="button-view-bookings">View My Bookings</Button>
              </Link>
              <Link href="/marketplace/book">
                <Button variant="outline" data-testid="button-browse-sessions">Browse Sessions</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
