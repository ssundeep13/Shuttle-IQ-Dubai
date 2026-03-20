import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatSkillLevel } from "@shared/utils/skillUtils";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, ChevronUp, Zap, Scale, Layers } from "lucide-react";
import { useState } from "react";

interface TeamCombination {
  team1: Player[];
  team2: Player[];
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  variance: number;
  tierDispersion: number;
  rank: number;
}

interface SuggestionsResponse {
  suggestions: TeamCombination[];
  restWarnings: string[];
  queueSize: number;
}

interface SuggestedLineupsProps {
  onAssign: (team1Ids: string[], team2Ids: string[]) => void;
  availableCourts: number;
  queuePlayerIds: string[];
  isActiveSession?: boolean;
  sessionId?: string;
}

export function SuggestedLineups({ onAssign, availableCourts, queuePlayerIds, isActiveSession = true, sessionId }: SuggestedLineupsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [groupByTier, setGroupByTier] = useState(true);

  const { data, isLoading, error } = useQuery<SuggestionsResponse>({
    queryKey: ['/api/matchmaking/suggestions', sessionId, queuePlayerIds.join(','), groupByTier],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      params.set('groupByTier', String(groupByTier));
      return await apiRequest('GET', `/api/matchmaking/suggestions?${params.toString()}`);
    },
    enabled: queuePlayerIds.length >= 4,
    refetchOnWindowFocus: false,
  });

  if (queuePlayerIds.length < 4) {
    return null;
  }

  const suggestions = data?.suggestions || [];
  const restWarnings = data?.restWarnings || [];

  const getBalanceIndicator = (skillGap: number) => {
    if (skillGap < 5) {
      return { label: "Perfect Match", icon: Scale, color: "text-green-600 dark:text-green-400" };
    } else if (skillGap < 10) {
      return { label: "Balanced", icon: Scale, color: "text-blue-600 dark:text-blue-400" };
    } else {
      return { label: "Competitive", icon: Zap, color: "text-orange-600 dark:text-orange-400" };
    }
  };

  return (
    <div className="space-y-4" data-testid="section-suggested-lineups">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Smart Suggestions</h2>
          <p className="text-sm text-muted-foreground">
            AI-powered lineup recommendations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="group-by-tier"
              checked={groupByTier}
              onCheckedChange={setGroupByTier}
              data-testid="switch-group-by-tier"
            />
            <Label htmlFor="group-by-tier" className="text-sm text-muted-foreground cursor-pointer select-none">
              Group by level
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-toggle-suggestions"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-3">
          {restWarnings.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800" data-testid="card-rest-warnings">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Zap className="h-4 w-4" />
                  Rest Warnings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {restWarnings.map((warning, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground" data-testid={`warning-${idx}`}>
                    {warning}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {isLoading && (
            <div className="text-center py-8 text-muted-foreground" data-testid="loading-suggestions">
              Generating suggestions...
            </div>
          )}

          {error && !isLoading && (
            <div className="text-center py-8 text-destructive" data-testid="error-suggestions">
              Failed to load suggestions. Please try again.
            </div>
          )}

          {!isLoading && !error && suggestions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-suggestions">
              Not enough players for suggestions
            </div>
          )}

          {!isLoading && suggestions.map((suggestion, idx) => {
            const balance = getBalanceIndicator(suggestion.skillGap);
            const BalanceIcon = balance.icon;
            const isMixedTier = suggestion.tierDispersion > 0;

            return (
              <Card key={idx} className="hover-elevate" data-testid={`suggestion-${idx}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm">Option {idx + 1}</CardTitle>
                      <Badge variant="outline" className={balance.color} data-testid={`badge-balance-${idx}`}>
                        <BalanceIcon className="h-3 w-3 mr-1" />
                        {balance.label}
                      </Badge>
                      {isMixedTier && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground border-muted-foreground/40"
                          data-testid={`badge-mixed-tier-${idx}`}
                        >
                          <Layers className="h-3 w-3 mr-1" />
                          Mixed Levels
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs" data-testid={`skill-gap-${idx}`}>
                      Gap: {suggestion.skillGap.toFixed(1)}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Team 1 */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        Team 1 • Avg: {suggestion.team1Avg.toFixed(0)}
                      </div>
                      <div className="space-y-1">
                        {suggestion.team1.map((player) => (
                          <div
                            key={player.id}
                            className="text-sm"
                            data-testid={`team1-player-${player.id}-${idx}`}
                          >
                            {player.name}
                            <span className="text-xs text-muted-foreground ml-1">
                              {player.gender?.[0]} {formatSkillLevel(player.skillScore || 90)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Team 2 */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        Team 2 • Avg: {suggestion.team2Avg.toFixed(0)}
                      </div>
                      <div className="space-y-1">
                        {suggestion.team2.map((player) => (
                          <div
                            key={player.id}
                            className="text-sm"
                            data-testid={`team2-player-${player.id}-${idx}`}
                          >
                            {player.name}
                            <span className="text-xs text-muted-foreground ml-1">
                              {player.gender?.[0]} {formatSkillLevel(player.skillScore || 90)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {availableCourts > 0 && isActiveSession && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => onAssign(
                        suggestion.team1.map(p => p.id),
                        suggestion.team2.map(p => p.id)
                      )}
                      data-testid={`button-assign-suggestion-${idx}`}
                    >
                      Assign to Court
                    </Button>
                  )}
                  {availableCourts > 0 && !isActiveSession && (
                    <div className="text-xs text-center text-muted-foreground py-2" data-testid="readonly-message">
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
