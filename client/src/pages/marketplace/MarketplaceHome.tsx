import { Link } from 'wouter';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { CommunitySpotlightEntry, BookableSessionWithAvailability } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import {
  MKT, FF_DISPLAY, FF_BODY, FF_MONO,
  MarketingStyles, Reveal, useCountUp, Eyebrow, MIcon, MarkWord,
  PlayerAvatar, StepIllustration, avatarVariantFor, accentForCategory,
} from './LandingComponents';

const WHATSAPP_URL = 'https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE';

// ── Marketing copy / data ──────────────────────────────────────────────────
const STATS = [
  { value: 500, suffix: '+', label: 'Games Played', sub: 'this season' },
  { value: 200, suffix: '+', label: 'Active Players', sub: 'across Dubai' },
  { value: 10, suffix: '+', label: 'Partner Venues', sub: 'and growing' },
  { value: 4.9, suffix: '', label: 'Player Rating', sub: 'avg this month', decimal: true },
];

const STEPS = [
  { n: 1, title: 'Find a Session', body: 'Pick a date, venue, and skill level that fits you. New sessions every day across Dubai.' },
  { n: 2, title: 'Book Your Spot', body: 'Reserve in two taps. Pay with card or wallet credit — cancel free up to 6h before.' },
  { n: 3, title: 'Play & Compete', body: 'Show up, get matched fairly, climb the leaderboard. Earn community tags along the way.' },
];

const FEATURES: { name: string; blurb: string; icon: 'bolt' | 'trophy' | 'heart' | 'shuffle' | 'pin' | 'user' }[] = [
  { name: 'Easy Booking', blurb: 'Two-tap reservations, instant confirmation, calendar sync.', icon: 'bolt' },
  { name: 'Live Rankings', blurb: 'Real-time leaderboards across Dubai. See where you stand tonight.', icon: 'trophy' },
  { name: 'Community', blurb: 'WhatsApp groups, courtside chat, and tags from real players.', icon: 'heart' },
  { name: 'Smart Matchmaking', blurb: 'Pair-ups balanced by tier, history, and how long you’ve waited.', icon: 'shuffle' },
  { name: 'Multiple Venues', blurb: 'Ten partner clubs and counting — from JLT to Mirdif.', icon: 'pin' },
  { name: 'Player Profiles', blurb: 'Stats, wins, rallies, tags. Your badminton story, kept honest.', icon: 'user' },
];

// ── Button helper (styled, brand-faithful) ─────────────────────────────────
type BtnKind = 'navy' | 'ghost' | 'cream' | 'tealLink';
function btnStyle(kind: BtnKind, size: 'md' | 'lg' | 'xl' = 'lg'): CSSProperties {
  const sizes: Record<string, CSSProperties> = {
    md: { padding: '12px 18px', fontSize: 14 },
    lg: { padding: '15px 24px', fontSize: 15 },
    xl: { padding: '17px 26px', fontSize: 16 },
  };
  const kinds: Record<BtnKind, CSSProperties> = {
    navy: { background: MKT.navy, color: '#fff', borderColor: MKT.navy },
    ghost: { background: 'transparent', color: MKT.navy, borderColor: `${MKT.navy}33`, fontWeight: 500 },
    cream: { background: MKT.cream, color: MKT.navy, borderColor: MKT.cream },
    tealLink: { background: 'transparent', color: MKT.navy, borderColor: 'transparent', padding: 0 },
  };
  return {
    fontFamily: FF_BODY, fontWeight: 600, letterSpacing: '-0.005em',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    whiteSpace: 'nowrap', userSelect: 'none', lineHeight: 1, cursor: 'pointer',
    border: '1.5px solid transparent', borderRadius: 999, textDecoration: 'none',
    transition: 'transform .2s ease, box-shadow .25s ease, background .2s ease',
    ...sizes[size], ...kinds[kind],
  };
}

export default function MarketplaceHome() {
  usePageTitle('ShuttleIQ — Book Badminton Sessions in UAE', true);
  const { isAuthenticated } = useMarketplaceAuth();
  const reduce = useReducedMotion();

  const { data: spotlight = [], isLoading: spotlightLoading } = useQuery<CommunitySpotlightEntry[]>({
    queryKey: ['/api/tags/community-spotlight'],
    staleTime: 5 * 60 * 1000,
  });

  const heroEntrance = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const, delay } };

  return (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, overflowX: 'hidden' }}>
      <MarketingStyles />

      {/* ───────────────────────── HERO ───────────────────────── */}
      <section style={{ position: 'relative', padding: 'clamp(40px, 6vw, 70px) clamp(20px, 5vw, 64px) clamp(44px, 6vw, 60px)' }}>
        <div
          className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] items-center"
          style={{ gap: 'clamp(36px, 5vw, 80px)', position: 'relative', zIndex: 2 }}
        >
          {/* LEFT — message column */}
          <motion.div {...heroEntrance(0.05)} className="hero-left">
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                fontFamily: FF_MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: MKT.tealD, marginBottom: 'clamp(18px, 2vw, 28px)',
              }}
            >
              <span style={{ width: 24, height: 1.5, background: MKT.tealD, opacity: 0.5 }} />
              Badminton, in Dubai
            </div>

            <h1
              data-testid="text-hero-title"
              style={{
                margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700,
                fontSize: 'clamp(48px, 9vw, 120px)', lineHeight: 0.92, letterSpacing: '-0.045em',
                color: MKT.navy, textWrap: 'balance' as CSSProperties['textWrap'],
              }}
            >
              Smarter games.<br />
              Real{' '}
              <span style={{ fontStyle: 'italic', color: MKT.teal, position: 'relative', display: 'inline-block' }}>
                rivalries
                <svg width="320" height="20" viewBox="0 0 320 20" style={{ position: 'absolute', left: 4, bottom: -8, width: '102%' }}>
                  <path d="M 4 14 Q 80 -2 170 8 T 316 6" fill="none" stroke={MKT.amber} strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
              .
            </h1>

            <p
              data-testid="text-hero-subtitle"
              style={{
                margin: 'clamp(28px, 3vw, 36px) 0 0', maxWidth: 540,
                fontSize: 'clamp(16px, 1.6vw, 19px)', lineHeight: 1.5, color: MKT.inkSub,
                letterSpacing: '-0.005em', textWrap: 'pretty' as CSSProperties['textWrap'],
              }}
            >
              Ranked, scored, balanced matches — and a community that remembers who you are.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'clamp(28px, 3vw, 44px)', flexWrap: 'wrap' }}>
              <Link href="/marketplace/book" data-testid="button-browse-sessions" className="siq-hover-lift" style={btnStyle('navy', 'xl')}>
                Browse Sessions
                <MIcon name="arrow" size={16} color="#fff" sw={2} />
              </Link>
              {!isAuthenticated && (
                <Link href="/marketplace/signup" data-testid="button-join-now" className="siq-hover-lift" style={btnStyle('ghost', 'xl')}>
                  Join the community
                </Link>
              )}
            </div>
          </motion.div>

          {/* RIGHT — real "games scheduled" panel; no decorative graphics */}
          <motion.div {...heroEntrance(0.18)} className="hero-right">
            <HeroLivePanel />
          </motion.div>
        </div>
      </section>

      {/* ───────────────────── COMMUNITY PERSONALITIES (navy) ───────────────────── */}
      <section style={{ position: 'relative', background: MKT.navy, color: MKT.cream, padding: 'clamp(48px, 6vw, 80px) clamp(20px, 5vw, 64px)', overflow: 'hidden' }}>
        <Reveal>
          <Eyebrow num="02" color={MKT.amberL}>Community Personalities</Eyebrow>
          <h2
            data-testid="text-community-personalities-title"
            style={{
              margin: '14px 0 0', fontFamily: FF_DISPLAY, fontWeight: 700,
              fontSize: 'clamp(34px, 5vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.035em', color: MKT.cream,
              textWrap: 'pretty' as CSSProperties['textWrap'],
            }}
          >
            Every court has <span style={{ color: MKT.amberL, fontStyle: 'italic' }}>that</span> player.
          </h2>
          <p style={{ margin: '14px 0 28px', fontSize: 15, lineHeight: 1.55, color: MKT.cream, opacity: 0.78, maxWidth: 560 }}>
            After every session, players tag who made the night memorable. The tags stick. The legends grow.
          </p>
        </Reveal>

        {spotlightLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 14 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-[22px]" style={{ background: 'rgba(245,239,224,0.08)' }} />)}
          </div>
        ) : spotlight.length === 0 ? (
          <Reveal>
            <div style={{ padding: '28px 0', color: MKT.cream }}>
              <p style={{ opacity: 0.8, fontSize: 14, margin: 0 }}>No community tags yet this week — be the first to recognise a great player!</p>
              {!isAuthenticated && (
                <Link href="/marketplace/signup" className="siq-hover-lift" style={{ ...btnStyle('cream', 'md'), marginTop: 18 }}>
                  Join to tag players <MIcon name="arrowSm" size={14} color={MKT.navy} sw={2.2} />
                </Link>
              )}
            </div>
          </Reveal>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 14 }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
          >
            {spotlight.map((entry, idx) => (
              <PersonalityCard key={entry.tag.id} entry={entry} idx={idx} reduce={!!reduce} />
            ))}
          </motion.div>
        )}

        {!isAuthenticated && spotlight.length > 0 && (
          <Reveal>
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Link href="/marketplace/signup" data-testid="button-join-to-tag" className="siq-link" style={{ fontSize: 14, fontWeight: 600, color: MKT.amberL, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Join to recognise your fellow players <MIcon name="arrowSm" size={14} color={MKT.amberL} sw={2.2} />
              </Link>
            </div>
          </Reveal>
        )}
      </section>

      {/* ───────────────────── QUIET BRAND STRIP ───────────────────── */}
      <section style={{ padding: 'clamp(28px, 4vw, 48px) clamp(20px, 5vw, 64px) 0' }}>
        <Reveal>
          <div
            style={{
              borderRadius: 18, background: MKT.paper, border: `1px solid ${MKT.navy}18`,
              padding: 'clamp(16px, 2vw, 22px) clamp(20px, 3vw, 28px)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 10, background: `${MKT.amber}22`, color: MKT.amber, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name="heart" size={18} color={MKT.amber} sw={2.2} />
            </span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MKT.amber, marginBottom: 3 }}>
                Why players stay
              </div>
              <div style={{ fontSize: 15, color: MKT.ink, letterSpacing: '-0.005em' }}>
                Ranked matches, honest rankings, and a community that remembers your name.
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── STATS ───────────────────── */}
      <section style={{ padding: 'clamp(32px, 4vw, 40px) clamp(20px, 5vw, 64px)' }}>
        <Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ borderTop: `1px solid ${MKT.line}`, borderBottom: `1px solid ${MKT.line}` }}>
            {STATS.map((s, i) => <StatCell key={s.label} stat={s} idx={i} />)}
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── HOW IT WORKS ───────────────────── */}
      <section style={{ padding: 'clamp(48px, 7vw, 100px) clamp(20px, 5vw, 64px) clamp(40px, 6vw, 80px)' }}>
        <Reveal>
          <Eyebrow num="01">How it works</Eyebrow>
          <h2
            data-testid="text-how-it-works-title"
            style={{ margin: '16px 0 clamp(32px, 4vw, 56px)', fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 60px)', lineHeight: 0.95, letterSpacing: '-0.035em', color: MKT.navy, maxWidth: 720 }}
          >
            Three taps from couch to court.
          </h2>
        </Reveal>

        <div className="how-grid grid grid-cols-1 lg:grid-cols-3" style={{ gap: 20, position: 'relative' }}>
          <svg aria-hidden className="hidden lg:block" style={{ position: 'absolute', top: 80, left: '16%', right: '16%', height: 2, width: '68%' }}>
            <line x1="0" y1="1" x2="100%" y2="1" stroke={MKT.navy} strokeOpacity="0.18" strokeWidth="2" strokeDasharray="4 8" />
          </svg>
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.08}>
              <StepCard step={step} idx={i} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────────────────── WHY SHUTTLEIQ ───────────────────── */}
      <section style={{ padding: '0 clamp(20px, 5vw, 64px) clamp(40px, 5vw, 60px)' }}>
        <Reveal>
          <Eyebrow num="03">Why ShuttleIQ</Eyebrow>
          <h2
            data-testid="text-features-title"
            style={{ margin: '16px 0 clamp(24px, 3vw, 36px)', fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 0.95, letterSpacing: '-0.03em', color: MKT.navy, maxWidth: 640 }}
          >
            Built by players who got tired of waiting around.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 14 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.name} delay={(i % 3) * 0.06}>
              <FeatureCard f={f} idx={i} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────────────────── WHATSAPP ───────────────────── */}
      <section style={{ padding: 'clamp(20px, 3vw, 24px) clamp(20px, 5vw, 64px)' }}>
        <Reveal>
          <div
            style={{
              borderRadius: 22, overflow: 'hidden', background: MKT.tealMist, color: MKT.tealD,
              padding: 'clamp(20px, 3vw, 28px) clamp(20px, 3vw, 32px)',
              display: 'flex', alignItems: 'center', gap: 'clamp(16px, 2vw, 24px)', flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 'none', width: 56, height: 56, borderRadius: 16, background: MKT.teal, color: MKT.cream, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name="whatsapp" size={26} color={MKT.cream} sw={1.8} />
            </span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div data-testid="text-whatsapp-banner-title" style={{ fontFamily: FF_DISPLAY, fontSize: 'clamp(19px, 2vw, 24px)', fontWeight: 600, color: MKT.tealD, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                ShuttleIQ Dubai · WhatsApp group
              </div>
              <div style={{ marginTop: 4, fontSize: 14, color: MKT.tealD, opacity: 0.75 }}>
                Last-minute games, partner hunts, and courtside banter.
              </div>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="button-join-whatsapp"
              className="siq-link"
              style={{ fontSize: 14, fontWeight: 600, color: MKT.tealD, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              Join the group <MIcon name="arrowSm" size={14} color={MKT.tealD} sw={2.2} />
            </a>
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── FINAL CTA ───────────────────── */}
      <section style={{ padding: 'clamp(36px, 5vw, 60px) clamp(20px, 5vw, 64px)' }}>
        <Reveal>
          <div style={{ borderRadius: 24, overflow: 'hidden', background: MKT.creamD, padding: 'clamp(44px, 6vw, 72px) clamp(22px, 4vw, 48px)', textAlign: 'center' }}>
            <div style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: MKT.tealD, marginBottom: 12 }}>
              Ready when you are
            </div>
            <h2 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(44px, 6vw, 80px)', lineHeight: 0.92, letterSpacing: '-0.04em', color: MKT.navy }}>
              See you on <span style={{ fontStyle: 'italic', color: MKT.teal }}>court</span>.
            </h2>
            <p style={{ margin: '14px auto 0', fontSize: 14, color: MKT.inkSub, lineHeight: 1.5 }}>
              Free account, no credit card. Pay only when you book.
            </p>
            <div style={{ marginTop: 24, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/marketplace/book" data-testid="button-cta-book" className="siq-hover-lift" style={btnStyle('navy', 'lg')}>
                View upcoming sessions <MIcon name="arrow" size={14} color="#fff" sw={2} />
              </Link>
              {!isAuthenticated && (
                <Link href="/marketplace/signup" data-testid="button-cta-signup" className="siq-link" style={{ fontSize: 14, fontWeight: 600, color: MKT.navy, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Create free account <MIcon name="arrowSm" size={12} color={MKT.navy} sw={2.2} />
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── HIRING STRIP ───────────────────── */}
      <div style={{ background: MKT.paper, color: MKT.inkSub, padding: '14px clamp(20px, 5vw, 64px)', borderTop: `1px solid ${MKT.line}`, borderBottom: `1px solid ${MKT.line}`, fontSize: 12, fontFamily: FF_BODY }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MKT.amber }}>We're hiring</span>
            <span style={{ color: MKT.ink, letterSpacing: '-0.005em' }}>
              <b style={{ fontWeight: 600 }}>Court Captain</b>
              <span style={{ margin: '0 8px', opacity: 0.45 }}>·</span>Part-time
              <span style={{ margin: '0 8px', opacity: 0.45 }}>·</span>AED 100 / session
            </span>
          </div>
          <Link href="/marketplace/join-the-crew" data-testid="button-hiring-banner" className="siq-link" style={{ fontWeight: 600, color: MKT.navy, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Join the crew <MIcon name="arrowSm" size={12} color={MKT.navy} sw={2.2} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Hero live-sessions panel (real data) ────────────────────────────────────
function HeroLivePanel() {
  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const upcoming = (sessions ?? [])
    .filter((s) => s.status === 'upcoming' && new Date(s.date) >= todayStart)
    .sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      return d !== 0 ? d : (a.startTime || '').localeCompare(b.startTime || '');
    });

  const rows = upcoming.slice(0, 3);
  const venueCount = new Set(upcoming.map((s) => s.venueName)).size;

  return (
    <div
      style={{
        width: '100%', background: MKT.paper, borderRadius: 22,
        border: `1px solid ${MKT.navy}1F`, padding: '24px 26px 16px',
        boxShadow: '0 1px 0 rgba(0,30,70,0.04)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${MKT.line}` }}>
        <div style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: MKT.ink, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: MKT.green, boxShadow: `0 0 0 4px ${MKT.green}22`, animation: 'siq-pulse 1.6s ease-in-out infinite' }} />
          Games scheduled
        </div>
        {!isLoading && upcoming.length > 0 && (
          <div style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: MKT.inkSub }}>
            {upcoming.length} session{upcoming.length === 1 ? '' : 's'} · {venueCount} venue{venueCount === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          [0, 1, 2].map((i) => (
            <div key={i} style={{ padding: '16px 2px', borderBottom: i === 2 ? 'none' : `1px dashed ${MKT.line}` }}>
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 2px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: MKT.inkSub }}>No sessions scheduled right now — check back soon.</p>
            <Link href="/marketplace/book" className="siq-hover-lift" style={{ ...btnStyle('navy', 'md'), marginTop: 16 }}>
              Browse all sessions <MIcon name="arrowSm" size={14} color="#fff" sw={2.2} />
            </Link>
          </div>
        ) : (
          rows.map((s, i) => <HeroLiveRow key={s.id} s={s} last={i === rows.length - 1} />)
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${MKT.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: MKT.inkSub }}>
          Upcoming · {format(todayStart, 'EEE d MMM')}
        </div>
        <Link href="/marketplace/book" className="siq-link" style={{ fontSize: 13, fontWeight: 600, color: MKT.navy, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          See all sessions <MIcon name="arrowSm" size={12} color={MKT.navy} sw={2.2} />
        </Link>
      </div>
    </div>
  );
}

function HeroLiveRow({ s, last }: { s: BookableSessionWithAvailability; last: boolean }) {
  const spots = s.spotsRemaining;
  const full = spots <= 0;
  const tight = spots > 0 && spots <= 2;
  const accent = full ? MKT.red : tight ? MKT.amber : MKT.tealD;
  return (
    <Link
      href={`/marketplace/sessions/${s.id}`}
      className="siq-hover-lift"
      style={{
        display: 'grid', gridTemplateColumns: '64px 1fr auto', alignItems: 'center', columnGap: 16,
        padding: '16px 2px', cursor: 'pointer', textDecoration: 'none', color: 'inherit',
        borderBottom: last ? 'none' : `1px dashed ${MKT.line}`,
      }}
    >
      <div style={{ fontFamily: FF_MONO, fontSize: 18, fontWeight: 700, color: MKT.navy, letterSpacing: '-0.01em' }}>{s.startTime}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 17, color: MKT.ink, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.venueName}
        </div>
        <div style={{ marginTop: 3, fontSize: 12, color: MKT.inkSub, fontWeight: 500 }}>
          {format(new Date(s.date), 'EEE d MMM')}{s.venueLocation ? ` · ${s.venueLocation}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 72 }}>
        <div style={{ fontFamily: FF_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: full ? MKT.red : tight ? MKT.amber : MKT.teal }} />
          {full ? 'Full' : `${spots} ${tight ? 'left' : 'open'}`}
        </div>
        <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 500, color: MKT.inkMute, letterSpacing: '0.08em' }}>of {s.capacity}</div>
      </div>
    </Link>
  );
}

// ── Personality card (real spotlight data) ──────────────────────────────────
const CARD_BGS = ['#DCE5F1', MKT.tealMist, '#F6D89A', '#FBD8C2', '#E2D6EF', '#D6E3DA'];

function PersonalityCard({ entry, idx, reduce }: { entry: CommunitySpotlightEntry; idx: number; reduce: boolean }) {
  const accent = accentForCategory(entry.tag.category);
  const bg = CARD_BGS[idx % CARD_BGS.length];
  const player = entry.topPlayer;
  const variant = avatarVariantFor(player.id || player.name);

  const inner = (
    <div data-testid={`card-spotlight-${entry.tag.id}`} style={{ position: 'relative', borderRadius: 22, padding: '18px 18px 16px', background: bg, color: MKT.ink, overflow: 'hidden', height: '100%' }}>
      <div aria-hidden style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: '50%', background: `${accent}22` }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>
            Tag #{(idx + 1).toString().padStart(2, '0')}
          </div>
          <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 28, lineHeight: 0.95, letterSpacing: '-0.03em', color: MKT.navy }}>
            {entry.tag.emoji} {entry.tag.label}
          </div>
        </div>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 24, color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {entry.count}<span style={{ fontSize: 13, opacity: 0.55 }}>×</span>
          </div>
          <div style={{ fontFamily: FF_MONO, fontSize: 9, color: MKT.inkSub, letterSpacing: '0.08em' }}>THIS WEEK</div>
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: MKT.paper, border: `1px solid ${MKT.navy}12` }}>
        <span style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', display: 'inline-block', boxShadow: `0 0 0 3px ${accent}33` }}>
          {player.photoUrl ? (
            <img src={player.photoUrl} alt={player.name} data-testid={`img-spotlight-${entry.tag.id}`} style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }} />
          ) : (
            <PlayerAvatar size={40} variant={variant} bg={bg} />
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FF_BODY, fontSize: 13, fontWeight: 700, color: MKT.navy, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '1px 7px', borderRadius: 4, background: MKT.tealMist, color: MKT.tealD, fontSize: 10, fontWeight: 700 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: MKT.teal }} />
            {getTierDisplayName(player.level)} · {player.skillScore}
          </div>
        </div>
      </div>
    </div>
  );

  const content = (
    <Link href={`/marketplace/players/${player.id}`} className="siq-hover-lift" style={{ display: 'block', textDecoration: 'none', height: '100%', cursor: 'pointer' }}>
      {inner}
    </Link>
  );

  if (reduce) return content;
  return <motion.div variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.7, 0.2, 1] } } }}>{content}</motion.div>;
}

// ── Stat cell (count-up) ─────────────────────────────────────────────────────
function StatCell({ stat, idx }: { stat: (typeof STATS)[number]; idx: number }) {
  const { value, ref } = useCountUp(stat.value, 1600);
  const display = stat.decimal ? value.toFixed(1) : Math.round(value).toLocaleString();
  return (
    <div
      ref={ref}
      style={{
        padding: 'clamp(14px, 2vw, 22px) clamp(16px, 2vw, 28px)',
        borderLeft: idx % 2 === 0 ? 'none' : `1px solid ${MKT.line}`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
      className={idx >= 2 ? 'border-t lg:border-t-0' : ''}
    >
      <div style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 'clamp(38px, 4.5vw, 60px)', lineHeight: 0.95, letterSpacing: '-0.04em', color: MKT.navy, fontVariantNumeric: 'tabular-nums' }}>
        {display}<span style={{ color: MKT.teal }}>{stat.suffix}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: MKT.ink, letterSpacing: '-0.005em' }}>{stat.label}</div>
      <div style={{ fontFamily: FF_MONO, fontSize: 11, color: MKT.inkSub, letterSpacing: '0.04em' }}>{stat.sub}</div>
    </div>
  );
}

// ── Step card ────────────────────────────────────────────────────────────────
function StepCard({ step, idx }: { step: (typeof STEPS)[number]; idx: number }) {
  const circleBg = idx === 1 ? MKT.tealMist : idx === 2 ? MKT.amberL : MKT.cream;
  return (
    <div className="siq-hover-lift" style={{ padding: '32px 32px 36px', borderRadius: 24, background: MKT.paper, border: `1.5px solid ${MKT.navy}10`, display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', height: '100%' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: circleBg, border: `2px solid ${MKT.navy}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 22, color: MKT.navy, letterSpacing: '-0.02em', flex: 'none' }}>
        0{step.n}
      </div>
      <StepIllustration idx={idx} />
      <h3 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 'clamp(22px, 2.5vw, 28px)', color: MKT.navy, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{step.title}</h3>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: MKT.inkSub, letterSpacing: '-0.005em' }}>{step.body}</p>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({ f, idx }: { f: (typeof FEATURES)[number]; idx: number }) {
  const bgs = [MKT.paper, MKT.tealMist, MKT.amberL, MKT.paper, '#DCE5F1', MKT.paper];
  const slug = f.name.toLowerCase().replace(/\s/g, '-');
  return (
    <div data-testid={`card-feature-${slug}`} style={{ padding: '18px 18px 20px', borderRadius: 18, background: bgs[idx % bgs.length], border: `1.5px solid ${MKT.navy}10`, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 168, height: '100%' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: MKT.navy, color: MKT.cream, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <MIcon name={f.icon} size={20} color={MKT.cream} />
      </div>
      <div>
        <h3 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 19, color: MKT.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{f.name}</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: MKT.ink, opacity: 0.75, letterSpacing: '-0.005em' }}>{f.blurb}</p>
      </div>
    </div>
  );
}
