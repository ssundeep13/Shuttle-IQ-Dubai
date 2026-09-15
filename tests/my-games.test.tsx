// IQ Pass Gate 13 — My Bookings redesigned around the next game (replaces the Gate 10 layout).
// Hero "Next game" card (day, time, venue · area, live countdown, Move, "Moves close in Xh", thin
// teal pass line), a horizontally scrolling month strip (today centred + teal underline, booked days
// as venue-coloured tiles with the start time, tap → the agenda row), the agenda grouped by week
// with teal overlines (day, time, venue, "IQ Pass" chip, Move) and every existing behaviour reachable
// from the row's details (the untouched BookingCard), past games under a collapsed "Played" section,
// "Nothing booked." with an IQ Pass link when nothing is ahead. One H1 "My games" 28/800.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import React from 'react';

const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock('../client/src/hooks/useIqPass', () => ({ useIqPassEnabled: () => flagMock.enabled, useIqPassConfig: () => ({ enabled: flagMock.enabled, tiers: [] }), useIqPassTiers: () => ({}) }));
vi.mock('../client/src/lib/nativeAuth', () => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
vi.mock('framer-motion', async (orig) => ({ ...(await orig<typeof import('framer-motion')>()), useReducedMotion: () => true }));

const { default: MyBookings } = await import('../client/src/pages/marketplace/MyBookings');
const { venueColour } = await import('../client/src/lib/venueColours');
const { IQP } = await import('../client/src/lib/iqPassTokens');
const { sessionStartEpochMs } = await import('../shared/sessionTime');
const dates = await import('../client/src/lib/iqPassDates');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const H = 3_600_000; const D = 24 * H;
const now = Date.now();
const today = dates.todayDubai(now);
const upDay = dates.addDays(today, 1);   // tomorrow 20:00 → "in 2xh"
const upDay2 = dates.addDays(today, 2);
const upDay3 = dates.addDays(today, 8);  // next week → a second agenda week
const pastDay = dates.addDays(today, -3);
const pastDay2 = dates.addDays(today, -2);
const SMASH = 'Smash Sports Academy'; const BRIGHT = 'Bright Riders School Dubai';
const session = (id: string, ymd: string, venueName: string, startTime = '20:00') => ({ id, title: `${venueName} Session`, venueName, venueLocation: null, date: `${ymd}T00:00:00.000Z`, startTime, endTime: '22:00', capacity: 18, priceAed: 49, status: 'upcoming', courtCount: 3 });
const booking = (id: string, over: Record<string, unknown>) => ({
  id, userId: 'u-1', sessionId: `sess-${id}`, status: 'confirmed', paymentMethod: 'ziina', amountAed: 49, cashPaid: false, spotsBooked: 1, waitlistPosition: null,
  createdAt: new Date(now - 5 * D).toISOString(), promotedAt: null, packId: null, walletAmountUsed: 0, ziinaPaymentIntentId: null, guests: [], isGuestBooking: false, totalPaidAed: 49, venueArea: null,
  ...over,
});
const bookings = [
  booking('b-pass-1', { packId: 'pk-1', paymentMethod: 'iq_pass', amountAed: 47, totalPaidAed: 47, venueArea: 'Dubailand', session: session('s-up', upDay, SMASH), sessionId: 's-up' }),
  booking('b-pass-2', { packId: 'pk-1', paymentMethod: 'iq_pass', amountAed: 47, totalPaidAed: 47, venueArea: 'Dubailand', session: session('s-up3', upDay3, SMASH), sessionId: 's-up3' }),
  booking('b-pass-past', { packId: 'pk-1', paymentMethod: 'iq_pass', amountAed: 47, status: 'attended', venueArea: 'Dubailand', session: session('s-past', pastDay, SMASH), sessionId: 's-past' }),
  booking('b-drop', { venueArea: 'Green Community', session: session('s-up2', upDay2, BRIGHT, '18:00'), sessionId: 's-up2' }),
  booking('b-cancelled', { status: 'cancelled', venueArea: 'Green Community', session: session('s-past2', pastDay2, BRIGHT), sessionId: 's-past2' }),
];
const startMs = (ymd: string, t = '20:00') => sessionStartEpochMs(`${ymd}T00:00:00.000Z`, t);
const cutoffMs = startMs(upDay) - 5 * H;
const seat = (bookingId: string, sessionId: string, ymd: string, canMove: boolean) => ({ bookingId, sessionId, status: 'confirmed', session: { title: 'Smash Session', venueName: SMASH, date: `${ymd}T00:00:00.000Z`, startTime: '20:00', endTime: '22:00' }, canMoveUntil: new Date(startMs(ymd) - 5 * H).toISOString(), canMove });
const packs = [{ id: 'pk-1', tier: 'club', label: 'Club', status: 'active', gamesTotal: 4, repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, paidAt: new Date(now - 5 * D).toISOString(), holdExpiresAt: new Date(now - 5 * D).toISOString(), lastGameDate: upDay3,
  seats: [seat('b-pass-past', 's-past', pastDay, false), seat('b-pass-1', 's-up', upDay, true), seat('b-pass-2', 's-up3', upDay3, true)] }];

let handlers: Record<string, () => unknown>;
const scrollSpy = vi.fn();
const mount = () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k));
    return key ? { ok: true, status: 200, json: async () => handlers[key](), text: async () => JSON.stringify(handlers[key]()) } : { ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => 'Not found' };
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join('/'))).json() } } });
  return render(<QueryClientProvider client={qc}><MyBookings /></QueryClientProvider>);
};
const setWidth = (w: number) => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); window.dispatchEvent(new Event('resize')); };

describe('My games', () => {
  beforeEach(() => {
    flagMock.enabled = true; setWidth(375);
    Element.prototype.scrollIntoView = scrollSpy; scrollSpy.mockClear();
    handlers = { '/api/marketplace/bookings/mine': () => bookings, '/api/marketplace/me/wallet': () => ({ walletBalance: 0 }), '/api/marketplace/iq-pass/me': () => ({ packs }) };
  });
  afterEach(() => { vi.unstubAllGlobals(); setWidth(1024); });

  it('hero: the next game — day and date, time, venue · area, live countdown, Move, "Moves close in Xh", the thin teal pass line', async () => {
    mount();
    const hero = await screen.findByTestId('card-next-game');
    expect(within(hero).getByTestId('text-next-day').textContent).toBe(dates.weekdayOf(upDay) + ' ' + dates.dayNumber(upDay) + ' ' + dates.monthShort(upDay));
    expect(within(hero).getByTestId('text-next-time').textContent).toBe('20:00–22:00');
    expect(within(hero).getByTestId('text-next-venue').textContent).toBe('Smash Sports Academy · Dubailand');
    const cd = within(hero).getByTestId('text-next-countdown').textContent ?? '';
    expect(cd).toMatch(/^in \d+h$/);
    expect(Math.abs(Number(cd.match(/\d+/)![0]) - Math.round((startMs(upDay) - Date.now()) / H))).toBeLessThanOrEqual(1);
    expect(within(hero).getByTestId('button-move-b-pass-1')).toBeTruthy();
    const win = within(hero).getByTestId('text-move-window-b-pass-1').textContent ?? '';
    expect(win).toMatch(/^Moves close in \d+h$/);
    expect(Math.abs(Number(win.match(/\d+/)![0]) - Math.ceil((cutoffMs - Date.now()) / H))).toBeLessThanOrEqual(1);
    const line = within(hero).getByTestId('line-iq-pass-progress');
    expect(line.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(within(line).getByTestId('text-iq-pass-progress').textContent).toBe('Club · 1 of 4 played');
    expect((within(line).getByTestId('bar-iq-pass-progress') as HTMLElement).style.width).toBe('25%');
  });

  it('one H1 "My games" at 28/800; the month grid, month arrows, subtitle and view buttons are gone; the wallet chip stays', async () => {
    mount();
    await screen.findByTestId('card-next-game');
    const h1s = document.querySelectorAll('h1');
    expect(h1s.length).toBe(1); expect(h1s[0].textContent).toBe('My games');
    expect((h1s[0] as HTMLElement).style.fontSize).toBe('28px'); expect((h1s[0] as HTMLElement).style.fontWeight).toBe('800');
    expect(screen.queryByTestId('text-month-label')).toBeNull();
    expect(screen.queryByTestId('button-month-prev')).toBeNull();
    expect(screen.queryByTestId('button-view-list')).toBeNull();
    expect(screen.queryByTestId('bookings-calendar')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Manage your session bookings/);
    expect(screen.getByTestId('card-wallet-balance')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/per game|saving/i);
  });

  it('month strip: day letter + number, today underlined in teal, booked days as venue-coloured tiles with the start time, tapping a tile scrolls to the game', async () => {
    mount();
    await screen.findByTestId('card-next-game');
    const strip = screen.getByTestId('strip-days');
    const todayCell = within(strip).getByTestId(`day-${today}`) as HTMLElement;
    expect(todayCell.getAttribute('data-today')).toBe('true');
    expect(todayCell.style.borderBottomColor).toBe(rgb(IQP.teal));
    expect(within(todayCell).getByTestId(`text-day-letter-${today}`).textContent).toBe(dates.dayLetter(today));
    expect(within(todayCell).getByTestId(`text-day-number-${today}`).textContent).toBe(String(dates.dayNumber(today)));
    const tile = within(strip).getByTestId('tile-b-pass-1') as HTMLElement;
    expect(tile.textContent).toBe('20:00'); expect(tile.style.backgroundColor).toBe(rgb(venueColour(SMASH)));
    expect(within(within(strip).getByTestId(`day-${upDay2}`)).getByTestId('tile-b-drop').style.backgroundColor).toBe(rgb(venueColour(BRIGHT)));
    expect(within(strip).queryAllByTestId(/^tile-/).length).toBe(3); // no tiles for past, cancelled or unbooked days
    expect(scrollSpy).toHaveBeenCalled(); // today centred on load
    scrollSpy.mockClear();
    fireEvent.click(within(strip).getByTestId('tile-b-drop'));
    expect(scrollSpy).toHaveBeenCalled();
    expect(document.getElementById('game-b-drop')).toBeTruthy();
  });

  it('agenda: rows grouped by week under teal overlines — day, time, venue, "IQ Pass" chip and Move on pass seats; the existing card opens from the row', async () => {
    mount();
    await screen.findByTestId('card-next-game');
    const weeks = screen.getAllByTestId(/^agenda-week-/);
    expect(weeks.length).toBe(2);
    expect((weeks[0] as HTMLElement).style.borderTopColor).toBe(rgb(IQP.teal));
    expect(within(weeks[0]).getByTestId(/^text-agenda-week-/).textContent).toBe(dates.weekLabel(dates.mondayOf(upDay), dates.addDays(dates.mondayOf(upDay), 6)));
    const row = screen.getByTestId('row-game-b-pass-1');
    expect(row.textContent).toMatch(new RegExp(`${dates.weekdayOf(upDay)} ${dates.dayNumber(upDay)}`));
    expect(row.textContent).toMatch(/20:00/); expect(row.textContent).toMatch(/Smash Sports Academy/);
    expect(within(row).getByTestId('chip-iq-pass-b-pass-1').textContent).toBe('IQ Pass');
    expect(within(row).getByTestId('button-move-b-pass-1')).toBeTruthy();
    const drop = screen.getByTestId('row-game-b-drop');
    expect(within(drop).queryByTestId('chip-iq-pass-b-drop')).toBeNull();
    expect(within(drop).queryByTestId('button-move-b-drop')).toBeNull();
    expect(screen.queryByTestId('card-booking-b-drop')).toBeNull();
    fireEvent.click(within(drop).getByTestId('button-details-b-drop'));
    const details = screen.getByTestId('details-b-drop');
    expect(within(details).getByTestId('card-booking-b-drop')).toBeTruthy();
    expect(within(details).getByTestId('button-cancel-b-drop')).toBeTruthy();      // drop-in cancel still reachable
    expect(within(details).getByTestId('button-add-guest-b-drop')).toBeTruthy();   // guest add still reachable
    expect(within(details).getByTestId('text-booking-amount-b-drop').textContent).toMatch(/AED 49/);
    expect(screen.getByTestId('row-game-b-pass-2')).toBeTruthy(); // next week's game is in the second group
  });

  it('"Played (n)" counts only attended or completed games; cancelled and unpaid past rows sit under a separate collapsed "Not played" section', async () => {
    // Sandeep (2026-09-14): after a swept hold a player with no games read "Played (4)" — cancelled seats were counted.
    const done = booking('b-done', { venueArea: 'Green Community', session: session('s-done', pastDay2, BRIGHT, '18:00'), sessionId: 's-done' }); // confirmed, session over → completed
    const unpaid = booking('b-unpaid', { status: 'pending_payment', venueArea: 'Dubailand', session: session('s-unpaid', pastDay, SMASH, '18:00'), sessionId: 's-unpaid' });
    handlers['/api/marketplace/bookings/mine'] = () => [...bookings, done, unpaid];
    mount();
    await screen.findByTestId('card-next-game');
    const played = screen.getByTestId('section-played') as HTMLDetailsElement;
    expect(played.tagName).toBe('DETAILS'); expect(played.open).toBe(false);
    expect(within(played).getByTestId('summary-played').textContent).toMatch(/^Played \(2\)$/);
    expect(within(played).getByTestId('row-past-b-pass-past').textContent).toMatch(/Attended/);
    expect(within(played).getByTestId('row-past-b-done').textContent).toMatch(/Booked/);
    expect(within(played).queryByTestId('row-past-b-cancelled')).toBeNull();
    expect(within(played).queryByTestId('row-past-b-unpaid')).toBeNull();
    const notPlayed = screen.getByTestId('section-not-played') as HTMLDetailsElement;
    expect(notPlayed.tagName).toBe('DETAILS'); expect(notPlayed.open).toBe(false);
    expect(within(notPlayed).getByTestId('summary-not-played').textContent).toMatch(/^Not played \(2\)$/);
    expect(within(notPlayed).getByTestId('row-past-b-cancelled').textContent).toMatch(/Cancelled/);
    expect(within(notPlayed).getByTestId('row-past-b-unpaid').textContent).toMatch(/Unpaid/);
    expect(played.compareDocumentPosition(notPlayed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('row-game-b-pass-past')).toBeNull();
  });

  it('only cancelled rows in the past → no "Played" section at all, just "Not played"', async () => {
    handlers['/api/marketplace/bookings/mine'] = () => bookings.filter((b) => b.id === 'b-cancelled' || b.id === 'b-pass-1');
    mount();
    await screen.findByTestId('card-next-game');
    expect(screen.queryByTestId('section-played')).toBeNull();
    expect(screen.getByTestId('summary-not-played').textContent).toBe('Not played (1)');
  });

  it('nothing ahead → "Nothing booked." with one "Get your IQ Pass" button to the pass page; no hero, no strip tiles; the strip stays horizontal and full width', async () => {
    handlers['/api/marketplace/bookings/mine'] = () => bookings.filter((b) => b.id === 'b-pass-past' || b.id === 'b-cancelled');
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [] });
    setWidth(1280);
    mount();
    const empty = await screen.findByTestId('empty-upcoming');
    expect(within(empty).getByTestId('text-nothing-booked').textContent).toBe('Nothing booked.');
    const btn = within(empty).getByTestId('button-get-iq-pass') as HTMLAnchorElement;
    expect(btn.textContent).toBe('Get your IQ Pass'); expect(btn.getAttribute('href')).toBe('/marketplace/iq-pass');
    expect(within(empty).queryByTestId('button-browse-sessions')).toBeNull();
    expect(within(empty).queryByTestId('link-empty-iq-pass')).toBeNull();
    expect(screen.queryByTestId('card-next-game')).toBeNull();
    expect(screen.queryAllByTestId(/^tile-/).length).toBe(0);
    expect(screen.getByTestId('section-played')).toBeTruthy();
    // Bug (2026-09-14): at 1280 the empty card sat in a narrow left column with the strip as a vertical list and
    // "Played" floating alone on the right. Now: one column — card, then the horizontal strip, then Played.
    const layout = screen.getByTestId('my-games-layout') as HTMLElement;
    expect(layout.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    // Every inline grid under the layout declares its track. An implicit `auto` track grows to a child's
    // min-content — the unwrappable Played row at 375 (419 px) — and drags every sibling with it; production showed
    // it at three levels on 2026-09-15 (the layout, the inner stacks, then the row lists inside each <details>).
    const grids = Array.from(layout.querySelectorAll('*')).filter((e) => (e as HTMLElement).style.display === 'grid') as HTMLElement[];
    expect(grids.length).toBeGreaterThan(0);
    const bare = grids.filter((g) => g.style.gridTemplateColumns === '').map((g) => g.getAttribute('data-testid') ?? g.outerHTML.slice(0, 90));
    expect(bare).toEqual([]);
    const strip = screen.getByTestId('strip-days');
    expect(strip.getAttribute('data-orientation')).toBe('horizontal');
    expect(empty.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(screen.getByTestId('section-played')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('desktop (1280): one column — the hero spans the content width, the horizontal scrolling strip sits beneath it, then the agenda, then Played', async () => {
    setWidth(1280);
    mount();
    const hero = await screen.findByTestId('card-next-game');
    const layout = screen.getByTestId('my-games-layout') as HTMLElement;
    // minmax(0, 1fr), not 1fr: a bare 1fr column is minmax(auto, 1fr) and grows to the min-content of its widest child —
    // an open "Played" row with a long venue name pushed the page to 435 px on a 375 px phone (found 2026-09-14).
    expect(layout.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    // Every inline grid under the layout declares its track. An implicit `auto` track grows to a child's
    // min-content — the unwrappable Played row at 375 (419 px) — and drags every sibling with it; production showed
    // it at three levels on 2026-09-15 (the layout, the inner stacks, then the row lists inside each <details>).
    const grids = Array.from(layout.querySelectorAll('*')).filter((e) => (e as HTMLElement).style.display === 'grid') as HTMLElement[];
    expect(grids.length).toBeGreaterThan(0);
    const bare = grids.filter((g) => g.style.gridTemplateColumns === '').map((g) => g.getAttribute('data-testid') ?? g.outerHTML.slice(0, 90));
    expect(bare).toEqual([]);
    const strip = screen.getByTestId('strip-days') as HTMLElement;
    expect(strip.getAttribute('data-orientation')).toBe('horizontal');
    expect(strip.style.overflowX).toBe('auto');
    expect(strip.style.flexDirection === '' || strip.style.flexDirection === 'row').toBe(true);
    const agenda = screen.getAllByTestId(/^agenda-week-/)[0];
    const played = screen.getByTestId('section-played');
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(hero, strip)).toBe(true); expect(follows(strip, agenda)).toBe(true); expect(follows(agenda, played)).toBe(true);
  });

  it('flag off: the empty state falls back to a "Browse Sessions" button (no IQ Pass button)', async () => {
    flagMock.enabled = false;
    handlers['/api/marketplace/bookings/mine'] = () => bookings.filter((b) => b.id === 'b-pass-past' || b.id === 'b-cancelled');
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [] });
    mount();
    const empty = await screen.findByTestId('empty-upcoming');
    expect(within(empty).queryByTestId('button-get-iq-pass')).toBeNull();
    expect(within(empty).getByTestId('button-browse-sessions').getAttribute('href')).toBe('/marketplace/book');
  });
});

describe('source pins', () => {
  it('the Gate 10 grid components and suite are gone; MyBookings mounts MyGames and keeps the card, wallet chip, error card and cancel flows', () => {
    for (const f of ['client/src/components/marketplace/BookingsCalendar.tsx', 'client/src/components/marketplace/IqPassCalendar.tsx', 'tests/my-bookings-calendar.test.tsx']) {
      expect(existsSync(join(__dirname, '..', f)), f).toBe(false);
    }
    const mb = read('client/src/pages/marketplace/MyBookings.tsx');
    expect(mb).toMatch(/from '@\/components\/marketplace\/MyGames'/);
    expect(mb).not.toMatch(/BookingsCalendar|IqPassCalendar/);
    expect(mb).toMatch(/card-wallet-balance/);
    expect(mb).toMatch(/testId="error-bookings"/);
    expect(mb.includes('const canCancel = !booking.packId && !booking.isGuestBooking')).toBe(true);
    expect(mb.includes('const packSeats = upcoming.filter(b => !!b.packId')).toBe(true);
    expect(mb).not.toMatch(/Manage your session bookings/);
    expect(mb).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
  it('MyGames is IQ Pass tokens + the shared venue map: Inter, no hex, no emoji, no icons, no ramps, no savings copy; the countdown ticks by the minute', () => {
    const src = read('client/src/components/marketplace/MyGames.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).toMatch(/from '@\/lib\/venueColours'/);
    expect(src).toMatch(/from '@\/components\/marketplace\/IqPassPromo'/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/lucide-react|gradient/i);
    expect(src).not.toMatch(/per game|saving/i);
    expect(src).toMatch(/setInterval\([\s\S]*?60_000\)/);
  });
});
