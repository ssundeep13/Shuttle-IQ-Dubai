import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, CreditCard, CheckCircle, AlertCircle, Loader2, ArrowLeft, ShieldCheck, Banknote, Info } from 'lucide-react';

declare global {
  interface Window {
    Tapjsli?: (publicKey: string) => any;
  }
}

interface BookingData {
  bookingId: string;
  paymentMethod: 'tap' | 'cash';
  chargeId?: string;
  chargeStatus?: string;
  redirectUrl?: string;
  amount: number;
  session: {
    title: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
  };
}

function CancellationPolicy() {
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Cancellation Policy</p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-4">
              <li>Cancellations within <span className="font-medium">12 hours</span> of the session are subject to full payment</li>
              <li>Last-hour cancellations are subject to <span className="font-medium">full payment</span></li>
              <li><span className="font-medium">No-shows</span> are charged 150% of the session price</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderSummary({ sessionInfo, amount }: { sessionInfo: BookingData['session']; amount: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.date}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.startTime} - {sessionInfo.endTime}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.venueName}</span>
        </div>
        <div className="border-t pt-3 flex items-center justify-between gap-2">
          <span className="font-medium">Total</span>
          <span className="text-xl font-bold" data-testid="text-checkout-amount">AED {amount}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function TapPaymentForm({ bookingId, amount, sessionInfo, onSuccess }: {
  bookingId: string;
  amount: number;
  sessionInfo: BookingData['session'];
  onSuccess: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tapReady, setTapReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const tapRef = useRef<any>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/marketplace/tap/config')
      .then(r => r.json())
      .then(data => {
        if (data.publicKey) setPublicKey(data.publicKey);
        else setError('Payment provider not configured. Please contact support.');
      })
      .catch(() => setError('Could not load payment provider. Please try again.'));
  }, []);

  useEffect(() => {
    if (!publicKey) return;

    const loadTapSDK = () => {
      if (window.Tapjsli) {
        initTap(window.Tapjsli);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://secure.gosell.io/js/sdk/tap.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Tapjsli) initTap(window.Tapjsli);
      };
      document.head.appendChild(script);
    };

    const initTap = (Tapjsli: any) => {
      const tap = Tapjsli(publicKey);
      const elements = tap.elements({});
      const style = {
        base: {
          color: '#535353',
          lineHeight: '18px',
          fontFamily: 'sans-serif',
          fontSmoothing: 'antialiased',
          fontSize: '16px',
          '::placeholder': { color: 'rgba(0, 0, 0, 0.26)', fontSize: '15px' },
        },
        invalid: { color: 'red', iconColor: '#fa755a' },
      };
      const card = elements.create('card', { style });
      if (cardRef.current) {
        card.mount(cardRef.current);
        card.addEventListener('change', (event: any) => {
          if (event.error) setError(event.error.message);
          else setError(null);
        });
      }
      tapRef.current = { tap, card };
      setTapReady(true);
    };

    loadTapSDK();
  }, [publicKey]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tapRef.current || !tapReady) return;

    setProcessing(true);
    setError(null);

    const token = localStorage.getItem('mp_accessToken');

    try {
      const { tap, card } = tapRef.current;
      const result = await tap.createToken(card);

      if (result.error) {
        setError(result.error.message || 'Card validation failed');
        setProcessing(false);
        return;
      }

      const tapToken = result.id;

      const res = await fetch('/api/marketplace/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: bookingId, paymentMethod: 'tap', tapToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      if (data.chargeStatus === 'CAPTURED') {
        const confirmRes = await fetch(`/api/marketplace/bookings/${data.bookingId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
        const confirmData = await confirmRes.json();
        if (confirmRes.ok && confirmData.confirmed) {
          toast({ title: 'Payment successful', description: 'Your booking has been confirmed!' });
          onSuccess();
        } else {
          setError(confirmData.error || 'Failed to confirm booking. Please contact support.');
        }
      } else {
        setError('Payment was not completed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [tapReady, bookingId, toast, onSuccess]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <OrderSummary sessionInfo={sessionInfo} amount={amount} />
      <CancellationPolicy />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Card Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!publicKey && !error && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={cardRef} id="tap-card-element" className={!publicKey ? 'hidden' : ''} />
          {!tapReady && publicKey && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-payment-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full gap-2"
        disabled={!tapReady || processing}
        data-testid="button-confirm-payment"
      >
        {processing ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
        ) : (
          <><ShieldCheck className="h-5 w-5" /> Pay AED {amount}</>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Payments are securely processed by Tap Payments.
      </p>
    </form>
  );
}

function PaymentMethodSelector({ onSelect }: { onSelect: (method: 'tap' | 'cash') => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">How would you like to pay?</h3>
      <div className="grid grid-cols-1 gap-3">
        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onSelect('tap')}
          data-testid="button-pay-card"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-md bg-primary/10">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Pay by Card</p>
              <p className="text-sm text-muted-foreground">Secure card payment via Tap Payments</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onSelect('cash')}
          data-testid="button-pay-cash"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-md bg-chart-2/10">
              <Banknote className="h-6 w-6 text-chart-2" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Pay at Venue</p>
              <p className="text-sm text-muted-foreground">Pay in cash when you arrive</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Checkout() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { isAuthenticated } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<'tap' | 'cash' | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<BookingData['session'] | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/marketplace/login');
      return;
    }

    if (!sessionId) return;

    fetch(`/api/marketplace/sessions/${sessionId}`)
      .then(async res => {
        if (!res.ok) throw new Error('Session not found');
        return res.json();
      })
      .then(data => {
        setSessionInfo({
          title: data.title,
          venueName: data.venueName,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
        });
        setAmount(data.priceAed);
        setSessionLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setSessionLoading(false);
      });
  }, [sessionId, isAuthenticated, setLocation]);

  const handlePaymentMethodSelect = async (method: 'tap' | 'cash') => {
    if (method === 'tap') {
      setPaymentMethod('tap');
      return;
    }

    setPaymentMethod('cash');
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('mp_accessToken');
    if (!token || !sessionId) {
      setLoading(false);
      setPaymentMethod(null);
      setError('Session not found or not authenticated');
      return;
    }

    try {
      const res = await fetch('/api/marketplace/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, paymentMethod: 'cash' }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      toast({ title: 'Booking confirmed', description: 'Please pay in cash when you arrive at the venue.' });
      setConfirmed(true);
      setBookingData(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setPaymentMethod(null);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (sessionLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <Skeleton className="h-8 w-1/2 mb-6" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (confirmed) {
    const isCash = bookingData?.paymentMethod === 'cash';
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <CardTitle data-testid="text-booking-confirmed">Booking Confirmed!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your spot for <span className="font-semibold text-foreground">{sessionInfo?.title || bookingData?.session.title}</span> has been reserved.
            </p>
            {isCash ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm">
                  <Banknote className="h-4 w-4" />
                  Pay AED {bookingData?.amount || amount} in cash at the venue
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Amount paid: AED {bookingData?.amount || amount}</p>
            )}
            <div className="flex gap-3 justify-center flex-wrap pt-2">
              <Link href="/marketplace/my-bookings">
                <Button data-testid="button-view-bookings">View My Bookings</Button>
              </Link>
              <Link href="/marketplace/book">
                <Button variant="outline" data-testid="button-browse-sessions">Browse Sessions</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !paymentMethod) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle>Unable to proceed</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-checkout-error">{error}</p>
            <Link href={`/marketplace/sessions/${sessionId}`}>
              <Button data-testid="button-back-to-session">Back to Session</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href={`/marketplace/sessions/${sessionId}`}>
        <Button variant="ghost" size="sm" className="mb-4 gap-1" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" /> Back to session
        </Button>
      </Link>

      <h1 className="text-2xl font-bold mb-6" data-testid="text-checkout-title">Complete your booking</h1>

      {!paymentMethod && sessionInfo && (
        <div className="space-y-6">
          <OrderSummary sessionInfo={sessionInfo} amount={amount} />
          <CancellationPolicy />
          <PaymentMethodSelector onSelect={handlePaymentMethodSelect} />
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Setting up your booking...</p>
        </div>
      )}

      {paymentMethod === 'tap' && sessionInfo && !loading && (
        <TapPaymentForm
          bookingId={sessionId!}
          amount={amount}
          sessionInfo={sessionInfo}
          onSuccess={() => setConfirmed(true)}
        />
      )}

      {error && paymentMethod && (
        <div className="mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-checkout-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setPaymentMethod(null); setError(null); }}
                data-testid="button-try-again"
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
