import { useState } from "react";
import { Trophy, RotateCcw, Download, Pencil, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getSkillTierColor, getTierDisplayName } from "@shared/utils/skillUtils";

interface GameParticipant {
  gameId: string;
  playerId: string;
  team: number;
  skillScoreBefore: number;
  skillScoreAfter: number;
  playerName: string;
  playerLevel: string;
}

interface GameHistoryItem {
  id: string;
  courtId: string;
  team1Score: number;
  team2Score: number;
  winningTeam: number;
  createdAt: string;
  participants: GameParticipant[];
}

interface GameHistoryProps {
  games: GameHistoryItem[];
  onResetGames: () => void;
  sessionId?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const escapeCSVField = (field: string | number): string => {
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
};

const deltaColor = (change: number) =>
  change > 0
    ? "text-emerald-600"
    : change < 0
      ? "text-destructive"
      : "text-muted-foreground";

// ─── PlayerScoreRow ───────────────────────────────────────────────────────────

function PlayerScoreRow({ p }: { p: GameParticipant }) {
  const skillChange = (p.skillScoreAfter - p.skillScoreBefore) / 10;
  const before = (p.skillScoreBefore / 10).toFixed(1);
  const after = (p.skillScoreAfter / 10).toFixed(1);
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      {/* name column shrinks and truncates (audit B3); tier text goes through
          the ruling mapper — display names only, never DB slugs */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-tight truncate">{p.playerName}</p>
        <Badge className={cn("text-xs mt-0.5 max-w-full truncate", getSkillTierColor(p.playerLevel))}>
          {getTierDisplayName(p.playerLevel)}
        </Badge>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground tabular-nums">
          {before} → {after}
        </p>
        <p className={cn("text-xs font-semibold tabular-nums", deltaColor(skillChange))}>
          {skillChange > 0 ? "+" : ""}
          {skillChange.toFixed(1)}
        </p>
      </div>
    </div>
  );
}

// ─── GameCard ─────────────────────────────────────────────────────────────────

function GameCard({
  game,
  index,
  total,
  onEdit,
}: {
  game: GameHistoryItem;
  index: number;
  total: number;
  onEdit: (g: GameHistoryItem) => void;
}) {
  const team1 = game.participants.filter((p) => p.team === 1);
  const team2 = game.participants.filter((p) => p.team === 2);
  const isTeam1Winner = game.winningTeam === 1;
  const gameNumber = total - index;
  const winnerLabel = isTeam1Winner ? "Team 1" : "Team 2";

  return (
    <AccordionItem
      value={game.id}
      className="border border-border rounded-lg overflow-hidden data-[state=open]:shadow-none"
      data-testid={`game-history-${game.id}`}
    >
      {/* Collapsed summary row */}
      <AccordionTrigger
        className="min-w-0 px-3 py-3 hover:no-underline hover-elevate group [&>svg]:hidden"
        data-testid={`accordion-trigger-${game.id}`}
      >
        {/* Two stacked lines (audit F16): the meta row, then WHO played.
            The names line truncates independently and never widens the row. */}
        <div className="flex flex-col gap-1 w-full min-w-0">
        {/* gap-2 + px-3: at 380px the fixed children (badge/score/chip/
            chevron/edit) alone must fit even with the date fully truncated. */}
        <div className="flex items-center gap-2 w-full min-w-0">
          {/* Game number */}
          <Badge
            variant="outline"
            className="shrink-0 text-xs font-semibold tabular-nums"
          >
            #{gameNumber}
          </Badge>

          {/* Score pill */}
          <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
            {game.team1Score}–{game.team2Score}
          </span>

          {/* Winner chip */}
          <Badge
            className={cn(
              "text-xs shrink-0",
              isTeam1Winner
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-secondary/10 text-secondary border-secondary/20",
            )}
          >
            <Trophy className="h-3 w-3 mr-1" />
            {winnerLabel}
          </Badge>

          {/* Date — pushed right; the one flexible child: it truncates so the
              chevron + edit button never leave the canvas at 360-412px. */}
          <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {format(new Date(game.createdAt), "MMM d, h:mm a")}
          </span>

          {/* Chevron */}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 shrink-0" />

          {/* Edit button — stops accordion toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(game);
            }}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            data-testid={`button-edit-game-${game.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Names line — one truncating line, full names, no wrap */}
        <p
          className="min-w-0 max-w-full truncate text-left text-xs text-muted-foreground"
          data-testid={`text-game-players-${game.id}`}
        >
          {team1.map((p) => p.playerName).join(" + ")} vs {team2.map((p) => p.playerName).join(" + ")}
        </p>
        </div>
      </AccordionTrigger>

      {/* Expanded detail */}
      <AccordionContent className="px-4 pb-4 pt-0">
        <div className="grid grid-cols-2 gap-3">
          {/* Team 1 */}
          <div
            className={cn(
              "rounded-lg border-2 p-3",
              isTeam1Winner
                ? "bg-emerald-50 border-emerald-300"
                : "bg-primary/5 border-primary/20",
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wide">
                Team 1
              </p>
              {isTeam1Winner && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
            </div>
            <div className="divide-y divide-border">
              {team1.map((p) => (
                <PlayerScoreRow key={p.playerId} p={p} />
              ))}
            </div>
          </div>

          {/* Team 2 */}
          <div
            className={cn(
              "rounded-lg border-2 p-3",
              !isTeam1Winner
                ? "bg-emerald-50 border-emerald-300"
                : "bg-secondary/5 border-secondary/20",
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-secondary uppercase tracking-wide">
                Team 2
              </p>
              {!isTeam1Winner && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
            </div>
            <div className="divide-y divide-border">
              {team2.map((p) => (
                <PlayerScoreRow key={p.playerId} p={p} />
              ))}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function GameHistory({ games, onResetGames, sessionId }: GameHistoryProps) {
  const { toast } = useToast();
  const [editingGame, setEditingGame] = useState<GameHistoryItem | null>(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);

  const updateGameMutation = useMutation({
    mutationFn: async ({
      gameId,
      team1Score,
      team2Score,
    }: {
      gameId: string;
      team1Score: number;
      team2Score: number;
    }) => apiRequest("PATCH", `/api/game-results/${gameId}`, { team1Score, team2Score }),
    onSuccess: () => {
      toast({ title: "Game Updated", description: "Score updated successfully." });
      setEditingGame(null);
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ["/api/game-history", sessionId] });
        queryClient.invalidateQueries({
          queryKey: ["/api/sessions", sessionId, "game-history"],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/game-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update game score",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = (game: GameHistoryItem) => {
    setEditingGame(game);
    setTeam1Score(game.team1Score);
    setTeam2Score(game.team2Score);
  };

  const handleSaveEdit = () => {
    if (!editingGame) return;
    if (team1Score === team2Score) {
      toast({
        title: "Invalid Score",
        description: "Scores cannot be tied. One team must win.",
        variant: "destructive",
      });
      return;
    }
    updateGameMutation.mutate({ gameId: editingGame.id, team1Score, team2Score });
  };

  const downloadCSV = () => {
    const headers = ["Game #", "Date", "Team 1 Players", "Team 2 Players", "Score", "Winning Team"];
    const csvRows = [headers.map(escapeCSVField).join(",")];
    games.forEach((game, index) => {
      const row = [
        games.length - index,
        format(new Date(game.createdAt), "yyyy-MM-dd HH:mm"),
        game.participants.filter((p) => p.team === 1).map((p) => `${p.playerName} (${getTierDisplayName(p.playerLevel)})`).join("; "),
        game.participants.filter((p) => p.team === 2).map((p) => `${p.playerName} (${getTierDisplayName(p.playerLevel)})`).join("; "),
        `${game.team1Score}-${game.team2Score}`,
        `Team ${game.winningTeam}`,
      ].map(escapeCSVField).join(",");
      csvRows.push(row);
    });
    const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `game-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const emptyState = (
    <div className="flex items-center justify-center py-14 rounded-lg bg-muted/40 border border-dashed border-border">
      <p className="text-sm text-muted-foreground">
        No games yet. Start a game to see history here.
      </p>
    </div>
  );

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-semibold text-foreground">
          Game History
          {games.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {games.length} {games.length === 1 ? "game" : "games"}
            </span>
          )}
        </h2>
        {games.length > 0 && (
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={downloadCSV}
              variant="outline"
              size="sm"
              className="min-h-9"
              data-testid="button-download-csv"
            >
              <Download className="w-4 h-4 mr-1.5" />
              CSV
            </Button>
            <Button
              onClick={onResetGames}
              variant="outline"
              size="sm"
              className="min-h-9 text-destructive hover:text-destructive"
              data-testid="button-reset-games"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Game list as accordion */}
      {games.length === 0 ? (
        emptyState
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {games.map((game, index) => (
            <GameCard
              key={game.id}
              game={game}
              index={index}
              total={games.length}
              onEdit={handleEditClick}
            />
          ))}
        </Accordion>
      )}

      {/* Edit Score Dialog (unchanged) */}
      <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Game Score</DialogTitle>
          </DialogHeader>
          {editingGame && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Team 1 Players</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {editingGame.participants
                      .filter((p) => p.team === 1)
                      .map((p) => p.playerName)
                      .join(", ")}
                  </div>
                </div>
                <div>
                  <Label>Team 2 Players</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {editingGame.participants
                      .filter((p) => p.team === 2)
                      .map((p) => p.playerName)
                      .join(", ")}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="team1Score">Team 1 Score</Label>
                  <Input
                    id="team1Score"
                    type="number"
                    min={0}
                    max={99}
                    value={team1Score}
                    onChange={(e) => setTeam1Score(parseInt(e.target.value) || 0)}
                    data-testid="input-team1-score"
                  />
                </div>
                <div>
                  <Label htmlFor="team2Score">Team 2 Score</Label>
                  <Input
                    id="team2Score"
                    type="number"
                    min={0}
                    max={99}
                    value={team2Score}
                    onChange={(e) => setTeam2Score(parseInt(e.target.value) || 0)}
                    data-testid="input-team2-score"
                  />
                </div>
              </div>
              {team1Score === team2Score && team1Score > 0 && (
                <p className="text-sm text-destructive">
                  Scores cannot be tied. One team must win.
                </p>
              )}
              {(team1Score !== editingGame.team1Score ||
                team2Score !== editingGame.team2Score) &&
                (team1Score > team2Score) !==
                  (editingGame.team1Score > editingGame.team2Score) && (
                  <p className="text-sm text-amber-600">
                    Note: This will change the winning team and recalculate skill scores.
                  </p>
                )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingGame(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateGameMutation.isPending || team1Score === team2Score}
              data-testid="button-save-edit"
            >
              {updateGameMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
