import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, X, Trophy } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { bandLabel, BAND_LABELS, COURT_SKILL_BANDS, type CourtSkillBand } from "@/lib/bands";
import { friendlyMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatSkillLevel } from "@shared/utils/skillUtils";

// Gate 2 (deck-lite): the UpNextStrip mount and the manual-assign flow
// (AssignSheet + Assign Players button) moved to the NEXT GAMES deck in
// Home. This card is now the LIVE-GAME surface: header, band tag, and the
// score-entry hot path. Free courts render a slim placeholder — their
// actions live in the deck.

interface CourtCardProps {
  court: CourtWithPlayers;
  canRemoveCourt: boolean;
  onRemoveCourt: (courtId: string) => void;
  onRecordGame: (courtId: string, winningTeam: number, team1Score: number, team2Score: number) => void;
  onCancelGame: (courtId: string) => void;
  // Gate 4: the free card is the grid-side entry point into the SAME
  // AssignSheet the deck link opens (state lives in Home).
  onOpenAssign: (courtId: string) => void;
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

// ─── CourtCard ────────────────────────────────────────────────────────────────

export function CourtCard({
  court,
  canRemoveCourt,
  onRemoveCourt,
  onRecordGame,
  onCancelGame,
  onOpenAssign,
}: CourtCardProps) {
  const [bandPickerOpen, setBandPickerOpen] = useState(false);
  // Hot-path score entry: winner tap opens the inline panel; all state is
  // card-local (no interim server writes) until the single Record tap.
  const [scoringTeam, setScoringTeam] = useState<1 | 2 | null>(null);
  const [winnerScore, setWinnerScore] = useState(21);
  const [loserScore, setLoserScore] = useState(15);
  // Gate 2 (audit F5): cancelling a game must never be a single tap.
  const [confirmCancel, setConfirmCancel] = useState(false);
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
        description: friendlyMessage(error, "Try again"),
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

        {/* ── Available state: slim placeholder, now actionable (Gate 4) —
               the whole card area opens the SAME AssignSheet the deck link
               opens (state lives in Home; one flow, two entry points). ── */}
        {isAvailable && (
          <button
            type="button"
            onClick={() => onOpenAssign(court.id)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-6 rounded-lg bg-muted/40 border border-dashed border-border hover:bg-muted/60 active:scale-[0.99] transition-colors min-h-11"
            data-testid={`free-placeholder-${court.id}`}
          >
            <p className="text-sm text-muted-foreground">Free</p>
            <p className="text-sm font-semibold text-secondary underline-offset-2 underline">
              Assign players
            </p>
          </button>
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
                    ? "bg-secondary/10 border-secondary"
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
                    ? "bg-secondary/10 border-secondary"
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
                    // one selected accent across the flow (audit F11): teal token
                    scoringTeam === team &&
                      "bg-secondary hover:bg-secondary/90 border-secondary text-secondary-foreground",
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
                {/* flex-wrap: at <412px the two stepper groups don't fit one
                    line; the winner group wraps whole instead of clipping the
                    deuce "+" off-canvas. */}
                <div className="flex flex-wrap items-center justify-between gap-2">
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

            {/* Quiet but safe (audit F5): 44px target, mt-2 separation from
                the chips above, and a confirm gate — the actual cancel fires
                only from the dialog action, never from this tap. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmCancel(true)}
              className="w-full min-h-11 mt-2 text-xs text-muted-foreground"
              data-testid={`button-cancel-game-${court.id}`}
            >
              Cancel game (no record)
            </Button>

            <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this game?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It ends with no score recorded and the players return to the
                    queue. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid={`button-keep-game-${court.id}`}>
                    Keep playing
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onCancelGame(court.id)}
                    className="bg-destructive hover:bg-destructive/90"
                    data-testid={`button-cancel-game-confirm-${court.id}`}
                  >
                    Cancel game
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

      </div>
    </>
  );
}
