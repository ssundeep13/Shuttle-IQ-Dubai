import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Link2, Search, Check, Mail, Phone, LogOut } from 'lucide-react';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { motion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

interface PlayerSearchResult {
  id: string;
  name: string;
  shuttleIqId: string;
  level: string;
  skillScore: number;
}

export default function Profile() {
  usePageTitle('Profile');
  const { user, logout } = useMarketplaceAuth();
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
    } catch (err) {
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
    onError: (error: Error) => {
      toast({ title: 'Link failed', description: error.message, variant: 'destructive' });
    },
  });

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile</h1>
        </motion.div>

        <motion.div variants={fadeInUp} className="flex items-center gap-4 mb-8">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-profile-name">{user?.name}</h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {user?.linkedPlayer && (
              <Badge variant="secondary" className="mt-1 text-xs">{getTierDisplayName(user.linkedPlayer.level)}</Badge>
            )}
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-secondary" /> Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="text-sm font-medium" data-testid="text-user-name">{user?.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="text-sm font-medium" data-testid="text-user-email">{user?.email}</div>
                  </div>
                </div>
                {user?.phone && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="text-sm font-medium">{user.phone}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-secondary" /> ShuttleIQ Player Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                {user?.linkedPlayer ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-secondary/20 text-secondary font-semibold text-sm">
                            {user.linkedPlayer.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium" data-testid="text-linked-player-name">{user.linkedPlayer.name}</div>
                          <div className="text-xs text-muted-foreground">{user.linkedPlayer.shuttleIqId}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">{user.linkedPlayer.skillScore}</div>
                        <Badge variant="secondary" className="text-xs">{getTierDisplayName(user.linkedPlayer.level)}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <Check className="h-4 w-4" /> Linked
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Link your account to your ShuttleIQ player profile to unlock your scores, rankings, and match history.
                    </p>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">What's a ShuttleIQ ID?</span> It's a unique code (e.g. SIQ-00081) assigned to you by your session organiser. Ask them if you don't have one yet — they can look it up in the admin dashboard.
                    </div>
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
                            className="flex items-center justify-between gap-2 p-3 rounded-lg border hover-elevate"
                            data-testid={`row-search-result-${player.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-muted font-medium">
                                  {player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{player.name}</div>
                                <div className="text-xs text-muted-foreground">{player.shuttleIqId}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{getTierDisplayName(player.level)}</Badge>
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
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <LogOut className="h-4 w-4 text-secondary" /> Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Sign out of your ShuttleIQ account on this device.
                </p>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={logout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
