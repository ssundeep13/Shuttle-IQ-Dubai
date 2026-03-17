import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, CreditCard, CheckCircle, AlertCircle, Loader2, ArrowLeft, ShieldCheck, Banknote, Info } from 'lucide-react';

interface BookingData {
  bookingId: string;
  paymentMethod: 'ziina' | 'cash';
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

function ZiinaPaymentForm({ sessionId, amount, sessionInfo }: {
  sessionId: string;
  amount: number;
  sessionInfo: BookingData['session'];
}) {
  const [processing, setProcessing] = useState(false);
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handlePay = async () => {
    setProcessing(true);
    setError(null);

    const token = localStorage.getItem('mp_accessToken');
    if (!token) {
      setError('Not authenticated. Please log in again.');
      setProcessing(false);
      return;
    }

    try {
      const res = await fetch('/api/marketplace/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, paymentMethod: 'ziina' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (!data.redirectUrl) {
        throw new Error('No payment URL received. Please try again.');
      }

      // Open in a new tab to avoid iframe embedding restrictions on pay.ziina.com
      const newWindow = window.open(data.redirectUrl, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        // Fallback if popup was blocked — navigate in the same window
        window.location.href = data.redirectUrl;
      } else {
        setPaymentOpened(true);
      }
      setProcessing(false);
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setProcessing(false);
    }
  };

  if (paymentOpened) {
    return (
      <div className="space-y-6">
        <OrderSummary sessionInfo={sessionInfo} amount={amount} />
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Payment page opened in a new tab</p>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400">
              Complete your payment in the Ziina tab. Once done, you'll see a confirmation page. You can also check your bookings from the menu.
            </p>
          </CardContent>
        </Card>
        <Link href="/marketplace/my-bookings">
          <Button variant="outline" className="w-full" data-testid="button-view-bookings">
            View My Bookings
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrderSummary sessionInfo={sessionInfo} amount={amount} />
      <CancellationPolicy />

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-payment-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        disabled={processing}
        onClick={handlePay}
        data-testid="button-confirm-payment"
      >
        {processing ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Preparing payment...</>
        ) : (
          <><ShieldCheck className="h-5 w-5" /> Pay AED {amount} — Secure Checkout</>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Payments are securely processed by Ziina. You'll be redirected to complete payment.
      </p>
    </div>
  );
}

function PaymentMethodSelector({ onSelect }: { onSelect: (method: 'ziina' | 'cash') => void }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">How would you like to pay?</h3>
      <div className="grid grid-cols-1 gap-3">
        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onSelect('ziina')}
          data-testid="button-pay-card"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-md bg-primary/10">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Pay by Card</p>
              <p className="text-sm text-muted-foreground">Secure card payment via Ziina</p>
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
  const [paymentMethod, setPaymentMethod] = useState<'ziina' | 'cash' | null>(null);
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

  const handlePaymentMethodSelect = async (method: 'ziina' | 'cash') => {
    if (method === 'ziina') {
      setPaymentMethod('ziina');
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

      {paymentMethod === 'ziina' && sessionInfo && !loading && (
        <ZiinaPaymentForm
          sessionId={sessionId!}
          amount={amount}
          sessionInfo={sessionInfo}
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
