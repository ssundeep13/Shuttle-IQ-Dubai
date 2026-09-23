// Tournament Gate 2 — confirmation (webhook, return-page poll, reconciliation
// all land here), the three emails, the rethrowing send helper, and the
// flag-gated webhook lookup (tripwire on the source).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const { confirmRegistrationByIntentId } = await import('../server/tournament/confirm');
const {
  buildTournamentConfirmationEmail, buildTournamentPromotionEmail, buildSponsorInterestEmail,
  tournamentConfirmIdempotencyKey, tournamentSponsorIdempotencyKey, SPONSOR_INBOX, displayVenue,
} = await import('../server/tournament/email');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r/g, '');
const Z = (iso: string) => new Date(iso);
const NOW = Z('2026-09-26T10:00:00Z');

const T = {
  id: 't-1', name: 'ShuttleIQ Premier League', startsAt: Z('2026-10-17T14:00:00Z'), endsAt: Z('2026-10-17T18:00:00Z'),
  venueName: 'BASELINE SPORTS ACADEMY DIP', venueLocation: 'Dubai Investment Park Second - Dubai', venueMapUrl: 'https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9',
  entryFeeAed: 100, withdrawDeadlineAt: Z('2026-10-08T20:00:00Z'), draftCutoffAt: Z('2026-10-10T20:00:00Z'),
};
const reg = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', tournamentId: 't-1', userId: 'u-1', tier: 'Competitive', status: 'confirmed', amountAed: 100, tShirtSize: 'L',
  ziinaPaymentIntentId: 'pi_1', confirmationEmailSentAt: null, holdExpiresAt: Z('2026-09-27T10:00:00Z'), ...over,
});

function deps(result: any, over: Record<string, any> = {}) {
  return {
    now: () => NOW,
    confirmTx: vi.fn().mockResolvedValue(result),
    getAccount: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com', phone: null, linkedPlayerId: 'p-1' }),
    getTournament: vi.fn().mockResolvedValue(T),
    notify: vi.fn().mockResolvedValue(undefined),
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    markConfirmationEmailed: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('confirmRegistrationByIntentId', () => {
  it('unknown intent → not confirmed, nothing else happens', async () => {
    const d = deps({ kind: 'not_found' });
    expect(await confirmRegistrationByIntentId('pi_x', d as any)).toEqual({ confirmed: false, error: 'registration_not_found' });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('already confirmed → idempotent, no second notification or email', async () => {
    const d = deps({ kind: 'already', registration: reg() });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: true, alreadyConfirmed: true });
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('fresh confirm → one in-app "You\'re in", one email, then the sent stamp', async () => {
    const d = deps({ kind: 'confirmed', registration: reg() });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: true });
    expect(d.confirmTx).toHaveBeenCalledWith('pi_1', NOW);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify.mock.calls[0][0]).toMatchObject({ userId: 'u-1', type: 'tournament_confirmed' });
    expect(d.notify.mock.calls[0][0].title).toMatch(/Premier League/);
    expect(d.sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(d.markConfirmationEmailed).toHaveBeenCalledWith('r-1', NOW);
  });

  it('the email stamp is written ONLY after a successful send', async () => {
    const d = deps({ kind: 'confirmed', registration: reg() }, { sendConfirmationEmail: vi.fn().mockRejectedValue(new Error('Resend error')) });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: true });
    expect(d.markConfirmationEmailed).not.toHaveBeenCalled();
  });

  it('an email already stamped is not sent again', async () => {
    const d = deps({ kind: 'confirmed', registration: reg({ confirmationEmailSentAt: NOW }) });
    await confirmRegistrationByIntentId('pi_1', d as any);
    expect(d.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('late money, seat still free (Q5) → restored and treated as a fresh confirm', async () => {
    const d = deps({ kind: 'restored', registration: reg() });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: true, restored: true });
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it('late money, no seat (Q5) → not confirmed; the refund was queued inside the transaction', async () => {
    const d = deps({ kind: 'refund_owed', registration: reg({ status: 'expired' }) });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: false, error: 'registration_refund_owed' });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('a failing notification never fails the confirmation', async () => {
    const d = deps({ kind: 'confirmed', registration: reg() }, { notify: vi.fn().mockRejectedValue(new Error('db')) });
    expect(await confirmRegistrationByIntentId('pi_1', d as any)).toEqual({ confirmed: true });
  });
});

describe('emails', () => {
  const account = { name: 'Test <Player>', email: 't@example.com' };

  it('confirmation: tier, date and time in Dubai, venue, shirt size, the withdraw rule; HTML-escaped', () => {
    const { subject, html } = buildTournamentConfirmationEmail({ registration: reg() as any, name: account.name, tournament: T as any });
    expect(subject).toBe("You're in: ShuttleIQ Premier League");
    expect(html).toContain('Competitive');
    expect(html).toContain('Sat 17 Oct');
    expect(html).toContain('6:00 pm');
    expect(html).toContain('Baseline Sports Academy DIP');
    expect(html).toContain('https://maps.app.goo.gl/KQCTd2N4HeE2FpQm9');
    expect(html).toContain('T-shirt: L');
    expect(html).toContain('Thu 8 Oct'); // last day for a refunded withdrawal
    expect(html).toContain('Test &lt;Player&gt;');
    expect(html).not.toContain('Test <Player>');
    expect(tournamentConfirmIdempotencyKey('r-1')).toBe('tournament-confirm/r-1');
  });

  it('promotion: the pay-by time in Dubai and a pay link to the tournament page', () => {
    const { subject, html } = buildTournamentPromotionEmail({ registration: reg({ status: 'pending_payment' }) as any, name: 'Test Player', tournament: T as any });
    expect(subject).toBe('A Premier League spot opened up for you');
    expect(html).toContain('https://shuttleiq.ai/marketplace/tournament?pay=r-1');
    expect(html).toContain('2:00 pm on Sun 27 Sept'); // shared/dubaiTime formatDubaiDeadline, the player-facing standard
    expect(html).toContain('AED 100');
  });

  it('sponsor interest: to Sandeep, name + company + phone only (Q14)', () => {
    expect(SPONSOR_INBOX).toBe('sandeep@shuttleiq.ai');
    const { subject, html } = buildSponsorInterestEmail({ name: 'Test Player', company: 'Acme LLC', phone: '+971500000000' });
    expect(subject).toBe('Sponsor interest: Test Player (Acme LLC)');
    expect(html).toContain('Test Player');
    expect(html).toContain('Acme LLC');
    expect(html).toContain('+971500000000');
    expect(html).not.toMatch(/@example\.com|email/i);
    const none = buildSponsorInterestEmail({ name: 'Test Player', company: null, phone: null });
    expect(none.subject).toBe('Sponsor interest: Test Player');
    expect(none.html).toContain('not provided');
    expect(tournamentSponsorIdempotencyKey('r-1')).toBe('tournament-sponsor-interest/r-1');
  });

  it('displayVenue keeps short acronyms and title-cases the rest', () => {
    expect(displayVenue('BASELINE SPORTS ACADEMY DIP')).toBe('Baseline Sports Academy DIP');
    expect(displayVenue('Fire Rallies Sports Academy LLC')).toBe('Fire Rallies Sports Academy LLC');
  });
});

describe('emailClient.sendTransactionalEmail — rethrows, so callers stamp only on success', () => {
  it('rejects when Resend cannot send (no key here)', async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const { sendTransactionalEmail } = await import('../server/emailClient');
    await expect(sendTransactionalEmail('x@example.com', 's', '<p>h</p>', 'k/1')).rejects.toThrow(/RESEND_API_KEY/);
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });
});

describe('webhook tripwire — the tournament lookup is flag-gated and sits before the guest fallthrough', () => {
  const src = read('server/webhookHandler.ts');
  it('imports and gate', () => {
    expect(src).toContain('import { isTournamentEnabled } from "./tournament/flag";');
    expect(src).toContain('import { confirmRegistrationByIntentId } from "./tournament/confirm";');
    const noBooking = src.indexOf('if (!booking) {');
    const gate = src.indexOf('if (isTournamentEnabled()) {', noBooking);
    const guest = src.indexOf('return confirmGuestByIntentId(intentId);', noBooking);
    expect(noBooking).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(noBooking);
    expect(guest).toBeGreaterThan(gate);
    expect(src.slice(gate, guest)).toContain('return confirmRegistrationByIntentId(intentId);');
    // the IQ Pass branch is still first and unchanged
    expect(src.indexOf('if (isIqPassEnabled()) {', noBooking)).toBeLessThan(gate);
  });
});
