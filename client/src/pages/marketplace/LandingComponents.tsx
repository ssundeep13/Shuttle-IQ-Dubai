// LandingComponents.tsx
// Shared marketing-grade primitives for the ShuttleIQ player-facing landing
// (MarketplaceHome). Ported from the Claude Design export (brand.jsx /
// landing-shared.jsx) into real React + TypeScript.
//
// NOTE: The "Shuttlecock" SVG from the design export is intentionally NOT
// ported here. Per product direction the shuttlecock/birdie must not appear
// anywhere on the landing page. The hero leads with the typographic headline +
// the real "Games scheduled" sessions panel — no decorative birdie graphics.

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────
// PALETTE + TYPE — tonal cousins of the brand tokens (light navy/teal on cream)
// ─────────────────────────────────────────────────────────────────────────
export const MKT = {
  // surfaces
  cream: '#F2ECE1',    // true brand beige (Design Gate 2); ramps below re-derived from it
  creamD: '#E6DFD3',
  creamL: '#F9F5EC',
  paper: '#FEF9F0',
  // brand
  navy: '#002C84',     // true brand navy (Design Gate 2)
  navyD: '#001D58',
  navyL: '#385BAA',
  navyInk: '#000E30',
  teal: '#00766C',     // true brand teal — FILLS (buttons, bars, backgrounds)
  tealText: '#006B5F', // teal AS TEXT on beige/white: #00766C is only 4.69:1 there; this is 5.51 / 6.43
  tealD: '#005A52',
  tealL: '#2D958C',
  tealMist: '#E0EEEC',
  // accents
  amber: '#C97B17',
  amberL: '#F6D89A',
  green: '#1F8A5B',
  greenL: '#C7E5D3',
  red: '#B23A2E',
  // ink
  ink: '#1A1F2B',
  inkSub: '#5C6577',
  inkMute: '#626A7C',  // was #8B92A3 = 2.65:1 on beige (failed AA). Plan quoted #6B7385 as 4.5 — MEASURED 4.04; #626A7C measures 4.61 on beige, 5.42 on white
  // structural
  line: 'rgba(0, 30, 70, 0.10)',
  lineSt: 'rgba(0, 30, 70, 0.18)',
} as const;

// Design Gate 2: display = Montserrat via the token (Bricolage was referenced
// at ~100 sites but never loaded — every one silently rendered Inter).
export const FF_DISPLAY = 'var(--font-display)';
export const FF_BODY = 'var(--font-sans)';
export const FF_MONO = `'JetBrains Mono', ui-monospace, Menlo, monospace`;

// Map a community-tag category to a brand accent colour.
// ─────────────────────────────────────────────────────────────────────────
// BUTTON FACTORIES — the customer surfaces' inline-styled buttons.
// One definition (Dashboard and MyBookings each used to carry a private copy
// that had drifted: ghost border alpha 55 vs 33; both were 35px tall).
//
// Design Gate 1: every variant clears the 44px mobile floor (minHeight:44 +
// padding), and returns a `className` carrying `.siq-press` — inline styles
// cannot express :active, so press-down feedback comes from that class.
// Spread BOTH onto the element: `<Link {...navyBtn('sm')} />`.
// ─────────────────────────────────────────────────────────────────────────
export type BtnSize = 'sm' | 'md';
export interface BtnProps { style: CSSProperties; className: string }

const BTN_BASE: CSSProperties = {
  fontFamily: FF_DISPLAY, fontWeight: 600, letterSpacing: '-0.005em', borderRadius: 10,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, whiteSpace: 'nowrap', minHeight: 44, textDecoration: 'none',
};
const BTN_SIZE: Record<BtnSize, CSSProperties> = {
  sm: { fontSize: 13, padding: '10px 16px' },
  md: { fontSize: 14, padding: '12px 20px' },
};

export function navyBtn(size: BtnSize = 'md'): BtnProps {
  return {
    className: 'siq-press',
    style: { ...BTN_BASE, ...BTN_SIZE[size], border: `1.5px solid ${MKT.navy}`, background: MKT.navy, color: '#fff' },
  };
}
export function ghostBtn(size: BtnSize = 'md'): BtnProps {
  return {
    className: 'siq-press',
    style: { ...BTN_BASE, ...BTN_SIZE[size], border: `1.5px solid ${MKT.navy}55`, background: '#fff', color: MKT.navy },
  };
}
/** Merge per-site style overrides into a factory result without losing the
 *  press class: `<Link {...withStyle(navyBtn('sm'), { width: '100%' })} />`. */
export function withStyle(btn: BtnProps, extra: CSSProperties): BtnProps {
  return { className: btn.className, style: { ...btn.style, ...extra } };
}

export function accentForCategory(category: string): string {
  switch (category) {
    case 'playing_style':
      return MKT.navy;
    case 'social':
      return MKT.green;
    case 'reputation':
      return MKT.amber;
    default:
      return MKT.teal;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// KEYFRAMES — injected once, globally. Drives the live-panel pulse + hover lift.
// ─────────────────────────────────────────────────────────────────────────
const MARKETING_CSS = `
  @keyframes siq-pulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.04); opacity: 1 } }
  @keyframes siq-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
  .siq-hover-lift { -webkit-tap-highlight-color: transparent; transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease; }
  /* Design Gate 1: hover-lift only where hover exists — on touch it stuck the
     card 4px up after every tap. Press-down gets its own, faster state. */
  @media (hover: hover) { .siq-hover-lift:hover { transform: translateY(-4px); } }
  .siq-hover-lift:active { transform: translateY(0) scale(.98); transition-duration: 90ms; }
  .siq-link { position: relative; -webkit-tap-highlight-color: transparent; }
  .siq-link::after { content:''; position:absolute; left:0; right:0; bottom:-3px; height:1.5px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform .35s cubic-bezier(.2,.7,.2,1); }
  @media (hover: hover) { .siq-link:hover::after { transform: scaleX(1); } }
  .siq-link:active { opacity: .7; }
  .siq-link:active::after { transform: scaleX(1); transition-duration: 90ms; }
  @media (prefers-reduced-motion: reduce) {
    .siq-hover-lift { transition: none; }
    .siq-hover-lift:hover, .siq-hover-lift:active { transform: none; }
    [style*="siq-pulse"] { animation: none !important; }
  }
`;

export function MarketingStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('siq-marketing-css')) return;
    const s = document.createElement('style');
    s.id = 'siq-marketing-css';
    s.textContent = MARKETING_CSS;
    document.head.appendChild(s);
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// MOTION HELPERS — all respect prefers-reduced-motion
// ─────────────────────────────────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.7, 0.2, 1] } },
};

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// Scroll-triggered reveal wrapper. Collapses to a plain div when the user
// prefers reduced motion.
export function Reveal({
  children,
  className,
  style,
  delay = 0,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: { opacity: 0, y: 22 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.7, 0.2, 1], delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

// Animate a number 0 → target once it scrolls into view. Honours reduced motion
// (jumps straight to the final value).
export function useCountUp(target: number, durMs = 1500): { value: number; ref: (node: HTMLElement | null) => void } {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const started = useRef(false);
  const ref = useRef<((node: HTMLElement | null) => void) | null>(null);

  const setRef = (node: HTMLElement | null) => {
    if (!node || started.current) return;
    if (reduce) {
      setValue(target);
      started.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            io.disconnect();
            let raf = 0;
            let t0 = 0;
            const step = (t: number) => {
              if (!t0) t0 = t;
              const p = Math.min(1, (t - t0) / durMs);
              const eased = 1 - Math.pow(1 - p, 3);
              setValue(target * eased);
              if (p < 1) raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(node);
  };

  ref.current = setRef;
  return { value, ref: setRef };
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION EYEBROW — "01 — How it works" style
// ─────────────────────────────────────────────────────────────────────────
export function Eyebrow({ num, children, color = MKT.navy }: { num?: string; children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: FF_MONO,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color,
      }}
    >
      {num && <span style={{ opacity: 0.55 }}>{num}</span>}
      <span style={{ width: 24, height: 1.5, background: color, opacity: 0.5 }} />
      <span>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MARKETING ICONS — heavier, more characterful than the UI icon set
// ─────────────────────────────────────────────────────────────────────────
type IconName =
  | 'bolt' | 'trophy' | 'heart' | 'shuffle' | 'pin' | 'user'
  | 'arrow' | 'arrowSm' | 'sparkle' | 'whatsapp' | 'check'
  | 'instagram' | 'x' | 'tiktok' | 'chevR';

export function MIcon({ name, size = 24, color = 'currentColor', sw = 2 }: { name: IconName; size?: number; color?: string; sw?: number }) {
  const common = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, ReactNode> = {
    bolt: <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" {...common} fill={color + '15'} />,
    trophy: (
      <g {...common}>
        <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
        <path d="M4 5h3M17 5h3M9 17h6v4H9zM6 21h12" />
      </g>
    ),
    heart: <path d="M20.8 6.6a5.4 5.4 0 0 0-7.6 0L12 7.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22.6l8.8-8.4a5.4 5.4 0 0 0 0-7.6z" {...common} />,
    shuffle: (
      <g {...common}>
        <path d="M16 3h5v5" />
        <path d="M21 3l-7 7" />
        <path d="M8 21H3v-5" />
        <path d="M3 21l7-7" />
        <path d="M21 16v5h-5" />
        <path d="M21 21l-7-7" />
        <path d="M3 8V3h5" />
        <path d="M3 3l7 7" />
      </g>
    ),
    pin: (
      <g {...common}>
        <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
        <circle cx="12" cy="10" r="2.5" />
      </g>
    ),
    user: (
      <g {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </g>
    ),
    arrow: (
      <g {...common}>
        <path d="M5 12h14" />
        <path d="M13 5l7 7-7 7" />
      </g>
    ),
    arrowSm: (
      <g {...common}>
        <path d="M4 10h12" />
        <path d="M11 5l5 5-5 5" />
      </g>
    ),
    sparkle: (
      <g {...common}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
      </g>
    ),
    whatsapp: (
      <g>
        <path d="M20 12a8 8 0 0 1-12 6.9L4 20l1.2-3.8A8 8 0 1 1 20 12z" {...common} />
        <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l.5-1.4-1.7-.7-.8.8a4 4 0 0 1-2.7-2.7l.8-.8L9.9 9 8.5 9.5z" fill={color} />
      </g>
    ),
    check: <path d="M5 12l5 5L20 7" {...common} />,
    instagram: (
      <g {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill={color} />
      </g>
    ),
    x: (
      <g {...common}>
        <path d="M4 4l16 16M20 4L4 20" />
      </g>
    ),
    tiktok: (
      <g {...common}>
        <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
        <path d="M14 4c0 2 2 4 5 4" />
      </g>
    ),
    chevR: <path d="M9 6l6 6-6 6" {...common} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flex: 'none' }}>
      {paths[name]}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// WORDMARK
// ─────────────────────────────────────────────────────────────────────────
export function MarkWord({ size = 26, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span style={{ fontFamily: FF_BODY, fontWeight: 700, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ color: onDark ? '#fff' : MKT.navy }}>Shuttle</span>
      <span style={{ color: MKT.teal }}>IQ</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ILLUSTRATED PLAYER AVATAR — abstract head + shoulders (fallback when a player
// has no photo). 8 variants for visual variety. Brand-coloured.
// ─────────────────────────────────────────────────────────────────────────
type AvatarVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';

export function avatarVariantFor(seed: string): AvatarVariant {
  const variants: AvatarVariant[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

export function PlayerAvatar({ size = 96, variant = 'a', bg }: { size?: number; variant?: AvatarVariant; bg?: string }) {
  const palettes: Record<AvatarVariant, { bg: string; hair: string; skin: string; shirt: string }> = {
    a: { bg: '#FBE3B8', hair: MKT.navy, skin: '#EFC79A', shirt: MKT.teal },
    b: { bg: '#CFE0F4', hair: '#2A1B0E', skin: '#D7A988', shirt: MKT.navy },
    c: { bg: '#D9EAE7', hair: '#3A2616', skin: '#E8C09A', shirt: MKT.amber },
    d: { bg: '#EFE0D1', hair: '#1F1410', skin: '#C99776', shirt: MKT.navy },
    e: { bg: '#E2D6EF', hair: '#1A1410', skin: '#E5BA94', shirt: MKT.teal },
    f: { bg: '#FBD8C2', hair: '#2B1A0F', skin: '#D49A78', shirt: MKT.tealD },
    g: { bg: '#D6E3DA', hair: '#1A1410', skin: '#EFC79A', shirt: MKT.navy },
    h: { bg: '#FAE0E0', hair: '#241410', skin: '#E8B68F', shirt: MKT.navy },
  };
  const p = palettes[variant] || palettes.a;
  const feature = { a: 'hair-bun', b: 'short', c: 'curly', d: 'band', e: 'long', f: 'cap', g: 'glasses', h: 'beard' }[variant] || 'short';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ display: 'block' }}>
      <circle cx="48" cy="48" r="46" fill={bg || p.bg} />
      <path d="M 12 96 Q 12 70 30 64 L 66 64 Q 84 70 84 96 Z" fill={p.shirt} />
      <rect x="42" y="56" width="12" height="12" fill={p.skin} />
      <circle cx="48" cy="42" r="18" fill={p.skin} />
      {feature === 'short' && <path d="M 30 36 Q 30 22 48 22 Q 66 22 66 36 L 66 42 Q 60 30 48 30 Q 36 30 30 42 Z" fill={p.hair} />}
      {feature === 'hair-bun' && (
        <g fill={p.hair}>
          <circle cx="48" cy="22" r="8" />
          <path d="M 30 36 Q 30 24 48 24 Q 66 24 66 36 L 66 42 Q 60 32 48 32 Q 36 32 30 42 Z" />
        </g>
      )}
      {feature === 'curly' && (
        <g fill={p.hair}>
          <circle cx="34" cy="32" r="7" /><circle cx="44" cy="26" r="7" />
          <circle cx="54" cy="26" r="7" /><circle cx="62" cy="32" r="7" />
          <circle cx="38" cy="38" r="5" /><circle cx="58" cy="38" r="5" />
        </g>
      )}
      {feature === 'band' && (
        <g fill={p.hair}>
          <path d="M 30 36 Q 30 24 48 24 Q 66 24 66 36 L 66 42 Q 60 32 48 32 Q 36 32 30 42 Z" />
          <rect x="28" y="36" width="40" height="4" fill={MKT.red} />
        </g>
      )}
      {feature === 'long' && (
        <g fill={p.hair}>
          <path d="M 28 38 Q 26 22 48 22 Q 70 22 68 38 L 70 56 L 64 60 L 64 42 Q 60 32 48 32 Q 36 32 32 42 L 32 60 L 26 56 Z" />
        </g>
      )}
      {feature === 'cap' && (
        <g>
          <path d="M 30 38 Q 30 26 48 26 Q 66 26 66 38 L 66 42 L 30 42 Z" fill={p.shirt} />
          <rect x="62" y="38" width="14" height="4" rx="2" fill={p.shirt} />
        </g>
      )}
      {feature === 'glasses' && (
        <g>
          <path d="M 30 36 Q 30 22 48 22 Q 66 22 66 36 L 66 40 Q 60 30 48 30 Q 36 30 30 40 Z" fill={p.hair} />
          <g fill="none" stroke={MKT.ink} strokeWidth="2">
            <circle cx="40" cy="44" r="5" />
            <circle cx="56" cy="44" r="5" />
            <line x1="45" y1="44" x2="51" y2="44" />
          </g>
        </g>
      )}
      {feature === 'beard' && (
        <g fill={p.hair}>
          <path d="M 30 36 Q 30 22 48 22 Q 66 22 66 36 L 66 40 Q 60 30 48 30 Q 36 30 30 40 Z" />
          <path d="M 34 50 Q 34 60 48 62 Q 62 60 62 50 Q 56 56 48 56 Q 40 56 34 50 Z" />
        </g>
      )}
      <g fill={MKT.ink}>
        {feature === 'glasses' ? null : (
          <>
            <circle cx="42" cy="44" r="1.6" />
            <circle cx="54" cy="44" r="1.6" />
          </>
        )}
      </g>
      <path d="M 42 50 Q 48 54 54 50" fill="none" stroke={MKT.ink} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="36" cy="50" r="2.2" fill={MKT.red} opacity="0.35" />
      <circle cx="60" cy="50" r="2.2" fill={MKT.red} opacity="0.35" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STEP ILLUSTRATIONS — used in "How it works" (find / book / compete)
// ─────────────────────────────────────────────────────────────────────────
export function StepIllustration({ idx }: { idx: number }) {
  if (idx === 0) {
    return (
      <svg viewBox="0 0 160 120" width="100%" height="120">
        <rect x="20" y="20" width="80" height="80" rx="10" fill={MKT.tealMist} stroke={MKT.teal} strokeWidth="2" />
        <line x1="60" y1="20" x2="60" y2="100" stroke={MKT.teal} strokeOpacity="0.4" strokeDasharray="3 4" />
        <circle cx="110" cy="76" r="20" fill="none" stroke={MKT.navy} strokeWidth="4" />
        <line x1="125" y1="91" x2="142" y2="108" stroke={MKT.navy} strokeWidth="5" strokeLinecap="round" />
        <circle cx="110" cy="76" r="6" fill={MKT.amber} />
      </svg>
    );
  }
  if (idx === 1) {
    return (
      <svg viewBox="0 0 160 120" width="100%" height="120">
        <rect x="36" y="22" width="88" height="76" rx="10" fill={MKT.paper} stroke={MKT.navy} strokeWidth="2" />
        <rect x="36" y="22" width="88" height="16" fill={MKT.navy} />
        <circle cx="52" cy="30" r="3" fill={MKT.cream} />
        <circle cx="108" cy="30" r="3" fill={MKT.cream} />
        <g fill={MKT.teal} opacity="0.35">
          {[0, 1, 2, 3].map((c) => [1, 2].map((r) => <rect key={`${r}-${c}`} x={48 + c * 16} y={50 + r * 16} width="10" height="10" rx="2" />))}
        </g>
        <rect x="80" y="66" width="10" height="10" rx="2" fill={MKT.teal} />
        <path d="M 96 80 L 116 100 L 142 64" fill="none" stroke={MKT.amber} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 120" width="100%" height="120">
      <rect x="56" y="100" width="48" height="6" rx="2" fill={MKT.navy} />
      <rect x="64" y="92" width="32" height="10" rx="2" fill={MKT.paper} stroke={MKT.navy} strokeWidth="2" />
      <rect x="74" y="76" width="12" height="18" fill={MKT.paper} stroke={MKT.navy} strokeWidth="2" />
      <path d="M 50 22 H 110 V 52 a 30 30 0 0 1 -60 0 Z" fill={MKT.amber} stroke={MKT.navy} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M 50 28 H 38 a 8 8 0 0 0 0 16 H 50" fill="none" stroke={MKT.navy} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 110 28 H 122 a 8 8 0 0 1 0 16 H 110" fill="none" stroke={MKT.navy} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 80 32 l 2.8 5.6 6.2 0.9 -4.5 4.4 1.1 6.2 -5.6 -2.9 -5.6 2.9 1.1 -6.2 -4.5 -4.4 6.2 -0.9 z" fill={MKT.navy} />
      <g stroke={MKT.teal} strokeWidth="2" strokeLinecap="round">
        <line x1="30" y1="14" x2="30" y2="20" />
        <line x1="26" y1="17" x2="34" y2="17" />
        <line x1="130" y1="14" x2="130" y2="20" />
        <line x1="126" y1="17" x2="134" y2="17" />
      </g>
    </svg>
  );
}
