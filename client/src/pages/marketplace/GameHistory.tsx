import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { History, Link2, Users, TrendingUp, TrendingDown, Minus, Trophy, Flag } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { PlayerStats, ScoreDispute } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.05 } } };

type Filter = 'all' | 'wins' | 'losses';

export default function GameHistory() {
  const { user } = useMarketplaceAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [flaggingGameId, setFlaggingGameId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  if (!linkedPlayerId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12" data-testid="page-game-history">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-secondary" /> Game History
          </h1>
          <p className="text-muted-foreground mt-1">Your complete record of every game played</p>
        </div>
        <Card>
          <CardContent className="p-10 text-center">
            <Link2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No player profile linked</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Link your ShuttleIQ player profile to track your full game history,
              stats, and skill score progression.
            </p>
            <Link href="/marketplace/profile">
              <Button data-testid="button-link-profile">Go to Profile to Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="page-game-history">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        {/* Header */}
        <motion.div variants={fadeInUp} className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-secondary" /> Game History
          </h1>
          <p className="text-muted-foreground mt-1">Your complete record of every game played</p>
        </motion.div>

        {/* Summary bar */}
        <motion.div variants={fadeInUp} className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: isLoading ? '—' : totalGames, icon: History, color: 'text-foreground' },
            { label: 'Wins', value: isLoading ? '—' : totalWins, icon: TrendingUp, color: 'text-green-600' },
            { label: 'Losses', value: isLoading ? '—' : totalLosses, icon: TrendingDown, color: 'text-destructive' },
            { label: 'Win Rate', value: isLoading ? '—' : `${winRate}%`, icon: Trophy, color: 'text-secondary' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Filter tabs */}
        <motion.div variants={fadeInUp} className="flex gap-1 mb-4 border-b pb-2">
          {(['all', 'wins', 'losses'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'ghost'}
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
              className="capitalize"
            >
              {f === 'all' ? `All (${totalGames})` : f === 'wins' ? `Wins (${totalWins})` : `Losses (${totalLosses})`}
            </Button>
          ))}
        </motion.div>

        {/* Game list */}
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-md border bg-card">
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-5 w-8 shrink-0" />
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-12 shrink-0" />
              </div>
            ))}
          </div>
        ) : filteredGames.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === 'wins'
                  ? 'No wins recorded yet.'
                  : filter === 'losses'
                  ? 'No losses recorded yet.'
                  : 'No games played yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <motion.div variants={fadeInUp} className="rounded-md border bg-card overflow-hidden divide-y">
            {filteredGames.map((game, idx) => {
              const delta = (game.skillScoreAfter ?? 0) - (game.skillScoreBefore ?? 0);
              const opponents = game.opponentNames.join(', ');
              return (
                <div
                  key={game.gameId}
                  className={`flex items-center gap-3 px-4 py-3 flex-wrap text-sm hover-elevate ${idx % 2 === 0 ? '' : 'bg-muted/30'}`}
                  data-testid={`row-game-${game.gameId}`}
                >
                  {/* Date */}
                  <span className="text-muted-foreground shrink-0 w-24">
                    {format(new Date(game.date), 'MMM d, yyyy')}
                  </span>

                  {/* Result badge */}
                  {game.won ? (
                    <Badge className="bg-green-600 dark:bg-green-700 shrink-0" data-testid={`badge-result-${game.gameId}`}>W</Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0" data-testid={`badge-result-${game.gameId}`}>L</Badge>
                  )}

                  {/* Score */}
                  <span className="font-mono font-semibold shrink-0">{game.score}</span>

                  {/* Partners & opponents */}
                  <span className="text-muted-foreground flex-1 min-w-0 truncate">
                    <span className="text-foreground font-medium">{game.partnerName}</span>
                    {' '}
                    <Users className="h-3 w-3 inline-block mx-0.5 opacity-50" />
                    {' '}
                    <span>{opponents}</span>
                  </span>

                  {/* Skill score delta */}
                  <span
                    className={`shrink-0 font-semibold text-xs ${
                      delta > 0 ? 'text-green-600' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
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
                    <span className="text-muted-foreground text-xs shrink-0">
                      → {game.skillScoreAfter}
                    </span>
                  )}

                  {/* Flag button or Flagged badge */}
                  {flaggedGameIds.has(game.gameId) ? (
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0 text-muted-foreground border-muted-foreground/30 no-default-hover-elevate no-default-active-elevate"
                      data-testid={`badge-flagged-${game.gameId}`}
                    >
                      <Flag className="h-3 w-3 mr-1" /> Flagged
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground/50"
                      onClick={() => { setFlaggingGameId(game.gameId); setFlagNote(''); }}
                      title="Flag incorrect score"
                      data-testid={`button-flag-game-${game.gameId}`}
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    </div>

    {/* Flag / Dispute Dialog */}
    <Dialog open={!!flaggingGameId} onOpenChange={(open) => { if (!open) setFlaggingGameId(null); }}>
      <DialogContent data-testid="dialog-flag-game">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-amber-500" /> Flag Incorrect Score
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
          <Button variant="outline" onClick={() => setFlaggingGameId(null)} data-testid="button-flag-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => { if (flaggingGameId) fileMutation.mutate({ gameResultId: flaggingGameId, note: flagNote }); }}
            disabled={fileMutation.isPending}
            data-testid="button-flag-submit"
          >
            {fileMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
