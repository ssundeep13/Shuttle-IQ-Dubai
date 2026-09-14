// IQ Pass — a hold awaiting payment (Sandeep, 2026-09-14). Every surface that shows a pass (Dashboard card,
// My games hero, IQ Pass page, booking card) shows "Complete payment" with "Hold expires HH:mm" (Dubai) while the
// hold is live — reopening the SAME Ziina intent — and "Hold expired — pick again" (to the picker) once it lapses.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';

const flagMock = vi.hoisted(() => ({ enabled: true }));
vi.mock('../client/src/hooks/useIqPass', async (orig) => ({ ...(await orig<typeof import('../client/src/hooks/useIqPass')>()), useIqPassEnabled: () => flagMock.enabled, useIqPassConfig: () => ({ enabled: flagMock.enabled, tiers: [] }), useIqPassTiers: () => ({}) }));
vi.mock('../client/src/lib/nativeAuth', () => ({ openCheckoutRedirect: vi.fn().mockResolvedValue(undefined), nativeReturnFields: () => ({}), nativeReturnBody: () => undefined }));
vi.mock('framer-motion', async (orig) => ({ ...(await orig<typeof import('framer-motion')>()), useReducedMotion: () => true }));

const { pendingPassOf, holdExpiresLabel, dubaiTimeHm } = await import('../client/src/lib/iqPassPending');
const { IqPassPendingCard } = await import('../client/src/components/marketplace/IqPassPending');
const { default: MyBookings } = await import('../client/src/pages/marketplace/MyBookings');
const { default: IqPass } = await import('../client/src/pages/marketplace/IqPass');
const { openCheckoutRedirect } = await import('../client/src/lib/nativeAuth');
const { IQP } = await import('../client/src/lib/iqPassTokens');
const dates = await import('../client/src/lib/iqPassDates');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const MIN = 60_000; const H = 60 * MIN; const D = 24 * H;
const now = Date.now();
const LIVE = new Date(now + 20 * MIN).toISOString();
const LAPSED = new Date(now - 5 * MIN).toISOString();
const packRow = (over: Record<string, unknown> = {}) => ({
  id: 'pk-hold', tier: 'club', label: 'Club', status: 'pending_payment', gamesTotal: 4, repickCredits: 0, jerseySize: null, jerseyHandedOverAt: null, paidAt: null,
  holdExpiresAt: LIVE, cancellationReason: null, lastGameDate: null, seats: [] as unknown[], ...over,
});

describe('helpers', () => {
  it('dubaiTimeHm / holdExpiresLabel: the Dubai wall clock, 24 h — "Hold expires 18:31"', () => {
    expect(dubaiTimeHm('2026-09-14T14:31:00.000Z')).toBe('18:31');
    expect(dubaiTimeHm('2026-09-14T20:05:00.000Z')).toBe('00:05');
    expect(holdExpiresLabel('2026-09-14T14:31:00.000Z')).toBe('Hold expires 18:31');
  });

  it('pendingPassOf: a live hold is "pending" (even beside an active pass); a lapsed or swept hold is "expired" only while there is no active pass and for 24 h; other cancellations are nothing', () => {
    expect(pendingPassOf([packRow()], now)).toMatchObject({ kind: 'pending', packId: 'pk-hold', label: 'Club', holdExpiresAt: LIVE });
    expect(pendingPassOf([packRow({ id: 'pk-active', status: 'active' }), packRow()], now)).toMatchObject({ kind: 'pending', packId: 'pk-hold' });
    expect(pendingPassOf([packRow({ holdExpiresAt: LAPSED })], now)).toMatchObject({ kind: 'expired', packId: 'pk-hold', label: 'Club' });
    expect(pendingPassOf([packRow({ status: 'cancelled', cancellationReason: 'hold_expired', holdExpiresAt: LAPSED })], now)).toMatchObject({ kind: 'expired', packId: 'pk-hold' });
    expect(pendingPassOf([packRow({ id: 'pk-active', status: 'active', holdExpiresAt: new Date(now - 2 * D).toISOString() }), packRow({ holdExpiresAt: LAPSED })], now)).toBeNull();
    expect(pendingPassOf([packRow({ status: 'cancelled', cancellationReason: 'hold_expired', holdExpiresAt: new Date(now - 25 * H).toISOString() })], now)).toBeNull();
    expect(pendingPassOf([packRow({ status: 'cancelled', cancellationReason: 'seats_lost', holdExpiresAt: LAPSED })], now)).toBeNull();
    expect(pendingPassOf([], now)).toBeNull();
  });
});

describe('IqPassPendingCard', () => {
  it('pending: "Hold expires HH:mm" and a navy "Complete payment" button that calls onComplete; busy and error states', () => {
    const onComplete = vi.fn();
    const { rerender } = render(<IqPassPendingCard state={{ kind: 'pending', packId: 'pk-hold', label: 'Club', holdExpiresAt: '2026-09-14T14:31:00.000Z' }} onComplete={onComplete} />);
    const card = screen.getByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('pending');
    expect(within(card).getByTestId('text-hold-expires').textContent).toBe('Hold expires 18:31');
    const btn = within(card).getByTestId('button-complete-payment') as HTMLButtonElement;
    expect(btn.textContent).toBe('Complete payment');
    expect(btn.style.backgroundColor).toBe(rgb(IQP.navy));
    fireEvent.click(btn);
    expect(onComplete).toHaveBeenCalledTimes(1);
    rerender(<IqPassPendingCard state={{ kind: 'pending', packId: 'pk-hold', label: 'Club', holdExpiresAt: '2026-09-14T14:31:00.000Z' }} onComplete={onComplete} busy error="Could not reopen the payment. Please try again." />);
    expect((screen.getByTestId('button-complete-payment') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('text-iq-pass-pending-error').textContent).toBe('Could not reopen the payment. Please try again.');
    expect(within(card).queryByTestId('link-pick-again')).toBeNull();
  });

  it('expired: "Hold expired — pick again" links to the picker; with onPickAgain it is a button instead', () => {
    const { unmount } = render(<IqPassPendingCard state={{ kind: 'expired', packId: 'pk-hold', label: 'Club' }} onComplete={() => {}} />);
    const card = screen.getByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('expired');
    const link = within(card).getByTestId('link-pick-again') as HTMLAnchorElement;
    expect(link.textContent).toBe('Hold expired — pick again');
    expect(link.getAttribute('href')).toBe('/marketplace/iq-pass?pick=1');
    expect(within(card).queryByTestId('button-complete-payment')).toBeNull();
    expect(within(card).queryByTestId('text-hold-expires')).toBeNull();
    unmount();
    const onPickAgain = vi.fn();
    render(<IqPassPendingCard state={{ kind: 'expired', packId: 'pk-hold', label: 'Club' }} onComplete={() => {}} onPickAgain={onPickAgain} />);
    const btn = screen.getByTestId('button-pick-again');
    expect(btn.textContent).toBe('Hold expired — pick again');
    fireEvent.click(btn);
    expect(onPickAgain).toHaveBeenCalledTimes(1);
  });

  it('brand: IQ Pass tokens only, Inter, no hex, no emoji, no icons, no gradients; the navy variant for the hero slot', () => {
    const src = read('client/src/components/marketplace/IqPassPending.tsx');
    expect(src).toMatch(/from '@\/lib\/iqPassTokens'/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(src).not.toMatch(/lucide-react|linear-gradient|box-shadow/);
    render(<IqPassPendingCard onDark state={{ kind: 'pending', packId: 'pk-hold', label: 'Club', holdExpiresAt: LIVE }} onComplete={() => {}} />);
    const card = screen.getByTestId('card-iq-pass-pending') as HTMLElement;
    expect(card.style.background || card.style.backgroundColor).toBe(rgb(IQP.navy));
  });
});

// ── Page fixtures ──────────────────────────────────────────────────────────────
const today = dates.todayDubai(now);
const upDay = dates.addDays(today, 3);
const session = (id: string, ymd: string, venueName: string, startTime = '20:00') => ({ id, title: `${venueName} Session`, venueName, venueLocation: null, date: `${ymd}T00:00:00.000Z`, startTime, endTime: '22:00', capacity: 18, priceAed: 49, status: 'upcoming', courtCount: 3 });
const booking = (id: string, over: Record<string, unknown>) => ({
  id, userId: 'u-1', sessionId: `sess-${id}`, status: 'confirmed', paymentMethod: 'ziina', amountAed: 49, cashPaid: false, spotsBooked: 1, waitlistPosition: null,
  createdAt: new Date(now - 10 * MIN).toISOString(), promotedAt: null, packId: null, walletAmountUsed: 0, ziinaPaymentIntentId: null, guests: [], isGuestBooking: false, totalPaidAed: 49, venueArea: null, ...over,
});
const heldSeat = booking('b-held', { packId: 'pk-hold', paymentMethod: 'iq_pass', status: 'pending_payment', amountAed: 47, totalPaidAed: 47, venueArea: 'Dubailand', session: session('s-held', upDay, 'Smash Sports Academy'), sessionId: 's-held' });
const heldPack = (over: Record<string, unknown> = {}) => packRow({ lastGameDate: upDay, seats: [{ bookingId: 'b-held', sessionId: 's-held', status: 'pending_payment', session: { title: 'Smash Session', venueName: 'Smash Sports Academy', date: `${upDay}T00:00:00.000Z`, startTime: '20:00', endTime: '22:00' }, canMoveUntil: new Date(now + D).toISOString(), canMove: false }], ...over });
const calendar = { window: { start: today, end: dates.addDays(today, 27) }, currentPass: null, jerseyEligibleForElite: false, tiers: { club: { label: 'Club', games: 4, priceAed: 188 }, club_plus: { label: 'Club Plus', games: 8, priceAed: 360 }, club_elite: { label: 'Club Elite', games: 12, priceAed: 516 } }, sessions: [] };

let handlers: Record<string, () => unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
const mount = (el: React.ReactElement) => {
  fetchMock = vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k));
    return key ? { ok: true, status: 200, json: async () => handlers[key](), text: async () => JSON.stringify(handlers[key]()) } : { ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => 'Not found' };
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join('/'))).json() } } });
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
};
const resumeCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/marketplace/iq-pass/packs/pk-hold/resume') && (c[1] as RequestInit | undefined)?.method === 'POST');

beforeEach(() => {
  flagMock.enabled = true;
  Element.prototype.scrollIntoView = vi.fn();
  (openCheckoutRedirect as ReturnType<typeof vi.fn>).mockClear();
  handlers = {
    '/api/marketplace/config': () => ({ iqPassEnabled: true, iqPassTiers: [] }),
    '/api/marketplace/bookings/mine': () => [heldSeat],
    '/api/marketplace/me/wallet': () => ({ walletBalance: 0 }),
    '/api/marketplace/iq-pass/me': () => ({ packs: [heldPack()] }),
    '/api/marketplace/iq-pass/calendar': () => calendar,
    '/api/marketplace/iq-pass/packs/pk-hold/resume': () => ({ redirectUrl: 'https://pay.ziina.com/resume', holdExpiresAt: LIVE }),
  };
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('My games', () => {
  it('a live hold: the hero slot is the navy pending card (hold expiry + Complete payment), no next-game hero for a held seat, the held seat sits in the agenda as "Payment due"', async () => {
    mount(<MyBookings />);
    const card = await screen.findByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('pending');
    expect(within(card).getByTestId('text-hold-expires').textContent).toBe(holdExpiresLabel(LIVE));
    expect(screen.queryByTestId('card-next-game')).toBeNull();
    expect(screen.queryByTestId('empty-upcoming')).toBeNull();
    const strip = screen.getByTestId('strip-days');
    expect(card.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const row = screen.getByTestId('row-game-b-held');
    expect(within(row).getByTestId('chip-status-b-held').textContent).toBe('Payment due');
    fireEvent.click(within(card).getByTestId('button-complete-payment'));
    await waitFor(() => expect(resumeCalls().length).toBe(1));
    await waitFor(() => expect(openCheckoutRedirect).toHaveBeenCalledWith('https://pay.ziina.com/resume'));
  });

  it('the booking card of a held seat: "Hold expires HH:mm" + Complete payment (same intent), never Pay Now or cancel', async () => {
    mount(<MyBookings />);
    await screen.findByTestId('card-iq-pass-pending');
    fireEvent.click(screen.getByTestId('button-details-b-held'));
    const details = await screen.findByTestId('details-b-held');
    expect(within(details).getByTestId('text-hold-expires-b-held').textContent).toBe(holdExpiresLabel(LIVE));
    const btn = within(details).getByTestId('button-complete-pass-payment-b-held');
    expect(btn.textContent).toBe('Complete payment');
    expect(within(details).queryByTestId('button-complete-payment-b-held')).toBeNull();
    expect(within(details).queryByTestId('banner-payment-due-b-held')).toBeNull();
    expect(within(details).queryByText(/cancel/i)).toBeNull();
    fireEvent.click(btn);
    await waitFor(() => expect(resumeCalls().length).toBe(1));
    await waitFor(() => expect(openCheckoutRedirect).toHaveBeenCalledWith('https://pay.ziina.com/resume'));
  });

  it('a lapsed hold (not yet swept): "Hold expired — pick again" in the hero slot and on the booking card, no Complete payment anywhere', async () => {
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [heldPack({ holdExpiresAt: LAPSED })] });
    mount(<MyBookings />);
    const card = await screen.findByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('expired');
    expect(within(card).getByTestId('link-pick-again').getAttribute('href')).toBe('/marketplace/iq-pass?pick=1');
    expect(screen.queryByTestId('button-complete-payment')).toBeNull();
    fireEvent.click(screen.getByTestId('button-details-b-held'));
    const details = await screen.findByTestId('details-b-held');
    expect(within(details).getByTestId('link-pick-again-b-held').textContent).toBe('Hold expired — pick again');
    expect(within(details).queryByTestId('button-complete-pass-payment-b-held')).toBeNull();
  });

  it('a swept hold (pack cancelled, seats gone): the expired card stands alone above the strip — no "Nothing booked." card beside it', async () => {
    handlers['/api/marketplace/bookings/mine'] = () => [{ ...heldSeat, status: 'cancelled' }];
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [heldPack({ status: 'cancelled', cancellationReason: 'hold_expired', holdExpiresAt: LAPSED, seats: [] })] });
    mount(<MyBookings />);
    const card = await screen.findByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('expired');
    expect(screen.queryByTestId('empty-upcoming')).toBeNull();
    expect(screen.queryByTestId('card-next-game')).toBeNull();
    expect(screen.getByTestId('strip-days')).toBeTruthy();
  });

  it('the pending card takes the hero only while /iq-pass/me answers: with the packs list unavailable the held seat stays the hero, never "Nothing booked."', async () => {
    delete handlers['/api/marketplace/iq-pass/me'];
    mount(<MyBookings />);
    const hero = await screen.findByTestId('card-next-game');
    expect(within(hero).getByTestId('text-next-status').textContent).toBe('Payment due');
    expect(screen.queryByTestId('empty-upcoming')).toBeNull();
    expect(screen.queryByTestId('card-iq-pass-pending')).toBeNull();
  });

  it('a live hold beside a confirmed drop-in: the pending card sits above the next-game hero as the light variant — one navy slab, not two', async () => {
    const dropIn = booking('b-drop', { venueArea: 'Green Community', session: session('s-drop', dates.addDays(today, 5), 'Bright Riders School Dubai', '18:00'), sessionId: 's-drop' });
    handlers['/api/marketplace/bookings/mine'] = () => [heldSeat, dropIn];
    mount(<MyBookings />);
    const card = await screen.findByTestId('card-iq-pass-pending') as HTMLElement;
    const hero = screen.getByTestId('card-next-game');
    expect(card.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.style.backgroundColor).toBe(rgb(IQP.white));
    expect(within(hero).getByTestId('text-next-venue').textContent).toMatch(/Bright Riders/);
  });

  it('booking card: a failed Complete payment shows its reason on the card; the lapsed link is a 44 px control and the footer says the hold expired', async () => {
    handlers['/api/marketplace/iq-pass/packs/pk-hold/resume'] = () => ({ error: 'intent_unavailable' });
    mount(<MyBookings />);
    await screen.findByTestId('card-iq-pass-pending');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      if (!key) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => 'Not found' };
      const status = key.endsWith('/resume') && init?.method === 'POST' ? 409 : 200;
      return { ok: status < 400, status, json: async () => handlers[key](), text: async () => JSON.stringify(handlers[key]()) };
    });
    fireEvent.click(screen.getByTestId('button-details-b-held'));
    const details = await screen.findByTestId('details-b-held');
    fireEvent.click(within(details).getByTestId('button-complete-pass-payment-b-held'));
    expect((await within(details).findByTestId('text-pass-hold-error-b-held')).textContent).toMatch(/can no longer be opened/);
    expect(openCheckoutRedirect).not.toHaveBeenCalled();
  });

  it('booking card, lapsed: the pick-again link is a 44 px control and the footer agrees with the banner ("hold expired")', async () => {
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [heldPack({ holdExpiresAt: LAPSED })] });
    mount(<MyBookings />);
    await screen.findByTestId('card-iq-pass-pending');
    fireEvent.click(screen.getByTestId('button-details-b-held'));
    const details = await screen.findByTestId('details-b-held');
    const link = within(details).getByTestId('link-pick-again-b-held') as HTMLElement;
    expect(link.style.minHeight).toBe('44px');
    expect(within(details).getByTestId('text-booking-iqpass-b-held').textContent).toMatch(/hold expired/);
  });

  it('no hold: nothing changes — the empty state as before', async () => {
    handlers['/api/marketplace/bookings/mine'] = () => [];
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [] });
    mount(<MyBookings />);
    await screen.findByTestId('empty-upcoming');
    expect(screen.queryByTestId('card-iq-pass-pending')).toBeNull();
  });
});

describe('IQ Pass page', () => {
  it('a live hold: the pending card with Complete payment + hold expiry replaces the tier chooser; Complete payment reopens the same intent', async () => {
    mount(<IqPass />);
    const card = await screen.findByTestId('card-iq-pass-pending');
    expect(within(card).getByTestId('text-hold-expires').textContent).toBe(holdExpiresLabel(LIVE));
    expect(screen.queryByTestId('card-tier-club')).toBeNull();
    expect(screen.queryByText(/awaiting payment/)).toBeNull();
    fireEvent.click(within(card).getByTestId('button-complete-payment'));
    await waitFor(() => expect(resumeCalls().length).toBe(1));
    await waitFor(() => expect(openCheckoutRedirect).toHaveBeenCalledWith('https://pay.ziina.com/resume'));
  });

  it('a lapsed hold: "Hold expired — pick again" stands alone; the button opens the tier chooser, and the card never follows the player into the picker', async () => {
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [heldPack({ holdExpiresAt: LAPSED })] });
    mount(<IqPass />);
    const card = await screen.findByTestId('card-iq-pass-pending');
    expect(card.getAttribute('data-state')).toBe('expired');
    expect(screen.queryByTestId('card-tier-club')).toBeNull();
    const btn = within(card).getByTestId('button-pick-again');
    expect(btn.textContent).toBe('Hold expired — pick again');
    fireEvent.click(btn);
    expect(await screen.findByTestId('card-tier-club')).toBeTruthy();
    expect(screen.queryByTestId('button-complete-payment')).toBeNull();
    fireEvent.click(screen.getByTestId('card-tier-club'));
    await screen.findByTestId('text-step-title');
    expect(screen.queryByTestId('card-iq-pass-pending')).toBeNull();
  });

  it('?pick=1 opens the tier chooser straight away, even with an active pass on the page', async () => {
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [packRow({ id: 'pk-active', status: 'active', paidAt: new Date(now - D).toISOString(), holdExpiresAt: new Date(now - D).toISOString() })] });
    window.history.replaceState({}, '', '/marketplace/iq-pass?pick=1');
    mount(<IqPass />);
    expect(await screen.findByTestId('card-tier-club')).toBeTruthy();
    expect(screen.queryByTestId('card-iq-pass-pending')).toBeNull();
  });

  it('the resume route answering hold_expired flips the card to expired without a reload', async () => {
    handlers['/api/marketplace/iq-pass/packs/pk-hold/resume'] = () => ({ error: 'hold_expired' });
    let calls = 0;
    handlers['/api/marketplace/iq-pass/me'] = () => ({ packs: [heldPack({ holdExpiresAt: calls++ === 0 ? LIVE : LAPSED })] });
    mount(<IqPass />);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      if (!key) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }), text: async () => 'Not found' };
      const status = key.endsWith('/resume') && init?.method === 'POST' ? 409 : 200;
      return { ok: status < 400, status, json: async () => handlers[key](), text: async () => JSON.stringify(handlers[key]()) };
    });
    const card = await screen.findByTestId('card-iq-pass-pending');
    fireEvent.click(within(card).getByTestId('button-complete-payment'));
    await waitFor(() => expect(screen.getByTestId('card-iq-pass-pending').getAttribute('data-state')).toBe('expired'));
    expect(screen.getByTestId('text-iq-pass-pending-error').textContent).toBe('This hold has expired. Pick your games again.');
    expect(openCheckoutRedirect).not.toHaveBeenCalled();
  });
});

describe('IqPassPendingSlot (owns the minute tick so the pages do not re-render every minute)', () => {
  it('renders the card from the packs list, nothing when there is no hold; the pages never call useMinuteNow in their bodies', async () => {
    const { IqPassPendingSlot } = await import('../client/src/components/marketplace/IqPassPending');
    const { unmount } = render(<IqPassPendingSlot packs={[packRow()]} onComplete={() => {}} />);
    expect(screen.getByTestId('card-iq-pass-pending').getAttribute('data-state')).toBe('pending');
    unmount();
    render(<IqPassPendingSlot packs={[]} onComplete={() => {}} />);
    expect(screen.queryByTestId('card-iq-pass-pending')).toBeNull();
    expect(read('client/src/pages/marketplace/MyBookings.tsx')).not.toMatch(/useMinuteNow\(\)/);
    expect(read('client/src/pages/marketplace/Dashboard.tsx')).not.toMatch(/useMinuteNow\(\)/);
  });
});

describe('Dashboard (source pins — the page is not mounted in jsdom)', () => {
  it('the IQ Pass slot renders the pending card before the progress line and the promo card, from /iq-pass/me', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(src).toMatch(/import \{ IqPassPendingSlot \} from '@\/components\/marketplace\/IqPassPending'/);
    expect(src).toMatch(/import \{ pendingPassOf \} from '@\/lib\/iqPassPending'/);
    expect(src).toMatch(/useMyPacks\(\)/);
    const slot = src.slice(src.indexOf('{iqPass.enabled && ('), src.indexOf('{iqPass.enabled && (') + 900);
    expect(slot.indexOf('IqPassPendingSlot')).toBeGreaterThan(-1);
    expect(slot.indexOf('IqPassPendingSlot')).toBeLessThan(slot.indexOf('IqPassProgressLine'));
    expect(slot.indexOf('IqPassProgressLine')).toBeLessThan(slot.indexOf('IqPassPromoCard'));
  });
});
