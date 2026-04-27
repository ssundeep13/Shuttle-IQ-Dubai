import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Clock, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BookingWithDetails } from '@shared/schema';

interface ActiveSessionResponse {
  activeSessionId: string | null;
}

interface CurrentSuggestionPlayer {
  playerId: string;
  playerName: string;
  team: number;
}

interface CurrentSuggestion {
  id: string;
  status: 'pending' | 'approved' | 'playing';
  courtId: string;
  courtName: string;
  pendingUntil: string;
  selfTeam: 1 | 2 | null;
  players: CurrentSuggestionPlayer[];
}

interface CurrentSuggestionResponse {
  suggestion: CurrentSuggestion | null;
}

const NAVY = '#003E8C';
const TEAL = '#006B5F';

export default function Play() {
  usePageTitle('Play');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const bookingsQuery = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
    refetchOnMount: true,
  });

  const activeSessionQuery = useQuery<ActiveSessionResponse>({
    queryKey: ['/api/marketplace/active-session'],
    staleTime: 0,
  });

  // Pick the booking whose bookable session is linked to the currently-active
  // admin session — that's "today's session" for this player.
  const todaysBooking = useMemo<BookingWithDetails | null>(() => {
    const activeId = activeSessionQuery.data?.activeSessionId;
    const bookings = bookingsQuery.data;
    if (!activeId || !bookings) return null;
    return (
      bookings.find(
        (b) =>
          !b.isGuestBooking &&
          b.session?.linkedSessionId === activeId &&
          (b.status === 'confirmed' || b.status === 'attended'),
      ) ?? null
    );
  }, [bookingsQuery.data, activeSessionQuery.data]);

  const isCheckedIn = !!todaysBooking?.attendedAt || todaysBooking?.status === 'attended';
  const initialLoading = bookingsQuery.isPending || activeSessionQuery.isPending;

  if (initialLoading) {
    return <PageShell><InitialSkeleton /></PageShell>;
  }

  if (!todaysBooking) {
    return <PageShell><NoSessionToday onBook={() => setLocation('/marketplace/book')} /></PageShell>;
  }

  if (!isCheckedIn) {
    return (
      <PageShell>
        <CheckInScreen
          booking={todaysBooking}
          onCheckedIn={() => {
            // Refetch the bookings list — attendedAt becomes set, which flips
            // the page into the waiting state on the next render.
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <WaitingScreen onDone={() => setLocation('/marketplace')} />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:py-10" data-testid="page-play">
      {children}
    </div>
  );
}

function InitialSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function NoSessionToday({ onBook }: { onBook: () => void }) {
  return (
    <Card data-testid="card-no-session">
      <CardContent className="py-10 text-center space-y-3">
        <h1 className="text-xl font-semibold" style={{ color: NAVY }} data-testid="text-no-session-heading">
          No session today.
        </h1>
        <p className="text-sm text-muted-foreground" data-testid="text-no-session-body">
          Check the schedule for upcoming sessions.
        </p>
        <div className="pt-2">
          <Button onClick={onBook} data-testid="button-view-schedule">
            View schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckInScreen({
  booking,
  onCheckedIn,
}: {
  booking: BookingWithDetails;
  onCheckedIn: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkInMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/marketplace/sessions/${booking.session.id}/checkin`);
    },
    onSuccess: () => {
      setErrorMessage(null);
      onCheckedIn();
    },
    onError: (err: unknown) => {
      const fallback = "Couldn't check you in — please ask the Court Captain for help.";
      const maybeApi = err as { error?: string } | null | undefined;
      const fromMessage = err instanceof Error ? err.message : undefined;
      setErrorMessage(maybeApi?.error || fromMessage || fallback);
    },
  });

  const sessionDate = booking.session.date ? new Date(booking.session.date) : null;
  const dateLabel = sessionDate ? format(sessionDate, 'EEEE, MMMM d') : '';

  return (
    <div className="space-y-6" data-testid="state-checkin">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: TEAL }}>
          Today
        </p>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }} data-testid="text-checkin-heading">
          Ready to check in?
        </h1>
      </div>

      <Card data-testid="card-session-details">
        <CardContent className="py-5 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium" data-testid="text-venue-name">{booking.session.venueName}</p>
              {booking.session.title ? (
                <p className="text-muted-foreground text-xs mt-0.5" data-testid="text-session-title">
                  {booking.session.title}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CalendarIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span data-testid="text-session-date">{dateLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span data-testid="text-session-time">{booking.session.startTime}</span>
          </div>
        </CardContent>
      </Card>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="text-checkin-error"
        >
          {errorMessage}
        </div>
      ) : null}

      <Button
        size="lg"
        className="w-full text-base h-14"
        onClick={() => checkInMutation.mutate()}
        disabled={checkInMutation.isPending}
        data-testid="button-checkin"
      >
        {checkInMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking you in…
          </>
        ) : (
          'Check in'
        )}
      </Button>
    </div>
  );
}

function WaitingScreen({ onDone }: { onDone: () => void }) {
  const [, setLocation] = useLocation();

  const suggestionQuery = useQuery<CurrentSuggestionResponse>({
    queryKey: ['/api/marketplace/players/me/current-suggestion'],
    refetchInterval: 5000,
    staleTime: 0,
  });

  const suggestion = suggestionQuery.data?.suggestion ?? null;

  // Auto-transition to the playing screen (P7) when the suggestion flips to
  // 'playing'. P7 is not yet built — wouter falls through to NotFound, which
  // is acceptable for this phase per the plan.
  useEffect(() => {
    if (suggestion?.status === 'playing') {
      setLocation('/marketplace/play/playing');
    }
  }, [suggestion?.status, setLocation]);

  // Initial-load skeleton only. Background polls do NOT re-trigger this
  // (we ignore isFetching) so the screen stays calm.
  if (suggestionQuery.isPending) {
    return (
      <div className="space-y-6" data-testid="state-waiting-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="state-waiting">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: TEAL }}>
          Status
        </p>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }} data-testid="text-waiting-heading">
          You're checked in
        </h1>
      </div>

      {!suggestion ? (
        <FindingNextGameCard />
      ) : (
        <NextGameCard suggestion={suggestion} />
      )}

      <div className="pt-4 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDone}
          data-testid="button-done-for-today"
        >
          I'm done for today
        </Button>
      </div>
    </div>
  );
}

function FindingNextGameCard() {
  return (
    <Card data-testid="card-finding-game">
      <CardContent className="py-10 text-center space-y-3">
        <div className="mx-auto h-2 w-32 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full w-1/3 rounded-full animate-pulse"
            style={{ backgroundColor: TEAL }}
          />
        </div>
        <p className="text-sm font-medium" style={{ color: NAVY }} data-testid="text-finding-game">
          Finding your next game…
        </p>
        <p className="text-xs text-muted-foreground">
          The Court Captain is sorting out the next round.
        </p>
      </CardContent>
    </Card>
  );
}

function NextGameCard({ suggestion }: { suggestion: CurrentSuggestion }) {
  // Render from the current player's perspective. Backend tells us which team
  // (1 or 2) the requesting player belongs to via `selfTeam`. If unknown
  // (selfTeam === null) we fall back to team 1 = "Your team" so the UI never
  // breaks, but in practice the suggestion always contains the player.
  const selfTeamNum = suggestion.selfTeam ?? 1;
  const oppTeamNum = selfTeamNum === 1 ? 2 : 1;
  const yourTeam = suggestion.players.filter((p) => p.team === selfTeamNum);
  const opponents = suggestion.players.filter((p) => p.team === oppTeamNum);
  const isApproved = suggestion.status === 'approved';

  return (
    <Card data-testid="card-next-game">
      <CardContent className="py-6 space-y-5">
        {isApproved ? (
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-wider" style={{ color: TEAL }}>
              Court ready
            </p>
            <h2 className="text-xl font-semibold" data-testid="text-game-heading">
              Head to{' '}
              <span style={{ color: TEAL }} data-testid="text-court-name-approved">
                {suggestion.courtName}
              </span>{' '}
              now
            </h2>
          </div>
        ) : (
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Up next
            </p>
            <h2 className="text-xl font-semibold" style={{ color: NAVY }} data-testid="text-game-heading">
              Your next game
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-court-name-pending">
              {suggestion.courtName}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <TeamRow label="Your team" players={yourTeam} accent={TEAL} testId="team-self" />
          <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">vs</div>
          <TeamRow label="Opponents" players={opponents} accent={NAVY} testId="team-opponents" />
        </div>
      </CardContent>
    </Card>
  );
}

function TeamRow({
  label,
  players,
  accent,
  testId,
}: {
  label: string;
  players: CurrentSuggestionPlayer[];
  accent: string;
  testId: string;
}) {
  return (
    <div data-testid={`row-${testId}`}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: accent }}>
        {label}
      </p>
      <div className="space-y-1">
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          players.map((p) => (
            <p key={p.playerId} className="text-base font-medium" data-testid={`text-player-${p.playerId}`}>
              {p.playerName}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
