import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import {
  Calendar, MapPin, Clock, Users, CreditCard, ArrowLeft, AlertTriangle, Info,
  Banknote, ShieldCheck, ListOrdered, CheckCircle2, X, Loader2,
  AlertCircle, Minus, Plus, Search, UserCheck, User,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { usePageTitle } from '@/hooks/usePageTitle';

interface SessionInfoItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
  mapUrl?: string | null;
}

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

interface SessionPlayer {
  name: string;
  level: string | null;
  skillScore: number | null;
  linkedPlayerId: string | null;
}

interface GuestSearchResult {
  type: 'marketplace' | 'siq';
  name: string;
  email?: string;
  level?: string | null;
  marketplaceUserId?: string;
  siqPlayerId?: string;
}

interface Guest {
  name: string;
  email: string;
  marketplaceUserId?: string;
  siqPlayerId?: string;
  linkedFromSearch: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  novice: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  lower_intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  upper_intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  competitive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  advanced: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  professional: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function GuestRow({
  idx,
  guest,
  onChange,
  onRemove,
}: {
  idx: number;
  guest: Guest;
  onChange: (g: Guest) => void;
  onRemove: () => void;
}) {
  const [searchInput, setSearchInput] = useState(guest.linkedFromSearch ? guest.name : '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [forceManual, setForceManual] = useState(!guest.linkedFromSearch && guest.name !== '');
  const debouncedQuery = useDebounce(searchInput, 280);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery<GuestSearchResult[]>({
    queryKey: ['/api/marketplace/search-guests', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const token = localStorage.getItem('mp_accessToken');
      const res = await fetch(`/api/marketplace/search-guests?q=${encodeURIComponent(debouncedQuery)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && !guest.linkedFromSearch && !forceManual,
    staleTime: 30_000,
  });

  const showDropdown = dropdownOpen && !guest.linkedFromSearch && !forceManual && debouncedQuery.length >= 2;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectResult = (r: GuestSearchResult) => {
    onChange({
      name: r.name,
      email: r.email ?? '',
      marketplaceUserId: r.marketplaceUserId,
      siqPlayerId: r.siqPlayerId,
      linkedFromSearch: true,
    });
    setSearchInput(r.name);
    setDropdownOpen(false);
  };

  const clearSelection = () => {
    const name = guest.name;
    onChange({ name, email: '', linkedFromSearch: false });
    setSearchInput('');
    setForceManual(true);
    setDropdownOpen(false);
  };

  // Show email input for manual entries and SIQ-only linked guests (marketplace users have email auto-filled)
  const needsEmail = !(guest.linkedFromSearch && !!guest.marketplaceUserId);

  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40" ref={containerRef}>
      <div className="flex-1 space-y-2">
        {/* Name / search field */}
        {guest.linkedFromSearch ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
            {guest.marketplaceUserId ? (
              <UserCheck className="h-4 w-4 text-secondary shrink-0" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="flex-1 text-sm font-medium truncate">{guest.name}</span>
            {guest.marketplaceUserId ? (
              <Badge variant="secondary" className="text-[10px] shrink-0">Marketplace</Badge>
            ) : guest.siqPlayerId ? (
              <Badge variant="outline" className="text-[10px] shrink-0">SIQ Player</Badge>
            ) : null}
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              data-testid={`button-clear-guest-${idx}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : forceManual ? (
          <Input
            placeholder={`Guest ${idx + 1} name *`}
            value={guest.name}
            onChange={e => onChange({ ...guest, name: e.target.value })}
            data-testid={`input-guest-name-${idx}`}
          />
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              {isFetching && debouncedQuery.length >= 2 && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground pointer-events-none" />
              )}
              <Input
                className="pl-8"
                placeholder={`Search guest ${idx + 1} by name…`}
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                data-testid={`input-guest-search-${idx}`}
              />
            </div>

            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
                {results.length === 0 && !isFetching ? (
                  <div className="p-3 space-y-1">
                    <p className="text-xs text-muted-foreground text-center py-1">No matches found.</p>
                    <button
                      type="button"
                      className="w-full text-left text-xs text-primary hover:underline py-1 px-1"
                      onClick={() => { setForceManual(true); onChange({ ...guest, name: searchInput }); setDropdownOpen(false); }}
                      data-testid={`button-add-manually-${idx}`}
                    >
                      Add "{searchInput}" manually instead
                    </button>
                  </div>
                ) : (
                  <>
                    {results.map((r, ri) => {
                      const levelKey = r.level?.toLowerCase() ?? '';
                      const levelColor = LEVEL_COLORS[levelKey] ?? '';
                      return (
                        <button
                          key={ri}
                          type="button"
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-left transition-colors"
                          onClick={() => selectResult(r)}
                          data-testid={`option-guest-${idx}-${ri}`}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px] font-semibold bg-secondary/20 text-secondary">
                              {getInitials(r.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.name}</p>
                            {r.email && (
                              <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {r.level && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${levelColor}`}>
                                {getTierDisplayName(r.level)}
                              </span>
                            )}
                            {r.type === 'marketplace' ? (
                              <Badge variant="secondary" className="text-[10px]">Marketplace</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">SIQ Player</Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <div className="border-t px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => { setForceManual(true); onChange({ ...guest, name: searchInput }); setDropdownOpen(false); }}
                        data-testid={`button-add-manually-${idx}`}
                      >
                        Not in the list? Add manually
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Marketplace user: email is authoritative — show read-only */}
        {guest.linkedFromSearch && guest.marketplaceUserId && guest.email ? (
          <div className="relative">
            <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary pointer-events-none" />
            <Input
              className="pl-8 bg-muted/50 text-muted-foreground cursor-default"
              value={guest.email}
              readOnly
              tabIndex={-1}
              data-testid={`input-guest-email-${idx}`}
            />
          </div>
        ) : needsEmail ? (
          /* Manual / SIQ-only: show editable email field */
          <Input
            placeholder="Email (optional — for cancellation link)"
            type="email"
            value={guest.email}
            onChange={e => onChange({ ...guest, email: e.target.value })}
            data-testid={`input-guest-email-${idx}`}
          />
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        data-testid={`button-remove-guest-${idx}`}
      >
        <X className="h-4 w-4" />
      </Button>
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
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-secondary" />
        Who's Playing
        {players && players.length > 0 && (
          <Badge variant="secondary" className="text-xs">{players.length}</Badge>
        )}
      </h3>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
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
                  <AvatarFallback className="text-xs font-semibold bg-secondary/20 text-secondary">
                    {getInitials(player.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-player-name-${idx}`}>{player.name}</p>
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
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 hover-elevate cursor-pointer" data-testid={`card-player-${idx}`}>
                  {cardContent}
                </div>
              </Link>
            ) : (
              <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50" data-testid={`card-player-${idx}`}>
                {cardContent}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center rounded-lg bg-muted/30">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Be the first to book!</p>
          <p className="text-xs text-muted-foreground/70">No players have joined this session yet.</p>
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
  const [open, setOpen] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState<{ spots: number; total: number } | null>(null);

  const maxGuests = Math.min(3, session.spotsRemaining - 1);
  const spotsBooked = 1 + guests.length;
  const totalAmount = session.priceAed * spotsBooked;

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

  const makeBooking = async (method: 'cash' | 'ziina') => {
    const guestError = validateGuests();
    if (guestError) { setError(guestError); return; }

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

      if (method === 'ziina') {
        if (!data.redirectUrl) throw new Error('No payment URL received. Please try again.');
        window.location.href = data.redirectUrl;
        return;
      }

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
      <div className="border-t pt-6 space-y-4" data-testid="section-cash-confirmed">
        <div className="flex flex-col items-center gap-3 py-6 text-center rounded-lg bg-green-500/5 border border-green-500/20">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <div>
            <p className="font-semibold text-green-700 dark:text-green-400" data-testid="text-cash-confirmed">
              Booking Confirmed!
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {cashConfirmed.spots > 1
                ? `${cashConfirmed.spots} spots reserved — pay AED ${cashConfirmed.total} in cash at the venue.`
                : `Your spot is reserved — pay AED ${cashConfirmed.total} in cash at the venue.`}
            </p>
          </div>
        </div>
        <Link href="/marketplace/my-bookings">
          <Button variant="outline" className="w-full" data-testid="button-view-my-bookings">
            View My Bookings
          </Button>
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="border-t pt-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Price per player</div>
            <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
          </div>
          <Button size="lg" className="gap-2" onClick={() => setOpen(true)} data-testid="button-book-now">
            <Users className="h-5 w-5" />
            Book Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-6 space-y-5" data-testid="section-booking-panel">
      {/* Spots selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-semibold">How many spots?</p>
            <p className="text-xs text-muted-foreground mt-0.5">AED {session.priceAed} per player</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={guests.length === 0}
              onClick={() => removeGuest(guests.length - 1)}
              data-testid="button-decrease-spots"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xl font-bold w-6 text-center" data-testid="text-spots-count">{spotsBooked}</span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={guests.length >= maxGuests}
              onClick={addGuest}
              data-testid="button-increase-spots"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Live total */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
          <span className="text-muted-foreground">
            {spotsBooked === 1 ? 'Just you' : `You + ${guests.length} guest${guests.length > 1 ? 's' : ''}`}
          </span>
          <span className="font-bold text-base" data-testid="text-inline-total">AED {totalAmount}</span>
        </div>
      </div>

      {/* Guest rows */}
      {guests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Users className="h-4 w-4 text-secondary" />
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
        <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-booking-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Payment method buttons */}
      <div className="space-y-2">
        <p className="text-sm font-medium">How would you like to pay?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => !processing && makeBooking('cash')}
            data-testid="button-pay-cash"
          >
            <CardContent className="p-4 flex items-center gap-3">
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <Banknote className="h-5 w-5 text-chart-2 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm">Pay at Venue</p>
                <p className="text-xs text-muted-foreground">Pay cash when you arrive</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => !processing && makeBooking('ziina')}
            data-testid="button-pay-card"
          >
            <CardContent className="p-4 flex items-center gap-3">
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <CreditCard className="h-5 w-5 text-primary shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm">Pay by Card</p>
                <p className="text-xs text-muted-foreground">Secure checkout via Ziina</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setOpen(false); setGuests([]); setError(null); }}
        data-testid="button-cancel-booking"
      >
        Cancel
      </Button>
    </div>
  );
}

export default function SessionDetails() {
  usePageTitle('Session Details');
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useMarketplaceAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      return apiRequest('POST', '/api/marketplace/bookings', { sessionId: id, paymentMethod: 'cash' });
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Session not found</h2>
        <Link href="/marketplace/book">
          <Button variant="ghost">Back to sessions</Button>
        </Link>
      </div>
    );
  }

  const capacityPercent = session.capacity > 0
    ? Math.round((session.totalBookings / session.capacity) * 100)
    : 0;

  const renderBottomSection = () => {
    if (!isAuthenticated) {
      return (
        <div className="border-t pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Price per player</div>
              <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
            </div>
            <Link href="/marketplace/login">
              <Button size="lg" className="gap-2" data-testid="button-login-to-book">
                Log in to book
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    if (isConfirmed) {
      return (
        <div className="border-t pt-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Price per player</div>
            <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-500/10 border border-green-500/20" data-testid="status-confirmed">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">You're booked!</span>
          </div>
        </div>
      );
    }

    if (isWaitlisted && myBookingForSession) {
      return (
        <div className="border-t pt-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Price per player</div>
            <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-amber-500/10 border border-amber-500/20" data-testid="status-waitlisted">
              <ListOrdered className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Waitlist #{myBookingForSession.waitlistPosition}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelWaitlistMutation.mutate(myBookingForSession.id)}
              disabled={cancelWaitlistMutation.isPending}
              data-testid="button-leave-waitlist"
            >
              Leave Waitlist
            </Button>
          </div>
        </div>
      );
    }

    if (session.spotsRemaining <= 0) {
      return (
        <div className="border-t pt-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Price per player</div>
            <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => waitlistMutation.mutate()}
            disabled={waitlistMutation.isPending}
            data-testid="button-join-waitlist"
          >
            <ListOrdered className="h-5 w-5" />
            {waitlistMutation.isPending ? 'Joining...' : 'Join Waitlist'}
          </Button>
        </div>
      );
    }

    return <InlineBookingPanel session={session} onBooked={handleBooked} />;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp}>
          <Link href="/marketplace/book">
            <Button variant="ghost" size="sm" className="mb-4 gap-1" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" /> Back to sessions
            </Button>
          </Link>
        </motion.div>

        <motion.div variants={fadeInUp}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-2xl mb-1" data-testid="text-session-title">{session.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(session.date), 'EEEE, MMMM d, yyyy')}
                    {session.startTime && (
                      <span className="ml-1">
                        · {session.startTime}{session.endTime ? ` – ${session.endTime}` : ''}
                      </span>
                    )}
                  </p>
                </div>
                <Badge
                  variant={session.spotsRemaining > 0 ? 'secondary' : 'destructive'}
                  className="shrink-0"
                >
                  {session.spotsRemaining > 0 ? `${session.spotsRemaining} spots left` : 'Full'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { icon: Calendar, label: 'Date', value: format(new Date(session.date), 'EEEE, MMMM d, yyyy') },
                  { icon: Clock, label: 'Time', value: session.endTime ? `${session.startTime} – ${session.endTime}` : session.startTime },
                  { icon: MapPin, label: 'Venue', value: session.venueName, sub: session.venueLocation, mapUrl: session.venueMapUrl },
                  { icon: Users, label: 'Capacity', value: `${session.courtCount} courts, ${session.capacity} max players` },
                  { icon: Banknote, label: 'Price', value: `AED ${session.priceAed} per player` },
                ] as SessionInfoItem[]).map((item) => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{item.label}</div>
                      <div className="font-medium text-sm">{item.value}</div>
                      {item.sub && <div className="text-xs text-muted-foreground">{item.sub}</div>}
                      {item.mapUrl && (
                        <a
                          href={item.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                          data-testid="link-session-detail-map"
                        >
                          View on Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2 flex-wrap gap-1">
                  <span className="text-muted-foreground">Capacity</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{session.totalBookings} / {session.capacity} booked</span>
                    {session.waitlistCount > 0 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-waitlist-count">
                        + {session.waitlistCount} on waitlist
                      </span>
                    )}
                  </div>
                </div>
                <Progress value={capacityPercent} className="h-2" />
              </div>

              {session.description && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4 text-secondary" /> About this session
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{session.description}</p>
                </div>
              )}

              {isAuthenticated && id && <WhosPlaying sessionId={id} />}

              <div className="flex gap-3 p-4 rounded-md border border-orange-500/20 bg-orange-500/5">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-700 dark:text-orange-400 mb-1">Cancellation Policy</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs leading-relaxed">
                    <li>Cancellations within 5 hours of the session start will forfeit the full payment.</li>
                    <li>Cancellations made more than 5 hours before the session are free.</li>
                    <li>No-shows may be charged 150% of the session price.</li>
                  </ul>
                </div>
              </div>

              {renderBottomSection()}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
