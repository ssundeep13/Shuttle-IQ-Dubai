// ShuttleIQ Premier League — the sponsorship card that follows the company field (exact copy, Sandeep 2026-09-23),
// on the registration form, the entry on the Premier League page and the My games entry. The deck link appears
// only when the deck ships (TOURNAMENT_DECK_AVAILABLE, pinned by a test to the PDF being in client/public/docs).
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { SPONSOR_HEADING, SPONSOR_LINE, SPONSOR_DECK_LABEL, SPONSOR_TICK, TOURNAMENT_DECK_AVAILABLE, TOURNAMENT_DECK_URL } from '@/lib/tournamentCopy';

const sub: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontSize: 13, color: IQP.inkSub, lineHeight: 1.5 };
const tickRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 14, color: IQP.ink, cursor: 'pointer', fontFamily: IQP_FONT };
const tickBox: React.CSSProperties = { width: 20, height: 20, accentColor: IQP.teal, margin: 0, flex: '0 0 auto' };

export function TournamentSponsorCard({ checked, onChange, disabled, deckAvailable = TOURNAMENT_DECK_AVAILABLE }: {
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; deckAvailable?: boolean;
}) {
  return (
    <div data-testid="card-tournament-sponsor" style={{ border: `1px solid ${IQP.line}`, borderRadius: 9, background: IQP.cream, padding: '12px 14px', display: 'grid', gap: 6 }}>
      <p style={{ margin: 0, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, color: IQP.navy }}>{SPONSOR_HEADING}</p>
      <p style={sub}>{SPONSOR_LINE}</p>
      {deckAvailable && (
        <a data-testid="link-sponsorship-deck" href={TOURNAMENT_DECK_URL} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: IQP_FONT, fontSize: 14, fontWeight: 600, color: IQP.teal, width: 'fit-content' }}>
          {SPONSOR_DECK_LABEL}
        </a>
      )}
      <label style={tickRow}>
        <input data-testid="checkbox-sponsor-interest" type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={tickBox} />
        <span>{SPONSOR_TICK}</span>
      </label>
    </div>
  );
}
