// ShuttleIQ Premier League — my entry on My games. Self-contained: renders nothing while the flag is off
// or when I have no active entry, so My games needs one line.
import { useMyTournamentEntry, useTournamentActions, useTournamentEnabled } from '@/hooks/useTournament';
import { TournamentEntryView } from './TournamentParts';

export function TournamentEntryCard({ spacedBelow }: { spacedBelow?: boolean } = {}) {
  const enabled = useTournamentEnabled();
  const me = useMyTournamentEntry();
  const actions = useTournamentActions();
  const r = me.data?.registration;
  if (!enabled || !r) return null;
  const view = <TournamentEntryView registration={r} tournament={me.data?.tournament ?? null} actions={actions} showPageLink />;
  return spacedBelow ? <div style={{ marginBottom: 16 }}>{view}</div> : view;
}
