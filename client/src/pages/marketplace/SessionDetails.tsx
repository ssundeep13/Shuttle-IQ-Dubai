import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import FoundingMemberSeal from '@/components/FoundingMemberSeal';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import {
  Calendar, MapPin, Clock, Users, CreditCard, ArrowLeft, AlertTriangle, Info,
  Banknote, ShieldCheck, ListOrdered, CheckCircle2, X, Loader2,
  AlertCircle, Minus, Plus, Search, UserCheck, User, ArrowRight, Wallet,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { useReducedMotion } from 'framer-motion';
import { apiRequest, getMarketplaceAccessToken } from '@/lib/queryClient';
import { openCheckoutRedirect, nativeReturnFields } from '@/lib/nativeAuth';
import { useToast } from '@/hooks/use-toast';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { resolveUseWallet } from '@shared/utils/walletUtils';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';
import { GuestRow, type Guest } from '@/components/marketplace/GuestRow';
import { LEVEL_COLORS, getInitials } from '@/lib/playerDisplay';

interface SessionInfoItem {
  icon: React.ComponentType<{ style?: CSSProperties }>;
  label: string;
  value: string;
  sub?: string | null;
  mapUrl?: string | null;
}

interface SessionPlayer {
  name: string;
  level: string | null;
  skillScore: number | null;
  linkedPlayerId: string | null;
  photoUrl: string | null;
  foundingMember?: boolean;
}


// Left/top accent band colour by title keyword — same logic as Browse Sessions.
// No fabricated "General": neutral teal band + tag only when a keyword is present.
type Tone = { band: string; soft: string; fg: string; label: string; hasLevel: boolean };
function levelTone(title: string): Tone {
  const t = (title || '').toLowerCase();
  const P = { band: '#7A4FBF', soft: '#EEE6F8', fg: '#4A2B85' };
  const B = { band: '#2A6FDB', soft: '#E3ECF8', fg: '#1B4A99' };
  const G = { band: '#1F8A5B', soft: '#DDEEE2', fg: '#1A6A45' };
  if (t.includes('advanced')) return { ...P, label: 'Advanced', hasLevel: true };
  if (t.includes('pro')) return { ...P, label: 'Pro', hasLevel: true };
  if (t.includes('intermediate')) return { ...B, label: 'Intermediate', hasLevel: true };
  if (t.includes('beginner')) return { ...G, label: 'Beginner', hasLevel: true };
  if (t.includes('novice')) return { ...G, label: 'Novice', hasLevel: true };
  return { band: MKT.teal, soft: MKT.tealMist, fg: MKT.tealD, label: 'General', hasLevel: false };
}

function LevelTag({ tone }: { tone: Tone }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: tone.soft, color: tone.fg, fontFamily: FF_MONO, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.band }} />
      {tone.label}
    </span>
  );
}

// Styled design buttons (preserve behaviour; just the look).
function navyBtnStyle(size: 'sm' | 'md' | 'lg' = 'md', disabled = false): CSSProperties {
  const pad = size === 'lg' ? '14px 22px' : size === 'sm' ? '9px 14px' : '12px 18px';
  const fs = size === 'lg' ? 16 : size === 'sm' ? 13 : 14;
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: fs, letterSpacing: '-0.005em',
    padding: pad, borderRadius: 10, border: '1.5px solid transparent',
    background: disabled ? 'rgba(0,30,70,0.05)' : MKT.navy, color: disabled ? MKT.inkMute : '#fff',
    borderColor: disabled ? 'transparent' : MKT.navy, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}
function ghostBtnStyle(size: 'sm' | 'md' | 'lg' = 'md'): CSSProperties {
  const pad = size === 'lg' ? '14px 22px' : size === 'sm' ? '9px 14px' : '12px 18px';
  const fs = size === 'lg' ? 16 : size === 'sm' ? 13 : 14;
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: fs, letterSpacing: '-0.005em',
    padding: pad, borderRadius: 10, border: `1.5px solid ${MKT.navy}55`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}
function PriceLabel({ amount, large }: { amount: number; large?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MKT.inkSub }}>Price per player</div>
      <div data-testid="text-session-price" style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: large ? 34 : 28, color: MKT.navy, letterSpacing: '-0.025em', lineHeight: 1 }}>AED {amount}</div>
    </div>
  );
}

function WhosPlaying({ sessionId }: { sessionId: string }) {
  const { isAuthenticated } = useMarketplaceAuth();
  const { data: players, isLoading } = useQuery<SessionPlayer[]>({
    queryKey: ['/api/marketplace/sessions', sessionId, 'players'],
    enabled: !!isAuthenticated && !!sessionId,
    staleTime: 0,
    refetchOnMount: true,
  });

  return (
    <div data-testid="section-whos-playing">
      <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }} className="mb-3 flex items-center gap-2">
        <Users style={{ width: 18, height: 18, color: MKT.teal }} />
        Who's Playing
        {players && players.length > 0 && (
          <span style={{ fontFamily: FF_MONO, fontSize: 12, fontWeight: 700, color: MKT.tealD, background: MKT.tealMist, padding: '2px 8px', borderRadius: 999 }}>{players.length}</span>
        )}
      </h3>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: MKT.cream }}>
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : players && players.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {players.map((player, idx) => {
            const levelKey = player.level?.toLowerCase() ?? '';
            const levelColor = LEVEL_COLORS[levelKey] ?? 'bg-muted text-muted-foreground';
            const cardContent = (
              <>
                <Avatar className="h-8 w-8 shrink-0">
                  {player.photoUrl ? (
                    <AvatarImage src={player.photoUrl} alt={player.name} data-testid={`img-player-avatar-${idx}`} />
                  ) : null}
                  <AvatarFallback className="text-xs font-semibold bg-secondary/20 text-secondary">
                    {getInitials(player.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {/* Seal sits after the name inside the same row; the name keeps
                      its truncation and the 16px seal never shrinks. */}
                  <p className="text-sm font-medium truncate flex items-center gap-1" data-testid={`text-player-name-${idx}`}>
                    <span className="truncate">{player.name}</span>
                    <FoundingMemberSeal show={player.foundingMember} size={16} testid={`seal-player-${idx}`} />
                  </p>
                  {player.level ? (
                    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded capitalize mt-0.5 ${levelColor}`}>
                      {getTierDisplayName(player.level)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Player</span>
                  )}
                </div>
              </>
            );
            return player.linkedPlayerId ? (
              <Link key={idx} href={`/marketplace/players/${player.linkedPlayerId}`}>
                <div className="flex items-center gap-2 p-2.5 rounded-lg cursor-pointer" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}10` }} data-testid={`card-player-${idx}`}>
                  {cardContent}
                </div>
              </Link>
            ) : (
              <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}10` }} data-testid={`card-player-${idx}`}>
                {cardContent}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center rounded-lg" style={{ background: MKT.cream }}>
          <ShieldCheck className="h-8 w-8" style={{ color: MKT.inkMute }} />
          <p className="text-sm font-medium" style={{ color: MKT.inkSub }}>Be the first to book!</p>
          <p className="text-xs" style={{ color: MKT.inkMute }}>No players have joined this session yet.</p>
        </div>
      )}
    </div>
  );
}

function InlineBookingPanel({
  session,
  onBooked,
}: {
  session: BookableSessionWithAvailability;
  onBooked: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState<{ spots: number; total: number; paidByWallet?: boolean } | null>(null);
  // Opt-OUT default (Layer 2a): wallet credit applies unless the player turns
  // it off. null = untouched → derived ON when credit exists (the balance
  // loads async, so a static default can't work). Client-side only — the
  // server still requires an explicit applyWallet=true.
  const [useWalletOverride, setUseWalletOverride] = useState<boolean | null>(null);

  const maxGuests = Math.min(3, session.spotsRemaining - 1);
  const spotsBooked = 1 + guests.length;
  const totalAmount = session.priceAed * spotsBooked;

  // Wallet credit (display only). The booking endpoint is server-authoritative:
  // we send applyWallet as a boolean — never an amount — and the backend caps
  // the deduction at min(balance, total), idempotently and atomically.
  const { data: walletData } = useQuery<{ walletBalance: number }>({
    queryKey: ['/api/marketplace/me/wallet'],
    staleTime: 30_000,
  });
  const walletBalanceFils = walletData?.walletBalance ?? 0;
  const useWallet = resolveUseWallet(useWalletOverride, walletBalanceFils);
  const totalFils = totalAmount * 100;
  const walletApplicableFils = Math.min(walletBalanceFils, totalFils);
  const walletCoversAll = useWallet && totalFils > 0 && walletApplicableFils >= totalFils;
  const remainingAfterWalletAed = Math.max(0, totalAmount - walletApplicableFils / 100);

  const addGuest = () => {
    if (guests.length < maxGuests) {
      setGuests(g => [...g, { name: '', email: '', linkedFromSearch: false }]);
    }
  };

  const removeGuest = (idx: number) => setGuests(g => g.filter((_, i) => i !== idx));

  const updateGuest = useCallback((idx: number, updated: Guest) => {
    setGuests(g => g.map((guest, i) => i === idx ? updated : guest));
  }, []);

  const validateGuests = () => {
    for (const g of guests) {
      if (!g.name.trim()) return 'All guest names are required';
      if (g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) return 'Invalid guest email address';
    }
    return null;
  };

  const makeBooking = async (method: 'cash' | 'ziina', applyWallet = false) => {
    const guestError = validateGuests();
    if (guestError) { setError(guestError); return; }

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: session.id,
          paymentMethod: method,
          guests: guests.map(g => ({
            name: g.name.trim(),
            email: g.email.trim() || null,
            marketplaceUserId: g.marketplaceUserId ?? null,
            siqPlayerId: g.siqPlayerId ?? null,
          })),
          ...(applyWallet ? { applyWallet: true } : {}),
          ...nativeReturnFields(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      if (data.waitlisted) {
        toast({
          title: "You're on the waitlist!",
          description: `You are #${data.waitlistPosition} on the waitlist. We'll notify you if a spot opens up.`,
        });
        onBooked();
        return;
      }

      // Wallet credit covered the full amount — booking confirmed server-side
      // with no Ziina redirect. Refresh wallet + bookings so balances update.
      if (data.paymentMethod === 'wallet') {
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/wallet'] });
        setCashConfirmed({ spots: spotsBooked, total: 0, paidByWallet: true });
        onBooked();
        return;
      }

      if (method === 'ziina') {
        if (!data.redirectUrl) throw new Error('No payment URL received. Please try again.');
        await openCheckoutRedirect(data.redirectUrl);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/wallet'] });
      setCashConfirmed({ spots: spotsBooked, total: totalAmount });
      onBooked();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (cashConfirmed) {
    return (
      <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="space-y-4" data-testid="section-cash-confirmed">
        <div className="flex flex-col items-center gap-3 py-6 text-center rounded-xl" style={{ background: '#DDEEE2', border: '1px solid #1F8A5B33' }}>
          <CheckCircle2 className="h-10 w-10" style={{ color: MKT.green }} />
          <div>
            <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: '#1A6A45' }} data-testid="text-cash-confirmed">
              Booking Confirmed!
            </p>
            <p className="text-sm mt-1" style={{ color: MKT.inkSub }}>
              {cashConfirmed.paidByWallet
                ? (cashConfirmed.spots > 1
                    ? `${cashConfirmed.spots} spots reserved — paid in full with wallet credit.`
                    : 'Your spot is reserved — paid in full with wallet credit.')
                : (cashConfirmed.spots > 1
                    ? `${cashConfirmed.spots} spots reserved — pay AED ${cashConfirmed.total} in cash at the venue.`
                    : `Your spot is reserved — pay AED ${cashConfirmed.total} in cash at the venue.`)}
            </p>
          </div>
        </div>
        <Link href="/marketplace/my-bookings">
          <button type="button" style={{ ...ghostBtnStyle('md'), width: '100%' }} data-testid="button-view-my-bookings">
            View My Bookings
          </button>
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PriceLabel amount={session.priceAed} large />
          <button type="button" style={navyBtnStyle('lg')} onClick={() => setOpen(true)} data-testid="button-book-now">
            <Users style={{ width: 18, height: 18 }} />
            Book Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="space-y-5" data-testid="section-booking-panel">
      {/* Spots selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy }}>How many spots?</p>
            <p className="text-xs mt-0.5" style={{ color: MKT.inkSub }}>AED {session.priceAed} per player</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={guests.length === 0}
              onClick={() => removeGuest(guests.length - 1)}
              data-testid="button-decrease-spots"
              style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${MKT.navy}33`, background: '#fff', color: guests.length === 0 ? MKT.inkMute : MKT.navy, cursor: guests.length === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 22, color: MKT.navy, width: 24, textAlign: 'center' }} data-testid="text-spots-count">{spotsBooked}</span>
            <button
              type="button"
              disabled={guests.length >= maxGuests}
              onClick={addGuest}
              data-testid="button-increase-spots"
              style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${MKT.navy}33`, background: '#fff', color: guests.length >= maxGuests ? MKT.inkMute : MKT.navy, cursor: guests.length >= maxGuests ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live total */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm" style={{ background: MKT.cream }}>
          <span style={{ color: MKT.inkSub }}>
            {spotsBooked === 1 ? 'Just you' : `You + ${guests.length} guest${guests.length > 1 ? 's' : ''}`}
          </span>
          <span style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy }} data-testid="text-inline-total">AED {totalAmount}</span>
        </div>
      </div>

      {/* Wallet credit */}
      {walletBalanceFils > 0 && (
        <div style={{ background: MKT.cream, border: `1px solid ${MKT.navy}12`, borderRadius: 12, padding: 14 }} className="space-y-3" data-testid="card-wallet-credit">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" style={{ color: MKT.teal }} />
              <span className="text-sm font-medium" style={{ color: MKT.ink }}>Use wallet credit</span>
            </div>
            <Switch checked={useWallet} onCheckedChange={setUseWalletOverride} data-testid="switch-use-wallet" />
          </div>
          {useWallet ? (
            <p className="text-xs font-medium" style={{ color: MKT.tealD }} data-testid="text-wallet-callout">
              AED {(walletApplicableFils / 100).toFixed(2)} wallet credit applied — you pay AED {remainingAfterWalletAed.toFixed(2)}
            </p>
          ) : (
            <p className="text-xs" style={{ color: MKT.inkSub }} data-testid="text-wallet-callout">
              AED {(walletBalanceFils / 100).toFixed(2)} available
            </p>
          )}
          {useWallet && (
            <div className="space-y-1" style={{ borderTop: `1px solid ${MKT.navy}12`, paddingTop: 8 }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: MKT.inkSub }}>Session cost</span>
                <span style={{ color: MKT.ink }}>AED {totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: MKT.tealD }}>
                <span>Wallet credit</span>
                <span data-testid="text-wallet-deduction">- AED {(walletApplicableFils / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold" style={{ borderTop: `1px solid ${MKT.navy}12`, paddingTop: 4, color: MKT.ink }}>
                <span>{walletCoversAll ? 'Amount due' : 'Remaining to pay'}</span>
                <span data-testid="text-remaining-amount">AED {remainingAfterWalletAed.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Guest rows */}
      {guests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: MKT.ink }}>
            <Users style={{ width: 16, height: 16, color: MKT.teal }} />
            Guest details
          </p>
          {guests.map((guest, idx) => (
            <GuestRow
              key={idx}
              idx={idx}
              guest={guest}
              onChange={updated => updateGuest(idx, updated)}
              onRemove={() => removeGuest(idx)}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: MKT.red }} data-testid="text-booking-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Payment method buttons */}
      {walletCoversAll ? (
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: MKT.ink }}>Wallet credit covers the full amount</p>
          <button
            type="button"
            disabled={processing}
            style={{ ...navyBtnStyle('lg'), width: '100%', cursor: processing ? 'wait' : 'pointer' }}
            onClick={() => !processing && makeBooking('ziina', true)}
            data-testid="button-pay-wallet"
          >
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Wallet className="h-5 w-5" />
            )}
            Confirm booking — paid with wallet credit
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: MKT.ink }}>
            {useWallet ? 'Pay the remaining balance' : 'How would you like to pay?'}
          </p>
          {/* Player-facing "Pay at Venue" (cash) option removed; card-only.
              The makeBooking('cash', …) path stays for admin/SaaS use. */}
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              className="text-left"
              style={{ background: '#fff', border: `1px solid ${MKT.navy}1F`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12, cursor: processing ? 'wait' : 'pointer' }}
              onClick={() => !processing && makeBooking('ziina', useWallet)}
              data-testid="button-pay-card"
            >
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin shrink-0" style={{ color: MKT.inkSub }} />
              ) : (
                <CreditCard className="h-5 w-5 shrink-0" style={{ color: MKT.navy }} />
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm" style={{ color: MKT.ink }}>Pay by Card</p>
                <p className="text-xs" style={{ color: MKT.inkSub }}>Secure checkout via Ziina</p>
              </div>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen(false); setGuests([]); setError(null); }}
        data-testid="button-cancel-booking"
        style={{ fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, color: MKT.inkSub, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}
      >
        Cancel
      </button>
    </div>
  );
}

export default function SessionDetails() {
  usePageTitle('Session Details');
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useMarketplaceAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

  const { data: session, isLoading } = useQuery<BookableSessionWithAvailability>({
    queryKey: ['/api/marketplace/sessions', id],
  });

  const { data: myBookings } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    enabled: !!isAuthenticated,
  });

  const myBookingForSession = myBookings?.find(
    b => b.sessionId === id && b.status !== 'cancelled'
  );
  const isWaitlisted = myBookingForSession?.status === 'waitlisted';
  const isConfirmed = myBookingForSession?.status === 'confirmed' || myBookingForSession?.status === 'attended';

  const cancelWaitlistMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest('POST', `/api/marketplace/bookings/${bookingId}/cancel`);
    },
    onSuccess: () => {
      toast({ title: 'Removed from waitlist' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', id] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to leave waitlist', description: error.message, variant: 'destructive' });
    },
  });

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/marketplace/bookings', { sessionId: id, paymentMethod: 'ziina' });
    },
    onSuccess: (data: any) => {
      if (data.waitlisted) {
        toast({ title: "You're on the waitlist!", description: `You are #${data.waitlistPosition} on the waitlist.` });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', id] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to join waitlist', description: error.message, variant: 'destructive' });
    },
  });

  const handleBooked = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', id] });
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', id, 'players'] });
  };

  if (isLoading) {
    return (
      <div style={{ background: MKT.cream, minHeight: '100%' }}>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ background: MKT.cream, minHeight: '100%' }}>
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <h2 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24, color: MKT.navy }} className="mb-2">Session not found</h2>
          <Link href="/marketplace/book">
            <button type="button" style={ghostBtnStyle('md')}>Back to sessions</button>
          </Link>
        </div>
      </div>
    );
  }

  const tone = levelTone(session.title);
  const capacityPercent = session.capacity > 0
    ? Math.round((session.totalBookings / session.capacity) * 100)
    : 0;
  const capTone = session.spotsRemaining <= 0 ? MKT.red : session.spotsRemaining <= 3 ? MKT.amber : MKT.teal;

  const renderBottomSection = () => {
    if (!isAuthenticated) {
      return (
        <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="flex items-center justify-between gap-4 flex-wrap">
          <PriceLabel amount={session.priceAed} large />
          <Link href="/marketplace/login">
            <button type="button" style={navyBtnStyle('lg')} data-testid="button-login-to-book">
              Log in to book
            </button>
          </Link>
        </div>
      );
    }

    if (isConfirmed) {
      return (
        <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="flex items-center justify-between gap-4 flex-wrap">
          <PriceLabel amount={session.priceAed} large />
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: '#DDEEE2', border: '1px solid #1F8A5B33' }} data-testid="status-confirmed">
            <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: MKT.green }} />
            <span className="text-sm font-medium" style={{ color: '#1A6A45' }}>You're booked!</span>
          </div>
        </div>
      );
    }

    if (isWaitlisted && myBookingForSession) {
      return (
        <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="flex items-center justify-between gap-4 flex-wrap">
          <PriceLabel amount={session.priceAed} large />
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: '#F6E6CC', border: '1px solid #C97B1733' }} data-testid="status-waitlisted">
              <ListOrdered className="h-5 w-5 shrink-0" style={{ color: MKT.amber }} />
              <span className="text-sm font-medium" style={{ color: '#7A4A0E' }}>
                Waitlist #{myBookingForSession.waitlistPosition}
              </span>
            </div>
            <button
              type="button"
              onClick={() => cancelWaitlistMutation.mutate(myBookingForSession.id)}
              disabled={cancelWaitlistMutation.isPending}
              data-testid="button-leave-waitlist"
              style={{ ...ghostBtnStyle('sm'), opacity: cancelWaitlistMutation.isPending ? 0.6 : 1 }}
            >
              Leave Waitlist
            </button>
          </div>
        </div>
      );
    }

    if (session.spotsRemaining <= 0) {
      return (
        <div style={{ borderTop: `1px solid ${MKT.line}`, paddingTop: 24 }} className="flex items-center justify-between gap-4 flex-wrap">
          <PriceLabel amount={session.priceAed} large />
          <button
            type="button"
            onClick={() => waitlistMutation.mutate()}
            disabled={waitlistMutation.isPending}
            data-testid="button-join-waitlist"
            style={{ ...ghostBtnStyle('lg'), opacity: waitlistMutation.isPending ? 0.6 : 1 }}
          >
            <ListOrdered style={{ width: 18, height: 18 }} />
            {waitlistMutation.isPending ? 'Joining...' : 'Join Waitlist'}
          </button>
        </div>
      );
    }

    return <InlineBookingPanel session={session} onBooked={handleBooked} />;
  };

  const infoItems: SessionInfoItem[] = [
    { icon: Calendar, label: 'Date', value: format(new Date(session.date), 'EEEE, MMMM d, yyyy') },
    { icon: Clock, label: 'Time', value: session.endTime ? `${session.startTime} – ${session.endTime}` : session.startTime },
    { icon: MapPin, label: 'Venue', value: session.venueName, sub: session.venueLocation, mapUrl: session.venueMapUrl },
    { icon: Users, label: 'Capacity', value: `${session.courtCount} courts, ${session.capacity} max players` },
    { icon: Banknote, label: 'Price', value: `AED ${session.priceAed} per player` },
  ];

  return (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      <div className="max-w-3xl mx-auto" style={{ padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) clamp(48px, 6vw, 80px)' }}>
        <Reveal>
          <Link href="/marketplace/book">
            <button type="button" data-testid="button-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, marginBottom: 16, padding: 0 }}>
              <ArrowLeft style={{ width: 16, height: 16 }} /> Back to sessions
            </button>
          </Link>
        </Reveal>

        <Reveal>
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${MKT.navy}14`, overflow: 'hidden' }}>
            {/* top level accent band */}
            <div style={{ height: 5, background: tone.band }} />

            <div style={{ padding: 'clamp(20px, 3vw, 28px)' }} className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 8 }}>
                    {tone.hasLevel && <LevelTag tone={tone} />}
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
                        background: session.spotsRemaining > 0 ? 'rgba(0,30,70,0.06)' : '#F1D7D2',
                        color: session.spotsRemaining > 0 ? MKT.inkSub : '#8E2C22',
                        fontFamily: FF_MONO, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: session.spotsRemaining > 0 ? MKT.teal : MKT.red }} />
                      {session.spotsRemaining > 0 ? `${session.spotsRemaining} spots left` : 'Full'}
                    </span>
                  </div>
                  <h1 data-testid="text-session-title" style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(26px, 4vw, 36px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                    {session.title}
                  </h1>
                  <p className="text-sm mt-2" style={{ color: MKT.inkSub }}>
                    {format(new Date(session.date), 'EEEE, MMMM d, yyyy')}
                    {session.startTime && (
                      <span className="ml-1">· {session.startTime}{session.endTime ? ` – ${session.endTime}` : ''}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Info tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {infoItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}10` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: MKT.tealMist, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <item.icon style={{ width: 16, height: 16, color: MKT.tealD }} />
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: MKT.inkSub }}>{item.label}</div>
                      <div className="font-medium text-sm" style={{ color: MKT.ink }}>{item.value}</div>
                      {item.sub && <div className="text-xs" style={{ color: MKT.inkSub }}>{item.sub}</div>}
                      {item.mapUrl && (
                        <a
                          href={item.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, fontWeight: 600, color: MKT.tealD, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}
                          data-testid="link-session-detail-map"
                        >
                          <MapPin style={{ width: 12, height: 12 }} /> View on Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Capacity */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2 flex-wrap gap-1">
                  <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MKT.inkSub }}>Capacity</span>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.inkSub }}>{session.totalBookings} / {session.capacity} booked</span>
                    {session.waitlistCount > 0 && (
                      <span style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.amber }} data-testid="text-waitlist-count">
                        + {session.waitlistCount} on waitlist
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${capacityPercent}%`, height: '100%', borderRadius: 999, background: capTone }} />
                </div>
              </div>

              {/* About */}
              {session.description && (
                <div>
                  <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }} className="mb-2 flex items-center gap-2">
                    <Info style={{ width: 18, height: 18, color: MKT.teal }} /> About this session
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: MKT.inkSub }}>{session.description}</p>
                </div>
              )}

              {/* Who's playing */}
              {isAuthenticated && id && <WhosPlaying sessionId={id} />}

              {/* Cancellation policy */}
              <div className="flex gap-3 p-4 rounded-xl" style={{ background: '#F6E6CC55', border: '1px solid #C97B1733' }}>
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: MKT.amber }} />
                <div className="text-sm">
                  <p className="font-medium mb-1" style={{ color: '#7A4A0E' }}>Cancellation Policy</p>
                  <ul className="space-y-0.5 text-xs leading-relaxed" style={{ color: MKT.inkSub }}>
                    <li>Cancellations within 5 hours of the session start will forfeit the full payment.</li>
                    <li>Cancellations made more than 5 hours before the session are free.</li>
                    <li>No-shows may be charged 150% of the session price.</li>
                  </ul>
                </div>
              </div>

              {renderBottomSection()}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
