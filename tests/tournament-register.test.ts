// Tournament Gate 2 — player actions over injected deps (no DB): register,
// pay, my entry, the public view, the sponsor tick, plus the preview list and
// the registration-keyed Ziina return URLs. The DB transactions live in
// server/tournament/store.ts and are proven against a throwaway Postgres.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const {
  registerForTournament, payRegistration, getPublicView, getMyEntry, setSponsorInterest,
  TSHIRT_SIZES, tournamentZiinaMessage,
} = await import('../server/tournament/register');
const { previewUserIds } = await import('../server/tournament/flag');
const { buildTournamentReturnUrls, buildZiinaReturnUrls } = await import('../server/ziinaReturn');

const Z = (iso: string) => new Date(iso);
const OPEN = Z('2026-09-26T10:00:00Z');          // Sat 26 Sep 14:00 Dubai — everyone may register
const MEMBERS = Z('2026-09-25T09:00:00Z');       // Fri 25 Sep 13:00 Dubai — members stage
const BEFORE = Z('2026-09-25T07:00:00Z');        // Fri 25 Sep 11:00 Dubai — not open yet
const CLOSED = Z('2026-10-08T20:00:00Z');        // exclusive close instant

const T = {
  id: 't-1', slug: 'premier-league-2026', name: 'ShuttleIQ League', status: 'published',
  startsAt: Z('2026-10-17T14:00:00Z'), endsAt: Z('2026-10-17T18:00:00Z'),
  venueName: 'BASELINE SPORTS ACADEMY DIP', venueLocation: 'Dubai Investment Park Second - Dubai', venueMapUrl: 'https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9',
  entryFeeAed: 100, tierCaps: { Professional: 6, Competitive: 18, Intermediate: 18, Beginner: 6 }, waitlistCapPerTier: 2, holdMinutes: 1440,
  registrationOpensAtMembers: Z('2026-09-25T08:00:00Z'), registrationOpensAt: Z('2026-09-25T14:00:00Z'),
  registrationClosesAt: Z('2026-10-08T20:00:00Z'), withdrawDeadlineAt: Z('2026-10-08T20:00:00Z'), draftCutoffAt: Z('2026-10-10T20:00:00Z'),
  deckUrl: 'https://shuttleiq.ai/docs/shuttleiq-league-sponsorship.pdf',
  membersOpenNotifiedAt: null, openNotifiedAt: null, threeDaysNotifiedAt: null, oneDayNotifiedAt: null, createdAt: Z('2026-09-23T06:13:15Z'),
};

const reg = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', tournamentId: 't-1', userId: 'u-1', playerId: 'p-1', tier: 'Competitive', levelAtRegistration: 'upper_intermediate',
  skillScoreAtRegistration: 95, status: 'pending_payment', amountAed: 100, ziinaPaymentIntentId: null, paymentMethod: null,
  holdExpiresAt: Z('2026-09-27T10:00:00Z'), paidAt: null, promotedAt: null, withdrawnAt: null, cancelledAt: null, cancellationReason: null,
  refundStatus: null, refundedAt: null, tShirtSize: 'M', company: null, shareWithSponsors: false, sponsorInterest: false,
  sponsorInterestEmailedAt: null, confirmationEmailSentAt: null, promotionNotifiedAt: null, adminNote: null, createdAt: OPEN, ...over,
});

const zeroCounts = () => ({
  Professional: { held: 0, waitlisted: 0 }, Competitive: { held: 0, waitlisted: 0 },
  Intermediate: { held: 0, waitlisted: 0 }, Beginner: { held: 0, waitlisted: 0 },
});

function deps(over: Record<string, any> = {}) {
  return {
    now: () => OPEN,
    getCurrentTournament: vi.fn().mockResolvedValue(T),
    getTournament: vi.fn().mockResolvedValue(T),
    getAccount: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com', phone: '+971500000000', linkedPlayerId: 'p-1' }),
    getPlayer: vi.fn().mockResolvedValue({ id: 'p-1', level: 'upper_intermediate', skillScore: 95, name: 'Test Player', shuttleIqId: 'SIQ-00001' }),
    isMember: vi.fn().mockResolvedValue(false),
    isPreviewUser: vi.fn().mockReturnValue(false),
    countsByTier: vi.fn().mockResolvedValue(zeroCounts()),
    getRegistration: vi.fn().mockResolvedValue(undefined),
    getActiveRegistrationForUser: vi.fn().mockResolvedValue(undefined),
    createRegistration: vi.fn().mockImplementation(async (input: any) => ({ kind: 'created', registration: reg({ holdExpiresAt: input.holdExpiresAt, sponsorInterest: input.sponsorInterest }) })),
    attachIntent: vi.fn().mockResolvedValue(true),
    cancelHold: vi.fn().mockResolvedValue({ cancelled: true, promoted: [] }),
    withdraw: vi.fn(),
    setSponsorInterest: vi.fn(),
    createIntent: vi.fn().mockResolvedValue({ id: 'pi_new', redirect_url: 'https://pay.ziina.com/new' }),
    retrieveIntent: vi.fn(),
    isSuccessful: (s: string) => s === 'completed',
    isIntentDead: (s: string) => ['failed', 'expired', 'canceled', 'cancelled', 'declined', 'rejected'].includes(s),
    confirm: vi.fn().mockResolvedValue({ confirmed: true }),
    onSponsorInterest: vi.fn(),
    onPromoted: vi.fn().mockResolvedValue(undefined),
    allowedSchemes: () => ['com.shuttleiq.app'],
    baseUrl: () => 'https://shuttleiq.ai',
    ...over,
  };
}

const body = (over: Record<string, unknown> = {}) => ({ tShirtSize: 'M', company: 'Acme LLC', shareWithSponsors: true, sponsorInterest: false, ...over });

describe('registerForTournament — who may register', () => {
  it('no published tournament → 404', async () => {
    const d = deps({ getCurrentTournament: vi.fn().mockResolvedValue(undefined) });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, d as any)).toEqual({ status: 404, body: { error: 'not_found' } });
    const d2 = deps({ getCurrentTournament: vi.fn().mockResolvedValue({ ...T, status: 'draft' }) });
    expect((await registerForTournament({ userId: 'u-1', body: body() }, d2 as any)).status).toBe(404);
  });

  it('an account without a linked player is refused (the tier cannot be known)', async () => {
    const d = deps({ getAccount: vi.fn().mockResolvedValue({ id: 'u-1', name: 'X', email: 'x@y', phone: null, linkedPlayerId: null }) });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, d as any)).toEqual({ status: 403, body: { error: 'link_player_first' } });
    expect(d.createRegistration).not.toHaveBeenCalled();
  });

  it('an unknown level is refused, never bucketed as Intermediate', async () => {
    const d = deps({ getPlayer: vi.fn().mockResolvedValue({ id: 'p-1', level: 'Expert', skillScore: 120 }) });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, d as any)).toEqual({ status: 409, body: { error: 'tier_unresolved' } });
  });

  it('before the open → 403 registration_not_open; after the close → 409 registration_closed', async () => {
    const early = deps({ now: () => BEFORE });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, early as any)).toEqual({ status: 403, body: { error: 'registration_not_open' } });
    const late = deps({ now: () => CLOSED });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, late as any)).toEqual({ status: 409, body: { error: 'registration_closed' } });
  });

  it('members stage: an active IQ Pass holder may register, anyone else waits', async () => {
    const member = deps({ now: () => MEMBERS, isMember: vi.fn().mockResolvedValue(true) });
    expect((await registerForTournament({ userId: 'u-1', body: body() }, member as any)).status).toBe(200);
    const other = deps({ now: () => MEMBERS });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, other as any)).toEqual({ status: 403, body: { error: 'registration_not_open' } });
  });

  it('a preview account may register before the open', async () => {
    const d = deps({ now: () => BEFORE, isPreviewUser: vi.fn().mockReturnValue(true) });
    expect((await registerForTournament({ userId: 'u-1', body: body() }, d as any)).status).toBe(200);
  });
});

describe('registerForTournament — the form', () => {
  it('T-shirt size is required and must be S–XXL', async () => {
    expect([...TSHIRT_SIZES]).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    for (const bad of [undefined, '', 'XS', 'xl', 3]) {
      expect(await registerForTournament({ userId: 'u-1', body: body({ tShirtSize: bad }) }, deps() as any)).toEqual({ status: 400, body: { error: 'invalid_t_shirt_size' } });
    }
  });

  it('company is optional, trimmed, at most 100 characters; opt-ins are booleans', async () => {
    const d = deps();
    await registerForTournament({ userId: 'u-1', body: body({ company: '  Acme LLC  ' }) }, d as any);
    expect(d.createRegistration.mock.calls[0][0].company).toBe('Acme LLC');
    const blank = deps();
    await registerForTournament({ userId: 'u-1', body: body({ company: '   ' }) }, blank as any);
    expect(blank.createRegistration.mock.calls[0][0].company).toBeNull();
    expect(await registerForTournament({ userId: 'u-1', body: body({ company: 'x'.repeat(101) }) }, deps() as any)).toEqual({ status: 400, body: { error: 'invalid_company' } });
    expect(await registerForTournament({ userId: 'u-1', body: body({ sponsorInterest: 'yes' }) }, deps() as any)).toEqual({ status: 400, body: { error: 'invalid_opt_in' } });
  });

  it('freezes tier, level and score from the linked player; money is the tournament fee', async () => {
    const d = deps({ getPlayer: vi.fn().mockResolvedValue({ id: 'p-1', level: 'Novice', skillScore: 31 }) });
    await registerForTournament({ userId: 'u-1', body: body() }, d as any);
    const input = d.createRegistration.mock.calls[0][0];
    expect(input).toMatchObject({ tournamentId: 't-1', userId: 'u-1', playerId: 'p-1', tier: 'Beginner', levelAtRegistration: 'Novice', skillScoreAtRegistration: 31, amountAed: 100, tShirtSize: 'M', shareWithSponsors: true, sponsorInterest: false });
    expect(input.holdExpiresAt.toISOString()).toBe('2026-09-27T10:00:00.000Z'); // 24 h from OPEN
  });
});

describe('registerForTournament — hold, waitlist, full, payment', () => {
  it('a new hold creates ONE Ziina intent for the fee with registration-keyed return URLs, then attaches it', async () => {
    const d = deps();
    const out = await registerForTournament({ userId: 'u-1', body: body() }, d as any);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ registration: { id: 'r-1', status: 'pending_payment', tier: 'Competitive' }, redirectUrl: 'https://pay.ziina.com/new' });
    expect(d.createIntent).toHaveBeenCalledTimes(1);
    expect(d.createIntent.mock.calls[0][0]).toEqual({
      amountAed: 100,
      // Sandeep, 2026-09-24: the player's display name + SIQ id, the name cut to fit Ziina's 50-byte cap.
      message: 'ShuttleIQ League entry — Test Playe · SIQ-00001',
      successUrl: 'https://shuttleiq.ai/marketplace/checkout/success?registration_id=r-1',
      cancelUrl: 'https://shuttleiq.ai/marketplace/checkout/cancel?registration_id=r-1',
      failureUrl: 'https://shuttleiq.ai/marketplace/checkout/cancel?registration_id=r-1&failed=1',
    });
    expect(d.getPlayer).toHaveBeenCalledWith('p-1');
    expect(d.attachIntent).toHaveBeenCalledWith('r-1', 'pi_new', null);
  });

  it('Ziina description: "ShuttleIQ League entry — {name} · {SIQ id}", ≤ 50 chars and bytes; the name is cut, never the SIQ id', () => {
    const fits = (m: string) => { expect(m.length).toBeLessThanOrEqual(50); expect(Buffer.byteLength(m, 'utf8')).toBeLessThanOrEqual(50); return m; };
    expect(fits(tournamentZiinaMessage({ name: 'Sandeep', shuttleIqId: 'SIQ-00107' }))).toBe('ShuttleIQ League entry — Sandeep · SIQ-00107');
    expect(fits(tournamentZiinaMessage({ name: 'Owais', shuttleIqId: 'SIQ-00204' }))).toBe('ShuttleIQ League entry — Owais · SIQ-00204');
    expect(fits(tournamentZiinaMessage({ name: 'Abdulrahman Al Mansoori', shuttleIqId: 'SIQ-00690' }))).toBe('ShuttleIQ League entry — Abdulrahma · SIQ-00690');
    expect(fits(tournamentZiinaMessage({ name: '  Ana   Maria  ', shuttleIqId: 'SIQ-00012' }))).toBe('ShuttleIQ League entry — Ana Maria · SIQ-00012');
    // a name cut at a space loses the trailing space
    expect(fits(tournamentZiinaMessage({ name: 'Christina Lee', shuttleIqId: 'SIQ-00300' }))).toBe('ShuttleIQ League entry — Christina · SIQ-00300');
    // multi-byte names are cut on a character boundary, the SIQ id stays whole
    const arabic = fits(tournamentZiinaMessage({ name: 'محمد عبدالله', shuttleIqId: 'SIQ-00455' }));
    expect(arabic.startsWith('ShuttleIQ League entry — محمد')).toBe(true);
    expect(arabic.endsWith(' · SIQ-00455')).toBe(true);
    expect(arabic).not.toContain('�');
    // missing pieces
    expect(fits(tournamentZiinaMessage({ name: 'Sandeep', shuttleIqId: null }))).toBe('ShuttleIQ League entry — Sandeep');
    expect(fits(tournamentZiinaMessage({ name: null, shuttleIqId: 'SIQ-00107' }))).toBe('ShuttleIQ League entry — SIQ-00107');
    expect(fits(tournamentZiinaMessage({ name: '   ', shuttleIqId: null }))).toBe('ShuttleIQ League entry');
  });

  it('paying an existing hold (no live intent) also names the player', async () => {
    const d = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: null })) });
    const out = await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any);
    expect(out.status).toBe(200);
    expect(d.createIntent.mock.calls[0][0].message).toBe('ShuttleIQ League entry — Test Playe · SIQ-00001');
  });

  it('intent creation fails → the new hold is cancelled and the player sees 502', async () => {
    const d = deps({ createIntent: vi.fn().mockRejectedValue(new Error('ziina down')) });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, d as any)).toEqual({ status: 502, body: { error: 'payment_start_failed' } });
    expect(d.cancelHold).toHaveBeenCalledWith('r-1', 'intent_failed');
    expect(d.attachIntent).not.toHaveBeenCalled();
  });

  it('tier full (seats and waitlist) → 409 tier_full; waitlisted → 200 without a payment', async () => {
    const full = deps({ createRegistration: vi.fn().mockResolvedValue({ kind: 'full' }) });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, full as any)).toEqual({ status: 409, body: { error: 'tier_full' } });
    const wl = deps({ createRegistration: vi.fn().mockResolvedValue({ kind: 'created', registration: reg({ status: 'waitlisted', holdExpiresAt: null }) }) });
    const out = await registerForTournament({ userId: 'u-1', body: body() }, wl as any);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ registration: { status: 'waitlisted' } });
    expect((out.body as any).redirectUrl).toBeUndefined();
    expect(wl.createIntent).not.toHaveBeenCalled();
  });

  it('double submit: an existing hold with a live intent reuses the SAME intent, never mints a second', async () => {
    const d = deps({
      createRegistration: vi.fn().mockResolvedValue({ kind: 'existing', registration: reg({ ziinaPaymentIntentId: 'pi_live' }) }),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_confirmation', redirect_url: 'https://pay.ziina.com/live' }),
    });
    const out = await registerForTournament({ userId: 'u-1', body: body() }, d as any);
    expect(out).toMatchObject({ status: 200, body: { redirectUrl: 'https://pay.ziina.com/live' } });
    expect(d.createIntent).not.toHaveBeenCalled();
    expect(d.attachIntent).not.toHaveBeenCalled();
  });

  it('existing hold whose intent was already paid → confirmed through the canonical path, no redirect', async () => {
    const d = deps({
      createRegistration: vi.fn().mockResolvedValue({ kind: 'existing', registration: reg({ ziinaPaymentIntentId: 'pi_paid' }) }),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'completed' }),
      getRegistration: vi.fn().mockResolvedValue(reg({ status: 'confirmed', ziinaPaymentIntentId: 'pi_paid' })),
    });
    const out = await registerForTournament({ userId: 'u-1', body: body() }, d as any);
    expect(d.confirm).toHaveBeenCalledWith('pi_paid');
    expect(out).toMatchObject({ status: 200, body: { registration: { status: 'confirmed' } } });
    expect((out.body as any).redirectUrl).toBeUndefined();
  });

  it('existing confirmed or waitlisted entry → returned as is (idempotent), no payment', async () => {
    for (const status of ['confirmed', 'waitlisted']) {
      const d = deps({ createRegistration: vi.fn().mockResolvedValue({ kind: 'existing', registration: reg({ status }) }) });
      const out = await registerForTournament({ userId: 'u-1', body: body() }, d as any);
      expect(out).toMatchObject({ status: 200, body: { registration: { status } } });
      expect(d.createIntent).not.toHaveBeenCalled();
    }
  });

  it('the sponsor tick fires the one sponsor email hook for a NEW entry only', async () => {
    const d = deps();
    await registerForTournament({ userId: 'u-1', body: body({ sponsorInterest: true }) }, d as any);
    expect(d.onSponsorInterest).toHaveBeenCalledWith('r-1');
    const again = deps({ createRegistration: vi.fn().mockResolvedValue({ kind: 'existing', registration: reg({ status: 'confirmed', sponsorInterest: true }) }) });
    await registerForTournament({ userId: 'u-1', body: body({ sponsorInterest: true }) }, again as any);
    expect(again.onSponsorInterest).not.toHaveBeenCalled();
  });
});

describe('payRegistration — pay for a hold (new or promoted)', () => {
  it('only the owner, only a pending hold', async () => {
    expect((await payRegistration({ userId: 'u-1', registrationId: 'nope' }, deps() as any)).status).toBe(404);
    const other = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ userId: 'u-2' })) });
    expect((await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, other as any)).status).toBe(404);
    const wl = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ status: 'waitlisted' })) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, wl as any)).toEqual({ status: 409, body: { error: 'not_payable' } });
    const done = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ status: 'confirmed' })) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, done as any)).toMatchObject({ status: 200, body: { registration: { status: 'confirmed' } } });
  });

  it('a promoted hold with no intent gets one; a dead intent is replaced; a lapsed hold is refused', async () => {
    const promoted = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ promotedAt: OPEN })) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, promoted as any)).toMatchObject({ status: 200, body: { redirectUrl: 'https://pay.ziina.com/new' } });
    expect(promoted.attachIntent).toHaveBeenCalledWith('r-1', 'pi_new', null);
    expect(promoted.cancelHold).not.toHaveBeenCalled();

    const dead = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_dead' })), retrieveIntent: vi.fn().mockResolvedValue({ status: 'failed' }) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, dead as any)).toMatchObject({ status: 200, body: { redirectUrl: 'https://pay.ziina.com/new' } });

    const lapsed = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_x', holdExpiresAt: Z('2026-09-26T09:00:00Z') })), retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_confirmation', redirect_url: 'https://pay.ziina.com/x' }) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, lapsed as any)).toEqual({ status: 409, body: { error: 'hold_expired' } });
  });

  it('Ziina unreachable → 502, the hold is left alone (never replaced blind)', async () => {
    const d = deps({ getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_x' })), retrieveIntent: vi.fn().mockRejectedValue(new Error('timeout')) });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any)).toEqual({ status: 502, body: { error: 'payment_status_unavailable' } });
    expect(d.createIntent).not.toHaveBeenCalled();
    expect(d.cancelHold).not.toHaveBeenCalled();
  });
});

describe('getPublicView — the banner, the pinned row and the counter', () => {
  it('hidden before the open, to non-members in the members stage, and while unpublished', async () => {
    expect(await getPublicView(null, deps({ now: () => BEFORE }) as any)).toEqual({ status: 200, body: { visible: false } });
    expect(await getPublicView(null, deps({ now: () => MEMBERS }) as any)).toEqual({ status: 200, body: { visible: false } });
    expect(await getPublicView('u-1', deps({ now: () => MEMBERS, isMember: vi.fn().mockResolvedValue(false) }) as any)).toEqual({ status: 200, body: { visible: false } });
    expect(await getPublicView(null, deps({ getCurrentTournament: vi.fn().mockResolvedValue(undefined) }) as any)).toEqual({ status: 200, body: { visible: false } });
  });

  it('once open: the event, and per tier cap / held / waitlisted / state (holds count as taken)', async () => {
    const counts = zeroCounts();
    counts.Professional = { held: 6, waitlisted: 1 };
    counts.Beginner = { held: 6, waitlisted: 2 };
    counts.Competitive = { held: 17, waitlisted: 0 };
    const out = await getPublicView(null, deps({ countsByTier: vi.fn().mockResolvedValue(counts) }) as any);
    expect(out.status).toBe(200);
    const b = out.body as any;
    expect(b).toMatchObject({ visible: true, phase: 'open', canRegister: true });
    expect(b.tournament).toMatchObject({ id: 't-1', name: 'ShuttleIQ League', entryFeeAed: 100, venueName: 'BASELINE SPORTS ACADEMY DIP', startsAt: '2026-10-17T14:00:00.000Z', registrationClosesAt: '2026-10-08T20:00:00.000Z', deckUrl: T.deckUrl });
    expect(b.tiers).toEqual([
      { tier: 'Professional', cap: 6, held: 6, waitlisted: 1, waitlistCap: 2, state: 'waitlist' },
      { tier: 'Competitive', cap: 18, held: 17, waitlisted: 0, waitlistCap: 2, state: 'open' },
      { tier: 'Intermediate', cap: 18, held: 0, waitlisted: 0, waitlistCap: 2, state: 'open' },
      { tier: 'Beginner', cap: 6, held: 6, waitlisted: 2, waitlistCap: 2, state: 'full' },
    ]);
    expect(JSON.stringify(b)).not.toMatch(/email|phone|userId/); // no personal data on the public read
  });

  it('a member sees the members stage with canRegister; a preview account sees it before the open', async () => {
    const m = await getPublicView('u-1', deps({ now: () => MEMBERS, isMember: vi.fn().mockResolvedValue(true) }) as any);
    expect(m.body).toMatchObject({ visible: true, phase: 'members_only', canRegister: true });
    const p = await getPublicView('u-1', deps({ now: () => BEFORE, isPreviewUser: vi.fn().mockReturnValue(true) }) as any);
    expect(p.body).toMatchObject({ visible: true, phase: 'before_open', canRegister: true });
  });
});

describe('getMyEntry / setSponsorInterest', () => {
  it('my entry: the active registration, the tier I would register as, and whether I can', async () => {
    const d = deps({ getActiveRegistrationForUser: vi.fn().mockResolvedValue(reg({ status: 'confirmed' })) });
    const out = await getMyEntry('u-1', d as any);
    expect(out.body).toMatchObject({ registration: { id: 'r-1', status: 'confirmed', tier: 'Competitive' }, eligibleTier: 'Competitive', canRegister: true });
    const unlinked = deps({ getAccount: vi.fn().mockResolvedValue({ id: 'u-1', name: 'X', email: 'x@y', phone: null, linkedPlayerId: null }) });
    expect((await getMyEntry('u-1', unlinked as any)).body).toMatchObject({ registration: null, eligibleTier: null, reason: 'link_player_first' });
  });

  it('sponsor tick: owner only, boolean only; ticking on fires the email hook, ticking off does not', async () => {
    const d = deps({ setSponsorInterest: vi.fn().mockResolvedValue(reg({ sponsorInterest: true })) });
    expect(await setSponsorInterest({ userId: 'u-1', registrationId: 'r-1', interested: 'yes' }, d as any)).toEqual({ status: 400, body: { error: 'invalid_opt_in' } });
    const on = await setSponsorInterest({ userId: 'u-1', registrationId: 'r-1', interested: true }, d as any);
    expect(on).toMatchObject({ status: 200, body: { registration: { sponsorInterest: true } } });
    expect(d.setSponsorInterest).toHaveBeenCalledWith('r-1', 'u-1', true);
    expect(d.onSponsorInterest).toHaveBeenCalledWith('r-1');
    const off = deps({ setSponsorInterest: vi.fn().mockResolvedValue(reg({ sponsorInterest: false })) });
    await setSponsorInterest({ userId: 'u-1', registrationId: 'r-1', interested: false }, off as any);
    expect(off.onSponsorInterest).not.toHaveBeenCalled();
    const missing = deps({ setSponsorInterest: vi.fn().mockResolvedValue(undefined) });
    expect((await setSponsorInterest({ userId: 'u-1', registrationId: 'r-1', interested: true }, missing as any)).status).toBe(404);
  });
});

describe('TOURNAMENT_PREVIEW_USER_IDS', () => {
  const prev = process.env.TOURNAMENT_PREVIEW_USER_IDS;
  afterAll(() => { if (prev === undefined) delete process.env.TOURNAMENT_PREVIEW_USER_IDS; else process.env.TOURNAMENT_PREVIEW_USER_IDS = prev; });
  beforeEach(() => { delete process.env.TOURNAMENT_PREVIEW_USER_IDS; });

  it('unset → nobody; a comma list → exactly those ids, trimmed', () => {
    expect(previewUserIds().size).toBe(0);
    process.env.TOURNAMENT_PREVIEW_USER_IDS = ' a1 , b2,,  ';
    expect([...previewUserIds()].sort()).toEqual(['a1', 'b2']);
  });
});

describe('buildTournamentReturnUrls — registration-keyed, the booking builder untouched', () => {
  it('web and native', () => {
    expect(buildTournamentReturnUrls({ baseUrl: 'https://shuttleiq.ai', registrationId: 'r-1', allowedSchemes: [] })).toEqual({
      successUrl: 'https://shuttleiq.ai/marketplace/checkout/success?registration_id=r-1',
      cancelUrl: 'https://shuttleiq.ai/marketplace/checkout/cancel?registration_id=r-1',
      failureUrl: 'https://shuttleiq.ai/marketplace/checkout/cancel?registration_id=r-1&failed=1',
    });
    expect(buildTournamentReturnUrls({ baseUrl: 'https://shuttleiq.ai', registrationId: 'r-1', returnScheme: 'com.shuttleiq.app', allowedSchemes: ['com.shuttleiq.app'] }).successUrl)
      .toBe('com.shuttleiq.app://checkout/success?registration_id=r-1');
    expect(buildTournamentReturnUrls({ baseUrl: 'https://shuttleiq.ai', registrationId: 'r-1', returnScheme: 'evil', allowedSchemes: ['com.shuttleiq.app'] }).successUrl)
      .toBe('https://shuttleiq.ai/marketplace/checkout/success?registration_id=r-1');
    expect(buildZiinaReturnUrls({ baseUrl: 'https://shuttleiq.ai', bookingId: 'b1', resumeParam: '', allowedSchemes: [] }).successUrl)
      .toBe('https://shuttleiq.ai/marketplace/checkout/success?booking_id=b1');
  });
});

describe('double submit race — the payment link can never be swapped under a player', () => {
  it('attach only succeeds over the intent the request saw; a lost race returns the WINNER\'s link and never overwrites it', async () => {
    // Two submits land together: both see the new hold without an intent. Request B loses the attach.
    const d = deps({
      createRegistration: vi.fn().mockResolvedValue({ kind: 'existing', registration: reg({ ziinaPaymentIntentId: null }) }),
      createIntent: vi.fn().mockResolvedValue({ id: 'pi_B', redirect_url: 'https://pay.ziina.com/B' }),
      attachIntent: vi.fn().mockResolvedValue(false),
      getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_A' })),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_confirmation', redirect_url: 'https://pay.ziina.com/A' }),
    });
    const out = await registerForTournament({ userId: 'u-1', body: body() }, d as any);
    expect(d.attachIntent).toHaveBeenCalledWith('r-1', 'pi_B', null);
    expect(out).toMatchObject({ status: 200, body: { redirectUrl: 'https://pay.ziina.com/A' } });
    expect(d.retrieveIntent).toHaveBeenCalledWith('pi_A');
  });

  it('replacing a dead intent is conditional on that same dead intent', async () => {
    const d = deps({
      getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_dead' })),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'failed' }),
      attachIntent: vi.fn().mockResolvedValue(true),
    });
    await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any);
    expect(d.attachIntent).toHaveBeenCalledWith('r-1', 'pi_new', 'pi_dead');
  });
});

describe('review fixes — a live Ziina link is never replaced; a failed start still promotes', () => {
  it('production wiring: "requires_payment_instrument" (every fresh, unpaid intent) is LIVE, not dead', async () => {
    const { buildTournamentDeps } = await import('../server/tournament/register');
    const wired = buildTournamentDeps({ baseUrl: () => 'https://shuttleiq.ai', allowedSchemes: () => [] });
    expect(wired.isIntentDead('requires_payment_instrument')).toBe(false);
    expect(wired.isIntentDead('pending')).toBe(false);
    for (const s of ['failed', 'expired', 'cancelled', 'canceled', 'declined', 'rejected']) expect(wired.isIntentDead(s), s).toBe(true);
  });

  it('a second Pay on a fresh intent reuses it — no second intent', async () => {
    const { ziinaIntentIsDead } = await import('../server/rebookGuard');
    const d = deps({
      isIntentDead: ziinaIntentIsDead,
      getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_fresh' })),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'requires_payment_instrument', redirect_url: 'https://pay.ziina.com/fresh' }),
    });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any)).toMatchObject({ status: 200, body: { redirectUrl: 'https://pay.ziina.com/fresh' } });
    expect(d.createIntent).not.toHaveBeenCalled();
    expect(d.attachIntent).not.toHaveBeenCalled();
  });

  it('a live intent with no redirect link is never replaced → 409 payment_in_progress', async () => {
    const d = deps({
      getRegistration: vi.fn().mockResolvedValue(reg({ ziinaPaymentIntentId: 'pi_live' })),
      retrieveIntent: vi.fn().mockResolvedValue({ status: 'pending' }),
    });
    expect(await payRegistration({ userId: 'u-1', registrationId: 'r-1' }, d as any)).toEqual({ status: 409, body: { error: 'payment_in_progress' } });
    expect(d.createIntent).not.toHaveBeenCalled();
  });

  it('a new hold whose intent fails is cancelled AND the freed seat goes to the next waiting player', async () => {
    const promoted = [reg({ id: 'r-9', userId: 'u-9', promotedAt: OPEN })];
    const d = deps({
      createIntent: vi.fn().mockRejectedValue(new Error('ziina down')),
      cancelHold: vi.fn().mockResolvedValue({ cancelled: true, promoted }),
    });
    expect(await registerForTournament({ userId: 'u-1', body: body() }, d as any)).toEqual({ status: 502, body: { error: 'payment_start_failed' } });
    expect(d.cancelHold).toHaveBeenCalledWith('r-1', 'intent_failed');
    expect(d.onPromoted).toHaveBeenCalledWith(promoted);
  });
});
