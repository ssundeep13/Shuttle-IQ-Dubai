import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, Users, ArrowLeft, Trophy, Target, ExternalLink } from "lucide-react";
import { formatSkillLevel, getSkillTier } from "@shared/utils/skillUtils";
import type { Player, Session } from "@shared/schema";

export default function PlayerRegistry() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: allPlayers, isLoading: isLoadingPlayers } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const { data: activeSession } = useQuery<Session>({
    queryKey: ['/api/sessions/active'],
  });

  const { data: queuePlayerIds = [] } = useQuery<string[]>({
    queryKey: ['/api/queue'],
    enabled: !!activeSession,
  });

  const addToQueueMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest('POST', `/api/queue/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      toast({
        title: "Player Added",
        description: "Player has been added to the session queue",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add player to queue",
        variant: "destructive",
      });
    },
  });

  const filteredPlayers = allPlayers?.filter(player => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.shuttleIqId?.toLowerCase().includes(query) ||
      player.externalId?.toLowerCase().includes(query)
    );
  }) || [];

  const isPlayerInQueue = (playerId: string) => queuePlayerIds.includes(playerId);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Admin
              </Button>
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Users className="h-7 w-7" />
              Player Registry
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse all registered players • {allPlayers?.length || 0} players total
            </p>
          </div>
          {activeSession && (
            <Badge variant="outline" className="self-start md:self-auto">
              Active Session: {activeSession.venueName}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ShuttleIQ ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingPlayers ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No players found matching your search' : 'No players registered yet'}
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredPlayers.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                    data-testid={`player-card-${player.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/player/${player.id}`}>
                            <span className="font-medium hover:underline cursor-pointer" data-testid={`link-player-${player.id}`}>
                              {player.name}
                            </span>
                          </Link>
                          <Badge variant="outline" className="text-xs" data-testid={`badge-id-${player.id}`}>
                            {player.shuttleIqId || 'No ID'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{player.gender === 'Male' ? 'M' : 'F'}</span>
                          <span>•</span>
                          <span>{formatSkillLevel(player.skillScore)}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {player.gamesPlayed} games
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Trophy className="h-3 w-3" />
                            {player.wins} wins
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/player/${player.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-${player.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      {activeSession && (
                        <Button
                          size="sm"
                          variant={isPlayerInQueue(player.id) ? "secondary" : "default"}
                          disabled={isPlayerInQueue(player.id) || addToQueueMutation.isPending}
                          onClick={() => addToQueueMutation.mutate(player.id)}
                          data-testid={`button-add-queue-${player.id}`}
                        >
                          {isPlayerInQueue(player.id) ? (
                            "In Queue"
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
