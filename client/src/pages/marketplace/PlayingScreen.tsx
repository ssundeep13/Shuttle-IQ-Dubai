import { useEffect, useRef, useState } from 'react';
import { MKT } from './LandingComponents';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/usePageTitle';
import BadgeTag from '@/components/BadgeTag';
import FoundingMemberSeal from '@/components/FoundingMemberSeal';

interface CurrentSuggestionPlayer {
  playerId: string;
  playerName: string;
  team: number;
  // Active badge display name (badge Gate 4) — null when unbadged.
  badge?: string | null;
  // Founding Member seal — a separate flag, so it renders beside the badge.
  foundingMember?: boolean;
}

interface CurrentSuggestion {
  id: string;
  status: 'pending' | 'approved' | 'playing' | 'completed' | 'dismissed';
  courtId: string;
  courtName: string;
  pendingUntil: string;
  selfTeam: 1 | 2 | null;
  players: CurrentSuggestionPlayer[];
}

interface CurrentSuggestionResponse {
  suggestion: CurrentSuggestion | null;
}

const NAVY = '#002C84';
const TEAL = MKT.tealText; // routed through the brand token (Design Gate 2)

export default function PlayingScreen() {
  usePageTitle('Playing');
  const [, setLocation] = useLocation();

  // Reuse the same endpoint P6 already polls. TanStack Query handles teardown
  // of the 5 s interval automatically when this component unmounts.
  const suggestionQuery = useQuery<CurrentSuggestionResponse>({
    queryKey: ['/api/marketplace/players/me/current-suggestion'],
    refetchInterval: 5000,
    staleTime: 0,
  });

  const suggestion = suggestionQuery.data?.suggestion ?? null;

  // Tracks whether we ever observed a 'playing' status during this mount.
  // The current-suggestion endpoint only surfaces pending|approved|playing —
  // when the Court Captain marks the game as completed the suggestion drops
  // out of the response and we see `null`. We distinguish "the game just
  // finished" from "the player landed here without a live game" by checking
  // whether 'playing' was seen at any earlier poll on this mount.
  const sawPlayingRef = useRef(false);

  useEffect(() => {
    if (suggestionQuery.isPending) {
      // Initial load — don't redirect while we're still finding out.
      return;
    }

    const status = suggestion?.status ?? null;

    if (status === 'playing') {
      sawPlayingRef.current = true;
      return;
    }

    if (status === 'pending' || status === 'approved') {
      // Player landed here too early. Send them back to the waiting screen.
      setLocation('/marketplace/play');
      return;
    }

    if (status === 'dismissed') {
      // Admin cancelled the game (Court Captain pressed Cancel Game).
      // The /current-suggestion endpoint surfaces 'dismissed' rows for a
      // 10-minute window so we can detect this transition. Route the
      // player back to the waiting screen — score entry is reserved for
      // games that actually completed with a winner.
      setLocation('/marketplace/play');
      return;
    }

    // status is null or 'completed'. Gate F0: score entry is captain-only —
    // whether the game just finished or never started, players return to the
    // waiting screen and the Court Captain records the result.
    setLocation('/marketplace/play');
  }, [suggestion?.status, suggestionQuery.isPending, setLocation]);

  // Cosmetic count-up timer. Lives in its own effect so it never tangles with
  // the polling query. The interval is cleared on unmount via the cleanup
  // function — verified by manual code review for memory-leak safety.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:py-10" data-testid="page-playing">
      {suggestionQuery.isPending ? (
        <InitialSkeleton />
      ) : suggestion?.status === 'playing' ? (
        <PlayingContent suggestion={suggestion} elapsedSeconds={elapsedSeconds} />
      ) : (
        // We're about to redirect (handled by the effect above). Render a
        // small skeleton so the screen doesn't flash empty during the
        // single render between data arriving and navigation taking effect.
        <InitialSkeleton />
      )}
    </div>
  );
}

function InitialSkeleton() {
  return (
    <div className="space-y-4" data-testid="state-playing-loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-4 w-56 mx-auto" />
    </div>
  );
}

function PlayingContent({
  suggestion,
  elapsedSeconds,
}: {
  suggestion: CurrentSuggestion;
  elapsedSeconds: number;
}) {
  const [, setLocation] = useLocation();
  // Render from the requesting player's perspective. selfTeam is set by the
  // backend based on the linkedPlayerId; fall back to team 1 defensively so
  // the UI never crashes if the data is somehow incomplete.
  const selfTeamNum = suggestion.selfTeam ?? 1;
  const oppTeamNum = selfTeamNum === 1 ? 2 : 1;
  const yourTeam = suggestion.players.filter((p) => p.team === selfTeamNum);
  const opponents = suggestion.players.filter((p) => p.team === oppTeamNum);

  return (
    <div className="space-y-6" data-testid="state-playing">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: TEAL }}>
          In progress
        </p>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }} data-testid="text-playing-heading">
          Game on.
        </h1>
      </div>

      <Card data-testid="card-playing">
        <CardContent className="py-6 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Court
            </p>
            <p
              className="text-3xl font-semibold"
              style={{ color: NAVY }}
              data-testid="text-court-name"
            >
              {suggestion.courtName}
            </p>
          </div>

          <div className="space-y-3">
            <TeamRow
              label="Your team"
              players={yourTeam}
              accent={TEAL}
              testId="team-self"
            />
            <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">
              vs
            </div>
            <TeamRow
              label="Opponents"
              players={opponents}
              accent={NAVY}
              testId="team-opponents"
            />
          </div>

          <div className="text-center space-y-1 pt-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Time
            </p>
            <p
              className="text-4xl font-semibold tabular-nums"
              style={{ color: NAVY }}
              data-testid="text-game-timer"
            >
              {formatTimer(elapsedSeconds)}
            </p>
          </div>
        </CardContent>
      </Card>

      <p
        className="text-xs text-center text-muted-foreground"
        data-testid="text-playing-caption"
      >
        Your Court Captain records the score when the game ends.
      </p>
    </div>
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
            <div key={p.playerId} className="flex items-center gap-2 flex-wrap">
              <p
                className="text-base font-medium"
                data-testid={`text-player-${p.playerId}`}
              >
                {p.playerName}
              </p>
              <FoundingMemberSeal show={p.foundingMember} size={18} testid={`seal-${p.playerId}`} />
              <BadgeTag badge={p.badge} small testid={`tag-badge-${p.playerId}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
