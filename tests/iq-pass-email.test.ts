// IQ Pass Gate 2 — the confirmation email. Pure builder rendered and checked
// field by field (opening line verbatim from the brief, Dubai dates, no
// per-game maths, no emoji); the sender runs against a mocked Resend SDK
// (idempotency key per pack, never throws).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send: sendMock } }; }) }));

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.RESEND_API_KEY = 'test-key-not-real';
const { buildIqPassConfirmationEmail, iqPassOpeningLine, iqPassConfirmIdempotencyKey, formatSessionLineDubai } = await import('../server/iqPassEmail');
const { sendIqPassConfirmationEmail } = await import('../server/emailClient');

const input = () => ({
  packId: 'pk-1',
  name: 'Akhila',
  tierLabel: 'Club Plus',
  gamesTotal: 8,
  priceAed: 360,
  sessions: [
    { title: 'Smash Sports Academy Session', venueName: 'Smash Sports Academy', date: '2026-09-16T00:00:00.000Z', startTime: '20:00', endTime: '22:00' },
    { title: 'Bright Riders School Dubai Session', venueName: 'Bright Riders School Dubai', date: '2026-09-17T00:00:00.000Z', startTime: '20:00', endTime: '22:00' },
  ],
});

describe('opening line (brief, verbatim)', () => {
  it('"You\'re now a {tier} member of ShuttleIQ. Your IQ Pass is active — {n} games locked."', () => {
    expect(iqPassOpeningLine('Club Plus', 8)).toBe("You're now a Club Plus member of ShuttleIQ. Your IQ Pass is active — 8 games locked.");
    expect(iqPassOpeningLine('Club', 4)).toBe("You're now a Club member of ShuttleIQ. Your IQ Pass is active — 4 games locked.");
  });
});

describe('buildIqPassConfirmationEmail', () => {
  it('subject names the tier; body opens with the line, lists every session as a Dubai date line, shows the pack total only', () => {
    const { subject, html } = buildIqPassConfirmationEmail(input());
    expect(subject).toBe('Your IQ Pass is active — Club Plus');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain("You're now a Club Plus member of ShuttleIQ. Your IQ Pass is active — 8 games locked.");
    expect(text.indexOf("You're now a Club Plus member")).toBeLessThan(text.indexOf('Smash Sports Academy'));
    expect(text).toContain('Wed 16 Sep · 20:00–22:00 · Smash Sports Academy');
    expect(text).toContain('Thu 17 Sep · 20:00–22:00 · Bright Riders School Dubai');
    expect(text).toContain('AED 360');
    // never per-game maths or savings
    expect(text).not.toMatch(/per game|\/game|AED 45|save|saving/i);
    // no emoji
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    // deep link to the bookings page
    expect(html).toContain('https://shuttleiq.ai/marketplace/my-bookings');
  });

  it('formatSessionLineDubai uses the Dubai calendar day of the stored date, never the server clock', () => {
    // 21:00Z on the 16th is already the 17th in Dubai; but stored dates are Dubai-midnight-as-UTC, so the Y-M-D is taken as-is.
    expect(formatSessionLineDubai({ title: 't', venueName: 'V', date: '2026-09-16T00:00:00.000Z', startTime: '18:00', endTime: '21:00' })).toBe('Wed 16 Sep · 18:00–21:00 · V');
  });

  it('idempotency key is per pack', () => {
    expect(iqPassConfirmIdempotencyKey('pk-1')).toBe('iq-pass-confirm/pk-1');
  });
});

describe('sendIqPassConfirmationEmail', () => {
  beforeEach(() => sendMock.mockReset());

  it('one Resend call, from the ShuttleIQ sender, with the per-pack idempotency key', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    await sendIqPassConfirmationEmail('akhila@example.com', input());
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = sendMock.mock.calls[0];
    expect(payload.to).toBe('akhila@example.com');
    expect(payload.from).toBe('ShuttleIQ <noreply@shuttleiq.org>');
    expect(payload.subject).toBe('Your IQ Pass is active — Club Plus');
    expect(opts).toEqual({ idempotencyKey: 'iq-pass-confirm/pk-1' });
  });

  it('a Resend failure is swallowed (the confirmation must not depend on email)', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(sendIqPassConfirmationEmail('akhila@example.com', input())).resolves.toBeUndefined();
  });
});
