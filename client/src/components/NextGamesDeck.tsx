import { useRef, useState } from "react";
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

// ─── NextGamesDeck ───────────────────────────────────────────────────────────

export function NextGamesDeck({
  courts: courtsProp,
  queuePlayers,
  isSandboxSession,
  aiModeEnabled,
  teamAssignments,
  onTogglePlayerSelection,
  onAssignPlayers,
}: NextGamesDeckProps) {
  const courts = sortCourts(courtsProp);
  const playingPlayerIds = courts.flatMap((c) => c.players.map((p) => p.id));
  const [assignCourtId, setAssignCourtId] = useState<string | null>(null);
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
        className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 -mx-1 px-1 md:grid md:grid-cols-2 md:overflow-x-visible md:mx-0 md:px-0 md:gap-4"
      >
        {courts.map((court) => {
          const isAvailable = court.status === "available";
          return (
            <div
              key={court.id}
              ref={(el) => { panelRefs.current[court.id] = el; }}
              className="snap-center shrink-0 w-[calc(100vw-4rem)] max-w-[380px] md:w-auto md:max-w-none bg-card rounded-xl border border-border p-4 flex flex-col gap-3"
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

              {/* The strip, unchanged — same component, same props as its old
                  CourtCard mount. It decides its own states per court. */}
              <UpNextStrip
                court={court}
                queuePlayers={queuePlayers}
                playingPlayerIds={playingPlayerIds}
                isSandboxSession={isSandboxSession}
                aiModeEnabled={aiModeEnabled}
              />

              {/* Manual assignment lives in the deck now (free courts — the
                  assign endpoint only accepts available courts). */}
              {isAvailable && (
                <button
                  type="button"
                  onClick={() => setAssignCourtId(court.id)}
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
                "px-2 py-1 rounded-full text-[11px] font-semibold transition-colors",
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

      {/* Bottom sheet (free courts only) — same sheet, new home */}
      {assignCourt && assignCourt.status === "available" && (
        <AssignSheet
          open={true}
          onClose={() => setAssignCourtId(null)}
          court={assignCourt}
          queuePlayers={queuePlayers}
          team1Players={teamAssignments[assignCourt.id]?.team1 ?? []}
          team2Players={teamAssignments[assignCourt.id]?.team2 ?? []}
          onTogglePlayerSelection={(playerId, team) =>
            onTogglePlayerSelection(assignCourt.id, playerId, team)
          }
          onAssignPlayers={onAssignPlayers}
        />
      )}
    </section>
  );
}
