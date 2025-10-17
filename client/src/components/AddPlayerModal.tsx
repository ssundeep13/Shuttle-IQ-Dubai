import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertPlayerSchema } from "@shared/schema";
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

interface AddPlayerModalProps {
  open: boolean;
  onClose: () => void;
  onAddPlayer: (name: string, level: string) => void;
}

const formSchema = insertPlayerSchema.extend({
  name: z.string().min(1, "Player name is required"),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
});

type FormValues = z.infer<typeof formSchema>;

export function AddPlayerModal({ open, onClose, onAddPlayer }: AddPlayerModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      level: "Intermediate",
      gamesPlayed: 0,
      wins: 0,
      status: "waiting",
    },
  });

  const handleSubmit = (values: FormValues) => {
    onAddPlayer(values.name, values.level);
    form.reset();
    onClose();
  };

  const handleClose = () => {
    form.reset();
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
                      data-testid="input-player-name"
                    />
                  </FormControl>
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
                      <SelectTrigger data-testid="select-player-level">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-add-player">
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-add-player">
                Add Player
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
