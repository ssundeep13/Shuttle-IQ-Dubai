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
  onAddPlayer: (name: string, gender: string, level: string) => void;
}

const formSchema = insertPlayerSchema.extend({
  name: z.string().min(1, "Player name is required"),
  gender: z.enum(['Male', 'Female']),
  level: z.enum(['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional']),
  skillScore: z.number().min(10).max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddPlayerModal({ open, onClose, onAddPlayer }: AddPlayerModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      gender: "Male",
      level: "Intermediate",
      skillScore: 90, // mid-Intermediate
      gamesPlayed: 0,
      wins: 0,
      status: "waiting",
    },
  });

  const handleSubmit = (values: FormValues) => {
    onAddPlayer(values.name, values.gender, values.level);
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
            Enter the player details to add them to the queue.
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
                      className="min-h-12 sm:min-h-10"
                      data-testid="input-player-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-player-gender">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-player-level">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Novice">Novice (1.0-3.9)</SelectItem>
                      <SelectItem value="Beginner">Beginner (4.0-6.9)</SelectItem>
                      <SelectItem value="Intermediate">Intermediate (7.0-10.9)</SelectItem>
                      <SelectItem value="Advanced">Advanced (11.0-15.9)</SelectItem>
                      <SelectItem value="Professional">Professional (16.0-20.0)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="min-h-12 sm:min-h-10" data-testid="button-cancel-add-player">
                Cancel
              </Button>
              <Button type="submit" className="min-h-12 sm:min-h-10" data-testid="button-submit-add-player">
                Add Player
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
