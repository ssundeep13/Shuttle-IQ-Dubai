import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, X, Trophy, Users } from "lucide-react";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { bandLabel, BAND_LABELS, COURT_SKILL_BANDS, type CourtSkillBand } from "@/lib/bands";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatSkillLevel } from "@shared/utils/skillUtils";
import { UpNextStrip } from "./UpNextStrip";

interface CourtCardProps {
  court: CourtWithPlayers;
  queuePlayers: Player[];
  playingPlayerIds: string[];
  isSandboxSession: boolean;
  aiModeEnabled: boolean;
  selectedPlayers: string[];
  team1Players: string[];
  team2Players: string[];
  canRemoveCourt: boolean;
  onRemoveCourt: (courtId: string) => void;
  onTogglePlayerSelection: (playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  onRecordGame: (courtId: string, winningTeam: number, team1Score: number, team2Score: number) => void;
  onCancelGame: (courtId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatTime = (minutes: number) => {
  if (minutes === 0) return "Time's up!";
  return `${minutes} min${minutes !== 1 ? "s" : ""} remaining`;
};

const timerColor = (minutes: number) => {
  if (minutes === 0) return "text-red-600";
  if (minutes <= 5) return "text-red-600";
  if (minutes <= 10) return "text-amber-500";
  return "text-muted-foreground";
};

// Compact gender·level·score string
const playerMeta = (p: Player) =>
  `${p.gender === "Male" ? "M" : "F"} · ${formatSkillLevel(p.skillScore ?? 90)}`;

// ─── AssignSheet — bottom sheet for player assignment ─────────────────────────

function AssignSheet({
  open,
  onClose,
  court,
  queuePlayers,
  team1Players,
  team2Players,
  onTogglePlayerSelection,
  onAssignPlayers,
}: {
  open: boolean;
  onClose: () => void;
  court: CourtWithPlayers;
  queuePlayers: Player[];
  team1Players: string[];
  team2Players: string[];
  onTogglePlayerSelection: (playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
}) {
  const assigned = team1Players.length + team2Players.length;
  const ready = team1Players.length === 2 && team2Players.length === 2;

  // Display-only: alphabetical by name. Does not mutate the queuePlayers prop.
  const sortedQueuePlayers = [...queuePlayers].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const handleStart = () => {
    onAssignPlayers(court.id);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] flex flex-col rounded-t-2xl pb-0"
        data-testid={`sheet-assign-${court.id}`}
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-2 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">{court.name} — Assign Players</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                Tap a team button to assign. Select 2 per team.
              </SheetDescription>
            </div>
            <span
              className={cn(
                "text-sm font-semibold",
                ready ? "text-emerald-600" : "text-muted-foreground",
              )}
              data-testid={`text-assigned-count-${court.id}`}
            >
              {assigned}/4
            </span>
          </div>
        </SheetHeader>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {queuePlayers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No players in the queue.
            </p>
          ) : (
            sortedQueuePlayers.map((player) => {
              const inT1 = team1Players.includes(player.id);
              const inT2 = team2Players.includes(player.id);
              const t1Full = team1Players.length >= 2 && !inT1;
              const t2Full = team2Players.length >= 2 && !inT2;

              return (
                <div
                  key={player.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    inT1
                      ? "bg-primary/8 border-primary/30"
                      : inT2
                        ? "bg-secondary/8 border-secondary/30"
                        : "bg-card border-border",
                  )}
                  data-testid={`assign-row-${player.id}`}
                >
                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {player.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{playerMeta(player)}</p>
                  </div>

                  {/* Team buttons */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => onTogglePlayerSelection(player.id, 1)}
                      disabled={t1Full}
                      className={cn(
                        "h-10 min-w-[64px] rounded-lg border text-xs font-semibold transition-colors",
                        inT1
                          ? "bg-primary text-primary-foreground border-primary"
                          : t1Full
                            ? "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-50"
                            : "bg-card text-primary border-primary/40 hover:bg-primary/10",
                      )}
                      data-testid={`player-team1-${player.id}`}
                    >
                      {inT1 ? "Team 1" : "T1"}
                    </button>
                    <button
                      onClick={() => onTogglePlayerSelection(player.id, 2)}
                      disabled={t2Full}
                      className={cn(
                        "h-10 min-w-[64px] rounded-lg border text-xs font-semibold transition-colors",
                        inT2
                          ? "bg-secondary text-secondary-foreground border-secondary"
                          : t2Full
                            ? "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-50"
                            : "bg-card text-secondary border-secondary/40 hover:bg-secondary/10",
                      )}
                      data-testid={`player-team2-${player.id}`}
                    >
                      {inT2 ? "Team 2" : "T2"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="px-4 py-4 border-t border-border shrink-0 bg-card">
          <Button
            onClick={handleStart}
            disabled={!ready}
            className="w-full"
            data-testid={`button-assign-players-${court.id}`}
          >
            Start Game
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── CourtCard ────────────────────────────────────────────────────────────────

export function CourtCard({
  court,
  queuePlayers,
  playingPlayerIds,
  isSandboxSession,
  aiModeEnabled,
  selectedPlayers,
  team1Players,
  team2Players,
  canRemoveCourt,
  onRemoveCourt,
  onTogglePlayerSelection,
  onAssignPlayers,
  onRecordGame,
  onCancelGame,
}: CourtCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bandPickerOpen, setBandPickerOpen] = useState(false);
  // Hot-path score entry: winner tap opens the inline panel; all state is
  // card-local (no interim server writes) until the single Record tap.
  const [scoringTeam, setScoringTeam] = useState<1 | 2 | null>(null);
  const [winnerScore, setWinnerScore] = useState(21);
  const [loserScore, setLoserScore] = useState(15);
  const { toast } = useToast();

  // Court freed (game recorded/cancelled elsewhere) → drop the score panel.
  useEffect(() => {
    if (court.status === "available") {
      setScoringTeam(null);
      setWinnerScore(21);
      setLoserScore(15);
    }
  }, [court.status]);

  // Court bands Gate 3: pick a band → PATCH → collapse → fresh suggestion
  // (the courts list refetch carries the new band into the strip's query key
  // context, and the explicit suggestions invalidation regenerates).
  const bandMutation = useMutation({
    mutationFn: async (skillBand: CourtSkillBand) =>
      apiRequest("PATCH", `/api/courts/${court.id}/skill-band`, { skillBand, sessionId: court.sessionId }),
    onSuccess: (_data, skillBand) => {
      setBandPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/courts", court.id, "suggestions"], exact: false });
      toast({ title: `${court.name} set to ${BAND_LABELS[skillBand]}` });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't set the band",
        description: error?.error || error?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const isAvailable = court.status === "available";
  const team1 = court.players.filter((p) => p.team === 1);
  const team2 = court.players.filter((p) => p.team === 2);

  return (
    <>
      <div
        className="bg-card rounded-xl border border-border p-4 sm:p-5 flex flex-col gap-4 hover-elevate transition-colors relative"
        data-testid={`card-court-${court.id}`}
      >
        {/* ── Card header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3
              className="text-xl font-bold text-foreground leading-tight"
              data-testid={`text-court-name-${court.id}`}
            >
              {court.name}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Court bands Gate 3: band tag — tap to reveal the segmented
                  band toggle; picking a band collapses it and refreshes the
                  court's suggestion (query invalidation below). */}
              <button
                type="button"
                onClick={() => setBandPickerOpen(!bandPickerOpen)}
                data-testid={`button-court-band-${court.id}`}
              >
                <Badge
                  variant="outline"
                  className="text-xs font-semibold uppercase tracking-wide text-secondary border-secondary/40"
                >
                  {bandLabel((court as any).skillBand)}
                </Badge>
              </button>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  isAvailable
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200",
                )}
                data-testid={`badge-court-status-${court.id}`}
              >
                {isAvailable ? "Available" : "In Progress"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Timer (occupied) */}
            {!isAvailable && (
              <div className="text-right space-y-0.5">
                <div className="flex items-center gap-1.5 justify-end">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span
                    className={cn("text-sm font-semibold", timerColor(court.timeRemaining))}
                    data-testid={`text-court-timer-${court.id}`}
                  >
                    {formatTime(court.timeRemaining)}
                  </span>
                </div>
                {court.startedAt && (
                  <p
                    className="text-xs text-muted-foreground text-right"
                    data-testid={`text-court-start-time-${court.id}`}
                  >
                    Started {format(new Date(court.startedAt), "h:mm a")}
                  </p>
                )}
              </div>
            )}

            {/* Remove court (available only) */}
            {canRemoveCourt && isAvailable && (
              <button
                onClick={() => onRemoveCourt(court.id)}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-10 min-w-10 flex items-center justify-center"
                data-testid={`button-remove-court-${court.id}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Band picker (collapsed behind the tag) ── */}
        {bandPickerOpen && (
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
            data-testid={`band-picker-${court.id}`}
          >
            {COURT_SKILL_BANDS.map((b) => {
              const active = ((court as any).skillBand ?? "all_levels") === b;
              return (
                <Button
                  key={b}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={cn("h-9 text-xs", active && "bg-secondary text-secondary-foreground hover:bg-secondary/90")}
                  disabled={bandMutation.isPending}
                  onClick={() => bandMutation.mutate(b)}
                  data-testid={`button-band-${b}-${court.id}`}
                >
                  {BAND_LABELS[b]}
                </Button>
              );
            })}
          </div>
        )}

        {/* ── Available state ── */}
        {isAvailable && (
          <div className="flex flex-col gap-3 flex-1">
            {queuePlayers.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-8 rounded-lg bg-muted/40 border border-dashed border-border">
                <p className="text-sm text-muted-foreground">No players in the queue</p>
              </div>
            ) : (
              <>
                {/* Preview of already-selected players (if any) */}
                {(team1Players.length > 0 || team2Players.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-primary/8 border border-primary/20 p-2">
                      <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">
                        Team 1 ({team1Players.length}/2)
                      </p>
                      {team1Players.map((id) => {
                        const p = queuePlayers.find((q) => q.id === id);
                        return p ? (
                          <p key={id} className="text-xs text-foreground truncate">
                            {p.name}
                          </p>
                        ) : null;
                      })}
                    </div>
                    <div className="rounded-lg bg-secondary/8 border border-secondary/20 p-2">
                      <p className="text-xs font-semibold text-secondary mb-1 uppercase tracking-wide">
                        Team 2 ({team2Players.length}/2)
                      </p>
                      {team2Players.map((id) => {
                        const p = queuePlayers.find((q) => q.id === id);
                        return p ? (
                          <p key={id} className="text-xs text-foreground truncate">
                            {p.name}
                          </p>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setSheetOpen(true)}
                    className="flex-1 min-h-11"
                    variant={
                      team1Players.length === 2 && team2Players.length === 2
                        ? "outline"
                        : "default"
                    }
                    data-testid={`button-open-assign-sheet-${court.id}`}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {team1Players.length === 2 && team2Players.length === 2
                      ? "Edit Assignment"
                      : "Assign Players"}
                  </Button>
                  {team1Players.length === 2 && team2Players.length === 2 && (
                    <Button
                      onClick={() => onAssignPlayers(court.id)}
                      className="flex-1 min-h-11"
                      data-testid={`button-assign-players-${court.id}`}
                    >
                      Start Game
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Occupied state ── */}
        {!isAvailable && (
          <div className="flex flex-col gap-3">
            {/* VS matchup */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
              {/* Team 1 */}
              <div
                className={cn(
                  "rounded-xl border-2 p-3 transition-colors",
                  scoringTeam === 1
                    ? "bg-emerald-50 border-emerald-400"
                    : "bg-primary/5 border-primary/20",
                )}
              >
                <p className="text-center text-xs font-bold text-primary uppercase tracking-wide mb-2">
                  Team 1
                </p>
                {team1.map((p) => (
                  <div key={p.id} className="text-center mb-1.5">
                    <p className="text-sm font-medium text-foreground leading-tight">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{playerMeta(p)}</p>
                  </div>
                ))}
              </div>

              {/* VS pip */}
              <div className="flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground">VS</span>
                </div>
              </div>

              {/* Team 2 */}
              <div
                className={cn(
                  "rounded-xl border-2 p-3 transition-colors",
                  scoringTeam === 2
                    ? "bg-emerald-50 border-emerald-400"
                    : "bg-secondary/5 border-secondary/20",
                )}
              >
                <p className="text-center text-xs font-bold text-secondary uppercase tracking-wide mb-2">
                  Team 2
                </p>
                {team2.map((p) => (
                  <div key={p.id} className="text-center mb-1.5">
                    <p className="text-sm font-medium text-foreground leading-tight">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{playerMeta(p)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hot path: winner tap → inline score entry → one Record tap.
                Thumb-sized (48px) primary actions; scores are mandatory —
                the ranking pipeline is the product. */}
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((team) => (
                <Button
                  key={team}
                  onClick={() => setScoringTeam(scoringTeam === team ? null : (team as 1 | 2))}
                  variant={scoringTeam === team ? "default" : "outline"}
                  className={cn(
                    "h-12 text-sm font-semibold",
                    scoringTeam === team &&
                      "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white",
                  )}
                  data-testid={`button-select-team-${team}-${court.id}`}
                >
                  {scoringTeam === team && <Trophy className="w-4 h-4 mr-2" />}
                  Team {team} won
                </Button>
              ))}
            </div>

            {scoringTeam && (
              <div
                className="rounded-md border border-border bg-muted/30 p-3 space-y-3"
                data-testid={`score-entry-${court.id}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    Loser's points
                  </p>
                  <p className="text-sm font-bold tabular-nums" data-testid={`text-score-preview-${court.id}`}>
                    {scoringTeam === 1 ? `${winnerScore}–${loserScore}` : `${loserScore}–${winnerScore}`}
                  </p>
                </div>

                {/* Quick-tap chips for common results + stepper for the rest */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[10, 12, 15, 17, 19].map((v) => (
                    <Button
                      key={v}
                      variant={loserScore === v ? "default" : "outline"}
                      className={cn("h-11 text-sm font-semibold tabular-nums", loserScore === v && "bg-secondary text-secondary-foreground hover:bg-secondary/90")}
                      onClick={() => setLoserScore(v)}
                      data-testid={`button-loser-score-${v}-${court.id}`}
                    >
                      {v}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" className="h-11 w-11 text-sm font-bold"
                      onClick={() => setLoserScore(Math.max(0, loserScore - 1))}
                      data-testid={`button-loser-minus-${court.id}`}
                    >−</Button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums" data-testid={`text-loser-score-${court.id}`}>{loserScore}</span>
                    <Button
                      variant="outline" className="h-11 w-11 text-sm font-bold"
                      onClick={() => setLoserScore(Math.min(winnerScore - 1, loserScore + 1))}
                      data-testid={`button-loser-plus-${court.id}`}
                    >+</Button>
                  </div>
                  {/* Deuce games: winner score adjustable 21–30 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Winner</span>
                    <Button
                      variant="outline" className="h-11 w-11 text-sm font-bold"
                      onClick={() => setWinnerScore(Math.max(Math.max(21, loserScore + 1), winnerScore - 1))}
                      data-testid={`button-winner-minus-${court.id}`}
                    >−</Button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">{winnerScore}</span>
                    <Button
                      variant="outline" className="h-11 w-11 text-sm font-bold"
                      onClick={() => setWinnerScore(Math.min(30, winnerScore + 1))}
                      data-testid={`button-winner-plus-${court.id}`}
                    >+</Button>
                  </div>
                </div>

                <Button
                  className="w-full h-12 text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  disabled={loserScore >= winnerScore}
                  onClick={() =>
                    onRecordGame(
                      court.id,
                      scoringTeam,
                      scoringTeam === 1 ? winnerScore : loserScore,
                      scoringTeam === 2 ? winnerScore : loserScore,
                    )
                  }
                  data-testid={`button-record-game-${court.id}`}
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Record {scoringTeam === 1 ? `${winnerScore}–${loserScore}` : `${loserScore}–${winnerScore}`} — Team {scoringTeam} wins
                </Button>
              </div>
            )}

            {/* Demoted: no-record cancel is a quiet text link */}
            <button
              type="button"
              onClick={() => onCancelGame(court.id)}
              className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              data-testid={`button-cancel-game-${court.id}`}
            >
              Cancel game (no record)
            </button>
          </div>
        )}

        {/* Gate 5/6b: this court's next-game lineup — queued strip while a
            game runs, confirmable pending row once it ends. The strip decides
            its own visibility per court state. */}
        <UpNextStrip
          court={court}
          queuePlayers={queuePlayers}
          playingPlayerIds={playingPlayerIds}
          isSandboxSession={isSandboxSession}
          aiModeEnabled={aiModeEnabled}
        />
      </div>

      {/* Bottom sheet (available courts only) */}
      {isAvailable && (
        <AssignSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          court={court}
          queuePlayers={queuePlayers}
          team1Players={team1Players}
          team2Players={team2Players}
          onTogglePlayerSelection={onTogglePlayerSelection}
          onAssignPlayers={onAssignPlayers}
        />
      )}
    </>
  );
}
