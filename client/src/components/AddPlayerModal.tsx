import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertPlayerSchema, Player } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Search, UserPlus, Users, Trophy, Target, Check, Ticket, UserCheck, Link2Off, CreditCard, Banknote } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatSkillLevel, getTierDisplayName } from "@shared/utils/skillUtils";
import { cn } from "@/lib/utils";

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
}

interface BookingsResponse {
  linked: boolean;
  bookings: BookedEntry[];
}

const formSchema = insertPlayerSchema.extend({
  name: z.string().min(1, "Player name is required"),
  gender: z.enum(['Male', 'Female']),
  level: z.enum(['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional']),
  skillScore: z.number().min(10).max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddPlayerModal({ open, onClose, onAddPlayer, sessionId, queuePlayerIds = [] }: AddPlayerModalProps) {
  const [activeTab, setActiveTab] = useState<'new' | 'registry' | 'booked'>('new');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedBookedPlayerIds, setSelectedBookedPlayerIds] = useState<string[]>([]);
  const [bookedBookingMap, setBookedBookingMap] = useState<Record<string, string>>({});
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
    queryKey: ['/api/players'],
    enabled: open && activeTab === 'registry',
  });

  const { data: bookingsResponse, isLoading: isLoadingBooked } = useQuery<BookingsResponse>({
    queryKey: ['/api/sessions', sessionId, 'bookings'],
    enabled: open && !!sessionId,
  });

  const hasLinkedBookableSession = bookingsResponse?.linked ?? false;
  const bookedEntries = bookingsResponse?.bookings ?? [];

  const addToQueueMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest('POST', `/api/queue/${playerId}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add player to queue",
        variant: "destructive",
      });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string }) => {
      return apiRequest('PATCH', `/api/sessions/${sessionId}/bookings/${bookingId}/checkin`);
    },
  });

  const filteredPlayers = allPlayers.filter(player => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.shuttleIqId?.toLowerCase().includes(query)
    );
  });

  const isPlayerInQueue = (playerId: string) => queuePlayerIds.includes(playerId);

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const toggleBookedPlayerSelection = (playerId: string, bookingId: string) => {
    setSelectedBookedPlayerIds(prev => {
      if (prev.includes(playerId)) {
        const newMap = { ...bookedBookingMap };
        delete newMap[playerId];
        setBookedBookingMap(newMap);
        return prev.filter(id => id !== playerId);
      } else {
        setBookedBookingMap(prev2 => ({ ...prev2, [playerId]: bookingId }));
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
      } catch (error) {
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
      toast({
        title: "Players Added",
        description: `${successCount} player${successCount > 1 ? 's' : ''} added to the queue`,
      });
    }

    setSelectedPlayerIds([]);
    setSearchQuery("");
    onClose();
  };

  const handleAddBookedPlayers = async () => {
    if (selectedBookedPlayerIds.length === 0) return;

    let successCount = 0;
    for (const playerId of selectedBookedPlayerIds) {
      try {
        await addToQueueMutation.mutateAsync(playerId);
        const bookingId = bookedBookingMap[playerId];
        if (bookingId) {
          await checkinMutation.mutateAsync({ bookingId });
        }
        successCount++;
      } catch (error) {
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId, 'bookings'] });
      toast({
        title: "Players Added & Checked In",
        description: `${successCount} player${successCount > 1 ? 's' : ''} added to queue and checked in`,
      });
    }

    setSelectedBookedPlayerIds([]);
    setBookedBookingMap({});
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
    setSearchQuery("");
    setActiveTab('new');
    onClose();
  };

  const selectablePlayersCount = filteredPlayers.filter(p => !isPlayerInQueue(p.id)).length;
  const allSelectableSelected = selectablePlayersCount > 0 && 
    filteredPlayers.filter(p => !isPlayerInQueue(p.id)).every(p => selectedPlayerIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedPlayerIds([]);
    } else {
      const selectableIds = filteredPlayers
        .filter(p => !isPlayerInQueue(p.id))
        .map(p => p.id);
      setSelectedPlayerIds(selectableIds);
    }
  };

  const selectableBookedEntries = bookedEntries.filter(
    e => e.player && !isPlayerInQueue(e.player.id) && !e.attendedAt
  );
  const allBookedSelected = selectableBookedEntries.length > 0 &&
    selectableBookedEntries.every(e => selectedBookedPlayerIds.includes(e.player!.id));

  const toggleSelectAllBooked = () => {
    if (allBookedSelected) {
      setSelectedBookedPlayerIds([]);
      setBookedBookingMap({});
    } else {
      const ids: string[] = [];
      const map: Record<string, string> = {};
      selectableBookedEntries.forEach(e => {
        if (e.player) {
          ids.push(e.player.id);
          map[e.player.id] = e.bookingId;
        }
      });
      setSelectedBookedPlayerIds(ids);
      setBookedBookingMap(map);
    }
  };

  const isAddingBooked = addToQueueMutation.isPending || checkinMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" data-testid="modal-add-player">
        <DialogHeader>
          <DialogTitle>Add Player</DialogTitle>
          <DialogDescription>
            Create a new player, add from registry, or add booked players.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'new' | 'registry' | 'booked')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="new" className="flex items-center gap-1.5 text-xs sm:text-sm" data-testid="tab-new-player">
              <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">New Player</span>
              <span className="sm:hidden">New</span>
            </TabsTrigger>
            <TabsTrigger 
              value="registry" 
              className="flex items-center gap-1.5 text-xs sm:text-sm" 
              disabled={!hasActiveSession}
              data-testid="tab-from-registry"
            >
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Registry
            </TabsTrigger>
            <TabsTrigger 
              value="booked" 
              className="flex items-center gap-1.5 text-xs sm:text-sm" 
              disabled={!hasActiveSession || (!isLoadingBooked && !hasLinkedBookableSession)}
              data-testid="tab-booked-players"
            >
              <Ticket className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Booked
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="flex-1 mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                          className="min-h-12 sm:min-h-10"
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
                          <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-player-gender">
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
                          <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-player-level">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Novice">Novice (1.0-3.9)</SelectItem>
                          <SelectItem value="Beginner">Beginner (4.0-6.9)</SelectItem>
                          <SelectItem value="lower_intermediate">Intermediate (7.0-8.9)</SelectItem>
                          <SelectItem value="upper_intermediate">Competitive (9.0-10.9)</SelectItem>
                          <SelectItem value="Advanced">Advanced (11.0-15.9)</SelectItem>
                          <SelectItem value="Professional">Professional (16.0-20.0)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleClose} className="min-h-12 sm:min-h-10" data-testid="button-cancel-add-player">
                    Cancel
                  </Button>
                  <Button type="submit" className="min-h-12 sm:min-h-10" data-testid="button-submit-add-player">
                    Add Player
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="registry" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ShuttleIQ ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-12 sm:min-h-10"
                data-testid="input-registry-search"
              />
            </div>

            {selectablePlayersCount > 0 && (
              <div className="flex items-center justify-between px-1">
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

            <div className="flex-1 min-h-[200px] max-h-[50vh] border rounded-md overflow-y-auto">
              {isLoadingPlayers ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading players...
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchQuery ? 'No players found matching your search' : 'No players in registry'}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredPlayers.map(player => {
                    const inQueue = isPlayerInQueue(player.id);
                    const isSelected = selectedPlayerIds.includes(player.id);
                    
                    return (
                      <div
                        key={player.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-md transition-colors",
                          inQueue 
                            ? "bg-muted/50 opacity-60" 
                            : isSelected 
                              ? "bg-primary/10 border border-primary/20" 
                              : "hover-elevate cursor-pointer"
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
                            <span className="font-medium truncate">{player.name}</span>
                            {player.shuttleIqId && (
                              <Badge variant="outline" className="text-xs">
                                {player.shuttleIqId}
                              </Badge>
                            )}
                            {inQueue && (
                              <Badge className="bg-info/10 text-info border-info/20 text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                In Queue
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{player.gender === 'Male' ? 'M' : 'F'}</span>
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

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose} 
                className="min-h-12 sm:min-h-10"
                data-testid="button-cancel-registry"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handleAddSelectedPlayers}
                disabled={selectedPlayerIds.length === 0 || addToQueueMutation.isPending}
                className="min-h-12 sm:min-h-10"
                data-testid="button-add-selected"
              >
                {addToQueueMutation.isPending ? (
                  "Adding..."
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add {selectedPlayerIds.length > 0 ? `(${selectedPlayerIds.length})` : 'Selected'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="booked" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
            {selectableBookedEntries.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allBookedSelected}
                    onCheckedChange={toggleSelectAllBooked}
                    data-testid="checkbox-select-all-booked"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all ({selectableBookedEntries.length})
                  </span>
                </div>
                {selectedBookedPlayerIds.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-booked-selected-count">
                    {selectedBookedPlayerIds.length} selected
                  </Badge>
                )}
              </div>
            )}

            <div className="flex-1 min-h-[200px] max-h-[50vh] border rounded-md overflow-y-auto">
              {isLoadingBooked ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading bookings...
                </div>
              ) : !hasLinkedBookableSession ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Ticket className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium mb-1">No marketplace link</p>
                  <p className="text-xs">This session is not linked to a bookable marketplace listing.</p>
                </div>
              ) : bookedEntries.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Ticket className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium mb-1">No bookings yet</p>
                  <p className="text-xs">No players have booked this session yet.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {bookedEntries.map(entry => {
                    const hasPlayer = !!entry.player;
                    const inQueue = hasPlayer && isPlayerInQueue(entry.player!.id);
                    const isCheckedIn = !!entry.attendedAt;
                    const isDisabled = !hasPlayer || inQueue || isCheckedIn;
                    const isSelected = hasPlayer && selectedBookedPlayerIds.includes(entry.player!.id);
                    
                    return (
                      <div
                        key={entry.bookingId}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-md transition-colors",
                          isDisabled
                            ? "bg-muted/50 opacity-60"
                            : isSelected
                              ? "bg-primary/10 border border-primary/20"
                              : "hover-elevate cursor-pointer"
                        )}
                        onClick={() => !isDisabled && hasPlayer && toggleBookedPlayerSelection(entry.player!.id, entry.bookingId)}
                        data-testid={`booked-entry-${entry.bookingId}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={() => hasPlayer && toggleBookedPlayerSelection(entry.player!.id, entry.bookingId)}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`checkbox-booked-${entry.bookingId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{entry.user?.name || 'Unknown'}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                entry.bookingStatus === 'confirmed' && "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
                                entry.bookingStatus === 'pending' && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
                              )}
                            >
                              {entry.bookingStatus === 'confirmed' ? 'Confirmed' : entry.bookingStatus}
                            </Badge>
                            {entry.paymentMethod === 'cash' ? (
                              <Badge variant="outline" className="text-xs">
                                <Banknote className="h-3 w-3 mr-0.5" />
                                {entry.cashPaid ? 'Paid' : 'Cash'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <CreditCard className="h-3 w-3 mr-0.5" />
                                Card
                              </Badge>
                            )}
                            {(inQueue || isCheckedIn) && (
                              <Badge className="bg-info/10 text-info border-info/20 text-xs">
                                <UserCheck className="h-3 w-3 mr-1" />
                                {isCheckedIn ? 'Checked In' : 'In Queue'}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="truncate">{entry.user?.email}</span>
                          </div>
                          {hasPlayer ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Check className="h-3 w-3" />
                                {entry.player!.name}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {getTierDisplayName(entry.player!.level)} ({entry.player!.skillScore})
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                              <Link2Off className="h-3 w-3" />
                              No linked player profile
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose} 
                className="min-h-12 sm:min-h-10"
                data-testid="button-cancel-booked"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handleAddBookedPlayers}
                disabled={selectedBookedPlayerIds.length === 0 || isAddingBooked}
                className="min-h-12 sm:min-h-10"
                data-testid="button-add-checkin-booked"
              >
                {isAddingBooked ? (
                  "Adding..."
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Add & Check In {selectedBookedPlayerIds.length > 0 ? `(${selectedBookedPlayerIds.length})` : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
