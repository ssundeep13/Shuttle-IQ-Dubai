import { useQuery, useMutation } from "@tanstack/react-query";
import { Player, CourtWithPlayers } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTierDisplayName } from "@shared/utils/skillUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Layers, Scale, Star, AlertCircle, Zap, Clock } from "lucide-react";

interface PlayerInBracket extends Player {
  gamesWaited?: number;
  gamesThisSession?: number;
}

interface TeamCombination {
  team1: PlayerInBracket[];
  team2: PlayerInBracket[];
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  tierDispersion: number;
  withinTeamSpread1: number;
  withinTeamSpread2: number;
}

interface BracketEntry {
  courtIndex: number;
  skillRangeMin: number;
  skillRangeMax: number;
  combination: TeamCombination | null;
  insufficientPlayers: boolean;
  playerCount: number;
}

interface BracketSuggestionsResponse {
  brackets: BracketEntry[];
  restWarnings: string[];
  queueSize: number;
}

interface BracketedLineupsProps {
  sessionId?: string;
  courts: CourtWithPlayers[];
  queuePlayerIds: string[];
  isActiveSession?: boolean;
  onAssign: () => void;
  onAssignAll: () => void;
}

function getBalanceLabel(skillGap: number, tierDispersion: number) {
  if (skillGap < 5 && tierDispersion === 0) {
    return { label: "Best Match", icon: Star, color: "text-green-600 dark:text-green-400" };
  }
  if (skillGap < 10) {
    return { label: "Balanced", icon: Scale, color: "text-blue-600 dark:text-blue-400" };
  }
  return { label: "Mixed Levels", icon: Zap, color: "text-orange-600 dark:text-orange-400" };
}

function getSpreadColor(spread: number) {
  return spread <= 10
    ? "text-green-600 dark:text-green-400"
    : "text-amber-600 dark:text-amber-400";
}

const BRACKET_LABELS = ["Top", "Upper-Mid", "Lower-Mid", "Bottom"];

export function BracketedLineups({
  sessionId,
  courts,
  queuePlayerIds,
  isActiveSession = true,
  onAssign,
  onAssignAll,
}: BracketedLineupsProps) {
  const availableCourts = courts.filter(c => c.status === 'available');
  const availableCourtCount = availableCourts.length;

  const { data, isLoading, error } = useQuery<BracketSuggestionsResponse>({
    queryKey: ['/api/matchmaking/bracket-suggestions', sessionId, availableCourtCount, queuePlayerIds.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      params.set('courtCount', String(availableCourtCount));
      return await apiRequest('GET', `/api/matchmaking/bracket-suggestions?${params.toString()}`);
    },
    enabled: queuePlayerIds.length >= 4 && availableCourtCount >= 1,
    refetchOnWindowFocus: false,
  });

  const bracketAssignMutation = useMutation({
    mutationFn: async (payload: { assignments: { courtId: string; teamAssignments: { playerId: string; team: number }[] }[]; bulk: boolean }) => {
      return { ...(await apiRequest('POST', '/api/matchmaking/bracket-assign', {
        sessionId,
        assignments: payload.assignments,
      })), bulk: payload.bulk };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
      if (result.bulk) {
        onAssignAll();
      } else {
        onAssign();
      }
    },
  });

  const handleAssignSingle = (bracketIndex: number) => {
    if (!data) return;
    const bracket = data.brackets[bracketIndex];
    if (!bracket?.combination) return;
    const court = availableCourts[bracketIndex];
    if (!court) return;

    const teamAssignments = [
      ...bracket.combination.team1.map(p => ({ playerId: p.id, team: 1 as const })),
      ...bracket.combination.team2.map(p => ({ playerId: p.id, team: 2 as const })),
    ];

    bracketAssignMutation.mutate({ assignments: [{ courtId: court.id, teamAssignments }], bulk: false });
  };

  const handleAssignAll = () => {
    if (!data) return;
    const assignments = data.brackets
      .map((bracket, i) => {
        const court = availableCourts[i];
        if (!court || bracket.insufficientPlayers || !bracket.combination) return null;
        return {
          courtId: court.id,
          teamAssignments: [
            ...bracket.combination.team1.map(p => ({ playerId: p.id, team: 1 as const })),
            ...bracket.combination.team2.map(p => ({ playerId: p.id, team: 2 as const })),
          ],
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (assignments.length === 0) return;
    bracketAssignMutation.mutate({ assignments, bulk: true });
  };

  const assignableCount = data?.brackets.filter((b, i) => !b.insufficientPlayers && !!availableCourts[i]).length ?? 0;

  if (availableCourtCount === 0) {
    return (
      <Card data-testid="bracket-no-courts">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No available courts for bracket assignment.
        </CardContent>
      </Card>
    );
  }

  if (queuePlayerIds.length < 4) {
    return null;
  }

  return (
    <div className="space-y-4" data-testid="section-bracketed-lineups">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Skill Brackets</h2>
          <p className="text-sm text-muted-foreground">
            Queue split into {availableCourtCount} bracket{availableCourtCount !== 1 ? 's' : ''} — one per available court
          </p>
        </div>
        {isActiveSession && assignableCount >= 1 && (
          <Button
            size="sm"
            onClick={handleAssignAll}
            disabled={bracketAssignMutation.isPending}
            data-testid="button-assign-all-brackets"
          >
            <Layers className="h-4 w-4 mr-1.5" />
            Assign All Courts
          </Button>
        )}
      </div>

      {data?.restWarnings && data.restWarnings.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800" data-testid="card-bracket-rest-warnings">
          <CardContent className="py-3 space-y-1">
            {data.restWarnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground" data-testid="loading-brackets">
          Generating bracket suggestions...
        </div>
      )}

      {error && !isLoading && (
        <div className="text-center py-8 text-destructive" data-testid="error-brackets">
          Failed to load bracket suggestions.
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.brackets.map((bracket, i) => {
            const court = availableCourts[i];
            const courtName = court?.name ?? `Court ${i + 1}`;
            const bracketLabel = BRACKET_LABELS[i] ?? `Bracket ${i + 1}`;

            if (bracket.insufficientPlayers) {
              return (
                <Card key={i} className="opacity-60" data-testid={`bracket-card-${i}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{bracketLabel} Bracket</CardTitle>
                      <span className="text-xs text-muted-foreground">{courtName}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Not enough players in this bracket ({bracket.playerCount} available, 4 needed).
                    </p>
                  </CardContent>
                </Card>
              );
            }

            const combo = bracket.combination!;
            const balance = getBalanceLabel(combo.skillGap, combo.tierDispersion);
            const BalanceIcon = balance.icon;

            return (
              <Card key={i} data-testid={`bracket-card-${i}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm">{bracketLabel} Bracket</CardTitle>
                      <Badge variant="outline" className={balance.color}>
                        <BalanceIcon className="h-3 w-3 mr-1" />
                        {balance.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {bracket.skillRangeMin}–{bracket.skillRangeMax} pts
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid={`bracket-gap-${i}`}>
                        Gap: {combo.skillGap.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{courtName}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Team 1 · {combo.team1Avg.toFixed(0)}
                        </span>
                        <span className={`text-xs ${getSpreadColor(combo.withinTeamSpread1)}`}>
                          ±{combo.withinTeamSpread1.toFixed(0)}
                        </span>
                      </div>
                      {combo.team1.map(p => (
                        <div key={p.id} className="text-sm flex items-center gap-1 flex-wrap" data-testid={`bracket-t1-${p.id}-${i}`}>
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {p.gender?.[0]} · {getTierDisplayName(p.level || 'lower_intermediate')} · ({p.skillScore ?? 90})
                          </span>
                          {(p.gamesWaited ?? 0) >= 4 && (
                            <Badge
                              variant="outline"
                              className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 text-xs px-1"
                            >
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              Waited {p.gamesWaited}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Team 2 · {combo.team2Avg.toFixed(0)}
                        </span>
                        <span className={`text-xs ${getSpreadColor(combo.withinTeamSpread2)}`}>
                          ±{combo.withinTeamSpread2.toFixed(0)}
                        </span>
                      </div>
                      {combo.team2.map(p => (
                        <div key={p.id} className="text-sm flex items-center gap-1 flex-wrap" data-testid={`bracket-t2-${p.id}-${i}`}>
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {p.gender?.[0]} · {getTierDisplayName(p.level || 'lower_intermediate')} · ({p.skillScore ?? 90})
                          </span>
                          {(p.gamesWaited ?? 0) >= 4 && (
                            <Badge
                              variant="outline"
                              className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 text-xs px-1"
                            >
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              Waited {p.gamesWaited}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {isActiveSession && court && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleAssignSingle(i)}
                      disabled={bracketAssignMutation.isPending}
                      data-testid={`button-assign-bracket-${i}`}
                    >
                      Assign to {courtName}
                    </Button>
                  )}
                  {!isActiveSession && (
                    <div className="text-xs text-center text-muted-foreground py-1">
                      Read-only: This is not the active session
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
