import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Link2, Search, Check, Trophy } from 'lucide-react';

interface PlayerSearchResult {
  id: string;
  name: string;
  shuttleIqId: string;
  level: string;
  skillScore: number;
}

export default function Profile() {
  const { user } = useMarketplaceAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const results = await apiRequest<PlayerSearchResult[]>('GET', `/api/marketplace/search-players?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(results);
    } catch {
      toast({ title: 'Search failed', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const linkMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest('POST', '/api/marketplace/link-player', { playerId });
    },
    onSuccess: () => {
      toast({ title: 'Player linked!' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      setSearchResults([]);
      setSearchQuery('');
    },
    onError: (error: any) => {
      toast({ title: 'Link failed', description: error.error, variant: 'destructive' });
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">Profile</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium" data-testid="text-user-name">{user?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium" data-testid="text-user-email">{user?.email}</span>
            </div>
            {user?.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{user.phone}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" /> ShuttleIQ Player Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user?.linkedPlayer ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50">
                  <div>
                    <div className="font-medium" data-testid="text-linked-player-name">{user.linkedPlayer.name}</div>
                    <div className="text-sm text-muted-foreground">{user.linkedPlayer.shuttleIqId}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{user.linkedPlayer.skillScore}</div>
                    <Badge variant="secondary" className="text-xs">{user.linkedPlayer.level}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="h-4 w-4" /> Linked
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Link your account to a ShuttleIQ player profile to view your scores, rankings, and match history.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or ShuttleIQ ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    data-testid="input-player-search"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSearch}
                    disabled={searching || searchQuery.length < 2}
                    data-testid="button-search-player"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-2 p-3 rounded-md border"
                        data-testid={`row-search-result-${player.id}`}
                      >
                        <div>
                          <div className="font-medium">{player.name}</div>
                          <div className="text-xs text-muted-foreground">{player.shuttleIqId}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{player.level}</Badge>
                          <Button
                            size="sm"
                            onClick={() => linkMutation.mutate(player.id)}
                            disabled={linkMutation.isPending}
                            data-testid={`button-link-${player.id}`}
                          >
                            Link
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
