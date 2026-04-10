import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LogOut, Users, FileDown, FolderKanban, Trophy, Lightbulb, Check, X, ThumbsUp } from 'lucide-react';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';
import { Leaderboard } from '@/components/Leaderboard';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Player, TagSuggestionWithVote } from '@shared/schema';
import { format } from 'date-fns';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

const CATEGORY_LABEL: Record<string, string> = {
  playing_style: 'Playing Style',
  social: 'Social',
  reputation: 'Reputation',
};

function TagSuggestionsPanel() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: suggestions = [], isLoading } = useQuery<TagSuggestionWithVote[]>({
    queryKey: ['/api/admin/tags/suggestions', statusFilter],
    queryFn: () =>
      apiRequest<TagSuggestionWithVote[]>('GET', `/api/admin/tags/suggestions?status=${statusFilter}`),
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiRequest('POST', `/api/admin/tags/suggestions/${id}/approve`, { adminNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags/suggestions'] });
      toast({ title: 'Suggestion approved' });
    },
    onError: () => toast({ title: 'Failed to approve', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiRequest('POST', `/api/admin/tags/suggestions/${id}/reject`, { adminNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags/suggestions'] });
      toast({ title: 'Suggestion rejected' });
    },
    onError: () => toast({ title: 'Failed to reject', variant: 'destructive' }),
  });

  const pendingCount = statusFilter === 'pending' ? suggestions.length : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
            data-testid={`button-filter-${s}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount !== undefined && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 no-default-hover-elevate no-default-active-elevate">{pendingCount}</Badge>
            )}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Loading...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No {statusFilter} suggestions.</p>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <div key={s.id} className="border rounded-md p-4 space-y-3" data-testid={`card-suggestion-${s.id}`}>
              <div className="flex items-start gap-3">
                <div className="text-2xl shrink-0">{s.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{s.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs no-default-hover-elevate no-default-active-elevate ${CATEGORY_COLOR[s.category] ?? ''}`}
                    >
                      {CATEGORY_LABEL[s.category] ?? s.category}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ThumbsUp className="h-3 w-3" /> {s.voteCount}
                    </span>
                  </div>
                  {s.reason && <p className="text-sm text-muted-foreground mt-1">{s.reason}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested by {s.suggestedByPlayerName} &middot; {format(new Date(s.createdAt), 'dd MMM yyyy')}
                  </p>
                  {s.adminNote && (
                    <p className="text-xs text-muted-foreground mt-1 italic">Admin note: {s.adminNote}</p>
                  )}
                </div>
              </div>

              {statusFilter === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Optional admin note..."
                    value={notes[s.id] ?? ''}
                    onChange={e => setNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                    className="flex-1 h-8 text-sm min-w-40"
                    data-testid={`input-admin-note-${s.id}`}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ id: s.id, note: notes[s.id] })}
                    data-testid={`button-approve-${s.id}`}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate({ id: s.id, note: notes[s.id] })}
                    data-testid={`button-reject-${s.id}`}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('players');

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ playerId, updates }: { playerId: string; updates: Partial<Player> }) => {
      return await apiRequest('PATCH', `/api/players/${playerId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return await apiRequest('DELETE', `/api/players/${playerId}`, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
    },
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/admin/login');
    }
  };

  const handleResetStats = () => {
    players.forEach((player) => {
      updatePlayerMutation.mutate({
        playerId: player.id,
        updates: { gamesPlayed: 0, wins: 0 },
      });
    });
    toast({
      title: "Stats reset",
      description: "All player statistics have been reset",
    });
  };

  const handleClearAllPlayers = () => {
    const playingPlayers = players.filter((p) => p.status === 'playing');
    if (playingPlayers.length > 0) {
      toast({
        title: "Cannot clear players",
        description: "Cannot clear while games are in progress",
        variant: "destructive",
      });
      return;
    }
    players.forEach((player) => {
      deletePlayerMutation.mutate(player.id);
    });
    toast({
      title: "Players cleared",
      description: "All players have been removed",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ShuttleIQ Admin</h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin/players')}
              data-testid="button-players-registry"
            >
              <Users className="w-4 h-4 mr-2" />
              Players
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin/sessions')}
              data-testid="button-sessions"
            >
              <FolderKanban className="w-4 h-4 mr-2" />
              Sessions
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Manage players and export game data
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 max-w-2xl mb-8">
            <TabsTrigger value="players" data-testid="tab-players">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">
              <Trophy className="w-4 h-4 mr-2" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="tags" data-testid="tab-tags">
              <Lightbulb className="w-4 h-4 mr-2" />
              Tag Ideas
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <FileDown className="w-4 h-4 mr-2" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Player Import</CardTitle>
                <CardDescription>
                  Import player data from CSV files or copy-paste from Excel.
                  Players can be imported before or after creating sessions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerImport />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard" className="space-y-6">
            <Leaderboard
              players={players}
              onResetStats={handleResetStats}
              onClearAllPlayers={handleClearAllPlayers}
            />
          </TabsContent>

          <TabsContent value="tags" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Community Tag Suggestions</CardTitle>
                <CardDescription>
                  Review player-submitted tag ideas. Approve tags to add them to the live catalog, or reject with an optional note.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TagSuggestionsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Game History Export</CardTitle>
                <CardDescription>
                  Download game scores and statistics from any session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GameHistoryExport />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
