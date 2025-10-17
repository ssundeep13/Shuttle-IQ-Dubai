import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddPlayerModalProps {
  open: boolean;
  onClose: () => void;
  onAddPlayer: (name: string, level: string) => void;
}

export function AddPlayerModal({ open, onClose, onAddPlayer }: AddPlayerModalProps) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Intermediate");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAddPlayer(name.trim(), level);
      setName("");
      setLevel("Intermediate");
      onClose();
    }
  };

  const handleClose = () => {
    setName("");
    setLevel("Intermediate");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="modal-add-player">
        <DialogHeader>
          <DialogTitle>Add New Player</DialogTitle>
          <DialogDescription>
            Enter the player's name and skill level to add them to the queue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Player Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter player name"
                autoFocus
                data-testid="input-player-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="level">Skill Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="level" data-testid="select-player-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-add-player">
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()} data-testid="button-submit-add-player">
              Add Player
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
