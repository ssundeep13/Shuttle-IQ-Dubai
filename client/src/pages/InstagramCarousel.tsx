import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Check } from 'lucide-react';

const NAVY = '#0B1E38';
const TEAL = '#1EC8B0';
const TEAL_MID = 'rgba(30, 200, 176, 0.18)';
const WHITE = '#FFFFFF';
const WHITE_60 = 'rgba(255,255,255,0.60)';
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

function SlideWrapper({ children, slideNum }: { children: React.ReactNode; slideNum: number }) {
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
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '40px 44px 40px' }}>
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
    <div style={{ display: 'inline-flex', marginBottom: '28px' }}>
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
  const fs = { sm: '34px', md: '44px', lg: '54px', xl: '62px' }[size];
  return (
    <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: fs, lineHeight: 1.04, color: WHITE, letterSpacing: '-0.035em', margin: '0 0 20px 0' }}>
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '17px', lineHeight: 1.75, color: WHITE_60, margin: '0 0 16px 0', fontWeight: 400 }}>
      {children}
    </p>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '20px', color: TEAL, marginTop: '28px', letterSpacing: '-0.02em' }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ width: '48px', height: '3px', background: TEAL, borderRadius: '2px', marginBottom: '32px' }} />;
}

function BulletRow({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', borderRadius: '10px', background: TEAL_MID, marginBottom: '10px' }}>
      <div style={{ width: '7px', height: '7px', background: TEAL, borderRadius: '50%', flexShrink: 0 }} />
      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '17px', color: WHITE }}>
        {text}
      </span>
    </div>
  );
}

function ProblemRow({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderBottom: `1px solid ${WHITE_20}` }}>
      <div style={{ width: '6px', height: '6px', background: TEAL, borderRadius: '50%', flexShrink: 0 }} />
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '17px', color: WHITE_60, fontWeight: 400 }}>
        {text}
      </span>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '15px 0', borderBottom: `1px solid ${WHITE_20}` }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '17px', color: NAVY }}>{num}</span>
      </div>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '17px', color: WHITE, fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ padding: '24px 0', borderBottom: `1px solid ${WHITE_20}` }}>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '50px', color: TEAL, lineHeight: 1, letterSpacing: '-0.04em' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: WHITE_60, marginTop: '6px', fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}

function PersuasionRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '15px 0', borderBottom: `1px solid ${WHITE_20}`, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '19px', color: WHITE }}>
      {text}
    </div>
  );
}

function Slide1() {
  return (
    <SlideWrapper slideNum={1}>
      <Tag>Dubai Badminton</Tag>
      <Headline size="xl">
        Progress<br />is the<br /><span style={{ color: TEAL }}>Game.</span>
      </Headline>
      <Body>Not just badminton. Not just games.<br />This is improvement.</Body>
      <Divider />
    </SlideWrapper>
  );
}

function Slide2() {
  return (
    <SlideWrapper slideNum={2}>
      <Tag>The Problem</Tag>
      <Headline size="lg">
        Most games<br />don't make<br />you <span style={{ color: TEAL }}>better.</span>
      </Headline>
      <div style={{ marginTop: '8px' }}>
        <ProblemRow text="Random players." />
        <ProblemRow text="Uneven matchups." />
        <ProblemRow text="No score tracking." />
        <ProblemRow text="No visible growth." />
      </div>
      <Footer>You play, but you don't progress.</Footer>
    </SlideWrapper>
  );
}

function Slide3() {
  return (
    <SlideWrapper slideNum={3}>
      <Tag>The Solution</Tag>
      <Headline size="lg">
        Meet<br /><span style={{ color: TEAL }}>ShuttleIQ.</span>
      </Headline>
      <Body>Dubai's first algorithm-based<br />badminton queue.</Body>
      <div style={{ marginTop: '20px' }}>
        <BulletRow text="Smart matchmaking" />
        <BulletRow text="Performance tracking" />
        <BulletRow text="Real rankings" />
      </div>
    </SlideWrapper>
  );
}

function Slide4() {
  return (
    <SlideWrapper slideNum={4}>
      <Tag>How It Works</Tag>
      <Headline size="lg">
        Play.<br />Track.<br /><span style={{ color: TEAL }}>Improve.</span>
      </Headline>
      <div style={{ marginTop: '16px' }}>
        <Step num={1} text="Join a session" />
        <Step num={2} text="Get matched fairly" />
        <Step num={3} text="Scores are recorded" />
        <Step num={4} text="Your rating evolves" />
      </div>
      <Footer>Every game counts.</Footer>
    </SlideWrapper>
  );
}

function Slide5() {
  return (
    <SlideWrapper slideNum={5}>
      <Tag>The Numbers</Tag>
      <Headline size="lg">
        Built for<br /><span style={{ color: TEAL }}>real progress.</span>
      </Headline>
      <div style={{ marginTop: '12px' }}>
        <Stat value="2,400+" label="Games Played" />
        <Stat value="97%" label="Match Accuracy" />
        <Stat value="#1" label="Badminton Queue in Dubai" />
      </div>
    </SlideWrapper>
  );
}

function Slide6() {
  return (
    <SlideWrapper slideNum={6}>
      <Headline size="lg">
        Stop playing<br /><span style={{ color: TEAL }}>random</span><br />games.
      </Headline>
      <Body>Start playing with purpose.</Body>
      <div style={{ marginTop: '8px' }}>
        <PersuasionRow text="Better players." />
        <PersuasionRow text="Real competition." />
        <PersuasionRow text="Visible progress." />
        <PersuasionRow text="Play with purpose." />
      </div>
      <Footer>Feel the difference.</Footer>
    </SlideWrapper>
  );
}

function Slide7() {
  return (
    <SlideWrapper slideNum={7}>
      <Headline size="xl">
        Ready to<br /><span style={{ color: TEAL }}>level up?</span>
      </Headline>
      <Body>Book your next session on ShuttleIQ</Body>
      <div style={{ marginTop: '36px', padding: '28px 32px', borderRadius: '14px', background: TEAL }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '30px', color: NAVY, letterSpacing: '-0.03em' }}>
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
  'Slide 1 — Hook',
  'Slide 2 — Problem',
  'Slide 3 — Solution',
  'Slide 4 — Process',
  'Slide 5 — Stats',
  'Slide 6 — Persuasion',
  'Slide 7 — CTA',
];

const CAPTION = `Progress is the game. 🏸

Not just matches. Not just movement. Every session you play on ShuttleIQ is tracked, analysed, and used to make your next game better.

→ Smart algorithm-based matchmaking
→ Real-time performance tracking
→ Live player rankings across Dubai

2,400+ games played. 97% match accuracy. Dubai's #1 badminton queue.

Ready to stop playing random games and start playing with purpose?

Book your next session 👇
shuttleiq.org

📍 Dubai · All levels welcome

#ShuttleIQ #Badminton #DubaiBadminton #SmartBadminton #BadmintonDubai #SportsDubai #BadmintonCommunity #LevelUp #BadmintonLife`;

const REEL_NOTES = `Reel Adaptation Notes:
• 0–2s: Bold text reveal on dark bg — "Progress is the Game."
• 2–4s: Cut to problem list animating in one by one
• 4–7s: "Meet ShuttleIQ" with product name reveal and bullet points
• 7–10s: Steps sequence with quick cuts (1→2→3→4)
• 10–13s: Stats counter animation (2,400+, 97%, #1)
• 13–15s: "Stop playing random" with punchy text flashes
• 15–18s: CTA reveal — shuttleiq.org on teal background
• Audio: Lo-fi hip-hop or minimal sports cinematic beat
• Aspect ratio: 9:16 (1080×1920) for Reels vs 4:5 (1080×1350) for carousel`;

function CopyButton({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        background: copied ? '#1EC8B0' : 'rgba(30,200,176,0.12)',
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

export default function InstagramCarousel() {
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
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '13px', color: WHITE_60, marginLeft: '12px' }}>Instagram Carousel · 7 Slides</span>
        </div>

        {/* Slide jump dots — synced to scroll position */}
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

      {/* Slides */}
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 24px 0' }}>
        {SLIDES.map((SlideComp, i) => (
          <div
            key={i}
            id={`slide-block-${i}`}
            ref={el => { slideRefs.current[i] = el; }}
            style={{ marginBottom: '48px' }}
          >
            {/* Slide label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: WHITE_60, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {SLIDE_TITLES[i]}
              </span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                1080 × 1350
              </span>
            </div>

            {/* The slide itself */}
            <div style={{ borderRadius: '6px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              <SlideComp />
            </div>
          </div>
        ))}

        {/* Caption section */}
        <div style={{ marginTop: '16px', marginBottom: '0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '48px' }}>
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

        {/* Reel notes */}
        <div style={{ marginTop: '32px', marginBottom: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '18px', color: WHITE }}>
              Reel Adaptation Notes
            </div>
            <CopyButton text={REEL_NOTES} testId="button-copy-reel-notes" />
          </div>
          <div style={{ background: 'rgba(30,200,176,0.05)', borderRadius: '12px', border: `1px solid rgba(30,200,176,0.15)`, padding: '24px' }}>
            <pre
              data-testid="text-reel-notes"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', lineHeight: 1.85, color: WHITE_60, whiteSpace: 'pre-wrap', margin: 0 }}
            >
              {REEL_NOTES}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
