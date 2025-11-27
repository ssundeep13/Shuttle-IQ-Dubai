import { useState } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { getSkillTier, formatSkillLevel } from "@shared/utils/skillUtils";
import type { Player } from "@shared/schema";

const skillLevelMap: Record<string, number> = {
  'Novice': 25,
  'Beginner': 55,
  'Intermediate': 100,
  'Advanced': 150,
  'Professional': 190,
};

const editLevelSchema = z.object({
  level: z.enum(['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional']),
});

type EditLevelForm = z.infer<typeof editLevelSchema>;

interface EditPlayerLevelModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPlayerLevelModal({
  player,
  open,
  onOpenChange,
}: EditPlayerLevelModalProps) {
  const { toast } = useToast();
  
  const form = useForm<EditLevelForm>({
    resolver: zodResolver(editLevelSchema),
    defaultValues: {
      level: player ? getSkillTier(player.skillScore) : 'Intermediate',
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EditLevelForm) => {
      if (!player) return;
      const newSkillScore = skillLevelMap[data.level];
      return apiRequest('PATCH', `/api/players/${player.id}`, {
        skillScore: newSkillScore,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      toast({
        title: "Success",
        description: `${player?.name}'s level has been updated`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update player level",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditLevelForm) => {
    updateMutation.mutate(data);
  };

  if (!player) return null;

  const newLevel = form.watch('level');
  const newSkillScore = skillLevelMap[newLevel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-player-level">
        <DialogHeader>
          <DialogTitle>Edit Player Level</DialogTitle>
          <DialogDescription>
            Update the skill level for {player.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <SelectItem value="Intermediate">Intermediate (100)</SelectItem>
                      <SelectItem value="Advanced">Advanced (150)</SelectItem>
                      <SelectItem value="Professional">Professional (190)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <div className="rounded-lg border p-3 bg-card/50">
              <div className="text-sm text-muted-foreground">
                <p>Current: {formatSkillLevel(player.skillScore)}</p>
                <p>New: {formatSkillLevel(newSkillScore)}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-level"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
