// Player Challenges — Gate C5: captain visibility.
//
// View logic is pure in shared/utils/challengeViews.ts (tag, tooltip, lineup
// pair, counts, settled label) so the admin sheet, the court cards and the
// player-facing screens all read from the same rules. CourtCard is rendered
// for real; page wiring is pinned at source.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  firstName, sessionChallengeTag, lineupChallenge, openChallengeCount, settledLabel, challengeTooltip,
} from '../shared/utils/challengeViews';
import { CourtCard } from '../client/src/components/CourtCard';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const accepted = { challengeId: 'c1', status: 'accepted', aId: 'A', aName: 'Dev Kumar', bId: 'B', bName: 'Reena Pillai', createdAt: '2026-09-01T10:00:00.000Z', respondedAt: '2026-09-03T10:00:00.000Z' };
const pending = { challengeId: 'c2', status: 'pending', aId: 'C', aName: 'Naveen R', bId: 'D', bName: 'Aldrin M', createdAt: '2026-09-01T10:00:00.000Z', respondedAt: null };

describe('challengeViews — pure', () => {
  it('firstName', () => {
    expect(firstName('Reena Pillai')).toBe('Reena');
    expect(firstName('  Dev ')).toBe('Dev');
    expect(firstName('')).toBe('');
  });

  it('sessionChallengeTag: "vs <opponent first name>" from either side, null when not involved', () => {
    expect(sessionChallengeTag('A', [accepted, pending])?.opponentFirstName).toBe('Reena');
    expect(sessionChallengeTag('B', [accepted, pending])?.opponentFirstName).toBe('Dev');
    expect(sessionChallengeTag('C', [accepted, pending])?.opponentFirstName).toBe('Aldrin');
    expect(sessionChallengeTag('Z', [accepted, pending])).toBeNull();
  });

  it('tooltip: "Dev Kumar vs Reena Pillai · challenged by Dev Kumar · accepted 3 Sep" (pending → "sent 1 Sep")', () => {
    expect(challengeTooltip(accepted)).toBe('Dev Kumar vs Reena Pillai · challenged by Dev Kumar · accepted 3 Sep');
    expect(challengeTooltip(pending)).toBe('Naveen R vs Aldrin M · challenged by Naveen R · sent 1 Sep');
    expect(sessionChallengeTag('A', [accepted])?.tooltip).toBe(challengeTooltip(accepted));
  });

  it('lineupChallenge: an ACCEPTED pair on opposite teams → the pair; same team or pending → null', () => {
    const lineup = [{ id: 'A', team: 1 }, { id: 'X', team: 1 }, { id: 'B', team: 2 }, { id: 'Y', team: 2 }];
    expect(lineupChallenge(lineup, [accepted])).toEqual({ aName: 'Dev Kumar', bName: 'Reena Pillai' });
    expect(lineupChallenge([{ id: 'A', team: 1 }, { id: 'B', team: 1 }, { id: 'X', team: 2 }, { id: 'Y', team: 2 }], [accepted])).toBeNull();
    expect(lineupChallenge([{ id: 'C', team: 1 }, { id: 'D', team: 2 }], [pending])).toBeNull();
    expect(lineupChallenge(lineup, [])).toBeNull();
  });

  it('openChallengeCount counts pending + accepted only; settledLabel copy', () => {
    expect(openChallengeCount([accepted, pending, { ...accepted, challengeId: 'c9', status: 'settled' }])).toBe(2);
    expect(settledLabel({ winnerName: 'Dev', loserName: 'Reena' })).toBe('Challenge settled — Dev beat Reena');
  });
});

describe('CourtCard — labels', () => {
  const noop = () => {};
  const player = (id: string, name: string, team: number) => ({
    id, name, team, level: 'Beginner', skillScore: 50, gamesPlayed: 3, wins: 1, status: 'playing', gender: 'Male',
    shuttleIqId: null, externalId: null, email: null, phone: null, createdAt: new Date(), lastPlayedAt: null,
    skillScoreBaseline: null, returnGamesRemaining: 0, tierCandidate: null, tierCandidateGames: 0, referralCode: null,
    walletBalance: 0, ambassadorStatus: null, jerseyDispatched: false, leaderboardMention: false,
    referralMilestone5Emailed: false, referralMilestone10Emailed: false,
  }) as any;
  const base = (over: Record<string, unknown>) => ({
    id: 'court-1', name: 'Court 1', sessionId: 's1', status: 'occupied', timeRemaining: 0, skillBand: 'all_levels', createdAt: new Date(),
    players: [player('A', 'Dev Kumar', 1), player('X', 'Xavier', 1), player('B', 'Reena Pillai', 2), player('Y', 'Yusuf', 2)],
    ...over,
  }) as any;
  const mount = (court: any, extra: Record<string, unknown> = {}) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <CourtCard court={court} canRemoveCourt={false} onRemoveCourt={noop} onRecordGame={noop} onCancelGame={noop} onOpenAssign={noop} recordPending={false} cancelPending={false} {...extra} />
      </QueryClientProvider>,
    );
  };

  it('occupied lineup with an accepted pair on opposite teams shows "Challenge match"', () => {
    mount(base({}), { sessionChallenges: [accepted] });
    expect(screen.getByTestId('text-challenge-match-court-1').textContent).toContain('Challenge match');
    expect(screen.getByTestId('text-challenge-match-court-1').textContent).toContain('Dev Kumar');
  });

  it('no label when the pair shares a team, and none without challenges', () => {
    mount(base({ players: [player('A', 'Dev Kumar', 1), player('B', 'Reena Pillai', 1), player('X', 'Xavier', 2), player('Y', 'Yusuf', 2)] }), { sessionChallenges: [accepted] });
    expect(screen.queryByTestId('text-challenge-match-court-1')).toBeNull();
    mount(base({ id: 'court-2' }), { sessionChallenges: [] });
    expect(screen.queryByTestId('text-challenge-match-court-2')).toBeNull();
  });

  it('a free court shows "Challenge settled — Dev beat Reena" after score entry (until the next lineup)', () => {
    mount(base({ id: 'court-3', status: 'available', players: [] }), { lastSettled: [{ winnerName: 'Dev', loserName: 'Reena' }] });
    expect(screen.getByTestId('text-challenge-settled-court-3').textContent).toBe('Challenge settled — Dev beat Reena');
    mount(base({ id: 'court-4', status: 'available', players: [] }), { lastSettled: [] });
    expect(screen.queryByTestId('text-challenge-settled-court-4')).toBeNull();
  });
});

describe('C5 pins — server', () => {
  it('GET /api/sessions/:id/challenges is captain-gated and served by listSessionChallenges', () => {
    const r = read('server/routes.ts');
    expect(r).toMatch(/app\.get\("\/api\/sessions\/:id\/challenges", requireAuth, requireCaptain,/);
    expect(r).toMatch(/listSessionChallenges\(req\.params\.id\)/);
  });
  it('listSessionChallenges accepts an ops or bookable id and counts only confirmed/attended bookings', () => {
    const c = stripComments(read('server/challenges.ts'));
    expect(c).toMatch(/export async function listSessionChallenges\(/);
    expect(c).toContain('linked_session_id');
    expect(c).toMatch(/IN \('confirmed', 'attended'\)|inArray\(bookings\.status, \['confirmed', 'attended'\]\)/);
    expect(c).toContain("IN ('pending', 'accepted')");
  });
  it('end-game replies carry settledChallenges from the transaction', () => {
    const s = stripComments(read('server/storage.ts'));
    expect(s).toMatch(/const settledChallenges = await settleChallengesInTx\(tx, \{/);
    expect(s).toMatch(/alreadySubmitted: false,\s*settledChallenges,/);
    const r = stripComments(read('server/routes.ts'));
    expect(r).toMatch(/res\.json\(\{ \.\.\.updatedCourt, players: \[\], settledChallenges: txResult\.settledChallenges \}\)/);
  });
  it('requireCaptain admits captain, admin and super_admin (Preetham\'s role sees all of this)', () => {
    const m = read('server/auth/middleware.ts');
    const fn = m.slice(m.indexOf('export function requireCaptain'));
    expect(fn).toMatch(/'captain'/); expect(fn).toMatch(/'admin'/); expect(fn).toMatch(/'super_admin'/);
  });
});

describe('C5 pins — client wiring', () => {
  it('admin BookingsSheet: fetches session challenges, tags rows "vs <first name>", counts open in the header', () => {
    const s = read('client/src/pages/SessionsManagement.tsx');
    expect(s).toMatch(/import \{[^}]*sessionChallengeTag[^}]*openChallengeCount[^}]*\} from '@shared\/utils\/challengeViews'/);
    expect(s).toMatch(/queryKey: \['\/api\/sessions', linkedBookable\?\.id, 'challenges'\]/);
    expect(s).toMatch(/data-testid=\{`tag-challenge-\$\{booking\.id\}`\}/);
    expect(s).toMatch(/data-testid="badge-open-challenges"/);
    expect(s).toMatch(/open challenge/);
  });
  it('Home fetches the session challenges, keeps settledByCourt from the end-game reply, clears it on assign', () => {
    const h = stripComments(read('client/src/pages/Home.tsx'));
    expect(h).toMatch(/useState<Record<string, \{ winnerName: string; loserName: string \}\[\]>>\(\{\}\)/);
    expect(h).toMatch(/\['\/api\/sessions', session\.id, 'challenges'\]/);
    expect(h).toMatch(/settledChallenges/);
    expect(h).toMatch(/sessionChallenges=\{/);
    expect(h).toMatch(/settledByCourt=\{/);
    const cm = read('client/src/components/CourtManagement.tsx');
    expect(cm).toMatch(/sessionChallenges=\{sessionChallenges\}/);
    expect(cm).toMatch(/lastSettled=\{settledByCourt\[court\.id\]/);
  });
  it('PlayingScreen shows "Challenge match" for an active challenge against an opponent on court; SessionDone shows the settled line', () => {
    const p = read('client/src/pages/marketplace/PlayingScreen.tsx');
    expect(p).toMatch(/data-testid="text-challenge-match"/);
    expect(p).toMatch(/\/api\/marketplace\/challenges\/mine/);
    expect(p).toMatch(/Challenge match/);
    const d = read('client/src/pages/marketplace/SessionDone.tsx');
    expect(d).toMatch(/data-testid="text-challenge-settled"/);
    expect(d).toMatch(/settledLabel\(/);
  });
  it('no emoji in the new view helper or the touched components', () => {
    for (const f of ['shared/utils/challengeViews.ts', 'client/src/components/CourtCard.tsx']) {
      expect(read(f), f).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});
