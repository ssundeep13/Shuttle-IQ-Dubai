// Player Challenges (C4) — the "Challenges" card on the player's own Stats page
// (/marketplace/my-scores; moved there from Profile in C7).
// Incoming (Accept / Decline), outgoing pending, active, and the last three
// settled. Data is GET /api/marketplace/challenges/mine; names and tiers in
// the payload are display values already.
import { useEffect, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Swords, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { apiErrorText } from '@/lib/apiError';
import { useToast } from '@/hooks/use-toast';
import { dubaiCalendarDate } from '@/lib/sessionTime';
import { formatPreviewDate } from '@shared/utils/seriesDates';

interface PlayerView { id: string; name: string; tier: string }
interface ChallengeView {
  id: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  challenger: PlayerView;
  challenged: PlayerView;
  winner: PlayerView | null;
  gameResultId: string | null;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  settledAt: string | null;
}
interface MineView { incoming: ChallengeView[]; outgoing: ChallengeView[]; active: ChallengeView[]; settled: ChallengeView[] }

const SETTLED_SHOWN = 3;
const day = (iso: string | null): string => {
  const d = iso ? dubaiCalendarDate(iso) : null;
  return d ? formatPreviewDate(d) : '';
};
/** The other player, from the viewer's side. */
const opponent = (c: ChallengeView) => (c.direction === 'incoming' ? c.challenger : c.challenged);

function SectionLabel({ children }: { children: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</p>;
}

function Row({ c, children, line, sub }: { c: ChallengeView; children?: React.ReactNode; line: string; sub: string }) {
  return (
    <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2 py-2 border-t first:border-t-0" data-testid={`challenge-row-${c.id}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{line}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function ChallengesCard({ cardStyle, titleStyle }: { cardStyle?: CSSProperties; titleStyle?: CSSProperties }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<MineView>({ queryKey: ['/api/marketplace/challenges/mine'] });

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      apiRequest('POST', `/api/marketplace/challenges/${id}/${action}`),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/challenges/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/feed'] });
      if (vars.action === 'accept') toast({ title: 'Challenge accepted', description: 'It settles the next time you play on opposite sides.' });
    },
    onError: (err) => toast({ title: apiErrorText(err), variant: 'destructive' }),
  });
  const busy = (id: string) => respond.isPending && respond.variables?.id === id;

  // C6/C7 — the challenge email deep-links to /marketplace/my-scores#challenges.
  // The SPA renders async, so the native anchor scroll misses; scroll on
  // mount (and on hash change) the way MarketplaceHome handles its anchor.
  useEffect(() => {
    const scrollToCard = () => {
      if (window.location.hash === '#challenges') {
        requestAnimationFrame(() => document.getElementById('challenges')?.scrollIntoView({ block: 'start' }));
      }
    };
    scrollToCard();
    window.addEventListener('hashchange', scrollToCard);
    return () => window.removeEventListener('hashchange', scrollToCard);
  }, []);

  const empty = !!data && data.incoming.length + data.outgoing.length + data.active.length + data.settled.length === 0;

  return (
    <Card id="challenges" style={cardStyle} data-testid="card-challenges">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={titleStyle}>
          <Swords className="h-4 w-4 text-secondary" /> Challenges
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading challenges...</p>
        )}
        {isError && <p className="text-sm text-muted-foreground">Couldn't load your challenges.</p>}

        {empty && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No challenges yet. Find a player to challenge.</p>
            <Link href="/marketplace/rankings" className="siq-press text-sm font-semibold text-secondary-text underline underline-offset-2">
              Browse the rankings
            </Link>
          </div>
        )}

        {data && data.incoming.length > 0 && (
          <div>
            <SectionLabel>Incoming</SectionLabel>
            {data.incoming.map((c) => (
              <Row key={c.id} c={c} line={`${c.challenger.name} challenged you`} sub={`${c.challenger.tier} · sent ${day(c.createdAt)} · expires ${day(c.expiresAt)}`}>
                <div className="flex flex-col min-[400px]:flex-row gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="w-full min-[400px]:w-auto"
                    onClick={() => respond.mutate({ id: c.id, action: 'accept' })}
                    disabled={busy(c.id)}
                    data-testid={`button-accept-challenge-${c.id}`}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full min-[400px]:w-auto"
                    onClick={() => respond.mutate({ id: c.id, action: 'decline' })}
                    disabled={busy(c.id)}
                    data-testid={`button-decline-challenge-${c.id}`}
                  >
                    Decline
                  </Button>
                </div>
              </Row>
            ))}
          </div>
        )}

        {data && data.outgoing.length > 0 && (
          <div>
            <SectionLabel>Waiting for a reply</SectionLabel>
            {data.outgoing.map((c) => (
              <Row key={c.id} c={c} line={`You challenged ${c.challenged.name}`} sub={`${c.challenged.tier} · expires ${day(c.expiresAt)}`} />
            ))}
          </div>
        )}

        {data && data.active.length > 0 && (
          <div>
            <SectionLabel>Active</SectionLabel>
            {data.active.map((c) => (
              <Row key={c.id} c={c} line={`vs ${opponent(c).name}`} sub={`${opponent(c).tier} · accepted ${day(c.respondedAt)} · settles next time you play on opposite sides`} />
            ))}
          </div>
        )}

        {data && data.settled.length > 0 && (
          <div>
            <SectionLabel>Settled</SectionLabel>
            {data.settled.slice(0, SETTLED_SHOWN).map((c) => {
              const me = c.direction === 'incoming' ? c.challenged : c.challenger;
              const won = c.winner?.id === me.id;
              return (
                <Row key={c.id} c={c} line={won ? `You beat ${opponent(c).name}` : `${opponent(c).name} beat you`} sub={`settled ${day(c.settledAt)}`} />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
