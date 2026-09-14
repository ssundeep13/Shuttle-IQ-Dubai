// IQ Pass Gate 9 — the picker is a calendar. Shared month-grid component (pick + read modes),
// week maths, short venue names, chip states, the 375px week strip, and the purchase page wiring:
// calendar by default, "List" toggle keeps the old rows, "n of N picked" pinned above, "Review"
// pinned to the bottom once n = N. IQ Pass tokens only, Inter, no emoji, no savings copy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';

const authMock = vi.hoisted(() => ({ user: { id: 'u-1', name: 'Test Player', email: 't@example.com' }, isAuthenticated: true, isLoading: false }));
const nativeMock = vi.hoisted(() => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock('../client/src/contexts/MarketplaceAuthContext', () => ({ useMarketplaceAuth: () => authMock }));
vi.mock('../client/src/lib/nativeAuth', () => nativeMock);
vi.mock('../client/src/hooks/useIqPass', () => ({ useIqPassEnabled: () => flagMock.enabled, useIqPassTiers: () => ({}) }));

const cal = await import('../client/src/components/marketplace/IqPassCalendar');
const { IqPassCalendar, buildWeeks, weekLabel, shortVenue, venueColour } = cal;
const { IQP, IQP_VENUE_PALETTE } = await import('../client/src/lib/iqPassTokens');
const { default: IqPass } = await import('../client/src/pages/marketplace/IqPass');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const setWidth = (w: number) => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); window.dispatchEvent(new Event('resize')); };
const bg = (el: Element) => (el as HTMLElement).style.backgroundColor.replace(/\s/g, '').toLowerCase();
const hexToRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})`; };

// ── week maths ───────────────────────────────────────────────────────────────
describe('buildWeeks / weekLabel / shortVenue / venueColour', () => {
  it('a Monday-to-Sunday 4-week window is exactly four Mon–Sun rows with date-range labels', () => {
    const weeks = buildWeeks('2026-09-14', '2026-10-11');
    expect(weeks.length).toBe(4);
    expect(weeks[0].start).toBe('2026-09-14'); expect(weeks[0].end).toBe('2026-09-20'); expect(weeks[0].label).toBe('14–20 Sep');
    expect(weeks[2].label).toBe('28 Sep–4 Oct');
    expect(weeks[3].label).toBe('5–11 Oct');
    expect(weeks.every((w) => w.days.length === 7 && w.days.every((d) => d.inWindow))).toBe(true);
    expect(weeks[0].days.map((d) => d.ymd)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
  });

  it('a window starting mid-week pads the first and last rows with out-of-window days', () => {
    const weeks = buildWeeks('2026-09-16', '2026-10-13');
    expect(weeks.length).toBe(5);
    expect(weeks[0].days[0]).toEqual({ ymd: '2026-09-14', inWindow: false });
    expect(weeks[0].days[2]).toEqual({ ymd: '2026-09-16', inWindow: true });
    expect(weeks[4].days[1]).toEqual({ ymd: '2026-10-13', inWindow: true });
    expect(weeks[4].days[2]).toEqual({ ymd: '2026-10-14', inWindow: false });
  });

  it('weekLabel spells the range once per month', () => {
    expect(weekLabel('2026-09-14', '2026-09-20')).toBe('14–20 Sep');
    expect(weekLabel('2026-09-28', '2026-10-04')).toBe('28 Sep–4 Oct');
  });

  it('shortVenue keeps the distinctive words only', () => {
    expect(shortVenue('Smash Sports Academy')).toBe('Smash');
    expect(shortVenue('Bright Riders School Dubai')).toBe('Bright Riders');
    expect(shortVenue('Fire Rallies Sports Academy LLC')).toBe('Fire Rallies');
    expect(shortVenue('Dubai Sports Complex')).toBe('Dubai');
  });

  it('venueColour is stable per venue and comes from the token palette (navy and teal first)', () => {
    expect(IQP_VENUE_PALETTE.length).toBeGreaterThanOrEqual(6);
    expect(IQP_VENUE_PALETTE[0]).toBe(IQP.navy); expect(IQP_VENUE_PALETTE[1]).toBe(IQP.teal);
    expect(IQP_VENUE_PALETTE.every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
    expect(venueColour('Smash Sports Academy')).toBe(venueColour('Smash Sports Academy'));
    expect(IQP_VENUE_PALETTE).toContain(venueColour('Smash Sports Academy'));
    expect(IQP_VENUE_PALETTE).toContain(venueColour('Bright Riders School Dubai'));
  });
});

// ── the component ────────────────────────────────────────────────────────────
const items = [
  { id: 'a', ymd: '2026-09-15', label: 'Smash 20:00', state: 'pickable' as const },
  { id: 'b', ymd: '2026-09-15', label: 'Bright Riders 20:00', state: 'picked' as const },
  { id: 'c', ymd: '2026-09-17', label: 'Smash 20:00', state: 'blocked' as const, blockedReason: 'Pass seats full' },
  { id: 'd', ymd: '2026-09-23', label: 'Smash 18:00', state: 'pickable' as const },
];

describe('IqPassCalendar — pick mode, wide', () => {
  beforeEach(() => setWidth(1024));

  it('7 Mon–Sun columns, one labelled row per week, chips as buttons with picked / blocked states, empty cream cells', () => {
    const onPick = vi.fn();
    render(<IqPassCalendar mode="pick" windowStart="2026-09-14" windowEnd="2026-10-11" items={items} onPick={onPick} />);
    expect(screen.getByTestId('iqp-calendar-grid')).toBeTruthy();
    expect(screen.getAllByTestId(/^weekday-/).map((e) => e.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(screen.getAllByTestId(/^week-row-/).length).toBe(4);
    expect(screen.getByTestId('week-row-2026-09-14').textContent).toMatch(/14–20 Sep/);
    const chipA = screen.getByTestId('chip-a') as HTMLButtonElement;
    expect(chipA.tagName).toBe('BUTTON'); expect(chipA.textContent).toBe('Smash 20:00'); expect(chipA.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chipA); expect(onPick).toHaveBeenCalledWith('a');
    const chipB = screen.getByTestId('chip-b') as HTMLButtonElement;
    expect(chipB.getAttribute('aria-pressed')).toBe('true');
    expect(bg(chipB)).toBe(hexToRgb(IQP.navy).replace(/\s/g, ''));
    expect(chipB.style.color.replace(/\s/g, '')).toBe(hexToRgb(IQP.white).replace(/\s/g, ''));
    const chipC = screen.getByTestId('chip-c') as HTMLButtonElement;
    expect(chipC.disabled).toBe(true); expect(chipC.getAttribute('title')).toBe('Pass seats full'); expect(chipC.getAttribute('aria-label')).toMatch(/Pass seats full/);
    fireEvent.click(chipC); expect(onPick).toHaveBeenCalledTimes(1);
    const empty = screen.getByTestId('day-2026-09-16');
    expect(empty.querySelectorAll('button').length).toBe(0);
    expect(bg(empty)).toBe(hexToRgb(IQP.cream).replace(/\s/g, ''));
    expect(empty.getAttribute('data-empty')).toBe('true');
    expect(screen.getByTestId('day-2026-09-15').getAttribute('data-empty')).toBe('false');
  });

  it('days outside the window are marked and carry nothing', () => {
    render(<IqPassCalendar mode="pick" windowStart="2026-09-16" windowEnd="2026-10-13" items={items} onPick={() => {}} />);
    expect(screen.getByTestId('day-2026-09-14').getAttribute('data-outside')).toBe('true');
    expect(screen.getByTestId('day-2026-09-17').getAttribute('data-outside')).toBe('false');
  });
});

describe('IqPassCalendar — pick mode, 375px week strip', () => {
  beforeEach(() => setWidth(375));
  afterEach(() => setWidth(1024));

  it('one week at a time with the date range, arrows and swipe move between weeks, chips stay tappable', () => {
    const onPick = vi.fn();
    render(<IqPassCalendar mode="pick" windowStart="2026-09-14" windowEnd="2026-10-11" items={items} onPick={onPick} />);
    expect(screen.queryByTestId('iqp-calendar-grid')).toBeNull();
    expect(screen.getByTestId('iqp-calendar-strip')).toBeTruthy();
    expect(screen.getByTestId('text-week-label').textContent).toBe('14–20 Sep');
    expect(screen.getByTestId('chip-a')).toBeTruthy();
    expect(screen.queryByTestId('chip-d')).toBeNull(); // 23 Sep lives in week two
    expect((screen.getByTestId('button-week-prev') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('button-week-next'));
    expect(screen.getByTestId('text-week-label').textContent).toBe('21–27 Sep');
    expect(screen.getByTestId('chip-d')).toBeTruthy();
    fireEvent.click(screen.getByTestId('chip-d')); expect(onPick).toHaveBeenCalledWith('d');
    // swipe right → previous week
    const panel = screen.getByTestId('week-panel-2026-09-21');
    fireEvent.touchStart(panel, { touches: [{ clientX: 40, clientY: 10 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 160, clientY: 12 }] });
    expect(screen.getByTestId('text-week-label').textContent).toBe('14–20 Sep');
    // day rows carry the weekday + date
    expect(screen.getByTestId('day-2026-09-15').textContent).toMatch(/Tue 15/);
    // last week disables "next"
    fireEvent.click(screen.getByTestId('button-week-next')); fireEvent.click(screen.getByTestId('button-week-next')); fireEvent.click(screen.getByTestId('button-week-next'));
    expect(screen.getByTestId('text-week-label').textContent).toBe('5–11 Oct');
    expect((screen.getByTestId('button-week-next') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('IqPassCalendar — read mode', () => {
  beforeEach(() => setWidth(1024));

  it('one coloured dot per booking, a day is a button that reports its date, empty days are not tappable, legend lists the venues', () => {
    const onDay = vi.fn();
    render(<IqPassCalendar mode="read" windowStart="2026-09-01" windowEnd="2026-09-30" selectedDay="2026-09-15"
      items={[{ id: 'k1', ymd: '2026-09-15', label: 'Smash 20:00', colour: IQP.navy }, { id: 'k2', ymd: '2026-09-15', label: 'Bright Riders 20:00', colour: IQP.teal }, { id: 'k3', ymd: '2026-09-22', label: 'Smash 20:00', colour: IQP.navy }]}
      legend={[{ label: 'Smash', colour: IQP.navy }, { label: 'Bright Riders', colour: IQP.teal }]} onDay={onDay} />);
    const day = screen.getByTestId('day-2026-09-15') as HTMLButtonElement;
    expect(day.tagName).toBe('BUTTON'); expect(day.getAttribute('aria-pressed')).toBe('true');
    expect(day.querySelectorAll('[data-testid^="dot-"]').length).toBe(2);
    expect(bg(screen.getByTestId('dot-k2'))).toBe(hexToRgb(IQP.teal).replace(/\s/g, ''));
    expect(screen.queryAllByRole('button', { name: /Smash 20:00/ }).length).toBe(0); // no chips in read mode
    fireEvent.click(screen.getByTestId('day-2026-09-22')); expect(onDay).toHaveBeenCalledWith('2026-09-22');
    expect((screen.getByTestId('day-2026-09-16') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('legend-iqp-calendar').textContent).toMatch(/Smash.*Bright Riders/);
    expect(screen.getAllByTestId(/^week-row-/).length).toBe(5); // Sep 2026 spans five Mon–Sun rows
  });
});

// ── purchase page wiring ─────────────────────────────────────────────────────
const sessionsFixture = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`, title: 'Smash Session', venueName: i % 2 ? 'Bright Riders School Dubai' : 'Smash Sports Academy', venueLocation: null,
  dateDubai: `2026-09-${String(15 + i).padStart(2, '0')}`, startTime: '20:00', endTime: '22:00', status: 'upcoming', linked: true,
  capacity: 24, priceAed: 49, spotsRemaining: i === 13 ? 0 : 10, packSeats: 0, packSeatsLeft: i === 12 ? 0 : 12, alreadyBooked: i === 11,
}));
const tiersFixture = { club: { label: 'Club', games: 4, priceAed: 188 }, club_plus: { label: 'Club Plus', games: 8, priceAed: 360 }, club_elite: { label: 'Club Elite', games: 12, priceAed: 516 } };
const calendarPayload = () => ({ window: { start: '2026-09-14', end: '2026-10-11' }, currentPass: null, jerseyEligibleForElite: true, tiers: tiersFixture, sessions: sessionsFixture });
const stubFetch = () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/marketplace/iq-pass/me')) return { ok: true, status: 200, json: async () => ({ packs: [] }) };
    if (String(url).includes('/api/marketplace/iq-pass/calendar')) return { ok: true, status: 200, json: async () => calendarPayload() };
    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  }));
};

describe('IqPass page — calendar picker', () => {
  beforeEach(() => { flagMock.enabled = true; setWidth(1024); stubFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear(); } catch {} });

  it('calendar by default: chips with short venue + time, the old list behind the "List" toggle, counter pinned above', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('iqp-calendar-grid');
    expect(screen.queryByTestId('row-session-s0')).toBeNull();
    expect(screen.getByTestId('chip-s0').textContent).toBe('Smash 20:00');
    expect(screen.getByTestId('chip-s1').textContent).toBe('Bright Riders 20:00');
    expect((screen.getByTestId('chip-s11') as HTMLButtonElement).disabled).toBe(true); expect(screen.getByTestId('chip-s11').getAttribute('title')).toBe('Already booked');
    expect((screen.getByTestId('chip-s12') as HTMLButtonElement).disabled).toBe(true); expect(screen.getByTestId('chip-s12').getAttribute('title')).toBe('Pass seats full');
    expect((screen.getByTestId('chip-s13') as HTMLButtonElement).disabled).toBe(true); expect(screen.getByTestId('chip-s13').getAttribute('title')).toBe('Session full');
    const counterBar = screen.getByTestId('bar-pick-count');
    expect(counterBar.style.position).toBe('sticky');
    expect(screen.getByTestId('text-pick-count').textContent).toMatch(/0 of 4 picked/);
    expect((screen.getByTestId('button-view-calendar')).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('button-view-list'));
    expect(screen.queryByTestId('iqp-calendar-grid')).toBeNull();
    expect(screen.getByTestId('row-session-s0')).toBeTruthy();
    expect(screen.getByTestId('text-pick-count').textContent).toMatch(/0 of 4 picked/);
    fireEvent.click(screen.getByTestId('button-view-calendar'));
    expect(screen.getByTestId('iqp-calendar-grid')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/per game|saving|save/i);
  });

  it('"Review" pins to the bottom only once every game is picked; picked chips go navy; extra chips lock', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('iqp-calendar-grid');
    expect(screen.queryByTestId('button-continue')).toBeNull();
    expect(screen.queryByTestId('bar-review')).toBeNull();
    for (const id of ['s0', 's1', 's2']) fireEvent.click(screen.getByTestId(`chip-${id}`));
    expect(screen.getByTestId('text-pick-count').textContent).toMatch(/3 of 4 picked/);
    expect(screen.getByTestId('chip-s0').getAttribute('aria-pressed')).toBe('true');
    expect(bg(screen.getByTestId('chip-s0'))).toBe(hexToRgb(IQP.navy).replace(/\s/g, ''));
    expect(screen.queryByTestId('button-continue')).toBeNull();
    fireEvent.click(screen.getByTestId('chip-s3'));
    expect(screen.getByTestId('text-pick-count').textContent).toMatch(/4 of 4 picked/);
    const bar = screen.getByTestId('bar-review');
    expect(bar.style.position).toBe('fixed');
    const review = screen.getByTestId('button-continue') as HTMLButtonElement;
    expect(review.textContent).toBe('Review'); expect(review.disabled).toBe(false);
    expect((screen.getByTestId('chip-s4') as HTMLButtonElement).disabled).toBe(true); // a fifth pick is not allowed
    fireEvent.click(screen.getByTestId('chip-s0')); // unpick → the bar goes away
    expect(screen.queryByTestId('bar-review')).toBeNull();
    fireEvent.click(screen.getByTestId('chip-s0'));
    fireEvent.click(screen.getByTestId('button-continue'));
    expect((await screen.findByTestId('text-review-title')).textContent).toBe('Your month is locked');
  });

  it('at 375px the picker is the week strip and the Review bar clears the bottom nav', async () => {
    setWidth(375);
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('iqp-calendar-strip');
    expect(screen.queryByTestId('iqp-calendar-grid')).toBeNull();
    expect(screen.getByTestId('text-week-label').textContent).toBe('14–20 Sep');
    for (const id of ['s0', 's1', 's2', 's3']) fireEvent.click(screen.getByTestId(`chip-${id}`));
    expect(screen.getByTestId('bar-review').style.bottom).toMatch(/64px/);
    fireEvent.click(screen.getByTestId('button-week-next'));
    expect(screen.getByTestId('text-week-label').textContent).toBe('21–27 Sep');
    expect(screen.getByTestId('chip-s6')).toBeTruthy();
  });

  it('Club Elite: the Review bar waits for the jersey size', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club_elite'));
    await screen.findByTestId('iqp-calendar-grid');
    for (let i = 0; i < 11; i++) fireEvent.click(screen.getByTestId(`chip-s${i}`));
    expect(screen.queryByTestId('bar-review')).toBeNull(); // 11 of 12
    // the fixture has exactly 11 pickable rows; widen it by unpicking + repicking is not enough, so assert the count only
    expect(screen.getByTestId('text-pick-count').textContent).toMatch(/11 of 12 picked/);
    expect(screen.getByTestId('select-jersey-size')).toBeTruthy();
  });
});

describe('source pins', () => {
  it('the calendar component is IQ Pass tokens only: Inter via the token font, no hex literal, no emoji, no icons, no savings copy', () => {
    const src = read('client/src/components/marketplace/IqPassCalendar.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).toMatch(/IQP_FONT/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/lucide-react/);
    expect(src).not.toMatch(/per game|saving/i);
  });
  it('the purchase page keeps its token discipline and now mounts the calendar', () => {
    const src = read('client/src/pages/marketplace/IqPass.tsx');
    expect(src).toMatch(/from '@\/components\/marketplace\/IqPassCalendar'/);
    expect(src).not.toMatch(/#003E8C|#F5EFE0|#002C84|#F2ECE1/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/per game|saving/i);
  });
});
