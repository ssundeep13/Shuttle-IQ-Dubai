import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronUp, Repeat2, X } from "lucide-react";

// Same shape the PendingLineupsPanel receives from
// GET /api/sessions/:id/pending-suggestions (shared query key — TanStack
// dedupes, so this strip costs no extra network).
type QueuedSuggestion = {
  id: string;
  sessionId: string;
  courtId: string;
  courtName: string;
  pendingUntil: string | null;
  status: string;
  source?: string; // 'auto' | 'captain'
  players: Array<{
    suggestionId: string;
    courtId: string;
    playerId: string;
    team: number;
    name: string;
  }>;
};

type ConflictReason = "playing" | "sitting out" | "left queue" | "double-booked";

interface UpNextStripProps {
  court: CourtWithPlayers;
  queuePlayers: Player[];
  playingPlayerIds: string[];
}

// "Up Next" strip — one line, collapsed by default, shown inside an occupied
// court card when the court has a 'queued' lineup (auto-orchestrated or
// captain-pinned: one display, both sources). Expanding reveals the team
// split with per-player eligibility flags, a swap affordance, and remove.
export function UpNextStrip({ court, queuePlayers, playingPlayerIds }: UpNextStripProps) {
  const sessionId = court.sessionId;
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [swapOutId, setSwapOutId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data: suggestions = [] } = useQuery<QueuedSuggestion[]>({
    queryKey: ["/api/sessions", sessionId, "pending-suggestions"],
    refetchInterval: 10_000,
    enabled: !!sessionId,
  });

  const { data: sittingOutData } = useQuery<{ sittingOut: string[] }>({
    queryKey: ["/api/sessions", sessionId, "queue", "sitting-out"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/queue/sitting-out`), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });
      if (!res.ok) return { sittingOut: [] };
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 5000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/sessions", sessionId, "pending-suggestions"],
    });

  const swapMutation = useMutation({
    mutationFn: async ({ suggestionId, outPlayerId, inPlayerId }: { suggestionId: string; outPlayerId: string; inPlayerId: string }) =>
      apiRequest("PATCH", `/api/sessions/${sessionId}/suggestions/${suggestionId}/players`, { outPlayerId, inPlayerId }),
    onSuccess: () => {
      invalidate();
      setSwapOutId(null);
      toast({ title: "Lineup updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't swap player",
        description: error?.error || error?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (suggestionId: string) =>
      apiRequest("POST", `/api/sessions/${sessionId}/suggestions/${suggestionId}/dismiss`),
    onSuccess: () => {
      invalidate();
      setConfirmRemove(false);
      toast({ title: "Up-next lineup removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't remove lineup",
        description: error?.error || error?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  // Gate 5c: on-demand queued-only build for the rare miss (generator
  // declined, restart, race) — the proactive post-assign trigger normally
  // gets there first.
  const buildMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/sessions/${sessionId}/queued-lineups/build`),
    onSuccess: () => invalidate(),
    onError: (error: any) => {
      toast({
        title: "Couldn't build lineup",
        description: error?.error || error?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  if (court.status !== "occupied") return null;

  const queueIds = new Set(queuePlayers.map((p) => p.id));
  const sittingOut = new Set(sittingOutData?.sittingOut ?? []);
  const playing = new Set(playingPlayerIds);
  const queued = suggestions.find((s) => s.status === "queued" && s.courtId === court.id);

  // Gate 5c: the strip is ALWAYS visible on occupied courts. Without a
  // queued lineup it shows one of two one-liners, decided by how many
  // players could actually be queued right now.
  if (!queued) {
    const onAnySuggestion = new Set(suggestions.flatMap((s) => s.players.map((p) => p.playerId)));
    const eligibleCount = queuePlayers.filter(
      (p) => !sittingOut.has(p.id) && !playing.has(p.id) && !onAnySuggestion.has(p.id),
    ).length;

    return (
      <div
        className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2"
        data-testid={`strip-up-next-${court.id}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
          Up next
        </span>
        {eligibleCount >= 4 ? (
          <>
            <span className="text-xs text-muted-foreground truncate flex-1" data-testid={`text-up-next-preparing-${court.id}`}>
              Preparing next lineup…
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              disabled={buildMutation.isPending}
              onClick={() => buildMutation.mutate()}
              data-testid={`button-up-next-build-${court.id}`}
            >
              Build now
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground truncate flex-1" data-testid={`text-up-next-waiting-${court.id}`}>
            Waiting for players
          </span>
        )}
      </div>
    );
  }

  const onOtherLineup = new Set(
    suggestions
      .filter((s) => s.id !== queued.id)
      .flatMap((s) => s.players.map((p) => p.playerId)),
  );

  // Per-player ineligibility flag: surfaced visually rather than failing
  // silently. Most-specific reason first.
  const conflictFor = (playerId: string): ConflictReason | null => {
    if (playing.has(playerId)) return "playing";
    if (sittingOut.has(playerId)) return "sitting out";
    if (!queueIds.has(playerId)) return "left queue";
    if (onOtherLineup.has(playerId)) return "double-booked";
    return null;
  };

  const team1 = queued.players.filter((p) => p.team === 1);
  const team2 = queued.players.filter((p) => p.team === 2);
  const conflicts = queued.players.filter((p) => conflictFor(p.playerId) !== null);
  const isCaptain = queued.source === "captain";

  // Swap candidates: waiting-queue players who aren't sitting out, playing,
  // or already named on any open lineup (server re-validates authoritatively).
  const swapCandidates = queuePlayers.filter(
    (p) =>
      !sittingOut.has(p.id) &&
      !playing.has(p.id) &&
      !onOtherLineup.has(p.id) &&
      !queued.players.some((qp) => qp.playerId === p.id),
  );

  const teamChips = (team: typeof team1, label: string) => (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="space-y-1">
        {team.map((p) => {
          const conflict = conflictFor(p.playerId);
          return (
            <div
              key={p.playerId}
              className="flex items-center gap-1.5 flex-wrap"
              data-testid={`upnext-player-${court.id}-${p.playerId}`}
            >
              <span className={cn("text-sm truncate", conflict ? "text-amber-600" : "text-foreground")}>
                {p.name}
              </span>
              {conflict && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                  {conflict}
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                onClick={() => setSwapOutId(swapOutId === p.playerId ? null : p.playerId)}
                data-testid={`button-upnext-swap-${court.id}-${p.playerId}`}
              >
                <Repeat2 className="h-3 w-3 mr-1" />
                Swap
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mt-1" data-testid={`strip-up-next-${court.id}`}>
      {/* Collapsed one-liner — stays readable with 6 court cards on a phone */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-left"
        data-testid={`button-up-next-toggle-${court.id}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
          Up next
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-xs shrink-0",
            isCaptain ? "text-secondary border-secondary/40" : "text-muted-foreground border-muted-foreground/40",
          )}
          data-testid={`badge-up-next-source-${court.id}`}
        >
          {isCaptain ? "Captain" : "Auto"}
        </Badge>
        {conflicts.length > 0 && (
          <AlertTriangle
            className="h-3.5 w-3.5 text-amber-600 shrink-0"
            data-testid={`icon-up-next-conflict-${court.id}`}
          />
        )}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {team1.map((p) => p.name).join(" + ")} vs {team2.map((p) => p.name).join(" + ")}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {teamChips(team1, "Team 1")}
            {teamChips(team2, "Team 2")}
          </div>

          {swapOutId && (
            <div className="space-y-1.5" data-testid={`upnext-swap-picker-${court.id}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Swap in from queue
              </p>
              {swapCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No eligible players in the queue</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {swapCandidates.map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={swapMutation.isPending}
                      onClick={() =>
                        swapMutation.mutate({
                          suggestionId: queued.id,
                          outPlayerId: swapOutId,
                          inPlayerId: p.id,
                        })
                      }
                      data-testid={`button-upnext-swap-in-${court.id}-${p.id}`}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            className="w-full text-destructive"
            onClick={() => setConfirmRemove(true)}
            disabled={removeMutation.isPending}
            data-testid={`button-up-next-remove-${court.id}`}
          >
            <X className="h-4 w-4 mr-1" />
            Remove lineup
          </Button>
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove up-next lineup?</AlertDialogTitle>
            <AlertDialogDescription>
              The running game is untouched. Auto-matchmaking may queue a fresh lineup for this court.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMutation.mutate(queued.id)}
              data-testid={`button-up-next-remove-confirm-${court.id}`}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
