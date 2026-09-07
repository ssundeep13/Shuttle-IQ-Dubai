// Player Challenges (C5) — view rules shared by the admin bookings sheet, the
// court cards and the player-facing screens, so "vs Reena", "Challenge
// match" and "Challenge settled — …" mean the same thing everywhere.
import { formatPreviewDate } from './seriesDates';

/** One open challenge between two players booked into the same session, as
 *  served by GET /api/sessions/:id/challenges. a = challenger, b = challenged. */
export interface SessionChallenge {
  challengeId: string;
  status: string; // 'pending' | 'accepted'
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  createdAt: string;
  respondedAt: string | null;
}

export function firstName(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** 'YYYY-MM-DD' in Dubai for an instant — en-CA formats ISO-style. */
function dubaiIso(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export function shortDay(iso: string): string {
  try { return formatPreviewDate(dubaiIso(iso)); } catch { return ''; }
}

/** "Dev Kumar vs Reena Pillai · challenged by Dev Kumar · accepted 3 Sep" */
export function challengeTooltip(c: SessionChallenge): string {
  const when = c.status === 'accepted' && c.respondedAt ? `accepted ${shortDay(c.respondedAt)}` : `sent ${shortDay(c.createdAt)}`;
  return `${c.aName} vs ${c.bName} · challenged by ${c.aName} · ${when}`;
}

export interface ChallengeTag { challengeId: string; status: string; opponentFirstName: string; tooltip: string }

/** The "vs <first name>" tag for a booked player, or null when they hold no
 *  open challenge with anyone in this session. */
export function sessionChallengeTag(playerId: string, list: SessionChallenge[]): ChallengeTag | null {
  const c = list.find((x) => (x.status === 'pending' || x.status === 'accepted') && (x.aId === playerId || x.bId === playerId));
  if (!c) return null;
  const opponent = c.aId === playerId ? c.bName : c.aName;
  return { challengeId: c.challengeId, status: c.status, opponentFirstName: firstName(opponent), tooltip: challengeTooltip(c) };
}

/** An ACCEPTED pair standing on opposite teams of this lineup → the pair. */
export function lineupChallenge(players: Array<{ id: string; team: number }>, list: SessionChallenge[]): { aName: string; bName: string } | null {
  const teamOf = new Map(players.map((p) => [p.id, p.team]));
  for (const c of list) {
    if (c.status !== 'accepted') continue;
    const ta = teamOf.get(c.aId);
    const tb = teamOf.get(c.bId);
    if (ta === undefined || tb === undefined || ta === tb) continue;
    return { aName: c.aName, bName: c.bName };
  }
  return null;
}

export function openChallengeCount(list: SessionChallenge[]): number {
  return list.filter((c) => c.status === 'pending' || c.status === 'accepted').length;
}

export function settledLabel(s: { winnerName: string; loserName: string }): string {
  return `Challenge settled — ${s.winnerName} beat ${s.loserName}`;
}
