import { Player } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

interface AutoAssignConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReassign: () => void;
  courtName: string;
  team1: Player[];
  team2: Player[];
}

const getLevelColor = (level: string) => {
  switch (level) {
    case 'Beginner':
      return 'border-success/20 bg-success/10 text-success';
    case 'Intermediate':
      return 'border-warning/20 bg-warning/10 text-warning';
    case 'Advanced':
      return 'border-destructive/20 bg-destructive/10 text-destructive';
    default:
      return 'border-muted bg-muted text-muted-foreground';
  }
};

export function AutoAssignConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  onReassign,
  courtName,
  team1,
  team2,
}: AutoAssignConfirmDialogProps) {
  const team1AvgSkill = team1.reduce((sum, p) => sum + (p.skillScore || 50), 0) / team1.length / 10;
  const team2AvgSkill = team2.reduce((sum, p) => sum + (p.skillScore || 50), 0) / team2.length / 10;
  const skillDifference = Math.abs(team1AvgSkill - team2AvgSkill);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-auto-assign-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Confirm Team Assignment
          </DialogTitle>
          <DialogDescription>
            Review the balanced teams for {courtName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Team 1 */}
            <div className="border-2 border-primary/20 rounded-md p-3 bg-primary/5">
              <h5 className="text-sm font-bold text-primary mb-2 text-center">TEAM 1</h5>
              <div className="space-y-2">
                {team1.map((player) => (
                  <div key={player.id} className="bg-background rounded-md p-2 border border-border">
                    <p className="font-semibold text-sm text-foreground">{player.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge className={cn("text-xs", getLevelColor(player.level))}>
                        {player.level}
                      </Badge>
                      <span className="text-xs font-semibold text-accent">
                        {((player.skillScore || 50) / 10).toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Avg Skill:</span>
                  <span className="text-sm font-bold text-primary">{team1AvgSkill.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Team 2 */}
            <div className="border-2 border-chart-2/20 rounded-md p-3 bg-chart-2/5">
              <h5 className="text-sm font-bold text-chart-2 mb-2 text-center">TEAM 2</h5>
              <div className="space-y-2">
                {team2.map((player) => (
                  <div key={player.id} className="bg-background rounded-md p-2 border border-border">
                    <p className="font-semibold text-sm text-foreground">{player.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge className={cn("text-xs", getLevelColor(player.level))}>
                        {player.level}
                      </Badge>
                      <span className="text-xs font-semibold text-accent">
                        {((player.skillScore || 50) / 10).toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-chart-2/20">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Avg Skill:</span>
                  <span className="text-sm font-bold text-chart-2">{team2AvgSkill.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Balance indicator */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Team Balance</p>
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold",
              skillDifference < 0.5 ? "bg-success/10 text-success" :
              skillDifference < 1.0 ? "bg-warning/10 text-warning" :
              "bg-destructive/10 text-destructive"
            )}>
              {skillDifference < 0.5 && "⚖️ Excellent Balance"}
              {skillDifference >= 0.5 && skillDifference < 1.0 && "✓ Good Balance"}
              {skillDifference >= 1.0 && `Difference: ${skillDifference.toFixed(1)}`}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="sm:flex-1"
            data-testid="button-cancel-auto-assign"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onReassign}
            className="sm:flex-1"
            data-testid="button-reassign-teams"
          >
            🔄 Shuffle Teams
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="sm:flex-1"
            data-testid="button-confirm-auto-assign"
          >
            Start Game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
