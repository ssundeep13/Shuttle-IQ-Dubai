// Finance portal — the monthly P&L fits its ten columns at 1280 (full-width card,
// tighter cells, shorter headers), every scrolling table shows a persistent
// scrollbar plus a fade on the clipped edge, the IQ Pass split is visible text
// under each month instead of a hover tooltip, and the Sessions tab carries an
// IQ Pass card per session (pass seats + their allocation).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

const month = (m: string, over: Record<string, unknown> = {}) => ({
  month: m, collectedRevenueAed: 21_939, sessionCostsAed: 11_820, generalExpensesAed: 0, netProfitAed: 10_119,
  runnerPayAed: 2_499, socialMediaPayAed: 1_537.95, managementProfitAed: 6_082.05, walletPaidAed: 492,
  iqPassRevenueAed: 0, iqPassByTierAed: { club: 0, club_plus: 0, club_elite: 0 }, ...over,
});
const PNL = { months: [
  month('2026-08'),
  month('2026-09', { collectedRevenueAed: 17_916, iqPassRevenueAed: 1_988, iqPassByTierAed: { club: 752, club_plus: 720, club_elite: 516 } }),
] };
const SESSIONS = { sessions: [
  { sessionId: 's1', date: '2026-09-16', venue: 'Smash', captain: 'Preetham', collectedAed: 500, walletPaidAed: 0, courtAed: 300, shuttleAed: 40, waterAed: 10, profitAed: 150, iqPassSeats: 2, iqPassAed: 94 },
  { sessionId: 's2', date: '2026-09-15', venue: 'Bright Riders', captain: 'Unassigned', collectedAed: 400, walletPaidAed: 49, courtAed: 300, shuttleAed: 40, waterAed: 10, profitAed: 50, iqPassSeats: 0, iqPassAed: 0 },
  { sessionId: 's3', date: '2026-09-14', venue: 'Smash', captain: 'Preetham', collectedAed: 300, walletPaidAed: 0, courtAed: 300, shuttleAed: 40, waterAed: 10, profitAed: 0, iqPassSeats: 1, iqPassAed: 47 },
] };

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

// jsdom has no layout: give every element a pretend scroll geometry for the cue tests.
function stubGeometry(scrollWidth: number, clientWidth: number) {
  let left = 0;
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v; } });
}
function restoreGeometry() {
  for (const k of ['scrollWidth', 'clientWidth', 'scrollLeft']) delete (HTMLElement.prototype as any)[k];
}

const { PnlPage, SessionsPage, TableWrap } = await import('../client/portal/pages');
const { PortalApp } = await import('../client/portal/App');

afterEach(() => { vi.unstubAllGlobals(); restoreGeometry(); localStorage.clear(); });

describe('P&L — ten columns that fit', () => {
  it('the table is the pnl variant with the shortened header set, in order', async () => {
    mockFetch({ '/api/portal/finance/pnl': PNL });
    const { container } = render(<PnlPage token="t" onAuthFail={() => {}} />);
    await screen.findByText('IQ Pass (info)');
    expect(container.querySelector('table.pnl')).not.toBeNull();
    // the minus signs are joined to their words with a no-break space so a wrapped header never strands the sign
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.replace(/ /g, ' ').trim())).toEqual([
      'Month', 'Collected', 'Session costs', 'Expenses', 'Net profit', '− Runner pay', '− Social 15%', 'Management profit', 'Wallet (info)', 'IQ Pass (info)',
    ]);
  });

  it('the IQ Pass cell shows the total as plain text — no hover tooltip — and a caption row under each month spells the tiers', async () => {
    mockFetch({ '/api/portal/finance/pnl': PNL });
    render(<PnlPage token="t" onAuthFail={() => {}} />);
    const cell = await screen.findByTestId('cell-iqpass-2026-09');
    expect(cell).toHaveTextContent('1,988');
    expect(cell.getAttribute('title')).toBeNull();
    expect(screen.getByTestId('text-iqpass-tiers-2026-09')).toHaveTextContent('Club 752 · Plus 720 · Elite 516');
    expect(screen.getByTestId('text-iqpass-tiers-2026-08')).toHaveTextContent('Club 0 · Plus 0 · Elite 0');
    expect(screen.getByText(/IQ Pass sales are informational/).textContent).not.toMatch(/hover/i);
  });

  it('the P&L tab renders in a full-width main; the other tabs keep the 1080 column', async () => {
    localStorage.setItem('siq_portal_token', 'owner-token');
    mockFetch({ '/api/portal/auth/me': { role: 'owner' }, '/api/portal/finance/pnl': PNL, '/api/portal/finance/weekly': { weeks: [] } });
    const { container } = render(<PortalApp />);
    await screen.findByText('IQ Pass (info)');
    expect(container.querySelector('main.content')).toHaveClass('full');
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));
    await screen.findByText(/ISO weeks/);
    expect(container.querySelector('main.content')).not.toHaveClass('full');
  });
});

describe('TableWrap — persistent scroll cue on every scrolling table', () => {
  it('a clipped table is marked clip-right; scrolled to the end it is marked clip-left only', () => {
    stubGeometry(1_574, 990);
    const { container } = render(<TableWrap><table><tbody><tr><td>x</td></tr></tbody></table></TableWrap>);
    const shell = container.querySelector('.tablewrap-shell')!;
    const inner = container.querySelector('.tablewrap')!;
    expect(shell).toHaveClass('clip-right');
    expect(shell).not.toHaveClass('clip-left');
    act(() => { (inner as HTMLElement).scrollLeft = 584; fireEvent.scroll(inner); });
    expect(shell).toHaveClass('clip-left');
    expect(shell).not.toHaveClass('clip-right');
  });

  it('a table that fits gets neither mark', () => {
    stubGeometry(900, 990);
    const { container } = render(<TableWrap><table><tbody><tr><td>x</td></tr></tbody></table></TableWrap>);
    const shell = container.querySelector('.tablewrap-shell')!;
    expect(shell).not.toHaveClass('clip-right');
    expect(shell).not.toHaveClass('clip-left');
  });

  it('every table in the portal pages goes through TableWrap (no bare tablewrap div left)', () => {
    for (const f of ['client/portal/pages.tsx', 'client/portal/ReconcilePage.tsx', 'client/portal/ExpensesPage.tsx', 'client/portal/GrowthPage.tsx']) {
      expect(read(f), f).not.toMatch(/<div className="tablewrap">/); // TableWrap's own inner div carries a ref, never bare
    }
  });
});

describe('Sessions — IQ Pass card per session', () => {
  it('shows the pass seats and their allocation per session, a dash when none, and a footer total', async () => {
    mockFetch({ '/api/portal/finance/sessions': SESSIONS });
    render(<SessionsPage token="t" onAuthFail={() => {}} />);
    await screen.findByText('IQ Pass');
    expect(screen.getByTestId('iqpass-session-s1')).toHaveTextContent(/2 seats/);
    expect(screen.getByTestId('iqpass-session-s1')).toHaveTextContent(/94/);
    expect(screen.getByTestId('iqpass-session-s3')).toHaveTextContent(/1 seat(?!s)/);
    expect(screen.getByTestId('iqpass-session-s2')).toHaveTextContent('—');
    expect(screen.getByTestId('iqpass-total')).toHaveTextContent(/3 seats/);
    expect(screen.getByTestId('iqpass-total')).toHaveTextContent(/141/);
    expect(screen.getByText(/runner pay/i).textContent).toMatch(/IQ Pass/);
  });
});

describe('portal.css — the layout rules jsdom cannot exercise (Playwright proves the rendering)', () => {
  const css = read('client/portal/portal.css');
  it('full-width main, wrapping pnl headers with tighter cells, persistent scrollbar, edge fade', () => {
    expect(css).toMatch(/\.content\.full\s*\{[^}]*max-width:\s*none/);
    expect(css).toMatch(/table\.pnl th\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/table\.pnl th,\s*table\.pnl td\s*\{[^}]*padding:\s*[0-9]+px 8px/);
    expect(css).toMatch(/\.tablewrap::-webkit-scrollbar\s*\{/);
    expect(css).toMatch(/\.tablewrap\s*\{[^}]*scrollbar-width:\s*thin/);
    expect(css).toMatch(/\.tablewrap-shell\.clip-right::after\s*\{/);
    expect(css).toMatch(/\.tablewrap-shell\.clip-left::before\s*\{/);
  });
});
