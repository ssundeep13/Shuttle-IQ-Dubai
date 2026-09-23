// Tournament Gate 1 — the strict tier map and the pure registration rules.
// No DB and no clock: every instant is passed in. Every deadline is an
// EXCLUSIVE instant (open while now < X), so "closes 23:59 Thu 8 Oct Dubai"
// is 2026-10-08T20:00:00Z and a registration at 23:59:59.999 still counts.
import { describe, it, expect } from 'vitest';
import { TOURNAMENT_TIERS, isTournamentTier, tournamentTierFor } from '../shared/tournamentTiers';
import { getTierDisplayName } from '../shared/utils/skillUtils';
import {
  decideRegistration,
  registrationPhase,
  canRegister,
  isVisibleTo,
  holdExpiresAt,
  canPromote,
  withdrawOutcome,
} from '../server/tournament/rules';

const Z = (iso: string) => new Date(iso);

describe('tournamentTierFor — strict, frozen on the registration row', () => {
  it('maps the five production levels (Novice registers as Beginner, DB Advanced is Professional)', () => {
    expect(tournamentTierFor('Novice')).toBe('Beginner');
    expect(tournamentTierFor('Beginner')).toBe('Beginner');
    expect(tournamentTierFor('lower_intermediate')).toBe('Intermediate');
    expect(tournamentTierFor('upper_intermediate')).toBe('Competitive');
    expect(tournamentTierFor('Advanced')).toBe('Professional');
  });

  it('accepts the legacy display-name aliases getTierDisplayName treats as valid', () => {
    for (const alias of ['Intermediate', 'Competitive', 'Professional'] as const) {
      expect(tournamentTierFor(alias)).toBe(alias);
    }
  });

  it('agrees with getTierDisplayName for every known level except the Novice fold', () => {
    for (const level of ['Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional', 'Intermediate', 'Competitive']) {
      expect(tournamentTierFor(level)).toBe(getTierDisplayName(level));
    }
    expect(getTierDisplayName('Novice')).toBe('Novice');
    expect(tournamentTierFor('Novice')).toBe('Beginner');
  });

  it('refuses anything else instead of silently defaulting to Intermediate', () => {
    for (const bad of ['', 'intermediate', 'ADVANCED', 'Expert', ' Beginner', 'Novice ', 'null', null, undefined]) {
      expect(tournamentTierFor(bad as string | null | undefined)).toBeNull();
    }
  });

  it('the tier keys are exactly the four cap keys, in draft order', () => {
    expect([...TOURNAMENT_TIERS]).toEqual(['Professional', 'Competitive', 'Intermediate', 'Beginner']);
    expect(isTournamentTier('Beginner')).toBe(true);
    expect(isTournamentTier('Novice')).toBe(false);
    expect(isTournamentTier('Advanced')).toBe(false);
    expect(isTournamentTier(undefined)).toBe(false);
  });
});

describe('decideRegistration — held = confirmed + pending_payment; waiting players own freed seats', () => {
  const caps = { cap: 6, waitlistCap: 2 };

  it('takes a seat while held + waitlisted stays under the cap', () => {
    expect(decideRegistration({ held: 0, waitlisted: 0 }, caps)).toBe('hold');
    expect(decideRegistration({ held: 5, waitlisted: 0 }, caps)).toBe('hold');
    expect(decideRegistration({ held: 4, waitlisted: 1 }, caps)).toBe('hold');
  });

  it('joins the waitlist once the tier is full, up to the waitlist cap', () => {
    expect(decideRegistration({ held: 6, waitlisted: 0 }, caps)).toBe('waitlist');
    expect(decideRegistration({ held: 6, waitlisted: 1 }, caps)).toBe('waitlist');
    expect(decideRegistration({ held: 6, waitlisted: 2 }, caps)).toBe('full');
  });

  it('never lets a newcomer jump a waiting player for a freed seat', () => {
    // one seat free, one player already waiting → that seat is theirs
    expect(decideRegistration({ held: 5, waitlisted: 1 }, caps)).toBe('waitlist');
    expect(decideRegistration({ held: 5, waitlisted: 2 }, caps)).toBe('full');
  });

  it('works for the 18-seat tiers too', () => {
    expect(decideRegistration({ held: 17, waitlisted: 0 }, { cap: 18, waitlistCap: 2 })).toBe('hold');
    expect(decideRegistration({ held: 18, waitlisted: 0 }, { cap: 18, waitlistCap: 2 })).toBe('waitlist');
  });
});

describe('registrationPhase — two-stage open (members 12:00, everyone 18:00 Dubai on Fri 25 Sep)', () => {
  const t = {
    registrationOpensAtMembers: Z('2026-09-25T08:00:00Z'),
    registrationOpensAt: Z('2026-09-25T14:00:00Z'),
    registrationClosesAt: Z('2026-10-08T20:00:00Z'),
  };

  it('moves before_open → members_only → open → closed at the exact instants', () => {
    expect(registrationPhase(t, Z('2026-09-25T07:59:59.999Z'))).toBe('before_open');
    expect(registrationPhase(t, Z('2026-09-25T08:00:00Z'))).toBe('members_only');
    expect(registrationPhase(t, Z('2026-09-25T13:59:59.999Z'))).toBe('members_only');
    expect(registrationPhase(t, Z('2026-09-25T14:00:00Z'))).toBe('open');
    expect(registrationPhase(t, Z('2026-10-08T19:59:59.999Z'))).toBe('open'); // 23:59:59.999 Dubai still registers
    expect(registrationPhase(t, Z('2026-10-08T20:00:00Z'))).toBe('closed');
  });

  it('without a members instant there is no members-only stage', () => {
    const plain = { ...t, registrationOpensAtMembers: null };
    expect(registrationPhase(plain, Z('2026-09-25T08:00:00Z'))).toBe('before_open');
    expect(registrationPhase(plain, Z('2026-09-25T14:00:00Z'))).toBe('open');
  });

  it('who may register, and who may see the page, banner and pinned row, in each phase', () => {
    expect([canRegister('before_open', true), canRegister('before_open', false)]).toEqual([false, false]);
    expect([canRegister('members_only', true), canRegister('members_only', false)]).toEqual([true, false]);
    expect([canRegister('open', true), canRegister('open', false)]).toEqual([true, true]);
    expect([canRegister('closed', true), canRegister('closed', false)]).toEqual([false, false]);

    expect([isVisibleTo('before_open', true), isVisibleTo('before_open', false)]).toEqual([false, false]);
    expect([isVisibleTo('members_only', true), isVisibleTo('members_only', false)]).toEqual([true, false]);
    expect([isVisibleTo('open', true), isVisibleTo('open', false)]).toEqual([true, true]);
    expect([isVisibleTo('closed', true), isVisibleTo('closed', false)]).toEqual([true, true]);
  });
});

describe('holdExpiresAt / canPromote — 24 h to pay, never past the draft cut-off (Q3)', () => {
  const cutoff = Z('2026-10-10T20:00:00Z'); // last second Sat 10 Oct 23:59:59 Dubai

  it('a registration just before close keeps its full 24 h', () => {
    expect(holdExpiresAt(Z('2026-10-08T19:59:59Z'), 1440, cutoff).toISOString()).toBe('2026-10-09T19:59:59.000Z');
  });

  it('a late promotion is capped at the cut-off', () => {
    expect(holdExpiresAt(Z('2026-10-10T10:00:00Z'), 1440, cutoff).toISOString()).toBe('2026-10-10T20:00:00.000Z');
  });

  it('promotions stop at the cut-off (exclusive)', () => {
    expect(canPromote(Z('2026-10-10T19:59:59.999Z'), cutoff)).toBe(true);
    expect(canPromote(Z('2026-10-10T20:00:00Z'), cutoff)).toBe(false);
  });
});

describe('withdrawOutcome — refund before close, seat-only until the cut-off, blocked after (Q4)', () => {
  const t = { withdrawDeadlineAt: Z('2026-10-08T20:00:00Z'), draftCutoffAt: Z('2026-10-10T20:00:00Z') };

  it('a paid entry withdrawn before the deadline is owed a refund (recorded, done in the Ziina dashboard)', () => {
    expect(withdrawOutcome({ status: 'confirmed', paid: true }, Z('2026-10-08T19:59:59Z'), t)).toEqual({ allowed: true, refund: 'pending' });
  });

  it('a paid entry withdrawn on 9–10 Oct frees the seat with no refund', () => {
    expect(withdrawOutcome({ status: 'confirmed', paid: true }, Z('2026-10-08T20:00:00Z'), t)).toEqual({ allowed: true, refund: 'not_due' });
    expect(withdrawOutcome({ status: 'confirmed', paid: true }, Z('2026-10-10T19:59:59Z'), t)).toEqual({ allowed: true, refund: 'not_due' });
  });

  it('nothing paid → nothing to refund', () => {
    expect(withdrawOutcome({ status: 'pending_payment', paid: false }, Z('2026-10-01T00:00:00Z'), t)).toEqual({ allowed: true, refund: null });
    expect(withdrawOutcome({ status: 'waitlisted', paid: false }, Z('2026-10-01T00:00:00Z'), t)).toEqual({ allowed: true, refund: null });
  });

  it('blocked from the cut-off, and for rows that are no longer active', () => {
    expect(withdrawOutcome({ status: 'confirmed', paid: true }, Z('2026-10-10T20:00:00Z'), t)).toEqual({ allowed: false, reason: 'after_cutoff' });
    for (const status of ['withdrawn', 'expired', 'cancelled']) {
      expect(withdrawOutcome({ status, paid: false }, Z('2026-10-01T00:00:00Z'), t)).toEqual({ allowed: false, reason: 'not_active' });
    }
  });
});

describe('accessFor — Gate 2: members, the preview list, everyone', () => {
  it('a preview account sees the page and may register before the open (Sandeep’s pre-open AED 100 test)', async () => {
    const { accessFor } = await import('../server/tournament/rules');
    expect(accessFor('before_open', { isMember: false, isPreview: true })).toEqual({ visible: true, canRegister: true });
    expect(accessFor('members_only', { isMember: false, isPreview: true })).toEqual({ visible: true, canRegister: true });
    expect(accessFor('closed', { isMember: false, isPreview: true })).toEqual({ visible: true, canRegister: false });
  });

  it('members get the members stage; everyone else waits for the open', async () => {
    const { accessFor } = await import('../server/tournament/rules');
    expect(accessFor('before_open', { isMember: true, isPreview: false })).toEqual({ visible: false, canRegister: false });
    expect(accessFor('members_only', { isMember: true, isPreview: false })).toEqual({ visible: true, canRegister: true });
    expect(accessFor('members_only', { isMember: false, isPreview: false })).toEqual({ visible: false, canRegister: false });
    expect(accessFor('open', { isMember: false, isPreview: false })).toEqual({ visible: true, canRegister: true });
    expect(accessFor('closed', { isMember: false, isPreview: false })).toEqual({ visible: true, canRegister: false });
  });
});

describe('isMemberFromPacks — Gate 2: any ACTIVE IQ Pass of any type (Sandeep, 2026-09-23)', () => {
  it('counts club, club_plus and club_elite alike, and only while active', async () => {
    const { isMemberFromPacks } = await import('../server/tournament/rules');
    expect(isMemberFromPacks([{ tier: 'club', status: 'active' }])).toBe(true);
    expect(isMemberFromPacks([{ tier: 'club_plus', status: 'active' }])).toBe(true);
    expect(isMemberFromPacks([{ tier: 'club_elite', status: 'active' }])).toBe(true);
    expect(isMemberFromPacks([{ tier: 'some_future_pass', status: 'active' }])).toBe(true);
    for (const status of ['pending_payment', 'completed', 'cancelled']) {
      expect(isMemberFromPacks([{ tier: 'club_elite', status }]), status).toBe(false);
    }
    expect(isMemberFromPacks([])).toBe(false);
  });
});
