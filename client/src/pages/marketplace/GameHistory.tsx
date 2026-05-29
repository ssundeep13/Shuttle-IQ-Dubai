import { useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { History, Link2, Users, TrendingUp, TrendingDown, Minus, Trophy, Flag, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useReducedMotion } from 'framer-motion';
import type { PlayerStats, ScoreDispute } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

const WIN_GREEN = '#1F8A5B';
const LOSS_RED = '#B23A2E';

type Filter = 'all' | 'wins' | 'losses';

// ── Shared styled primitives (look only) ─────────────────────────────────────
const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${MKT.navy}12` };
function DashCard({ children, testid, style }: { children: ReactNode; testid?: string; style?: CSSProperties }) {
  return <div data-testid={testid} style={{ ...cardStyle, padding: '18px 20px', ...style }}>{children}</div>;
}
function navyBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
function ghostBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}33`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}

export default function GameHistory() {
  usePageTitle('Game History');
  const { user } = useMarketplaceAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [flaggingGameId, setFlaggingGameId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();

  const linkedPlayerId = user?.linkedPlayerId;

  const { data: stats, isLoading } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  const { data: myDisputes = [] } = useQuery<ScoreDispute[]>({
    queryKey: ['/api/marketplace/my-disputes'],
    enabled: !!user,
  });

  const flaggedGameIds = useMemo(
    () => new Set(myDisputes.map(d => d.gameResultId)),
    [myDisputes]
  );

  const fileMutation = useMutation({
    mutationFn: ({ gameResultId, note }: { gameResultId: string; note: string }) =>
      apiRequest('POST', `/api/marketplace/game-results/${gameResultId}/dispute`, {
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Dispute Filed', description: "We've notified the admin to review this game." });
      setFlaggingGameId(null);
      setFlagNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-disputes'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to file dispute', variant: 'destructive' });
    },
  });

  const allGames = useMemo(() => {
    const games = stats?.recentGames ?? [];
    return [...games].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [stats]);

  const filteredGames = useMemo(() => {
    if (filter === 'wins') return allGames.filter(g => g.won);
    if (filter === 'losses') return allGames.filter(g => !g.won);
    return allGames;
  }, [allGames, filter]);

  const totalGames = allGames.length;
  const totalWins = allGames.filter(g => g.won).length;
  const totalLosses = totalGames - totalWins;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  const pageWrap = (children: ReactNode) => (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>{children}</div>
  );

  const Header = () => (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 10 }}>
        <History className="h-7 w-7" style={{ color: MKT.teal }} /> Game History
      </h1>
      <p style={{ color: MKT.inkSub, fontSize: 14, marginTop: 4 }}>Your complete record of every game played</p>
    </div>
  );

  if (!linkedPlayerId) {
    return pageWrap(
      <div className="max-w-3xl mx-auto px-4 py-12" data-testid="page-game-history">
        <Header />
        <DashCard style={{ padding: 40, textAlign: 'center' }}>
          <Link2 className="h-12 w-12 mx-auto mb-4" style={{ color: MKT.inkMute }} />
          <h3 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: MKT.navy, marginBottom: 8 }}>No player profile linked</h3>
          <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 24, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
            Link your ShuttleIQ player profile to track your full game history, stats, and skill score progression.
          </p>
          <Link href="/marketplace/profile" style={{ ...navyBtn('md'), textDecoration: 'none' }} data-testid="button-link-profile">Go to Profile to Link</Link>
        </DashCard>
      </div>
    );
  }

  const summaryTiles = [
    { label: 'Total', value: isLoading ? '—' : totalGames, icon: History, color: MKT.navy },
    { label: 'Wins', value: isLoading ? '—' : totalWins, icon: TrendingUp, color: WIN_GREEN },
    { label: 'Losses', value: isLoading ? '—' : totalLosses, icon: TrendingDown, color: LOSS_RED },
    { label: 'Win Rate', value: isLoading ? '—' : `${winRate}%`, icon: Trophy, color: MKT.tealD },
  ];

  return (
    <>
    {pageWrap(
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="page-game-history">
      {/* Header */}
      <Reveal><Header /></Reveal>

      {/* Summary bar */}
      <Reveal>
        <div className="grid grid-cols-4 gap-3" style={{ marginBottom: 24 }}>
          {summaryTiles.map(({ label, value, icon: Icon, color }) => (
            <DashCard key={label} style={{ padding: '14px 10px', textAlign: 'center' }}>
              <Icon className="h-4 w-4 mx-auto mb-1.5" style={{ color }} />
              <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(18px, 3vw, 24px)', color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: MKT.inkSub, marginTop: 4 }}>{label}</div>
            </DashCard>
          ))}
        </div>
      </Reveal>

      {/* Filter tabs — segmented control */}
      <Reveal>
        <div className="flex" style={{ gap: 4, marginBottom: 18, background: 'rgba(0,30,70,0.06)', borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%' }}>
          {(['all', 'wins', 'losses'] as const).map((f) => {
            const active = filter === f;
            const label = f === 'all' ? `All (${totalGames})` : f === 'wins' ? `Wins (${totalWins})` : `Losses (${totalLosses})`;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`filter-${f}`}
                style={{ padding: '8px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? MKT.navy : MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, letterSpacing: '-0.005em', boxShadow: active ? `0 0 0 1px ${MKT.navy}14` : 'none', transition: 'background .25s ease, color .25s ease, box-shadow .25s ease', whiteSpace: 'nowrap' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Game list */}
      {isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-md" style={{ ...cardStyle }}>
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-5 w-8 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12 shrink-0" />
            </div>
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <Reveal>
          <DashCard style={{ padding: '40px 24px', textAlign: 'center' }}>
            <History className="h-10 w-10 mx-auto mb-3" style={{ color: MKT.inkMute }} />
            {totalGames === 0 ? (
              <>
                <p style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy, marginBottom: 6 }}>No games played yet</p>
                <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 20 }}>Book a session and your match history will start filling up here.</p>
                <Link href="/marketplace/book" style={{ ...navyBtn('md'), textDecoration: 'none' }} data-testid="button-browse-sessions">
                  Browse Sessions <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 16 }}>
                  {filter === 'wins' ? 'No wins recorded yet.' : 'No losses recorded yet.'}
                </p>
                <button type="button" onClick={() => setFilter('all')} style={ghostBtn('sm')}>
                  Show all games
                </button>
              </>
            )}
          </DashCard>
        </Reveal>
      ) : (
        <DashCard style={{ padding: 0, overflow: 'hidden' }}>
          {filteredGames.map((game, idx) => {
            const delta = (game.skillScoreAfter ?? 0) - (game.skillScoreBefore ?? 0);
            const opponents = game.opponentNames.join(', ');
            return (
              <Reveal key={game.gameId} delay={reduce ? 0 : Math.min(idx * 0.04, 0.3)}>
                <div
                  className="game-row flex items-center gap-3 px-4 py-3 flex-wrap text-sm"
                  style={{ borderTop: idx === 0 ? 'none' : `1px solid ${MKT.line}`, background: idx % 2 === 0 ? '#fff' : 'rgba(0,30,70,0.02)', transition: 'transform .2s ease, background .2s ease' }}
                  data-testid={`row-game-${game.gameId}`}
                >
                  {/* Date */}
                  <span style={{ color: MKT.inkSub, width: 96, flex: 'none' }}>
                    {format(new Date(game.date), 'MMM d, yyyy')}
                  </span>

                  {/* Result badge */}
                  <span
                    data-testid={`badge-result-${game.gameId}`}
                    style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', background: game.won ? MKT.teal : LOSS_RED }}
                  >
                    {game.won ? 'W' : 'L'}
                  </span>

                  {/* Score */}
                  <span style={{ fontFamily: FF_MONO, fontWeight: 700, color: MKT.ink, flex: 'none' }}>{game.score}</span>

                  {/* Partners & opponents */}
                  <span style={{ color: MKT.inkSub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: MKT.ink, fontWeight: 600 }}>{game.partnerName}</span>
                    {' '}
                    <Users className="h-3 w-3 inline-block mx-0.5" style={{ opacity: 0.5 }} />
                    {' '}
                    <span>{opponents}</span>
                  </span>

                  {/* Skill score delta */}
                  <span
                    style={{ flex: 'none', fontWeight: 700, fontSize: 12, color: delta > 0 ? WIN_GREEN : delta < 0 ? LOSS_RED : MKT.inkSub }}
                    data-testid={`delta-${game.gameId}`}
                  >
                    {delta > 0 ? (
                      <><TrendingUp className="h-3 w-3 inline-block mr-0.5" />+{delta}</>
                    ) : delta < 0 ? (
                      <><TrendingDown className="h-3 w-3 inline-block mr-0.5" />{delta}</>
                    ) : (
                      <><Minus className="h-3 w-3 inline-block mr-0.5" />0</>
                    )}
                  </span>

                  {/* Skill score after */}
                  {game.skillScoreAfter !== undefined && (
                    <span style={{ color: MKT.inkSub, fontSize: 12, flex: 'none' }}>
                      → {game.skillScoreAfter}
                    </span>
                  )}

                  {/* Flag button or Flagged badge */}
                  {flaggedGameIds.has(game.gameId) ? (
                    <span
                      style={{ flex: 'none', fontSize: 11, color: MKT.inkSub, border: `1px solid ${MKT.navy}22`, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      data-testid={`badge-flagged-${game.gameId}`}
                    >
                      <Flag className="h-3 w-3" /> Flagged
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setFlaggingGameId(game.gameId); setFlagNote(''); }}
                      title="Flag incorrect score"
                      data-testid={`button-flag-game-${game.gameId}`}
                      style={{ flex: 'none', background: 'transparent', border: 'none', padding: 8, cursor: 'pointer', color: 'rgba(0,30,70,0.4)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Reveal>
            );
          })}
        </DashCard>
      )}
    </div>
    )}

    {/* Flag / Dispute Dialog */}
    <Dialog open={!!flaggingGameId} onOpenChange={(open) => { if (!open) setFlaggingGameId(null); }}>
      <DialogContent data-testid="dialog-flag-game">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" style={{ color: MKT.amber }} /> Flag Incorrect Score
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Tell us what was wrong with this score. An admin will review and correct it if needed.
          </p>
          <Textarea
            placeholder="e.g. The score was 21-15, not 21-12."
            value={flagNote}
            onChange={(e) => setFlagNote(e.target.value)}
            maxLength={500}
            rows={3}
            data-testid="textarea-flag-note"
          />
          <p className="text-xs text-muted-foreground text-right">{flagNote.length}/500</p>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => setFlaggingGameId(null)} data-testid="button-flag-cancel" style={ghostBtn('md')}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (flaggingGameId) fileMutation.mutate({ gameResultId: flaggingGameId, note: flagNote }); }}
            disabled={fileMutation.isPending}
            data-testid="button-flag-submit"
            style={{ ...navyBtn('md'), opacity: fileMutation.isPending ? 0.6 : 1 }}
          >
            {fileMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <style>{`
      @media (hover: hover) {
        .game-row:hover { transform: translateY(-2px); background: rgba(0,107,95,0.05) !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .game-row { transition: none !important; }
        .game-row:hover { transform: none; }
      }
    `}</style>
    </>
  );
}
