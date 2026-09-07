// Player Challenges — Gate C6: email the challenged player on challenge creation.
//
// The template is a pure builder (server/challengeEmail.ts) rendered here and
// checked field by field; the sender (emailClient.sendChallengeReceivedEmail)
// is exercised against a mocked Resend SDK — one call, the idempotency key,
// and a failure that must not throw; the route wiring (after the in-app
// notification, guarded by the recipient helper, fire-and-forget, create only)
// is pinned at source; the Profile card's #challenges anchor renders in jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'fs';
import { join } from 'path';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() { return { emails: { send: sendMock } }; }),
}));

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.RESEND_API_KEY = 'test-key-not-real';
const { buildChallengeReceivedEmail, challengeEmailRecipient, CHALLENGES_DEEP_LINK, challengeEmailIdempotencyKey, formatExpiryDubai } = await import('../server/challengeEmail');
const { sendChallengeReceivedEmail } = await import('../server/emailClient');
const { ChallengesCard } = await import('../client/src/components/ChallengesCard');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const input = (over: Record<string, unknown> = {}) => ({
  challengeId: 'ch-1',
  challenger: { name: 'Clyde Almeida', level: 'Advanced', skillScore: 88 },
  challenged: { name: 'Divya Raj', level: 'upper_intermediate', skillScore: 74 },
  headToHead: { met: 2, myWins: 0, theirWins: 2, last: null },
  expiresAt: '2026-09-14T11:53:15.456Z', // 15:53 Dubai
  ...over,
});

describe('buildChallengeReceivedEmail — template', () => {
  it('subject is "<challengerFirstName> has challenged you"', () => {
    expect(buildChallengeReceivedEmail(input()).subject).toBe('Clyde has challenged you');
  });

  it('renders both first names, display tier labels (never DB enums), points, the head-to-head line from the challenged player\'s side, both CTAs, expiry and privacy lines', () => {
    const { html } = buildChallengeReceivedEmail(input());
    expect(html).toContain('Clyde has challenged you');
    expect(html).toMatch(/Hi Divya/);
    expect(html).toContain('Professional');        // Advanced → Professional
    expect(html).toContain('Competitive');         // upper_intermediate → Competitive
    expect(html).not.toMatch(/upper_intermediate|lower_intermediate|Advanced/);
    expect(html).toContain('88 pts');
    expect(html).toContain('74 pts');
    expect(html).toContain('Met 2 times · Clyde leads 2–0');
    // Accept: navy button; Decline: plain link — both to the profile challenges anchor.
    expect(CHALLENGES_DEEP_LINK).toBe('https://shuttleiq.ai/marketplace/profile#challenges');
    expect(html).toMatch(new RegExp(`background-color:#003E8C;[^>]*>\\s*<a href="${CHALLENGES_DEEP_LINK}"[^>]*>Accept challenge</a>`, 'i'));
    expect(html).toMatch(new RegExp(`<a href="${CHALLENGES_DEEP_LINK}"[^>]*>Decline</a>`));
    expect((html.match(new RegExp(CHALLENGES_DEEP_LINK.replace(/[.#]/g, '\\$&'), 'g')) ?? []).length).toBe(2);
    expect(html).toMatch(/expires on Mon 14 Sep,? 3:53 pm/i);
    expect(html).toMatch(/Only you and Clyde can see this challenge/);
  });

  it('met = 0 → "You haven\'t met yet."', () => {
    const { html } = buildChallengeReceivedEmail(input({ headToHead: { met: 0, myWins: 0, theirWins: 0, last: null } }));
    expect(html).toContain("You haven't met yet.");
    expect(html).not.toMatch(/Met \d/);
  });

  it('brand: cream #F5EFE0 background, Inter/system-sans, flat — no images, no shadows, no emoji; same footer text as booking confirmations', () => {
    const { html } = buildChallengeReceivedEmail(input());
    expect(html).toMatch(/background-color:#F5EFE0/i);
    expect(html).toMatch(/font-family:\s*Inter,/);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/box-shadow/i);
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).not.toMatch(/unsubscribe/i);
    const year = new Date().getFullYear();
    const footer = `&copy; ${year} ShuttleIQ. All rights reserved.`;
    expect(read('server/emailClient.ts')).toContain('&copy; ${new Date().getFullYear()} ShuttleIQ. All rights reserved.');
    expect(html).toContain(footer);
  });

  it('escapes names for HTML', () => {
    const { html, subject } = buildChallengeReceivedEmail(input({ challenger: { name: 'A&B <Smash>', level: 'Beginner', skillScore: 40 } }));
    expect(html).toContain('A&amp;B');
    expect(html).not.toContain('<Smash>');
    expect(subject).toBe('A&B has challenged you');
  });

  it('formatExpiryDubai renders the expiry in Dubai time', () => {
    expect(formatExpiryDubai('2026-09-14T11:53:15.456Z')).toMatch(/^Mon 14 Sep,? 3:53 pm$/i);
    expect(formatExpiryDubai(new Date('2026-09-14T20:30:00.000Z'))).toMatch(/^Tue 15 Sep,? 12:30 am$/i);
  });
});

describe('challengeEmailRecipient — who gets the email', () => {
  it('returns the marketplace user\'s email; null when there is no linked user or the email is blank', () => {
    expect(challengeEmailRecipient({ email: 'divya@example.com' })).toBe('divya@example.com');
    expect(challengeEmailRecipient({ email: '  ' })).toBeNull();
    expect(challengeEmailRecipient({ email: '' })).toBeNull();
    expect(challengeEmailRecipient(null)).toBeNull();
    expect(challengeEmailRecipient(undefined)).toBeNull();
  });
  it('idempotency key is one per challenge id', () => {
    expect(challengeEmailIdempotencyKey('ch-1')).toBe('challenge-received/ch-1');
  });
});

describe('sendChallengeReceivedEmail — Resend', () => {
  beforeEach(() => { sendMock.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends exactly one email from the booking sender with the idempotency key for the challenge id', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendChallengeReceivedEmail('divya@example.com', input());
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload, options] = sendMock.mock.calls[0];
    expect(payload.from).toBe('ShuttleIQ <noreply@shuttleiq.org>');
    expect(payload.to).toBe('divya@example.com');
    expect(payload.subject).toBe('Clyde has challenged you');
    expect(payload.html).toContain('Accept challenge');
    expect(options).toEqual({ idempotencyKey: 'challenge-received/ch-1' });
    expect(log.mock.calls.some(c => String(c[0]).includes('[Email] Challenge email sent') && String(c[0]).includes('email-1'))).toBe(true);
  });

  it('a Resend failure (thrown or returned) is logged and swallowed — never rejects', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendChallengeReceivedEmail('divya@example.com', input())).resolves.toBeUndefined();
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'invalid to', name: 'validation_error' } });
    await expect(sendChallengeReceivedEmail('divya@example.com', input())).resolves.toBeUndefined();
    expect(err.mock.calls.filter(c => String(c[0]).includes('sendChallengeReceivedEmail failed')).length).toBe(2);
  });
});

describe('C6 pins — route wiring', () => {
  const routes = read('server/marketplace-routes.ts');
  const create = routes.slice(routes.indexOf('app.post("/api/marketplace/challenges"'), routes.indexOf('app.post("/api/marketplace/challenges/:id/accept"'));

  it('the create route emails after the in-app notification, only when the recipient helper returns an address, fire-and-forget', () => {
    const notif = create.indexOf("type: 'challenge_received'");
    const send = create.indexOf('sendChallengeReceivedEmail(');
    expect(notif).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(notif);
    expect(create).toMatch(/const recipient = challengeEmailRecipient\(target\)/);
    expect(create).toMatch(/if \(recipient\) \{[\s\S]*?sendChallengeReceivedEmail\(recipient, \{[\s\S]*?\}\)\.catch\(\(\) => \{\}\);/);
    // The head-to-head lookup for the email must not be able to fail the route either.
    expect(create).toMatch(/try \{[\s\S]*?loadHeadToHeadRows\(challengedId, challengerId\)[\s\S]*?\} catch/);
    expect(create).toMatch(/expiresAt: created\.expiresAt/);
  });

  it('create is the only send site — no email on accept, decline, settle, or expiry', () => {
    expect((routes.match(/sendChallengeReceivedEmail\(/g) ?? []).length).toBe(1);
    for (const f of ['server/challenges.ts', 'server/storage.ts', 'server/routes.ts', 'server/scheduler.ts', 'server/feedEvents.ts']) {
      expect(read(f)).not.toMatch(/sendChallengeReceivedEmail|challengeEmail/);
    }
    const accept = routes.slice(routes.indexOf('app.post("/api/marketplace/challenges/:id/accept"'), routes.indexOf('app.get("/api/marketplace/challenges/mine"'));
    expect(accept).not.toMatch(/sendChallenge|Email\(/);
  });
});

describe('ChallengesCard — #challenges deep-link anchor', () => {
  const mine = { incoming: [], outgoing: [], active: [], settled: [] };
  beforeEach(() => { window.location.hash = ''; });

  it('the card carries id="challenges" and scrolls itself into view when the page opens on #challenges', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    window.location.hash = '#challenges';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['/api/marketplace/challenges/mine'], mine);
    render(<QueryClientProvider client={qc}><ChallengesCard /></QueryClientProvider>);
    const card = screen.getByTestId('card-challenges');
    expect(card.getAttribute('id')).toBe('challenges');
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it('does not scroll when there is no hash', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['/api/marketplace/challenges/mine'], mine);
    render(<QueryClientProvider client={qc}><ChallengesCard /></QueryClientProvider>);
    await new Promise(r => setTimeout(r, 30));
    expect(scroll).not.toHaveBeenCalled();
  });
});
