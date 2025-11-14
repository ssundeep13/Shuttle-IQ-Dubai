import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CourtWithPlayers, Player, Notification, AppStats } from "@shared/schema";
import { Header } from "@/components/Header";
import { TabNavigation } from "@/components/TabNavigation";
import { CourtManagement } from "@/components/CourtManagement";
import { PlayerQueue } from "@/components/PlayerQueue";
import { GameHistory } from "@/components/GameHistory";
import { AddPlayerModal } from "@/components/AddPlayerModal";
import { ImportPlayersModal } from "@/components/ImportPlayersModal";
import { EndGameModal } from "@/components/EndGameModal";
import { AutoAssignConfirmDialog } from "@/components/AutoAssignConfirmDialog";
import { NotificationToast } from "@/components/NotificationToast";
import { SessionSetupWizard } from "@/components/SessionSetupWizard";
import { SessionLeaderboard } from "@/components/SessionLeaderboard";
import { useActiveSession } from "@/hooks/use-active-session";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TabType = 'courts' | 'queue' | 'history' | 'leaderboard';

export default function Home() {
  const [, navigate] = useLocation();
  const { isAuthenticated, logout } = useAuth();
  
  // Check for active session
  const { session, hasSession, isLoading: sessionLoading } = useActiveSession();

  const [teamAssignments, setTeamAssignments] = useState<Record<string, { team1: string[]; team2: string[] }>>({});
  const [activeTab, setActiveTab] = useState<TabType>('courts');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showImportPlayers, setShowImportPlayers] = useState(false);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [endingCourtId, setEndingCourtId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showAutoAssignConfirm, setShowAutoAssignConfirm] = useState(false);
  const [autoAssignData, setAutoAssignData] = useState<{
    courtId: string;
    courtName: string;
    team1: Player[];
    team2: Player[];
    team1Avg: number;
    team2Avg: number;
    skillGap: number;
    allCombinations: Array<{
      team1: Player[];
      team2: Player[];
      team1Avg: number;
      team2Avg: number;
      skillGap: number;
      rank: number;
    }>;
    restWarnings: string[];
    currentCombinationIndex: number;
  } | null>(null);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);

  // Fetch courts with players (only when session exists)
  const { data: courts = [], isLoading: courtsLoading } = useQuery<CourtWithPlayers[]>({
    queryKey: ['/api/courts'],
    enabled: hasSession,
  });

  // Fetch players (only when session exists)
  const { data: players = [], isLoading: playersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
    enabled: hasSession,
  });

  // Fetch queue (only when session exists)
  const { data: queue = [], isLoading: queueLoading } = useQuery<string[]>({
    queryKey: ['/api/queue'],
    enabled: hasSession,
  });

  // Fetch stats (only when session exists)
  const { data: stats } = useQuery<AppStats>({
    queryKey: ['/api/stats'],
    enabled: hasSession,
  });

  // Fetch game history (only when session exists)
  const { data: gameHistory = [] } = useQuery<any[]>({
    queryKey: ['/api/game-history'],
    enabled: hasSession,
  });

  // Timer countdown (update court time remaining every minute) - only when session exists
  useEffect(() => {
    if (!hasSession) return;
    
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
  }, [courts, hasSession]);

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
    mutationFn: async ({ name, gender, level }: { name: string; gender: string; level: string }) => {
      return await apiRequest('POST', '/api/players', { name, gender, level, gamesPlayed: 0, wins: 0, status: 'waiting' });
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
    mutationFn: async ({ courtId, teamAssignments }: { courtId: string; teamAssignments: { playerId: string; team: number }[] }) => {
      return await apiRequest('POST', `/api/courts/${courtId}/assign`, { teamAssignments });
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setTeamAssignments((prev) => {
        const newState = { ...prev };
        delete newState[variables.courtId];
        return newState;
      });
      addNotification(`Players assigned to court`, 'success');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to assign players';
      addNotification(message, 'danger');
    },
  });

  const endGameMutation = useMutation({
    mutationFn: async ({ courtId, winningTeam, team1Score, team2Score }: { 
      courtId: string; 
      winningTeam: number;
      team1Score: number;
      team2Score: number;
    }) => {
      return await apiRequest('POST', `/api/courts/${courtId}/end-game`, { 
        winningTeam, 
        team1Score, 
        team2Score 
      });
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
      addNotification(
        `Game ended! Team ${variables.winningTeam} wins ${variables.team1Score}-${variables.team2Score}`, 
        'success'
      );
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to end game';
      addNotification(message, 'danger');
    },
  });

  const cancelGameMutation = useMutation({
    mutationFn: async (courtId: string) => {
      return await apiRequest('POST', `/api/courts/${courtId}/cancel-game`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      addNotification('Game canceled and players returned to queue', 'info');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to cancel game';
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
      setTeamAssignments((prev) => {
        const newState = { ...prev };
        Object.keys(newState).forEach(courtId => {
          newState[courtId].team1 = newState[courtId].team1.filter(id => id !== playerId);
          newState[courtId].team2 = newState[courtId].team2.filter(id => id !== playerId);
        });
        return newState;
      });
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

  const resetGamesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/game-history', null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setTeamAssignments({}); // Clear any pending team assignments
      addNotification('All games, stats, and courts have been reset', 'success');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to reset games';
      addNotification(message, 'danger');
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return await apiRequest('POST', `/api/sessions/${sessionId}/end`, null);
    },
    onSuccess: async (_, sessionId) => {
      // Download CSV export before invalidating
      try {
        const response = await fetch(`/api/sessions/${sessionId}/game-history`);
        if (response.ok) {
          const games = await response.json();
          if (games.length > 0) {
            // Generate CSV
            const header = 'Game #,Date,Team 1 Players,Team 2 Players,Score,Winning Team\n';
            const rows = games.map((game: any, index: number) => {
              const team1Players = game.team1_players.map((p: any) => p.name).join(' & ');
              const team2Players = game.team2_players.map((p: any) => p.name).join(' & ');
              const score = `${game.team1_score}-${game.team2_score}`;
              const winner = game.winning_team === 1 ? 'Team 1' : 'Team 2';
              const date = new Date(game.created_at).toLocaleString();
              
              // Escape quotes and wrap in quotes if contains comma or quote
              const escape = (str: string) => {
                if (str.includes(',') || str.includes('"')) {
                  return `"${str.replace(/"/g, '""')}"`;
                }
                return `"${str}"`;
              };
              
              return `${index + 1},${escape(date)},${escape(team1Players)},${escape(team2Players)},${escape(score)},${escape(winner)}`;
            }).join('\n');
            
            const csv = '\uFEFF' + header + rows; // Add BOM for Excel compatibility
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `game-history-${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
          }
        }
      } catch (error) {
        console.error('Failed to download CSV:', error);
      }

      // Invalidate all session-scoped queries
      await queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
      
      setTeamAssignments({});
      setShowEndSessionConfirm(false);
      addNotification('Session ended successfully', 'success');
    },
    onError: (error: any) => {
      const message = error?.error || error?.message || 'Failed to end session';
      addNotification(message, 'danger');
      setShowEndSessionConfirm(false);
    },
  });

  // Handlers
  const handleAddCourt = () => {
    addCourtMutation.mutate(`Court ${courts.length + 1}`);
  };

  const handleRemoveCourt = (courtId: string) => {
    removeCourtMutation.mutate(courtId);
  };

  const handleAddPlayer = (name: string, gender: string, level: string) => {
    addPlayerMutation.mutate({ name, gender, level });
  };

  const handleTogglePlayerSelection = (courtId: string, playerId: string, team: number) => {
    setTeamAssignments((prev) => {
      const courtTeams = prev[courtId] || { team1: [], team2: [] };
      const currentTeam = team === 1 ? 'team1' : 'team2';
      const otherTeam = team === 1 ? 'team2' : 'team1';
      
      // Remove from other team if present
      const newOtherTeam = courtTeams[otherTeam].filter(id => id !== playerId);
      
      // Toggle in current team
      let newCurrentTeam;
      if (courtTeams[currentTeam].includes(playerId)) {
        newCurrentTeam = courtTeams[currentTeam].filter(id => id !== playerId);
      } else {
        newCurrentTeam = [...courtTeams[currentTeam], playerId];
      }
      
      return {
        ...prev,
        [courtId]: {
          team1: team === 1 ? newCurrentTeam : newOtherTeam,
          team2: team === 2 ? newCurrentTeam : newOtherTeam,
        }
      };
    });
  };

  const handleAssignPlayers = (courtId: string) => {
    const teams = teamAssignments[courtId];
    if (!teams || teams.team1.length === 0 || teams.team2.length === 0) {
      addNotification('Each team needs at least 1 player', 'warning');
      return;
    }
    
    const assignments = [
      ...teams.team1.map(playerId => ({ playerId, team: 1 })),
      ...teams.team2.map(playerId => ({ playerId, team: 2 })),
    ];
    
    assignPlayersMutation.mutate({ courtId, teamAssignments: assignments });
  };

  const handleAutoAssign = async () => {
    const availableCourt = courts.find((c) => c.status === 'available');
    if (!availableCourt) {
      addNotification('No available courts', 'warning');
      return;
    }

    try {
      // Call matchmaking API to get optimal team combinations
      const response = await fetch('/api/matchmaking/optimal-teams');
      
      if (!response.ok) {
        const error = await response.json();
        addNotification(error.error || 'Failed to generate teams', 'warning');
        return;
      }

      const data = await response.json();
      const { combinations, restWarnings } = data;

      if (!combinations || combinations.length === 0) {
        addNotification('Could not generate balanced teams', 'warning');
        return;
      }

      // Use the best combination (rank 1)
      const bestCombo = combinations[0];

      // Show rest warnings if any
      if (restWarnings && restWarnings.length > 0) {
        restWarnings.forEach((warning: string) => {
          addNotification(warning, 'info');
        });
      }

      // Show confirmation dialog with all combinations
      setAutoAssignData({
        courtId: availableCourt.id,
        courtName: availableCourt.name,
        team1: bestCombo.team1,
        team2: bestCombo.team2,
        team1Avg: bestCombo.team1Avg,
        team2Avg: bestCombo.team2Avg,
        skillGap: bestCombo.skillGap,
        allCombinations: combinations,
        restWarnings: restWarnings || [],
        currentCombinationIndex: 0,
      });
      setShowAutoAssignConfirm(true);
    } catch (error) {
      console.error('Auto-assign error:', error);
      addNotification('Failed to generate optimal teams', 'danger');
    }
  };

  const handleConfirmAutoAssign = () => {
    if (!autoAssignData) return;

    const assignments = [
      ...autoAssignData.team1.map(p => ({ playerId: p.id, team: 1 })),
      ...autoAssignData.team2.map(p => ({ playerId: p.id, team: 2 })),
    ];

    assignPlayersMutation.mutate({ 
      courtId: autoAssignData.courtId, 
      teamAssignments: assignments 
    });

    setShowAutoAssignConfirm(false);
    setAutoAssignData(null);
  };

  const handleReassignTeams = () => {
    if (!autoAssignData) return;

    // Cycle through pre-computed combinations
    const nextIndex = (autoAssignData.currentCombinationIndex + 1) % autoAssignData.allCombinations.length;
    const nextCombo = autoAssignData.allCombinations[nextIndex];

    // Update the dialog with new team assignments from next combination
    setAutoAssignData({
      ...autoAssignData,
      team1: nextCombo.team1,
      team2: nextCombo.team2,
      team1Avg: nextCombo.team1Avg,
      team2Avg: nextCombo.team2Avg,
      skillGap: nextCombo.skillGap,
      currentCombinationIndex: nextIndex,
    });
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
    setEndingCourtId(courtId);
    setShowEndGameModal(true);
  };

  const handleEndGameSubmit = (courtId: string, winningTeam: number, team1Score: number, team2Score: number) => {
    endGameMutation.mutate({ courtId, winningTeam, team1Score, team2Score });
  };

  const handleCancelGame = (courtId: string) => {
    cancelGameMutation.mutate(courtId);
  };

  const handleRemoveFromQueue = (playerId: string) => {
    removeFromQueueMutation.mutate(playerId);
  };

  const handleClearQueue = () => {
    updateQueueMutation.mutate([]);
    setTeamAssignments({});
    addNotification('Queue cleared', 'success');
  };


  const handleResetGames = () => {
    resetGamesMutation.mutate();
  };

  const handleEndSession = () => {
    setShowEndSessionConfirm(true);
  };

  const handleConfirmEndSession = () => {
    if (session) {
      endSessionMutation.mutate(session.id);
    }
  };

  const handleImportPlayers = async (url: string) => {
    try {
      const response = await apiRequest('POST', '/api/players/import', { url });
      
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      if (response.imported > 0) {
        addNotification(`${response.imported} player${response.imported !== 1 ? 's' : ''} imported successfully`, 'success');
      }
      
      if (response.skipped > 0) {
        addNotification(`${response.skipped} player${response.skipped !== 1 ? 's' : ''} skipped`, 'warning');
      }
      
      return response;
    } catch (error: any) {
      const message = error?.error || error?.message || 'Failed to import players';
      addNotification(message, 'danger');
      throw error;
    }
  };

  const handleImportCSV = async (csvPlayers: Array<{ name: string; gender: string; level: string }>) => {
    try {
      let imported = 0;
      let skipped = 0;
      const skippedDetails: any[] = [];

      // Check for duplicate names in existing players
      const existingNames = new Set(players.map(p => p.name.toLowerCase()));

      for (const player of csvPlayers) {
        // Skip if player already exists
        if (existingNames.has(player.name.toLowerCase())) {
          skipped++;
          skippedDetails.push({ name: player.name, reason: 'Already exists' });
          continue;
        }

        try {
          // Create player using the existing API endpoint
          await apiRequest('POST', '/api/players', {
            name: player.name,
            gender: player.gender,
            level: player.level,
            gamesPlayed: 0,
            wins: 0,
            status: 'waiting'
          });
          imported++;
          existingNames.add(player.name.toLowerCase());
        } catch (err) {
          skipped++;
          skippedDetails.push({ name: player.name, reason: 'Failed to create' });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });

      if (imported > 0) {
        addNotification(`${imported} player${imported !== 1 ? 's' : ''} imported successfully`, 'success');
      }

      if (skipped > 0) {
        addNotification(`${skipped} player${skipped !== 1 ? 's' : ''} skipped`, 'warning');
      }

      return { imported, skipped, skippedDetails };
    } catch (error: any) {
      const message = error?.error || error?.message || 'Failed to import CSV';
      addNotification(message, 'danger');
      throw error;
    }
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

  // Handle session loading
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading ShuttleIQ...</p>
        </div>
      </div>
    );
  }

  // Show setup wizard if no active session (requires auth)
  if (!hasSession) {
    const handleSessionCreated = async () => {
      // Invalidate all session-scoped queries
      await queryClient.invalidateQueries({ queryKey: ['/api/sessions/active'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/courts'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
    };

    // Show wizard if authenticated, otherwise prompt to login
    if (isAuthenticated) {
      return <SessionSetupWizard onSessionCreated={handleSessionCreated} />;
    } else {
      // Show message prompting login
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div>
              <h1 className="text-4xl font-bold text-primary mb-2">ShuttleIQ</h1>
              <p className="text-lg text-muted-foreground">Badminton Queue Management</p>
            </div>
            <div className="p-6 bg-card rounded-lg border shadow-sm space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">No Active Session</h2>
                <p className="text-muted-foreground">
                  To start managing your badminton session, please log in as an administrator.
                </p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                data-testid="button-login-prompt"
              >
                Login to Create Session
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Show loading if data is being fetched
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Header 
          stats={stats || defaultStats}
          session={session}
          onAddPlayer={() => setShowAddPlayer(true)} 
          onAutoAssign={handleAutoAssign}
          onImportPlayers={() => setShowImportPlayers(true)}
          onEndSession={handleEndSession}
          authState={isAuthenticated ? "admin" : "guest"}
          onLogin={() => navigate('/login')}
          onAdmin={() => navigate('/admin')}
          onLogout={logout}
        />
        
        <TabNavigation
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setTeamAssignments({});
          }}
        />

        <div className="space-y-6">
          {activeTab === 'courts' && (
            <CourtManagement
              courts={courts}
              queuePlayers={queuePlayers}
              teamAssignments={teamAssignments}
              onAddCourt={handleAddCourt}
              onRemoveCourt={handleRemoveCourt}
              onTogglePlayerSelection={handleTogglePlayerSelection}
              onAssignPlayers={handleAssignPlayers}
              onSelectWinningTeam={handleSelectWinningTeam}
              onEndGame={handleEndGame}
              onCancelGame={handleCancelGame}
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

          {activeTab === 'history' && (
            <GameHistory 
              games={gameHistory} 
              onResetGames={handleResetGames}
            />
          )}

          {activeTab === 'leaderboard' && session && (
            <SessionLeaderboard sessionId={session.id} />
          )}
        </div>
      </div>

      <AddPlayerModal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        onAddPlayer={handleAddPlayer}
      />

      <ImportPlayersModal
        open={showImportPlayers}
        onClose={() => setShowImportPlayers(false)}
        onImport={handleImportPlayers}
        onImportCSV={handleImportCSV}
      />

      <EndGameModal
        court={endingCourtId ? courts.find(c => c.id === endingCourtId) || null : null}
        isOpen={showEndGameModal}
        onClose={() => {
          setShowEndGameModal(false);
          setEndingCourtId(null);
        }}
        onSubmit={handleEndGameSubmit}
      />

      <AutoAssignConfirmDialog
        isOpen={showAutoAssignConfirm}
        onClose={() => {
          setShowAutoAssignConfirm(false);
          setAutoAssignData(null);
        }}
        onConfirm={handleConfirmAutoAssign}
        onReassign={handleReassignTeams}
        courtName={autoAssignData?.courtName || ''}
        team1={autoAssignData?.team1 || []}
        team2={autoAssignData?.team2 || []}
        team1Avg={autoAssignData?.team1Avg}
        team2Avg={autoAssignData?.team2Avg}
        skillGap={autoAssignData?.skillGap}
        restWarnings={autoAssignData?.restWarnings}
        currentCombinationIndex={autoAssignData?.currentCombinationIndex}
        totalCombinations={autoAssignData?.allCombinations?.length}
      />

      <AlertDialog open={showEndSessionConfirm} onOpenChange={setShowEndSessionConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the current session and close all active games. Players will be returned to the queue.
              Game history will be downloaded as a CSV file before the session ends.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-end-session">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEndSession}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-end-session"
            >
              End Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
