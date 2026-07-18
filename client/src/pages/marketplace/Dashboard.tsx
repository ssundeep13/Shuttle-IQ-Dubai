import { useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, MapPin, Clock, BarChart3, ArrowRight, ChevronRight, Target, Download, Users, Tag as TagIcon, Check, Sparkles, X, Timer, Lightbulb, Gift } from 'lucide-react';
import { getRelativeTimeLabel } from '@/lib/timeUtils';
import { isSessionOver } from '@/lib/sessionTime';
import { format } from 'date-fns';
import { useReducedMotion } from 'framer-motion';
import type { BookingWithDetails, PlayerStats, TagSuggestion, BookableSessionWithAvailability } from '@shared/schema';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';
import CommunityFeed from './CommunityFeed';

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
// Gate F3.6: state-driven. Priority when today's session has ENDED (Dubai
// clock, display-only until F5's real close state): the player's own next
// booking > the next bookable open session > a muted "Session complete"
// card. A finished session must never show "Go to play screen".
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
  const sessionOver = !!todayBooking && isSessionOver(
    todayBooking.session.date as unknown as string,
    todayBooking.session.startTime,
    todayBooking.session.endTime ?? todayBooking.session.startTime,
  );

  if (todayBooking && sessionOver && !nextBooking && !nextAvailableSession) {
    // Session complete — nothing bookable to point at yet.
    return (
      <DashCard testid="card-session-complete">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Session complete</p>
            <p style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy, letterSpacing: '-0.01em', marginTop: 4 }}>{todayBooking.session.venueName}</p>
            <p style={{ fontSize: 13, color: MKT.inkSub, marginTop: 2 }}>
              {todayBooking.session.startTime}{todayBooking.session.endTime ? ` – ${todayBooking.session.endTime}` : ''}
            </p>
          </div>
          <Link href="/marketplace/feed" style={{ ...ghostBtn('sm'), textDecoration: 'none' }} data-testid="button-session-highlights">
            See tonight's highlights <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </DashCard>
    );
  }

  // TODAY MODE — navy hero with level accent band + manual-check-in-aware
  // footer. Only while the session hasn't ended.
  if (todayBooking && !sessionOver) {
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
        // Find your next game (F3.6) — the no-booking dead-end replaced with
        // the soonest bookable open session. Also serves the ended-session
        // state when something is bookable.
        <div data-testid="empty-next-session">
          <p style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: MKT.navy, letterSpacing: '-0.01em', margin: 0 }}>Find your next game</p>
          {nextAvailableSession ? (
            <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 12, padding: 14, borderRadius: 12, background: MKT.cream }} data-testid="next-open-session">
              <div className="min-w-0">
                <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: MKT.ink }}>{nextAvailableSession.venueName}</p>
                <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 13, color: MKT.inkSub, marginTop: 3 }}>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(nextAvailableSession.date), 'EEE, MMM d')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {nextAvailableSession.startTime}
                  </span>
                  <span className="flex items-center gap-1" data-testid="text-spots-left">
                    <Users className="h-3.5 w-3.5" />
                    {nextAvailableSession.spotsRemaining} spots left
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: MKT.inkSub, marginTop: 6 }}>New sessions open every week across Dubai venues.</p>
          )}
          <Link href="/marketplace/book" style={{ ...navyBtn('sm'), textDecoration: 'none', marginTop: 12 }} data-testid="button-book-session-cta">
            Browse sessions <ArrowRight className="h-3.5 w-3.5" />
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

  const { data: taggedGameIds = [] } = useQuery<string[]>({
    queryKey: ['/api/tags/tagged-games'],
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


  // ── Community section pinned cards (Gate F3) — the three ported ad-hoc
  // banners restyled to feed-card chrome, keeping their original queries,
  // mutations, gating and testids intact.
  const feedCardChrome: CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid rgba(0,20,60,0.08)', padding: '14px 16px' };
  const feedAvatar = (icon: ReactNode): ReactNode => (
    <div style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: MKT.tealMist, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
  );

  const communityPinned = (
    <>
      {approvedSuggestionBanner && !approvedSuggestionDismissed && (
        <div style={{ ...feedCardChrome, display: 'flex', alignItems: 'flex-start', gap: 12 }} data-testid="card-suggestion-approved-banner">
          {feedAvatar(<Lightbulb className="h-5 w-5" style={{ color: MKT.tealD }} />)}
          <div className="flex-1 min-w-0">
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: MKT.ink, lineHeight: 1.35 }}>Your tag suggestion was approved!</p>
            <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: MKT.inkSub }}>
              <span style={{ fontWeight: 600, color: MKT.ink }}>{approvedSuggestionBanner.suggestion.label}</span> is now live in the community tag catalog
            </p>
            <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 10 }}>
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
        </div>
      )}

      {showReferralNudge && (
        <div style={{ ...feedCardChrome, display: 'flex', alignItems: 'flex-start', gap: 12 }} data-testid="card-referral-nudge">
          {feedAvatar(<Gift className="h-5 w-5" style={{ color: MKT.tealD }} />)}
          <div className="flex-1 min-w-0">
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: MKT.ink, lineHeight: 1.35 }}>Got a referral code?</p>
            <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: MKT.inkSub }}>
              Add a friend's code and you'll <span style={{ fontWeight: 600, color: MKT.ink }}>both get AED 15</span> after your first game.
            </p>
            <form
              className="flex items-center gap-2 flex-wrap"
              style={{ marginTop: 10 }}
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
      )}

      {linkedPlayerId && untaggedCount > 0 && (
        <Link href="/marketplace/my-scores">
          <div style={{ ...feedCardChrome, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} data-testid="card-tag-nudge">
            {feedAvatar(<TagIcon className="h-5 w-5" style={{ color: MKT.tealD }} />)}
            <div className="flex-1 min-w-0">
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: MKT.ink, lineHeight: 1.35 }}>
                {untaggedCount === 1 ? '1 game waiting for your tags' : `${untaggedCount} games waiting for your tags`}
              </p>
              <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: MKT.inkSub }}>Recognise great play from your recent games</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
          </div>
        </Link>
      )}
    </>
  );

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

        {/* Getting Started — full width, contextual */}
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

            {/* Community feed (Gate F3) — real events from feed_events, with the
                three ported prompt cards pinned on top. */}
            <Reveal className="lg:col-span-2">
              <CommunityFeed variant="dashboard" pinned={communityPinned} />
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

            {referralData && linkedPlayerId && (
              <Reveal className="lg:col-span-2">
                <Link href="/marketplace/referrals" data-testid="card-referral-teaser" style={{ textDecoration: 'none' }}>
                  <DashCard style={{ cursor: 'pointer' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: MKT.tealMist, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Gift className="h-5 w-5" style={{ color: MKT.tealD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: MKT.ink }}>Earn AED 15 per friend</p>
                        <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: MKT.inkSub }}>
                          Share your code{referralData.walletBalance > 0 ? ` · AED ${(referralData.walletBalance / 100).toFixed(2)} in your wallet` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: MKT.inkSub }} />
                    </div>
                  </DashCard>
                </Link>
              </Reveal>
            )}

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

    </>
  );
}
