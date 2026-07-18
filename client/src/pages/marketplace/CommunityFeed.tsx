// Gate F3 — read-only Community feed on the Dashboard. Renders real
// feed_events from GET /api/marketplace/feed; every display value comes from
// the frozen event payload (never live player state). Likes/share arrive in
// F4 — no dead interactive-looking affordances here by design.
import { type CSSProperties, type ReactNode } from 'react';
import { useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Users, Heart } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { MKT, FF_BODY } from './LandingComponents';

// Spec: brightened teal is approved ONLY as accent on navy fills; brand teal
// #006B5F everywhere on white/cream.
const TEAL_ON_NAVY = '#2BB3A3';
const CARD_BORDER = 'rgba(0,20,60,0.08)';
const TROPHY_BG = 'hsl(174, 60%, 94%)';

export type FeedFilterValue = 'all' | 'you' | 'sessions';

interface FeedEventDto {
  id: string;
  type: string;
  createdAt: string;
  subjectPlayerId: string | null;
  payload: Record<string, any>;
  session: { venueName: string; date: string } | null;
  likeCount: number;
  likedByMe: boolean;
  likePreview: string[];
}
interface FeedPage {
  events: FeedEventDto[];
  nextCursor: string | null;
}

function initialsOf(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return w < 5 ? `${w}w ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function metaLine(ev: FeedEventDto, extra?: string): string {
  const bits = [extra, ev.session?.venueName, timeAgo(ev.createdAt)].filter(Boolean);
  return bits.join(' · ');
}

// ── Card shells ─────────────────────────────────────────────────────────────

function AvatarCircle({ name, size, bg, fg }: { name?: string; size: number; bg: string; fg: string }) {
  return (
    <div style={{
      flex: 'none', width: size, height: size, borderRadius: '50%', background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FF_BODY, fontWeight: 800, fontSize: Math.round(size * 0.34), letterSpacing: '0.02em',
    }}>
      {initialsOf(name)}
    </div>
  );
}

const whiteCard: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${CARD_BORDER}`, padding: '14px 16px' };

// ── Like row (Gate F4) — heart + avatar stack + inline liker expand ─────────

function likePreviewText(ev: FeedEventDto): string | null {
  if (ev.likeCount === 0) return null;
  const first = ev.likedByMe && ev.likeCount === 1 ? 'You' : (ev.likePreview[0] ?? 'Someone');
  if (ev.likeCount === 1) return first === 'You' ? 'You like this' : `${first} likes this`;
  return `${first} and ${ev.likeCount - 1} other${ev.likeCount - 1 === 1 ? '' : 's'}`;
}

function LikeBar({ ev, onNavy = false }: { ev: FeedEventDto; onNavy?: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // Optimistic delta applied across every cached filter variant; the paired
  // rollback in onError undoes it exactly, and onSettled lets server truth win.
  const applyLocal = (liked: boolean) => {
    queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['/api/marketplace/feed'] }, (data) => {
      if (!data?.pages) return data;
      return {
        ...data,
        pages: data.pages.map(pg => ({
          ...pg,
          events: pg.events.map(e => e.id === ev.id
            ? { ...e, likedByMe: liked, likeCount: Math.max(0, e.likeCount + (liked ? 1 : -1)) }
            : e),
        })),
      };
    });
  };

  const toggle = useMutation({
    mutationFn: () => apiRequest(ev.likedByMe ? 'DELETE' : 'POST', `/api/marketplace/feed/${ev.id}/like`),
    onMutate: () => {
      const wasLiked = ev.likedByMe;
      applyLocal(!wasLiked);
      return { wasLiked };
    },
    onError: (_err, _v, ctx) => { if (ctx) applyLocal(ctx.wasLiked); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['/api/marketplace/feed'] }),
  });

  const { data: likersData, isLoading: likersLoading } = useQuery<{ likers: Array<{ name: string }>; count: number }>({
    queryKey: ['/api/marketplace/feed', ev.id, 'likes'],
    enabled: expanded,
    staleTime: 0,
  });

  const heartColor = onNavy
    ? (ev.likedByMe ? TEAL_ON_NAVY : 'rgba(255,255,255,0.7)')
    : (ev.likedByMe ? MKT.teal : MKT.inkSub);
  const textColor = onNavy ? 'rgba(255,255,255,0.75)' : MKT.inkSub;
  const stackRing = onNavy ? MKT.navy : '#fff';
  const preview = likePreviewText(ev);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => toggle.mutate()}
          aria-label={ev.likedByMe ? 'Unlike' : 'Like'}
          aria-pressed={ev.likedByMe}
          data-testid="feed-like-button"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, margin: -4, display: 'inline-flex', color: heartColor }}
        >
          <Heart className="h-[18px] w-[18px]" fill={ev.likedByMe ? 'currentColor' : 'none'} strokeWidth={2} />
        </button>
        {ev.likePreview.length > 0 && (
          <div className="flex items-center" data-testid="feed-like-stack" aria-hidden>
            {ev.likePreview.slice(0, 3).map((n, i) => (
              <div key={i} style={{
                width: 22, height: 22, borderRadius: '50%', marginLeft: i === 0 ? 0 : -6,
                background: onNavy ? 'rgba(255,255,255,0.18)' : MKT.tealMist,
                color: onNavy ? '#fff' : MKT.tealD,
                border: `2px solid ${stackRing}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FF_BODY, fontWeight: 800, fontSize: 8, letterSpacing: '0.02em',
              }}>
                {initialsOf(n)}
              </div>
            ))}
            {ev.likeCount > 3 && (
              <span style={{ marginLeft: 4, fontFamily: FF_BODY, fontSize: 11, fontWeight: 700, color: textColor }}>+{ev.likeCount - 3}</span>
            )}
          </div>
        )}
        {preview && (
          <button
            onClick={() => setExpanded(x => !x)}
            data-testid="feed-likers-expand"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FF_BODY, fontSize: 12, color: textColor, textAlign: 'left' }}
          >
            {preview}
          </button>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 2 }} data-testid="feed-likers-list">
          {likersLoading && <p style={{ margin: 0, fontFamily: FF_BODY, fontSize: 12, color: textColor }}>Loading…</p>}
          {likersData?.likers.map((l, i) => (
            <p key={i} style={{ margin: 0, marginTop: i === 0 ? 0 : 3, fontFamily: FF_BODY, fontSize: 12, fontWeight: 600, color: onNavy ? '#fff' : MKT.ink }}>{l.name}</p>
          ))}
          {likersData && likersData.count > likersData.likers.length && (
            <p style={{ margin: 0, marginTop: 3, fontFamily: FF_BODY, fontSize: 11, color: textColor }}>and {likersData.count - likersData.likers.length} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function CompactCard({ ev, name, headline, meta, testid }: { ev: FeedEventDto; name?: string; headline: ReactNode; meta: string; testid: string }) {
  return (
    <div style={whiteCard} data-testid={testid}>
      <div className="flex items-center gap-3">
        <AvatarCircle name={name} size={44} bg={MKT.teal} fg="#fff" />
        <div className="flex-1 min-w-0">
          <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 700, fontSize: 15, color: MKT.ink, lineHeight: 1.35 }}>{headline}</p>
          <p style={{ margin: 0, marginTop: 2, fontFamily: FF_BODY, fontSize: 12, color: MKT.inkSub }}>{meta}</p>
        </div>
      </div>
      <LikeBar ev={ev} />
    </div>
  );
}

// tier_promotion — full-navy celebration card with the brand concentric-circle motif.
function PromotionCard({ ev }: { ev: FeedEventDto }) {
  const { playerName, toTier, corrected } = ev.payload;
  const circle = (size: number): CSSProperties => ({
    position: 'absolute', top: -size * 0.38, right: -size * 0.3, width: size, height: size,
    borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', pointerEvents: 'none',
  });
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: MKT.navy, borderRadius: 14, padding: '18px 18px' }} data-testid="feed-card-tier-promotion">
      <div aria-hidden style={circle(150)} />
      <div aria-hidden style={circle(230)} />
      <div aria-hidden style={circle(310)} />
      <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEAL_ON_NAVY }}>
        Tier promotion{corrected ? ' · corrected' : ''}
      </p>
      <div className="flex items-center gap-3.5" style={{ marginTop: 12 }}>
        <AvatarCircle name={playerName} size={52} bg="#fff" fg={MKT.navy} />
        <div className="min-w-0">
          <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 800, fontSize: 18, color: '#fff', lineHeight: 1.3 }}>
            {playerName} is now {toTier}
          </p>
          <p style={{ margin: 0, marginTop: 3, fontFamily: FF_BODY, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{metaLine(ev)}</p>
        </div>
      </div>
      <LikeBar ev={ev} onNavy />
    </div>
  );
}

// tag_received — white card with the teal trophy block.
function TagCard({ ev }: { ev: FeedEventDto }) {
  const { receiverName, giverName, tagLabel } = ev.payload;
  return (
    <div style={whiteCard} data-testid="feed-card-tag-received">
      <div className="flex items-center gap-3">
        <AvatarCircle name={receiverName} size={44} bg={MKT.teal} fg="#fff" />
        <div className="flex-1 min-w-0">
          <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 700, fontSize: 15, color: MKT.ink, lineHeight: 1.35 }}>{receiverName} earned a tag</p>
          <p style={{ margin: 0, marginTop: 2, fontFamily: FF_BODY, fontSize: 12, color: MKT.inkSub }}>{metaLine(ev, `from ${giverName}`)}</p>
        </div>
      </div>
      <div style={{ marginTop: 12, background: TROPHY_BG, borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 800, fontSize: 16, color: MKT.tealD }}>{tagLabel}</p>
        <p style={{ margin: 0, marginTop: 1, fontFamily: FF_BODY, fontSize: 11, color: MKT.teal }}>Captain-verified session</p>
      </div>
      <LikeBar ev={ev} />
    </div>
  );
}

const MILESTONE_HEADLINES: Record<string, (name: string) => string> = {
  first_game: (n) => `${n} played their first game`,
  first_win: (n) => `${n} won their first game`,
  game_50: (n) => `${n} hit 50 games`,
  game_100: (n) => `${n} hit 100 games`,
};

function FeedEventCard({ ev }: { ev: FeedEventDto }) {
  const p = ev.payload;
  switch (ev.type) {
    case 'tier_promotion':
      return <PromotionCard ev={ev} />;
    case 'tag_received':
      return <TagCard ev={ev} />;
    case 'milestone': {
      const headline = (MILESTONE_HEADLINES[p.milestone] ?? ((n: string) => `${n} hit a milestone`))(p.playerName);
      return <CompactCard ev={ev} name={p.playerName} headline={headline} meta={metaLine(ev)} testid="feed-card-milestone" />;
    }
    case 'win_streak':
      return <CompactCard ev={ev} name={p.playerName} headline={`${p.playerName} is on a ${p.streak}-win streak`} meta={metaLine(ev)} testid="feed-card-win-streak" />;
    case 'leaderboard_move':
      return (
        <CompactCard
          ev={ev}
          name={p.playerName}
          headline={`${p.playerName} moved up ${p.fromRank - p.toRank} places`}
          meta={metaLine(ev, `now #${p.toRank} on the leaderboard`)}
          testid="feed-card-leaderboard-move"
        />
      );
    default:
      return null; // unknown/future types render nothing rather than breaking
  }
}

// ── Section ─────────────────────────────────────────────────────────────────

const FILTERS: Array<{ value: FeedFilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'you', label: 'You' },
  { value: 'sessions', label: 'Sessions' },
];

export default function CommunityFeed({ pinned }: { pinned?: ReactNode }) {
  const [filter, setFilter] = useState<FeedFilterValue>('all');

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<FeedPage>({
    queryKey: ['/api/marketplace/feed', filter],
    queryFn: ({ pageParam }) => apiRequest<FeedPage>(
      'GET',
      `/api/marketplace/feed?filter=${filter}${pageParam ? `&cursor=${encodeURIComponent(pageParam as string)}` : ''}`,
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const events = (data?.pages ?? []).flatMap(pg => pg.events);

  return (
    <section data-testid="section-community-feed">
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 800, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }}>Community</h3>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Feed filter">
          {FILTERS.map(f => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.value)}
                data-testid={`feed-filter-${f.value}`}
                style={{
                  fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, padding: '6px 14px', borderRadius: 999,
                  border: `1px solid ${active ? MKT.navy : CARD_BORDER}`, cursor: 'pointer',
                  background: active ? MKT.navy : '#fff', color: active ? '#fff' : MKT.navy,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {pinned}

        {isLoading && [0, 1, 2].map(i => (
          <div key={i} style={{ ...whiteCard, height: 76 }} className="animate-pulse" aria-hidden />
        ))}

        {isError && !isLoading && (
          <div style={{ ...whiteCard, textAlign: 'center', padding: '18px 16px' }}>
            <p style={{ margin: 0, fontFamily: FF_BODY, fontSize: 14, color: MKT.inkSub }}>Couldn't load the community feed — pull to refresh or try again shortly.</p>
          </div>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <div style={{ ...whiteCard, textAlign: 'center', padding: '24px 16px' }} data-testid="feed-empty-state">
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: MKT.tealMist, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <Users className="h-5 w-5" style={{ color: MKT.tealD }} />
            </div>
            <p style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 700, fontSize: 15, color: MKT.ink }}>No community activity yet</p>
            <p style={{ margin: 0, marginTop: 4, fontFamily: FF_BODY, fontSize: 13, color: MKT.inkSub }}>
              Play your first session and the feed comes alive.{' '}
              <Link href="/marketplace/sessions" style={{ color: MKT.tealD, fontWeight: 600, textDecoration: 'none' }} data-testid="feed-empty-book-link">Book a session</Link>
            </p>
          </div>
        )}

        {events.map(ev => <FeedEventCard key={ev.id} ev={ev} />)}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            data-testid="feed-show-more"
            style={{
              fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, padding: '11px 18px', borderRadius: 10,
              border: `1.5px solid ${MKT.navy}55`, background: '#fff', color: MKT.navy, cursor: 'pointer',
              opacity: isFetchingNextPage ? 0.6 : 1,
            }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}
      </div>
    </section>
  );
}
