import { useState, useEffect } from "react";
import { CourtWithPlayers, Player, Notification, AppStats } from "@shared/schema";
import { Header } from "@/components/Header";
import { TabNavigation } from "@/components/TabNavigation";
import { CourtManagement } from "@/components/CourtManagement";
import { PlayerQueue } from "@/components/PlayerQueue";
import { Leaderboard } from "@/components/Leaderboard";
import { AddPlayerModal } from "@/components/AddPlayerModal";
import { NotificationToast } from "@/components/NotificationToast";

type TabType = 'courts' | 'queue' | 'leaderboard';

const GAME_DURATION = 15; // minutes

// Initial data
const initialPlayers: Player[] = [
  { id: '1', name: 'Hari', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '2', name: 'Aditya', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '3', name: 'Jino', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '4', name: 'Arjun', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '5', name: 'Sourabh', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '6', name: 'Marium', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '7', name: 'Kush', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '8', name: 'AJ', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '9', name: 'Cinto John', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '10', name: 'Mohini', level: 'Beginner', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '11', name: 'Akhila', level: 'Beginner', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '12', name: 'Archie', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '13', name: 'Amal Raj', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
  { id: '14', name: 'Sandeep', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
];

const initialCourts: CourtWithPlayers[] = [
  { id: '1', name: 'Court 1', status: 'available', timeRemaining: 0, winningTeam: null, players: [] },
  { id: '2', name: 'Court 2', status: 'available', timeRemaining: 0, winningTeam: null, players: [] },
  { id: '3', name: 'Court 3', status: 'available', timeRemaining: 0, winningTeam: null, players: [] },
  { id: '4', name: 'Court 4', status: 'available', timeRemaining: 0, winningTeam: null, players: [] },
];

export default function Home() {
  const [courts, setCourts] = useState<CourtWithPlayers[]>(initialCourts);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [globalQueue, setGlobalQueue] = useState<string[]>(initialPlayers.map(p => p.id));
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('courts');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCourtId, setNextCourtId] = useState(5);

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCourts((prevCourts) =>
        prevCourts.map((court) => {
          if (court.status === 'occupied' && court.timeRemaining > 0) {
            const newTime = court.timeRemaining - 1;
            if (newTime === 0) {
              addNotification(`Time's up for ${court.name}!`, 'warning');
            }
            return { ...court, timeRemaining: newTime };
          }
          return court;
        })
      );
    }, 60000); // 1 minute

    return () => clearInterval(timer);
  }, []);

  const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
  };

  const dismissNotification = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const addCourt = () => {
    const newCourt: CourtWithPlayers = {
      id: String(nextCourtId),
      name: `Court ${courts.length + 1}`,
      status: 'available',
      timeRemaining: 0,
      winningTeam: null,
      players: [],
    };
    setCourts((prev) => [...prev, newCourt]);
    setNextCourtId((prev) => prev + 1);
    addNotification(`Court ${courts.length + 1} added`, 'success');
  };

  const removeCourt = (courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (court && court.status === 'occupied') {
      addNotification('Cannot remove an occupied court', 'danger');
      return;
    }
    if (courts.length <= 1) {
      addNotification('Must have at least one court', 'warning');
      return;
    }
    setCourts((prev) => {
      const filtered = prev.filter((c) => c.id !== courtId);
      return filtered.map((court, index) => ({
        ...court,
        name: `Court ${index + 1}`,
      }));
    });
    addNotification('Court removed', 'info');
  };

  const addPlayer = (name: string, level: string) => {
    const newPlayer: Player = {
      id: String(Date.now()),
      name,
      level,
      gamesPlayed: 0,
      wins: 0,
      status: 'waiting',
    };
    setPlayers((prev) => [...prev, newPlayer]);
    setGlobalQueue((prev) => [...prev, newPlayer.id]);
    addNotification(`${name} added to queue`, 'success');
  };

  const togglePlayerSelection = (playerId: string) => {
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

  const assignPlayersToCourt = (courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court || court.status === 'occupied') {
      addNotification('Court is not available', 'warning');
      return;
    }
    if (selectedPlayers.length < 2) {
      addNotification('Select at least 2 players', 'warning');
      return;
    }

    const playersToAssign = players.filter((p) => selectedPlayers.includes(p.id));

    setCourts((prev) =>
      prev.map((c) =>
        c.id === courtId
          ? {
              ...c,
              status: 'occupied',
              players: playersToAssign,
              timeRemaining: GAME_DURATION,
              winningTeam: null,
            }
          : c
      )
    );

    setGlobalQueue((prev) => prev.filter((id) => !selectedPlayers.includes(id)));
    setPlayers((prev) =>
      prev.map((player) =>
        selectedPlayers.includes(player.id) ? { ...player, status: 'playing' } : player
      )
    );
    setSelectedPlayers([]);
    addNotification(`${playersToAssign.length} players assigned to ${court.name}`, 'success');
  };

  const autoAssign = () => {
    const availableCourt = courts.find((c) => c.status === 'available');
    const waitingPlayers = globalQueue.slice(0, 4);

    if (!availableCourt || waitingPlayers.length < 2) {
      addNotification('Need at least 2 players and an available court', 'warning');
      return;
    }

    const playersToAssign = players.filter((p) => waitingPlayers.includes(p.id));

    setCourts((prev) =>
      prev.map((court) =>
        court.id === availableCourt.id
          ? {
              ...court,
              status: 'occupied',
              players: playersToAssign.slice(0, 4),
              timeRemaining: GAME_DURATION,
              winningTeam: null,
            }
          : court
      )
    );

    setGlobalQueue((prev) => prev.filter((id) => !waitingPlayers.slice(0, 4).includes(id)));
    setPlayers((prev) =>
      prev.map((player) =>
        waitingPlayers.slice(0, 4).includes(player.id) ? { ...player, status: 'playing' } : player
      )
    );

    addNotification(`Players assigned to ${availableCourt.name}`, 'success');
  };

  const removeFromQueue = (playerId: string) => {
    setGlobalQueue((prev) => prev.filter((id) => id !== playerId));
    setSelectedPlayers((prev) => prev.filter((id) => id !== playerId));
    addNotification('Player removed from queue', 'info');
  };

  const selectWinningTeam = (courtId: string, teamNumber: number) => {
    setCourts((prev) =>
      prev.map((court) =>
        court.id === courtId
          ? {
              ...court,
              winningTeam: court.winningTeam === teamNumber ? null : teamNumber,
            }
          : court
      )
    );
  };

  const endGame = (courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court || court.status !== 'occupied') return;

    if (court.winningTeam === null) {
      addNotification('Please select a winning team', 'warning');
      return;
    }

    const team1 = court.players.slice(0, Math.ceil(court.players.length / 2));
    const team2 = court.players.slice(Math.ceil(court.players.length / 2));
    const winners = court.winningTeam === 1 ? team1 : team2;
    const losers = court.winningTeam === 1 ? team2 : team1;

    setPlayers((prev) =>
      prev.map((player) => {
        if (court.players.some((p) => p.id === player.id)) {
          const isWinner = winners.some((w) => w.id === player.id);
          return {
            ...player,
            gamesPlayed: player.gamesPlayed + 1,
            wins: isWinner ? player.wins + 1 : player.wins,
            status: 'waiting',
          };
        }
        return player;
      })
    );

    setGlobalQueue((prev) => [
      ...prev,
      ...losers.map((p) => p.id),
      ...winners.map((p) => p.id),
    ]);

    setCourts((prev) =>
      prev.map((c) =>
        c.id === courtId
          ? {
              ...c,
              status: 'available',
              players: [],
              timeRemaining: 0,
              winningTeam: null,
            }
          : c
      )
    );

    addNotification(`Game ended on ${court.name}. Team ${court.winningTeam} wins!`, 'success');
  };

  const clearQueue = () => {
    setGlobalQueue([]);
    setSelectedPlayers([]);
    addNotification('Queue cleared', 'success');
  };

  const resetStats = () => {
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        gamesPlayed: 0,
        wins: 0,
      }))
    );
    addNotification('Stats reset', 'success');
  };

  const clearAllPlayers = () => {
    const playingPlayers = players.filter((p) => p.status === 'playing');
    if (playingPlayers.length > 0) {
      addNotification('Cannot clear while games in progress', 'danger');
      return;
    }
    setPlayers([]);
    setGlobalQueue([]);
    setSelectedPlayers([]);
    addNotification('All players cleared', 'success');
  };

  const queuePlayers = globalQueue
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  const stats: AppStats = {
    activePlayers: players.filter((p) => p.status === 'playing').length,
    inQueue: globalQueue.length,
    availableCourts: courts.filter((c) => c.status === 'available').length,
    occupiedCourts: courts.filter((c) => c.status === 'occupied').length,
    totalPlayers: players.length,
    totalCourts: courts.length,
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <Header stats={stats} onAddPlayer={() => setShowAddPlayer(true)} onAutoAssign={autoAssign} />
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
            onAddCourt={addCourt}
            onRemoveCourt={removeCourt}
            onTogglePlayerSelection={togglePlayerSelection}
            onAssignPlayers={assignPlayersToCourt}
            onSelectWinningTeam={selectWinningTeam}
            onEndGame={endGame}
          />
        )}

        {activeTab === 'queue' && (
          <PlayerQueue
            players={players}
            queuePlayerIds={globalQueue}
            onAddPlayer={() => setShowAddPlayer(true)}
            onRemoveFromQueue={removeFromQueue}
            onClearQueue={clearQueue}
          />
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard
            players={players}
            onResetStats={resetStats}
            onClearAllPlayers={clearAllPlayers}
          />
        )}
      </div>

      <AddPlayerModal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        onAddPlayer={addPlayer}
      />

      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
