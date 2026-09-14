// IQ Pass Gate 11 — the picker redesign. Weeks as teal overlines followed by a row of session
// cards (no empty cells, no Sunday column), each card with the day number, venue, area, time,
// spots-left caption and a 4px rail in the venue's colour; a sticky slot bar that fills with
// venue-coloured tiles and becomes the Review bar when full; picked cards navy/cream with a
// tick, cap-reached cards at 40% with a caption (no tooltips); mobile stacks full-width cards;
// the review screen shows the picks as tiles on a mini month with Pay pinned. Brand only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const { IqPassPicker, MiniMonth } = await import('../client/src/components/marketplace/IqPassPicker');
const dates = await import('../client/src/lib/iqPassDates');
const { IQP } = await import('../client/src/lib/iqPassTokens');
const { venueColour } = await import('../client/src/lib/venueColours');
const { default: IqPass } = await import('../client/src/pages/marketplace/IqPass');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const setWidth = (w: number) => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); window.dispatchEvent(new Event('resize')); };
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const bg = (el: Element) => (el as HTMLElement).style.backgroundColor;

const SMASH = 'Smash Sports Academy'; const BRIGHT = 'Bright Riders School Dubai';
const sessions = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`, title: 'Session', venueName: i % 2 ? BRIGHT : SMASH, venueLocation: null, venueArea: i % 2 ? 'Green Community' : 'Dubailand',
  dateDubai: `2026-09-${String(15 + i).padStart(2, '0')}`, startTime: '20:00', endTime: '22:00', status: 'upcoming', linked: true,
  capacity: 24, priceAed: 49, spotsRemaining: i === 13 ? 0 : 10, packSeats: 0, packSeatsLeft: i === 12 ? 0 : 12, alreadyBooked: i === 11,
}));
const tiers = { club: { label: 'Club', games: 4, priceAed: 188 }, club_plus: { label: 'Club Plus', games: 8, priceAed: 360 }, club_elite: { label: 'Club Elite', games: 12, priceAed: 516 } };
const calendar = () => ({ window: { start: '2026-09-14', end: '2026-10-11' }, currentPass: null, jerseyEligibleForElite: true, tiers, sessions });

describe('iqPassDates', () => {
  it('weeks, labels, tile label, short venue, countdown', () => {
    const weeks = dates.buildWeeks('2026-09-14', '2026-10-11');
    expect(weeks.length).toBe(4); expect(weeks[0].label).toBe('14–20 Sep'); expect(weeks[2].label).toBe('28 Sep–4 Oct');
    expect(dates.buildWeeks('2026-09-16', '2026-10-13').length).toBe(5);
    expect(dates.tileLabel('2026-09-14', '20:00')).toBe('Mon 14 · 20:00');
    expect(dates.weekdayOf('2026-09-15')).toBe('Tue'); expect(dates.dayLetter('2026-09-20')).toBe('S');
    expect(dates.shortVenue(BRIGHT)).toBe('Bright Riders'); expect(dates.shortVenue('Dubai Sports Complex')).toBe('Dubai');
    const now = Date.UTC(2026, 8, 14, 12, 0, 0);
    expect(dates.countdownLabel(now + 45 * 60_000, now)).toBe('in 45m');
    expect(dates.countdownLabel(now + 27 * 3_600_000, now)).toBe('in 27h');
    expect(dates.countdownLabel(now + 4 * 86_400_000, now)).toBe('in 4d');
    expect(dates.countdownLabel(now - 1, now)).toBe('now');
  });
});

describe('IqPassPicker — weeks, cards, states', () => {
  beforeEach(() => setWidth(1024));

  it('a week is a teal overline + a row of cards for days with sessions only; cards carry number, venue, area, time, spots, rail', () => {
    const onToggle = vi.fn();
    render(<IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={[]} games={4} onToggle={onToggle} onReview={() => {}} canReview={false} reviewHint="" />);
    expect(screen.queryByTestId('iqp-calendar-grid')).toBeNull();
    expect(screen.queryAllByTestId(/^weekday-/).length).toBe(0);
    expect(screen.queryAllByTestId(/^day-\d{4}-/).length).toBe(0); // no empty day cells
    const weeks = screen.getAllByTestId(/^week-2026-/);
    expect(weeks.map((w) => w.getAttribute('data-testid'))).toEqual(['week-2026-09-14', 'week-2026-09-21', 'week-2026-09-28']); // 5–11 Oct has no session → no block
    const w1 = screen.getByTestId('week-2026-09-14');
    expect((w1 as HTMLElement).style.borderTopWidth).toBe('2px'); expect((w1 as HTMLElement).style.borderTopStyle).toBe('solid'); expect((w1 as HTMLElement).style.borderTopColor).toBe(rgb(IQP.teal));
    expect(within(w1).getByTestId('text-week-2026-09-14').textContent).toBe('14–20 Sep');
    expect((within(w1).getByTestId('text-week-2026-09-14') as HTMLElement).style.color).toBe(rgb(IQP.teal));
    expect(within(w1).getAllByTestId(/^card-session-/).length).toBe(6); // 15–20 Sep
    const c0 = screen.getByTestId('card-session-s0') as HTMLButtonElement;
    expect(c0.tagName).toBe('BUTTON'); expect(c0.hasAttribute('title')).toBe(false);
    const num = within(c0).getByTestId('text-day-s0') as HTMLElement;
    expect(num.textContent).toBe('15'); expect(num.style.fontSize).toBe('22px'); expect(num.style.fontWeight).toBe('800');
    expect(within(c0).getByTestId('text-weekday-s0').textContent).toBe('Tue');
    const venue = within(c0).getByTestId('text-venue-s0') as HTMLElement;
    expect(venue.textContent).toBe(SMASH); expect(venue.style.fontSize).toBe('14px'); expect(venue.style.fontWeight).toBe('600');
    const area = within(c0).getByTestId('text-area-s0') as HTMLElement;
    expect(area.textContent).toBe('Dubailand'); expect(area.style.fontSize).toBe('12px'); expect(area.style.color).toBe(rgb(IQP.inkSub));
    const time = within(c0).getByTestId('text-time-s0') as HTMLElement;
    expect(time.textContent).toBe('20:00–22:00'); expect(time.style.fontSize).toBe('13px'); expect(time.style.fontWeight).toBe('500');
    expect(within(c0).getByTestId('text-caption-s0').textContent).toBe('10 spots left');
    const rail = within(c0).getByTestId('rail-s0') as HTMLElement;
    expect(rail.style.width).toBe('4px'); expect(bg(rail)).toBe(rgb(venueColour(SMASH)));
    expect(bg(within(screen.getByTestId('card-session-s1')).getByTestId('rail-s1'))).toBe(rgb(venueColour(BRIGHT)));
    fireEvent.click(c0); expect(onToggle).toHaveBeenCalledWith('s0');
  });

  it('cap-reached cards sit at 40% with "Pass seats full", booked cards say "Booked", full ones "Full"; none is tappable, none has a tooltip', () => {
    const onToggle = vi.fn();
    render(<IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={[]} games={4} onToggle={onToggle} onReview={() => {}} canReview={false} reviewHint="" />);
    const capped = screen.getByTestId('card-session-s12') as HTMLButtonElement;
    expect(capped.style.opacity).toBe('0.4'); expect(capped.disabled).toBe(true); expect(capped.getAttribute('title')).toBeNull();
    expect(within(capped).getByTestId('text-caption-s12').textContent).toBe('Pass seats full');
    expect(within(screen.getByTestId('card-session-s11')).getByTestId('text-caption-s11').textContent).toBe('Booked');
    expect(within(screen.getByTestId('card-session-s13')).getByTestId('text-caption-s13').textContent).toBe('Full');
    fireEvent.click(capped); fireEvent.click(screen.getByTestId('card-session-s11')); expect(onToggle).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[title]').length).toBe(0);
  });

  it('slot bar: N empty outlines, picks fill venue-coloured tiles "Tue 15 · 20:00", tap a tile removes, full bar shows the single Review button', () => {
    const onToggle = vi.fn(); const onReview = vi.fn();
    const { rerender } = render(<IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={[]} games={4} onToggle={onToggle} onReview={onReview} canReview={false} reviewHint="" />);
    const bar = screen.getByTestId('bar-slots');
    expect(bar.style.position).toBe('sticky'); expect(bar.getAttribute('data-complete')).toBe('false');
    expect(screen.getAllByTestId(/^slot-\d$/).length).toBe(4);
    expect(screen.getAllByTestId(/^slot-\d$/).every((s) => s.getAttribute('data-filled') === 'false')).toBe(true);
    expect(screen.queryByTestId('button-continue')).toBeNull();
    expect(screen.queryByTestId('text-pick-count')).toBeNull();
    rerender(<QueryClientProvider client={new QueryClient()}><IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={['s0', 's1']} games={4} onToggle={onToggle} onReview={onReview} canReview={false} reviewHint="" /></QueryClientProvider>);
    expect(screen.getByTestId('slot-0').getAttribute('data-filled')).toBe('true');
    expect(screen.getByTestId('slot-2').getAttribute('data-filled')).toBe('false');
    const tile = screen.getByTestId('tile-s0') as HTMLButtonElement;
    expect(tile.textContent).toBe('Tue 15 · 20:00'); expect(bg(tile)).toBe(rgb(venueColour(SMASH))); expect(tile.style.color).toBe(rgb(IQP.white));
    expect(tile.getAttribute('aria-label')).toMatch(/Remove/);
    fireEvent.click(tile); expect(onToggle).toHaveBeenCalledWith('s0');
    const picked = screen.getByTestId('card-session-s0') as HTMLButtonElement;
    expect(picked.getAttribute('data-state')).toBe('picked'); expect(bg(picked)).toBe(rgb(IQP.navy)); expect(picked.style.color).toBe(rgb(IQP.cream));
    expect(within(picked).getByTestId('tick-s0').tagName.toLowerCase()).toBe('svg');
    rerender(<QueryClientProvider client={new QueryClient()}><IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={['s0', 's1', 's2', 's3']} games={4} onToggle={onToggle} onReview={onReview} canReview reviewHint="" /></QueryClientProvider>);
    expect(screen.getByTestId('bar-slots').getAttribute('data-complete')).toBe('true');
    const review = within(screen.getByTestId('bar-slots')).getByTestId('button-continue') as HTMLButtonElement;
    expect(review.textContent).toBe('Review'); expect(review.disabled).toBe(false);
    expect(within(screen.getByTestId('bar-slots')).getAllByRole('button').filter((b) => !b.getAttribute('data-testid')?.startsWith('tile-')).length).toBe(1);
    expect((screen.getByTestId('card-session-s4') as HTMLButtonElement).disabled).toBe(true); // a fifth pick is not allowed
    fireEvent.click(review); expect(onReview).toHaveBeenCalled();
  });

  it('the pick and the tile animate for 150ms (Web Animations, guarded for jsdom)', () => {
    const src = read('client/src/components/marketplace/IqPassPicker.tsx');
    expect(src).toMatch(/\.animate\?\.\(/);
    expect((src.match(/duration: 150/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('mobile (≤430px): full-width cards stacked in day order, the slot bar stays sticky, no strip', () => {
    setWidth(390);
    render(<IqPassPicker windowStart="2026-09-14" windowEnd="2026-10-11" sessions={sessions} picks={['s0']} games={4} onToggle={() => {}} onReview={() => {}} canReview={false} reviewHint="" />);
    expect((screen.getByTestId('card-session-s0') as HTMLElement).style.flexBasis).toBe('100%');
    expect(screen.getByTestId('bar-slots').style.position).toBe('sticky');
    expect(screen.queryByTestId('iqp-calendar-strip')).toBeNull();
    expect(screen.queryByTestId('button-week-next')).toBeNull();
    setWidth(1024);
  });
});

describe('MiniMonth (review screen)', () => {
  it('shows the picks as venue-coloured tiles on the window\'s weeks; other days are plain numbers', () => {
    render(<MiniMonth windowStart="2026-09-14" windowEnd="2026-10-11" picks={[sessions[0], sessions[1], sessions[6], sessions[13]]} />);
    const mm = screen.getByTestId('mini-month');
    expect(within(mm).getAllByTestId(/^mini-tile-/).length).toBe(4);
    const t0 = within(mm).getByTestId('mini-tile-s0') as HTMLElement;
    expect(t0.textContent).toBe('15'); expect(bg(t0)).toBe(rgb(venueColour(SMASH)));
    expect(within(mm).getByTestId('mini-day-2026-09-17').textContent).toBe('17'); // 17 Sep (s2) is not picked → plain number
    expect(within(mm).getAllByTestId(/^mini-week-/).length).toBe(4);
  });
});

describe('IqPass page — picks + review', () => {
  const stubFetch = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/marketplace/iq-pass/me')) return { ok: true, status: 200, json: async () => ({ packs: [] }) };
    if (String(url).includes('/api/marketplace/iq-pass/calendar')) return { ok: true, status: 200, json: async () => calendar() };
    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  }));
  beforeEach(() => { flagMock.enabled = true; setWidth(1024); stubFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); try { localStorage.clear(); } catch {} });

  it('picks step: the tier headline is the only H1 (28px/800), the picker replaces the grid, no counter and no view toggle', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('bar-slots');
    const h1s = document.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('Club — pick your 4 games');
    expect((h1s[0] as HTMLElement).style.fontSize).toBe('28px'); expect((h1s[0] as HTMLElement).style.fontWeight).toBe('800');
    expect(screen.getByTestId('text-eyebrow').textContent).toBe('IQ Pass');
    expect(screen.queryByTestId('iqp-calendar-grid')).toBeNull();
    expect(screen.queryByTestId('text-pick-count')).toBeNull();
    expect(screen.queryByTestId('button-view-list')).toBeNull();
    expect(screen.queryByTestId('button-view-calendar')).toBeNull();
    expect(screen.getAllByTestId(/^card-session-/).length).toBe(14);
    expect(document.body.textContent).not.toMatch(/per game|saving|save/i);
  });

  it('four picks → the bar becomes the Review bar → review: H1 "Your month is locked", tiles on a mini month, terms link, Pay pinned', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('bar-slots');
    for (const id of ['s0', 's1', 's2']) fireEvent.click(screen.getByTestId(`card-session-${id}`));
    expect(screen.queryByTestId('button-continue')).toBeNull();
    expect(screen.getByTestId('tile-s2').textContent).toBe('Thu 17 · 20:00');
    fireEvent.click(screen.getByTestId('tile-s2')); // remove via the tile
    expect(screen.queryByTestId('tile-s2')).toBeNull();
    for (const id of ['s2', 's3']) fireEvent.click(screen.getByTestId(`card-session-${id}`));
    const review = within(screen.getByTestId('bar-slots')).getByTestId('button-continue');
    fireEvent.click(review);
    const h1s = document.querySelectorAll('h1');
    expect(h1s.length).toBe(1); expect(h1s[0].textContent).toBe('Your month is locked');
    expect(within(screen.getByTestId('mini-month')).getAllByTestId(/^mini-tile-/).length).toBe(4);
    expect(screen.getByTestId('link-iq-pass-terms').getAttribute('href')).toBe('/iq-pass/terms');
    const pay = screen.getByTestId('bar-pay');
    expect(pay.style.position).toBe('fixed');
    expect(within(pay).getByTestId('button-pay').textContent).toMatch(/Pay AED 188/);
    expect(document.body.textContent).not.toMatch(/per game|saving|save/i);
  });

  it('desktop (1280): the Pay button is in the DOM, the Pay bar is fixed to the bottom edge, not hidden, and stacks above the install bar', async () => {
    // Bug (2026-09-14): InstallAppBar is fixed to the same bottom edge at z-40 on every marketplace page whenever
    // Chrome offers the PWA install; the Pay bar sat at z-30 behind it, so the review screen showed no Pay button.
    setWidth(1280);
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club'));
    await screen.findByTestId('bar-slots');
    for (const id of ['s0', 's1', 's2', 's3']) fireEvent.click(screen.getByTestId(`card-session-${id}`));
    fireEvent.click(within(screen.getByTestId('bar-slots')).getByTestId('button-continue'));
    await screen.findByTestId('text-review-title');
    const bar = screen.getByTestId('bar-pay') as HTMLElement;
    const pay = screen.getByTestId('button-pay') as HTMLButtonElement;
    expect(pay.isConnected).toBe(true); expect(pay.disabled).toBe(false);
    expect(bar.style.position).toBe('fixed'); expect(bar.style.bottom).toBe('0px');
    expect(bar.style.display).not.toBe('none'); expect(bar.style.visibility).not.toBe('hidden'); expect(bar.style.opacity).not.toBe('0');
    const installZ = Number(read('client/src/components/InstallAppBar.tsx').match(/\bz-(\d+)\b/)![1]);
    expect(installZ).toBe(40);
    expect(Number(bar.style.zIndex)).toBeGreaterThan(installZ);
    expect(Number(bar.style.zIndex)).toBeLessThan(50); // still under the sticky header (z-50)
  });

  it('Club Elite: with all 12 slots filled the Review button waits for the jersey size', async () => {
    mount(<IqPass />);
    fireEvent.click(await screen.findByTestId('card-tier-club_elite'));
    await screen.findByTestId('bar-slots');
    expect(screen.getAllByTestId(/^slot-\d+$/).length).toBe(12);
    for (let i = 0; i < 11; i++) fireEvent.click(screen.getByTestId(`card-session-s${i}`));
    expect(screen.queryByTestId('button-continue')).toBeNull(); // 11 of 12 — the fixture has exactly 11 pickable cards
    expect(screen.getByTestId('select-jersey-size')).toBeTruthy();
  });
});

describe('source pins', () => {
  it('picker + page: IQ Pass tokens only, shared venue map, Inter, no hex, no emoji, no icons, no gradients or heavy shadows, no savings copy', () => {
    for (const f of ['client/src/components/marketplace/IqPassPicker.tsx', 'client/src/pages/marketplace/IqPass.tsx']) {
      const src = read(f);
      expect(src, f).toMatch(/from '@\/lib\/iqPassTokens'/);
      expect(src, f).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
      expect(src, f).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(src, f).not.toMatch(/lucide-react/);
      expect(src, f).not.toMatch(/gradient|boxShadow: '0 [1-9]\d?px/i);
      expect(src, f).not.toMatch(/per game|saving/i);
    }
    expect(read('client/src/components/marketplace/IqPassPicker.tsx')).toMatch(/from '@\/lib\/venueColours'/);
    expect(read('client/src/pages/marketplace/IqPass.tsx')).toMatch(/from '@\/components\/marketplace\/IqPassPicker'/);
    expect(read('client/src/pages/marketplace/IqPass.tsx')).not.toMatch(/components\/marketplace\/IqPassCalendar/); // the grid component is gone from the page
  });
});
