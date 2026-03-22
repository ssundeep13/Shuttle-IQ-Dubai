import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { getSkillTier, formatSkillLevel } from "@shared/utils/skillUtils";
import type { Player } from "@shared/schema";

// Maps canonical DB level → skill score for admin manual overrides
const skillLevelMap: Record<string, number> = {
  'Novice':             25,
  'Beginner':           55,
  'lower_intermediate': 80,
  'upper_intermediate': 100,
  'Advanced':           150,
  'Professional':       190,
};

const editPlayerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  level: z.enum(['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional']),
});

type EditPlayerForm = z.infer<typeof editPlayerSchema>;

interface EditPlayerModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPlayerModal({
  player,
  open,
  onOpenChange,
}: EditPlayerModalProps) {
  const { toast } = useToast();
  
  const form = useForm<EditPlayerForm>({
    resolver: zodResolver(editPlayerSchema),
    defaultValues: {
      name: player?.name || '',
      level: player ? (getSkillTier(player.skillScore) as EditPlayerForm['level']) : 'lower_intermediate',
    },
  });

  useEffect(() => {
    if (player) {
      form.reset({
        name: player.name,
        level: getSkillTier(player.skillScore) as EditPlayerForm['level'],
      });
    }
  }, [player?.id, player?.name, player?.skillScore, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditPlayerForm) => {
      if (!player) return;
      const newSkillScore = skillLevelMap[data.level];
      return apiRequest('PATCH', `/api/players/${player.id}`, {
        name: data.name.trim(),
        skillScore: newSkillScore,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players', player?.id, 'stats'] });
      toast({
        title: "Success",
        description: "Player details have been updated",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update player",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditPlayerForm) => {
    updateMutation.mutate(data);
  };

  if (!player) return null;

  const newLevel = form.watch('level');
  const newSkillScore = skillLevelMap[newLevel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-player">
        <DialogHeader>
          <DialogTitle>Edit Player</DialogTitle>
          <DialogDescription>
            Update player name and skill level
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Enter player name"
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-skill-level">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Novice">Novice (25)</SelectItem>
                      <SelectItem value="Beginner">Beginner (55)</SelectItem>
                      <SelectItem value="lower_intermediate">Intermediate (80)</SelectItem>
                      <SelectItem value="upper_intermediate">Competitive (100)</SelectItem>
                      <SelectItem value="Advanced">Advanced (150)</SelectItem>
                      <SelectItem value="Professional">Professional (190)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <div className="rounded-lg border p-3 bg-card/50">
              <div className="text-sm text-muted-foreground">
                <p>Current Level: {formatSkillLevel(player.skillScore)}</p>
                <p>New Level: {formatSkillLevel(newSkillScore)}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-player"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
