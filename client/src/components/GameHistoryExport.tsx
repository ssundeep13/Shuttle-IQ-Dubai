import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, AlertCircle } from 'lucide-react';
import { useActiveSession } from '@/hooks/use-active-session';

export function GameHistoryExport() {
  const { session, hasSession } = useActiveSession();
  const [isExporting, setIsExporting] = useState(false);

  const { data: gameHistory } = useQuery<any[]>({
    queryKey: ['/api/sessions', session?.id, 'game-history'],
    enabled: hasSession,
  });

  const handleExport = () => {
    if (!gameHistory || gameHistory.length === 0) {
      return;
    }

    setIsExporting(true);

    const csvRows = [
      ['Game ID', 'Court', 'Team 1 Score', 'Team 2 Score', 'Winning Team', 'Date', 'Team 1 Players', 'Team 2 Players'].join(','),
    ];

    gameHistory.forEach((game) => {
      const team1Players = game.participants
        .filter((p: any) => p.team === 1)
        .map((p: any) => `${p.playerName} (${p.playerLevel})`)
        .join(' & ');

      const team2Players = game.participants
        .filter((p: any) => p.team === 2)
        .map((p: any) => `${p.playerName} (${p.playerLevel})`)
        .join(' & ');

      csvRows.push([
        game.id,
        game.courtId,
        game.team1Score,
        game.team2Score,
        game.winningTeam,
        new Date(game.createdAt).toLocaleString(),
        `"${team1Players}"`,
        `"${team2Players}"`,
      ].join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttleiq-game-history-${session?.venueName?.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    setIsExporting(false);
  };

  if (!hasSession) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No active session. Please create a session first.
        </AlertDescription>
      </Alert>
    );
  }

  if (!gameHistory || gameHistory.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No game history available for the current session.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-medium">
          {gameHistory.length} game{gameHistory.length !== 1 ? 's' : ''} recorded
        </p>
        <p className="text-sm text-muted-foreground">
          Session: {session?.venueName}
        </p>
      </div>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full"
        data-testid="button-export-history"
      >
        <Download className="w-4 h-4 mr-2" />
        {isExporting ? 'Exporting...' : 'Download Game History (CSV)'}
      </Button>
    </div>
  );
}
