// ShuttleIQ League — the pinned "Tournament" row at the top of the Sessions list. Self-contained:
// renders nothing while the flag is off or before the open. Sits above the results, so it also shows
// while the list is loading or a filter leaves no sessions.
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { useTournamentEnabled, useTournamentView } from '@/hooks/useTournament';
import { eventLine } from '@/lib/tournamentCopy';

export function TournamentSessionsRow() {
  const enabled = useTournamentEnabled();
  const { data: view } = useTournamentView();
  if (!enabled || !view || !view.visible) return null;
  const t = view.tournament;
  return (
    <Link href="/marketplace/tournament" data-testid="row-tournament-pinned"
      style={{ marginTop: 'clamp(20px, 3vw, 28px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        textDecoration: 'none', background: IQP.white, border: `1px solid ${IQP.line}`, borderLeft: `4px solid ${IQP.teal}`, borderRadius: 12,
        padding: '14px 16px', fontFamily: IQP_FONT, color: IQP.ink }}>
      <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: IQP.teal }}>Tournament</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: IQP.navy, letterSpacing: '-0.01em' }}>{t.name}</span>
        <span style={{ fontSize: 14, color: IQP.inkSub }}>{eventLine(t)}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: IQP.white, background: IQP.navy, borderRadius: 6, padding: '10px 16px', whiteSpace: 'nowrap' }}>
        {view.canRegister ? 'Register' : 'View'}
      </span>
    </Link>
  );
}
