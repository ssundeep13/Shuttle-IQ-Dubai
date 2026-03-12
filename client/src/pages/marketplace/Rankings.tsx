import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal } from 'lucide-react';
import type { Player } from '@shared/schema';

export default function Rankings() {
  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const ranked = (players || [])
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => b.skillScore - a.skillScore);

  const levelColor = (level: string) => {
    switch (level) {
      case 'Professional': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'Advanced': return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      case 'Intermediate': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'Beginner': return 'bg-green-500/10 text-green-700 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Trophy className="h-6 w-6 text-secondary" /> Rankings
        </h1>
        <p className="text-muted-foreground mt-1">Global ShuttleIQ player leaderboard</p>
      </div>

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
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {ranked.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-4 py-3"
                  data-testid={`row-player-${player.id}`}
                >
                  <div className="w-8 text-center shrink-0">
                    {index < 3 ? (
                      <Medal className={`h-5 w-5 mx-auto ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-amber-600'}`} />
                    ) : (
                      <span className="text-sm text-muted-foreground font-medium">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" data-testid={`text-player-name-${player.id}`}>
                      {player.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {player.shuttleIqId}
                    </div>
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
