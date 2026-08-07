import { useEffect, useRef, useState } from "react";
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
import { bandLabel, playerPassesBand } from "@/lib/bands";
import { friendlyMessage, isConflictError, conflictNames, conflictCopy } from "@/lib/errors";
import { formatSkillLevel } from "@shared/utils/skillUtils";
import { shouldAdoptAiResult } from "@/lib/aiAdoption";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Repeat2, X } from "lucide-react";

// Same shape the pending-suggestions endpoint returns (shared query key —
// TanStack dedupes, so this strip costs no extra network for lineup rows).
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
    gamesWaited?: number; // fairness receipts (hot-path gate)
    gamesThisSession?: number;
  }>;
};

// Shape of GET /api/courts/:courtId/suggestions (court bands Gate 2;
// rotation planner Gate 4 adds inGame + waiter/current counts)
type SuggestionPlayer = { id: string; name: string; level: string; skillScore: number; outsideBand: boolean; inGame?: boolean };
type SuggestionOption = {
  team1: SuggestionPlayer[]; team2: SuggestionPlayer[]; skillGap: number; team1Avg: number; team2Avg: number;
  uneven?: boolean; fromAI?: boolean; reason?: string;
};
type CourtSuggestionsResponse = {
  band: string;
  insufficientEligible?: boolean;
  eligibleCount?: number;
  relaxed?: boolean;
  fromAI?: boolean;
  // Gate 3: the server's small-pool fallback re-admitted players other
  // courts' suggestions already hold (duplicates allowed over false "no
  // players") — surfaced as a chip in the receipts row.
  sharedPool?: boolean;
  // Gate 4: in-band survivors of the strict claim tier. 0 with sharedPool
  // = FULL recycle → honest empty-pool state instead of a recycled lineup.
  strictEligibleCount?: number;
  // Gate 6: the base (non-blocking) response says an AI enrichment pass is
  // available — the client follows up with aiOnly=true.
  aiPending?: boolean;
  waiterCount?: number;
  currentCount?: number;
  uneven?: boolean; // best available option exceeds the fair-game gap
  // Fairness receipts per eligible player (counters the planner computes)
  receipts?: Record<string, { gamesWaited: number; gamesThisSession: number }>;
  options?: SuggestionOption[];
};

type ConflictReason = "playing" | "sitting out" | "left queue" | "double-booked";

interface UpNextStripProps {
  court: CourtWithPlayers;
  queuePlayers: Player[];
  playingPlayerIds: string[];
  isSandboxSession: boolean;
  // Gate 3: session-level "AI matchmaking" toggle — flows into the per-court
  // suggestion query key, so flipping it regenerates every court's lineup.
  aiModeEnabled: boolean;
  // Gate 3 (cross-court dedup): courts BEFORE this one in the shared fixed
  // order — their displayed ephemeral picks seed this court's exclude list
  // so sibling panels stop proposing the same four players.
  earlierCourtIds?: string[];
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

const gapOf = (team1: SuggestionPlayer[], team2: SuggestionPlayer[]) => {
  const avg = (t: SuggestionPlayer[]) => t.reduce((s, p) => s + (p.skillScore ?? 90), 0) / (t.length || 1);
  return Math.round(Math.abs(avg(team1) - avg(team2)) * 10) / 10;
};

// Up Next — the court card's next-game section. States, in priority order:
//   available + pending/approved row → confirm state (6b: countdown/Confirm & start)
//   occupied  + queued row           → LOCKED IN (swap via server, Undo)
//   occupied  + no row               → ephemeral suggestion (Gate 3): best
//     band-filtered match with Swap (local compose), Gap, Regenerate
//     (cycles ranked alternates), Confirm (pins via the existing queued
//     endpoint), Dismiss; amber insufficient-eligible state with the
//     nearest-tier relax action.
export function UpNextStrip({ court, queuePlayers, playingPlayerIds, isSandboxSession, aiModeEnabled, earlierCourtIds = [] }: UpNextStripProps) {
  const sessionId = court.sessionId;
  const band = (court as any).skillBand ?? "all_levels";
  // Gate 4: THIS court's on-court four — the only players allowed to repeat
  // (court-scoped; other courts' players are never offered here).
  const ownCourtIds = new Set((court.players ?? []).map((p) => p.id));

  const nameOfId = (id: string): string | undefined =>
    queuePlayers.find((p) => p.id === id)?.name ?? (court.players ?? []).find((p) => p.id === id)?.name;

  // Gate 4 (ratings): same data source as the court cards — the Player
  // objects. Compact "(NN)" on mobile; "M/F · Tier (NN)" from md up.
  const playerOfId = (id: string): Player | undefined =>
    queuePlayers.find((p) => p.id === id) ?? ((court.players ?? []) as Player[]).find((p) => p.id === id);
  const ratingScore = (id: string, fallbackScore?: number): number =>
    playerOfId(id)?.skillScore ?? fallbackScore ?? 90;
  const ratingFull = (id: string, fallbackScore?: number): string => {
    const p = playerOfId(id);
    const g = p?.gender === "Female" ? "F · " : p?.gender === "Male" ? "M · " : "";
    return `${g}${formatSkillLevel(ratingScore(id, fallbackScore))}`;
  };
  const RatingText = ({ id, fallbackScore }: { id: string; fallbackScore?: number }) => (
    <>
      {/* Full form only from lg: md deck panels are two-up (~360px) with
          half-width team columns, where "M · Tier (NN)" wraps rows to 100px+.
          The spec's own rule — full form at md+ IF it fits without wrapping —
          resolves to lg, where panels are wide enough. */}
      <span className="text-xs text-muted-foreground shrink-0 lg:hidden" data-testid={`text-rating-${court.id}-${id}`}>
        ({ratingScore(id, fallbackScore)})
      </span>
      <span className="text-xs text-muted-foreground shrink-0 hidden lg:inline">
        {ratingFull(id, fallbackScore)}
      </span>
    </>
  );

  // Conflict self-healing: plain copy (names when the payload has them),
  // then refetch this court's ladder — the fresh claims drop the conflicted
  // players from the pool automatically.
  const healConflict = (error: unknown) => {
    const names = conflictNames(error, nameOfId);
    toast({
      title: names.length > 0
        ? conflictCopy(names)
        : `${friendlyMessage(error, "That lineup just changed")} — refreshing this suggestion`,
    });
    setComposed(null);
    setOptionIdx(0);
    setEphemeralSwapSlot(null);
    queryClient.invalidateQueries({ queryKey: ["/api/courts", court.id, "suggestions"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "pending-suggestions"] });
  };

  // Cheap pre-validation before Confirm fires: members claimed by ANOTHER
  // court's open row, or mid-game on another court, make the call a
  // guaranteed conflict — heal from the cache without the round trip.
  const preflightConflictNames = (memberIds: string[]): string[] => {
    const claimedElsewhere = new Set(
      suggestions.filter((s) => s.courtId !== court.id).flatMap((s) => s.players.map((p) => p.playerId)),
    );
    return memberIds
      .filter((id) => claimedElsewhere.has(id) || (playingPlayerIds.includes(id) && !ownCourtIds.has(id)))
      .map((id) => nameOfId(id) ?? "")
      .filter(Boolean);
  };
  const preflightOrRun = (memberIds: string[], run: () => void) => {
    const stale = preflightConflictNames(memberIds);
    if (stale.length > 0) {
      healConflict({ status: 409, payload: { conflicts: stale.map((name) => ({ name })) } });
      return;
    }
    run();
  };

  // Fairness receipts: one microcopy line per player from counters the
  // planner already computes — waiters show their wait, currents their load.
  const receiptText = (
    r: { gamesWaited?: number; gamesThisSession?: number } | undefined,
    isCurrent: boolean,
  ): string | null => {
    if (!r || (r.gamesWaited === undefined && r.gamesThisSession === undefined)) return null;
    if (isCurrent) {
      const n = r.gamesThisSession ?? 0;
      return `${n} game${n === 1 ? "" : "s"}`;
    }
    const n = r.gamesWaited ?? 0;
    return `waited ${n} game${n === 1 ? "" : "s"}`;
  };
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [swapOutId, setSwapOutId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Ephemeral-suggestion state
  const [optionIdx, setOptionIdx] = useState(0);
  const [composed, setComposed] = useState<{ team1: SuggestionPlayer[]; team2: SuggestionPlayer[] } | null>(null);
  const [relax, setRelax] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [ephemeralSwapSlot, setEphemeralSwapSlot] = useState<{ team: 1 | 2; index: number } | null>(null);

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

  const queued = suggestions.find((s) => s.status === "queued" && s.courtId === court.id);
  const confirmRow = suggestions.find(
    (s) => (s.status === "pending" || s.status === "approved") && s.courtId === court.id,
  );
  const isOccupied = court.status === "occupied";
  // Fix c: a FREE court with no row gets a plan-ahead suggestion too — an
  // empty court is the one the captain can fill right now.
  const needSuggestion = !suggestionDismissed && (isOccupied ? !queued : !confirmRow);

  // Gate 3 (cross-court dedup): players currently DISPLAYED on earlier
  // courts' ephemeral suggestions. Persisted rows (locked/pending) are the
  // server's job; ephemerals never touch the DB, so only the client can see
  // them — read straight from the sibling query caches at fetch time (no
  // reactivity needed: every refetch snapshots the current cache, and the
  // ["/api/courts"] prefix invalidations below are what trigger refetches).
  const earlierEphemeralExcludes = (): string => {
    const out = new Set<string>();
    for (const earlierId of earlierCourtIds) {
      const entries = queryClient.getQueriesData<CourtSuggestionsResponse>({
        queryKey: ["/api/courts", earlierId, "suggestions"],
      });
      let newest: CourtSuggestionsResponse | undefined;
      let newestAt = -1;
      for (const [key, data] of entries) {
        const at = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
        if (data?.options?.length && at > newestAt) { newest = data; newestAt = at; }
      }
      const top = newest?.options?.[0];
      for (const p of [...(top?.team1 ?? []), ...(top?.team2 ?? [])]) out.add(p.id);
    }
    const ids = Array.from(out).slice(0, 64);
    return ids.length > 0 ? `&exclude=${encodeURIComponent(ids.join(","))}` : "";
  };

  // Gate 3: the court's ephemeral next-game suggestion. aiMode + relax are in
  // the key, so toggling AI (session-wide) or asking for nearest-tier players
  // triggers a fresh generation; a plain queue change does NOT (Regenerate is
  // the explicit refresh — keeps AI spend deliberate).
  // Gate 6: this base request is now ALWAYS instant — the server returns the
  // local ladder immediately with aiPending, so the separate free-court
  // "instant" query is gone (it existed only because this one blocked 10s).
  const { data: sugPrimary, isFetching: sugLoading, refetch: refetchSuggestion } = useQuery<CourtSuggestionsResponse>({
    queryKey: ["/api/courts", court.id, "suggestions", { aiMode: aiModeEnabled, relax }],
    queryFn: async () => {
      const res = await fetch(
        apiUrl(`/api/courts/${court.id}/suggestions?aiMode=${aiModeEnabled}&relax_band=${relax}${earlierEphemeralExcludes()}`),
        { headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` } },
      );
      if (!res.ok) throw new Error("Failed to generate suggestion");
      return res.json();
    },
    enabled: needSuggestion,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Gate 6: the async AI follow-up — fires once the base response says an AI
  // pass is worth it. Same endpoint, aiOnly=true: the server runs the
  // unchanged AI block (10s timeout, validation, local fallback) against the
  // freshest pool and returns the merged ladder.
  const { data: sugAi, isFetching: aiFetching, refetch: refetchAi } = useQuery<CourtSuggestionsResponse>({
    queryKey: ["/api/courts", court.id, "suggestions", { aiOnly: true, relax }],
    queryFn: async () => {
      const res = await fetch(
        apiUrl(`/api/courts/${court.id}/suggestions?aiMode=true&aiOnly=true&relax_band=${relax}${earlierEphemeralExcludes()}`),
        { headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` } },
      );
      if (!res.ok) throw new Error("Failed to enrich suggestion");
      return res.json();
    },
    enabled: needSuggestion && aiModeEnabled && !!sugPrimary?.aiPending,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Gate 6 race guard: a late AI result may replace the DISPLAY only while
  // the captain hasn't touched anything. Persisted rows (locked/confirm)
  // render from their own branches before this value is ever used — the
  // helper makes that rule explicit and unit-testable. "Use AI pick" below
  // is the one-tap adoption: clearing the edits is what adopts.
  const adoptAi = shouldAdoptAiResult({
    hasPersistedRow: !!queued || !!confirmRow,
    hasComposedEdit: composed !== null,
    swapSlotOpen: ephemeralSwapSlot !== null,
    cycledIndex: optionIdx,
  });
  // Adoption LATCHES per AI dataset (live-verify fix): selecting the display
  // straight off adoptAi oscillated — cycling/swapping on an adopted ladder
  // flipped the display to local, the reset effect wiped the edit, adoption
  // flipped back. The latch keeps the adopted ladder on screen through the
  // captain's edits; only fresh DATA (either query refetching) unlatches.
  const aiAdoptedRef = useRef(false);
  useEffect(() => { aiAdoptedRef.current = false; }, [sugPrimary, sugAi]);
  if (aiModeEnabled && sugAi && adoptAi) aiAdoptedRef.current = true;
  const sug = aiModeEnabled && sugAi && aiAdoptedRef.current ? sugAi : sugPrimary;
  const aiLandedButHeld =
    aiModeEnabled && !!sugAi && !aiAdoptedRef.current && !queued && !confirmRow;

  // New PRIMARY data ⇒ drop local edits and show the top option again
  // (the pool changed under the edits). Deliberately NOT keyed on sugAi:
  // an AI landing must never clear the captain's in-progress edits — that
  // is exactly the "edited" race the adoption guard protects. When edits
  // exist at landing, the result waits behind "Use AI pick" instead.
  useEffect(() => {
    setComposed(null);
    setOptionIdx(0);
    setEphemeralSwapSlot(null);
  }, [sugPrimary]);

  // Tick the countdown only while a real-session pending row is on screen.
  useEffect(() => {
    if (!confirmRow || isSandboxSession) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [confirmRow?.id, isSandboxSession]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/sessions", sessionId, "pending-suggestions"],
    });

  const swapMutation = useMutation({
    mutationFn: async ({ suggestionId, outPlayerId, inPlayerId }: { suggestionId: string; outPlayerId: string; inPlayerId: string }) =>
      apiRequest("PATCH", `/api/sessions/${sessionId}/suggestions/${suggestionId}/players`, { outPlayerId, inPlayerId }),
    onSuccess: () => {
      invalidate();
      // Gate 3 (cross-court invalidation): a committed swap moves a claim —
      // the swapped-IN player must vanish from sibling panels and the
      // swapped-OUT one become offerable, within one refetch, not one poll.
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      setSwapOutId(null);
      toast({ title: "Lineup updated" });
    },
    onError: (error: any) => {
      if (isConflictError(error)) {
        setSwapOutId(null);
        healConflict(error);
        return;
      }
      toast({
        title: "Couldn't swap player",
        description: friendlyMessage(error, "Try again"),
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (suggestionId: string) =>
      apiRequest("POST", `/api/sessions/${sessionId}/suggestions/${suggestionId}/dismiss`),
    onSuccess: () => {
      invalidate();
      // Gate 3 (cross-court invalidation): an Undo frees four claims —
      // sibling panels should offer those players again immediately.
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      setConfirmRemove(false);
      toast({ title: "Lineup unlocked" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't undo",
        description: friendlyMessage(error, "Try again"),
        variant: "destructive",
      });
    },
  });

  // Gate 6b: Confirm on the post-flip pending row — approve-and-PLACE.
  const confirmMutation = useMutation({
    mutationFn: async (suggestionId: string) =>
      apiRequest("POST", `/api/sessions/${sessionId}/suggestions/${suggestionId}/approve`),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"], exact: false });
      toast({ title: `Game started on ${court.name}` });
    },
    onError: (error: any) => {
      if (isConflictError(error)) {
        healConflict(error);
        return;
      }
      toast({
        title: "Couldn't start the game",
        description: friendlyMessage(error, "Try again"),
        variant: "destructive",
      });
    },
  });

  // Fix c: on a FREE court, Confirm starts the game immediately via the
  // existing assign endpoint (occupies the court, removes from queue,
  // mirrors the suggestion — no parallel mechanism).
  const startNowMutation = useMutation({
    mutationFn: async (teams: { team1: SuggestionPlayer[]; team2: SuggestionPlayer[] }) =>
      apiRequest("POST", `/api/courts/${court.id}/assign`, {
        sessionId,
        teamAssignments: [
          ...teams.team1.map((p) => ({ playerId: p.id, team: 1 })),
          ...teams.team2.map((p) => ({ playerId: p.id, team: 2 })),
        ],
      }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"], exact: false });
      toast({ title: `Game started on ${court.name}` });
    },
    onError: (error: any) => {
      if (isConflictError(error)) {
        healConflict(error);
        return;
      }
      toast({
        title: "Couldn't start the game",
        description: friendlyMessage(error, "Try again"),
        variant: "destructive",
      });
    },
  });

  // Gate 3: Confirm the EPHEMERAL suggestion — pins it as the court's queued
  // lineup through the existing endpoint (captain source, one-per-court
  // index, game-end promotion — no parallel mechanism).
  const pinMutation = useMutation({
    mutationFn: async (teams: { team1: SuggestionPlayer[]; team2: SuggestionPlayer[] }) =>
      apiRequest("POST", `/api/courts/${court.id}/queued-suggestion`, {
        sessionId,
        teamAssignments: [
          ...teams.team1.map((p) => ({ playerId: p.id, team: 1 })),
          ...teams.team2.map((p) => ({ playerId: p.id, team: 2 })),
        ],
      }),
    onSuccess: () => {
      invalidate();
      // Stale cross-court fix: locking here must refresh every court's
      // ephemeral suggestion ladder (the ["/api/courts"] prefix), exactly
      // like game-end, start-now and fill-all already do — otherwise other
      // courts keep offering the players this lock just claimed.
      queryClient.invalidateQueries({ queryKey: ["/api/courts"], exact: false });
      toast({ title: `Locked in for ${court.name}` });
    },
    onError: (error: any) => {
      if (isConflictError(error)) {
        healConflict(error);
        return;
      }
      toast({
        title: "Couldn't lock in the lineup",
        description: friendlyMessage(error, "Try again"),
        variant: "destructive",
      });
    },
  });

  if (!isOccupied && confirmRow) {
    // ── 6b confirm state: post-flip pending/approved row on the freed court ──
    const t1 = confirmRow.players.filter((p) => p.team === 1);
    const t2 = confirmRow.players.filter((p) => p.team === 2);
    const isCaptainRow = confirmRow.source === "captain";
    const remainingMs = confirmRow.pendingUntil ? new Date(confirmRow.pendingUntil).getTime() - now : 0;
    // Gate 4: Confirm-to-START is gated until every member is off court —
    // a member still mid-game (on any court) blocks placement.
    const busyMembers = confirmRow.players.filter((p) => playingPlayerIds.includes(p.playerId));
    const memberLabel = (p: { playerId: string; name: string }) =>
      playingPlayerIds.includes(p.playerId)
        ? `${p.name} (${ratingScore(p.playerId)}) — in game`
        : `${p.name} (${ratingScore(p.playerId)})`;
    const statusLine =
      busyMembers.length > 0
        ? `Waiting for ${busyMembers.map((p) => p.name).join(", ")} to finish`
        : confirmRow.status === "approved"
          ? "Ready to start"
          : isSandboxSession
            ? "Waiting for your confirm"
            : remainingMs > 0
              ? `Auto-confirms in ${formatCountdown(remainingMs)}`
              : "Confirming…";
    return (
      <div
        className="mt-1 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 space-y-2"
        data-testid={`strip-up-next-${court.id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            Up next
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs shrink-0",
              isCaptainRow ? "text-secondary border-secondary/40" : "text-muted-foreground border-muted-foreground/40",
            )}
          >
            {isCaptainRow ? "Captain" : "Auto"}
          </Badge>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {t1.map(memberLabel).join(" + ")} vs {t2.map(memberLabel).join(" + ")}
          </span>
        </div>
        <div className="space-y-2">
          <span className="block text-xs text-muted-foreground" data-testid={`text-up-next-confirm-state-${court.id}`}>
            {statusLine}
          </span>
          <Button
            className="w-full h-12 text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90"
            disabled={confirmMutation.isPending || busyMembers.length > 0}
            onClick={() =>
              preflightOrRun(
                confirmRow.players.map((p) => p.playerId),
                () => confirmMutation.mutate(confirmRow.id),
              )
            }
            data-testid={`button-up-next-confirm-${court.id}`}
          >
            Confirm &amp; start
          </Button>
        </div>
      </div>
    );
  }

  const queueIds = new Set(queuePlayers.map((p) => p.id));
  const sittingOut = new Set(sittingOutData?.sittingOut ?? []);
  const playing = new Set(playingPlayerIds);

  // ── LOCKED IN: a queued lineup holds the slot ──────────────────────────────
  if (queued) {
    const onOtherLineup = new Set(
      suggestions.filter((s) => s.id !== queued.id).flatMap((s) => s.players.map((p) => p.playerId)),
    );
    // Gate 4: this court's OWN current players are legal repeats — they get
    // an "In game" marker, never a conflict flag. Everyone else keeps the
    // full conflict matrix (cross-court claims unchanged).
    const conflictFor = (playerId: string): ConflictReason | null => {
      if (ownCourtIds.has(playerId)) return null;
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

    // Gate 4: the swap picker also offers this court's OWN current players
    // (marked "In game") — the server's court-scoped exemption accepts them.
    const ownCourtSwapIns = (court.players ?? []).filter(
      (p) =>
        !sittingOut.has(p.id) &&
        !onOtherLineup.has(p.id) &&
        !queued.players.some((qp) => qp.playerId === p.id),
    );
    const swapCandidates = [
      ...queuePlayers.filter(
        (p) =>
          !sittingOut.has(p.id) &&
          !playing.has(p.id) &&
          !onOtherLineup.has(p.id) &&
          !queued.players.some((qp) => qp.playerId === p.id),
      ),
      ...ownCourtSwapIns,
    ];
    const inBandCandidates = swapCandidates.filter((p) => playerPassesBand(band, p.level));
    const outBandCandidates = swapCandidates.filter((p) => !playerPassesBand(band, p.level));

    const teamChips = (team: typeof team1, label: string) => (
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
        <div className="space-y-1">
          {team.map((p) => {
            const conflict = conflictFor(p.playerId);
            return (
              <div key={p.playerId} className="flex items-center gap-2 flex-wrap" data-testid={`upnext-player-${court.id}-${p.playerId}`}>
                <span className={cn("text-sm truncate", conflict ? "text-amber-600" : "text-foreground")}>{p.name}</span>
                <RatingText id={p.playerId} />
                {receiptText(p, ownCourtIds.has(p.playerId)) && (
                  <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-receipt-locked-${court.id}-${p.playerId}`}>
                    {receiptText(p, ownCourtIds.has(p.playerId))}
                  </span>
                )}
                {ownCourtIds.has(p.playerId) && (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground border-muted-foreground/30 shrink-0"
                    data-testid={`badge-upnext-ingame-${court.id}-${p.playerId}`}
                  >
                    In game
                  </Badge>
                )}
                {conflict && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                    {conflict}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-muted-foreground"
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

    const candidateButtons = (players: Player[]) =>
      players.map((p) => (
        <Button
          key={p.id}
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={swapMutation.isPending}
          onClick={() => swapMutation.mutate({ suggestionId: queued.id, outPlayerId: swapOutId!, inPlayerId: p.id })}
          data-testid={`button-upnext-swap-in-${court.id}-${p.id}`}
        >
          {p.name}
          <span className="text-muted-foreground ml-1">({p.skillScore ?? 90})</span>
          {ownCourtIds.has(p.id) && <span className="text-muted-foreground ml-1">· In game</span>}
        </Button>
      ));

    return (
      <div className="mt-1" data-testid={`strip-up-next-${court.id}`}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left"
          data-testid={`button-up-next-toggle-${court.id}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary shrink-0">
            Up next · Locked in
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
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" data-testid={`icon-up-next-conflict-${court.id}`} />
          )}
          <span className="text-xs text-muted-foreground truncate flex-1">
            {team1.map((p) => p.name).join(" + ")} vs {team2.map((p) => p.name).join(" + ")}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="mt-2 rounded-md border border-border p-3 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {teamChips(team1, "Team 1")}
              {teamChips(team2, "Team 2")}
            </div>

            {swapOutId && (
              <div className="space-y-2" data-testid={`upnext-swap-picker-${court.id}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Swap in from queue</p>
                {inBandCandidates.length === 0 && outBandCandidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No eligible players in the queue</p>
                ) : (
                  <>
                    {inBandCandidates.length > 0 && (
                      <div className="flex flex-wrap gap-2">{candidateButtons(inBandCandidates)}</div>
                    )}
                    {outBandCandidates.length > 0 && (
                      <>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide pt-1">Outside band</p>
                        <div className="flex flex-wrap gap-2">{candidateButtons(outBandCandidates)}</div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setConfirmRemove(true)}
              disabled={removeMutation.isPending}
              data-testid={`button-up-next-remove-${court.id}`}
            >
              <X className="h-4 w-4 mr-1" />
              Undo
            </Button>
          </div>
        )}

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlock this lineup?</AlertDialogTitle>
              <AlertDialogDescription>
                The running game is untouched. A fresh suggestion will take its place.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeMutation.mutate(queued.id)} data-testid={`button-up-next-remove-confirm-${court.id}`}>
                Undo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── EPHEMERAL SUGGESTION (Gate 3): no lineup yet — show the best match ────
  if (suggestionDismissed) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2" data-testid={`strip-up-next-${court.id}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Up next</span>
        <span className="text-xs text-muted-foreground flex-1">No lineup suggested</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0"
          onClick={() => { setSuggestionDismissed(false); setRelax(false); }}
          data-testid={`button-up-next-resuggest-${court.id}`}
        >
          Suggest a lineup
        </Button>
      </div>
    );
  }

  if (!sug) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2" data-testid={`strip-up-next-${court.id}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Up next</span>
        <span className="text-xs text-muted-foreground flex-1" data-testid={`text-up-next-preparing-${court.id}`}>
          Finding best matches…
        </span>
      </div>
    );
  }

  // Gate 4: say WHY a lineup can't be built, plainly — never the old
  // ambiguous "Waiting for players".
  const totalKnown = queuePlayers.length + (court.players?.length ?? 0);
  const claimedAwareCopy =
    totalKnown < 4
      ? "Not enough players in the session yet"
      : "All players are in games or already lined up";

  if (sug.insufficientEligible) {
    const isAllLevels = (sug.band ?? "all_levels") === "all_levels";
    return (
      <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-2" data-testid={`strip-up-next-${court.id}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 shrink-0">Up next</span>
          <span className="text-xs text-amber-700 flex-1" data-testid={`text-up-next-insufficient-${court.id}`}>
            {isAllLevels
              ? claimedAwareCopy
              : `Only ${sug.eligibleCount ?? 0} eligible ${bandLabel(sug.band)} players available`}
          </span>
        </div>
        {!isAllLevels && !relax && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full border-amber-300 text-amber-700"
            onClick={() => setRelax(true)}
            data-testid={`button-up-next-relax-${court.id}`}
          >
            Suggest nearest-tier players instead
          </Button>
        )}
      </div>
    );
  }

  const options = sug.options ?? [];
  if (options.length === 0) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2" data-testid={`strip-up-next-${court.id}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Up next</span>
        <span className="text-xs text-muted-foreground flex-1" data-testid={`text-up-next-empty-${court.id}`}>
          {claimedAwareCopy}
        </span>
      </div>
    );
  }

  // Gate 4 (honest empty-pool): FULL recycle — every eligible waiter is
  // already booked to earlier courts' lineups, so the fallback could only
  // recycle them. Say so instead of showing a recycled lineup. Partial
  // overlap (strictEligibleCount > 0) keeps the lineup + Shared-pool chip.
  if (sug.sharedPool && (sug.strictEligibleCount ?? 0) === 0 && !composed) {
    return (
      <div
        className="mt-1 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 space-y-2"
        data-testid={`strip-up-next-${court.id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Up next</span>
          <span className="text-xs text-muted-foreground flex-1" data-testid={`text-up-next-full-recycle-${court.id}`}>
            All waiters are booked to earlier courts — this lineup fills as games finish
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground w-full"
          disabled={sugLoading || aiFetching}
          onClick={() => refetchSuggestion()}
          data-testid={`button-up-next-regenerate-${court.id}`}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Regenerate
        </Button>
      </div>
    );
  }

  const baseOption = options[optionIdx % options.length];
  const current = composed ?? { team1: baseOption.team1, team2: baseOption.team2 };
  const gap = gapOf(current.team1, current.team2);
  // Per-option AI badge: backfilled locals in a merged set carry no badge.
  const showAITag = !composed && !!baseOption.fromAI;

  const lineupIds = new Set([...current.team1, ...current.team2].map((p) => p.id));
  const onAnySuggestion = new Set(suggestions.flatMap((s) => s.players.map((p) => p.playerId)));
  // Gate 4: this court's own current players are swap-in candidates too
  // (marked "In game", court-scoped — never other courts' players).
  const ephemeralCandidates = [
    ...queuePlayers.filter(
      (p) => !sittingOut.has(p.id) && !playing.has(p.id) && !onAnySuggestion.has(p.id) && !lineupIds.has(p.id),
    ),
    ...(court.players ?? []).filter(
      (p) => !sittingOut.has(p.id) && !onAnySuggestion.has(p.id) && !lineupIds.has(p.id),
    ),
  ];
  const inBandEph = ephemeralCandidates.filter((p) => playerPassesBand(band, p.level));
  const outBandEph = ephemeralCandidates.filter((p) => !playerPassesBand(band, p.level));

  const doEphemeralSwap = (incoming: Player) => {
    if (!ephemeralSwapSlot) return;
    const asSugPlayer: SuggestionPlayer = {
      id: incoming.id,
      name: incoming.name,
      level: incoming.level,
      skillScore: incoming.skillScore ?? 90,
      outsideBand: !playerPassesBand(band, incoming.level),
      inGame: ownCourtIds.has(incoming.id),
    };
    const next = { team1: [...current.team1], team2: [...current.team2] };
    if (ephemeralSwapSlot.team === 1) next.team1[ephemeralSwapSlot.index] = asSugPlayer;
    else next.team2[ephemeralSwapSlot.index] = asSugPlayer;
    setComposed(next);
    setEphemeralSwapSlot(null);
  };

  const suggestionTeam = (team: SuggestionPlayer[], teamNo: 1 | 2, label: string) => (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="space-y-1">
        {team.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 flex-wrap" data-testid={`upnext-sug-player-${court.id}-${p.id}`}>
            <span className="text-sm truncate">{p.name}</span>
            <RatingText id={p.id} fallbackScore={p.skillScore} />
            {receiptText(sug?.receipts?.[p.id], !!p.inGame) && (
              <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-receipt-${court.id}-${p.id}`}>
                {receiptText(sug?.receipts?.[p.id], !!p.inGame)}
              </span>
            )}
            {p.inGame && (
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground border-muted-foreground/30 shrink-0"
                data-testid={`badge-upnext-sug-ingame-${court.id}-${p.id}`}
              >
                In game
              </Badge>
            )}
            {p.outsideBand && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                Outside band
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() =>
                setEphemeralSwapSlot(
                  ephemeralSwapSlot?.team === teamNo && ephemeralSwapSlot?.index === i ? null : { team: teamNo, index: i },
                )
              }
              data-testid={`button-upnext-sug-swap-${court.id}-${p.id}`}
            >
              <Repeat2 className="h-3 w-3 mr-1" />
              Swap
            </Button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 space-y-2" data-testid={`strip-up-next-${court.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Up next</span>
        {showAITag && (
          <Badge variant="outline" className="text-xs text-secondary border-secondary/40 shrink-0" data-testid={`badge-up-next-ai-${court.id}`}>
            AI
          </Badge>
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0" data-testid={`text-up-next-gap-${court.id}`}>
          Gap {gap}
        </span>
        {sug.relaxed && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
            Nearest tier
          </Badge>
        )}
        {sug.sharedPool && (
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground border-muted-foreground/30 shrink-0"
            data-testid={`badge-shared-pool-${court.id}`}
          >
            Shared pool
          </Badge>
        )}
        {!composed && (baseOption.uneven ?? sug.uneven) && (
          <span
            className="text-xs text-muted-foreground shrink-0"
            data-testid={`text-up-next-uneven-${court.id}`}
          >
            Best available — teams uneven
          </span>
        )}
        {sugLoading && (
          <span className="text-xs text-muted-foreground shrink-0 animate-pulse">
            Finding best matches…
          </span>
        )}
        {/* Gate 6: async AI status — enrichment in flight, or landed while
            the captain was mid-edit (one tap adopts by clearing the edits). */}
        {aiFetching && (
          <span
            className="text-xs text-muted-foreground shrink-0 animate-pulse"
            data-testid={`text-up-next-ai-pending-${court.id}`}
          >
            Improving with AI…
          </span>
        )}
        {aiLandedButHeld && !aiFetching && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-secondary border-secondary/40 shrink-0"
            onClick={() => { setComposed(null); setEphemeralSwapSlot(null); setOptionIdx(0); }}
            data-testid={`button-up-next-use-ai-${court.id}`}
          >
            Use AI pick
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {suggestionTeam(current.team1, 1, "Team 1")}
        {suggestionTeam(current.team2, 2, "Team 2")}
      </div>

      {/* Gate 6: the why-line — the option's reason as one quiet line under
          the lineup (relocated from the meta row; same testid). */}
      {!composed && baseOption.reason && (
        <p
          className="text-xs text-secondary"
          data-testid={`text-up-next-reason-${court.id}`}
        >
          {baseOption.reason}
        </p>
      )}

      {ephemeralSwapSlot && (
        <div className="space-y-2" data-testid={`upnext-sug-swap-picker-${court.id}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Swap in from queue</p>
          {inBandEph.length === 0 && outBandEph.length === 0 ? (
            <p className="text-xs text-muted-foreground">No eligible players in the queue</p>
          ) : (
            <>
              {inBandEph.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inBandEph.map((p) => (
                    <Button key={p.id} size="sm" variant="outline" className="h-8 text-xs" onClick={() => doEphemeralSwap(p)} data-testid={`button-upnext-sug-swap-in-${court.id}-${p.id}`}>
                      {p.name}
                      <span className="text-muted-foreground ml-1">({p.skillScore ?? 90})</span>
                      {receiptText(sug?.receipts?.[p.id], ownCourtIds.has(p.id)) && (
                        <span className="text-muted-foreground ml-1">· {receiptText(sug?.receipts?.[p.id], ownCourtIds.has(p.id))}</span>
                      )}
                      {ownCourtIds.has(p.id) && <span className="text-muted-foreground ml-1">· In game</span>}
                    </Button>
                  ))}
                </div>
              )}
              {outBandEph.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide pt-1">Outside band</p>
                  <div className="flex flex-wrap gap-2">
                    {outBandEph.map((p) => (
                      <Button key={p.id} size="sm" variant="outline" className="h-8 text-xs" onClick={() => doEphemeralSwap(p)} data-testid={`button-upnext-sug-swap-in-out-${court.id}-${p.id}`}>
                        {p.name}
                        <span className="text-muted-foreground ml-1">({p.skillScore ?? 90})</span>
                        {receiptText(sug?.receipts?.[p.id], ownCourtIds.has(p.id)) && (
                          <span className="text-muted-foreground ml-1">· {receiptText(sug?.receipts?.[p.id], ownCourtIds.has(p.id))}</span>
                        )}
                        {ownCourtIds.has(p.id) && <span className="text-muted-foreground ml-1">· In game</span>}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Thumb-sized primary: full-width 48px teal Confirm; Regenerate and
          Dismiss demote to compact text actions below. */}
      <div className="space-y-2">
        <Button
          className="w-full h-12 text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90"
          disabled={isOccupied ? pinMutation.isPending : startNowMutation.isPending}
          onClick={() =>
            preflightOrRun(
              [...current.team1, ...current.team2].map((p) => p.id),
              () => (isOccupied ? pinMutation.mutate(current) : startNowMutation.mutate(current)),
            )
          }
          data-testid={`button-up-next-lock-${court.id}`}
        >
          {isOccupied ? "Confirm — starts when game ends" : "Confirm — start now"}
        </Button>
        <div className="flex items-center justify-center gap-6">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            disabled={sugLoading || aiFetching}
            onClick={() => {
              if (composed) { setComposed(null); return; }
              // Cycle the merged ladder; when exhausted, refetch — which may
              // fire a fresh AI call (one per exhaust, see gate report).
              if (optionIdx + 1 < options.length) setOptionIdx(optionIdx + 1);
              // Gate 6: exhausting the ladder goes straight to the AI path
              // when AI is on (spinner above); local refresh otherwise.
              else { setOptionIdx(0); if (aiModeEnabled) refetchAi(); else refetchSuggestion(); }
            }}
            data-testid={`button-up-next-regenerate-${court.id}`}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setSuggestionDismissed(true)}
            data-testid={`button-up-next-dismiss-${court.id}`}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
