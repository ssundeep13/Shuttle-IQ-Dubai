import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getTierDisplayName, getSkillTier } from "@shared/utils/skillUtils";
import { apiRequest } from "@/lib/queryClient";
import {
  Zap, Scale, Layers, Clock, Star, AlertCircle, AlertTriangle,
  Shuffle, Sparkles, ArrowRight,
} from "lucide-react";

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
  courtNumber?: number;
  reasoning?: string;
  fromAI?: boolean;
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
  fromAI?: boolean;
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

// ─── helpers ────────────────────────────────────────────────────────────────

const getBalanceIndicator = (
  skillGap: number,
  isStretchMatch?: boolean,
  isFirst?: boolean,
  tierDispersion?: number,
) => {
  if (isStretchMatch) {
    return { label: "Stretch Match", icon: Shuffle, color: "text-amber-600 border-amber-300" };
  }
  if (isFirst) {
    const isMixedTier = (tierDispersion ?? 0) > 0;
    if (skillGap <= 8 && !isMixedTier) {
      return { label: "Best Match", icon: Star, color: "text-emerald-600 border-emerald-300" };
    }
    return { label: "Closest Available", icon: AlertTriangle, color: "text-amber-600 border-amber-300" };
  }
  if (skillGap < 5) {
    return { label: "Best Match", icon: Star, color: "text-emerald-600 border-emerald-300" };
  }
  if (skillGap < 10) {
    return { label: "Balanced", icon: Scale, color: "text-primary border-primary/30" };
  }
  return { label: "Competitive", icon: Zap, color: "text-orange-600 border-orange-300" };
};

const getSpreadColor = (spread: number) =>
  spread <= 10 ? "text-emerald-600" : "text-amber-600";

// ─── PlayerRow ───────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  testIdSuffix,
}: {
  player: PlayerInSuggestion;
  testIdSuffix: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-0.5"
      data-testid={`player-row-${player.id}-${testIdSuffix}`}
    >
      <span className="text-sm font-medium leading-none">{player.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {player.gender?.[0]} · {getTierDisplayName(player.level || "lower_intermediate")} · {player.skillScore ?? 90}
      </span>
      {(player.gamesWaited ?? 0) >= 4 && (
        <Badge
          variant="outline"
          className="text-red-600 border-red-300 text-xs px-1 py-0 h-4 ml-auto shrink-0"
          data-testid={`badge-waited-${player.id}-${testIdSuffix}`}
        >
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          {player.gamesWaited}g
        </Badge>
      )}
    </div>
  );
}

// ─── SuggestionCard ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  idx,
  isFirst,
  isUpNext,
  keyPrefix,
  aiCard,
  availableCourts,
  isActiveSession,
  isTopClosestAvailable,
  onAssign,
}: {
  suggestion: TeamCombination;
  idx: number;
  isFirst: boolean;
  isUpNext: boolean;
  keyPrefix: string;
  aiCard: boolean;
  availableCourts: number;
  isActiveSession: boolean;
  isTopClosestAvailable: boolean;
  onAssign: (t1: string[], t2: string[]) => void;
}) {
  const balance = getBalanceIndicator(
    suggestion.skillGap,
    suggestion.isStretchMatch,
    isFirst,
    suggestion.tierDispersion,
  );
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
      className={[
        "hover-elevate transition-colors",
        isUpNext ? "border-l-4 border-l-secondary" : "",
        suggestion.isStretchMatch ? "border-amber-200" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`suggestion-${keyPrefix}${idx}`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {isUpNext && (
              <Badge
                className="bg-secondary text-secondary-foreground text-xs"
                data-testid={`badge-up-next-${keyPrefix}${idx}`}
              >
                Up Next
              </Badge>
            )}
            <CardTitle className="text-sm font-semibold">{cardTitle}</CardTitle>

            {aiCard && (
              <Badge
                variant="outline"
                className="text-violet-600 border-violet-300 text-xs"
                data-testid={`badge-ai-${keyPrefix}${idx}`}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            )}

            <Badge
              variant="outline"
              className={`text-xs ${balance.color}`}
              data-testid={`badge-balance-${keyPrefix}${idx}`}
            >
              <BalanceIcon className="h-3 w-3 mr-1" />
              {balance.label}
            </Badge>

            {suggestion.isCompromised && (
              <Badge
                variant="outline"
                className="text-muted-foreground border-muted-foreground/40 text-xs"
                data-testid={`badge-compromised-${keyPrefix}${idx}`}
              >
                Compromised
              </Badge>
            )}

            {isMixedTier && !suggestion.isStretchMatch && (
              <Badge
                variant="outline"
                className="text-muted-foreground border-muted-foreground/40 text-xs"
                data-testid={`badge-mixed-tier-${keyPrefix}${idx}`}
              >
                <Layers className="h-3 w-3 mr-1" />
                Mixed Levels
              </Badge>
            )}

            {suggestion.isStretchMatch && suggestion.outlierGamesWaited !== undefined && (
              <Badge
                variant="outline"
                className="text-amber-600 border-amber-300 text-xs"
                data-testid={`badge-waited-stretch-${keyPrefix}${idx}`}
              >
                <Clock className="h-3 w-3 mr-1" />
                Waited {suggestion.outlierGamesWaited}
              </Badge>
            )}
          </div>

          <span
            className="text-xs text-muted-foreground"
            data-testid={`skill-gap-${keyPrefix}${idx}`}
          >
            Gap: {suggestion.skillGap.toFixed(1)}
          </span>
        </div>

        {suggestion.isStretchMatch && suggestion.stretchMatchText && !aiCard && (
          <p className="text-xs text-muted-foreground mt-1">{suggestion.stretchMatchText}</p>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* VS matchup grid */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          {/* Team 1 */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
              Team 1
              <span className={`font-normal normal-case tracking-normal ${getSpreadColor(suggestion.withinTeamSpread1 ?? 0)}`}
                data-testid={`spread1-${keyPrefix}${idx}`}
              >
                avg {suggestion.team1Avg.toFixed(0)} ±{(suggestion.withinTeamSpread1 ?? 0).toFixed(0)}
              </span>
            </p>
            <div>
              {suggestion.team1.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  testIdSuffix={`${keyPrefix}${idx}`}
                />
              ))}
            </div>
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center justify-center pt-5 gap-0.5">
            <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90 sm:rotate-0" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">vs</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground -rotate-90 sm:rotate-180" />
          </div>

          {/* Team 2 */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide flex items-center gap-1">
              Team 2
              <span className={`font-normal normal-case tracking-normal ${getSpreadColor(suggestion.withinTeamSpread2 ?? 0)}`}
                data-testid={`spread2-${keyPrefix}${idx}`}
              >
                avg {suggestion.team2Avg.toFixed(0)} ±{(suggestion.withinTeamSpread2 ?? 0).toFixed(0)}
              </span>
            </p>
            <div>
              {suggestion.team2.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  testIdSuffix={`${keyPrefix}${idx}`}
                />
              ))}
            </div>
          </div>
        </div>

        {aiCard && suggestion.reasoning && (
          <p
            className="text-xs text-muted-foreground italic"
            data-testid={`reasoning-${keyPrefix}${idx}`}
          >
            {suggestion.reasoning}
          </p>
        )}

        {availableCourts > 0 && isActiveSession && (
          <Button
            size="sm"
            className="w-full"
            onClick={() =>
              onAssign(
                suggestion.team1.map((p) => p.id),
                suggestion.team2.map((p) => p.id),
              )
            }
            data-testid={`button-assign-suggestion-${keyPrefix}${idx}`}
          >
            Assign to Court
          </Button>
        )}

        {availableCourts > 0 && !isActiveSession && (
          <div
            className="text-xs text-center text-muted-foreground py-2"
            data-testid="readonly-message"
          >
            Read-only: This is not the active session
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function SuggestedLineups({
  onAssign,
  availableCourts,
  queuePlayerIds,
  isActiveSession = true,
  sessionId,
  groupByTier,
  onGroupByTierChange,
}: SuggestedLineupsProps) {
  const [aiMode, setAiMode] = useState(true);

  const { data, isLoading, error } = useQuery<SuggestionsResponse>({
    queryKey: [
      "/api/matchmaking/suggestions",
      sessionId,
      queuePlayerIds.join(","),
      groupByTier,
      aiMode,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      params.set("groupByTier", String(groupByTier));
      if (aiMode) params.set("aiMode", "true");
      return await apiRequest(
        "GET",
        `/api/matchmaking/suggestions?${params.toString()}`,
      );
    },
    enabled: queuePlayerIds.length >= 4,
    refetchOnWindowFocus: false,
  });

  if (queuePlayerIds.length < 4) return null;

  const suggestions = data?.suggestions || [];
  const restWarnings = data?.restWarnings || [];
  const loneOutliers = data?.loneOutliers || [];
  const stretchMatches = data?.stretchMatches || [];
  const isAIResponse = data?.fromAI === true;

  const topBalance =
    suggestions.length > 0
      ? getBalanceIndicator(
          suggestions[0].skillGap,
          suggestions[0].isStretchMatch,
          true,
          suggestions[0].tierDispersion,
        )
      : null;
  const isTopClosestAvailable = topBalance?.label === "Closest Available";

  const renderCard = (
    suggestion: TeamCombination,
    idx: number,
    isFirst: boolean,
    keyPrefix = "",
    aiCard = false,
  ) => (
    <SuggestionCard
      key={`${keyPrefix}${idx}`}
      suggestion={suggestion}
      idx={idx}
      isFirst={isFirst}
      isUpNext={isFirst && availableCourts > 0 && isActiveSession}
      keyPrefix={keyPrefix}
      aiCard={aiCard}
      availableCourts={availableCourts}
      isActiveSession={isActiveSession}
      isTopClosestAvailable={isTopClosestAvailable}
      onAssign={onAssign}
    />
  );

  const renderAISuggestions = () => {
    if (!isAIResponse || suggestions.length === 0) return null;
    const sorted = [...suggestions].sort(
      (a, b) => (a.courtNumber ?? 0) - (b.courtNumber ?? 0),
    );
    return sorted.map((s, idx) => (
      <div key={`ai-court-group-${idx}`} className="space-y-1">
        {s.courtNumber !== undefined && (
          <p
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            data-testid={`ai-court-heading-${s.courtNumber}`}
          >
            Court {s.courtNumber}
          </p>
        )}
        {renderCard(s, idx, false, "ai-", true)}
      </div>
    ));
  };

  return (
    <div className="space-y-4" data-testid="section-suggested-lineups">
      {/* Section header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">Smart Suggestions</h2>
          <p className="text-xs text-muted-foreground">
            AI-powered lineup recommendations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="ai-mode"
              checked={aiMode}
              onCheckedChange={setAiMode}
              data-testid="switch-ai-mode"
            />
            <Label
              htmlFor="ai-mode"
              className="text-sm text-muted-foreground cursor-pointer select-none flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" />
              AI
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="group-by-tier"
              checked={groupByTier}
              onCheckedChange={onGroupByTierChange}
              data-testid="switch-group-by-tier"
            />
            <Label
              htmlFor="group-by-tier"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Group by level
            </Label>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {isLoading && (
          <div
            className="text-center py-8 text-muted-foreground"
            data-testid="loading-suggestions"
          >
            {aiMode ? "Asking AI for suggestions…" : "Generating suggestions..."}
          </div>
        )}

        {error && !isLoading && (
          <div
            className="text-center py-8 text-destructive"
            data-testid="error-suggestions"
          >
            Failed to load suggestions. Please try again.
          </div>
        )}

        {!isLoading && !error && suggestions.length === 0 && stretchMatches.length === 0 && (
          <div
            className="text-center py-8 text-muted-foreground"
            data-testid="no-suggestions"
          >
            Not enough players for suggestions
          </div>
        )}

        {/* AI mode: grouped by court */}
        {!isLoading && isAIResponse && renderAISuggestions()}

        {/* Local mode */}
        {!isLoading && !isAIResponse && (
          <>
            {restWarnings.length > 0 && (
              <Card
                className="border-orange-200"
                data-testid="card-rest-warnings"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                    <Zap className="h-4 w-4" />
                    Rest Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {restWarnings.map((warning, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-muted-foreground"
                      data-testid={`warning-${idx}`}
                    >
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
                  className="border-blue-200"
                  data-testid={`card-lone-outlier-${idx}`}
                >
                  <CardContent className="py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">
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

            {/* Stretch Match cards — shown at top when outlier waited >= 6 games */}
            {stretchMatches
              .filter((sm) => (sm.outlierGamesWaited ?? 0) >= 6)
              .map((sm, idx) => renderCard(sm, idx, false, "stretch-top-"))}

            {/* Regular suggestion cards */}
            {suggestions.map((s, idx) => renderCard(s, idx, idx === 0))}

            {/* Stretch Match cards — shown at bottom when outlier waited < 6 games */}
            {stretchMatches
              .filter((sm) => (sm.outlierGamesWaited ?? 0) < 6)
              .map((sm, idx) => renderCard(sm, idx, false, "stretch-bottom-"))}
          </>
        )}
      </div>
    </div>
  );
}

