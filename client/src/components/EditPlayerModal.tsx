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
import { AlertTriangle } from "lucide-react";
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
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  phone: z.string().trim().min(7, "Phone looks too short").or(z.literal("")).optional(),
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
      email: player?.email ?? '',
      phone: player?.phone ?? '',
    },
  });

  useEffect(() => {
    if (player) {
      form.reset({
        name: player.name,
        level: getSkillTier(player.skillScore) as EditPlayerForm['level'],
        email: player.email ?? '',
        phone: player.phone ?? '',
      });
    }
  }, [player?.id, player?.name, player?.skillScore, player?.email, player?.phone, form]);

  const watchedEmail = form.watch("email");
  const watchedPhone = form.watch("phone");
  const hasNoContact = !watchedEmail?.trim() && !watchedPhone?.trim();

  const updateMutation = useMutation({
    mutationFn: async (data: EditPlayerForm) => {
      if (!player) return;
      const newSkillScore = skillLevelMap[data.level];
      return apiRequest('PATCH', `/api/players/${player.id}`, {
        name: data.name.trim(),
        skillScore: newSkillScore,
        email: data.email?.trim() ? data.email.trim() : null,
        phone: data.phone?.trim() ? data.phone.trim() : null,
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      placeholder="player@example.com"
                      data-testid="input-player-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="tel"
                      placeholder="+971 50 123 4567"
                      data-testid="input-player-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasNoContact && (
              <div
                className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
                data-testid="warning-no-contact"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <div>
                  <p className="font-medium">No contact info on file</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Without an email or phone, this player can't self-link to their marketplace account. They'll have to ask an admin.
                  </p>
                </div>
              </div>
            )}

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
