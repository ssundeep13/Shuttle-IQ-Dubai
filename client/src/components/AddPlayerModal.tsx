import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertPlayerSchema, Player } from "@shared/schema";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Search, UserPlus, Users, Trophy, Target, Check,
  Ticket, UserCheck, Link2Off, CreditCard, Banknote,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatSkillLevel, getTierDisplayName } from "@shared/utils/skillUtils";
import { cn } from "@/lib/utils";
import { SamePersonSheet } from "@/components/SamePersonSheet";
import type { PlayerCandidate } from "@shared/utils/playerMatching";

interface AddPlayerModalProps {
  open: boolean;
  onClose: () => void;
  onAddPlayer: (name: string, gender: string, level: string) => void;
  sessionId?: string;
  queuePlayerIds?: string[];
}

interface BookedEntry {
  bookingId: string;
  bookingStatus: string;
  attendedAt: string | null;
  paymentMethod: string;
  cashPaid: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    linkedPlayerId: string | null;
  } | null;
  player: Player | null;
  // Extra paid spots with no booker profile. linkedPlayerId is the effective
  // player (account guest, or one auto-created on a prior check-in); null = a
  // pure guest who needs a player minted on check-in.
  guests: { guestId: string; name: string; linkedPlayerId: string | null }[];
}

interface BookingsResponse {
  linked: boolean;
  bookings: BookedEntry[];
}

const formSchema = insertPlayerSchema.extend({
  name: z.string().min(1, "Player name is required"),
  gender: z.enum(["Male", "Female"]),
  level: z.enum([
    "Novice",
    "Beginner",
    "lower_intermediate",
    "upper_intermediate",
    "Advanced",
    "Professional",
  ]),
  skillScore: z.number().min(10).max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddPlayerModal({
  open,
  onClose,
  onAddPlayer,
  sessionId,
  queuePlayerIds = [],
}: AddPlayerModalProps) {
  // Default to 'registry' when a session exists, otherwise 'new'
  const [activeTab, setActiveTab] = useState<"new" | "registry" | "booked">(
    sessionId ? "registry" : "new",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedBookedPlayerIds, setSelectedBookedPlayerIds] = useState<string[]>([]);
  const [bookedBookingMap, setBookedBookingMap] = useState<Record<string, string>>({});
  // Guest slots are selected by guestId (they may have no player yet).
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [guestSelectionMap, setGuestSelectionMap] = useState<
    Record<string, { bookingId: string; linkedPlayerId: string | null }>
  >({});
  // Captain-picked gender for PURE guests only (no profile yet). Required before
  // a selected pure guest can be added; linked guests already have a gender.
  const [guestGenderMap, setGuestGenderMap] = useState<Record<string, "Male" | "Female">>({});
  const [isSubmittingBooked, setIsSubmittingBooked] = useState(false);
  // P1a same-person sheet: when ensure-player returns candidates instead of a
  // player, the guest loop pauses on this promise until the captain resolves
  // (tap a candidate to link, "New player" to create, dismiss to skip).
  const [guestPrompt, setGuestPrompt] = useState<{
    guestName: string;
    candidates: PlayerCandidate[];
    resolve: (choice: { linkToPlayerId: string } | { forceNew: true } | null) => void;
  } | null>(null);
  const { toast } = useToast();

  const hasActiveSession = !!sessionId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      gender: "Male",
      level: "lower_intermediate",
      skillScore: 80,
      gamesPlayed: 0,
      wins: 0,
      status: "waiting",
    },
  });

  const { data: allPlayers = [], isLoading: isLoadingPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: open && activeTab === "registry",
  });

  const { data: bookingsResponse, isLoading: isLoadingBooked } =
    useQuery<BookingsResponse>({
      queryKey: ["/api/sessions", sessionId, "bookings"],
      enabled: open && !!sessionId,
    });

  const hasLinkedBookableSession = bookingsResponse?.linked ?? false;
  const bookedEntries = bookingsResponse?.bookings ?? [];

  const addToQueueMutation = useMutation({
    mutationFn: async (playerId: string) =>
      apiRequest("POST", `/api/queue/${playerId}`, sessionId ? { sessionId } : undefined),
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add player to queue",
        variant: "destructive",
      });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string }) =>
      apiRequest("PATCH", `/api/sessions/${sessionId}/bookings/${bookingId}/checkin`),
  });

  const filteredPlayers = allPlayers.filter((player) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.shuttleIqId?.toLowerCase().includes(query)
    );
  });

  const isPlayerInQueue = (playerId: string) => queuePlayerIds.includes(playerId);

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
    );
  };

  const toggleBookedPlayerSelection = (playerId: string, bookingId: string) => {
    setSelectedBookedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        const newMap = { ...bookedBookingMap };
        delete newMap[playerId];
        setBookedBookingMap(newMap);
        return prev.filter((id) => id !== playerId);
      } else {
        setBookedBookingMap((prev2) => ({ ...prev2, [playerId]: bookingId }));
        return [...prev, playerId];
      }
    });
  };

  const handleAddSelectedPlayers = async () => {
    if (selectedPlayerIds.length === 0) return;
    let successCount = 0;
    for (const playerId of selectedPlayerIds) {
      try {
        await addToQueueMutation.mutateAsync(playerId);
        successCount++;
      } catch {}
    }
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"], exact: false });
      toast({
        title: "Players Added",
        description: `${successCount} player${successCount > 1 ? "s" : ""} added to the queue`,
      });
    }
    setSelectedPlayerIds([]);
    setSearchQuery("");
    onClose();
  };

  const handleAddBookedPlayers = async () => {
    if (selectedBookedPlayerIds.length === 0 && selectedGuestIds.length === 0) return;
    if (isSubmittingBooked) return;
    setIsSubmittingBooked(true);
    let successCount = 0;
    try {
      // Registered bookers — unchanged path.
      for (const playerId of selectedBookedPlayerIds) {
        try {
          await addToQueueMutation.mutateAsync(playerId);
          const bookingId = bookedBookingMap[playerId];
          if (bookingId) await checkinMutation.mutateAsync({ bookingId });
          successCount++;
        } catch {}
      }
      // Guests — linked guest reuses its player id; pure guest is minted server-
      // side (idempotent ensure-player), then both go through the same queue +
      // booking-level check-in path.
      for (const guestId of selectedGuestIds) {
        try {
          const sel = guestSelectionMap[guestId];
          if (!sel) continue;
          let playerId = sel.linkedPlayerId;
          if (!playerId) {
            // Pure guest — needs the captain's gender choice. (UI blocks submit
            // without it; this is a defensive skip.)
            const gender = guestGenderMap[guestId];
            if (!gender) continue;
            const ensureUrl = `/api/sessions/${sessionId}/guests/${guestId}/ensure-player`;
            let resp = await apiRequest<{
              playerId?: string;
              candidates?: PlayerCandidate[];
              guestName?: string;
            }>("POST", ensureUrl, { gender });
            // P1a: server found existing players who look like this guest —
            // pause for the captain's one-tap decision, then retry with it.
            if (!resp.playerId && resp.candidates && resp.candidates.length > 0) {
              const choice = await new Promise<
                { linkToPlayerId: string } | { forceNew: true } | null
              >((resolve) =>
                setGuestPrompt({
                  guestName: resp.guestName ?? "this guest",
                  candidates: resp.candidates!,
                  resolve,
                }),
              );
              setGuestPrompt(null);
              if (!choice) continue; // dismissed — leave this guest for later
              resp = await apiRequest("POST", ensureUrl, { gender, ...choice });
            }
            playerId = resp.playerId ?? null;
          }
          if (!playerId) continue;
          await addToQueueMutation.mutateAsync(playerId);
          await checkinMutation.mutateAsync({ bookingId: sel.bookingId });
          successCount++;
        } catch {}
      }
    } finally {
      setIsSubmittingBooked(false);
    }
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/players"], exact: false });
      queryClient.invalidateQueries({
        queryKey: ["/api/sessions", sessionId, "bookings"],
      });
      toast({
        title: "Players Added & Checked In",
        description: `${successCount} player${successCount > 1 ? "s" : ""} added to queue and checked in`,
      });
    }
    setSelectedBookedPlayerIds([]);
    setBookedBookingMap({});
    setSelectedGuestIds([]);
    setGuestSelectionMap({});
    setGuestGenderMap({});
    onClose();
  };

  const handleSubmit = (values: FormValues) => {
    onAddPlayer(values.name, values.gender, values.level);
    form.reset();
    onClose();
  };

  const handleClose = () => {
    form.reset();
    setSelectedPlayerIds([]);
    setSelectedBookedPlayerIds([]);
    setBookedBookingMap({});
    setSelectedGuestIds([]);
    setGuestSelectionMap({});
    setGuestGenderMap({});
    setSearchQuery("");
    setActiveTab(sessionId ? "registry" : "new");
    onClose();
  };

  const selectablePlayersCount = filteredPlayers.filter(
    (p) => !isPlayerInQueue(p.id),
  ).length;
  const allSelectableSelected =
    selectablePlayersCount > 0 &&
    filteredPlayers
      .filter((p) => !isPlayerInQueue(p.id))
      .every((p) => selectedPlayerIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedPlayerIds([]);
    } else {
      const selectableIds = filteredPlayers
        .filter((p) => !isPlayerInQueue(p.id))
        .map((p) => p.id);
      setSelectedPlayerIds(selectableIds);
    }
  };

  const selectableBookedEntries = bookedEntries.filter(
    (e) => e.player && !isPlayerInQueue(e.player.id) && !e.attendedAt,
  );
  // Guest slots (extra paid spots). Selectable unless the booking is already
  // checked in, or a linked guest's player is already queued.
  const allGuests = bookedEntries.flatMap((e) =>
    e.guests.map((g) => ({ ...g, bookingId: e.bookingId, attendedAt: e.attendedAt })),
  );
  const selectableGuests = allGuests.filter(
    (g) => !g.attendedAt && !(g.linkedPlayerId && isPlayerInQueue(g.linkedPlayerId)),
  );
  const toggleGuestSelection = (
    guestId: string,
    bookingId: string,
    linkedPlayerId: string | null,
  ) => {
    setSelectedGuestIds((prev) => {
      if (prev.includes(guestId)) {
        setGuestSelectionMap((m) => {
          const next = { ...m };
          delete next[guestId];
          return next;
        });
        return prev.filter((id) => id !== guestId);
      }
      setGuestSelectionMap((m) => ({ ...m, [guestId]: { bookingId, linkedPlayerId } }));
      return [...prev, guestId];
    });
  };

  const setGuestGender = (guestId: string, gender: "Male" | "Female") => {
    setGuestGenderMap((m) => ({ ...m, [guestId]: gender }));
  };

  // Selected PURE guests (no profile) still missing a gender choice block submit.
  const pureGuestsNeedingGender = selectedGuestIds.filter(
    (gid) => !guestSelectionMap[gid]?.linkedPlayerId && !guestGenderMap[gid],
  );

  const totalSelectable = selectableBookedEntries.length + selectableGuests.length;
  const allBookedSelected =
    totalSelectable > 0 &&
    selectableBookedEntries.every((e) => selectedBookedPlayerIds.includes(e.player!.id)) &&
    selectableGuests.every((g) => selectedGuestIds.includes(g.guestId));

  const toggleSelectAllBooked = () => {
    if (allBookedSelected) {
      setSelectedBookedPlayerIds([]);
      setBookedBookingMap({});
      setSelectedGuestIds([]);
      setGuestSelectionMap({});
    } else {
      const ids: string[] = [];
      const map: Record<string, string> = {};
      selectableBookedEntries.forEach((e) => {
        if (e.player) {
          ids.push(e.player.id);
          map[e.player.id] = e.bookingId;
        }
      });
      setSelectedBookedPlayerIds(ids);
      setBookedBookingMap(map);
      const gids: string[] = [];
      const gmap: Record<string, { bookingId: string; linkedPlayerId: string | null }> = {};
      selectableGuests.forEach((g) => {
        gids.push(g.guestId);
        gmap[g.guestId] = { bookingId: g.bookingId, linkedPlayerId: g.linkedPlayerId };
      });
      setSelectedGuestIds(gids);
      setGuestSelectionMap(gmap);
    }
  };

  const isAddingBooked = addToQueueMutation.isPending || checkinMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] flex flex-col rounded-t-2xl pb-0"
        data-testid="modal-add-player"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-2 pb-4 border-b border-border shrink-0">
          <SheetTitle>Add Player</SheetTitle>
          <SheetDescription>
            Add from registry, check in a booking, or create a new player.
          </SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "new" | "registry" | "booked")}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-3 mx-6 mt-3 shrink-0" style={{ width: "calc(100% - 3rem)" }}>
            <TabsTrigger
              value="registry"
              className="flex items-center gap-1.5 text-xs sm:text-sm"
              disabled={!hasActiveSession}
              data-testid="tab-from-registry"
            >
              <Users className="h-3.5 w-3.5" />
              Registry
            </TabsTrigger>
            <TabsTrigger
              value="booked"
              className="flex items-center gap-1.5 text-xs sm:text-sm"
              disabled={!hasActiveSession || (!isLoadingBooked && !hasLinkedBookableSession)}
              data-testid="tab-booked-players"
            >
              <Ticket className="h-3.5 w-3.5" />
              Booked
            </TabsTrigger>
            <TabsTrigger
              value="new"
              className="flex items-center gap-1.5 text-xs sm:text-sm"
              data-testid="tab-new-player"
            >
              <UserPlus className="h-3.5 w-3.5" />
              New
            </TabsTrigger>
          </TabsList>

          {/* ── Registry tab ── */}
          <TabsContent
            value="registry"
            className="flex-1 flex flex-col min-h-0 mt-3 px-6 space-y-3"
          >
            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ShuttleIQ ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-registry-search"
              />
            </div>

            {/* Select-all row */}
            {selectablePlayersCount > 0 && (
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelectableSelected}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all ({selectablePlayersCount})
                  </span>
                </div>
                {selectedPlayerIds.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-selected-count">
                    {selectedPlayerIds.length} selected
                  </Badge>
                )}
              </div>
            )}

            {/* Scrollable player list */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-border">
              {isLoadingPlayers ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Loading players…
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  {searchQuery
                    ? "No players found matching your search"
                    : "No players in registry"}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredPlayers.map((player) => {
                    const inQueue = isPlayerInQueue(player.id);
                    const isSelected = selectedPlayerIds.includes(player.id);
                    return (
                      <div
                        key={player.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors min-h-[52px]",
                          inQueue
                            ? "bg-muted/50 opacity-60"
                            : isSelected
                              ? "bg-primary/8 border border-primary/20"
                              : "hover-elevate cursor-pointer",
                        )}
                        onClick={() => !inQueue && togglePlayerSelection(player.id)}
                        data-testid={`registry-player-${player.id}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={inQueue}
                          onCheckedChange={() => togglePlayerSelection(player.id)}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`checkbox-player-${player.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {player.name}
                            </span>
                            {player.shuttleIqId && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {player.shuttleIqId}
                              </Badge>
                            )}
                            {inQueue && (
                              <Badge className="bg-info/10 text-info border-info/20 text-xs shrink-0">
                                <Check className="h-3 w-3 mr-1" />
                                In Queue
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span>{player.gender === "Male" ? "M" : "F"}</span>
                            <span>{formatSkillLevel(player.skillScore)}</span>
                            <span className="flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              {player.gamesPlayed}
                            </span>
                            <span className="flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {player.wins}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 pb-4 shrink-0 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 min-h-11"
                data-testid="button-cancel-registry"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSelectedPlayers}
                disabled={selectedPlayerIds.length === 0 || addToQueueMutation.isPending}
                className="flex-1 min-h-11"
                data-testid="button-add-selected"
              >
                {addToQueueMutation.isPending ? (
                  "Adding…"
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add{selectedPlayerIds.length > 0 ? ` (${selectedPlayerIds.length})` : " Selected"}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ── Booked tab ── */}
          <TabsContent
            value="booked"
            className="flex-1 flex flex-col min-h-0 mt-3 px-6 space-y-3"
          >
            {totalSelectable > 0 && (
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allBookedSelected}
                    onCheckedChange={toggleSelectAllBooked}
                    data-testid="checkbox-select-all-booked"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all ({totalSelectable})
                  </span>
                </div>
                {selectedBookedPlayerIds.length + selectedGuestIds.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-booked-selected-count">
                    {selectedBookedPlayerIds.length + selectedGuestIds.length} selected
                  </Badge>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto rounded-xl border border-border">
              {isLoadingBooked ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Loading bookings…
                </div>
              ) : !hasLinkedBookableSession ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Ticket className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium mb-1">No marketplace link</p>
                  <p className="text-xs">
                    This session is not linked to a bookable marketplace listing.
                  </p>
                </div>
              ) : bookedEntries.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Ticket className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium mb-1">No bookings yet</p>
                  <p className="text-xs">No players have booked this session yet.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {bookedEntries.map((entry) => {
                    const hasPlayer = !!entry.player;
                    const inQueue = hasPlayer && isPlayerInQueue(entry.player!.id);
                    const isCheckedIn = !!entry.attendedAt;
                    const isDisabled = !hasPlayer || inQueue || isCheckedIn;
                    const isSelected =
                      hasPlayer && selectedBookedPlayerIds.includes(entry.player!.id);
                    return (
                      <div key={entry.bookingId} className="space-y-1">
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors min-h-[52px]",
                          isDisabled
                            ? "bg-muted/50 opacity-60"
                            : isSelected
                              ? "bg-primary/8 border border-primary/20"
                              : "hover-elevate cursor-pointer",
                        )}
                        onClick={() =>
                          !isDisabled &&
                          hasPlayer &&
                          toggleBookedPlayerSelection(entry.player!.id, entry.bookingId)
                        }
                        data-testid={`booked-entry-${entry.bookingId}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={() =>
                            hasPlayer &&
                            toggleBookedPlayerSelection(entry.player!.id, entry.bookingId)
                          }
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`checkbox-booked-${entry.bookingId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {entry.user?.name || "Unknown"}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs shrink-0",
                                entry.bookingStatus === "confirmed" &&
                                  "bg-green-50 text-green-700 border-green-200",
                                entry.bookingStatus === "pending" &&
                                  "bg-yellow-50 text-yellow-700 border-yellow-200",
                              )}
                            >
                              {entry.bookingStatus === "confirmed"
                                ? "Confirmed"
                                : entry.bookingStatus}
                            </Badge>
                            {entry.paymentMethod === "cash" ? (
                              <Badge variant="outline" className="text-xs shrink-0">
                                <Banknote className="h-3 w-3 mr-0.5" />
                                {entry.cashPaid ? "Paid" : "Cash"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs shrink-0">
                                <CreditCard className="h-3 w-3 mr-0.5" />
                                Card
                              </Badge>
                            )}
                            {(inQueue || isCheckedIn) && (
                              <Badge className="bg-info/10 text-info border-info/20 text-xs shrink-0">
                                <UserCheck className="h-3 w-3 mr-1" />
                                {isCheckedIn ? "Checked In" : "In Queue"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="truncate">{entry.user?.email}</span>
                          </div>
                          {hasPlayer ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Check className="h-3 w-3" />
                                {entry.player!.name}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {getTierDisplayName(entry.player!.level)} (
                                {entry.player!.skillScore})
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Link2Off className="h-3 w-3" />
                              No linked player profile
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Guest spots under this booker — extra paid players */}
                      {entry.guests.map((guest) => {
                        const checkedIn = !!entry.attendedAt;
                        const linkedInQueue =
                          !!guest.linkedPlayerId && isPlayerInQueue(guest.linkedPlayerId);
                        const gDisabled = checkedIn || linkedInQueue;
                        const gSelected = selectedGuestIds.includes(guest.guestId);
                        return (
                          <div
                            key={guest.guestId}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 ml-6 rounded-lg transition-colors min-h-[44px]",
                              gDisabled
                                ? "bg-muted/50 opacity-60"
                                : gSelected
                                  ? "bg-primary/8 border border-primary/20"
                                  : "hover-elevate cursor-pointer",
                            )}
                            onClick={() =>
                              !gDisabled &&
                              toggleGuestSelection(guest.guestId, entry.bookingId, guest.linkedPlayerId)
                            }
                            data-testid={`booked-guest-${guest.guestId}`}
                          >
                            <Checkbox
                              checked={gSelected}
                              disabled={gDisabled}
                              onCheckedChange={() =>
                                toggleGuestSelection(guest.guestId, entry.bookingId, guest.linkedPlayerId)
                              }
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`checkbox-guest-${guest.guestId}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{guest.name}</span>
                                <Badge variant="outline" className="text-xs shrink-0 gap-1">
                                  <Users className="h-3 w-3" />
                                  Guest
                                </Badge>
                                {(checkedIn || linkedInQueue) && (
                                  <Badge className="bg-info/10 text-info border-info/20 text-xs shrink-0">
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    {checkedIn ? "Checked In" : "In Queue"}
                                  </Badge>
                                )}
                              </div>
                              {guest.linkedPlayerId ? (
                                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                                  <Check className="h-3 w-3" />
                                  Registered profile — uses existing skill score
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 flex-wrap mt-0.5 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <UserPlus className="h-3 w-3" />
                                    New guest — Intermediate. Pick gender:
                                  </span>
                                  <div
                                    className="flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {(["Male", "Female"] as const).map((g) => (
                                      <button
                                        key={g}
                                        type="button"
                                        onClick={() => setGuestGender(guest.guestId, g)}
                                        className={cn(
                                          "px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors",
                                          guestGenderMap[guest.guestId] === g
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground hover:bg-muted",
                                        )}
                                        data-testid={`guest-gender-${g.toLowerCase()}-${guest.guestId}`}
                                      >
                                        {g === "Male" ? "M" : "F"}
                                      </button>
                                    ))}
                                  </div>
                                  {gSelected && !guestGenderMap[guest.guestId] && (
                                    <span className="text-amber-600">gender required</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {pureGuestsNeedingGender.length > 0 && (
              <p
                className="text-xs text-amber-600 shrink-0"
                data-testid="text-guest-gender-required"
              >
                Pick a gender for each selected new guest to continue.
              </p>
            )}
            <div className="flex gap-2 pb-4 shrink-0 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 min-h-11"
                data-testid="button-cancel-booked"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddBookedPlayers}
                disabled={
                  (selectedBookedPlayerIds.length === 0 && selectedGuestIds.length === 0) ||
                  pureGuestsNeedingGender.length > 0 ||
                  isAddingBooked ||
                  isSubmittingBooked
                }
                className="flex-1 min-h-11"
                data-testid="button-add-checkin-booked"
              >
                {isAddingBooked || isSubmittingBooked ? (
                  "Adding…"
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Add & Check In
                    {selectedBookedPlayerIds.length + selectedGuestIds.length > 0 &&
                      ` (${selectedBookedPlayerIds.length + selectedGuestIds.length})`}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ── New Player tab ── */}
          <TabsContent
            value="new"
            className="flex-1 overflow-y-auto mt-3 px-6"
          >
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4 pb-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Player Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter player name"
                          autoFocus
                          className="h-11"
                          data-testid="input-player-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11" data-testid="select-player-gender">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skill Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11" data-testid="select-player-level">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Novice">Novice (1.0–3.9)</SelectItem>
                          <SelectItem value="Beginner">Beginner (4.0–6.9)</SelectItem>
                          <SelectItem value="lower_intermediate">
                            Intermediate (7.0–8.9)
                          </SelectItem>
                          <SelectItem value="upper_intermediate">
                            Competitive (9.0–10.9)
                          </SelectItem>
                          <SelectItem value="Advanced">Advanced (11.0–15.9)</SelectItem>
                          <SelectItem value="Professional">
                            Professional (16.0–20.0)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="flex-1 min-h-11"
                    data-testid="button-cancel-add-player"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 min-h-11"
                    data-testid="button-submit-add-player"
                  >
                    Add Player
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </SheetContent>
      <SamePersonSheet
        open={!!guestPrompt}
        title="Is this the same person?"
        description={
          guestPrompt
            ? `"${guestPrompt.guestName}" looks like an existing player. Tap to check them in as that player.`
            : ""
        }
        candidates={guestPrompt?.candidates ?? []}
        onPick={(c) => guestPrompt?.resolve({ linkToPlayerId: c.id })}
        secondaryLabel="New player"
        onSecondary={() => guestPrompt?.resolve({ forceNew: true })}
        onDismiss={() => guestPrompt?.resolve(null)}
      />
    </Sheet>
  );
}
