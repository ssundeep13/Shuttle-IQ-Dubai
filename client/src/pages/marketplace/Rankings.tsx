import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Player } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.05 } },
};

const levelColor = (level: string) => {
  switch (level) {
    case 'Professional': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    case 'Advanced': return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
    case 'Intermediate': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    case 'Beginner': return 'bg-green-500/10 text-green-700 border-green-500/20';
    default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
  }
};

const podiumColors = [
  { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-600', medal: 'text-yellow-500' },
  { bg: 'bg-gray-200/50', border: 'border-gray-300/50', text: 'text-gray-500', medal: 'text-gray-400' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600', medal: 'text-amber-600' },
];

export default function Rankings() {
  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const ranked = (players || [])
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => b.skillScore - a.skillScore);

  const topThree = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Trophy className="h-6 w-6 text-secondary" /> Rankings
          </h1>
          <p className="text-muted-foreground mt-1">Global ShuttleIQ player leaderboard</p>
        </motion.div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : ranked.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No ranked players yet</h3>
              <p className="text-sm text-muted-foreground">Players need to complete games to appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {topThree.length > 0 && (
              <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3 mb-8">
                {[1, 0, 2].map((podiumIdx) => {
                  const player = topThree[podiumIdx];
                  if (!player) return <div key={podiumIdx} />;
                  const colors = podiumColors[podiumIdx];
                  const rank = podiumIdx + 1;
                  return (
                    <motion.div key={player.id} variants={fadeInUp}>
                      <Card
                        className={`text-center border ${colors.border} ${podiumIdx === 0 ? 'md:-mt-4' : ''}`}
                        data-testid={`card-podium-${player.id}`}
                      >
                        <CardContent className="p-4">
                          <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center mx-auto mb-2`}>
                            <Medal className={`h-5 w-5 ${colors.medal}`} />
                          </div>
                          <div className={`text-xs font-bold ${colors.text} mb-1`}>#{rank}</div>
                          <p className="font-semibold text-sm truncate" data-testid={`text-player-name-${player.id}`}>
                            {player.name}
                          </p>
                          <p className="text-2xl font-extrabold mt-1" data-testid={`text-player-score-${player.id}`}>
                            {player.skillScore}
                          </p>
                          <Badge variant="outline" className={`text-xs mt-2 ${levelColor(player.level)}`}>
                            {player.level}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {player.wins}W / {player.gamesPlayed - player.wins}L
                            <span className="ml-1">({player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}%)</span>
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {rest.length > 0 && (
              <motion.div variants={fadeInUp}>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {rest.map((player, index) => (
                        <motion.div
                          key={player.id}
                          variants={fadeInUp}
                          className="flex items-center gap-3 px-4 py-3"
                          data-testid={`row-player-${player.id}`}
                        >
                          <div className="w-8 text-center shrink-0">
                            <span className="text-sm text-muted-foreground font-medium">{index + 4}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate" data-testid={`text-player-name-${player.id}`}>
                              {player.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{player.shuttleIqId}</div>
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <div className="font-semibold" data-testid={`text-player-score-${player.id}`}>
                              {player.skillScore}
                            </div>
                            <Badge variant="outline" className={`text-xs ${levelColor(player.level)}`}>
                              {player.level}
                            </Badge>
                          </div>
                          <div className="text-right shrink-0 text-sm text-muted-foreground w-20">
                            <div>{player.wins}W / {player.gamesPlayed - player.wins}L</div>
                            <div>{player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}%</div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
