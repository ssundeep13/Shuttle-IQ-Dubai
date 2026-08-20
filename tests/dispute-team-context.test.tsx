/**
 * Admin dispute cards: "Score: 20 - 22" had no team context — an admin can't
 * judge "me and Naveen won, score is the other way around" without knowing
 * WHO the 20 and the 22 belong to. Display-only: teams come from the existing
 * /api/game-history/:sessionId response (participants with names), joined
 * client-side by gameResultId.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DisputesTabContent } from '../client/src/pages/SessionsManagement';
import { getQueryFn } from '../client/src/lib/queryClient';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const GAME = {
  id: 'g1', sessionId: 's1', team1Score: 20, team2Score: 22, winningTeam: 2,
  createdAt: new Date('2026-08-19T18:00:00Z').toISOString(),
  participants: [
    { playerId: 'pa', gameId: 'g1', team: 1, playerName: 'Manan', playerLevel: 'Intermediate' },
    { playerId: 'pb', gameId: 'g1', team: 1, playerName: 'Krishna', playerLevel: 'Intermediate' },
    { playerId: 'pc', gameId: 'g1', team: 2, playerName: 'Naveen', playerLevel: 'Intermediate' },
    { playerId: 'pd', gameId: 'g1', team: 2, playerName: 'Aldrin', playerLevel: 'Intermediate' },
  ],
};

const dispute = (over: Record<string, unknown>) => ({
  id: 'd1', gameResultId: 'g1', filedByUserId: 'u1', note: 'me and Naveen won, score is the other way around',
  status: 'open', adminNote: null, createdAt: new Date().toISOString(),
  filedByName: 'Aldrin', filedByEmail: 'aldrin@x.test', gameScore: '20 - 22',
  gameDate: new Date('2026-08-19T18:00:00Z').toISOString(), sessionId: 's1',
  ...over,
});

function mount(disputes: any[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/game-history/s1')) {
      return new Response(JSON.stringify([GAME]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  // the app's default queryFn (joins the queryKey into the URL) — the
  // component's useQueries relies on it
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: 'throw' }) } } });
  return render(
    <QueryClientProvider client={qc}>
      <DisputesTabContent disputes={disputes as any} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('dispute cards carry full team context', () => {
  it('renders both team rows with names + per-team scores, winner marked', async () => {
    mount([dispute({})]);
    await waitFor(() => expect(screen.getByTestId('dispute-team-1-d1')).toBeTruthy());
    const t1 = screen.getByTestId('dispute-team-1-d1');
    const t2 = screen.getByTestId('dispute-team-2-d1');
    expect(t1.textContent).toContain('Manan + Krishna');
    expect(t1.textContent).toContain('20');
    expect(t2.textContent).toContain('Naveen + Aldrin');
    expect(t2.textContent).toContain('22');
    // winning side visually marked (teal + won chip on team 2)
    expect(t2.textContent).toContain('won');
    expect(t2.querySelector('.text-secondary-text, .font-bold')).toBeTruthy();
    expect(t1.textContent).not.toContain('won');
  });

  it("marks which side the DISPUTING player was on (unambiguous name match only)", async () => {
    mount([dispute({})]); // Aldrin filed; Aldrin is on team 2
    await waitFor(() => expect(screen.getByTestId('dispute-team-2-d1')).toBeTruthy());
    expect(screen.getByTestId('dispute-team-2-d1').textContent).toMatch(/disputer/i);
    expect(screen.getByTestId('dispute-team-1-d1').textContent).not.toMatch(/disputer/i);
  });

  it('no side marker when the filer name matches no participant (graceful)', async () => {
    mount([dispute({ filedByName: 'Somebody Else' })]);
    await waitFor(() => expect(screen.getByTestId('dispute-team-1-d1')).toBeTruthy());
    expect(screen.getByTestId('card-dispute-d1').textContent).not.toMatch(/disputer/i);
  });

  it('cross-references multiple open disputes on the same game', async () => {
    mount([dispute({}), dispute({ id: 'd2', filedByName: 'Manan', note: 'we won 22-20' })]);
    await waitFor(() => expect(screen.getByTestId('dispute-team-1-d1')).toBeTruthy());
    expect(screen.getByTestId('card-dispute-d1').textContent).toContain('2 disputes on this game');
    expect(screen.getByTestId('card-dispute-d2').textContent).toContain('2 disputes on this game');
  });

  it('falls back to the plain score line while team data is unavailable', async () => {
    mount([dispute({ gameResultId: 'gX', sessionId: 'sX' })]); // history for sX returns []
    await waitFor(() => expect(screen.getByTestId('card-dispute-d1').textContent).toContain('20 - 22'));
  });

  it("keeps the disputer's comment verbatim", async () => {
    mount([dispute({})]);
    await waitFor(() => expect(screen.getByTestId('text-dispute-note-d1').textContent).toContain('me and Naveen won, score is the other way around'));
  });

  it('source: joins via the EXISTING game-history endpoint — no new server surface', () => {
    const src = read('client/src/pages/SessionsManagement.tsx');
    expect(src).toMatch(/useQueries/);
    expect(src).toMatch(/\['\/api\/game-history', s/);
  });
});
