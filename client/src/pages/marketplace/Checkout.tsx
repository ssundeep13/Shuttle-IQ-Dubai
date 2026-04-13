import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, CreditCard, CheckCircle, AlertCircle, Loader2, ArrowLeft, ShieldCheck, Banknote, Info, ListOrdered, UserPlus, X, Users, Wallet } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { usePageTitle } from '@/hooks/usePageTitle';

interface Guest {
  name: string;
  email: string;
}

interface BookingData {
  bookingId: string;
  paymentMethod: 'ziina' | 'cash' | 'wallet';
  redirectUrl?: string;
  amount: number;
  walletApplied?: number;
  ziinaAmount?: number;
  spotsBooked?: number;
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
              <li>Cancellations within <span className="font-medium">5 hours</span> of the session are subject to full payment</li>
              <li><span className="font-medium">No-shows</span> may be charged the full session price</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GuestForm({ guests, onChange, maxGuests }: {
  guests: Guest[];
  onChange: (guests: Guest[]) => void;
  maxGuests: number;
}) {
  const addGuest = () => {
    if (guests.length < maxGuests) {
      onChange([...guests, { name: '', email: '' }]);
    }
  };

  const removeGuest = (idx: number) => {
    onChange(guests.filter((_, i) => i !== idx));
  };

  const updateGuest = (idx: number, field: keyof Guest, value: string) => {
    const updated = guests.map((g, i) => i === idx ? { ...g, [field]: value } : g);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-secondary" />
          <span className="text-sm font-medium">Additional Guests</span>
          {guests.length > 0 && (
            <span className="text-xs text-muted-foreground">({guests.length} added)</span>
          )}
        </div>
        {guests.length < maxGuests && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={addGuest}
            data-testid="button-add-guest"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Guest
          </Button>
        )}
      </div>

      {guests.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Bringing friends? Add their names so they show up in the player list.
        </p>
      )}

      {guests.map((guest, idx) => (
        <div key={idx} className="flex items-start gap-2 p-3 rounded-md bg-muted/40">
          <div className="flex-1 space-y-2">
            <Input
              placeholder="Guest name *"
              value={guest.name}
              onChange={e => updateGuest(idx, 'name', e.target.value)}
              data-testid={`input-guest-name-${idx}`}
            />
            <Input
              placeholder="Guest email (optional — for cancellation link)"
              type="email"
              value={guest.email}
              onChange={e => updateGuest(idx, 'email', e.target.value)}
              data-testid={`input-guest-email-${idx}`}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeGuest(idx)}
            data-testid={`button-remove-guest-${idx}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function OrderSummary({ sessionInfo, amount, spotsBooked }: {
  sessionInfo: BookingData['session'];
  amount: number;
  spotsBooked: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.date ? format(new Date(sessionInfo.date), 'MMM d, yyyy') : '—'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.startTime} - {sessionInfo.endTime}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{sessionInfo.venueName}</span>
        </div>
        {spotsBooked > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{spotsBooked} spots (you + {spotsBooked - 1} guest{spotsBooked > 2 ? 's' : ''})</span>
          </div>
        )}
        <div className="border-t pt-3 flex items-center justify-between gap-2">
          <span className="font-medium">Total</span>
          <span className="text-xl font-bold" data-testid="text-checkout-amount">AED {amount}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ZiinaPaymentForm({ sessionId, pricePerSpot, sessionInfo, availableSpots, walletBalanceFils, onWalletSuccess }: {
  sessionId: string;
  pricePerSpot: number;
  sessionInfo: BookingData['session'];
  availableSpots: number;
  walletBalanceFils: number;
  onWalletSuccess: (data: BookingData) => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [waitlisted, setWaitlisted] = useState<{ position: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [useWallet, setUseWallet] = useState(false);
  const { toast } = useToast();

  const spotsBooked = 1 + guests.length;
  const totalAmount = pricePerSpot * spotsBooked;
  const totalAmountFils = totalAmount * 100;
  const maxGuests = Math.min(3, availableSpots - 1);

  const walletApplicable = Math.min(walletBalanceFils, totalAmountFils);
  const walletApplicableAed = walletApplicable / 100;
  const remainingAfterWallet = totalAmount - walletApplicableAed;
  const walletCoversAll = useWallet && remainingAfterWallet <= 0;

  const validateGuests = () => {
    for (const g of guests) {
      if (!g.name.trim()) return 'All guest names are required';
      if (g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) return 'Invalid guest email address';
    }
    return null;
  };

  const handlePay = async () => {
    const guestError = validateGuests();
    if (guestError) {
      setError(guestError);
      return;
    }

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
        body: JSON.stringify({
          sessionId,
          paymentMethod: 'ziina',
          guests: guests.map(g => ({ name: g.name.trim(), email: g.email.trim() || null })),
          applyWallet: useWallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (data.waitlisted) {
        setWaitlisted({ position: data.waitlistPosition });
        setProcessing(false);
        return;
      }

      if (data.paymentMethod === 'wallet') {
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
        onWalletSuccess(data);
        return;
      }

      if (!data.redirectUrl) {
        throw new Error('No payment URL received. Please try again.');
      }

      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setProcessing(false);
    }
  };

  if (waitlisted) {
    return (
      <div className="space-y-6">
        <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} />
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Session filled up — you're on the waitlist!
              </p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The last spot was taken just before your booking. You've been added to the waitlist at position #{waitlisted.position}. No payment is required — we'll notify you if a spot opens up.
            </p>
          </CardContent>
        </Card>
        <Link href="/marketplace/my-bookings">
          <Button className="w-full" data-testid="button-view-waitlist">View My Bookings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} />

      {maxGuests > 0 && (
        <GuestForm guests={guests} onChange={setGuests} maxGuests={maxGuests} />
      )}

      {walletBalanceFils > 0 && (
        <Card data-testid="card-wallet-credit">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[#006B5F]" />
                <span className="text-sm font-medium">Use wallet credit</span>
              </div>
              <Switch
                checked={useWallet}
                onCheckedChange={setUseWallet}
                data-testid="switch-use-wallet"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Available: AED {(walletBalanceFils / 100).toFixed(2)}
            </p>
            {useWallet && (
              <div className="space-y-1 border-t pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Session cost</span>
                  <span>AED {totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-[#006B5F]">
                  <span>Wallet credit</span>
                  <span data-testid="text-wallet-deduction">- AED {walletApplicableAed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1">
                  <span>{walletCoversAll ? 'Amount due' : 'Pay via Ziina'}</span>
                  <span data-testid="text-remaining-amount">AED {Math.max(0, remainingAfterWallet).toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
          <><Loader2 className="h-5 w-5 animate-spin" /> {walletCoversAll ? 'Confirming booking...' : 'Preparing payment...'}</>
        ) : walletCoversAll ? (
          <><Wallet className="h-5 w-5" /> Book with Wallet Credit</>
        ) : useWallet ? (
          <><ShieldCheck className="h-5 w-5" /> Pay AED {remainingAfterWallet.toFixed(2)} — Secure Checkout</>
        ) : (
          <><ShieldCheck className="h-5 w-5" /> Pay AED {totalAmount} — Secure Checkout</>
        )}
      </Button>

      {!walletCoversAll && (
        <p className="text-xs text-muted-foreground text-center">
          Payments are securely processed by Ziina. You'll be redirected to complete payment and brought back automatically.
        </p>
      )}
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

function CashCheckoutForm({ sessionId, pricePerSpot, sessionInfo, availableSpots, onSuccess }: {
  sessionId: string;
  pricePerSpot: number;
  sessionInfo: BookingData['session'];
  availableSpots: number;
  onSuccess: (data: BookingData) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const { toast } = useToast();

  const spotsBooked = 1 + guests.length;
  const totalAmount = pricePerSpot * spotsBooked;
  const maxGuests = Math.min(3, availableSpots - 1);

  const validateGuests = () => {
    for (const g of guests) {
      if (!g.name.trim()) return 'All guest names are required';
      if (g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) return 'Invalid guest email address';
    }
    return null;
  };

  const handleConfirm = async () => {
    const guestError = validateGuests();
    if (guestError) {
      setError(guestError);
      return;
    }

    setLoading(true);
    setError(null);

    const token = localStorage.getItem('mp_accessToken');
    if (!token) {
      setLoading(false);
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
        body: JSON.stringify({
          sessionId,
          paymentMethod: 'cash',
          guests: guests.map(g => ({ name: g.name.trim(), email: g.email.trim() || null })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      toast({ title: 'Booking confirmed', description: 'Please pay in cash when you arrive at the venue.' });
      onSuccess(data);
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} />

      {maxGuests > 0 && (
        <GuestForm guests={guests} onChange={setGuests} maxGuests={maxGuests} />
      )}

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
        disabled={loading}
        onClick={handleConfirm}
        data-testid="button-confirm-cash"
      >
        {loading ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Confirming...</>
        ) : (
          <><Banknote className="h-5 w-5" /> Confirm Booking — Pay AED {totalAmount} at Venue</>
        )}
      </Button>
    </div>
  );
}

export default function Checkout() {
  usePageTitle('Checkout');
  const { id: sessionId } = useParams<{ id: string }>();
  const { isAuthenticated, user } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const [paymentMethod, setPaymentMethod] = useState<'ziina' | 'cash' | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<BookingData['session'] | null>(null);
  const [pricePerSpot, setPricePerSpot] = useState<number>(0);
  const [availableSpots, setAvailableSpots] = useState<number>(99);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  interface WalletInfo {
    walletBalance: number;
  }
  const { data: walletData } = useQuery<WalletInfo>({
    queryKey: ['/api/referrals/player', user?.linkedPlayerId],
    enabled: !!user?.linkedPlayerId,
    staleTime: 30_000,
  });
  const walletBalanceFils = walletData?.walletBalance ?? 0;

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
        setPricePerSpot(data.priceAed);
        setAvailableSpots(data.spotsRemaining ?? 99);
        setSessionLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setSessionLoading(false);
      });
  }, [sessionId, isAuthenticated, setLocation]);

  const handlePaymentMethodSelect = (method: 'ziina' | 'cash') => {
    setPaymentMethod(method);
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
    const spots = bookingData?.spotsBooked ?? 1;
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <CardTitle data-testid="text-booking-confirmed">Booking Confirmed!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your spot{spots > 1 ? 's' : ''} for <span className="font-semibold text-foreground">{sessionInfo?.title || bookingData?.session.title}</span> {spots > 1 ? 'have' : 'has'} been reserved.
            </p>
            {spots > 1 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/10 text-secondary text-sm">
                <Users className="h-4 w-4" />
                {spots} spots booked (you + {spots - 1} guest{spots > 2 ? 's' : ''})
              </div>
            )}
            {isCash ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm">
                  <Banknote className="h-4 w-4" />
                  Pay AED {bookingData?.amount || pricePerSpot * spots} in cash at the venue
                </div>
              </div>
            ) : bookingData?.paymentMethod === 'wallet' ? (
              <div className="space-y-1 text-sm">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[rgba(0,107,95,0.1)] text-[#006B5F] dark:text-teal-400">
                  <Wallet className="h-4 w-4" />
                  Paid with wallet credit
                </div>
                {bookingData.walletApplied && (
                  <p className="text-muted-foreground" data-testid="text-wallet-breakdown">
                    Wallet credit: AED {(bookingData.walletApplied / 100).toFixed(2)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Amount paid: AED {bookingData?.amount || pricePerSpot * spots}</p>
                {bookingData?.walletApplied && bookingData.walletApplied > 0 && (
                  <p className="text-muted-foreground" data-testid="text-wallet-breakdown">
                    (Wallet credit: AED {(bookingData.walletApplied / 100).toFixed(2)}, Card: AED {((bookingData.ziinaAmount || 0)).toFixed(2)})
                  </p>
                )}
              </div>
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
          <OrderSummary sessionInfo={sessionInfo} amount={pricePerSpot} spotsBooked={1} />
          <CancellationPolicy />
          <PaymentMethodSelector onSelect={handlePaymentMethodSelect} />
        </div>
      )}

      {paymentMethod === 'ziina' && sessionInfo && (
        <ZiinaPaymentForm
          sessionId={sessionId!}
          pricePerSpot={pricePerSpot}
          sessionInfo={sessionInfo}
          availableSpots={availableSpots}
          walletBalanceFils={walletBalanceFils}
          onWalletSuccess={(data) => {
            setBookingData(data);
            setConfirmed(true);
          }}
        />
      )}

      {paymentMethod === 'cash' && sessionInfo && (
        <CashCheckoutForm
          sessionId={sessionId!}
          pricePerSpot={pricePerSpot}
          sessionInfo={sessionInfo}
          availableSpots={availableSpots}
          onSuccess={(data) => {
            setBookingData(data);
            setConfirmed(true);
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
          }}
        />
      )}
    </div>
  );
}
