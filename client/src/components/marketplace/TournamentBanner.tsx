// ShuttleIQ League — the home banner and the Dashboard card (redesign, Sandeep 2026-09-24): a navy card
// with the reversed wordmark, the fee top right, four tier tiles and ONE action. Self-contained: renders
// nothing while the flag is off or while the viewer cannot see the event (members see it from their
// early-access time), so the logged-out home and the Dashboard each need one line. Same data hooks as
// before. Motion on the first render only (card fades in, bars fill and counts tick up over 600 ms);
// none under prefers-reduced-motion and none on poll refreshes.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { Wordmark } from '@/components/Wordmark';
import { useMyTournamentEntry, useTournamentEnabled, useTournamentView } from '@/hooks/useTournament';
import { BANNER_FEE_SUB, bannerAction, bannerFootLine, bannerMetaLine, bannerOverline, tierTile, type TierState } from '@/lib/tournamentCopy';

const INTRO_S = 0.6;
const white = (a: number) => `rgba(255, 255, 255, ${a})`;

/** Ticks 0 → target inside the card's intro window only; outside it (poll refreshes) the value is shown at once. */
function useIntroCount(target: number, intro: boolean, live: boolean): number {
  const [n, setN] = useState(intro ? 0 : target);
  useEffect(() => {
    if (!intro || !live) { setN(target); return; }
    const c = animate(0, target, {
      duration: INTRO_S, ease: 'easeOut',
      onUpdate: (v) => setN(Math.round(v)),
      onComplete: () => setN(target),
    });
    return () => c.stop();
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps -- intro/live are read at the moment the count changes
  return n;
}

/** "ShuttleIQ League" → the shared reversed wordmark + " League" (one wordmark on every navy surface). */
function wordmark(name: string): ReactNode {
  if (!name.startsWith('ShuttleIQ')) return name;
  return (<><Wordmark onDark size="1em" />{name.slice('ShuttleIQ'.length)}</>);
}

function TierTileView({ t, intro, introLive }: { t: TierState; intro: boolean; introLive: boolean }) {
  const tile = tierTile(t);
  const filled = tile.kind === 'count' ? tile.filled : t.cap;
  const n = useIntroCount(tile.kind === 'count' ? tile.filled : 0, intro, introLive);
  const pct = t.cap > 0 ? Math.min(100, Math.max(0, (filled / t.cap) * 100)) : 0;
  const width = `${Math.round(pct * 10) / 10}%`;
  return (
    <div data-testid={`tile-tier-${t.tier}`} style={{ background: white(0.08), border: `0.5px solid ${white(0.15)}`, borderRadius: 6, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 11, lineHeight: '16px', color: white(0.6) }}>{t.tier}</p>
      {tile.kind === 'count' ? (
        <p data-testid={`text-tier-count-${t.tier}`} style={{ margin: 0, lineHeight: '24px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: IQP.white }}>{n}</span>
          <span style={{ fontSize: 12, color: white(0.5) }}> / {tile.cap}</span>
        </p>
      ) : (
        <p data-testid={`text-tier-status-${t.tier}`} style={{ margin: 0, fontSize: 12, fontWeight: 500, lineHeight: '24px', whiteSpace: 'nowrap', color: tile.kind === 'waitlist' ? IQP.amber : white(0.5) }}>{tile.text}</p>
      )}
      <div style={{ height: 3, borderRadius: 2, background: white(0.15), overflow: 'hidden' }}>
        <motion.div
          data-testid={`bar-tier-${t.tier}`}
          initial={intro ? { width: '0%' } : false}
          animate={{ width }}
          transition={{ duration: introLive ? INTRO_S : 0, ease: 'easeOut' }}
          style={{ height: '100%', background: IQP.tealOnNavy }}
        />
      </div>
    </div>
  );
}

export function TournamentBanner({ variant }: { variant: 'home' | 'dashboard' }) {
  const enabled = useTournamentEnabled();
  const { data: view } = useTournamentView();
  const { data: me } = useMyTournamentEntry();
  const reduced = useReducedMotion();
  const intro = reduced === false;
  // The intro window: transitions run only inside it, so a poll refresh after it lands without motion.
  const introLive = useRef(intro);
  useEffect(() => {
    if (!introLive.current) return;
    const id = setTimeout(() => { introLive.current = false; }, INTRO_S * 1000 + 100);
    return () => clearTimeout(id);
  }, []);

  if (!enabled || !view || !view.visible) return null;
  const t = view.tournament;
  const action = bannerAction(view, !!me?.registration);

  const card = (
    <motion.div
      data-testid="banner-tournament"
      initial={intro ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{ background: IQP.navy, borderRadius: 9, padding: 'clamp(20px, 2.2vw, 24px)', fontFamily: IQP_FONT, color: IQP.white, display: 'grid', gap: 16 }}
    >
      <p data-testid="text-banner-overline" style={{ margin: 0, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', lineHeight: '16px', color: IQP.tealOnNavy }}>{bannerOverline(view)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'start', marginTop: -8 }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <h2 data-testid="text-banner-title" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 'clamp(28px, 2.4vw, 30px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, color: IQP.white }}>{wordmark(t.name)}</h2>
          <p data-testid="text-banner-meta" style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: white(0.7) }}>{bannerMetaLine(t)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p data-testid="text-banner-fee" style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: '32px', whiteSpace: 'nowrap', color: IQP.white }}>AED {t.entryFeeAed}</p>
          <p data-testid="text-banner-fee-sub" className="max-w-[104px] md:max-w-none" style={{ margin: '4px 0 0 auto', fontSize: 12, lineHeight: '16px', color: white(0.55) }}>{BANNER_FEE_SUB}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 8 }}>
        {view.tiers.map((tier) => <TierTileView key={tier.tier} t={tier} intro={intro} introLive={introLive.current} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p data-testid="text-banner-foot" style={{ margin: 0, flex: '1 1 180px', fontSize: 12, lineHeight: '16px', color: white(0.55) }}>{bannerFootLine(view)}</p>
        <Link
          href={action.href}
          data-testid="link-tournament"
          className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 20px', borderRadius: 6, background: IQP.teal, color: IQP.white, fontFamily: IQP_FONT, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          {action.label}
        </Link>
      </div>
    </motion.div>
  );
  if (variant === 'dashboard') return <div style={{ marginBottom: 20 }}>{card}</div>;
  return (
    <section data-testid="section-tournament" style={{ padding: 'clamp(20px, 3vw, 28px) clamp(20px, 5vw, 64px) 0' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>{card}</div>
    </section>
  );
}
