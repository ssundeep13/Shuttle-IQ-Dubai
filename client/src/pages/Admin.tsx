import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, FileDown, FolderKanban, Trophy } from 'lucide-react';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';
import { Leaderboard } from '@/components/Leaderboard';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Player } from '@shared/schema';

export default function Admin() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('players');

  // Fetch all players for leaderboard
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  // Mutations for leaderboard actions
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
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleResetStats = () => {
    // Reset stats for all players
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
          <TabsList className="grid w-full grid-cols-3 max-w-2xl mb-8">
            <TabsTrigger value="players" data-testid="tab-players">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">
              <Trophy className="w-4 h-4 mr-2" />
              Leaderboard
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
