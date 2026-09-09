// Feed Gate 3 — player search on the Community feed and Rankings pages.
//
// PlayerSearch (client/src/components/marketplace/PlayerSearch.tsx) is a
// debounced typeahead over the locked GET /api/marketplace/search-players:
// nothing is sent under two characters, one request per settled query, rows
// are PlayerLink anchors to the public profile with the tier DISPLAY label,
// "No players found." on an empty hit, "Sign in to search players" on 401,
// Escape / outside tap close. Both pages mount it above their filter chips.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PlayerSearch, useDebouncedValue, PLAYER_SEARCH_DEBOUNCE_MS, PLAYER_SEARCH_MIN_CHARS } from '../client/src/components/marketplace/PlayerSearch';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ZZ = { id: 'p-zz', name: 'ZZ-SANDBOX-GOODWILL Tester', shuttleIqId: null, level: 'upper_intermediate', skillScore: 50 };
const TP = { id: 'p-tp', name: 'TEST PLAYER', shuttleIqId: 'SIQ-00345', level: 'Beginner', skillScore: 67 };

let fetchSpy: ReturnType<typeof vi.fn>;
function stubSearch(responder: (q: string) => Response) {
  fetchSpy = vi.fn(async (u: unknown) => {
    const url = String(u);
    const q = new URL(url, 'http://x').searchParams.get('q') ?? '';
    return responder(q);
  });
  vi.stubGlobal('fetch', fetchSpy);
}
const requests = () => fetchSpy.mock.calls.map((c) => new URL(String(c[0]), 'http://x').searchParams.get('q'));

function renderSearch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><PlayerSearch /></QueryClientProvider>);
  return screen.getByTestId('input-player-search-players') as HTMLInputElement;
}
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const settle = () => act(() => { vi.advanceTimersByTime(PLAYER_SEARCH_DEBOUNCE_MS + 5); });

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useDebouncedValue', () => {
  it('only takes the new value after the delay, and the latest of a burst', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 'a' } });
    expect(result.current).toBe('a');
    rerender({ v: 'ab' });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ v: 'abc' });
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('a');            // 350ms since 'ab', but 'abc' reset the timer
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current).toBe('abc');
  });
});

describe('PlayerSearch — requests', () => {
  it('constants: 300ms debounce, 2-character minimum', () => {
    expect(PLAYER_SEARCH_DEBOUNCE_MS).toBe(300);
    expect(PLAYER_SEARCH_MIN_CHARS).toBe(2);
  });

  it('one character sends no request, even after the debounce', () => {
    stubSearch(() => json(200, []));
    const input = renderSearch();
    type(input, 'z');
    settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('player-search-results')).toBeNull();
  });

  it('two characters send exactly one request after 300ms; a burst of keystrokes collapses to the last value', async () => {
    stubSearch(() => json(200, [ZZ]));
    const input = renderSearch();
    type(input, 'z');
    act(() => { vi.advanceTimersByTime(80); });
    type(input, 'zz');
    act(() => { vi.advanceTimersByTime(80); });
    type(input, 'zz-');
    act(() => { vi.advanceTimersByTime(200); });
    expect(fetchSpy).not.toHaveBeenCalled();     // still inside the debounce of the last keystroke
    settle();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(requests()).toEqual(['zz-']);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/marketplace/search-players?q=zz-');
  });
});

describe('PlayerSearch — results', () => {
  it('rows are PlayerLink anchors to the profile with avatar initial, name and the tier DISPLAY label (never the enum)', async () => {
    stubSearch(() => json(200, [ZZ, TP]));
    const input = renderSearch();
    type(input, 'zz'); settle();
    const rows = await screen.findAllByTestId('player-search-result');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/marketplace/players/p-zz', '/marketplace/players/p-tp']);
    expect(rows[0].textContent).toContain('ZZ-SANDBOX-GOODWILL Tester');
    expect(rows[0].textContent).toContain('Competitive');
    expect(rows[1].textContent).toContain('Beginner');
    expect(rows[1].textContent).toContain('SIQ-00345');
    expect(document.body.textContent).not.toContain('upper_intermediate');
    expect(screen.getAllByTestId('player-search-avatar')[0].textContent).toBe('Z');
    expect(screen.getByTestId('player-search-results').getAttribute('role')).toBe('listbox');
  });

  it('empty hit → "No players found."', async () => {
    stubSearch(() => json(200, []));
    const input = renderSearch();
    type(input, 'qq'); settle();
    expect((await screen.findByTestId('player-search-empty')).textContent).toBe('No players found.');
    expect(screen.queryByTestId('player-search-result')).toBeNull();
  });

  it('401 → "Sign in to search players" linking to the player login with a return path', async () => {
    stubSearch(() => json(401, { error: 'No token provided' }));
    window.history.pushState({}, '', '/marketplace/rankings'); // wouter reads the return path from here
    const input = renderSearch();
    type(input, 'zz'); settle();
    const link = await screen.findByTestId('player-search-signin');
    expect(link.textContent).toBe('Sign in to search players');
    expect(link.getAttribute('href')).toMatch(/^\/marketplace\/login\?from=%2Fmarketplace%2F/);
    expect(screen.queryByTestId('player-search-empty')).toBeNull();
  });

  it('other failures say so without pretending the search was empty', async () => {
    stubSearch(() => json(500, { error: 'boom' }));
    const input = renderSearch();
    type(input, 'zz'); settle();
    expect((await screen.findByTestId('player-search-error')).textContent).toMatch(/Search failed/);
    expect(screen.queryByTestId('player-search-empty')).toBeNull();
  });
});

describe('PlayerSearch — closing', () => {
  it('Escape closes the list and keeps the typed text; typing again reopens it', async () => {
    stubSearch(() => json(200, [ZZ]));
    const input = renderSearch();
    type(input, 'zz'); settle();
    await screen.findByTestId('player-search-results');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('player-search-results')).toBeNull();
    expect(input.value).toBe('zz');
    type(input, 'zz ');
    settle();
    await screen.findByTestId('player-search-results');
  });

  it('a mousedown outside closes the list; one inside does not', async () => {
    stubSearch(() => json(200, [ZZ]));
    const input = renderSearch();
    type(input, 'zz'); settle();
    const list = await screen.findByTestId('player-search-results');
    fireEvent.mouseDown(list);
    expect(screen.getByTestId('player-search-results')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('player-search-results')).toBeNull();
  });
});

describe('Gate 3 pins — placement and brand', () => {
  it('FeedScreen mounts PlayerSearch between the Back link and the feed (whose chips are its first row)', () => {
    const f = read('client/src/pages/marketplace/FeedScreen.tsx');
    expect(f).toMatch(/import \{ PlayerSearch \} from '@\/components\/marketplace\/PlayerSearch'/);
    const back = f.indexOf('data-testid="button-back"'), search = f.indexOf('<PlayerSearch'), feed = f.indexOf('<CommunityFeed');
    expect(back).toBeGreaterThan(0); expect(search).toBeGreaterThan(back); expect(feed).toBeGreaterThan(search);
    expect(read('client/src/pages/marketplace/CommunityFeed.tsx')).not.toMatch(/PlayerSearch/);
  });
  it('Rankings mounts PlayerSearch after the title and above the first filter chip; data logic untouched', () => {
    const r = read('client/src/pages/marketplace/Rankings.tsx');
    expect(r).toMatch(/import \{ PlayerSearch \} from '@\/components\/marketplace\/PlayerSearch'/);
    const title = r.indexOf('data-testid="text-page-title"'), search = r.indexOf('<PlayerSearch'), chip = r.indexOf('data-testid={`filter-${f.value}`}');
    expect(title).toBeGreaterThan(0); expect(search).toBeGreaterThan(title); expect(chip).toBeGreaterThan(search);
    expect(r).toMatch(/queryKey: \['\/api\/players\/public'\]/);
  });
  it('PlayerSearch: placeholder, lucide Search glyph, PlayerLink rows, tier helper, MKT tokens only, no hex literals, no emoji', () => {
    const p = read('client/src/components/marketplace/PlayerSearch.tsx');
    expect(p).toMatch(/placeholder = 'Search players'/);
    expect(p).toMatch(/import \{ Search \} from 'lucide-react'/);
    expect(p).toMatch(/import \{ PlayerLink \} from '@\/components\/marketplace\/PlayerLink'/);
    expect(p).toMatch(/getTierDisplayName\(/);
    expect(p).toMatch(/\/api\/marketplace\/search-players\?q=/);
    expect(p).toMatch(/MKT\./);
    expect(p).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(p).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(p).not.toMatch(/boxShadow|shadow-(sm|md|lg)/);
  });
});
