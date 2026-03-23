import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getTierDisplayName, getSkillTier } from "@shared/utils/skillUtils";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, ChevronUp, Zap, Scale, Layers, Clock, Star, AlertCircle, AlertTriangle, Shuffle } from "lucide-react";
import { useState } from "react";

interface PlayerInSuggestion extends Player {
  gamesWaited?: number;
  gamesThisSession?: number;
}

interface TeamCombination {
  team1: PlayerInSuggestion[];
  team2: PlayerInSuggestion[];
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  variance: number;
  tierDispersion: number;
  splitPenalty: number;
  crossTierPenalty: number;
  withinTeamSpread1: number;
  withinTeamSpread2: number;
  equityRank: number;
  isStretchMatch?: boolean;
  stretchMatchText?: string;
  outlierGamesWaited?: number;
  isCompromised?: boolean;
  rank: number;
}

interface LoneOutlier {
  player: Player;
  gamesWaited: number;
}

interface SuggestionsResponse {
  suggestions: TeamCombination[];
  restWarnings: string[];
  loneOutliers: LoneOutlier[];
  stretchMatches: TeamCombination[];
  queueSize: number;
}

interface SuggestedLineupsProps {
  onAssign: (team1Ids: string[], team2Ids: string[]) => void;
  availableCourts: number;
  queuePlayerIds: string[];
  isActiveSession?: boolean;
  sessionId?: string;
  groupByTier: boolean;
  onGroupByTierChange: (value: boolean) => void;
}

export function SuggestedLineups({
  onAssign,
  availableCourts,
  queuePlayerIds,
  isActiveSession = true,
  sessionId,
  groupByTier,
  onGroupByTierChange,
}: SuggestedLineupsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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
  const loneOutliers = data?.loneOutliers || [];
  const stretchMatches = data?.stretchMatches || [];

  const getBalanceIndicator = (skillGap: number, isStretchMatch?: boolean, isFirst?: boolean, tierDispersion?: number) => {
    if (isStretchMatch) {
      return { label: "Stretch Match", icon: Shuffle, color: "text-amber-600 dark:text-amber-400" };
    }
    if (isFirst) {
      const isMixedTier = (tierDispersion ?? 0) > 0;
      if (skillGap <= 8 && !isMixedTier) {
        return { label: "Best Match", icon: Star, color: "text-green-600 dark:text-green-400" };
      }
      return { label: "Closest Available", icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400" };
    }
    if (skillGap < 5) {
      return { label: "Best Match", icon: Star, color: "text-green-600 dark:text-green-400" };
    } else if (skillGap < 10) {
      return { label: "Balanced", icon: Scale, color: "text-blue-600 dark:text-blue-400" };
    } else {
      return { label: "Competitive", icon: Zap, color: "text-orange-600 dark:text-orange-400" };
    }
  };

  const getSpreadColor = (spread: number) => {
    if (spread <= 10) return "text-green-600 dark:text-green-400";
    return "text-amber-600 dark:text-amber-400";
  };

  const topBalance = suggestions.length > 0
    ? getBalanceIndicator(suggestions[0].skillGap, suggestions[0].isStretchMatch, true, suggestions[0].tierDispersion)
    : null;
  const isTopClosestAvailable = topBalance?.label === "Closest Available";

  const renderSuggestionCard = (suggestion: TeamCombination, idx: number, isFirst: boolean, keyPrefix: string = "") => {
    const balance = getBalanceIndicator(suggestion.skillGap, suggestion.isStretchMatch, isFirst, suggestion.tierDispersion);
    const BalanceIcon = balance.icon;
    const isMixedTier = suggestion.tierDispersion > 0;

    const cardTitle = suggestion.isStretchMatch
      ? "Stretch Match"
      : isFirst
        ? balance.label
        : isTopClosestAvailable
          ? `Alternative ${idx + 1}`
          : `Option ${idx + 1}`;

    return (
      <Card
        key={`${keyPrefix}${idx}`}
        className={`hover-elevate ${suggestion.isStretchMatch ? "border-amber-200 dark:border-amber-800" : ""}`}
        data-testid={`suggestion-${keyPrefix}${idx}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm">
                {cardTitle}
              </CardTitle>
              <Badge variant="outline" className={balance.color} data-testid={`badge-balance-${keyPrefix}${idx}`}>
                <BalanceIcon className="h-3 w-3 mr-1" />
                {balance.label}
              </Badge>
              {suggestion.isCompromised && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground border-muted-foreground/40"
                  data-testid={`badge-compromised-${keyPrefix}${idx}`}
                >
                  Compromised
                </Badge>
              )}
              {isMixedTier && !suggestion.isStretchMatch && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground border-muted-foreground/40"
                  data-testid={`badge-mixed-tier-${keyPrefix}${idx}`}
                >
                  <Layers className="h-3 w-3 mr-1" />
                  Mixed Levels
                </Badge>
              )}
              {suggestion.isStretchMatch && suggestion.outlierGamesWaited !== undefined && (
                <Badge
                  variant="outline"
                  className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                  data-testid={`badge-waited-stretch-${keyPrefix}${idx}`}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Waited {suggestion.outlierGamesWaited}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs" data-testid={`skill-gap-${keyPrefix}${idx}`}>
              Gap: {suggestion.skillGap.toFixed(1)}
            </CardDescription>
          </div>
          {suggestion.isStretchMatch && suggestion.stretchMatchText && (
            <p className="text-xs text-muted-foreground mt-1">{suggestion.stretchMatchText}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Team 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">Team 1 · Avg: {suggestion.team1Avg.toFixed(0)}</span>
                <span className={`text-xs ${getSpreadColor(suggestion.withinTeamSpread1 ?? 0)}`} data-testid={`spread1-${keyPrefix}${idx}`}>
                  ±{(suggestion.withinTeamSpread1 ?? 0).toFixed(0)}
                </span>
              </div>
              <div className="space-y-1">
                {suggestion.team1.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-1 text-sm"
                    data-testid={`team1-player-${player.id}-${keyPrefix}${idx}`}
                  >
                    <span>{player.name}</span>
                    <span className="text-xs text-muted-foreground">
                      · {player.gender?.[0]} · {getTierDisplayName(player.level || 'lower_intermediate')} · ({player.skillScore || 90})
                    </span>
                    {(player.gamesWaited ?? 0) >= 4 && (
                      <Badge
                        variant="outline"
                        className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 text-xs px-1"
                        data-testid={`badge-waited-${player.id}-${keyPrefix}${idx}`}
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        Waited {player.gamesWaited} games
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Team 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">Team 2 · Avg: {suggestion.team2Avg.toFixed(0)}</span>
                <span className={`text-xs ${getSpreadColor(suggestion.withinTeamSpread2 ?? 0)}`} data-testid={`spread2-${keyPrefix}${idx}`}>
                  ±{(suggestion.withinTeamSpread2 ?? 0).toFixed(0)}
                </span>
              </div>
              <div className="space-y-1">
                {suggestion.team2.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-1 text-sm"
                    data-testid={`team2-player-${player.id}-${keyPrefix}${idx}`}
                  >
                    <span>{player.name}</span>
                    <span className="text-xs text-muted-foreground">
                      · {player.gender?.[0]} · {getTierDisplayName(player.level || 'lower_intermediate')} · ({player.skillScore || 90})
                    </span>
                    {(player.gamesWaited ?? 0) >= 4 && (
                      <Badge
                        variant="outline"
                        className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 text-xs px-1"
                        data-testid={`badge-waited-${player.id}-${keyPrefix}${idx}`}
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        Waited {player.gamesWaited} games
                      </Badge>
                    )}
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
              data-testid={`button-assign-suggestion-${keyPrefix}${idx}`}
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
              onCheckedChange={onGroupByTierChange}
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

          {/* Lone outlier notice cards */}
          {loneOutliers.map((outlier, idx) => {
            const tier = getTierDisplayName(getSkillTier(outlier.player.skillScore || 90));
            const score = outlier.player.skillScore || 90;
            return (
              <Card
                key={`outlier-${idx}`}
                className="border-blue-200 dark:border-blue-800"
                data-testid={`card-lone-outlier-${idx}`}
              >
                <CardContent className="py-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {outlier.player.name} ({tier}, {score}) has no same-level peers in the queue
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {outlier.gamesWaited >= 4
                        ? "A Stretch Match has been generated to get them into a game."
                        : "They will be matched once more same-level players join the queue."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

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

          {!isLoading && !error && suggestions.length === 0 && stretchMatches.length === 0 && (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-suggestions">
              Not enough players for suggestions
            </div>
          )}

          {/* Stretch Match cards — shown at top when outlier has waited ≥ 6 games */}
          {!isLoading && stretchMatches
            .filter(sm => (sm.outlierGamesWaited ?? 0) >= 6)
            .map((sm, idx) => renderSuggestionCard(sm, idx, false, "stretch-top-"))}

          {/* Regular suggestion cards */}
          {!isLoading && suggestions.map((suggestion, idx) =>
            renderSuggestionCard(suggestion, idx, idx === 0)
          )}

          {/* Stretch Match cards — shown at bottom when outlier has waited < 6 games */}
          {!isLoading && stretchMatches
            .filter(sm => (sm.outlierGamesWaited ?? 0) < 6)
            .map((sm, idx) => renderSuggestionCard(sm, idx, false, "stretch-bottom-"))}
        </div>
      )}
    </div>
  );
}
