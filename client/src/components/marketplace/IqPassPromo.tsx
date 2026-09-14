// IQ Pass promotion (Gate 12) — three small pieces, IQ Pass tokens only, Inter, no icons:
//   IqPassPromoCard      Dashboard, no active pass: "Pick your day. Lock your spot." + tiers with prices + navy CTA.
//   IqPassProgressLine   Dashboard with a pass, and the My games hero: "Club · 1 of 4 played" + teal bar.
//   IqPassLandingSection Landing page below the hero: headline, sub, three tier cards, one CTA.
// Prices arrive from the server's public config and are shown as pass prices only, never split or compared.
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import type { PackTier } from '@shared/iqPassTiers';

export type IqPassTierPublic = { tier: PackTier | string; label: string; games: number; priceAed: number };

export const IQ_PASS_PERKS: Record<PackTier, string> = {
  club: 'Pick any venue',
  club_plus: 'Priority waitlist and first access to new venues',
  club_elite: 'Everything, plus your ShuttleIQ jersey',
};

const eyebrow: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: IQP.teal };
const navyBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 6,
  backgroundColor: IQP.navy, color: IQP.white, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, textDecoration: 'none', width: 'fit-content',
};

export function IqPassPromoCard({ tiers, href }: { tiers: IqPassTierPublic[]; href: string }) {
  return (
    <div data-testid="card-iq-pass-promo" style={{ background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 12, padding: '18px 20px', fontFamily: IQP_FONT, color: IQP.ink, display: 'grid', gap: 10 }}>
      <p style={eyebrow}>IQ Pass</p>
      <h2 style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 22, fontWeight: 800, color: IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Pick your day. Lock your spot.</h2>
      <p data-testid="text-iq-pass-promo-sub" style={{ margin: 0, fontSize: 14, color: IQP.inkSub }}>4, 8 or 12 games. Seats locked.</p>
      <p data-testid="text-iq-pass-tier-line" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: IQP.ink }}>{tiers.map((t) => `${t.label} AED ${t.priceAed}`).join(' · ')}</p>
      <Link href={href} data-testid="button-get-iq-pass" style={navyBtn}>Get your IQ Pass</Link>
    </div>
  );
}

export function IqPassProgressLine({ label, played, total, href, compact, onDark }: { label: string; played: number; total: number; href: string; compact?: boolean; onDark?: boolean }) {
  const safeTotal = Math.max(1, total);
  const pct = Math.max(0, Math.min(100, Math.round((played / safeTotal) * 100)));
  const textColour = onDark ? IQP.cream : compact ? IQP.teal : IQP.inkSub;
  return (
    <Link href={href} data-testid="line-iq-pass-progress" aria-label={`IQ Pass ${label}, ${played} of ${total} played, open your pass`}
      style={{ display: 'block', textDecoration: 'none', color: IQP.ink, fontFamily: IQP_FONT, background: compact ? 'transparent' : IQP.white, border: compact ? 'none' : `1px solid ${IQP.line}`, borderRadius: compact ? 0 : 12, padding: compact ? '10px 0 0' : '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {!compact && <span style={{ fontWeight: 700, fontSize: 15, color: IQP.navy }}>IQ Pass</span>}
        <span data-testid="text-iq-pass-progress" style={{ fontSize: compact ? 12 : 14, fontWeight: compact ? 600 : 400, color: textColour }}>{label} · {played} of {total} played</span>
      </div>
      <div aria-hidden="true" style={{ marginTop: 6, height: compact ? 3 : 6, borderRadius: 999, background: onDark ? 'rgba(255, 255, 255, 0.22)' : IQP.cream, overflow: 'hidden' }}>
        <span data-testid="bar-iq-pass-progress" style={{ display: 'block', width: `${pct}%`, height: '100%', backgroundColor: IQP.teal, borderRadius: 999 }} />
      </div>
    </Link>
  );
}

export function IqPassLandingSection({ tiers, href }: { tiers: IqPassTierPublic[]; href: string }) {
  return (
    <section data-testid="section-iq-pass" aria-labelledby="iq-pass-landing-title"
      style={{ background: IQP.navy, color: IQP.cream, padding: 'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 64px)', fontFamily: IQP_FONT }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{ ...eyebrow, color: IQP.cream, opacity: 0.8 }}>IQ Pass</p>
          <h2 id="iq-pass-landing-title" style={{ margin: '6px 0 0', fontFamily: IQP_FONT, fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, color: IQP.cream }}>Pick your day. Lock your spot.</h2>
          <p data-testid="text-landing-iq-pass-sub" style={{ margin: '10px 0 0', fontSize: 'clamp(15px, 1.6vw, 18px)', color: IQP.cream, opacity: 0.85 }}>4, 8 or 12 games. Seats locked.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {tiers.map((t) => (
            <div key={t.tier} data-testid={`card-landing-tier-${t.tier}`} style={{ background: IQP.white, color: IQP.ink, borderRadius: 12, padding: '18px 20px', display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: IQP.navy, letterSpacing: '-0.01em' }}>{t.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t.games} games</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: IQP.teal, letterSpacing: '-0.02em' }}>AED {t.priceAed}</span>
              <span data-testid={`text-perk-${t.tier}`} style={{ fontSize: 13, color: IQP.inkSub }}>{IQ_PASS_PERKS[t.tier as PackTier] ?? ''}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link href={href} data-testid="button-landing-iq-pass" style={{ ...navyBtn, backgroundColor: IQP.white, color: IQP.navy, minHeight: 48, padding: '0 22px', fontSize: 16 }}>Get your IQ Pass</Link>
          <Link href="/iq-pass/terms" data-testid="link-landing-terms" style={{ fontSize: 13, fontWeight: 600, color: IQP.cream, opacity: 0.85 }}>IQ Pass terms</Link>
        </div>
      </div>
    </section>
  );
}
