import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Users, ArrowLeft, ThumbsUp, Plus, Check } from 'lucide-react';
import type { TrendingTag, PlayerTopTag, TagSuggestionWithVote } from '@shared/schema';
import type { Player } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

const CATEGORY_LABEL: Record<string, string> = {
  playing_style: 'Playing Style',
  social: 'Social',
  reputation: 'Reputation',
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

interface SuggestFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

function SuggestForm({ onBack, onSuccess }: SuggestFormProps) {
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('');
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/tags/suggestions', { label: label.trim(), emoji: emoji.trim(), category, reason: reason.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags/suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tags/suggestions/my'] });
      toast({ title: 'Suggestion submitted!', description: 'The community can now vote on it.' });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: 'Could not submit', description: err.message, variant: 'destructive' });
    },
  });

  const canSubmit = label.trim().length >= 2 && emoji.trim().length >= 1 && category;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={onBack} data-testid="button-suggest-back">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Emoji</label>
          <Input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="e.g. ⚡"
            maxLength={10}
            className="w-24"
            data-testid="input-suggest-emoji"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Tag Label</label>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Smash King"
            maxLength={20}
            data-testid="input-suggest-label"
          />
          <p className="text-xs text-muted-foreground mt-1">{label.length}/20</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-suggest-category">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="playing_style">Playing Style</SelectItem>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="reputation">Reputation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Why this tag? <span className="normal-case font-normal">(optional)</span></label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Tell the community why this tag would be useful..."
            maxLength={200}
            rows={3}
            data-testid="input-suggest-reason"
          />
          <p className="text-xs text-muted-foreground mt-1">{reason.length}/200</p>
        </div>
        <Button
          className="w-full"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          data-testid="button-submit-suggestion"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit Suggestion'}
        </Button>
      </div>
    </div>
  );
}

interface SuggestionsListProps {
  linkedPlayerId: string;
  onSuggest: () => void;
}

function SuggestionsList({ linkedPlayerId, onSuggest }: SuggestionsListProps) {
  const { toast } = useToast();

  const { data: suggestions = [], isLoading } = useQuery<TagSuggestionWithVote[]>({
    queryKey: ['/api/tags/suggestions'],
    staleTime: 0,
  });

  const voteMutation = useMutation({
    mutationFn: ({ id, hasVoted }: { id: string; hasVoted: boolean }) =>
      hasVoted
        ? apiRequest('DELETE', `/api/tags/suggestions/${id}/vote`, null)
        : apiRequest('POST', `/api/tags/suggestions/${id}/vote`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags/suggestions'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Vote failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Community Proposals</p>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onSuggest} data-testid="button-open-suggest-form">
          <Plus className="h-3.5 w-3.5" /> Suggest a Tag
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">No pending suggestions yet.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onSuggest} data-testid="button-be-first-suggest">
            <Plus className="h-3.5 w-3.5" /> Be the first to suggest
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map(s => (
            <div key={s.id} className="flex items-start gap-3 py-2.5 border-b last:border-0" data-testid={`row-suggestion-${s.id}`}>
              <div className="text-xl shrink-0 mt-0.5">{s.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{s.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs no-default-hover-elevate no-default-active-elevate ${CATEGORY_COLOR[s.category] ?? ''}`}
                  >
                    {CATEGORY_LABEL[s.category] ?? s.category}
                  </Badge>
                </div>
                {s.reason && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.reason}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">by {s.suggestedByPlayerName}</p>
              </div>
              <Button
                size="sm"
                variant={s.hasVoted ? 'default' : 'outline'}
                className="shrink-0 gap-1.5 text-xs"
                disabled={voteMutation.isPending || s.suggestedByPlayerId === linkedPlayerId}
                title={s.suggestedByPlayerId === linkedPlayerId ? 'You cannot vote on your own suggestion' : undefined}
                onClick={() => !s.hasVoted ? voteMutation.mutate({ id: s.id, hasVoted: s.hasVoted }) : undefined}
                data-testid={`button-vote-suggestion-${s.id}`}
                aria-label={s.hasVoted ? 'Voted' : 'Upvote'}
              >
                {s.hasVoted ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
                {s.voteCount}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ModalView = 'main' | 'tag-players' | 'suggest' | 'suggest-success';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedPlayerId?: string | null;
}

export default function TagTrendingModal({ open, onOpenChange, linkedPlayerId }: Props) {
  const [view, setView] = useState<ModalView>('main');
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
    setView('tag-players');
  }

  function handleBack() {
    setView('main');
    setSelectedTagId(null);
    setSelectedTagLabel('');
  }

  function handleClose(o: boolean) {
    if (!o) {
      setView('main');
      setSelectedTagId(null);
      setSelectedTagLabel('');
    }
    onOpenChange(o);
  }

  function getDialogTitle() {
    if (view === 'tag-players') return <><Users className="h-4 w-4 text-secondary" /> Players tagged "{selectedTagLabel}"</>;
    if (view === 'suggest') return <><Plus className="h-4 w-4 text-secondary" /> Suggest a New Tag</>;
    return <><TrendingUp className="h-4 w-4 text-secondary" /> Player Personalities</>;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="dialog-trending-tags">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getDialogTitle()}
          </DialogTitle>
        </DialogHeader>

        {view === 'tag-players' && selectedTagId && (
          <TagWithPlayers tagId={selectedTagId} onBack={handleBack} />
        )}

        {view === 'suggest' && (
          <SuggestForm
            onBack={handleBack}
            onSuccess={() => setView('main')}
          />
        )}

        {view === 'main' && (
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

            {linkedPlayerId && (
              <div className="border-t pt-4">
                <SuggestionsList linkedPlayerId={linkedPlayerId} onSuggest={() => setView('suggest')} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
