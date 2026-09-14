// IQ Pass Gate 10 — My Bookings redesign. Default view = the shared calendar in read mode
// (one dot per booked session, coloured by venue; tap a day for its cards), list view behind a
// toggle, an IQ Pass strip (tier · played/total · teal progress) linking to the pass page,
// compact pass-seat cards (venue, time, Move, "Moves close in Xh"), drop-in cards untouched,
// past sessions as one line with the result, empty state linking to IQ Pass.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';

const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock('../client/src/hooks/useIqPass', () => ({ useIqPassEnabled: () => flagMock.enabled, useIqPassTiers: () => ({}) }));
vi.mock('../client/src/lib/nativeAuth', () => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
// Reveal (framer-motion whileInView) has no IntersectionObserver in jsdom — reduced motion renders plain divs.
vi.mock('framer-motion', async (orig) => ({ ...(await orig<typeof import('framer-motion')>()), useReducedMotion: () => true }));

const { default: MyBookings } = await import('../client/src/pages/marketplace/MyBookings');
const { venueColour } = await import('../client/src/components/marketplace/IqPassCalendar');
const { sessionStartEpochMs } = await import('../shared/sessionTime');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const H = 3_600_000; const D = 24 * H;
const dubaiYmd = (ms: number) => new Date(ms + 4 * H).toISOString().slice(0, 10);
const monthLabelOf = (ymd: string) => { const [y, m] = ymd.split('-').map(Number); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`; };
const now = Date.now();
const today = dubaiYmd(now);
const upDay = dubaiYmd(now + 3 * D);
const upDay2 = dubaiYmd(now + 4 * D);
const pastDay = dubaiYmd(now - 3 * D);
const pastDay2 = dubaiYmd(now - 2 * D);
const session = (id: string, ymd: string, venueName: string) => ({ id, title: `${venueName} Session`, venueName, venueLocation: null, date: `${ymd}T00:00:00.000Z`, startTime: '20:00', endTime: '22:00', capacity: 18, priceAed: 49, status: 'upcoming', courtCount: 3 });
const booking = (id: string, over: Record<string, unknown>) => ({
  id, userId: 'u-1', sessionId: `sess-${id}`, status: 'confirmed', paymentMethod: 'ziina', amountAed: 49, cashPaid: false, spotsBooked: 1, waitlistPosition: null,
  createdAt: new Date(now - 5 * D).toISOString(), promotedAt: null, packId: null, walletAmountUsed: 0, ziinaPaymentIntentId: null, guests: [], isGuestBooking: false, totalPaidAed: 49,
  ...over,
});
const SMASH = 'Smash Sports Academy'; const BRIGHT = 'Bright Riders School Dubai';
const bookings = [
  booking('b-pass-1', { packId: 'pk-1', paymentMethod: 'iq_pass', amountAed: 47, totalPaidAed: 47, session: session('s-up', upDay, SMASH), sessionId: 's-up' }),
  booking('b-pass-past', { packId: 'pk-1', paymentMethod: 'iq_pass', amountAed: 47, status: 'attended', session: session('s-past', pastDay, SMASH), sessionId: 's-past' }),
  booking('b-drop', { session: session('s-up2', upDay2, BRIGHT), sessionId: 's-up2' }),
  booking('b-cancelled', { status: 'cancelled', session: session('s-past2', pastDay2, BRIGHT), sessionId: 's-past2' }),
];
const cutoffMs = sessionStartEpochMs(`${upDay}T00:00:00.000Z`, '20:00') - 5 * H;
const packs = [{
  id: 'pk-1', tier: 'club', label: 'Club', status: 'active', gamesTotal: 4, repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, paidAt: new Date(now - 5 * D).toISOString(), holdExpiresAt: new Date(now - 5 * D).toISOString(), lastGameDate: upDay,
  seats: [
    { bookingId: 'b-pass-past', sessionId: 's-past', status: 'confirmed', session: { title: 'Smash Session', venueName: SMASH, date: `${pastDay}T00:00:00.000Z`, startTime: '20:00', endTime: '22:00' }, canMoveUntil: new Date(sessionStartEpochMs(`${pastDay}T00:00:00.000Z`, '20:00') - 5 * H).toISOString(), canMove: false },
    { bookingId: 'b-pass-1', sessionId: 's-up', status: 'confirmed', session: { title: 'Smash Session', venueName: SMASH, date: `${upDay}T00:00:00.000Z`, startTime: '20:00', endTime: '22:00' }, canMoveUntil: new Date(cutoffMs).toISOString(), canMove: true },
  ],
}];

let handlers: Record<string, () => unknown>;
const mount = () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k));
    return key ? { ok: true, status: 200, json: async () => handlers[key](), text: async () => JSON.stringify(handlers[key]()) } : { ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => 'Not found' };
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join('/'))).json() } } });
  return render(<QueryClientProvider client={qc}><MyBookings /></QueryClientProvider>);
};
const showMonthOf = (ymd: string) => {
  for (let i = 0; i < 3 && screen.getByTestId('text-month-label').textContent !== monthLabelOf(ymd); i++) fireEvent.click(screen.getByTestId('button-month-next'));
  expect(screen.getByTestId('text-month-label').textContent).toBe(monthLabelOf(ymd));
};

describe('MyBookings — calendar by default, IQ Pass strip, list toggle', () => {
  beforeEach(() => {
    flagMock.enabled = true;
    handlers = { '/api/marketplace/bookings/mine': () => bookings, '/api/marketplace/me/wallet': () => ({ walletBalance: 0 }), '/api/marketplace/iq-pass/me': () => ({ packs }) };
  });
  afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear(); } catch {} });

  it('opens on the month calendar with the IQ Pass strip (tier · played/total · teal bar → pass page); "List" shows the sections', async () => {
    mount();
    const strip = await screen.findByTestId('strip-iq-pass');
    expect(strip.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(strip.textContent).toMatch(/Club · 1\/4 played/);
    expect((screen.getByTestId('bar-iq-pass-progress') as HTMLElement).style.width).toBe('25%');
    expect(screen.getByTestId('bookings-calendar')).toBeTruthy();
    expect(screen.getByTestId('text-month-label').textContent).toBe(monthLabelOf(today));
    expect(screen.getByTestId('button-view-calendar').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('text-iqpass-title')).toBeNull();
    fireEvent.click(screen.getByTestId('button-view-list'));
    expect(screen.queryByTestId('bookings-calendar')).toBeNull();
    expect(screen.getByTestId('text-iqpass-title')).toBeTruthy();
    expect(screen.getByTestId('card-pass-seat-b-pass-1')).toBeTruthy();
    expect(screen.getByTestId('card-booking-b-drop')).toBeTruthy(); // drop-in card unchanged
    expect(screen.getByTestId('strip-iq-pass')).toBeTruthy(); // the strip stays above both views
    fireEvent.click(screen.getByTestId('button-view-calendar'));
    expect(screen.getByTestId('bookings-calendar')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/per game|saving/i);
  });

  it('one dot per booked session coloured by venue; tapping a day opens its cards (pass seat: venue, time, Move, "Moves close in Xh"; drop-in: the existing card)', async () => {
    mount();
    await screen.findByTestId('bookings-calendar');
    showMonthOf(upDay);
    const dotPass = screen.getByTestId('dot-b-pass-1') as HTMLElement;
    const dotDrop = screen.getByTestId('dot-b-drop') as HTMLElement;
    const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    expect(dotPass.style.backgroundColor).toBe(rgb(venueColour(SMASH)));
    expect(dotDrop.style.backgroundColor).toBe(rgb(venueColour(BRIGHT)));
    expect(dotPass.style.backgroundColor).not.toBe(dotDrop.style.backgroundColor);
    expect(screen.queryByTestId('dot-b-cancelled')).toBeNull(); // cancelled bookings carry no dot
    expect(screen.getByTestId('legend-iqp-calendar').textContent).toMatch(/Smash/);
    fireEvent.click(screen.getByTestId(`day-${upDay}`));
    const panel = screen.getByTestId('day-panel');
    const card = within(panel).getByTestId('card-pass-seat-b-pass-1');
    expect(card.textContent).toMatch(/Smash Sports Academy/);
    expect(card.textContent).toMatch(/20:00/);
    expect(card.textContent).toMatch(/IQ Pass · Club/);
    expect(within(card).getByTestId('button-move-b-pass-1')).toBeTruthy();
    const win = within(card).getByTestId('text-move-window-b-pass-1').textContent ?? '';
    const m = win.match(/Moves close in (\d+)h/); expect(m, win).toBeTruthy();
    const expected = Math.ceil((cutoffMs - Date.now()) / H);
    expect(Math.abs(Number(m![1]) - expected)).toBeLessThanOrEqual(1);
    expect(within(panel).queryByTestId('card-booking-b-pass-1')).toBeNull(); // no drop-in card for a pass seat
    showMonthOf(upDay2);
    fireEvent.click(screen.getByTestId(`day-${upDay2}`));
    expect(within(screen.getByTestId('day-panel')).getByTestId('card-booking-b-drop')).toBeTruthy();
    expect(within(screen.getByTestId('day-panel')).getByTestId('text-booking-amount-b-drop').textContent).toMatch(/AED 49/);
  });

  it('past sessions collapse to one line with the result, in the list and in the day panel', async () => {
    mount();
    await screen.findByTestId('bookings-calendar');
    fireEvent.click(screen.getByTestId('button-view-list'));
    const past = screen.getByTestId('row-past-b-pass-past');
    expect(past.textContent).toMatch(/Smash Sports Academy/); expect(past.textContent).toMatch(/Attended/); expect(past.textContent).toMatch(/20:00/);
    expect(screen.getByTestId('row-past-b-cancelled').textContent).toMatch(/Cancelled/);
    expect(screen.queryByTestId('card-booking-b-pass-past')).toBeNull();
    expect(screen.queryByTestId('card-booking-b-cancelled')).toBeNull();
    fireEvent.click(screen.getByTestId('button-view-calendar'));
    showMonthOf(pastDay);
    fireEvent.click(screen.getByTestId(`day-${pastDay}`));
    expect(within(screen.getByTestId('day-panel')).getByTestId('row-past-b-pass-past').textContent).toMatch(/Attended/);
  });

  it('no active pass → no strip; empty bookings → the empty state links to IQ Pass while the flag is on', async () => {
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [] });
    handlers['/api/marketplace/bookings/mine'] = () => [];
    mount();
    const link = await screen.findByTestId('link-empty-iq-pass');
    expect(link.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(screen.queryByTestId('strip-iq-pass')).toBeNull();
    expect(screen.getByTestId('button-browse-sessions')).toBeTruthy();
  });

  it('flag off: no strip, no IQ Pass link in the empty state, the page still renders', async () => {
    flagMock.enabled = false;
    handlers['/api/marketplace/bookings/mine'] = () => [];
    mount();
    await screen.findByTestId('button-browse-sessions');
    expect(screen.queryByTestId('link-empty-iq-pass')).toBeNull();
    expect(screen.queryByTestId('strip-iq-pass')).toBeNull();
  });
});

describe('source pins', () => {
  it('the bookings calendar pieces live in one IQ-Pass-token component: no hex, no emoji, no savings copy', () => {
    const src = read('client/src/components/marketplace/BookingsCalendar.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).toMatch(/from '@\/components\/marketplace\/IqPassCalendar'/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/per game|saving/i);
    expect(src).toMatch(/data-testid=\{`card-pass-seat-\$\{booking\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`text-booking-iqpass-\$\{booking\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`button-move-\$\{booking\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`text-move-window-\$\{booking\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`row-past-\$\{booking\.id\}`\}/);
  });
  it('My Bookings mounts the calendar as the default view and keeps the drop-in card, wallet chip, error card and cancel flows intact', () => {
    const mb = read('client/src/pages/marketplace/MyBookings.tsx');
    expect(mb).toMatch(/from '@\/components\/marketplace\/BookingsCalendar'/);
    expect(mb).toMatch(/data-testid=\{`button-view-\$\{v\}`\}/); // 'calendar' | 'list' toggle, calendar first
    expect(mb).toMatch(/data-testid="link-empty-iq-pass"/);
    expect(mb.includes("sectionHeader('IQ Pass'")).toBe(true);
    expect(mb.includes('const packSeats = upcoming.filter(b => !!b.packId')).toBe(true);
    expect(mb.includes('const canCancel = !booking.packId && !booking.isGuestBooking')).toBe(true);
    expect(mb).toMatch(/card-wallet-balance/);
    expect(mb).toMatch(/testId="error-bookings"/);
    expect(mb).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
