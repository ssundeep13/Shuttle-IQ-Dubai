import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CourtWithPlayers, Player, Notification, AppStats } from "@shared/schema";
import { Header } from "@/components/Header";
import { TabNavigation } from "@/components/TabNavigation";
import { CourtManagement } from "@/components/CourtManagement";
import { PlayerQueue } from "@/components/PlayerQueue";
import { Leaderboard } from "@/components/Leaderboard";
import { AddPlayerModal } from "@/components/AddPlayerModal";
import { NotificationToast } from "@/components/NotificationToast";
import { queryClient, apiRequest } from "@/lib/queryClient";

type TabType = 'courts' | 'queue' | 'leaderboard';

export default function Home() {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('courts');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch courts with players
  const { data: courts = [], isLoading: courtsLoading } = useQuery<CourtWithPlayers[]>({
    queryKey: ['/api/courts'],
  });

  // Fetch players
  const { data: players = [], isLoading: playersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  // Fetch queue
  const { data: queue = [], isLoading: queueLoading } = useQuery<string[]>({
    queryKey: ['/api/queue'],
  });

  // Fetch stats
  const { data: stats } = useQuery<AppStats>({
    queryKey: ['/api/stats'],
  });

  // Timer countdown (update court time remaining every minute)
  useEffect(() => {
    const timer = setInterval(() => {
      courts.forEach((court) => {
        if (court.status === 'occupied' && court.timeRemaining > 0) {
          const newTime = court.timeRemaining - 1;
          if (newTime === 0) {
            addNotification(`Time's up for ${court.name}!`, 'warning');
          }
          // Update court time remaining
          updateCourtMutation.mutate({ 
            courtId: court.id, 
            updates: { timeRemaining: newTime } 
          });
        }
      });
    }, 60000); // 1 minute

    return () => clearInterval(timer);
  }, [courts]);

  const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
  };

  const dismissNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Mutations
  const addCourtMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest('POST', '/api/courts', { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      addNotification(`Court added`, 'success');
    },
    onError: () => {
      addNotification('Failed to add court', 'danger');
    },
  });

  const removeCourtMutation = useMutation({
    mutationFn: async (courtId: string) => {
      return await apiRequest('DELETE', `/api/courts/${courtId}`, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      addNotification('Court removed', 'info');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to remove court';
      addNotification(message, 'danger');
    },
  });

  const addPlayerMutation = useMutation({
    mutationFn: async ({ name, level }: { name: string; level: string }) => {
      return await apiRequest('POST', '/api/players', { name, level, gamesPlayed: 0, wins: 0, status: 'waiting' });
    },
    onSuccess: (data: Player) => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      addNotification(`${data.name} added to queue`, 'success');
    },
    onError: () => {
      addNotification('Failed to add player', 'danger');
    },
  });

  const updateCourtMutation = useMutation({
    mutationFn: async ({ courtId, updates }: { courtId: string; updates: Partial<CourtWithPlayers> }) => {
      return await apiRequest('PATCH', `/api/courts/${courtId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to update court';
      addNotification(message, 'danger');
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ playerId, updates }: { playerId: string; updates: Partial<Player> }) => {
      return await apiRequest('PATCH', `/api/players/${playerId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to update player';
      addNotification(message, 'danger');
    },
  });

  const assignPlayersMutation = useMutation({
    mutationFn: async ({ courtId, playerIds }: { courtId: string; playerIds: string[] }) => {
      return await apiRequest('POST', `/api/courts/${courtId}/assign`, { playerIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setSelectedPlayers([]);
      addNotification(`Players assigned to court`, 'success');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to assign players';
      addNotification(message, 'danger');
    },
  });

  const endGameMutation = useMutation({
    mutationFn: async ({ courtId, winningTeam }: { courtId: string; winningTeam: number }) => {
      return await apiRequest('POST', `/api/courts/${courtId}/end-game`, { winningTeam });
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      addNotification(`Game ended. Team ${variables.winningTeam} wins!`, 'success');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to end game';
      addNotification(message, 'danger');
    },
  });

  const updateQueueMutation = useMutation({
    mutationFn: async (playerIds: string[]) => {
      return await apiRequest('PUT', '/api/queue', { playerIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to update queue';
      addNotification(message, 'danger');
    },
  });

  const removeFromQueueMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return await apiRequest('DELETE', `/api/queue/${playerId}`, null);
    },
    onSuccess: (_, playerId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setSelectedPlayers((prev) => prev.filter((id) => id !== playerId));
      addNotification('Player removed from queue', 'info');
    },
    onError: () => {
      addNotification('Failed to remove player from queue', 'danger');
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
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to delete player';
      addNotification(message, 'danger');
    },
  });

  // Handlers
  const handleAddCourt = () => {
    addCourtMutation.mutate(`Court ${courts.length + 1}`);
  };

  const handleRemoveCourt = (courtId: string) => {
    removeCourtMutation.mutate(courtId);
  };

  const handleAddPlayer = (name: string, level: string) => {
    addPlayerMutation.mutate({ name, level });
  };

  const handleTogglePlayerSelection = (playerId: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      } else {
        if (prev.length >= 4) {
          addNotification('Maximum 4 players can be selected', 'warning');
          return prev;
        }
        return [...prev, playerId];
      }
    });
  };

  const handleAssignPlayers = (courtId: string) => {
    if (selectedPlayers.length < 2) {
      addNotification('Select at least 2 players', 'warning');
      return;
    }
    assignPlayersMutation.mutate({ courtId, playerIds: selectedPlayers });
  };

  const handleAutoAssign = () => {
    const availableCourt = courts.find((c) => c.status === 'available');
    const waitingPlayers = queue.slice(0, 4);

    if (!availableCourt || waitingPlayers.length < 2) {
      addNotification('Need at least 2 players and an available court', 'warning');
      return;
    }

    assignPlayersMutation.mutate({ courtId: availableCourt.id, playerIds: waitingPlayers });
  };

  const handleSelectWinningTeam = (courtId: string, teamNumber: number) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;

    const newWinningTeam = court.winningTeam === teamNumber ? null : teamNumber;
    updateCourtMutation.mutate({ courtId, updates: { winningTeam: newWinningTeam } });
  };

  const handleEndGame = (courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court || court.winningTeam === null) {
      addNotification('Please select a winning team', 'warning');
      return;
    }
    endGameMutation.mutate({ courtId, winningTeam: court.winningTeam });
  };

  const handleRemoveFromQueue = (playerId: string) => {
    removeFromQueueMutation.mutate(playerId);
  };

  const handleClearQueue = () => {
    updateQueueMutation.mutate([]);
    setSelectedPlayers([]);
    addNotification('Queue cleared', 'success');
  };

  const handleResetStats = () => {
    // Reset stats for all players
    players.forEach((player) => {
      updatePlayerMutation.mutate({
        playerId: player.id,
        updates: { gamesPlayed: 0, wins: 0 },
      });
    });
    addNotification('Stats reset', 'success');
  };

  const handleClearAllPlayers = () => {
    const playingPlayers = players.filter((p) => p.status === 'playing');
    if (playingPlayers.length > 0) {
      addNotification('Cannot clear while games in progress', 'danger');
      return;
    }
    players.forEach((player) => {
      deletePlayerMutation.mutate(player.id);
    });
    setSelectedPlayers([]);
    addNotification('All players cleared', 'success');
  };

  const queuePlayers = queue
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  const defaultStats: AppStats = {
    activePlayers: 0,
    inQueue: 0,
    availableCourts: 0,
    occupiedCourts: 0,
    totalPlayers: 0,
    totalCourts: 0,
  };

  const isLoading = courtsLoading || playersLoading || queueLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading ShuttleIQ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <Header 
          stats={stats || defaultStats} 
          onAddPlayer={() => setShowAddPlayer(true)} 
          onAutoAssign={handleAutoAssign} 
        />
        <TabNavigation
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedPlayers([]);
          }}
        />

        {activeTab === 'courts' && (
          <CourtManagement
            courts={courts}
            queuePlayers={queuePlayers}
            selectedPlayers={selectedPlayers}
            onAddCourt={handleAddCourt}
            onRemoveCourt={handleRemoveCourt}
            onTogglePlayerSelection={handleTogglePlayerSelection}
            onAssignPlayers={handleAssignPlayers}
            onSelectWinningTeam={handleSelectWinningTeam}
            onEndGame={handleEndGame}
          />
        )}

        {activeTab === 'queue' && (
          <PlayerQueue
            players={players}
            queuePlayerIds={queue}
            onAddPlayer={() => setShowAddPlayer(true)}
            onRemoveFromQueue={handleRemoveFromQueue}
            onClearQueue={handleClearQueue}
          />
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard
            players={players}
            onResetStats={handleResetStats}
            onClearAllPlayers={handleClearAllPlayers}
          />
        )}
      </div>

      <AddPlayerModal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        onAddPlayer={handleAddPlayer}
      />

      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
