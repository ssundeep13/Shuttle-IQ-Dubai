// Finance portal — the IQ Pass tab: nav position (owner-only), the one-word wordmark,
// summary strip, one row per pack newest first, holds collapsed, click-to-expand seats,
// filters (tier / status / purchase month) and CSV export of the current view.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const seatRow = (bookingId: string, date: string, state: string, venue = 'Smash Sports Academy') => ({
  bookingId, sessionId: `s-${bookingId}`, date, startTime: '20:00', venue, state,
  stateLabel: { upcoming: 'Upcoming', played: 'Played', moved: 'Moved', cancelled_credit: 'Cancelled · re-pick credit', held: 'Held', hold_lost: 'Hold lost' }[state] ?? state,
});
const packRow = (over: Record<string, unknown> = {}) => ({
  packId: 'pk-club', playerName: 'Aisha Khan', playerEmail: 'aisha@example.test', tier: 'club', tierLabel: 'Club', priceAed: 188,
  paidAt: '2026-09-14T14:02:04.000Z', paidAtDubai: '14 Sep 2026, 18:02', createdAt: '2026-09-14T14:01:39.000Z', purchaseMonth: '2026-09',
  ziinaRef: 'pi_club_1', gamesTotal: 4, gamesPicked: 4, gamesPlayed: 1, gamesRemaining: 3, repickCredits: 0,
  windowStart: '2026-09-14', windowEnd: '2026-10-11', firstGame: '2026-09-16', lastGame: '2026-09-30',
  status: 'active', statusLabel: 'Active', holdExpiresAt: null, holdExpiresDubai: null,
  jerseySize: null, jerseyHandedOverAt: null, jerseyOwed: false,
  seats: [seatRow('bk-1', '2026-09-16', 'played'), seatRow('bk-2', '2026-09-18', 'upcoming'), seatRow('bk-3', '2026-09-23', 'upcoming'), seatRow('bk-4', '2026-09-30', 'upcoming', 'Bright Riders School Dubai')],
  ...over,
});
const REPORT = {
  summary: { sold: 3, soldByTier: { club: 1, club_plus: 1, club_elite: 1 }, revenueAed: 1064, revenueAedByTier: { club: 188, club_plus: 360, club_elite: 516 },
    active: 2, completed: 0, expired: 1, pendingHolds: 1, cancelledHolds: 1, jerseysOwed: 1 },
  packs: [
    packRow({ packId: 'pk-elite', playerName: 'Mehek Contractor', tier: 'club_elite', tierLabel: 'Club Elite', priceAed: 516, paidAt: '2026-09-16T23:27:07.000Z', paidAtDubai: '17 Sep 2026, 03:27',
      ziinaRef: 'pi_elite_1', gamesTotal: 12, gamesPicked: 12, gamesPlayed: 0, gamesRemaining: 12, windowStart: '2026-09-17', windowEnd: '2026-10-14', firstGame: '2026-09-17', lastGame: '2026-10-13',
      jerseySize: 'M', jerseyOwed: true, seats: [seatRow('be-0', '2026-09-17', 'upcoming')] }),
    packRow(),
    packRow({ packId: 'pk-old', playerName: 'Old Timer', tier: 'club_plus', tierLabel: 'Club Plus', priceAed: 360, paidAt: '2026-07-01T08:00:00.000Z', paidAtDubai: '1 Jul 2026, 12:00', purchaseMonth: '2026-07',
      ziinaRef: 'pi_old', gamesTotal: 8, gamesPicked: 8, gamesPlayed: 8, gamesRemaining: 0, windowStart: '2026-07-01', windowEnd: '2026-07-28', firstGame: '2026-07-03', lastGame: '2026-07-22',
      status: 'expired', statusLabel: 'Expired', seats: [seatRow('bo-0', '2026-07-03', 'played'), seatRow('bo-1', '2026-07-05', 'moved')] }),
  ],
  holds: [
    packRow({ packId: 'pk-hold', playerName: 'Holding Player', tier: 'club_plus', tierLabel: 'Club Plus', priceAed: 360, paidAt: null, paidAtDubai: null, createdAt: '2026-09-17T07:25:00.000Z',
      createdAtDubai: '17 Sep 2026, 11:25', ziinaRef: 'pi_hold', gamesPicked: 8, gamesPlayed: 0, gamesRemaining: 8, status: 'pending_payment', statusLabel: 'Pending payment',
      holdExpiresAt: '2026-09-17T07:55:00.000Z', holdExpiresDubai: '17 Sep 2026, 11:55', seats: [seatRow('bh-0', '2026-09-18', 'held')] }),
    packRow({ packId: 'pk-lost', playerName: 'Lost Hold', paidAt: null, paidAtDubai: null, createdAt: '2026-09-14T14:46:16.000Z', ziinaRef: 'pi_lost',
      gamesPicked: 0, gamesPlayed: 0, gamesRemaining: 0, status: 'cancelled_hold', statusLabel: 'Cancelled hold', seats: [seatRow('bl-0', '2026-09-18', 'hold_lost')] }),
  ],
};

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = routes[path];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const { IqPassPage, iqPassCsv, applyIqPassFilters } = await import('../client/portal/IqPassPage');
const { PortalApp } = await import('../client/portal/App');

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('nav and wordmark', () => {
  it('the owner nav reads P&L · Weekly · Sessions · IQ Pass · Runner Pay …; a runner sees only Runner Pay', async () => {
    localStorage.setItem('siq_portal_token', 'owner-token');
    mockFetch({ '/api/portal/auth/me': { role: 'owner' }, '/api/portal/finance/pnl': { months: [] } });
    const { unmount } = render(<PortalApp />);
    await screen.findByRole('button', { name: 'IQ Pass' });
    const tabs = screen.getAllByRole('button').map((b) => b.textContent?.trim()).filter((t) => t && !['Password', 'Sign out'].includes(t));
    expect(tabs).toEqual(['P&L', 'Weekly', 'Sessions', 'IQ Pass', 'Runner Pay', 'Social Media Pay', 'Reconciliation', 'Growth', 'Expenses']);
    unmount();
    vi.unstubAllGlobals();
    mockFetch({ '/api/portal/auth/me': { role: 'runner' }, '/api/portal/finance/runner-pay': { weeks: [] } });
    render(<PortalApp />);
    await screen.findByRole('button', { name: 'Runner Pay' });
    expect(screen.queryByRole('button', { name: 'IQ Pass' })).toBeNull();
  });

  it('the header wordmark is one word: "Shuttle" and "IQ" inside one inline mark, no gap between them', async () => {
    localStorage.setItem('siq_portal_token', 'owner-token');
    mockFetch({ '/api/portal/auth/me': { role: 'owner' }, '/api/portal/finance/pnl': { months: [] } });
    const { container } = render(<PortalApp />);
    await screen.findByRole('button', { name: 'IQ Pass' });
    const mark = container.querySelector('.wordmark.small .mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('ShuttleIQ');
    expect(mark!.querySelector('.iq')?.textContent).toBe('IQ');
    expect(container.querySelector('.wordmark.small .topbar-sub')?.textContent).toBe('Finance');
  });

  it('the tab bar wraps instead of forcing the page wider than a phone (nine tabs now)', () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'client/portal/portal.css'), 'utf8');
    expect(css).toMatch(/\.tabs\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('the Ziina reference cell wraps (production refs are 36-char UUIDs) so the ten columns still fit at 1280', () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'client/portal/portal.css'), 'utf8');
    expect(css).toMatch(/td\.mono\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/td\.mono\s*\{[^}]*word-break:\s*break-all/);
    expect(css).toMatch(/td\.mono\s*\{[^}]*max-width:\s*\d+px/);
  });

  it('the IQ Pass tab renders in the full-width main', async () => {
    localStorage.setItem('siq_portal_token', 'owner-token');
    mockFetch({ '/api/portal/auth/me': { role: 'owner' }, '/api/portal/finance/pnl': { months: [] }, '/api/portal/iq-pass': REPORT });
    const { container } = render(<PortalApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'IQ Pass' }));
    await screen.findByTestId('strip-sold');
    expect(container.querySelector('main.content')).toHaveClass('full');
  });
});

describe('IqPassPage — strip, rows, holds', () => {
  it('summary strip: sold (with the tier split), revenue by tier, active / completed / expired, jerseys owed', async () => {
    mockFetch({ '/api/portal/iq-pass': REPORT });
    render(<IqPassPage token="t" onAuthFail={() => {}} />);
    expect(await screen.findByTestId('strip-sold')).toHaveTextContent(/3/);
    expect(screen.getByTestId('strip-sold')).toHaveTextContent(/Club 1 · Plus 1 · Elite 1/);
    expect(screen.getByTestId('strip-revenue')).toHaveTextContent(/1,064/);
    expect(screen.getByTestId('strip-revenue')).toHaveTextContent(/Club 188 · Plus 360 · Elite 516/);
    expect(screen.getByTestId('strip-active')).toHaveTextContent(/2/);
    expect(screen.getByTestId('strip-completed')).toHaveTextContent(/0/);
    expect(screen.getByTestId('strip-expired')).toHaveTextContent(/1/);
    expect(screen.getByTestId('strip-jerseys')).toHaveTextContent(/1/);
  });

  it('one row per paid pack, newest first, with the spec columns; holds sit in a collapsed section with the hold expiry', async () => {
    mockFetch({ '/api/portal/iq-pass': REPORT });
    render(<IqPassPage token="t" onAuthFail={() => {}} />);
    await screen.findByTestId('row-pack-pk-elite');
    const main = screen.getByTestId('table-packs');
    expect(within(main).getAllByTestId(/^row-pack-/).map((r) => r.getAttribute('data-testid'))).toEqual(['row-pack-pk-elite', 'row-pack-pk-club', 'row-pack-pk-old']);
    const elite = screen.getByTestId('row-pack-pk-elite');
    expect(elite).toHaveTextContent('Mehek Contractor');
    expect(elite).toHaveTextContent('Club Elite');
    expect(elite).toHaveTextContent('516');
    expect(elite).toHaveTextContent('17 Sep 2026, 03:27');
    expect(elite).toHaveTextContent('pi_elite_1');
    expect(elite).toHaveTextContent(/12 picked/);
    expect(elite).toHaveTextContent(/0 played/);
    expect(elite).toHaveTextContent(/12 remaining/);
    expect(elite).toHaveTextContent(/17 Sep – 13 Oct/);
    expect(elite).toHaveTextContent('Active');
    expect(elite).toHaveTextContent(/M · owed/);
    expect(screen.getByTestId('row-pack-pk-club')).toHaveTextContent('—'); // no jersey for Club
    const holds = screen.getByTestId('details-holds');
    expect(holds.tagName).toBe('DETAILS');
    expect(holds).not.toHaveAttribute('open');
    expect(holds).toHaveTextContent(/Holds \(2\)/);
    expect(within(holds).getByTestId('row-hold-pk-hold')).toHaveTextContent('Pending payment');
    expect(within(holds).getByTestId('row-hold-pk-hold')).toHaveTextContent(/expires 17 Sep 2026, 11:55/);
    expect(within(holds).getByTestId('row-hold-pk-hold')).toHaveTextContent('17 Sep 2026, 11:25'); // started, Dubai time
    expect(within(holds).getByTestId('row-hold-pk-lost')).toHaveTextContent('Cancelled hold');
    expect(within(main).queryByTestId('row-pack-pk-hold')).toBeNull();
  });

  it('clicking a row expands its picked sessions (date, venue, state) and clicking again collapses', async () => {
    mockFetch({ '/api/portal/iq-pass': REPORT });
    render(<IqPassPage token="t" onAuthFail={() => {}} />);
    const row = await screen.findByTestId('row-pack-pk-club');
    expect(screen.queryByTestId('seats-pk-club')).toBeNull();
    fireEvent.click(row);
    const seats = screen.getByTestId('seats-pk-club');
    expect(seats).toHaveTextContent('Wed 16 Sep');
    expect(seats).toHaveTextContent('Played');
    expect(seats).toHaveTextContent('Bright Riders School Dubai');
    expect(within(seats).getAllByText('Upcoming')).toHaveLength(3);
    fireEvent.click(row);
    expect(screen.queryByTestId('seats-pk-club')).toBeNull();
    fireEvent.click(screen.getByTestId('row-pack-pk-old'));
    expect(screen.getByTestId('seats-pk-old')).toHaveTextContent('Moved');
  });
});

describe('IqPassPage — filters and CSV', () => {
  it('tier, status and purchase-month filters narrow the rows (and the holds)', async () => {
    mockFetch({ '/api/portal/iq-pass': REPORT });
    render(<IqPassPage token="t" onAuthFail={() => {}} />);
    await screen.findByTestId('row-pack-pk-elite');
    fireEvent.change(screen.getByTestId('select-tier'), { target: { value: 'club_plus' } });
    expect(screen.getAllByTestId(/^row-pack-/).map((r) => r.getAttribute('data-testid'))).toEqual(['row-pack-pk-old']);
    expect(screen.getByTestId('details-holds')).toHaveTextContent(/Holds \(1\)/);
    fireEvent.change(screen.getByTestId('select-tier'), { target: { value: 'all' } });
    fireEvent.change(screen.getByTestId('select-status'), { target: { value: 'active' } });
    expect(screen.getAllByTestId(/^row-pack-/).map((r) => r.getAttribute('data-testid'))).toEqual(['row-pack-pk-elite', 'row-pack-pk-club']);
    fireEvent.change(screen.getByTestId('select-status'), { target: { value: 'all' } });
    fireEvent.change(screen.getByTestId('select-month'), { target: { value: '2026-07' } });
    expect(screen.getAllByTestId(/^row-pack-/).map((r) => r.getAttribute('data-testid'))).toEqual(['row-pack-pk-old']);
    expect(screen.getByTestId('text-view-count')).toHaveTextContent(/1 of 3 passes/);
  });

  it('applyIqPassFilters is pure and composes the three filters', () => {
    const all = { tier: 'all', status: 'all', month: 'all' };
    expect(applyIqPassFilters(REPORT.packs, all).map((p) => p.packId)).toEqual(['pk-elite', 'pk-club', 'pk-old']);
    expect(applyIqPassFilters(REPORT.packs, { ...all, tier: 'club' }).map((p) => p.packId)).toEqual(['pk-club']);
    expect(applyIqPassFilters(REPORT.packs, { ...all, status: 'expired' }).map((p) => p.packId)).toEqual(['pk-old']);
    expect(applyIqPassFilters(REPORT.packs, { ...all, month: '2026-09', status: 'active' }).map((p) => p.packId)).toEqual(['pk-elite', 'pk-club']);
  });

  it('iqPassCsv: a header row and one quoted line per pack in the current view', () => {
    const csv = iqPassCsv([REPORT.packs[0], REPORT.holds[0]]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Player,Email,Tier,Price AED,Paid at (Dubai),Ziina ref,Games total,Picked,Played,Remaining,Re-pick credits,Window start,Window end,First game,Last game,Status,Jersey size,Jersey handed over,Hold expires (Dubai)');
    expect(lines[1]).toBe('"Mehek Contractor","aisha@example.test","Club Elite",516,"17 Sep 2026, 03:27","pi_elite_1",12,12,0,12,0,"2026-09-17","2026-10-14","2026-09-17","2026-10-13","Active","M","",""');
    expect(lines[2]).toBe('"Holding Player","aisha@example.test","Club Plus",360,"","pi_hold",4,8,0,8,0,"2026-09-14","2026-10-11","2026-09-16","2026-09-30","Pending payment","","","17 Sep 2026, 11:55"');
    expect(lines).toHaveLength(3);
  });

  it('Export CSV downloads the current view (filters applied, holds included) as a text/csv blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:csv');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
    // jsdom cannot navigate to a blob: URL; capture the anchor's download name instead of letting it "click".
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    mockFetch({ '/api/portal/iq-pass': REPORT });
    render(<IqPassPage token="t" onAuthFail={() => {}} />);
    await screen.findByTestId('row-pack-pk-elite');
    fireEvent.change(screen.getByTestId('select-tier'), { target: { value: 'club_plus' } });
    fireEvent.click(screen.getByTestId('button-export-csv'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual([expect.stringMatching(/^iq-pass-\d{4}-\d{2}-\d{2}\.csv$/)]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    click.mockRestore();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toMatch(/text\/csv/);
    // jsdom's Blob has no .text(); FileReader is the supported way to read it back.
    const text = await new Promise<string>((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.readAsText(blob); });
    expect(text.split('\n')).toHaveLength(3); // header + Old Timer (paid) + Holding Player (hold), both Club Plus
    expect(text).toContain('"Old Timer"');
    expect(text).toContain('"Holding Player"');
    expect(text).not.toContain('Mehek');
  });
});
