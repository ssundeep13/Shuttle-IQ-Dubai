import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Check } from 'lucide-react';

const NAVY = '#0B1E38';
const TEAL = '#1EC8B0';
const TEAL_MID = 'rgba(30, 200, 176, 0.18)';
const WHITE = '#FFFFFF';
const WHITE_60 = 'rgba(255,255,255,0.60)';
const WHITE_20 = 'rgba(255,255,255,0.12)';
const GOLD = '#F5C842';

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

function BrandBar({ slideNum, total = 7 }: { slideNum: number; total?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: '18px', color: WHITE, letterSpacing: '-0.02em' }}>
        Shuttle<span style={{ color: TEAL }}>IQ</span>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {Array.from({ length: total }).map((_, i) => (
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
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '36px 44px 36px' }}>
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
  const fs = { sm: '28px', md: '38px', lg: '48px', xl: '58px' }[size];
  return (
    <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: fs, lineHeight: 1.06, color: WHITE, letterSpacing: '-0.035em', margin: '0 0 16px 0' }}>
      {children}
    </h2>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '22px', color: WHITE, letterSpacing: '-0.02em' }}>
          {title}
        </span>
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: WHITE_60, letterSpacing: '0.06em', paddingLeft: '30px' }}>
        {subtitle}
      </div>
      <div style={{ width: '40px', height: '2px', background: TEAL, borderRadius: '2px', marginTop: '10px' }} />
    </div>
  );
}

function RankRow({
  rank,
  name,
  stat1,
  stat2,
  isTop3 = false,
}: {
  rank: number;
  name: string;
  stat1: string;
  stat2?: string;
  isTop3?: boolean;
}) {
  const rankColor = rank === 1 ? GOLD : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : TEAL;
  const rowBg = isTop3 ? 'rgba(30,200,176,0.07)' : 'transparent';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 10px',
      borderRadius: '8px',
      background: rowBg,
      borderBottom: `1px solid ${WHITE_20}`,
      marginBottom: '0',
    }}>
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        background: isTop3 ? rankColor : 'rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 900,
          fontSize: '12px',
          color: isTop3 ? (rank === 1 ? NAVY : NAVY) : WHITE_60,
        }}>
          {rank}
        </span>
      </div>
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: isTop3 ? 700 : 500,
        fontSize: '14px',
        color: isTop3 ? WHITE : 'rgba(255,255,255,0.85)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize: '14px',
          color: isTop3 ? TEAL : 'rgba(255,255,255,0.75)',
        }}>
          {stat1}
        </span>
        {stat2 && (
          <span style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            color: WHITE_60,
            background: 'rgba(255,255,255,0.06)',
            padding: '2px 7px',
            borderRadius: '100px',
          }}>
            {stat2}
          </span>
        )}
      </div>
    </div>
  );
}

const RANK_DATA = [
  { rank: 1, name: 'Sriram', score: '118', winPct: '81.4%' },
  { rank: 2, name: 'Srinivas', score: '117', winPct: '50.0%' },
  { rank: 3, name: 'Surendra', score: '116', winPct: '41.7%' },
  { rank: 4, name: 'Dinesh', score: '114', winPct: '50.0%' },
  { rank: 5, name: 'Abhinay', score: '113', winPct: '80.0%' },
  { rank: 6, name: 'Shaju', score: '109', winPct: '62.5%' },
  { rank: 7, name: 'Nasser A', score: '109', winPct: '77.8%' },
  { rank: 8, name: 'Karthik U', score: '107', winPct: '44.4%' },
  { rank: 9, name: 'Ayush', score: '107', winPct: '50.0%' },
  { rank: 10, name: 'Sourabh', score: '107', winPct: '51.3%' },
  { rank: 11, name: 'Shannon', score: '106', winPct: '100.0%' },
  { rank: 12, name: 'Pavitra', score: '105', winPct: '50.0%' },
  { rank: 13, name: 'Alan', score: '103', winPct: '54.2%' },
  { rank: 14, name: 'Gavin', score: '103', winPct: '47.5%' },
  { rank: 15, name: 'Natesh', score: '102', winPct: '61.3%' },
  { rank: 16, name: 'Avinash', score: '102', winPct: '57.4%' },
  { rank: 17, name: 'Faraz', score: '101', winPct: '69.2%' },
  { rank: 18, name: 'Marium', score: '100', winPct: '37.0%' },
  { rank: 19, name: 'Naeem', score: '100', winPct: '62.3%' },
];

const WIN_DATA = [
  { rank: 1, name: 'Sriram', winPct: '81.4%', games: '43g' },
  { rank: 2, name: 'Abhinay', winPct: '80.0%', games: '5g' },
  { rank: 3, name: 'Nasser A', winPct: '77.8%', games: '9g' },
  { rank: 4, name: 'Wilfred', winPct: '71.4%', games: '7g' },
  { rank: 5, name: 'Yash', winPct: '71.4%', games: '7g' },
  { rank: 6, name: 'Faraz', winPct: '69.2%', games: '39g' },
  { rank: 7, name: 'Shreeja', winPct: '66.7%', games: '6g' },
  { rank: 8, name: 'Owais', winPct: '66.7%', games: '21g' },
  { rank: 9, name: 'Suraj', winPct: '66.7%', games: '6g' },
  { rank: 10, name: 'Ritwik', winPct: '66.7%', games: '6g' },
  { rank: 11, name: 'Rila', winPct: '64.3%', games: '14g' },
  { rank: 12, name: 'Arun', winPct: '62.5%', games: '24g' },
  { rank: 13, name: 'Shaju', winPct: '62.5%', games: '8g' },
  { rank: 14, name: 'Naeem', winPct: '62.3%', games: '53g' },
  { rank: 15, name: 'Vimal', winPct: '61.5%', games: '26g' },
  { rank: 16, name: 'Natesh', winPct: '61.3%', games: '31g' },
  { rank: 17, name: 'Sandeep', winPct: '59.0%', games: '39g' },
  { rank: 18, name: 'Amal Jaiswal', winPct: '58.8%', games: '34g' },
  { rank: 19, name: 'Avinash', winPct: '57.4%', games: '54g' },
];

const IMPROVED_DATA = [
  { rank: 1, name: 'Nicole', gain: '+51', range: '63→114' },
  { rank: 2, name: 'Sandeep', gain: '+38', range: '70→108' },
  { rank: 3, name: 'Joseph', gain: '+37', range: '40→77' },
  { rank: 4, name: 'Mohini', gain: '+35', range: '63→98' },
  { rank: 5, name: 'Rahul', gain: '+31', range: '54→85' },
  { rank: 6, name: 'Marium', gain: '+31', range: '90→121' },
  { rank: 7, name: 'Gavin', gain: '+31', range: '78→109' },
  { rank: 8, name: 'Avinash', gain: '+30', range: '75→105' },
  { rank: 9, name: 'Shaju', gain: '+29', range: '80→109' },
  { rank: 10, name: 'Ramya', gain: '+29', range: '65→94' },
  { rank: 11, name: 'Nasser A', gain: '+29', range: '80→109' },
  { rank: 12, name: 'Steev', gain: '+28', range: '48→76' },
  { rank: 13, name: 'Shannon', gain: '+28', range: '94→122' },
  { rank: 14, name: 'Hareesh', gain: '+27', range: '66→93' },
  { rank: 15, name: 'Roshan', gain: '+27', range: '58→85' },
  { rank: 16, name: 'Shreeja', gain: '+27', range: '57→84' },
  { rank: 17, name: 'Arun', gain: '+26', range: '81→107' },
  { rank: 18, name: 'Amal Jaiswal', gain: '+26', range: '99→125' },
  { rank: 19, name: 'Suchitha', gain: '+26', range: '69→95' },
];

function Slide1() {
  return (
    <SlideWrapper slideNum={1}>
      <Tag>March 2026 · Dubai Badminton</Tag>
      <Headline size="xl">
        March<br />Leader<span style={{ color: TEAL }}>board.</span>
      </Headline>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: WHITE_60, lineHeight: 1.6, marginBottom: '28px' }}>
        393 games. 83 active players.<br />One month of real progress.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[
          { label: 'Top Ranked', value: 'Sriram — 118 pts' },
          { label: 'Best Win Rate', value: 'Sriram — 81.4%' },
          { label: 'Most Improved', value: 'Nicole — +51 pts' },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '10px', background: TEAL_MID }}>
            <div style={{ width: '6px', height: '6px', background: TEAL, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: TEAL, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>
                {label}
              </div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '16px', color: WHITE }}>
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

function RankSlide({ slideNum, start, end }: { slideNum: number; start: number; end: number }) {
  const rows = RANK_DATA.slice(start, end);
  return (
    <SlideWrapper slideNum={slideNum}>
      <SectionHeader
        icon="🏅"
        title="Top Ranked"
        subtitle={`By Skill Score — #${start + 1} to #${end} · March 2026`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map(({ rank, name, score, winPct }) => (
          <RankRow
            key={rank}
            rank={rank}
            name={name}
            stat1={`${score} pts`}
            stat2={winPct}
            isTop3={rank <= 3}
          />
        ))}
      </div>
    </SlideWrapper>
  );
}

function WinSlide({ slideNum, start, end }: { slideNum: number; start: number; end: number }) {
  const rows = WIN_DATA.slice(start, end);
  return (
    <SlideWrapper slideNum={slideNum}>
      <SectionHeader
        icon="🎯"
        title="Win Rate"
        subtitle={`Highest win % · min 5 games · #${start + 1} to #${end} · March 2026`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map(({ rank, name, winPct, games }) => (
          <RankRow
            key={rank}
            rank={rank}
            name={name}
            stat1={winPct}
            stat2={games}
            isTop3={rank <= 3}
          />
        ))}
      </div>
    </SlideWrapper>
  );
}

function ImprovedSlide({ slideNum, start, end, isFinal = false }: { slideNum: number; start: number; end: number; isFinal?: boolean }) {
  const rows = IMPROVED_DATA.slice(start, end);
  return (
    <SlideWrapper slideNum={slideNum}>
      <SectionHeader
        icon="📈"
        title="Most Improved"
        subtitle={`Biggest skill score gain in March · #${start + 1} to #${end}`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map(({ rank, name, gain, range }) => (
          <RankRow
            key={rank}
            rank={rank}
            name={name}
            stat1={gain}
            stat2={range}
            isTop3={rank <= 3}
          />
        ))}
      </div>
      {isFinal && (
        <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ height: '1px', flex: 1, background: WHITE_20 }} />
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '16px', color: TEAL, letterSpacing: '-0.01em' }}>
            @shuttleiq
          </span>
          <div style={{ height: '1px', flex: 1, background: WHITE_20 }} />
        </div>
      )}
    </SlideWrapper>
  );
}

const SLIDES_CONFIG = [
  { label: 'Slide 1 — Cover', component: () => <Slide1 /> },
  { label: 'Slide 2 — Rank #1–10', component: () => <RankSlide slideNum={2} start={0} end={10} /> },
  { label: 'Slide 3 — Rank #11–20', component: () => <RankSlide slideNum={3} start={10} end={20} /> },
  { label: 'Slide 4 — Win % #1–10', component: () => <WinSlide slideNum={4} start={0} end={10} /> },
  { label: 'Slide 5 — Win % #11–20', component: () => <WinSlide slideNum={5} start={10} end={20} /> },
  { label: 'Slide 6 — Most Improved #1–10', component: () => <ImprovedSlide slideNum={6} start={0} end={10} /> },
  { label: 'Slide 7 — Most Improved #11–20', component: () => <ImprovedSlide slideNum={7} start={10} end={20} isFinal /> },
];

const CAPTION = `March 2026 Leaderboard — Dubai Badminton

393 games. 83 active players. One month of real results.

Here are your top performers for March:

RANKED (by Skill Score)
1. Sriram — 118 pts
2. Srinivas — 117 pts
3. Surendra — 116 pts
...and 16 more — swipe to see the full top 19

WIN RATE (min 5 games)
1. Sriram — 81.4%
2. Abhinay — 80.0%
3. Nasser A — 77.8%
...swipe for the full top 19

MOST IMPROVED
1. Nicole — +51 pts (63→114)
2. Sandeep — +38 pts (70→108)
3. Joseph — +37 pts (40→77)
...swipe for the full top 19

Scores are tracked every game. Ratings evolve every session.

Book your spot for April — shuttleiq.org

#ShuttleIQ #DubaiBadminton #BadmintonDubai #MarchLeaderboard #BadmintonCommunity #SportsDubai #BadmintonLife #Leaderboard #ELO`;

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

export default function InstagramLeaderboard() {
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
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '13px', color: WHITE_60, marginLeft: '12px' }}>March 2026 Leaderboard · 7 Slides</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
          {SLIDES_CONFIG.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSlide(i)}
              data-testid={`button-nav-slide-${i + 1}`}
              title={SLIDES_CONFIG[i].label}
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
        {SLIDES_CONFIG.map(({ label, component: SlideComp }, i) => (
          <div
            key={i}
            id={`slide-block-${i}`}
            ref={el => { slideRefs.current[i] = el; }}
            style={{ marginBottom: '48px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: WHITE_60, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {label}
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
        <div style={{ marginTop: '16px', marginBottom: '0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '18px', color: WHITE }}>
              Instagram Caption
            </div>
            <CopyButton text={CAPTION} testId="button-copy-caption" />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', marginBottom: '64px' }}>
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
