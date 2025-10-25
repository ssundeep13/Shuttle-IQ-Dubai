import { useState, useEffect } from "react";
import { CourtWithPlayers } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy } from "lucide-react";

interface EndGameModalProps {
  court: CourtWithPlayers | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (courtId: string, winningTeam: number, team1Score: number, team2Score: number) => void;
}

export function EndGameModal({ court, isOpen, onClose, onSubmit }: EndGameModalProps) {
  const [team1Score, setTeam1Score] = useState<string>("21");
  const [team2Score, setTeam2Score] = useState<string>("19");

  useEffect(() => {
    if (isOpen && court?.winningTeam) {
      if (court.winningTeam === 1) {
        setTeam1Score("21");
        setTeam2Score("19");
      } else {
        setTeam1Score("19");
        setTeam2Score("21");
      }
    }
  }, [isOpen, court?.winningTeam]);

  if (!court) return null;

  const team1 = court.players.filter(p => p.team === 1);
  const team2 = court.players.filter(p => p.team === 2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const score1 = parseInt(team1Score);
    const score2 = parseInt(team2Score);

    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
      return;
    }

    if (!court.winningTeam) {
      return;
    }

    onSubmit(court.id, court.winningTeam, score1, score2);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-end-game">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-success" />
            Record Game Result
          </DialogTitle>
          <DialogDescription>
            Enter the final score for this match
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="team1-score" className="text-sm font-semibold text-primary">
                Team 1 Score
              </Label>
              <div className="space-y-1">
                {team1.map((player) => (
                  <div key={player.id} className="text-xs text-muted-foreground">
                    {player.name}
                  </div>
                ))}
              </div>
              <Input
                id="team1-score"
                type="number"
                min="0"
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                className="text-center text-lg font-bold"
                data-testid="input-team1-score"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team2-score" className="text-sm font-semibold text-chart-2">
                Team 2 Score
              </Label>
              <div className="space-y-1">
                {team2.map((player) => (
                  <div key={player.id} className="text-xs text-muted-foreground">
                    {player.name}
                  </div>
                ))}
              </div>
              <Input
                id="team2-score"
                type="number"
                min="0"
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                className="text-center text-lg font-bold"
                data-testid="input-team2-score"
              />
            </div>
          </div>

          {court.winningTeam && (
            <div className="text-center text-sm text-muted-foreground">
              Team {court.winningTeam} wins
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              data-testid="button-cancel-end-game"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              data-testid="button-confirm-end-game"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Record Result
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
