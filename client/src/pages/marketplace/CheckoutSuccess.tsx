import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, AlertCircle, ListOrdered } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { queryClient } from '@/lib/queryClient';
import type { BookingWithDetails } from '@shared/schema';

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2500;
const REDIRECT_DELAY_S = 3;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'waitlisted' | 'error'>('verifying');
  const [attempt, setAttempt] = useState(0);
  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');

    if (!bookingId) {
      setStatus('error');
      setErrorMessage('Missing booking information');
      return;
    }

    // Poll the confirm endpoint up to MAX_ATTEMPTS times with a delay between each.
    // Ziina sometimes redirects before it finishes updating the payment status on
    // their side, so we give them a few seconds to settle before giving up.
    // The confirm endpoint does not require auth — the UUID booking ID is sufficient.
    let cancelled = false;
    const token = localStorage.getItem('mp_accessToken');

    async function pollConfirm() {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        if (i > 0) {
          setAttempt(i);
          await sleep(RETRY_DELAY_MS);
        }
        if (cancelled) return;

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(`/api/marketplace/bookings/${bookingId}/confirm`, {
            method: 'POST',
            headers,
          });
          const data = await res.json();

          if (data.confirmed) {
            setStatus('success');
            setBooking(data.booking);
            // Invalidate the session players list and session data so the
            // "Who's Playing" section updates for anyone viewing that session.
            if (data.booking?.sessionId) {
              const sid = data.booking.sessionId;
              queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', sid, 'players'] });
              queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', sid] });
            }
            return;
          }

          // Session became full right as this user paid — they're now waitlisted
          if (data.waitlisted) {
            setStatus('waitlisted');
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

  // Auto-redirect to My Bookings after success
  useEffect(() => {
    if (status !== 'success') return;
    let count = REDIRECT_DELAY_S;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        setLocation('/marketplace/my-bookings');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status, setLocation]);

  const verifyingLabel = attempt > 0
    ? `Checking with payment provider… (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`
    : 'Verifying your payment…';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
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
            {status === 'waitlisted' && (
              <>
                <ListOrdered className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                <CardTitle>Added to Waitlist</CardTitle>
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
                Your payment is confirmed. Your booking has been reserved.
              </p>
            )}
            {status === 'waitlisted' && (
              <p className="text-muted-foreground">
                Your payment went through, but the session filled up just as you completed it. You have been added to the waitlist and will be confirmed if a spot opens up.
              </p>
            )}
            {status === 'error' && (
              <p className="text-muted-foreground">{errorMessage}</p>
            )}
            {status === 'success' && (
              <p className="text-sm text-muted-foreground">
                Redirecting to your bookings in {countdown}s…
              </p>
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
    </div>
  );
}
