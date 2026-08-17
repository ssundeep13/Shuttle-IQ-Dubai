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
