import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag as TagIcon, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Tag, PlayerTag, GameParticipantInfo } from '@shared/schema';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

interface Props {
  gameResultId: string;
  linkedPlayerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TagPlayersDialog({ gameResultId, linkedPlayerId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: participants = [], isLoading: participantsLoading } = useQuery<GameParticipantInfo[]>({
    queryKey: ['/api/tags/game', gameResultId, 'participants'],
    queryFn: () => fetch(`/api/tags/game/${gameResultId}/participants`).then(r => r.json()),
    enabled: open,
    staleTime: Infinity,
  });

  const { data: allTags = [], isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['/api/tags'],
    staleTime: Infinity,
  });

  const { data: existingTags = [], isLoading: existingLoading } = useQuery<PlayerTag[]>({
    queryKey: ['/api/tags/game', gameResultId, 'mine'],
    queryFn: () => apiRequest('GET', `/api/tags/game/${gameResultId}/mine`),
    enabled: open,
    staleTime: 0,
  });

  const teammates = useMemo(
    () => participants.filter(p => p.id !== linkedPlayerId),
    [participants, linkedPlayerId]
  );

  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const existingMap = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const et of existingTags) {
      if (!m[et.taggedPlayerId]) m[et.taggedPlayerId] = new Set();
      m[et.taggedPlayerId].add(et.tagId);
    }
    return m;
  }, [existingTags]);

  const existingCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const et of existingTags) {
      m[et.taggedPlayerId] = (m[et.taggedPlayerId] || 0) + 1;
    }
    return m;
  }, [existingTags]);

  function toggleTag(playerId: string, tagId: string) {
    const existingForPlayer = existingMap[playerId] || new Set();
    if (existingForPlayer.has(tagId)) return;
    const existingCount = existingCountMap[playerId] || 0;
    const currentSelected = selected[playerId] || new Set();
    const totalUsed = existingCount + currentSelected.size;

    setSelected(prev => {
      const current = new Set(prev[playerId] || []);
      if (current.has(tagId)) {
        current.delete(tagId);
      } else {
        if (totalUsed >= 2) return prev;
        current.add(tagId);
      }
      return { ...prev, [playerId]: current };
    });
  }

  const totalNewTags = Object.values(selected).reduce((acc, s) => acc + s.size, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const tags: Array<{ targetPlayerId: string; tagId: string }> = [];
      for (const [playerId, tagIds] of Object.entries(selected)) {
        for (const tagId of tagIds) {
          tags.push({ targetPlayerId: playerId, tagId });
        }
      }
      return apiRequest('POST', `/api/tags/game/${gameResultId}`, { tags });
    },
    onSuccess: (data) => {
      toast({ title: 'Tags submitted!', description: `${data.created} tag${data.created !== 1 ? 's' : ''} recorded.` });
      queryClient.invalidateQueries({ queryKey: ['/api/tags/tagged-games'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tags/game', gameResultId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tags/trending'] });
      setSelected({});
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to submit tags', variant: 'destructive' });
    },
  });

  const isLoading = participantsLoading || tagsLoading || existingLoading;

  const tagsByCategory = useMemo(() => {
    const grouped: Record<string, Tag[]> = {};
    for (const tag of allTags) {
      if (!grouped[tag.category]) grouped[tag.category] = [];
      grouped[tag.category].push(tag);
    }
    return grouped;
  }, [allTags]);

  const categoryOrder = ['playing_style', 'social', 'reputation'];
  const categoryLabels: Record<string, string> = {
    playing_style: 'Playing Style',
    social: 'Personality',
    reputation: 'Reputation',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-tag-players">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-secondary" />
            Tag Your Teammates
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : teammates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No teammates found for this game.</p>
        ) : (
          <div className="space-y-5 py-1">
            {teammates.map(player => {
              const existingForPlayer = existingMap[player.id] || new Set();
              const selectedForPlayer = selected[player.id] || new Set();
              const existingCount = existingCountMap[player.id] || 0;
              const totalUsed = existingCount + selectedForPlayer.size;
              const canAddMore = totalUsed < 2;

              return (
                <div key={player.id} className="rounded-lg border p-4 space-y-3" data-testid={`tag-section-${player.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm">{player.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">Team {player.team}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[...existingForPlayer].map(tagId => {
                        const tag = allTags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <Badge key={tagId} variant="outline" className={`text-xs no-default-hover-elevate no-default-active-elevate ${CATEGORY_COLOR[tag.category]}`}>
                            {tag.emoji} {tag.label}
                            <Check className="h-2.5 w-2.5 ml-1" />
                          </Badge>
                        );
                      })}
                      {[...selectedForPlayer].map(tagId => {
                        const tag = allTags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <Badge key={tagId} className={`text-xs ${CATEGORY_COLOR[tag.category]}`}>
                            {tag.emoji} {tag.label}
                          </Badge>
                        );
                      })}
                      {!canAddMore && existingCount < 2 && (
                        <span className="text-xs text-muted-foreground">Max 2 tags</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {categoryOrder.filter(cat => tagsByCategory[cat]).map(cat => (
                      <div key={cat}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{categoryLabels[cat]}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tagsByCategory[cat].map(tag => {
                            const alreadyGiven = existingForPlayer.has(tag.id);
                            const chosen = selectedForPlayer.has(tag.id);
                            const disabled = alreadyGiven || (!chosen && !canAddMore);
                            return (
                              <button
                                key={tag.id}
                                disabled={disabled}
                                onClick={() => toggleTag(player.id, tag.id)}
                                className={`text-xs px-2.5 py-1 rounded-md border transition-all
                                  ${alreadyGiven
                                    ? 'opacity-50 cursor-not-allowed bg-muted border-muted'
                                    : chosen
                                    ? `${CATEGORY_COLOR[tag.category]} border-transparent font-medium`
                                    : disabled
                                    ? 'opacity-40 cursor-not-allowed border-border bg-background'
                                    : 'hover:bg-muted border-border bg-background cursor-pointer'}
                                `}
                                data-testid={`tag-btn-${player.id}-${tag.id}`}
                              >
                                {tag.emoji} {tag.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-tag-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || totalNewTags === 0}
            data-testid="button-tag-submit"
          >
            {mutation.isPending ? 'Submitting...' : `Submit${totalNewTags > 0 ? ` (${totalNewTags})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
