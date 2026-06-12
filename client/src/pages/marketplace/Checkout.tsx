import { useEffect, useState, type CSSProperties } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock, CreditCard, CheckCircle, AlertCircle, Loader2, ArrowLeft, ShieldCheck, Banknote, Info, ListOrdered, UserPlus, X, Users, Wallet } from 'lucide-react';
import { queryClient, getMarketplaceAccessToken } from '@/lib/queryClient';
import { openCheckoutRedirect, nativeReturnFields } from '@/lib/nativeAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';
import { isBirthdayDiscountAvailable } from '@shared/birthday';
import { resolveUseWallet } from '@shared/utils/walletUtils';

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

// ── Shared styled primitives (look only) ─────────────────────────────────────
const cardShell: CSSProperties = {
  background: '#fff', borderRadius: 16, border: `1px solid ${MKT.navy}14`, overflow: 'hidden',
};

function navyBtnStyle(disabled = false): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: 15, letterSpacing: '-0.005em',
    padding: '15px 22px', borderRadius: 10, border: '1.5px solid transparent',
    background: disabled ? 'rgba(0,30,70,0.12)' : MKT.navy, color: disabled ? MKT.inkMute : '#fff',
    borderColor: disabled ? 'transparent' : MKT.navy, cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}
function ghostBtnStyle(): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
    padding: '12px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}55`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}

function CancellationPolicy() {
  return (
    <div style={{ borderRadius: 14, background: '#F6E6CC55', border: '1px solid #C97B1733', padding: 16 }}>
      <div className="flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: MKT.amber }} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium" style={{ color: '#7A4A0E' }}>Cancellation Policy</p>
          <ul className="text-xs space-y-1 list-disc pl-4" style={{ color: MKT.inkSub }}>
            <li>Cancellations within <span className="font-medium">5 hours</span> of the session are subject to full payment</li>
            <li><span className="font-medium">No-shows</span> may be charged the full session price</li>
          </ul>
        </div>
      </div>
    </div>
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
          <Users className="h-4 w-4" style={{ color: MKT.teal }} />
          <span className="text-sm font-medium" style={{ color: MKT.ink }}>Additional Guests</span>
          {guests.length > 0 && (
            <span className="text-xs" style={{ color: MKT.inkSub }}>({guests.length} added)</span>
          )}
        </div>
        {guests.length < maxGuests && (
          <button
            type="button"
            className="gap-1"
            onClick={addGuest}
            data-testid="button-add-guest"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: `1px solid ${MKT.navy}1F`, background: '#fff', color: MKT.navy, fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Guest
          </button>
        )}
      </div>

      {guests.length === 0 && (
        <p className="text-xs" style={{ color: MKT.inkSub }}>
          Bringing friends? Add their names so they show up in the player list.
        </p>
      )}

      {guests.map((guest, idx) => (
        <div key={idx} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}12` }}>
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
          <button
            type="button"
            onClick={() => removeGuest(idx)}
            data-testid={`button-remove-guest-${idx}`}
            style={{ flex: 'none', width: 38, height: 38, borderRadius: 10, border: 'none', background: 'transparent', color: MKT.inkSub, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function OrderSummary({ sessionInfo, amount, spotsBooked, birthdayWaivedAed }: {
  sessionInfo: BookingData['session'];
  amount: number;
  spotsBooked: number;
  birthdayWaivedAed?: number;
}) {
  return (
    <div style={cardShell}>
      <div style={{ padding: '18px 20px 0' }}>
        <h2 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }}>Order Summary</h2>
      </div>
      <div className="space-y-3" style={{ padding: '14px 20px 20px' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.ink }}>
          <Calendar className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
          <span>{sessionInfo.date ? format(new Date(sessionInfo.date), 'MMM d, yyyy') : '—'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.ink }}>
          <Clock className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
          <span>{sessionInfo.startTime} - {sessionInfo.endTime}</span>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.ink }}>
          <MapPin className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
          <span>{sessionInfo.venueName}</span>
        </div>
        {spotsBooked > 1 && (
          <div className="flex items-center gap-2 text-sm" style={{ color: MKT.ink }}>
            <Users className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
            <span>{spotsBooked} spots (you + {spotsBooked - 1} guest{spotsBooked > 2 ? 's' : ''})</span>
          </div>
        )}
        {birthdayWaivedAed ? (
          <div className="flex items-center justify-between gap-2 text-sm" style={{ color: MKT.teal }} data-testid="line-birthday-discount">
            <span>Birthday discount — your spot is free</span>
            <span>− AED {birthdayWaivedAed}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 12 }}>
          <span className="font-medium" style={{ color: MKT.ink }}>Total</span>
          <span style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24, color: MKT.navy, letterSpacing: '-0.02em' }} data-testid="text-checkout-amount">AED {amount}</span>
        </div>
      </div>
    </div>
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
  // Opt-OUT default (Layer 2a): wallet credit applies unless the player turns
  // it off. null = untouched → derived ON when credit exists. Client-side
  // only — the server still requires an explicit applyWallet=true.
  const [useWalletOverride, setUseWalletOverride] = useState<boolean | null>(null);
  const useWallet = resolveUseWallet(useWalletOverride, walletBalanceFils);
  const { toast } = useToast();

  const { user } = useMarketplaceAuth();
  const spotsBooked = 1 + guests.length;
  // Birthday free-game: primary spot waived during the window (mirrors the
  // server's authoritative enforcement; this is display only).
  const birthdayFree = !!user && isBirthdayDiscountAvailable(user, new Date());
  const chargeableSpots = birthdayFree ? Math.max(0, spotsBooked - 1) : spotsBooked;
  const totalAmount = pricePerSpot * chargeableSpots;
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

    const token = getMarketplaceAccessToken();
    if (!token) {
      setError('Not authenticated. Please log in again.');
      setProcessing(false);
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/marketplace/bookings'), {
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
          ...nativeReturnFields(),
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

      await openCheckoutRedirect(data.redirectUrl);
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
        <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} birthdayWaivedAed={birthdayFree ? pricePerSpot : undefined} />
        <div style={{ borderRadius: 14, background: '#F6E6CC55', border: '1px solid #C97B1733', padding: 16 }} className="space-y-3">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 shrink-0" style={{ color: MKT.amber }} />
            <p className="text-sm font-medium" style={{ color: '#7A4A0E' }}>
              Session filled up — you're on the waitlist!
            </p>
          </div>
          <p className="text-xs" style={{ color: MKT.inkSub }}>
            The last spot was taken just before your booking. You've been added to the waitlist at position #{waitlisted.position}. No payment is required — we'll notify you if a spot opens up.
          </p>
        </div>
        <Link href="/marketplace/my-bookings">
          <button type="button" style={navyBtnStyle()} data-testid="button-view-waitlist">View My Bookings</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} birthdayWaivedAed={birthdayFree ? pricePerSpot : undefined} />

      {maxGuests > 0 && (
        <GuestForm guests={guests} onChange={setGuests} maxGuests={maxGuests} />
      )}

      {walletBalanceFils > 0 && (
        <div style={cardShell} data-testid="card-wallet-credit">
          <div className="space-y-3" style={{ padding: 16 }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4" style={{ color: MKT.teal }} />
                <span className="text-sm font-medium" style={{ color: MKT.ink }}>Use wallet credit</span>
              </div>
              <Switch
                checked={useWallet}
                onCheckedChange={setUseWalletOverride}
                data-testid="switch-use-wallet"
              />
            </div>
            {useWallet ? (
              <p className="text-xs font-medium" style={{ color: MKT.tealD }} data-testid="text-wallet-callout">
                AED {walletApplicableAed.toFixed(2)} wallet credit applied — you pay AED {Math.max(0, remainingAfterWallet).toFixed(2)}
              </p>
            ) : (
              <p className="text-xs" style={{ color: MKT.inkSub }} data-testid="text-wallet-callout">
                AED {(walletBalanceFils / 100).toFixed(2)} available
              </p>
            )}
            {useWallet && (
              <div className="space-y-1" style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 8 }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: MKT.inkSub }}>Session cost</span>
                  <span style={{ color: MKT.ink }}>AED {totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm" style={{ color: MKT.tealD }}>
                  <span>Wallet credit</span>
                  <span data-testid="text-wallet-deduction">- AED {walletApplicableAed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold" style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 4, color: MKT.ink }}>
                  <span>{walletCoversAll ? 'Amount due' : 'Pay via Ziina'}</span>
                  <span data-testid="text-remaining-amount">AED {Math.max(0, remainingAfterWallet).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CancellationPolicy />

      {error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.red }} data-testid="text-payment-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={processing}
        onClick={handlePay}
        data-testid="button-confirm-payment"
        style={navyBtnStyle(processing)}
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
      </button>

      {!walletCoversAll && (
        <p className="text-xs text-center" style={{ color: MKT.inkSub }}>
          Payments are securely processed by Ziina. You'll be redirected to complete payment and brought back automatically.
        </p>
      )}
    </div>
  );
}

function PaymentMethodSelector({ onSelect }: { onSelect: (method: 'ziina' | 'cash') => void }) {
  return (
    <div className="space-y-3">
      <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }}>How would you like to pay?</h3>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          className="text-left"
          onClick={() => onSelect('ziina')}
          data-testid="button-pay-card"
          style={{ ...cardShell, padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
        >
          <div style={{ padding: 12, borderRadius: 10, background: `${MKT.navy}14` }}>
            <CreditCard className="h-6 w-6" style={{ color: MKT.navy }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium" style={{ color: MKT.ink }}>Pay by Card</p>
            <p className="text-sm" style={{ color: MKT.inkSub }}>Secure card payment via Ziina</p>
          </div>
        </button>
        {/* Player-facing "Pay at Venue" (cash) option removed. The backend cash
            path is retained for admin/SaaS use; this selector is no longer
            rendered (paymentMethod defaults to 'ziina'). */}
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

  const { user } = useMarketplaceAuth();
  const spotsBooked = 1 + guests.length;
  const birthdayFree = !!user && isBirthdayDiscountAvailable(user, new Date());
  const chargeableSpots = birthdayFree ? Math.max(0, spotsBooked - 1) : spotsBooked;
  const totalAmount = pricePerSpot * chargeableSpots;
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

    const token = getMarketplaceAccessToken();
    if (!token) {
      setLoading(false);
      setError('Session not found or not authenticated');
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/marketplace/bookings'), {
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
      <OrderSummary sessionInfo={sessionInfo} amount={totalAmount} spotsBooked={spotsBooked} birthdayWaivedAed={birthdayFree ? pricePerSpot : undefined} />

      {maxGuests > 0 && (
        <GuestForm guests={guests} onChange={setGuests} maxGuests={maxGuests} />
      )}

      <CancellationPolicy />

      {error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.red }} data-testid="text-payment-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={handleConfirm}
        data-testid="button-confirm-cash"
        style={navyBtnStyle(loading)}
      >
        {loading ? (
          <><Loader2 className="h-5 w-5 animate-spin" /> Confirming...</>
        ) : (
          <><Banknote className="h-5 w-5" /> Confirm Booking — Pay AED {totalAmount} at Venue</>
        )}
      </button>
    </div>
  );
}

export default function Checkout() {
  usePageTitle('Checkout');
  const { id: sessionId } = useParams<{ id: string }>();
  const { isAuthenticated, user } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  // Player-facing cash option removed — default straight to the card (Ziina)
  // form so there's no one-option selector. The 'cash' union member and the
  // cash render branch below are intentionally retained (unused) for a future
  // SaaS fork; the backend cash machinery is untouched.
  const [paymentMethod, setPaymentMethod] = useState<'ziina' | 'cash' | null>('ziina');
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

    fetch(apiUrl(`/api/marketplace/sessions/${sessionId}`))
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

  const pageWrap = (children: React.ReactNode) => (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      {children}
    </div>
  );

  if (sessionLoading) {
    return pageWrap(
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
    return pageWrap(
      <div className="max-w-lg mx-auto px-4 py-12">
        <Reveal>
          <div style={cardShell}>
            <div className="text-center" style={{ padding: '28px 24px 8px' }}>
              <CheckCircle className="h-12 w-12 mx-auto mb-4" style={{ color: MKT.green }} />
              <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24, color: MKT.navy, letterSpacing: '-0.02em' }} data-testid="text-booking-confirmed">Booking Confirmed!</h1>
            </div>
            <div className="text-center space-y-4" style={{ padding: '8px 24px 28px' }}>
              <p style={{ color: MKT.inkSub }}>
                Your spot{spots > 1 ? 's' : ''} for <span className="font-semibold" style={{ color: MKT.ink }}>{sessionInfo?.title || bookingData?.session.title}</span> {spots > 1 ? 'have' : 'has'} been reserved.
              </p>
              {spots > 1 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm" style={{ background: MKT.tealMist, color: MKT.tealD }}>
                  <Users className="h-4 w-4" />
                  {spots} spots booked (you + {spots - 1} guest{spots > 2 ? 's' : ''})
                </div>
              )}
              {isCash ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm" style={{ background: '#F6E6CC', color: '#7A4A0E' }}>
                    <Banknote className="h-4 w-4" />
                    Pay AED {bookingData?.amount || pricePerSpot * spots} in cash at the venue
                  </div>
                </div>
              ) : bookingData?.paymentMethod === 'wallet' ? (
                <div className="space-y-1 text-sm">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: 'rgba(0,107,95,0.1)', color: MKT.tealD }}>
                    <Wallet className="h-4 w-4" />
                    Paid with wallet credit
                  </div>
                  {bookingData.walletApplied && (
                    <p style={{ color: MKT.inkSub }} data-testid="text-wallet-breakdown">
                      Wallet credit: AED {(bookingData.walletApplied / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  <p style={{ color: MKT.inkSub }}>Amount paid: AED {bookingData?.amount || pricePerSpot * spots}</p>
                  {bookingData?.walletApplied && bookingData.walletApplied > 0 && (
                    <p style={{ color: MKT.inkSub }} data-testid="text-wallet-breakdown">
                      (Wallet credit: AED {(bookingData.walletApplied / 100).toFixed(2)}, Card: AED {((bookingData.ziinaAmount || 0)).toFixed(2)})
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3 justify-center flex-wrap pt-2">
                <Link href="/marketplace/my-bookings">
                  <button type="button" style={navyBtnStyle()} data-testid="button-view-bookings">View My Bookings</button>
                </Link>
                <Link href="/marketplace/book">
                  <button type="button" style={ghostBtnStyle()} data-testid="button-browse-sessions">Browse Sessions</button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    );
  }

  if (error && !paymentMethod) {
    return pageWrap(
      <div className="max-w-lg mx-auto px-4 py-12">
        <div style={cardShell}>
          <div className="text-center" style={{ padding: '28px 24px 8px' }}>
            <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: MKT.red }} />
            <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 22, color: MKT.navy, letterSpacing: '-0.02em' }}>Unable to proceed</h1>
          </div>
          <div className="text-center space-y-4" style={{ padding: '8px 24px 28px' }}>
            <p style={{ color: MKT.inkSub }} data-testid="text-checkout-error">{error}</p>
            <Link href={`/marketplace/sessions/${sessionId}`}>
              <button type="button" style={navyBtnStyle()} data-testid="button-back-to-session">Back to Session</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return pageWrap(
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href={`/marketplace/sessions/${sessionId}`}>
        <button type="button" data-testid="button-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, marginBottom: 16, padding: 0 }}>
          <ArrowLeft className="h-4 w-4" /> Back to session
        </button>
      </Link>

      <h1 style={{ margin: '0 0 24px', fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(26px, 4vw, 34px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1.05 }} data-testid="text-checkout-title">Complete your booking</h1>

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
