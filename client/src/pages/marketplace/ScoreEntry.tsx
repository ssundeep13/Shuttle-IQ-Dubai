import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';
import { usePageTitle } from '@/hooks/usePageTitle';

interface CurrentSuggestionPlayer {
  playerId: string;
  playerName: string;
  team: number;
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

interface SubmitScoreResponse {
  success: true;
  gameResultId: string;
  alreadySubmitted: boolean;
}

interface FlagResponse {
  success: true;
  disputeId: string;
  alreadyFlagged: boolean;
}

const NAVY = '#003E8C';
const TEAL = '#006B5F';

function isNonNegativeInteger(raw: string): boolean {
  if (raw.trim() === '') return false;
  if (!/^\d+$/.test(raw.trim())) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0;
}

export default function ScoreEntry() {
  usePageTitle('Score');
  const [, setLocation] = useLocation();

  // The score-entry screen opts in to the 'completed' fallback via
  // ?for=score-entry. Other consumers (waiting screen, playing screen)
  // intentionally do not pass this and therefore never receive a stale
  // completed suggestion.
  const suggestionQuery = useQuery<CurrentSuggestionResponse>({
    queryKey: ['/api/marketplace/players/me/current-suggestion', { for: 'score-entry' }],
    queryFn: async () => {
      const res = await fetch(
        '/api/marketplace/players/me/current-suggestion?for=score-entry',
        {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('mp_accessToken') ?? ''}`,
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: false,
    staleTime: 0,
  });

  const suggestion = suggestionQuery.data?.suggestion ?? null;

  // Status-driven gating. The score screen only renders for 'playing' or
  // 'completed' suggestions — anything else means the player landed here
  // without a game to score, so we send them back to the waiting screen.
  useEffect(() => {
    if (suggestionQuery.isPending) return;
    const status = suggestion?.status ?? null;
    if (status === 'playing' || status === 'completed') return;
    setLocation('/marketplace/play');
  }, [suggestion?.status, suggestionQuery.isPending, setLocation]);

  return (
    <div
      className="mx-auto w-full max-w-md px-4 py-6 sm:py-10"
      data-testid="page-score-entry"
    >
      {suggestionQuery.isPending ? (
        <InitialSkeleton />
      ) : suggestion?.status === 'playing' || suggestion?.status === 'completed' ? (
        <ScoreEntryContent suggestion={suggestion} />
      ) : (
        <InitialSkeleton />
      )}
    </div>
  );
}

function InitialSkeleton() {
  return (
    <div className="space-y-4" data-testid="state-score-loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function ScoreEntryContent({ suggestion }: { suggestion: CurrentSuggestion }) {
  const [, setLocation] = useLocation();

  // Render from the requesting player's perspective. selfTeam comes from the
  // backend; fall back to team 1 defensively so the UI never crashes.
  const selfTeamNum: 1 | 2 = suggestion.selfTeam ?? 1;
  const oppTeamNum: 1 | 2 = selfTeamNum === 1 ? 2 : 1;
  const yourTeamPlayers = suggestion.players.filter((p) => p.team === selfTeamNum);
  const opponentPlayers = suggestion.players.filter((p) => p.team === oppTeamNum);

  // Local form state. The two inputs are labelled from the player's
  // perspective ("Your team" / "Opponents"); the API expects team1Score /
  // team2Score, so we map at submission time.
  const [yourScoreRaw, setYourScoreRaw] = useState('');
  const [oppScoreRaw, setOppScoreRaw] = useState('');
  const [selectedWinner, setSelectedWinner] = useState<'self' | 'opponents' | null>(null);

  // Post-submit state. Once we have a gameResultId, we render the flag
  // button; we never re-show the form.
  const [submittedGameResultId, setSubmittedGameResultId] = useState<string | null>(null);
  const [submittedAlreadyRecorded, setSubmittedAlreadyRecorded] = useState(false);
  const [flagResolved, setFlagResolved] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);

  const yourScoreValid = isNonNegativeInteger(yourScoreRaw);
  const oppScoreValid = isNonNegativeInteger(oppScoreRaw);
  const bothScoresValid = yourScoreValid && oppScoreValid;

  // Derived validation. We only show inline messages once both inputs are
  // valid integers — partial input shouldn't yell at the player.
  const isTied = bothScoresValid && Number(yourScoreRaw) === Number(oppScoreRaw);
  const winnerMismatch = useMemo(() => {
    if (!bothScoresValid || isTied || !selectedWinner) return false;
    const yourWon = Number(yourScoreRaw) > Number(oppScoreRaw);
    return selectedWinner === 'self' ? !yourWon : yourWon;
  }, [bothScoresValid, isTied, selectedWinner, yourScoreRaw, oppScoreRaw]);

  const submitMutation = useMutation<
    SubmitScoreResponse,
    { error?: string; status?: number },
    { team1Score: number; team2Score: number; winningTeam: 1 | 2 }
  >({
    mutationFn: (payload) =>
      apiRequest<SubmitScoreResponse>(
        'POST',
        `/api/marketplace/games/${suggestion.id}/submit-score`,
        payload,
      ),
    onSuccess: (data) => {
      setSubmittedGameResultId(data.gameResultId);
      setSubmittedAlreadyRecorded(data.alreadySubmitted);
      setSubmitError(null);
      // Navigation is intentionally delayed so the player sees the
      // confirmation text.
      //   - First submitter (alreadySubmitted=false) is sent to the post-
      //     game confirmation screen at /marketplace/play/done. P9 hasn't
      //     shipped yet, so wouter falls through to NotFound — acceptable
      //     per the plan.
      //   - Late submitter (alreadySubmitted=true) doesn't need that
      //     screen because they weren't the one who recorded the score;
      //     send them straight back to the session hub at
      //     /marketplace/play, which is today's "session summary" surface
      //     (waiting room / next game).
      if (data.alreadySubmitted) {
        window.setTimeout(() => {
          setLocation('/marketplace/play');
        }, 2000);
      } else {
        window.setTimeout(() => {
          setLocation('/marketplace/play/done');
        }, 1500);
      }
    },
    onError: (err) => {
      setSubmitError(
        err?.error ??
          'Could not submit the score. Please try again or ask the Court Captain for help.',
      );
    },
  });

  const flagMutation = useMutation<
    FlagResponse,
    { error?: string; status?: number },
    void
  >({
    mutationFn: () =>
      apiRequest<FlagResponse>(
        'POST',
        `/api/marketplace/games/${submittedGameResultId}/flag`,
        {},
      ),
    onSuccess: () => {
      setFlagResolved(true);
      setFlagError(null);
    },
    onError: (err) => {
      setFlagError(
        err?.error ??
          'Could not flag the score. Please ask the Court Captain to look into it.',
      );
    },
  });

  const canSubmit =
    !submitMutation.isPending &&
    submittedGameResultId === null &&
    bothScoresValid &&
    !isTied &&
    selectedWinner !== null &&
    !winnerMismatch;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const yourNum = Number(yourScoreRaw);
    const oppNum = Number(oppScoreRaw);
    // Map the player-perspective scores back to team1/team2 the API expects.
    const team1Score = selfTeamNum === 1 ? yourNum : oppNum;
    const team2Score = selfTeamNum === 1 ? oppNum : yourNum;
    const winningTeamNum: 1 | 2 =
      selectedWinner === 'self' ? selfTeamNum : oppTeamNum;
    submitMutation.mutate({
      team1Score,
      team2Score,
      winningTeam: winningTeamNum,
    });
  };

  // Allow only digits as the user types, but keep the value as a string so
  // we can show the empty state cleanly. Strip leading zeros except for "0".
  const handleScoreChange =
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/[^0-9]/g, '');
      const normalized = digits.length > 1 ? digits.replace(/^0+/, '') || '0' : digits;
      setter(normalized);
    };

  const submitted = submittedGameResultId !== null;

  return (
    <div className="space-y-6" data-testid="state-score-entry">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: TEAL }}>
          Game over
        </p>
        <h1
          className="text-2xl font-semibold"
          style={{ color: NAVY }}
          data-testid="text-score-heading"
        >
          What was the score?
        </h1>
      </div>

      <Card data-testid="card-score-entry">
        <CardContent className="py-6 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Court
            </p>
            <p
              className="text-2xl font-semibold"
              style={{ color: NAVY }}
              data-testid="text-court-name"
            >
              {suggestion.courtName}
            </p>
          </div>

          <div className="space-y-3">
            <TeamRow
              label="Your team"
              players={yourTeamPlayers}
              accent={TEAL}
              testId="team-self"
            />
            <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">
              vs
            </div>
            <TeamRow
              label="Opponents"
              players={opponentPlayers}
              accent={NAVY}
              testId="team-opponents"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <ScoreInput
              label="Your team"
              accent={TEAL}
              value={yourScoreRaw}
              onChange={handleScoreChange(setYourScoreRaw)}
              disabled={submitted || submitMutation.isPending}
              testId="input-score-self"
            />
            <ScoreInput
              label="Opponents"
              accent={NAVY}
              value={oppScoreRaw}
              onChange={handleScoreChange(setOppScoreRaw)}
              disabled={submitted || submitMutation.isPending}
              testId="input-score-opponents"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Who won?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <WinnerCard
                label="Your team"
                players={yourTeamPlayers}
                accent={TEAL}
                selected={selectedWinner === 'self'}
                disabled={submitted || submitMutation.isPending}
                onClick={() => setSelectedWinner('self')}
                testId="button-winner-self"
              />
              <WinnerCard
                label="Opponents"
                players={opponentPlayers}
                accent={NAVY}
                selected={selectedWinner === 'opponents'}
                disabled={submitted || submitMutation.isPending}
                onClick={() => setSelectedWinner('opponents')}
                testId="button-winner-opponents"
              />
            </div>
          </div>

          {isTied ? (
            <p
              className="text-sm text-destructive text-center"
              data-testid="text-error-tied"
            >
              Scores cannot be tied — badminton always has a winner.
            </p>
          ) : winnerMismatch ? (
            <p
              className="text-sm text-destructive text-center"
              data-testid="text-error-mismatch"
            >
              The winner you picked has the lower score. Adjust the scores or
              the winner before submitting.
            </p>
          ) : null}

          {submitError ? (
            <p
              className="text-sm text-destructive text-center"
              data-testid="text-error-submit"
            >
              {submitError}
            </p>
          ) : null}

          {!submitted ? (
            <Button
              size="lg"
              className="w-full"
              style={{ backgroundColor: NAVY, color: 'white' }}
              disabled={!canSubmit}
              onClick={handleSubmit}
              data-testid="button-submit-score"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit score'}
            </Button>
          ) : (
            <div className="space-y-3">
              <p
                className="text-sm font-medium text-center"
                style={{ color: TEAL }}
                data-testid="text-submit-confirmation"
              >
                {submittedAlreadyRecorded
                  ? 'Score already recorded.'
                  : 'Score submitted!'}
              </p>

              {flagResolved ? (
                <p
                  className="text-xs text-center text-muted-foreground"
                  data-testid="text-flag-confirmation"
                >
                  Flagged for review.
                </p>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={flagMutation.isPending}
                    onClick={() => flagMutation.mutate()}
                    data-testid="button-flag-score"
                  >
                    {flagMutation.isPending ? 'Flagging…' : 'Flag this score'}
                  </Button>
                  {flagError ? (
                    <p
                      className="text-xs text-destructive text-center"
                      data-testid="text-error-flag"
                    >
                      {flagError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreInput({
  label,
  accent,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  accent: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </span>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="0"
        className="h-14 text-center text-3xl font-semibold tabular-nums"
        data-testid={testId}
      />
    </label>
  );
}

function WinnerCard({
  label,
  players,
  accent,
  selected,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  players: CurrentSuggestionPlayer[];
  accent: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border p-3 text-left hover-elevate active-elevate-2 disabled:opacity-60 disabled:cursor-not-allowed ${
        selected ? 'border-2' : ''
      }`}
      style={{
        borderColor: selected ? TEAL : undefined,
        backgroundColor: selected ? `${TEAL}10` : undefined,
      }}
      data-testid={testId}
    >
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: accent }}>
        {label}
      </p>
      <div className="space-y-0.5">
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          players.map((p) => (
            <p key={p.playerId} className="text-sm font-medium leading-tight">
              {p.playerName}
            </p>
          ))
        )}
      </div>
    </button>
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
            <p
              key={p.playerId}
              className="text-base font-medium"
              data-testid={`text-player-${p.playerId}`}
            >
              {p.playerName}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
