import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Share2 } from 'lucide-react';
import type { PlayerStats, PlayerTopTag } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100/20 text-blue-200 border-blue-300/30',
  social: 'bg-green-100/20 text-green-200 border-green-300/30',
  reputation: 'bg-amber-100/20 text-amber-200 border-amber-300/30',
  _default: 'bg-white/10 text-white/80 border-white/20',
};

function tagCategoryClass(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR._default;
}

export default function PersonalityCard() {
  const { playerId } = useParams<{ playerId: string }>();

  const { data: stats, isLoading: statsLoading } = useQuery<PlayerStats>({
    queryKey: ['/api/players', playerId, 'stats'],
    enabled: !!playerId,
  });

  const { data: tags = [], isLoading: tagsLoading } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', playerId],
    queryFn: () => fetch(`/api/tags/player/${playerId}?limit=3`).then(r => r.json()),
    enabled: !!playerId,
  });

  const isLoading = statsLoading || tagsLoading;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${stats?.player.name}'s ShuttleIQ Personality`,
        text: `Check out ${stats?.player.name}'s personality on ShuttleIQ!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f2b46 40%, #163a5f 70%, #0d7060 100%)' }}
      >
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-8 w-32 bg-white/10" />
          <Skeleton className="h-64 w-full bg-white/10 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-white"
        style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f2b46 40%, #163a5f 70%, #0d7060 100%)' }}
      >
        <p className="text-lg mb-4">Player not found</p>
        <Link href="/marketplace/rankings">
          <Button variant="outline" className="border-white/30 text-white bg-transparent">
            Back to Rankings
          </Button>
        </Link>
      </div>
    );
  }

  const topTags = tags.slice(0, 3);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f2b46 40%, #163a5f 70%, #0d7060 100%)' }}
      data-testid="personality-card-page"
    >
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />

      <div className="relative w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/marketplace/players/${playerId}`}>
            <button className="flex items-center gap-1.5 text-white/60 hover:text-white/90 text-sm transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Profile
            </button>
          </Link>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-white/60 hover:text-white/90 text-sm transition-colors"
            data-testid="button-share-personality"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>

        <div
          className="rounded-3xl border border-white/10 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
          data-testid="personality-card"
        >
          <div className="px-8 pt-8 pb-6 text-center border-b border-white/10">
            <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
              {stats.player.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-white mb-1" data-testid="text-card-name">
              {stats.player.name}
            </h1>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {stats.player.shuttleIqId && (
                <span className="text-xs font-mono text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded-full border border-teal-400/20">
                  {stats.player.shuttleIqId}
                </span>
              )}
              <span className="text-xs text-white/50">
                {getTierDisplayName(stats.player.level)} · {stats.player.skillScore} pts
              </span>
            </div>
          </div>

          <div className="px-8 py-6">
            <p className="text-[11px] uppercase tracking-widest text-white/40 text-center mb-5 font-medium">
              Community Personality
            </p>

            {topTags.length === 0 ? (
              <p className="text-center text-white/50 text-sm py-4">
                No personality tags yet. Play more games!
              </p>
            ) : (
              <div className="space-y-3">
                {topTags.map(({ tag, count }, i) => (
                  <div
                    key={tag.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${tagCategoryClass(tag.category)}`}
                    data-testid={`card-tag-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tag.emoji}</span>
                      <span className="font-semibold text-white text-base">{tag.label}</span>
                    </div>
                    <span className="text-white/50 text-sm font-medium">{count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-8 pb-6 text-center">
            <div className="border-t border-white/10 pt-4">
              <p className="text-[11px] text-white/30 font-medium tracking-wider">ShuttleIQ · Dubai Badminton</p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-white/30 mb-3">Screenshot to share on WhatsApp or Instagram</p>
          <Link href="/marketplace/signup">
            <button className="text-xs text-teal-400 hover:text-teal-300 transition-colors underline underline-offset-2">
              Create your own ShuttleIQ profile
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
