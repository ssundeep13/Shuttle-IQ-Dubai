import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import { composeCandidates } from "@/lib/composeEligibility";
import { CourtWithPlayers, Player } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { sortCourts } from "@/lib/courtOrder";
import { formatSkillLevel } from "@shared/utils/skillUtils";
import { UpNextStrip } from "./UpNextStrip";

// Gate 2 (deck-lite): the NEXT GAMES section — every court's UpNextStrip,
// relocated out of CourtCard into one place between the tab bar and the
// courts grid. The strip itself is UNCHANGED (same component, same props);
// only the mount moved. Manual assignment moved here with it: the
// AssignSheet below is the same sheet CourtCard used to own.
//
// Mobile is a horizontal snap carousel — one panel per swipe, court-name
// indicators — so the deck costs at most one panel-height above the grid
// and the winner chips on the first occupied court stay reachable.

interface NextGamesDeckProps {
  courts: CourtWithPlayers[];
  queuePlayers: Player[];
  isSandboxSession: boolean;
  aiModeEnabled: boolean;
  teamAssignments: Record<string, { team1: string[]; team2: string[] }>;
  onTogglePlayerSelection: (courtId: string, playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  // Gate 4: the AssignSheet's open-state lives in Home so the grid's free
  // card and the deck link are two entry points into ONE sheet.
  assignCourtId: string | null;
  onOpenAssign: (courtId: string | null) => void;
  // Gate 1 (D4): compose mode for OCCUPIED courts — submits the composed
  // lineup to the hardened queued-suggestion endpoint (state lives in Home
  // alongside the free-court assign flow).
  onComposeLineup?: (courtId: string) => void;
  composeError?: string | null;
  composePending?: boolean;
}

// Compact gender·level string (same helper CourtCard uses for its rosters)
const playerMeta = (p: Player) =>
  `${p.gender === "Male" ? "M" : "F"} · ${formatSkillLevel(p.skillScore ?? 90)}`;

// ─── AssignSheet — bottom sheet for manual player assignment ─────────────────
// Moved verbatim from CourtCard (Gate 2): the deck panel is where free-court
// actions live now. Same testids, same behavior.

function AssignSheet({
  open,
  onClose,
  court,
  queuePlayers,
  team1Players,
  team2Players,
  onTogglePlayerSelection,
  onAssignPlayers,
  mode,
  eligible,
  composeError,
  composePending,
}: {
  open: boolean;
  onClose: () => void;
  court: CourtWithPlayers;
  queuePlayers: Player[];
  team1Players: string[];
  team2Players: string[];
  onTogglePlayerSelection: (playerId: string, team: number) => void;
  onAssignPlayers: (courtId: string) => void;
  // Gate 1 (D4): 'assign' = free court, starts a game now via /assign.
  // 'compose' = OCCUPIED court, locks the next lineup via queued-suggestion.
  mode: 'assign' | 'compose';
  /** compose mode: the eligibility-filtered candidate list */
  eligible?: Player[];
  /** compose mode: server 409 copy, rendered IN-SHEET (never a bare toast) */
  composeError?: string | null;
  composePending?: boolean;
}) {
  const isCompose = mode === 'compose';
  const assigned = team1Players.length + team2Players.length;
  const ready = team1Players.length === 2 && team2Players.length === 2;

  // Display-only: alphabetical by name. Does not mutate the source prop.
  const sourcePlayers = isCompose ? (eligible ?? []) : queuePlayers;
  const sortedQueuePlayers = [...sourcePlayers].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const handleStart = () => {
    onAssignPlayers(court.id);
    // compose keeps the sheet open until the server confirms, so a 409 can
    // render in place; the free-court flow closes immediately as before.
    if (!isCompose) onClose();
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
              <SheetTitle className="text-base">
                {isCompose ? `${court.name} — Compose Up Next` : `${court.name} — Assign Players`}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {isCompose
                  ? "Tap a team button to build the next lineup. Select 2 per team."
                  : "Tap a team button to assign. Select 2 per team."}
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

        {/* Server 409 — in-sheet, with names, never a bare toast (Gate 1) */}
        {isCompose && composeError && (
          <div
            className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 shrink-0"
            data-testid={`text-compose-error-${court.id}`}
          >
            {composeError}
          </div>
        )}

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sortedQueuePlayers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {isCompose ? "No eligible players right now." : "No players in the queue."}
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
                    "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
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
          <div className="w-full space-y-2">
            {isCompose && (
              <p className="text-xs text-muted-foreground" data-testid={`text-compose-caveat-${court.id}`}>
                Holds until the game ends. If any of these four gets placed elsewhere or
                leaves the queue before then, this lineup is released and the planner
                proposes a fresh one — it is never promoted stale.
              </p>
            )}
            <Button
              onClick={handleStart}
              disabled={!ready || !!composePending}
              className="w-full"
              data-testid={`button-assign-players-${court.id}`}
            >
              {isCompose
                ? (composePending ? "Locking in…" : "Lock in for next game")
                : "Start Game"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── NextGamesDeck ───────────────────────────────────────────────────────────

export function NextGamesDeck({
  courts: courtsProp,
  queuePlayers,
  isSandboxSession,
  aiModeEnabled,
  teamAssignments,
  onTogglePlayerSelection,
  onAssignPlayers,
  assignCourtId,
  onOpenAssign,
  onComposeLineup,
  composeError,
  composePending,
}: NextGamesDeckProps) {
  const courts = sortCourts(courtsProp);
  const playingPlayerIds = courts.flatMap((c) => c.players.map((p) => p.id));
  const sessionId = courtsProp[0]?.sessionId;

  // Same query keys the strip uses, so these ride its cache (no extra fetch).
  const { data: suggestions = [] } = useQuery<Array<{ courtId: string; players: Array<{ playerId: string }> }>>({
    queryKey: ["/api/sessions", sessionId, "pending-suggestions"],
    enabled: !!sessionId,
  });
  const { data: sittingOutData } = useQuery<{ sittingOut: string[] }>({
    queryKey: ["/api/sessions", sessionId, "queue", "sitting-out"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/sessions/${sessionId}/queue/sitting-out`), {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      if (!res.ok) return { sittingOut: [] };
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 5000,
  });
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (courts.length === 0) return null;
  const assignCourt = courts.find((c) => c.id === assignCourtId) ?? null;

  // Carousel indicator tracking: nearest panel to the scroll position. Panels
  // are uniform width, so index math on the first panel's span is exact.
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.children.length === 0) return;
    const first = el.children[0] as HTMLElement;
    const span = first.offsetWidth + 12; // gap-3
    setActiveIdx(Math.max(0, Math.min(courts.length - 1, Math.round(el.scrollLeft / span))));
  };

  return (
    <section className="space-y-3" data-testid="next-games-deck">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground px-1">
        Next Games
      </h2>

      {/* Mobile: horizontal snap carousel, one panel per swipe — never
          stacked, so the deck adds at most one panel-height above the grid.
          md+: same two-column grid rhythm as the courts grid below. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex items-start overflow-x-auto snap-x snap-mandatory gap-3 pb-1 -mx-1 px-1 md:grid md:grid-cols-2 md:overflow-x-visible md:mx-0 md:px-0 md:gap-4"
      >
        {courts.map((court, courtIdx) => {
          const isAvailable = court.status === "available";
          return (
            <div
              key={court.id}
              ref={(el) => { panelRefs.current[court.id] = el; }}
              className="snap-center shrink-0 w-[calc(100vw-4rem)] max-w-[380px] md:w-auto md:max-w-none bg-card rounded-lg border border-border p-4 flex flex-col gap-3"
              data-testid={`deck-panel-${court.id}`}
            >
              {/* Panel header: court name + status */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-foreground leading-tight">
                  {court.name}
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-semibold",
                    isAvailable
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200",
                  )}
                  data-testid={`deck-status-${court.id}`}
                >
                  {isAvailable ? "Free" : "In Progress"}
                </Badge>
              </div>

              {/* The strip — same component as its old CourtCard mount.
                  earlierCourtIds (Gate 3): courts before this one in the
                  shared fixed order seed its exclude list, so sibling
                  panels stop proposing the same four players. */}
              <UpNextStrip
                court={court}
                queuePlayers={queuePlayers}
                playingPlayerIds={playingPlayerIds}
                isSandboxSession={isSandboxSession}
                aiModeEnabled={aiModeEnabled}
                earlierCourtIds={courts.slice(0, courtIdx).map((c) => c.id)}
                // The strip's link OPENS the compose sheet for this court;
                // the sheet's primary button is what submits (onComposeLineup).
                onComposeLineup={onComposeLineup ? onOpenAssign : undefined}
              />

              {/* Manual assignment lives in the deck now (free courts — the
                  assign endpoint only accepts available courts). */}
              {isAvailable && (
                <button
                  type="button"
                  onClick={() => onOpenAssign(court.id)}
                  className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                  data-testid={`button-assign-manually-${court.id}`}
                >
                  Assign manually
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Court-name indicators (mobile carousel only) */}
      {courts.length > 1 && (
        <div className="flex justify-center gap-1.5 md:hidden" data-testid="deck-indicators">
          {courts.map((court, i) => (
            <button
              key={court.id}
              type="button"
              onClick={() =>
                panelRefs.current[court.id]?.scrollIntoView({
                  behavior: "smooth", inline: "center", block: "nearest",
                })
              }
              className={cn(
                "px-2 py-1 rounded-full text-xs font-semibold transition-colors",
                i === activeIdx
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              data-testid={`deck-indicator-${court.id}`}
            >
              {court.name}
            </button>
          ))}
        </div>
      )}

      {/* Bottom sheet — ONE sheet, now THREE entry points: the deck link and
          the grid's free card (free courts → start a game), plus the strip's
          compose link (occupied courts → lock the next lineup). Gate 1. */}
      {assignCourt && (() => {
        const isCompose = assignCourt.status !== "available";
        const picked = teamAssignments[assignCourt.id] ?? { team1: [], team2: [] };
        const eligible = isCompose
          ? composeCandidates({
              queuePlayers,
              ownCourtPlayers: assignCourt.players ?? [],
              sittingOut: new Set(sittingOutData?.sittingOut ?? []),
              playing: new Set(playingPlayerIds),
              claimedElsewhere: new Set(
                suggestions
                  .filter((s) => s.courtId !== assignCourt.id)
                  .flatMap((s) => s.players.map((p) => p.playerId)),
              ),
              alreadyPicked: new Set<string>(),
              ownCourtIds: new Set((assignCourt.players ?? []).map((p) => p.id)),
            })
          : undefined;
        return (
          <AssignSheet
            open={true}
            onClose={() => onOpenAssign(null)}
            court={assignCourt}
            queuePlayers={queuePlayers}
            team1Players={picked.team1}
            team2Players={picked.team2}
            onTogglePlayerSelection={(playerId, team) =>
              onTogglePlayerSelection(assignCourt.id, playerId, team)
            }
            onAssignPlayers={isCompose ? (onComposeLineup ?? onAssignPlayers) : onAssignPlayers}
            mode={isCompose ? 'compose' : 'assign'}
            eligible={eligible}
            composeError={composeError}
            composePending={composePending}
          />
        );
      })()}
    </section>
  );
}
