// The stop-series confirm dialog. Rendered for real (jsdom) so the copy the
// admin reads is asserted, not paraphrased — this is the screen that decides
// whether someone deletes sessions players have paid for.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionSeriesList } from '../client/src/components/SessionSeriesList';

const SERIES = {
  id: 'series-1',
  venueName: 'Smash Sports Academy',
  weekday: 'Tuesday',
  startTime: '20:00',
  endTime: '22:00',
  originDate: '2026-08-18',
  weeksAhead: 4,
  totalSessions: 5,
  draftCount: 1,
  upcomingCount: 4,
  otherCount: 0,
  bookedSessions: 1,
  stoppedAt: null,
};

const PLAN = {
  remove: [
    { opsId: 'o2', bookableId: 'b2', dateIso: '2026-08-25', bookingCount: 0 },
    { opsId: 'o4', bookableId: 'b4', dateIso: '2026-09-08', bookingCount: 0 },
    { opsId: 'o5', bookableId: 'b5', dateIso: '2026-09-15', bookingCount: 0 },
  ],
  keep: [
    { opsId: 'o1', bookableId: 'b1', dateIso: '2026-08-18', bookingCount: 0, reason: 'is_origin' },
    { opsId: 'o3', bookableId: 'b3', dateIso: '2026-09-01', bookingCount: 1, reason: 'has_bookings' },
  ],
};

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['/api/sessions/series'], [SERIES]);
  qc.setQueryData(['/api/sessions/series', 'series-1', 'stop-preview'], PLAN);
  return render(
    <QueryClientProvider client={qc}>
      <SessionSeriesList />
    </QueryClientProvider>,
  );
}

describe('series list card', () => {
  it('counts the origin in with the generated weeks, showing the split', () => {
    renderList();
    expect(screen.getByTestId('text-series-count-series-1').textContent)
      .toBe('5 sessions (1 draft + 4 upcoming)');
    expect(screen.getByText('Every Tuesday')).toBeTruthy();
  });
});

describe('stop-series confirm dialog copy', () => {
  it('states plainly what goes and what stays, and why each stays', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('button-stop-series-series-1'));

    await waitFor(() => expect(screen.getByTestId('dialog-stop-series')).toBeTruthy());
    const dialog = screen.getByTestId('dialog-stop-series');

    // Print the rendered copy so it can be reviewed as text, not as JSX.
    console.log('\n----- STOP-SERIES DIALOG (as rendered) -----\n' +
      (dialog.textContent ?? '').replace(/(No more sessions|These 3|These 2|Stopping ends|Keep it running)/g, '\n$1') +
      '\n-------------------------------------------\n');

    expect(screen.getByText('Stop this repeating session?')).toBeTruthy();
    expect(dialog.textContent).toContain('No more sessions will be created for this series.');
    expect(screen.getByTestId('text-stop-removed').textContent).toBe('25 Aug, 8 Sep, 15 Sep');
    expect(screen.getByTestId('text-stop-kept').textContent)
      .toBe('18 Aug — the session you created, 1 Sep — 1 booking');
    expect(dialog.textContent).toContain('Sessions players have booked stay');
    expect(screen.getByText('Keep it running')).toBeTruthy();
  });

  it('never labels a kept session as removed', () => {
    renderList();
    fireEvent.click(screen.getByTestId('button-stop-series-series-1'));
    const removed = screen.getByTestId('text-stop-removed').textContent ?? '';
    for (const keptDate of ['18 Aug', '1 Sep']) expect(removed).not.toContain(keptDate);
  });
});

// ── Extend series + "ends" / "stopped" meta (tests 14–18) ────────────────────
import { vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MONDAYS = {
  ...SERIES, id: 'series-m', weekday: 'Monday', originDate: '2026-08-24',
  draftCount: 0, upcomingCount: 3, otherCount: 2, bookedSessions: 2,
  stoppedAt: null, endsDate: '2026-09-21', stoppedDate: null,
};
const STOPPED = {
  ...MONDAYS, id: 'series-s', venueName: 'Fire Rallies Sports Academy LLC', weekday: 'Saturday',
  originDate: '2026-08-29', stoppedAt: '2026-09-05T04:00:00.000Z', endsDate: '2026-09-12', stoppedDate: '2026-09-05',
};

function renderWith(running: any[], all?: any[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['/api/sessions/series'], running);
  if (all) qc.setQueryData(['/api/sessions/series', 'all'], all);
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}><SessionSeriesList /></QueryClientProvider>);
  return { qc, invalidate };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('series card — ends / stopped meta and the extend control', () => {
  it('14. a running card reads "ends <last date>" and offers "Add 4 more Mondays" beside Stop; a stopped card is muted with neither', () => {
    renderWith([MONDAYS], [MONDAYS, STOPPED]);
    const card = screen.getByTestId('card-series-series-m');
    expect(card.textContent).toContain('started 24 Aug');
    expect(screen.getByTestId('text-series-ends-series-m').textContent).toBe('ends 21 Sep');
    expect(screen.getByTestId('button-extend-series-series-m').textContent).toBe('Add 4 more Mondays');
    expect(screen.getByTestId('button-stop-series-series-m')).toBeTruthy();
    expect(screen.queryByTestId('card-series-series-s')).toBeNull(); // hidden by default

    fireEvent.click(screen.getByTestId('switch-show-stopped-series'));
    const stopped = screen.getByTestId('card-series-series-s');
    expect(stopped.className).toContain('opacity-60');
    expect(screen.getByTestId('text-series-stopped-series-s').textContent).toBe('stopped 5 Sep');
    expect(stopped.textContent).toContain('Stopped');
    expect(screen.queryByTestId('button-extend-series-series-s')).toBeNull();
    expect(screen.queryByTestId('button-stop-series-series-s')).toBeNull();
    expect(screen.queryByTestId('text-series-ends-series-s')).toBeNull();
  });

  it('15. the toggle is off by default (no includeStopped request); on, it asks for ?includeStopped=true', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, [MONDAYS, STOPPED]));
    vi.stubGlobal('fetch', fetchSpy);
    renderWith([MONDAYS]);
    // react-query may background-refetch the seeded default key on mount —
    // what matters is that NO request carries includeStopped before the toggle.
    await new Promise((r) => setTimeout(r, 20));
    const urlsBefore = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urlsBefore.some((u) => u.includes('includeStopped'))).toBe(false);
    fireEvent.click(screen.getByTestId('switch-show-stopped-series'));
    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('/api/sessions/series?includeStopped=true'))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('card-series-series-s')).toBeTruthy());
  });

  it('16. the extend dialog defaults to 4, previews the exact dates, and follows the chosen count', () => {
    renderWith([MONDAYS]);
    fireEvent.click(screen.getByTestId('button-extend-series-series-m'));
    const dialog = screen.getByTestId('dialog-extend-series');
    expect(dialog.textContent).toContain('Add more Mondays');
    expect(screen.getByTestId('chip-extend-weeks-4').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('text-extend-preview-series-m').textContent).toBe('Creates: 28 Sep, 5 Oct, 12 Oct, 19 Oct');
    expect(dialog.textContent).toContain('Adds 4 sessions to this series. Nothing existing changes.');
    expect(screen.getByTestId('button-confirm-extend-series').textContent).toBe('Add 4 sessions');

    fireEvent.click(screen.getByTestId('chip-extend-weeks-2'));
    expect(screen.getByTestId('chip-extend-weeks-2').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('chip-extend-weeks-4').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('text-extend-preview-series-m').textContent).toBe('Creates: 28 Sep, 5 Oct');
    expect(dialog.textContent).toContain('Adds 2 sessions to this series. Nothing existing changes.');
    expect(screen.getByTestId('button-confirm-extend-series').textContent).toBe('Add 2 sessions');
    for (let n = 1; n <= 8; n++) expect(screen.getByTestId(`chip-extend-weeks-${n}`)).toBeTruthy();
    expect(screen.queryByTestId('chip-extend-weeks-9')).toBeNull();
  });

  it('17. confirm posts { weeks } to the extend route; success refreshes series + sessions and closes; a 409 is shown inline', async () => {
    // Method-aware: the POST gets the extend result; the GET refetch that the
    // success invalidation triggers must keep returning the list.
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse(201, { seriesId: 'series-m', added: 4, dates: [], endsDate: '2026-10-19', costsCopied: true, note: null })
      : jsonResponse(200, [MONDAYS]));
    vi.stubGlobal('fetch', fetchSpy);
    const { invalidate } = renderWith([MONDAYS]);
    fireEvent.click(screen.getByTestId('button-extend-series-series-m'));
    fireEvent.click(screen.getByTestId('button-confirm-extend-series'));

    await waitFor(() => expect(fetchSpy.mock.calls.some((c) => (c[1] as any)?.method === 'POST')).toBe(true));
    const [url, init] = fetchSpy.mock.calls.find((c) => (c[1] as any)?.method === 'POST') as any[];
    expect(String(url)).toContain('/api/sessions/series/series-m/extend');
    expect(JSON.parse(init.body)).toEqual({ weeks: 4 });
    await waitFor(() => expect(screen.queryByTestId('dialog-extend-series')).toBeNull());
    const keys = invalidate.mock.calls.map(c => JSON.stringify((c[0] as any)?.queryKey));
    expect(keys).toContain(JSON.stringify(['/api/sessions/series']));
    expect(keys).toContain(JSON.stringify(['/api/sessions']));

    // 409 path — a stopped series
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse(409, { error: 'This series is stopped. Start a new series instead.' })
      : jsonResponse(200, [MONDAYS])));
    fireEvent.click(screen.getByTestId('button-extend-series-series-m'));
    fireEvent.click(screen.getByTestId('button-confirm-extend-series'));
    await waitFor(() => expect(screen.getByTestId('text-extend-error').textContent).toContain('This series is stopped. Start a new series instead.'));
    expect(screen.getByTestId('dialog-extend-series')).toBeTruthy();
  });

  it('18. source: no emoji, no drop shadows, no gradients, no hex literals in the list component', () => {
    const src = readFileSync(join(__dirname, '..', 'client/src/components/SessionSeriesList.tsx'), 'utf8');
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/shadow-/);
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src).toMatch(/extensionDates\(/);
    expect(src).toMatch(/seriesEndLabel\(/);
  });
});
