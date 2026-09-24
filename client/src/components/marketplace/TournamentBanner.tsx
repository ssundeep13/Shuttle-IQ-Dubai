// ShuttleIQ League — the home banner with the live per-tier counter. Self-contained: renders nothing
// while the flag is off or before the open (members see it from their early-access time), so the logged-out
// home and the Dashboard each need one line.
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { useTournamentEnabled, useTournamentView } from '@/hooks/useTournament';
import { eventLine, earlyAccessLine } from '@/lib/tournamentCopy';
import { TournamentTierCounter, tEyebrow, tNavyBtn, tSub } from './TournamentParts';

export function TournamentBanner({ variant }: { variant: 'home' | 'dashboard' }) {
  const enabled = useTournamentEnabled();
  const { data: view } = useTournamentView();
  if (!enabled || !view || !view.visible) return null;
  const t = view.tournament;
  const card = (
    <div data-testid="banner-tournament" style={{ background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 12, padding: '18px 20px', fontFamily: IQP_FONT, color: IQP.ink, display: 'grid', gap: 10 }}>
      <p style={tEyebrow}>Tournament</p>
      <h2 style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 22, fontWeight: 700, color: IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{t.name}</h2>
      <p style={tSub}>{eventLine(t)} · AED {t.entryFeeAed} entry</p>
      {view.phase === 'members_only' && <p style={{ ...tSub, fontSize: 13, color: IQP.teal, fontWeight: 600 }}>{earlyAccessLine(t.registrationOpensAt)}</p>}
      <TournamentTierCounter tiers={view.tiers} compact />
      <Link href="/marketplace/tournament" data-testid="link-tournament" style={{ ...tNavyBtn(), width: 'fit-content' }}>
        {view.canRegister ? 'Register' : 'See the ShuttleIQ League'}
      </Link>
    </div>
  );
  if (variant === 'dashboard') return <div style={{ marginBottom: 20 }}>{card}</div>;
  return (
    <section data-testid="section-tournament" style={{ padding: 'clamp(20px, 3vw, 28px) clamp(20px, 5vw, 64px) 0' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>{card}</div>
    </section>
  );
}
