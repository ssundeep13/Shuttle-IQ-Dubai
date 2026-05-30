import { useState, useMemo, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, MapPin, Clock, BarChart3, TrendingUp, ArrowRight, ChevronRight, Target, Bookmark, Download, Users, Tag as TagIcon, Check, Sparkles, X, Timer, Trophy, Star, ExternalLink, Lightbulb, Gift, Copy, Wallet } from 'lucide-react';
import { getRelativeTimeLabel } from '@/lib/timeUtils';
import { format } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import type { BookingWithDetails, PlayerStats, TrendingTag, PlayerTopTag, ReceivedTagEntry, TagSuggestion, BookableSessionWithAvailability } from '@shared/schema';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useToast } from '@/hooks/use-toast';
import TagTrendingModal from '@/components/TagTrendingModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

const TAG_MILESTONES = [5, 10, 25, 50];

const CATEGORY_BG: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  _default: 'bg-muted text-muted-foreground border-border',
};
const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

// ── Shared styled primitives (look only) ─────────────────────────────────────
const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${MKT.navy}12` };

function DashCard({ children, testid, style }: { children: ReactNode; testid?: string; style?: CSSProperties }) {
  return <div data-testid={testid} style={{ ...cardStyle, padding: '20px 22px', ...style }}>{children}</div>;
}

function DashHeader({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2" style={{ color: MKT.navy }}>
        <span style={{ color: MKT.teal, display: 'flex' }}>{icon}</span>
        <h3 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em' }}>{title}</h3>
      </div>
      {action}
    </div>
  );
}

function navyBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
function ghostBtn(size: 'sm' | 'md' = 'md'): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: size === 'sm' ? 13 : 14, letterSpacing: '-0.005em',
    padding: size === 'sm' ? '8px 14px' : '11px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}55`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
  };
}
const seeAllLink: CSSProperties = { fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, color: MKT.tealD, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', cursor: 'pointer' };

type Tone = { band: string; soft: string; fg: string; label: string; hasLevel: boolean };
function levelTone(title: string): Tone {
  const t = (title || '').toLowerCase();
  const P = { band: '#7A4FBF', soft: '#EEE6F8', fg: '#4A2B85' };
  const B = { band: '#2A6FDB', soft: '#E3ECF8', fg: '#1B4A99' };
  const G = { band: '#1F8A5B', soft: '#DDEEE2', fg: '#1A6A45' };
  if (t.includes('advanced')) return { ...P, label: 'Advanced', hasLevel: true };
  if (t.includes('pro')) return { ...P, label: 'Pro', hasLevel: true };
  if (t.includes('intermediate')) return { ...B, label: 'Intermediate', hasLevel: true };
  if (t.includes('beginner')) return { ...G, label: 'Beginner', hasLevel: true };
  if (t.includes('novice')) return { ...G, label: 'Novice', hasLevel: true };
  return { band: MKT.teal, soft: MKT.tealMist, fg: MKT.tealD, label: 'General', hasLevel: false };
}

function GettingStartedCard({
  bookings,
  linkedPlayerId,
  bookingsLoading,
  userId,
}: {
  bookings: BookingWithDetails[] | undefined;
  linkedPlayerId: string | null;
  bookingsLoading: boolean;
  userId: string;
}) {
  const browsedKey = `siq_onboarding_browsed_${userId}`;
  const dismissedKey = `siq_onboarding_dismissed_${userId}`;

  const [browsed, setBrowsed] = useState(() =>
    localStorage.getItem(browsedKey) === 'true'
  );
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(dismissedKey) === 'true'
  );

  const step1Done = browsed;
  const step2Done = (bookings || []).some(b => b.status === 'confirmed');
  const step3Done = !!linkedPlayerId;
  const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;
  const allDone = completedCount === 3;

  if (bookingsLoading || allDone || dismissed) return null;

  const handleBrowseClick = () => {
    localStorage.setItem(browsedKey, 'true');
    setBrowsed(true);
  };

  const handleDismiss = () => {
    localStorage.setItem(dismissedKey, 'true');
    setDismissed(true);
  };

  const steps = [
    {
      done: step1Done,
      label: 'Browse upcoming sessions',
      desc: 'Find a session at a venue near you',
      btnLabel: 'Browse Sessions',
      href: '/marketplace/book',
      onClick: handleBrowseClick,
    },
    {
      done: step2Done,
      label: 'Book your first session',
      desc: 'Reserve your spot and get on the court',
      btnLabel: 'Find a Session',
      href: '/marketplace/book',
      onClick: undefined,
    },
    {
      done: step3Done,
      label: 'Link your ShuttleIQ ID to track stats',
      desc: 'Connect your profile to unlock scores and rankings',
      btnLabel: 'Link Profile',
      href: '/marketplace/profile',
      onClick: undefined,
    },
  ];

  return (
    <DashCard testid="card-getting-started">
      <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: MKT.teal }} />
          <h3 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 18, color: MKT.navy, letterSpacing: '-0.02em' }}>Getting Started</h3>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: FF_MONO, fontSize: 11, color: MKT.inkSub, letterSpacing: '0.04em' }} data-testid="text-onboarding-progress">
            {completedCount} of 3 complete
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="button-dismiss-onboarding"
            aria-label="Dismiss getting started"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, padding: 4, display: 'inline-flex' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden', marginBottom: 16 }}>
        <div
          style={{ height: '100%', borderRadius: 999, background: MKT.teal, width: `${(completedCount / 3) * 100}%`, transition: 'width 0.5s cubic-bezier(.2,.7,.2,1)' }}
          data-testid="progress-onboarding"
        />
      </div>
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${step.done ? 'opacity-50' : ''}`}
            data-testid={`step-onboarding-${i + 1}`}
          >
            <div
              style={{
                flex: 'none', width: 28, height: 28, borderRadius: '50%', marginTop: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.done ? MKT.teal : '#fff', border: `1.5px solid ${step.done ? MKT.teal : MKT.navy + '33'}`,
              }}
            >
              {step.done ? (
                <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />
              ) : (
                <span style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 12, color: MKT.inkSub }}>{i + 1}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3, color: MKT.ink, textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </p>
              {!step.done && (
                <>
                  <p style={{ fontSize: 12, color: MKT.inkSub, marginTop: 2 }}>{step.desc}</p>
                  <Link href={step.href} onClick={step.onClick} style={{ ...ghostBtn('sm'), marginTop: 8, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }} data-testid={`button-onboarding-step-${i + 1}`}>
                    {step.btnLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </DashCard>
  );
}

// ── Unified session card (merge of Today's banner + Your Next Session) ───────
function UnifiedSessionCard({
  todayBooking,
  todayCheckedIn,
  nextBooking,
  nextAvailableSession,
  bookingsLoading,
}: {
  todayBooking: BookingWithDetails | undefined;
  todayCheckedIn: boolean;
  nextBooking: BookingWithDetails | undefined;
  nextAvailableSession: BookableSessionWithAvailability | null;
  bookingsLoading: boolean;
}) {
  // TODAY MODE — navy hero with level accent band + manual-check-in-aware footer.
  if (todayBooking) {
    const tone = levelTone(todayBooking.session.title);
    return (
      <div data-testid="card-next-session" style={{ background: MKT.navy, color: '#fff', borderRadius: 16, overflow: 'hidden', display: 'grid', gridTemplateColumns: '8px 1fr' }}>
        <div style={{ background: tone.band }} />
        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            data-testid="text-today-session-eyebrow"
            style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, color: MKT.tealL, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C7E5D3', boxShadow: '0 0 0 4px rgba(199,229,211,0.2)', animation: 'siq-pulse 1.6s ease-in-out infinite' }} />
            {todayCheckedIn ? "You're checked in" : "Today's session"}
          </div>
          <h2 data-testid="text-today-session-title" style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(26px, 3.5vw, 36px)', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            {todayBooking.session.title}
          </h2>
          <div className="flex flex-wrap items-center" style={{ gap: '8px 24px', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
            <span data-testid="text-today-session-time" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
              <span style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 15, color: '#fff' }}>
                {todayBooking.session.startTime}{todayBooking.session.endTime ? ` — ${todayBooking.session.endTime}` : ''}
              </span>
            </span>
            <span data-testid="text-today-session-venue" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <MapPin className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
              <b style={{ color: '#fff', fontWeight: 600 }}>{todayBooking.session.venueName}</b>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Users className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
              <span style={{ fontFamily: FF_MONO, fontSize: 12, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.06em' }}>{todayBooking.session.courtCount} courts</span>
            </span>
          </div>
          <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            {/* Manual check-in: play link only once the Court Captain checks the player in */}
            {todayCheckedIn ? (
              <Link href="/marketplace/play" style={{ ...navyBtn('md'), background: '#fff', color: MKT.navy, borderColor: '#fff', textDecoration: 'none' }} data-testid="button-go-to-play">
                Go to play screen <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Your Court Captain will check you in at the venue
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // FUTURE / EMPTY MODE — white card
  return (
    <DashCard testid="card-next-session">
      <DashHeader icon={<Calendar className="h-4 w-4" />} title="Your Next Session" />
      {bookingsLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : nextBooking ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <p style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy, letterSpacing: '-0.01em' }} data-testid="text-next-session-title">{nextBooking.session.title}</p>
            {(() => {
              const rel = getRelativeTimeLabel(nextBooking.session.date as unknown as string, nextBooking.session.startTime);
              return rel ? (
                <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 600, color: MKT.tealD }} data-testid="text-next-session-relative">
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  {rel}
                </div>
              ) : null;
            })()}
            <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 14, color: MKT.inkSub }}>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(nextBooking.session.date), 'EEE, MMM d')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {nextBooking.session.startTime}
                {nextBooking.session.endTime ? ` – ${nextBooking.session.endTime}` : ''}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {nextBooking.session.venueName}
              </span>
            </div>
          </div>
          <span data-testid="badge-next-status" style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: MKT.tealMist, color: MKT.tealD }}>
            {nextBooking.status === 'confirmed' ? 'Confirmed' : nextBooking.status}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-5 gap-3" data-testid="empty-next-session">
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: MKT.tealMist, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar className="h-5 w-5" style={{ color: MKT.tealD }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: MKT.inkSub }}>No upcoming sessions booked</p>
            {nextAvailableSession && (
              <p style={{ fontSize: 12, color: MKT.inkSub, marginTop: 4 }}>
                Next up: <span style={{ fontWeight: 600, color: MKT.tealD }}>{nextAvailableSession.venueName}</span>
                {' · '}{format(new Date(nextAvailableSession.date), 'EEE, MMM d')}
              </p>
            )}
          </div>
          <Link href="/marketplace/book" style={{ ...navyBtn('sm'), textDecoration: 'none' }} data-testid="button-book-session-cta">
            Book a session <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </DashCard>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;
  const { canInstall, install } = useInstallPrompt();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [showTrendingModal, setShowTrendingModal] = useState(false);
  const [milestoneDismissed, setMilestoneDismissed] = useState(false);

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/bookings/mine'],
    staleTime: 0,
  });

  const { data: stats } = useQuery<PlayerStats>({
    queryKey: ['/api/players', linkedPlayerId, 'stats'],
    enabled: !!linkedPlayerId,
  });

  const { data: availableSessions = [] } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
    staleTime: 60_000,
  });

  const { data: trending = [], isLoading: trendingLoading } = useQuery<TrendingTag[]>({
    queryKey: ['/api/tags/trending'],
    staleTime: Infinity,
  });

  const { data: myTopTag } = useQuery<PlayerTopTag[]>({
    queryKey: ['/api/tags/player', linkedPlayerId],
    queryFn: () => fetch(`/api/tags/player/${linkedPlayerId}?limit=1`).then(r => r.json()),
    enabled: !!linkedPlayerId,
    staleTime: Infinity,
  });

  const { data: taggedGameIds = [] } = useQuery<string[]>({
    queryKey: ['/api/tags/tagged-games'],
    enabled: !!linkedPlayerId,
    staleTime: 0,
  });

  const { data: receivedTags = [] } = useQuery<ReceivedTagEntry[]>({
    queryKey: ['/api/tags/received/recent'],
    enabled: !!linkedPlayerId,
    staleTime: 0,
  });

  const { data: mySuggestions = [] } = useQuery<TagSuggestion[]>({
    queryKey: ['/api/tags/suggestions/my'],
    enabled: !!linkedPlayerId,
    staleTime: 0,
  });

  interface ReferralData {
    referralCode: string;
    walletBalance: number;
    ambassadorStatus: boolean;
    jerseyDispatched: boolean;
    leaderboardMention: boolean;
    completedCount: number;
    referrals: Array<{
      id: string;
      refereeUserId: string;
      refereePlayerId: string | null;
      status: string;
      createdAt: string;
      refereeName: string | null;
    }>;
  }

  const { data: referralData } = useQuery<ReferralData>({
    queryKey: ['/api/referrals/player', linkedPlayerId],
    enabled: !!linkedPlayerId,
    staleTime: 60_000,
  });

  // ── Post-signup referral entry (PR4) — Dashboard nudge ──────────────────────
  interface ReferralStatus {
    hasIncomingReferral: boolean;
    referrerName: string | null;
    eligibleUntil: string;
    dismissedAt: string | null;
  }

  const queryClient = useQueryClient();
  const { data: referralStatus } = useQuery<ReferralStatus>({
    queryKey: ['/api/marketplace/me/referral-status'],
    staleTime: 60_000,
  });

  const [referralNudgeCode, setReferralNudgeCode] = useState('');
  const [referralNudgeHidden, setReferralNudgeHidden] = useState(false);

  const applyReferralMutation = useMutation({
    mutationFn: (code: string) => apiRequest('POST', '/api/referrals/link', { referralCode: code.trim() }),
    onSuccess: () => {
      toast({ title: 'Referral code added!', description: "You and your friend each get AED 15 after your first game." });
      setReferralNudgeCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/referral-status'] });
    },
    onError: (err: any) => {
      // Window closed between page load and submit — just retire the nudge.
      if (err?.code === 'WINDOW_CLOSED') {
        setReferralNudgeHidden(true);
        return;
      }
      toast({
        title: 'Could not add code',
        description: err?.error || 'Please check the code and try again.',
        variant: 'destructive',
      });
    },
  });

  const dismissNudgeMutation = useMutation({
    mutationFn: () => apiRequest('PATCH', '/api/marketplace/me/dismiss-referral-nudge'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/referral-status'] });
    },
  });

  const showReferralNudge =
    !!referralStatus &&
    !referralStatus.hasIncomingReferral &&
    new Date(referralStatus.eligibleUntil).getTime() > Date.now() &&
    !referralStatus.dismissedAt &&
    !referralNudgeHidden;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const taggedSet = new Set(taggedGameIds);
  const untaggedCount = (stats?.recentGames ?? [])
    .filter(g => g.date && new Date(g.date) >= sevenDaysAgo && !taggedSet.has(g.gameId))
    .length;

  const firstTopTag = myTopTag?.[0];

  const approvedSuggestionBanner = useMemo(() => {
    if (!linkedPlayerId) return null;
    const lastCheckKey = `siq_tag_check_${linkedPlayerId}`;
    const lastCheck = typeof window !== 'undefined' ? Number(localStorage.getItem(lastCheckKey) ?? '0') : 0;
    const newlyPromoted = mySuggestions
      .filter(s => s.status === 'approved' && s.promotedAt && new Date(s.promotedAt).getTime() > lastCheck)
      .sort((a, b) => new Date(b.promotedAt!).getTime() - new Date(a.promotedAt!).getTime());
    if (newlyPromoted.length === 0) return null;
    return { suggestion: newlyPromoted[0], lastCheckKey };
  }, [mySuggestions, linkedPlayerId]);

  const [approvedSuggestionDismissed, setApprovedSuggestionDismissed] = useState(false);

  const milestoneBanner = useMemo(() => {
    if (!firstTopTag || !linkedPlayerId) return null;
    const count = firstTopTag.count;
    const crossed = TAG_MILESTONES.filter(m => count >= m);
    if (crossed.length === 0) return null;
    const highest = crossed[crossed.length - 1];
    const storageKey = `siq_milestone_${linkedPlayerId}_${firstTopTag.tag.id}_${highest}`;
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'seen') return null;
    return { milestone: highest, tag: firstTopTag.tag, count, storageKey };
  }, [firstTopTag, linkedPlayerId]);

  useEffect(() => {
    if (milestoneBanner) {
      localStorage.setItem(milestoneBanner.storageKey, 'seen');
    }
  }, [milestoneBanner?.storageKey]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const upcomingBookings = (bookings || [])
    .filter(b => b.status === 'confirmed' && new Date(b.session.date) >= todayStart)
    .sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime());
  const nextBooking = upcomingBookings[0];

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayBooking = (bookings || [])
    .filter(b => {
      const sessionDate = new Date(b.session.date);
      const isToday = sessionDate >= todayStart && sessionDate <= todayEnd;
      const isEligible = b.status === 'confirmed' || b.attendedAt !== null;
      return isToday && isEligible;
    })
    .sort((a, b) => new Date(a.session.date).getTime() - new Date(b.session.date).getTime())[0];
  const todayCheckedIn = !!todayBooking?.attendedAt;

  const nextAvailableSession = availableSessions
    .filter(s => s.status === 'upcoming' && new Date(s.date) >= todayStart)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;

  // ── Real-data-derived display values (graceful omission when unavailable) ──
  // Skill-point change over the player's last (up to) 10 games, from recentGames'
  // skillScoreBefore/After. null when the data isn't present.
  const last10Delta = useMemo<number | null>(() => {
    const games = [...(stats?.recentGames ?? [])]
      .filter(g => g.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
    if (games.length === 0) return null;
    const newest = games[0];
    const oldest = games[games.length - 1];
    if (newest.skillScoreAfter == null || oldest.skillScoreBefore == null) return null;
    return newest.skillScoreAfter - oldest.skillScoreBefore;
  }, [stats?.recentGames]);

  // Compact skill-trend sparkline — same recentGames source My Scores uses, just
  // summarized. Ascending by date (left = older, right = newer), last 15 games.
  // Needs ≥2 valid points to draw a trend; fewer → empty state.
  const skillSpark = useMemo(() => {
    return [...(stats?.recentGames ?? [])]
      .filter(g => g.date && g.skillScoreAfter != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-15)
      .map((g, i) => ({ i, score: g.skillScoreAfter as number }));
  }, [stats?.recentGames]);

  const sparkDelta = skillSpark.length >= 2
    ? skillSpark[skillSpark.length - 1].score - skillSpark[0].score
    : null;

  const totalLosses = stats ? Math.max(0, stats.totalGames - stats.totalWins) : 0;
  const tierLabel = stats ? getTierDisplayName(stats.player.level) : null;

  // Greeting value line — assemble only the clauses backed by real data.
  const greetingClauses: string[] = [];
  if (stats?.currentStreak?.type === 'win' && stats.currentStreak.count > 0) {
    greetingClauses.push(`On a ${stats.currentStreak.count}-win streak`);
  }
  if (last10Delta != null && last10Delta !== 0) {
    greetingClauses.push(`${last10Delta > 0 ? '+' : ''}${last10Delta} skill pts over your last 10`);
  }
  if (nextBooking) {
    const rel = getRelativeTimeLabel(nextBooking.session.date as unknown as string, nextBooking.session.startTime);
    if (rel) greetingClauses.push(`Next match ${rel}`);
  }
  const greetingValueLine = greetingClauses.length > 0 ? greetingClauses.join('  ·  ') : "Here's your ShuttleIQ overview";

  const bannerEntrance = reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] as const } };

  return (
    <>
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      <div className="max-w-6xl mx-auto" style={{ padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px) clamp(48px, 6vw, 64px)' }}>
        {/* Greeting hero */}
        <Reveal>
          <div className="flex items-center gap-4 sm:gap-5" style={{ marginBottom: 28 }}>
            <Link href="/marketplace/profile" data-testid="link-profile-avatar" className="shrink-0 cursor-pointer md:pointer-events-none md:cursor-default">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16">
                {user?.photoUrl ? (
                  <AvatarImage src={user.photoUrl} alt={user.name} data-testid="img-dashboard-avatar" />
                ) : null}
                <AvatarFallback style={{ background: MKT.teal, color: '#fff', fontWeight: 700, fontSize: 22 }}>
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0">
              <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(30px, 5vw, 48px)', color: MKT.navy, letterSpacing: '-0.035em', lineHeight: 1.02 }} data-testid="text-dashboard-greeting">
                Welcome back, {user?.name?.split(' ')[0]}
              </h1>
              <p style={{ color: MKT.inkSub, fontSize: 'clamp(14px, 1.6vw, 16px)', marginTop: 6, letterSpacing: '-0.005em' }}>
                {greetingValueLine}
              </p>
            </div>
          </div>
        </Reveal>

        {/* Approved-suggestion banner */}
        {approvedSuggestionBanner && !approvedSuggestionDismissed && (
          <motion.div {...bannerEntrance} style={{ marginBottom: 20 }}>
            <div style={{ borderRadius: 14, border: `1px solid ${MKT.teal}33`, background: MKT.tealMist, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }} data-testid="card-suggestion-approved-banner">
              <div style={{ fontSize: 28, lineHeight: 1, marginTop: 2 }} className="shrink-0">{approvedSuggestionBanner.suggestion.emoji}</div>
              <div className="flex-1 min-w-0">
                <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 16, color: MKT.navy, letterSpacing: '-0.01em' }}>Your tag suggestion was approved!</p>
                <p style={{ fontSize: 14, color: MKT.inkSub, marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: MKT.ink }}>{approvedSuggestionBanner.suggestion.emoji} {approvedSuggestionBanner.suggestion.label}</span> is now live in the community tag catalog!
                </p>
                <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 12 }}>
                  <Link
                    to="/marketplace/rankings"
                    style={{ fontSize: 13, color: MKT.tealD, fontWeight: 600, textDecoration: 'none' }}
                    data-testid="link-view-active-tag"
                    onClick={() => {
                      localStorage.setItem(approvedSuggestionBanner.lastCheckKey, String(Date.now()));
                      setApprovedSuggestionDismissed(true);
                    }}
                  >
                    View in Rankings
                  </Link>
                  <button
                    style={{ fontSize: 13, color: MKT.inkSub, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      localStorage.setItem(approvedSuggestionBanner.lastCheckKey, String(Date.now()));
                      setApprovedSuggestionDismissed(true);
                    }}
                    data-testid="button-dismiss-suggestion-banner"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <Lightbulb className="h-5 w-5 shrink-0" style={{ color: MKT.teal, marginTop: 2 }} />
            </div>
          </motion.div>
        )}

        {/* Milestone banner */}
        {milestoneBanner && !milestoneDismissed && (
          <motion.div {...bannerEntrance} style={{ marginBottom: 20 }}>
            <div style={{ borderRadius: 14, border: `1px solid ${MKT.amber}33`, background: '#F6E6CC55', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }} data-testid="card-milestone-banner">
              <div style={{ fontSize: 28, lineHeight: 1, marginTop: 2 }} className="shrink-0">{milestoneBanner.tag.emoji}</div>
              <div className="flex-1 min-w-0">
                <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 16, color: MKT.navy, letterSpacing: '-0.01em' }}>You've been celebrated!</p>
                <p style={{ fontSize: 14, color: MKT.inkSub, marginTop: 2 }}>
                  You're officially a <span style={{ fontWeight: 600, color: MKT.ink }}>{milestoneBanner.tag.label}</span> — tagged {milestoneBanner.milestone}× by your community!
                </p>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
                  <Link href={`/marketplace/players/${linkedPlayerId}/personality-card`} style={{ ...navyBtn('sm'), background: MKT.teal, borderColor: MKT.teal, textDecoration: 'none' }} data-testid="button-share-milestone">
                    <ExternalLink className="h-3 w-3" /> Share your personality card
                  </Link>
                  <button
                    style={{ fontSize: 13, color: MKT.inkSub, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => setMilestoneDismissed(true)}
                    data-testid="button-dismiss-milestone"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Post-signup referral nudge (PR4) — only for users who weren't referred,
            still inside their 30-day window, and haven't dismissed it. */}
        {showReferralNudge && (
          <motion.div {...bannerEntrance} style={{ marginBottom: 20 }}>
            <div style={{ borderRadius: 14, border: `1px solid ${MKT.teal}33`, background: MKT.tealMist, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }} data-testid="card-referral-nudge">
              <div style={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,107,95,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <Gift className="h-4 w-4" style={{ color: MKT.tealD }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 16, color: MKT.navy, letterSpacing: '-0.01em' }}>Got a referral code?</p>
                <p style={{ fontSize: 14, color: MKT.inkSub, marginTop: 2 }}>
                  Add a friend's code and you'll <span style={{ fontWeight: 600, color: MKT.ink }}>both get AED 15</span> after your first game.
                </p>
                <form
                  className="flex items-center gap-2 flex-wrap"
                  style={{ marginTop: 12 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (referralNudgeCode.trim() && !applyReferralMutation.isPending) {
                      applyReferralMutation.mutate(referralNudgeCode);
                    }
                  }}
                >
                  <input
                    type="text"
                    value={referralNudgeCode}
                    onChange={(e) => setReferralNudgeCode(e.target.value)}
                    placeholder="Enter code"
                    aria-label="Referral code"
                    data-testid="input-referral-nudge-code"
                    style={{
                      fontFamily: FF_MONO, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${MKT.navy}33`,
                      background: '#fff', color: MKT.ink, minWidth: 0, flex: '1 1 160px', maxWidth: 220,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!referralNudgeCode.trim() || applyReferralMutation.isPending}
                    data-testid="button-apply-referral-nudge"
                    style={{ ...navyBtn('sm'), background: MKT.teal, borderColor: MKT.teal, opacity: (!referralNudgeCode.trim() || applyReferralMutation.isPending) ? 0.6 : 1 }}
                  >
                    {applyReferralMutation.isPending ? 'Adding…' : 'Apply'}
                  </button>
                </form>
              </div>
              <button
                type="button"
                onClick={() => dismissNudgeMutation.mutate()}
                aria-label="Dismiss referral nudge"
                data-testid="button-dismiss-referral-nudge"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, padding: 4, display: 'inline-flex', flex: 'none' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Getting Started + tag nudge — full width, contextual */}
        {user && (
          <Reveal style={{ marginBottom: 20 }}>
            <GettingStartedCard
              bookings={bookings}
              linkedPlayerId={linkedPlayerId ?? null}
              bookingsLoading={bookingsLoading}
              userId={user.id}
            />
          </Reveal>
        )}

        {linkedPlayerId && untaggedCount > 0 && (
          <Reveal style={{ marginBottom: 20 }}>
                <Link href="/marketplace/my-scores">
                  <div style={{ ...cardStyle, borderColor: `${MKT.teal}55`, background: MKT.tealMist, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} data-testid="card-tag-nudge">
                    <div style={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,107,95,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TagIcon className="h-4 w-4" style={{ color: MKT.tealD }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 14, fontWeight: 600, color: MKT.navy, lineHeight: 1.3 }}>
                        {untaggedCount === 1 ? '1 game waiting — tag your teammates!' : `${untaggedCount} games waiting — tag your teammates!`}
                      </p>
                      <p style={{ fontSize: 12, color: MKT.inkSub }}>Recognise great play from your recent games</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
                  </div>
                </Link>
          </Reveal>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Reveal className="lg:col-span-2">
              <UnifiedSessionCard
                todayBooking={todayBooking}
                todayCheckedIn={todayCheckedIn}
                nextBooking={nextBooking}
                nextAvailableSession={nextAvailableSession}
                bookingsLoading={bookingsLoading}
              />
            </Reveal>

            {stats ? (
              <Reveal className="lg:col-span-2">
                <DashCard testid="card-stats">
                  <DashHeader
                    icon={<BarChart3 className="h-4 w-4" />}
                    title="Your Stats"
                    action={<Link href="/marketplace/my-scores" style={seeAllLink} data-testid="link-view-all-stats">View All <ChevronRight className="h-3 w-3" /></Link>}
                  />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Skill score + tier chip + last-10 delta */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: MKT.cream }}>
                      <div className="flex items-start justify-between gap-2">
                        <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Skill score</div>
                        {tierLabel && (
                          <span style={{ fontFamily: FF_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, background: MKT.tealMist, color: MKT.tealD, whiteSpace: 'nowrap' }}>{tierLabel}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1 }} data-testid="text-stat-score">{stats.player.skillScore}</div>
                      {last10Delta != null && (
                        <div style={{ marginTop: 6, fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: last10Delta >= 0 ? MKT.green : MKT.red }}>
                          {last10Delta > 0 ? '+' : ''}{last10Delta} pts · last 10
                        </div>
                      )}
                    </div>
                    {/* Win rate + W/L */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: MKT.cream }}>
                      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Win rate</div>
                      <div style={{ marginTop: 8, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 40px)', color: MKT.green, letterSpacing: '-0.03em', lineHeight: 1 }}>{stats.winRate}%</div>
                      <div style={{ marginTop: 6, fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.inkSub }}>{stats.totalWins}W · {totalLosses}L</div>
                    </div>
                    {/* Games played + streak */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: MKT.cream }}>
                      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Games played</div>
                      <div style={{ marginTop: 8, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1 }}>{stats.totalGames}</div>
                      {stats.currentStreak?.type === 'win' && stats.currentStreak.count > 0 && (
                        <div style={{ marginTop: 6, fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, color: MKT.tealD }}>{stats.currentStreak.count}-win streak</div>
                      )}
                    </div>
                    {/* Skill rank + total + View Leaderboard */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: MKT.cream, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Skill rank</div>
                      <div style={{ marginTop: 8, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 40px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1 }}>#{stats.rankBySkillScore}</div>
                      <div style={{ marginTop: 6, fontSize: 11, color: MKT.inkSub }}>of {stats.totalPlayersRanked} players</div>
                      <Link href="/marketplace/rankings" style={{ marginTop: 10, fontFamily: FF_BODY, fontWeight: 600, fontSize: 12, color: MKT.tealD, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }} data-testid="link-stats-leaderboard">
                        View Leaderboard <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </DashCard>
              </Reveal>
            ) : (
              <Reveal className="lg:col-span-2">
                <DashCard>
                  <div className="text-center" style={{ padding: '8px 0' }}>
                    <Target className="h-8 w-8 mx-auto mb-2" style={{ color: MKT.inkSub }} />
                    <p style={{ fontWeight: 600, color: MKT.ink, marginBottom: 4 }}>Link your player profile</p>
                    <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 12 }}>Connect your account to see your stats, rankings, and match history.</p>
                    <Link href="/marketplace/profile" style={{ ...ghostBtn('sm'), textDecoration: 'none' }} data-testid="button-link-profile">Go to Profile</Link>
                  </div>
                </DashCard>
              </Reveal>
            )}

            {stats && linkedPlayerId && (
              <Reveal className="lg:col-span-2">
                <DashCard testid="card-skill-trend">
                  <DashHeader
                    icon={<TrendingUp className="h-4 w-4" />}
                    title="Skill Trend"
                    action={<Link href="/marketplace/my-scores" style={seeAllLink} data-testid="link-skill-trend-full-stats">View full stats <ChevronRight className="h-3 w-3" /></Link>}
                  />
                  {skillSpark.length < 2 ? (
                    <div
                      data-testid="empty-skill-trend"
                      className="text-center"
                      style={{ padding: '18px 8px', borderRadius: 12, background: MKT.cream }}
                    >
                      <TrendingUp className="h-7 w-7 mx-auto mb-2" style={{ color: MKT.inkSub }} />
                      <p style={{ fontWeight: 600, color: MKT.ink, marginBottom: 2 }}>
                        Current skill score: <span data-testid="text-skill-trend-score">{stats.player.skillScore}</span>
                      </p>
                      <p style={{ fontSize: 13, color: MKT.inkSub }}>Play a few games to see your skill trend.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end justify-between gap-3" style={{ marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Skill score</div>
                          <div style={{ marginTop: 6, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(28px, 3vw, 36px)', color: MKT.navy, letterSpacing: '-0.03em', lineHeight: 1 }} data-testid="text-skill-trend-score">{stats.player.skillScore}</div>
                        </div>
                        {sparkDelta != null && (
                          <span
                            data-testid="text-skill-trend-delta"
                            style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sparkDelta >= 0 ? '#DDEEE2' : '#F1D7D2', color: sparkDelta >= 0 ? '#1A6A45' : '#8E2C22', whiteSpace: 'nowrap' }}
                          >
                            {sparkDelta > 0 ? '+' : ''}{sparkDelta} pts
                          </span>
                        )}
                      </div>
                      <div style={{ height: 64 }} data-testid="chart-skill-trend">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={skillSpark} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                            <defs>
                              <linearGradient id="dashSkillSpark" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={MKT.teal} stopOpacity={0.28} />
                                <stop offset="95%" stopColor={MKT.teal} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                            <Area type="monotone" dataKey="score" stroke={MKT.teal} strokeWidth={2} fill="url(#dashSkillSpark)" dot={false} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <p style={{ fontSize: 12, color: MKT.inkSub, marginTop: 6 }}>Last {skillSpark.length} games</p>
                    </>
                  )}
                </DashCard>
              </Reveal>
            )}

            {referralData && linkedPlayerId && (
              <Reveal>
                <DashCard testid="card-my-referrals">
                  <DashHeader icon={<Gift className="h-4 w-4" />} title="My Referrals" />
                  <div className="space-y-4">
                    {/* Wallet balance + friends played */}
                    <div className="flex items-end gap-4" style={{ padding: 14, borderRadius: 12, background: MKT.cream }}>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Wallet balance</p>
                        <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 30, color: MKT.navy, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 4 }} data-testid="text-wallet-balance">
                          AED {(referralData.walletBalance / 100).toFixed(2)}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Friends played</p>
                        <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 30, color: MKT.teal, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 4 }}>{referralData.completedCount}</p>
                      </div>
                    </div>

                    {/* Code + copy */}
                    <div className="flex items-center justify-between gap-2" style={{ padding: '12px 14px', borderRadius: 10, background: MKT.cream, border: `1px dashed ${MKT.navy}33` }}>
                      <div className="min-w-0">
                        <p style={{ fontFamily: FF_MONO, fontSize: 9, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Your code</p>
                        <p style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 16, color: MKT.navy, letterSpacing: '0.02em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="text-referral-code">{referralData.referralCode}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(referralData.referralCode);
                          toast({ title: 'Copied!', description: 'Referral code copied to clipboard' });
                        }}
                        data-testid="button-copy-referral"
                        aria-label="Copy referral code"
                        style={{ flex: 'none', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${MKT.navy}33`, background: '#fff', color: MKT.navy, cursor: 'pointer', fontFamily: FF_BODY, fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                    </div>

                    {/* Share Your Code — real signup ?ref= link */}
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/marketplace/signup?ref=${encodeURIComponent(referralData.referralCode)}`;
                        const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
                        if (typeof nav.share === 'function') {
                          nav.share({ title: 'Join me on ShuttleIQ', text: 'Book badminton sessions in Dubai with me on ShuttleIQ.', url }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(url);
                          toast({ title: 'Link copied!', description: 'Your referral link is on the clipboard' });
                        }
                      }}
                      data-testid="button-share-referral"
                      style={{ ...navyBtn('md'), width: '100%' }}
                    >
                      Share Your Code <ArrowRight className="h-4 w-4" />
                    </button>

                    {/* Next-reward progress (until Ambassador) */}
                    {!referralData.ambassadorStatus && (
                      <div>
                        <div className="flex items-center justify-between" style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                          <span style={{ color: MKT.inkSub }}>
                            {referralData.completedCount < 5
                              ? `Next reward · ${5 - referralData.completedCount} more`
                              : `Next reward · ${10 - referralData.completedCount} more`}
                          </span>
                          <span style={{ color: MKT.tealD }}>
                            {referralData.completedCount}/{referralData.completedCount < 5 ? 5 : 10}
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%', borderRadius: 999, background: MKT.teal, transition: 'width 0.5s cubic-bezier(.2,.7,.2,1)',
                              width: `${Math.min(100, (referralData.completedCount / (referralData.completedCount < 5 ? 5 : 10)) * 100)}%`,
                            }}
                            data-testid="progress-referral-milestone"
                          />
                        </div>
                      </div>
                    )}

                    {/* Reward ladder — both rungs */}
                    <div className="space-y-2">
                      {[
                        { at: 5, label: 'Featured on the leaderboard' },
                        { at: 10, label: 'Ambassador status + ShuttleIQ jersey' },
                      ].map((m) => {
                        const reached = referralData.completedCount >= m.at;
                        return (
                          <div key={m.at} className="flex items-center gap-2" style={{ fontSize: 13, color: reached ? MKT.ink : MKT.inkSub }}>
                            {reached ? (
                              <Check className="h-4 w-4 shrink-0" style={{ color: MKT.green }} />
                            ) : (
                              <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${MKT.line}`, background: '#fff', flex: 'none' }} />
                            )}
                            <span><b style={{ color: MKT.navy, fontWeight: 600 }}>{m.at}</b> referrals — {m.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {(referralData.leaderboardMention || referralData.ambassadorStatus || referralData.jerseyDispatched) && (
                      <div className="flex flex-wrap gap-1.5">
                        {referralData.leaderboardMention && (
                          <span style={{ background: MKT.teal, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-leaderboard-mention">
                            Leaderboard Member
                          </span>
                        )}
                        {referralData.ambassadorStatus && (
                          <span style={{ background: MKT.navy, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-ambassador">
                            Ambassador
                          </span>
                        )}
                        {referralData.jerseyDispatched && (
                          <span style={{ background: MKT.tealMist, color: MKT.tealD, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-jersey">
                            Jersey Dispatched
                          </span>
                        )}
                      </div>
                    )}

                    {referralData.referrals.length > 0 && (
                      <div className="space-y-2">
                        <p style={{ fontSize: 11, color: MKT.inkSub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Referred Players</p>
                        {referralData.referrals.map((ref) => (
                          <div key={ref.id} className="flex items-center justify-between gap-2" style={{ padding: '6px 0', borderBottom: `1px solid ${MKT.line}` }} data-testid={`row-referral-${ref.id}`}>
                            <span style={{ fontSize: 14, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.refereeName || 'Pending link'}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {ref.status === 'completed' && (
                                <span style={{ fontSize: 12, color: MKT.inkSub }}>AED 15</span>
                              )}
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: ref.status === 'completed' ? MKT.navy : 'rgba(0,30,70,0.08)', color: ref.status === 'completed' ? '#fff' : MKT.inkSub }}>
                                {ref.status === 'completed' ? 'Completed' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DashCard>
              </Reveal>
            )}

            {upcomingBookings.length > 1 && (
              <Reveal>
                <DashCard testid="card-upcoming-bookings">
                  <DashHeader
                    icon={<Bookmark className="h-4 w-4" />}
                    title="Upcoming Bookings"
                    action={<Link href="/marketplace/my-bookings" style={seeAllLink} data-testid="link-view-all-bookings">View All <ChevronRight className="h-3 w-3" /></Link>}
                  />
                  <div className="space-y-3">
                    {upcomingBookings.slice(1, 4).map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${MKT.line}` }} data-testid={`row-booking-${b.id}`}>
                        <div className="min-w-0">
                          <p style={{ fontSize: 14, fontWeight: 500, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.session.title}</p>
                          <p style={{ fontSize: 12, color: MKT.inkSub }}>
                            {format(new Date(b.session.date), 'EEE, MMM d')} at {b.session.startTime}
                          </p>
                        </div>
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: MKT.tealMist, color: MKT.tealD }}>
                          {b.status === 'confirmed' ? 'Confirmed' : b.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </DashCard>
              </Reveal>
            )}

            {linkedPlayerId && receivedTags.length > 0 && (
              <Reveal>
                <DashCard testid="card-received-tags">
                  <DashHeader icon={<Star className="h-4 w-4" />} title="You've Been Tagged" />
                  <div className="space-y-2.5">
                    {receivedTags.map((entry, i) => {
                      const cls = CATEGORY_BG[entry.tag.category] ?? CATEGORY_BG._default;
                      return (
                        <Reveal key={i} delay={reduce ? 0 : i * 0.05}>
                          <div className="flex items-center gap-3" data-testid={`row-received-tag-${i}`}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: MKT.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: MKT.inkSub, flex: 'none' }}>
                              {entry.taggerInitial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
                                  {entry.tag.emoji} {entry.tag.label}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, color: MKT.inkSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>at {entry.sessionName}</p>
                            </div>
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>
                </DashCard>
              </Reveal>
            )}

            <Reveal>
              <DashCard testid="card-player-personalities">
                <DashHeader
                  icon={<Users className="h-4 w-4" />}
                  title="Player Personalities"
                  action={<button type="button" onClick={() => setShowTrendingModal(true)} style={{ ...seeAllLink, background: 'transparent', border: 'none' }} data-testid="button-explore-personalities">Explore <ChevronRight className="h-3 w-3" /></button>}
                />
                <div className="space-y-4">
                  {firstTopTag && (
                    <div style={{ borderRadius: 12, border: `1px solid ${MKT.navy}10`, padding: 12, background: MKT.cream }}>
                      <p style={{ fontFamily: FF_MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: MKT.inkSub, marginBottom: 6, fontWeight: 600 }}>Your Top Tag</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-medium border ${CATEGORY_COLOR[firstTopTag.tag.category]}`}>
                          {firstTopTag.tag.emoji} {firstTopTag.tag.label}
                        </span>
                        <span style={{ fontSize: 12, color: MKT.inkSub }}>
                          Community Tag &middot; {firstTopTag.count}×
                        </span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p style={{ fontFamily: FF_MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: MKT.inkSub, marginBottom: 10, fontWeight: 600 }}>Trending This Week</p>
                    {trendingLoading ? (
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
                      </div>
                    ) : trending.length === 0 ? (
                      <p style={{ fontSize: 14, color: MKT.inkSub }}>No tags yet. Tag players after your games!</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {trending.slice(0, 5).map(({ tag, count }) => (
                          <button
                            key={tag.id}
                            onClick={() => setShowTrendingModal(true)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer ${CATEGORY_COLOR[tag.category]}`}
                            data-testid={`btn-personality-tag-${tag.id}`}
                          >
                            {tag.emoji} {tag.label}
                            <span className="opacity-60 ml-0.5">{count}×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!linkedPlayerId && (
                    <div className="text-center" style={{ paddingTop: 4 }}>
                      <Link href="/marketplace/profile" style={{ ...ghostBtn('sm'), textDecoration: 'none', fontSize: 12, padding: '6px 12px' }} data-testid="button-link-for-tags">
                        Link profile to earn tags <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </DashCard>
            </Reveal>

            <Reveal>
              <DashCard testid="card-leaderboard">
                <DashHeader icon={<Trophy className="h-4 w-4" />} title="Leaderboard" />
                <div className="text-center">
                  {stats ? (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 32, color: MKT.navy, letterSpacing: '-0.025em' }} data-testid="text-leaderboard-rank">#{stats.rankBySkillScore}</div>
                      <div style={{ fontSize: 12, color: MKT.inkSub }}>Your current rank</div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 16 }}>See how you stack up against all ShuttleIQ players.</p>
                  )}
                  <Link href="/marketplace/rankings" style={{ ...navyBtn('sm'), width: '100%', textDecoration: 'none' }} data-testid="button-view-rankings">
                    View Rankings <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </DashCard>
            </Reveal>

            <Reveal>
              <DashCard>
                <div className="text-center" style={{ padding: '8px 0' }}>
                  <TrendingUp className="h-8 w-8 mx-auto mb-2" style={{ color: MKT.teal }} />
                  <p style={{ fontWeight: 600, color: MKT.ink, marginBottom: 4 }}>Find your next game</p>
                  <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 16 }}>Book sessions across Dubai venues</p>
                  <Link href="/marketplace/book" style={{ ...navyBtn('sm'), width: '100%', textDecoration: 'none' }} data-testid="button-find-session">
                    Browse Sessions <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </DashCard>
            </Reveal>

            {canInstall && (
              <Reveal>
                <DashCard testid="card-install-app">
                  <div className="text-center" style={{ padding: '8px 0' }}>
                    <Download className="h-8 w-8 mx-auto mb-2" style={{ color: MKT.teal }} />
                    <p style={{ fontWeight: 600, color: MKT.ink, marginBottom: 4 }}>Get the App</p>
                    <p style={{ fontSize: 14, color: MKT.inkSub, marginBottom: 16 }}>Install ShuttleIQ on your home screen for quick access</p>
                    <button type="button" onClick={install} style={{ ...navyBtn('sm'), width: '100%' }} data-testid="button-install-app-dashboard">
                      Install Now <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </DashCard>
              </Reveal>
            )}
        </div>
      </div>
    </div>

    <TagTrendingModal
      open={showTrendingModal}
      onOpenChange={setShowTrendingModal}
      linkedPlayerId={linkedPlayerId}
    />
    </>
  );
}
