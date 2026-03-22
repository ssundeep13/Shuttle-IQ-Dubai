import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, ArrowLeft } from 'lucide-react';
import type { TrendingTag, PlayerTopTag } from '@shared/schema';
import type { Player } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

interface TagWithPlayersProps {
  tagId: string;
  onBack: () => void;
}

function TagWithPlayers({ tagId, onBack }: TagWithPlayersProps) {
  const { data, isLoading } = useQuery<Array<{ player: Player; count: number }>>({
    queryKey: ['/api/tags', tagId, 'players'],
    queryFn: () => fetch(`/api/tags/${tagId}/players?limit=10`).then(r => r.json()),
    staleTime: Infinity,
  });

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={onBack} data-testid="button-tag-back">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No players tagged yet.</p>
      ) : (
        <div className="space-y-2">
          {data.map(({ player, count }) => (
            <div key={player.id} className="flex items-center gap-3 py-2.5 border-b last:border-0" data-testid={`row-tagged-player-${player.id}`}>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                {getInitial(player.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{player.name}</p>
                <p className="text-xs text-muted-foreground">{getTierDisplayName(player.level)} &middot; {player.skillScore} pts</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-xs no-default-hover-elevate no-default-active-elevate">
                <Users className="h-3 w-3 mr-1" />
                {count}×
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedPlayerId?: string | null;
}

export default function TagTrendingModal({ open, onOpenChange, linkedPlayerId }: Props) {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedTagLabel, setSelectedTagLabel] = useState<string>('');

  const { data: trending = [], isLoading: trendingLoading } = useQuery<TrendingTag[]>({
    queryKey: ['/api/tags/trending'],
    staleTime: Infinity,
    enabled: open,
  });

  const { data: myTags = [], isLoading: myTagsLoading } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', linkedPlayerId],
    queryFn: () => fetch(`/api/tags/player/${linkedPlayerId}?limit=5`).then(r => r.json()),
    enabled: open && !!linkedPlayerId,
    staleTime: Infinity,
  });

  function handleTagClick(tagId: string, label: string) {
    setSelectedTagId(tagId);
    setSelectedTagLabel(label);
  }

  function handleBack() {
    setSelectedTagId(null);
    setSelectedTagLabel('');
  }

  function handleClose(open: boolean) {
    if (!open) {
      setSelectedTagId(null);
      setSelectedTagLabel('');
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="dialog-trending-tags">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedTagId ? (
              <><Users className="h-4 w-4 text-secondary" /> Players tagged "{selectedTagLabel}"</>
            ) : (
              <><TrendingUp className="h-4 w-4 text-secondary" /> Player Personalities</>
            )}
          </DialogTitle>
        </DialogHeader>

        {selectedTagId ? (
          <TagWithPlayers tagId={selectedTagId} onBack={handleBack} />
        ) : (
          <div className="space-y-5 py-1">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Trending This Week</p>
              {trendingLoading ? (
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-28 rounded-full" />)}
                </div>
              ) : trending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trending tags yet — be the first to tag!</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {trending.map(({ tag, count }) => (
                    <button
                      key={tag.id}
                      onClick={() => handleTagClick(tag.id, `${tag.emoji} ${tag.label}`)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border hover-elevate cursor-pointer ${CATEGORY_COLOR[tag.category]}`}
                      data-testid={`btn-trending-tag-${tag.id}`}
                    >
                      <span>{tag.emoji}</span>
                      <span>{tag.label}</span>
                      <span className="ml-0.5 text-xs opacity-70">{count}×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {linkedPlayerId && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Your Personality Tags</p>
                {myTagsLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
                  </div>
                ) : myTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags yet. Play a game and get tagged by teammates!</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {myTags.map(({ tag, count }) => (
                      <button
                        key={tag.id}
                        onClick={() => handleTagClick(tag.id, `${tag.emoji} ${tag.label}`)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border hover-elevate cursor-pointer ${CATEGORY_COLOR[tag.category]}`}
                        data-testid={`btn-my-tag-${tag.id}`}
                      >
                        <span>{tag.emoji}</span>
                        <span>{tag.label}</span>
                        <span className="ml-0.5 text-xs opacity-70">{count}×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
