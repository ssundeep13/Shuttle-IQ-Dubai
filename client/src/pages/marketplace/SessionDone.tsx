import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/usePageTitle';

const NAVY = '#003E8C';
const TEAL = '#006B5F';
const MUTED_RED = '#B23A3A';

interface SessionSummaryResponse {
  noSession?: true;
  playerName?: string;
  gamesPlayed?: number;
  wins?: number;
  winRate?: number;
  skillScoreDelta?: number;
  currentSkillScore?: number;
  tierName?: string;
  rankBySkillScore?: number;
  totalPlayers?: number;
}

function firstNameOf(fullName: string | undefined): string {
  if (!fullName) return 'player';
  const trimmed = fullName.trim();
  if (!trimmed) return 'player';
  return trimmed.split(/\s+/)[0];
}

export default function SessionDone() {
  usePageTitle('Session complete');
  const [, setLocation] = useLocation();

  // Static end state — no polling, no auto-refetch. The summary reflects a
  // session that has already finished, so re-fetching would only churn.
  const summaryQuery = useQuery<SessionSummaryResponse>({
    queryKey: ['/api/marketplace/players/me/session-summary'],
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  return (
    <div
      className="mx-auto w-full max-w-md px-4 py-6 sm:py-10"
      data-testid="page-session-done"
    >
      {summaryQuery.isPending ? (
        <LoadingState />
      ) : summaryQuery.isError ? (
        <ErrorState onBook={() => setLocation('/marketplace/book')} />
      ) : summaryQuery.data?.noSession ? (
        <NoSessionState onBook={() => setLocation('/marketplace/book')} />
      ) : (
        <SummaryContent
          data={summaryQuery.data!}
          onProfile={() => setLocation('/marketplace/profile')}
          onBook={() => setLocation('/marketplace/book')}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" data-testid="state-summary-loading">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function ErrorState({ onBook }: { onBook: () => void }) {
  // Surfaced when the summary endpoint returns 5xx. Copy uses the
  // "Court Captain" wording per the spec; the action button still gives
  // the player a forward path even though the data didn't load.
  return (
    <div className="space-y-6 text-center" data-testid="state-summary-error">
      <p className="text-base text-muted-foreground">
        Could not load your session summary. Please ask the Court Captain for help.
      </p>
      <Button
        className="w-full text-white"
        style={{ backgroundColor: NAVY }}
        onClick={onBook}
        data-testid="button-book-session"
      >
        Book a session
      </Button>
    </div>
  );
}

function NoSessionState({ onBook }: { onBook: () => void }) {
  return (
    <div className="space-y-6 text-center" data-testid="state-no-session">
      <div className="space-y-2">
        <p
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: TEAL }}
          data-testid="text-eyebrow"
        >
          Welcome
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: NAVY }}
          data-testid="text-no-session-heading"
        >
          Nothing to show yet — play a session first.
        </h1>
      </div>
      <Button
        className="w-full text-white"
        style={{ backgroundColor: NAVY }}
        onClick={onBook}
        data-testid="button-book-session"
      >
        Book a session
      </Button>
    </div>
  );
}

function SummaryContent({
  data,
  onProfile,
  onBook,
}: {
  data: SessionSummaryResponse;
  onProfile: () => void;
  onBook: () => void;
}) {
  const playedAnyGames = (data.gamesPlayed ?? 0) > 0;
  const firstName = firstNameOf(data.playerName);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: TEAL }}
          data-testid="text-eyebrow"
        >
          Session Complete
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold leading-tight"
          style={{ color: NAVY }}
          data-testid="text-heading"
        >
          Great session, {firstName}.
        </h1>
      </div>

      {playedAnyGames ? (
        <StatsCard data={data} />
      ) : (
        <ZeroGamesCard data={data} />
      )}

      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={onProfile}
          data-testid="button-see-profile"
        >
          See full profile
        </Button>
        <Button
          className="w-full text-white"
          style={{ backgroundColor: NAVY }}
          onClick={onBook}
          data-testid="button-book-next"
        >
          Book next session
        </Button>
      </div>
    </div>
  );
}

function ZeroGamesCard({ data }: { data: SessionSummaryResponse }) {
  // Player attended (booking marked attended) but was never assigned to a
  // court, so there are no game_participants rows. We still surface their
  // tier + rank so the screen doesn't feel empty.
  return (
    <Card data-testid="card-zero-games">
      <CardContent className="p-6 space-y-5 text-center">
        <p className="text-base text-muted-foreground" data-testid="text-zero-games-message">
          You checked in but didn't play any games. See you next time!
        </p>
        <div className="border-t pt-5 grid grid-cols-2 gap-4 text-left">
          <TierBlock tierName={data.tierName} score={data.currentSkillScore} />
          <RankBlock
            rank={data.rankBySkillScore}
            total={data.totalPlayers}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatsCard({ data }: { data: SessionSummaryResponse }) {
  return (
    <Card data-testid="card-stats">
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <StatBlock
            label="Games"
            value={String(data.gamesPlayed ?? 0)}
            testId="stat-games"
          />
          <StatBlock
            label="Wins"
            value={String(data.wins ?? 0)}
            testId="stat-wins"
          />
          <StatBlock
            label="Win rate"
            value={`${data.winRate ?? 0}%`}
            testId="stat-winrate"
          />
        </div>

        <DeltaBlock delta={data.skillScoreDelta ?? 0} />

        <div className="border-t pt-5 grid grid-cols-2 gap-4">
          <TierBlock tierName={data.tierName} score={data.currentSkillScore} />
          <RankBlock
            rank={data.rankBySkillScore}
            total={data.totalPlayers}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="space-y-1">
      <p
        className="text-3xl font-bold"
        style={{ color: NAVY }}
        data-testid={testId}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function DeltaBlock({ delta }: { delta: number }) {
  // Three visual states per spec:
  //   delta > 0  → teal,    "+N points"
  //   delta < 0  → muted red, "-N points"
  //   delta == 0 → grey,    "No change"
  let label: string;
  let color: string;
  let testId: string;

  if (delta === 0) {
    label = 'No change';
    color = 'hsl(var(--muted-foreground))';
    testId = 'text-delta-zero';
  } else if (delta > 0) {
    label = `+${delta} points`;
    color = TEAL;
    testId = 'text-delta-gain';
  } else {
    // delta is negative; String(delta) already includes the leading "-"
    label = `${delta} points`;
    color = MUTED_RED;
    testId = 'text-delta-loss';
  }

  return (
    <div className="text-center space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Skill score change
      </p>
      <p
        className="text-2xl font-bold"
        style={{ color }}
        data-testid={testId}
      >
        {label}
      </p>
    </div>
  );
}

function TierBlock({
  tierName,
  score,
}: {
  tierName: string | undefined;
  score: number | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Skill score
      </p>
      <p
        className="text-xl font-bold"
        style={{ color: NAVY }}
        data-testid="text-current-score"
      >
        {score ?? '—'}
      </p>
      <p className="text-sm text-muted-foreground" data-testid="text-tier-name">
        {tierName ?? '—'}
      </p>
    </div>
  );
}

function RankBlock({
  rank,
  total,
}: {
  rank: number | undefined;
  total: number | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Ranking
      </p>
      <p
        className="text-xl font-bold"
        style={{ color: NAVY }}
        data-testid="text-rank"
      >
        #{rank ?? '—'}
      </p>
      <p className="text-sm text-muted-foreground">
        of {total ?? '—'} players
      </p>
    </div>
  );
}
