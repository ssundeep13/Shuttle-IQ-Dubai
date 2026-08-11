/**
 * Option A Gate 3 — every roster/check-in/display surface obeys one rule:
 * a person plays iff their booking_guests row is active. No-row (legacy /
 * admin-cash bookings) = active. Unit-tests the shared helper; pins each
 * surface's source to it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { primarySlotActive } from '../shared/utils/slotUtils';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('shared rule — primarySlotActive', () => {
  it('no rows at all (legacy/admin-cash) → active', () => {
    expect(primarySlotActive([])).toBe(true);
    expect(primarySlotActive(undefined)).toBe(true);
    expect(primarySlotActive(null)).toBe(true);
  });
  it('guests only, no primary row → active', () => {
    expect(primarySlotActive([{ isPrimary: false, status: 'cancelled' }])).toBe(true);
  });
  it('primary row confirmed/pending → active', () => {
    expect(primarySlotActive([{ isPrimary: true, status: 'confirmed' }])).toBe(true);
    expect(primarySlotActive([{ isPrimary: true, status: 'pending' }])).toBe(true);
  });
  it('primary row cancelled → NOT active', () => {
    expect(primarySlotActive([{ isPrimary: true, status: 'cancelled' }, { isPrimary: false, status: 'confirmed' }])).toBe(false);
  });
});

describe('S1 — roster feed nulls an inactive primary, keeps the booking for its guests', () => {
  const s = read('server/routes.ts');
  it('feed computes primaryActive and nulls user/player when inactive', () => {
    const ep = s.slice(s.indexOf('app.get("/api/sessions/:id/bookings"'), s.indexOf('ensure-player'));
    expect(ep.includes('primarySlotActive(')).toBe(true);
    expect(ep.includes('primaryActive')).toBe(true);
  });
});

describe('S2 — check-in sheet hides the inactive primary row, keeps guest rows', () => {
  const s = read('client/src/components/AddPlayerModal.tsx');
  it('primary row render is gated on primaryActive', () => {
    expect(s.includes('primaryActive !== false')).toBe(true);
  });
});

describe('S3 — check-in write guards', () => {
  const routes = read('server/routes.ts');
  const mroutes = read('server/marketplace-routes.ts');
  const storage = read('server/storage.ts');
  const MSG = 'This spot was cancelled.';

  it('admin /attend refuses an inactive primary', () => {
    const ep = mroutes.slice(mroutes.indexOf('app.post("/api/marketplace/bookings/:id/attend"'), mroutes.indexOf('Self-serve check-in'));
    expect(ep.includes(MSG)).toBe(true);
    expect(ep.includes('primarySlotActive(')).toBe(true);
  });
  it('self check-in route refuses an inactive primary before the tx', () => {
    const ep = mroutes.slice(mroutes.indexOf('"/api/marketplace/sessions/:bookableSessionId/checkin"'), mroutes.indexOf('PR2: attendance-based referral trigger'));
    expect(ep.includes(MSG)).toBe(true);
    expect(ep.includes('primarySlotActive(')).toBe(true);
  });
  it('check-in transaction re-checks inside the lock (PRIMARY_SLOT_CANCELLED)', () => {
    expect(storage.includes('PRIMARY_SLOT_CANCELLED')).toBe(true);
  });
  it('roster check-in blocks only when NO active slot remains (guest stamps stay possible)', () => {
    const ep = routes.slice(routes.indexOf('/bookings/:bookingId/checkin'), routes.indexOf('/bookings/:bookingId/checkin') + 2200);
    expect(ep.includes(MSG)).toBe(true);
    expect(/activeSlotCount|anyActiveSlot|hasActiveSlot/.test(ep)).toBe(true);
  });
});

describe('S4 — Who\'s Playing pushes the primary only when active', () => {
  const s = read('server/marketplace-routes.ts');
  it('Main booker push is conditional', () => {
    const ep = s.slice(s.indexOf('get confirmed player list'), s.indexOf('get confirmed player list') + 2600);
    expect(ep.includes('primarySlotActive(')).toBe(true);
  });
});

describe('S5 — Play + Dashboard gate "all set" on the viewer\'s own slot', () => {
  it('Play.tsx todaysBooking requires an active primary slot', () => {
    const s = read('client/src/pages/marketplace/Play.tsx');
    expect(s.includes('primarySlotActive(')).toBe(true);
  });
  it('Dashboard eligibility requires an active primary slot', () => {
    const s = read('client/src/pages/marketplace/Dashboard.tsx');
    expect(s.includes('primarySlotActive(')).toBe(true);
  });
});

describe('S6 — admin card + WhatsApp count active slots only', () => {
  const s = read('client/src/pages/SessionsManagement.tsx');
  it('slot sums no longer hardcode the primary', () => {
    expect(s.includes('sum + 1 + activeGuestCount')).toBe(false);
    expect(s.includes('primarySlotActive(')).toBe(true);
  });
  it('cancelled guest chip is reachable (guest list no longer pre-filters to confirmed)', () => {
    const row = s.slice(s.indexOf('text-admin-guest-') - 600, s.indexOf('text-admin-guest-'));
    expect(row.includes("g.status === 'confirmed'")).toBe(false);
  });
});

describe('S7 — badges: attendance credit only with an active own slot', () => {
  const s = read('server/badges.ts');
  it('both aggregate queries exclude cancelled-primary bookings, no-row credits', () => {
    const matches = s.match(/NOT EXISTS[\s\S]{0,180}?is_primary[\s\S]{0,80}?'cancelled'/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('S8 — MyBookings guests-section gate ignores the primary row', () => {
  it(':467 gate filters !isPrimary like the inner list', () => {
    const s = read('client/src/pages/marketplace/MyBookings.tsx');
    const gate = s.slice(s.indexOf('{/* Guests section */}'), s.indexOf('{/* Guests section */}') + 400);
    expect(gate.includes('!g.isPrimary')).toBe(true);
  });
});
