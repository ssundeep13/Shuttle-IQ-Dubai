import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, AlertCircle } from 'lucide-react';
import { useActiveSession } from '@/hooks/use-active-session';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

async function downloadAdminCsv(endpoint: string, filename: string): Promise<void> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DATA_EXPORTS = [
  {
    key: 'matches',
    label: 'All Matches',
    description: 'Every recorded game with scores and player IDs',
    endpoint: '/api/admin/export/matches.csv',
    filename: 'shuttleiq-matches.csv',
    testId: 'button-export-matches',
  },
  {
    key: 'players',
    label: 'All Players',
    description: 'Player registry with skill scores and stats',
    endpoint: '/api/admin/export/players.csv',
    filename: 'shuttleiq-players.csv',
    testId: 'button-export-players',
  },
  {
    key: 'score-history',
    label: 'Score History',
    description: 'Per-player skill score changes across every game',
    endpoint: '/api/admin/export/score-history.csv',
    filename: 'shuttleiq-score-history.csv',
    testId: 'button-export-score-history',
  },
  {
    key: 'sessions',
    label: 'All Sessions',
    description: 'Session list with venues, dates and statuses',
    endpoint: '/api/admin/export/sessions.csv',
    filename: 'shuttleiq-sessions.csv',
    testId: 'button-export-sessions',
  },
] as const;

export function GameHistoryExport() {
  const { session, hasSession } = useActiveSession();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: gameHistory } = useQuery<any[]>({
    queryKey: ['/api/sessions', session?.id, 'game-history'],
    enabled: hasSession,
  });

  const handleExport = () => {
    if (!gameHistory || gameHistory.length === 0) return;
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

  const handleDataExport = async (endpoint: string, filename: string, key: string) => {
    setDownloading(key);
    try {
      await downloadAdminCsv(endpoint, filename);
    } catch (err) {
      toast({ title: 'Export failed', description: 'Could not download the file. Please try again.', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Session game history export (existing) */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Current Session Game History</h3>
          <p className="text-sm text-muted-foreground">Download game scores from the active session</p>
        </div>
        {!hasSession ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>No active session. Please create a session first.</AlertDescription>
          </Alert>
        ) : !gameHistory || gameHistory.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>No game history available for the current session.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                {gameHistory.length} game{gameHistory.length !== 1 ? 's' : ''} recorded
              </p>
              <p className="text-sm text-muted-foreground">Session: {session?.venueName}</p>
            </div>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              variant="outline"
              className="w-full"
              data-testid="button-export-history"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting…' : 'Download Game History (CSV)'}
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Full data exports */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Full Data Export</h3>
          <p className="text-sm text-muted-foreground">Download complete historical data across all sessions</p>
        </div>
        <div className="grid gap-2">
          {DATA_EXPORTS.map((exp) => (
            <div key={exp.key} className="flex items-center justify-between gap-4 p-3 rounded-md border">
              <div className="min-w-0">
                <p className="text-sm font-medium">{exp.label}</p>
                <p className="text-xs text-muted-foreground truncate">{exp.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={downloading === exp.key}
                onClick={() => handleDataExport(exp.endpoint, exp.filename, exp.key)}
                data-testid={exp.testId}
                className="shrink-0"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {downloading === exp.key ? 'Downloading…' : 'Download'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
