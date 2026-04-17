import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Check, Wallet, Gift, Trophy } from 'lucide-react';
import bookingImg from '@assets/features-carousel/booking.jpg';
import skillImg from '@assets/features-carousel/skill.jpg';
import leaderboardImg from '@assets/features-carousel/leaderboard.jpg';
import taggingImg from '@assets/features-carousel/tagging.jpg';

const NAVY = '#0B1E38';
const TEAL = '#1EC8B0';
const WHITE = '#FFFFFF';
const WHITE_60 = 'rgba(255,255,255,0.60)';
const WHITE_40 = 'rgba(255,255,255,0.40)';
const WHITE_20 = 'rgba(255,255,255,0.12)';

const gridStyle: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
  `,
  backgroundSize: '54px 54px',
};

const diagonalAccent: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: '55%',
  height: '100%',
  background: 'linear-gradient(135deg, transparent 40%, rgba(30,200,176,0.04) 100%)',
  pointerEvents: 'none',
};

function BrandBar({ slideNum }: { slideNum: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: '18px', color: WHITE, letterSpacing: '-0.02em' }}>
        Shuttle<span style={{ color: TEAL }}>IQ</span>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i + 1 === slideNum ? '20px' : '6px',
              height: '6px',
              borderRadius: '3px',
              background: i + 1 === slideNum ? TEAL : WHITE_20,
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlideWrapper({ children, slideNum, padded = true }: { children: React.ReactNode; slideNum: number; padded?: boolean }) {
  return (
    <div
      data-testid={`slide-${slideNum}`}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1080 / 1350',
        background: NAVY,
        overflow: 'hidden',
        borderRadius: '4px',
        ...gridStyle,
      }}
    >
      <div style={diagonalAccent} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: padded ? '40px 44px 40px' : '40px 44px 40px' }}>
        <BrandBar slideNum={slideNum} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {children}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, transparent 0%, ${TEAL} 50%, transparent 100%)` }} />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'inline-flex', marginBottom: '20px' }}>
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
        fontSize: '11px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: TEAL,
        padding: '7px 16px',
        border: `1px solid ${TEAL}`,
        borderRadius: '100px',
      }}>
        {children}
      </span>
    </div>
  );
}

function Headline({ children, size = 'lg' }: { children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const fs = { sm: '30px', md: '38px', lg: '54px', xl: '64px' }[size];
  return (
    <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: fs, lineHeight: 1.04, color: WHITE, letterSpacing: '-0.035em', margin: '0 0 14px 0' }}>
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '17px', lineHeight: 1.65, color: WHITE_60, margin: '0 0 16px 0', fontWeight: 400 }}>
      {children}
    </p>
  );
}

function BrowserFrame({ src, alt, focusY = 0 }: { src: string; alt: string; focusY?: number }) {
  // focusY: 0 = top, 0.5 = center, 1 = bottom — controls vertical crop within the captured screenshot
  return (
    <div style={{
      borderRadius: '14px',
      overflow: 'hidden',
      background: '#0E1729',
      boxShadow: '0 18px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
      border: `1px solid rgba(30,200,176,0.18)`,
    }}>
      {/* Browser chrome */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: '#15243F',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#FF5F57' }} />
          <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#FEBC2E' }} />
          <div style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#28C840' }} />
        </div>
        <div style={{
          marginLeft: '10px',
          flex: 1,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '6px',
          padding: '5px 12px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '11px',
          color: WHITE_60,
          letterSpacing: '0.02em',
        }}>
          shuttleiq.org
        </div>
      </div>
      {/* Screenshot — cropped to a 4:3 aspect ratio for cleaner framing */}
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '75%',
        overflow: 'hidden',
        background: '#F5EFE0',
      }}>
        <img
          src={src}
          alt={alt}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 'auto',
            transform: focusY ? `translateY(${-focusY * 100}%)` : undefined,
          }}
        />
      </div>
    </div>
  );
}

function FeatureSlide({ slideNum, tag, headline, sub, src, alt, focusY }: {
  slideNum: number;
  tag: string;
  headline: React.ReactNode;
  sub: string;
  src: string;
  alt: string;
  focusY?: number;
}) {
  return (
    <SlideWrapper slideNum={slideNum}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
        <Tag>{tag}</Tag>
        <Headline size="md">{headline}</Headline>
        <Body>{sub}</Body>
        <div style={{ marginTop: '18px' }}>
          <BrowserFrame src={src} alt={alt} focusY={focusY} />
        </div>
      </div>
    </SlideWrapper>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Slide 1 — Cover

function Slide1() {
  return (
    <SlideWrapper slideNum={1}>
      <Tag>Inside ShuttleIQ</Tag>
      <Headline size="xl">
        7 features<br />that change<br />how you<br /><span style={{ color: TEAL }}>play.</span>
      </Headline>
      <Body>A guided tour of the platform built for Dubai's badminton community.</Body>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '28px', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: TEAL, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Swipe <span style={{ fontSize: '22px', lineHeight: 1, transform: 'translateY(-1px)' }}>→</span>
      </div>
    </SlideWrapper>
  );
}

// Slide 2 — Booking
function Slide2() {
  return (
    <FeatureSlide
      slideNum={2}
      tag="Booking"
      headline={<>Book a court in<br /><span style={{ color: TEAL }}>30 seconds.</span></>}
      sub="Browse upcoming sessions across Dubai, see what's filling up, and lock in your spot — no calls, no chat threads."
      src={bookingImg}
      alt="ShuttleIQ booking screen showing upcoming sessions"
    />
  );
}

// Slide 3 — Skill rating
function Slide3() {
  return (
    <FeatureSlide
      slideNum={3}
      tag="Skill Rating"
      headline={<>Your skill, in<br /><span style={{ color: TEAL }}>real numbers.</span></>}
      sub="Every game updates your live ELO-style rating. Watch your skill score, win rate, and streak evolve over time."
      src={skillImg}
      alt="Player profile showing skill score and stats"
    />
  );
}

// Slide 4 — Leaderboard
function Slide4() {
  return (
    <FeatureSlide
      slideNum={4}
      tag="Leaderboard"
      headline={<>Climb the<br /><span style={{ color: TEAL }}>Dubai rankings.</span></>}
      sub="Live global leaderboard ranks every active player in the city. Filter by week, month, or all-time."
      src={leaderboardImg}
      alt="ShuttleIQ rankings page with top players"
    />
  );
}

// Slide 5 — Tagging
function Slide5() {
  return (
    <FeatureSlide
      slideNum={5}
      tag="Player Personalities"
      headline={<>Tagged for how<br />you <span style={{ color: TEAL }}>actually play.</span></>}
      sub="Teammates and opponents tag you after games — Smasher, Wall, Tactical, Funny One. Your reputation, in their words."
      src={taggingImg}
      alt="Player personality card with community tags"
      focusY={0}
    />
  );
}

// Slide 6 — Referrals + Wallet (designed mockup since auth-gated)
function Slide6() {
  return (
    <SlideWrapper slideNum={6}>
      <Tag>Referrals + Wallet</Tag>
      <Headline size="md">
        Bring a friend,<br />earn <span style={{ color: TEAL }}>AED 15.</span>
      </Headline>
      <Body>Every friend who attends their first session puts AED 15 in your wallet — usable on your next booking.</Body>

      {/* Wallet card mockup */}
      <div style={{
        marginTop: '20px',
        background: 'linear-gradient(135deg, rgba(30,200,176,0.18) 0%, rgba(30,200,176,0.06) 100%)',
        border: `1px solid rgba(30,200,176,0.35)`,
        borderRadius: '16px',
        padding: '22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', background: TEAL,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Wallet size={18} color={NAVY} />
          </div>
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: WHITE_60, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Wallet Balance
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '28px', fontWeight: 900, color: WHITE, letterSpacing: '-0.02em' }}>
              AED 45.00
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '14px 0' }} />

        {/* Progress to ambassador */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: WHITE }}>
            <Trophy size={14} color={TEAL} />
            5 / 10 to Ambassador + Jersey
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: WHITE_60, fontWeight: 500 }}>
            5 to go
          </div>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: '50%', height: '100%', background: TEAL, borderRadius: '3px' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            padding: '5px 10px', borderRadius: '100px',
            fontFamily: 'Inter, sans-serif', fontSize: '11px', color: WHITE, fontWeight: 600,
          }}>
            <Gift size={11} color={TEAL} /> Leaderboard mention
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            padding: '5px 10px', borderRadius: '100px',
            fontFamily: 'Inter, sans-serif', fontSize: '11px', color: WHITE_40, fontWeight: 600,
          }}>
            <Trophy size={11} color={WHITE_40} /> Ambassador status
          </span>
        </div>
      </div>

      <div style={{ marginTop: '18px', fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '15px', color: TEAL, letterSpacing: '-0.01em' }}>
        Your code → SIQ-FRIEND-1234
      </div>
    </SlideWrapper>
  );
}

// Slide 7 — CTA
function Slide7() {
  return (
    <SlideWrapper slideNum={7}>
      <Headline size="xl">
        Ready to<br /><span style={{ color: TEAL }}>book your spot?</span>
      </Headline>
      <Body>Join 90+ players already on ShuttleIQ.</Body>
      <div style={{ marginTop: '36px', padding: '28px 32px', borderRadius: '14px', background: TEAL }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '34px', color: NAVY, letterSpacing: '-0.03em' }}>
          shuttleiq.org
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: `${NAVY}BB`, marginTop: '6px', fontWeight: 500 }}>
          Dubai · All levels welcome
        </div>
      </div>
      <div style={{ marginTop: '32px', fontFamily: 'Inter, sans-serif', fontSize: '12px', color: WHITE_20, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        ShuttleIQ · Dubai
      </div>
    </SlideWrapper>
  );
}

const SLIDES = [Slide1, Slide2, Slide3, Slide4, Slide5, Slide6, Slide7];

const SLIDE_TITLES = [
  'Slide 1 — Cover',
  'Slide 2 — Booking',
  'Slide 3 — Skill Rating',
  'Slide 4 — Leaderboard',
  'Slide 5 — Player Tagging',
  'Slide 6 — Referrals + Wallet',
  'Slide 7 — CTA',
];

const CAPTION = `7 features that change how you play badminton in Dubai. 🏸

Inside ShuttleIQ, you can:
→ Book a court in 30 seconds
→ See your skill in real numbers (live ELO rating)
→ Climb the Dubai-wide leaderboard
→ Get tagged by other players for how you actually play
→ Earn AED 15 every time a friend joins

Stop guessing how good you are. Start tracking it.

Book your next session 👇
shuttleiq.org

📍 Dubai · All levels welcome

#ShuttleIQ #Badminton #DubaiBadminton #SmartBadminton #BadmintonDubai #SportsDubai #BadmintonCommunity #LevelUp #BadmintonLife`;

function CopyButton({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  };
  return (
    <button
      onClick={handleCopy}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '8px',
        background: copied ? TEAL : 'rgba(30,200,176,0.12)',
        border: '1px solid rgba(30,200,176,0.3)',
        color: copied ? NAVY : TEAL,
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function InstagramFeaturesCarousel() {
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    slideRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSlide(i); },
        { threshold: 0.5 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  const scrollToSlide = (idx: number) => {
    const el = slideRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080E1C', color: WHITE }}>
      {/* Top nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(8,14,28,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <Link href="/marketplace">
          <button
            data-testid="button-back"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: WHITE_60, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '14px', padding: '0' }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </Link>
        <div style={{ width: '1px', height: '20px', background: WHITE_20 }} />
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: WHITE }}>
          Shuttle<span style={{ color: TEAL }}>IQ</span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '13px', color: WHITE_60, marginLeft: '12px' }}>
            Features Carousel · 7 Slides
          </span>
        </div>

        {/* Slide jump dots */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSlide(i)}
              data-testid={`button-nav-slide-${i + 1}`}
              title={SLIDE_TITLES[i]}
              style={{
                width: activeSlide === i ? '28px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: activeSlide === i ? TEAL : 'rgba(255,255,255,0.2)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Helper banner */}
      <div style={{ maxWidth: '560px', margin: '24px auto 0', padding: '0 24px' }}>
        <div style={{
          background: 'rgba(30,200,176,0.06)',
          border: '1px solid rgba(30,200,176,0.18)',
          borderRadius: '10px',
          padding: '14px 18px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          color: WHITE_60,
          lineHeight: 1.6,
        }}>
          <strong style={{ color: WHITE }}>To export:</strong> right-click each slide → <em>Save image as…</em> (or screenshot it). Each slide is 1080 × 1350 (Instagram portrait carousel).
        </div>
      </div>

      {/* Slides */}
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 24px 0' }}>
        {SLIDES.map((SlideComp, i) => (
          <div
            key={i}
            id={`slide-block-${i}`}
            ref={el => { slideRefs.current[i] = el; }}
            style={{ marginBottom: '48px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: WHITE_60, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {SLIDE_TITLES[i]}
              </span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                1080 × 1350
              </span>
            </div>

            <div style={{ borderRadius: '6px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              <SlideComp />
            </div>
          </div>
        ))}

        {/* Caption */}
        <div style={{ marginTop: '16px', marginBottom: '64px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '18px', color: WHITE }}>
              Instagram Caption
            </div>
            <CopyButton text={CAPTION} testId="button-copy-caption" />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px' }}>
            <pre
              data-testid="text-caption"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.8, color: WHITE_60, whiteSpace: 'pre-wrap', margin: 0 }}
            >
              {CAPTION}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
