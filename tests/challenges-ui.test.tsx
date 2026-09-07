// Player Challenges — Gate C4: player UI.
//
// Two small components carry the behaviour so they can be rendered for real
// in jsdom: ChallengeButton (public profile) and ChallengesCard (own Profile).
// The pages import them; page-level wiring is pinned at source.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ChallengeButton } from '../client/src/components/ChallengeButton';
import { ChallengesCard } from '../client/src/components/ChallengesCard';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function withClient(ui: React.ReactElement, seed: Array<[unknown[], unknown]> = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [key, data] of seed) qc.setQueryData(key, data);
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { qc, invalidate };
}
afterEach(() => vi.unstubAllGlobals());

const person = (id: string, name: string, tier = 'Intermediate') => ({ id, name, tier });
const view = (over: Record<string, unknown>) => ({
  id: 'c1', status: 'pending', direction: 'incoming', challenger: person('A', 'Dev'), challenged: person('me', 'Reena'),
  winner: null, gameResultId: null, createdAt: '2026-09-03T10:00:00.000Z', expiresAt: '2026-09-10T10:00:00.000Z', respondedAt: null, settledAt: null, ...over,
});

describe('ChallengeButton — public profile', () => {
  const statusKey = ['/api/marketplace/challenges/status', 'p2'];

  it('renders the navy Challenge button when the status endpoint allows it', () => {
    withClient(<ChallengeButton playerId="p2" playerName="Reena" viewerPlayerId="p1" />, [[statusKey, { canChallenge: true }]]);
    const btn = screen.getByTestId('button-challenge');
    expect(btn.textContent).toContain('Challenge');
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('min-[400px]:w-auto');
  });

  it.each([
    ['Out of your range', 'Out of your range'],
    ['Challenge pending', 'Challenge pending'],
    ['Challenge active', 'Challenge active'],
  ])('hides the button and shows the reason "%s" as a caption', (reason, caption) => {
    withClient(<ChallengeButton playerId="p2" playerName="Reena" viewerPlayerId="p1" />, [[statusKey, { canChallenge: false, reason }]]);
    expect(screen.queryByTestId('button-challenge')).toBeNull();
    expect(screen.getByTestId('text-challenge-reason').textContent).toBe(caption);
  });

  it('renders nothing on your own profile, and nothing when the viewer has no linked player', () => {
    withClient(<ChallengeButton playerId="p1" playerName="Me" viewerPlayerId="p1" />, [[['/api/marketplace/challenges/status', 'p1'], { canChallenge: true }]]);
    expect(screen.queryByTestId('challenge-cta')).toBeNull();
    withClient(<ChallengeButton playerId="p2" playerName="Reena" viewerPlayerId={null} />, [[statusKey, { canChallenge: true }]]);
    expect(screen.queryByTestId('challenge-cta')).toBeNull();
  });

  it('confirms before sending, then POSTs { challengedPlayerId } and refreshes the status', async () => {
    const fetchSpy = vi.fn(async (_u: unknown, init?: RequestInit) => init?.method === 'POST' ? json(201, view({ status: 'pending', direction: 'outgoing' })) : json(200, { canChallenge: false, reason: 'Challenge pending' }));
    vi.stubGlobal('fetch', fetchSpy);
    const { invalidate } = withClient(<ChallengeButton playerId="p2" playerName="Reena" viewerPlayerId="p1" />, [[statusKey, { canChallenge: true }]]);
    fireEvent.click(screen.getByTestId('button-challenge'));
    const dialog = screen.getByTestId('dialog-challenge-confirm');
    expect(dialog.textContent).toContain('Challenge Reena?');
    expect(fetchSpy.mock.calls.some(c => (c[1] as any)?.method === 'POST')).toBe(false); // nothing sent yet
    fireEvent.click(screen.getByTestId('button-confirm-challenge'));
    await waitFor(() => expect(fetchSpy.mock.calls.some(c => (c[1] as any)?.method === 'POST')).toBe(true));
    const post = fetchSpy.mock.calls.find(c => (c[1] as any)?.method === 'POST') as any[];
    expect(String(post[0])).toContain('/api/marketplace/challenges');
    expect(JSON.parse(post[1].body)).toEqual({ challengedPlayerId: 'p2' });
    await waitFor(() => expect(invalidate.mock.calls.some(c => JSON.stringify((c[0] as any)?.queryKey) === JSON.stringify(['/api/marketplace/challenges']))).toBe(true));
  });

  it('shows the server error inline (e.g. 409) and keeps the dialog open', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => init?.method === 'POST' ? json(409, { error: 'Open challenge already exists' }) : json(200, { canChallenge: true })));
    withClient(<ChallengeButton playerId="p2" playerName="Reena" viewerPlayerId="p1" />, [[statusKey, { canChallenge: true }]]);
    fireEvent.click(screen.getByTestId('button-challenge'));
    fireEvent.click(screen.getByTestId('button-confirm-challenge'));
    await waitFor(() => expect(screen.getByTestId('text-challenge-error').textContent).toContain('Open challenge already exists'));
    expect(screen.getByTestId('dialog-challenge-confirm')).toBeTruthy();
  });
});

describe('ChallengesCard — own Profile', () => {
  const mineKey = ['/api/marketplace/challenges/mine'];

  it('empty state copy with a way to find someone', () => {
    withClient(<ChallengesCard />, [[mineKey, { incoming: [], outgoing: [], active: [], settled: [] }]]);
    const card = screen.getByTestId('card-challenges');
    expect(card.textContent).toContain('No challenges yet. Find a player to challenge.');
    expect(card.querySelector('a[href="/marketplace/rankings"]')).toBeTruthy();
  });

  it('lists incoming (Accept / Decline), outgoing pending, active, and only the last 3 settled', () => {
    const settled = [1, 2, 3, 4, 5].map(i => view({ id: `s${i}`, status: 'settled', direction: 'outgoing', challenger: person('me', 'Reena'), challenged: person(`o${i}`, `Opp ${i}`), winner: person('me', 'Reena'), settledAt: `2026-09-0${i}T10:00:00.000Z` }));
    withClient(<ChallengesCard />, [[mineKey, {
      incoming: [view({ id: 'in1' })],
      outgoing: [view({ id: 'out1', direction: 'outgoing', challenger: person('me', 'Reena'), challenged: person('B', 'Krishna') })],
      active: [view({ id: 'act1', status: 'accepted', direction: 'outgoing', challenger: person('me', 'Reena'), challenged: person('C', 'Naveen'), respondedAt: '2026-09-04T10:00:00.000Z' })],
      settled,
    }]]);
    const card = screen.getByTestId('card-challenges');
    expect(screen.getByTestId('button-accept-challenge-in1')).toBeTruthy();
    expect(screen.getByTestId('button-decline-challenge-in1')).toBeTruthy();
    expect(screen.getByTestId('challenge-row-in1').textContent).toContain('Dev');
    expect(screen.getByTestId('challenge-row-out1').textContent).toContain('Krishna');
    expect(screen.getByTestId('challenge-row-act1').textContent).toContain('Naveen');
    expect(screen.getAllByTestId(/^challenge-row-s\d$/)).toHaveLength(3);
    expect(card.textContent).not.toContain('No challenges yet');
    expect(screen.getByTestId('button-accept-challenge-in1').className).toContain('w-full');
    expect(screen.getByTestId('button-accept-challenge-in1').className).toContain('min-[400px]:w-auto');
  });

  it('Accept posts to /accept and refreshes; Decline posts to /decline', async () => {
    const fetchSpy = vi.fn(async (_u: unknown, init?: RequestInit) => init?.method === 'POST' ? json(200, view({ status: 'accepted' })) : json(200, { incoming: [], outgoing: [], active: [], settled: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    const { invalidate } = withClient(<ChallengesCard />, [[mineKey, { incoming: [view({ id: 'in1' })], outgoing: [], active: [], settled: [] }]]);
    fireEvent.click(screen.getByTestId('button-accept-challenge-in1'));
    await waitFor(() => expect(fetchSpy.mock.calls.some(c => String(c[0]).includes('/api/marketplace/challenges/in1/accept'))).toBe(true));
    await waitFor(() => expect(invalidate.mock.calls.some(c => JSON.stringify((c[0] as any)?.queryKey) === JSON.stringify(mineKey))).toBe(true));
  });

  it('source: no emoji in either component; both use brand tokens, no shadows', () => {
    for (const f of ['client/src/components/ChallengeButton.tsx', 'client/src/components/ChallengesCard.tsx']) {
      const s = read(f);
      expect(s, f).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(s, f).not.toMatch(/shadow-|boxShadow|gradient/);
      expect(s, f).not.toMatch(/#003E8C|#F5EFE0/i);
    }
  });
});

describe('C4 pins — pages + notifications', () => {
  it('PlayerPublicProfile renders ChallengeButton with the viewer\'s linked player id', () => {
    const p = read('client/src/pages/marketplace/PlayerPublicProfile.tsx');
    expect(p).toMatch(/import \{ ChallengeButton \} from '@\/components\/ChallengeButton'/);
    expect(p).toMatch(/<ChallengeButton playerId=\{stats\.player\.id\} playerName=\{stats\.player\.name\} viewerPlayerId=\{/);
    expect(p).toMatch(/useMarketplaceAuth\(\)/);
  });
  it('Profile renders ChallengesCard for linked players, after the referrals card', () => {
    const p = read('client/src/pages/marketplace/Profile.tsx');
    expect(p).toMatch(/import \{ ChallengesCard \} from '@\/components\/ChallengesCard'/);
    const ref = p.indexOf('card-my-referrals-link'), card = p.indexOf('<ChallengesCard'), inst = p.indexOf('card-install-app-profile');
    expect(ref).toBeGreaterThan(0); expect(card).toBeGreaterThan(ref); expect(inst).toBeGreaterThan(card);
  });
  it('notification list renders free-text title/message, so the three challenge_* types need no special case', () => {
    const nav = read('client/src/components/MarketplaceNav.tsx');
    expect(nav).toMatch(/\{n\.title\}/); expect(nav).toMatch(/\{n\.message\}/);
    expect(nav).not.toMatch(/n\.type ===/);
  });
});
