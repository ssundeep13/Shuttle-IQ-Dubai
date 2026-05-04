import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PendingSuggestion = {
  id: string;
  sessionId: string;
  courtId: string;
  courtName: string;
  // null for 'queued' rows (queued lineups have no auto-approve deadline;
  // they only get a pendingUntil once the current game ends and the
  // game-end transition flips them to 'pending').
  pendingUntil: string | null;
  status: string;
  includesActivePlayers?: boolean;
  players: Array<{
    suggestionId: string;
    courtId: string;
    playerId: string;
    team: number;
    name: string;
  }>;
};

interface PendingLineupsPanelProps {
  sessionId: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function SuggestionRow({
  suggestion,
  onApprove,
  onDismiss,
  isApproving,
  isDismissing,
}: {
  suggestion: PendingSuggestion;
  onApprove: () => void;
  onDismiss: () => void;
  isApproving: boolean;
  isDismissing: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // SuggestionRow only renders 'pending' rows (queued rows go through
  // QueuedRow), so pendingUntil is guaranteed non-null in practice. Guard
  // anyway to keep the type narrow and avoid an NaN countdown if a stale
  // row ever slips through.
  const remainingMs = suggestion.pendingUntil
    ? new Date(suggestion.pendingUntil).getTime() - now
    : 0;
  const expired = remainingMs <= 0;

  const team1 = suggestion.players.filter(p => p.team === 1);
  const team2 = suggestion.players.filter(p => p.team === 2);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`row-pending-suggestion-${suggestion.id}`}
    >
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid={`badge-court-${suggestion.id}`}>
            Court {suggestion.courtName}
          </Badge>
          <div
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            data-testid={`text-countdown-${suggestion.id}`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{expired ? "Approving…" : `Auto-approve in ${formatCountdown(remainingMs)}`}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium" data-testid={`text-team1-${suggestion.id}`}>
            {team1.map(p => p.name).join(" + ") || "—"}
          </span>
          <span className="text-muted-foreground">vs</span>
          <span className="font-medium" data-testid={`text-team2-${suggestion.id}`}>
            {team2.map(p => p.name).join(" + ") || "—"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          disabled={isApproving || isDismissing}
          data-testid={`button-approve-${suggestion.id}`}
        >
          <Check className="h-4 w-4" />
          Approve now
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          disabled={isApproving || isDismissing}
          data-testid={`button-dismiss-${suggestion.id}`}
        >
          <X className="h-4 w-4" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function PendingLineupsPanel({ sessionId }: PendingLineupsPanelProps) {
  const { toast } = useToast();
  const { data: suggestions = [] } = useQuery<PendingSuggestion[]>({
    queryKey: ['/api/sessions', sessionId, 'pending-suggestions'],
    refetchInterval: 10_000,
    enabled: !!sessionId,
  });

  const approveMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      return apiRequest('POST', `/api/sessions/${sessionId}/suggestions/${suggestionId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId, 'pending-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courts'], exact: false });
      toast({ title: "Lineup approved", description: "Players have been notified." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't approve lineup", description: err.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      return apiRequest('POST', `/api/sessions/${sessionId}/suggestions/${suggestionId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId, 'pending-suggestions'] });
      toast({ title: "Lineup dismissed" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't dismiss lineup", description: err.message, variant: "destructive" });
    },
  });

  // The endpoint returns pending, approved, and queued suggestions. The
  // panel renders the "pending" rows in the actionable group (Approve /
  // Dismiss buttons) and the "queued" rows in a separate "Up next" group
  // (read-only — these auto-flip to pending when the current game ends).
  // Approved rows are never shown here; they're player-facing only.
  const pending = suggestions.filter(s => s.status === 'pending');
  const queued = suggestions.filter(s => s.status === 'queued');

  if (pending.length === 0 && queued.length === 0) return null;

  const pendingId = approveMutation.variables ?? dismissMutation.variables;

  return (
    <Card data-testid="panel-pending-lineups">
      <CardHeader>
        <CardTitle className="text-base">Pending Lineups (Court Captain)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.length > 0 && (
          <div className="space-y-3" data-testid="group-pending">
            {pending.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                onApprove={() => approveMutation.mutate(s.id)}
                onDismiss={() => dismissMutation.mutate(s.id)}
                isApproving={approveMutation.isPending && pendingId === s.id}
                isDismissing={dismissMutation.isPending && pendingId === s.id}
              />
            ))}
          </div>
        )}
        {queued.length > 0 && (
          <div className="space-y-2" data-testid="group-queued">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Up next (auto-confirms when current game ends)
            </p>
            {queued.map((s) => (
              <QueuedRow
                key={s.id}
                suggestion={s}
                onDismiss={() => dismissMutation.mutate(s.id)}
                isDismissing={dismissMutation.isPending && pendingId === s.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueuedRow({
  suggestion,
  onDismiss,
  isDismissing,
}: {
  suggestion: PendingSuggestion;
  onDismiss: () => void;
  isDismissing: boolean;
}) {
  const team1 = suggestion.players.filter(p => p.team === 1);
  const team2 = suggestion.players.filter(p => p.team === 2);
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`row-queued-suggestion-${suggestion.id}`}
    >
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid={`badge-queued-court-${suggestion.id}`}>
            Court {suggestion.courtName}
          </Badge>
          <span className="text-xs text-muted-foreground">On deck</span>
          {suggestion.includesActivePlayers && (
            <span
              className="text-xs italic text-muted-foreground"
              data-testid={`text-queued-may-adjust-${suggestion.id}`}
            >
              Lineup may adjust
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium" data-testid={`text-queued-team1-${suggestion.id}`}>
            {team1.map(p => p.name).join(" + ") || "—"}
          </span>
          <span className="text-muted-foreground">vs</span>
          <span className="font-medium" data-testid={`text-queued-team2-${suggestion.id}`}>
            {team2.map(p => p.name).join(" + ") || "—"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          disabled={isDismissing}
          data-testid={`button-dismiss-queued-${suggestion.id}`}
        >
          <X className="h-4 w-4" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
