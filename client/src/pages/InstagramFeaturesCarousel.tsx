import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Check, Download, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import bookingImg from '@assets/features-carousel/booking.jpg';
import skillImg from '@assets/features-carousel/skill.jpg';
import leaderboardImg from '@assets/features-carousel/leaderboard.jpg';
import taggingImg from '@assets/features-carousel/tagging.jpg';
import referralsImg from '@assets/features-carousel/referrals.jpg';

const NAVY = '#0B1E38';
const TEAL = '#1EC8B0';
const WHITE = '#FFFFFF';
const WHITE_60 = 'rgba(255,255,255,0.60)';
const WHITE_20 = 'rgba(255,255,255,0.12)';

// Each slide is rendered at 1080×1350 internally (this is the export size).
// The on-screen <Slide /> wrapper uses CSS scale so the visible preview fits
// the column, but the underlying DOM is true Instagram resolution — so when
// html-to-image rasterises it, the PNG comes out at exactly 1080×1350.
const SLIDE_W = 1080;
const SLIDE_H = 1350;
const PREVIEW_W = 480; // visible preview width on the page

const gridStyle: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
  `,
  backgroundSize: '54px 54px',
};

function BrandBar({ slideNum }: { slideNum: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: '28px', color: WHITE, letterSpacing: '-0.02em' }}>
        Shuttle<span style={{ color: TEAL }}>IQ</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i + 1 === slideNum ? '32px' : '10px',
              height: '10px',
              borderRadius: '5px',
              background: i + 1 === slideNum ? TEAL : WHITE_20,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlideShell({ children, slideNum }: { children: React.ReactNode; slideNum: number }) {
  return (
    <div
      style={{
        position: 'relative',
        width: `${SLIDE_W}px`,
        height: `${SLIDE_H}px`,
        background: NAVY,
        overflow: 'hidden',
        ...gridStyle,
      }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: '55%', height: '100%',
        background: 'linear-gradient(135deg, transparent 40%, rgba(30,200,176,0.05) 100%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '64px 70px' }}>
        <BrandBar slideNum={slideNum} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '32px' }}>
          {children}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '5px', background: `linear-gradient(90deg, transparent 0%, ${TEAL} 50%, transparent 100%)` }} />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'inline-flex', marginBottom: '32px' }}>
      <span style={{
        display: 'inline-block', whiteSpace: 'nowrap',
        fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '18px',
        letterSpacing: '0.18em', textTransform: 'uppercase', color: TEAL,
        padding: '12px 26px', border: `2px solid ${TEAL}`, borderRadius: '100px',
      }}>
        {children}
      </span>
    </div>
  );
}

function Headline({ children, size = 'lg' }: { children: React.ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const fs = { md: '64px', lg: '88px', xl: '108px' }[size];
  return (
    <h2 style={{
      fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: fs,
      lineHeight: 1.04, color: WHITE, letterSpacing: '-0.035em', margin: '0 0 24px 0',
    }}>
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'Inter, sans-serif', fontSize: '28px', lineHeight: 1.55,
      color: WHITE_60, margin: '0', fontWeight: 400, maxWidth: '760px',
    }}>
      {children}
    </p>
  );
}

function ScreenshotPanel({ src, alt }: { src: string; alt: string }) {
  // The captured screenshots are 1280×720 with the marketplace page rendered
  // inside a centred phone-frame on a navy background. When placed on the
  // slide (also navy), the phone appears to float naturally.
  return (
    <div style={{
      marginTop: '40px',
      borderRadius: '20px',
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(30,200,176,0.18)',
      background: NAVY,
    }}>
      <img
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}

function FeatureSlide({ slideNum, tag, headline, sub, src, alt }: {
  slideNum: number;
  tag: string;
  headline: React.ReactNode;
  sub: string;
  src: string;
  alt: string;
}) {
  return (
    <SlideShell slideNum={slideNum}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <Tag>{tag}</Tag>
        <Headline size="md">{headline}</Headline>
        <Body>{sub}</Body>
        <ScreenshotPanel src={src} alt={alt} />
      </div>
    </SlideShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Slides

function Slide1() {
  return (
    <SlideShell slideNum={1}>
      <Tag>Inside ShuttleIQ</Tag>
      <Headline size="xl">
        7 features<br />that change<br />how you<br /><span style={{ color: TEAL }}>play.</span>
      </Headline>
      <Body>A guided tour of the platform built for Dubai's badminton community.</Body>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px', marginTop: '56px',
        fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: 700,
        color: TEAL, letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        Swipe <span style={{ fontSize: '36px', lineHeight: 1, transform: 'translateY(-2px)' }}>→</span>
      </div>
    </SlideShell>
  );
}

function Slide2() {
  return (
    <FeatureSlide
      slideNum={2}
      tag="Booking"
      headline={<>Book a court in<br /><span style={{ color: TEAL }}>30 seconds.</span></>}
      sub="Browse upcoming sessions across Dubai, see what's filling up, lock in your spot."
      src={bookingImg}
      alt="ShuttleIQ booking screen"
    />
  );
}

function Slide3() {
  return (
    <FeatureSlide
      slideNum={3}
      tag="Skill Rating"
      headline={<>Your skill, in<br /><span style={{ color: TEAL }}>real numbers.</span></>}
      sub="Every game updates your live ELO-style rating. Watch your score, win rate, and streak evolve."
      src={skillImg}
      alt="Player profile with skill score and stats"
    />
  );
}

function Slide4() {
  return (
    <FeatureSlide
      slideNum={4}
      tag="Leaderboard"
      headline={<>Climb the<br /><span style={{ color: TEAL }}>Dubai rankings.</span></>}
      sub="Live global leaderboard ranks every active player in the city. Filter weekly, monthly, or all-time."
      src={leaderboardImg}
      alt="ShuttleIQ rankings page"
    />
  );
}

function Slide5() {
  return (
    <FeatureSlide
      slideNum={5}
      tag="Player Personalities"
      headline={<>Tagged for how<br />you <span style={{ color: TEAL }}>actually play.</span></>}
      sub="Teammates and opponents tag you after every game — Smasher, Wall, Tactical, Funny One. Your reputation, in their words."
      src={taggingImg}
      alt="Player personality card with community tags"
    />
  );
}

function Slide6() {
  return (
    <FeatureSlide
      slideNum={6}
      tag="Referrals + Wallet"
      headline={<>Bring a friend,<br />earn <span style={{ color: TEAL }}>AED 15.</span></>}
      sub="Every friend who attends their first session puts AED 15 in your wallet. 5 referrals → leaderboard mention. 10 → ambassador status + jersey."
      src={referralsImg}
      alt="Referral and wallet card on the ShuttleIQ dashboard"
    />
  );
}

function Slide7() {
  return (
    <SlideShell slideNum={7}>
      <Headline size="xl">
        Ready to<br /><span style={{ color: TEAL }}>book your spot?</span>
      </Headline>
      <Body>Join 90+ players already on ShuttleIQ.</Body>
      <div style={{ marginTop: '64px', padding: '54px 60px', borderRadius: '24px', background: TEAL }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '78px', color: NAVY, letterSpacing: '-0.03em', lineHeight: 1 }}>
          shuttleiq.org
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '28px', color: 'rgba(11,30,56,0.75)', marginTop: '14px', fontWeight: 500 }}>
          Dubai · All levels welcome
        </div>
      </div>
      <div style={{ marginTop: '56px', fontFamily: 'Inter, sans-serif', fontSize: '20px', color: WHITE_20, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        ShuttleIQ · Dubai
      </div>
    </SlideShell>
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

const SLIDE_FILENAMES = [
  '01-cover.png',
  '02-booking.png',
  '03-skill-rating.png',
  '04-leaderboard.png',
  '05-tagging.png',
  '06-referrals.png',
  '07-cta.png',
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
    }).catch(() => setCopied(false));
  };
  return (
    <button
      onClick={handleCopy}
      data-testid={testId}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '8px 16px', borderRadius: '8px',
        background: copied ? TEAL : 'rgba(30,200,176,0.12)',
        border: '1px solid rgba(30,200,176,0.3)',
        color: copied ? NAVY : TEAL,
        fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s ease',
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

async function exportSlideToPng(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    width: SLIDE_W,
    height: SLIDE_H,
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: true,
    style: {
      transform: 'none',
      transformOrigin: '0 0',
    },
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SlideDownloadButton({ getNode, filename }: { getNode: () => HTMLElement | null; filename: string }) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    const node = getNode();
    if (!node) return;
    setBusy(true);
    try {
      const blob = await exportSlideToPng(node);
      downloadBlob(blob, filename);
    } catch (e) {
      console.error('export failed', e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      data-testid={`button-download-${filename}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '6px 12px', borderRadius: '6px',
        background: 'rgba(30,200,176,0.10)', border: '1px solid rgba(30,200,176,0.28)',
        color: TEAL, fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer', transition: 'all 0.15s ease',
      }}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      PNG
    </button>
  );
}

export default function InstagramFeaturesCarousel() {
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slideContentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

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

  const handleDownloadAll = async () => {
    setBulkBusy(true);
    setBulkProgress(0);
    try {
      const zip = new JSZip();
      for (let i = 0; i < slideContentRefs.current.length; i++) {
        const node = slideContentRefs.current[i];
        if (!node) continue;
        const blob = await exportSlideToPng(node);
        zip.file(SLIDE_FILENAMES[i], blob);
        setBulkProgress(i + 1);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, 'shuttleiq-features-carousel.zip');
    } catch (e) {
      console.error('bulk export failed', e);
    } finally {
      setBulkBusy(false);
      setBulkProgress(0);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080E1C', color: WHITE }}>
      {/* Top nav */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(8,14,28,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
      }}>
        <Link href="/marketplace">
          <button
            data-testid="button-back"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', color: WHITE_60,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontSize: '14px', padding: '0',
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
        </Link>
        <div style={{ width: '1px', height: '20px', background: WHITE_20 }} />
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: WHITE }}>
          Shuttle<span style={{ color: TEAL }}>IQ</span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '13px', color: WHITE_60, marginLeft: '12px' }}>
            Features Carousel · 7 Slides
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <CopyButton text={CAPTION} testId="button-copy-caption-top" />
          <button
            onClick={handleDownloadAll}
            disabled={bulkBusy}
            data-testid="button-download-all"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 18px', borderRadius: '8px',
              background: bulkBusy ? 'rgba(30,200,176,0.18)' : TEAL,
              border: `1px solid ${TEAL}`,
              color: bulkBusy ? TEAL : NAVY,
              fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 700,
              cursor: bulkBusy ? 'wait' : 'pointer', transition: 'all 0.2s ease',
            }}
          >
            {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {bulkBusy ? `Exporting ${bulkProgress}/7…` : 'Download all (zip)'}
          </button>

          {/* Slide jump dots */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '8px' }}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToSlide(i)}
                data-testid={`button-nav-slide-${i + 1}`}
                title={SLIDE_TITLES[i]}
                style={{
                  width: activeSlide === i ? '24px' : '8px', height: '8px',
                  borderRadius: '4px',
                  background: activeSlide === i ? TEAL : 'rgba(255,255,255,0.2)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s ease', padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Slides */}
      <div style={{ maxWidth: `${PREVIEW_W + 48}px`, margin: '0 auto', padding: '40px 24px 0' }}>
        {SLIDES.map((SlideComp, i) => (
          <div
            key={i}
            id={`slide-block-${i}`}
            ref={el => { slideRefs.current[i] = el; }}
            style={{ marginBottom: '56px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{
                fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600,
                color: WHITE_60, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                {SLIDE_TITLES[i]}
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                  1080 × 1350
                </span>
                <SlideDownloadButton
                  getNode={() => slideContentRefs.current[i]}
                  filename={SLIDE_FILENAMES[i]}
                />
              </div>
            </div>

            {/* Scaled preview wrapper — keeps the slide DOM at true 1080×1350
                but visually shrinks it via CSS transform so it fits the column. */}
            <div style={{
              width: `${PREVIEW_W}px`,
              height: `${(PREVIEW_W / SLIDE_W) * SLIDE_H}px`,
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              position: 'relative',
            }}>
              <div
                ref={el => { slideContentRefs.current[i] = el; }}
                style={{
                  width: `${SLIDE_W}px`,
                  height: `${SLIDE_H}px`,
                  transform: `scale(${PREVIEW_W / SLIDE_W})`,
                  transformOrigin: '0 0',
                }}
              >
                <SlideComp />
              </div>
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
