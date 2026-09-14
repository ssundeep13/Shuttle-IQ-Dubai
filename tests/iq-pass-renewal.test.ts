// IQ Pass Gate 7 — the daily renewal job (7 days before the last picked game,
// one follow-up 7 days after it when no new pass exists), idempotent through
// timestamps on packs, every run recorded in job_runs; the two emails; the
// admin pack list + jersey handover; scheduler registration under the flag.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-main-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';
process.env.RESEND_API_KEY = 'test-key-not-real';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send: sendMock } }; }) }));

const { runIqPassRenewalJob, IQ_PASS_RENEWAL_UTC_HOUR, RENEWAL_LEAD_DAYS, FOLLOWUP_LAG_DAYS } = await import('../server/iqPass/renewal');
const { buildIqPassRenewalEmail, buildIqPassFollowupEmail, iqPassRenewalIdempotencyKey, iqPassFollowupIdempotencyKey } = await import('../server/iqPassEmail');
const { sendIqPassRenewalEmail, sendIqPassFollowupEmail } = await import('../server/emailClient');
const { createIqPassRouter } = await import('../server/iqPass/routes');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const at = (iso: string) => new Date(iso);
const pack = (over: Record<string, unknown> = {}) => ({
  id: 'pk-1', userId: 'u-1', tier: 'club_plus', gamesTotal: 8, status: 'active', renewalEmailSentAt: null, followupEmailSentAt: null, createdAt: at('2026-09-01T08:00:00.000Z'), ...over,
});

function deps(over: Record<string, any> = {}) {
  return {
    now: () => at('2026-09-23T05:00:00.000Z'), // 09:00 Dubai, 23 Sep
    listRenewalCandidates: vi.fn().mockResolvedValue([pack()]),
    getLastGameDate: vi.fn().mockResolvedValue('2026-09-30'), // 7 days ahead
    hasNewerPack: vi.fn().mockResolvedValue(false),
    getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Test Player', email: 't@example.com' }),
    sendRenewal: vi.fn().mockResolvedValue(undefined),
    sendFollowup: vi.fn().mockResolvedValue(undefined),
    markRenewalSent: vi.fn().mockResolvedValue(undefined),
    markFollowupSent: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    startRun: vi.fn().mockResolvedValue('run-1'),
    finishRun: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runIqPassRenewalJob', () => {
  it('constants: 09:00 Dubai (05:00 UTC), 7 days before, 7 days after', () => {
    expect(IQ_PASS_RENEWAL_UTC_HOUR).toBe(5);
    expect(RENEWAL_LEAD_DAYS).toBe(7);
    expect(FOLLOWUP_LAG_DAYS).toBe(7);
  });

  it('sends the renewal exactly 7 days before the last picked game and stamps the pack; the run is recorded ok', async () => {
    const d = deps();
    const r = await runIqPassRenewalJob(d);
    expect(r).toEqual({ renewals: 1, followups: 0, completed: 0 });
    expect(d.sendRenewal).toHaveBeenCalledWith('t@example.com', expect.objectContaining({ packId: 'pk-1', name: 'Test Player', tierLabel: 'Club Plus', lastGameDate: '2026-09-30' }));
    expect(d.markRenewalSent).toHaveBeenCalledWith('pk-1', d.now());
    expect(d.startRun).toHaveBeenCalledWith('iq_pass_renewal');
    expect(d.finishRun).toHaveBeenCalledWith('run-1', 'ok', { renewals: 1, followups: 0, completed: 0, candidates: 1 });
  });

  it('a missed day still sends (window is 7..1 days before), a pack already stamped never sends twice, too early sends nothing', async () => {
    const late = deps({ now: () => at('2026-09-27T05:00:00.000Z') }); // 3 days before
    expect((await runIqPassRenewalJob(late)).renewals).toBe(1);
    const stamped = deps({ listRenewalCandidates: vi.fn().mockResolvedValue([pack({ renewalEmailSentAt: at('2026-09-23T05:00:00.000Z') })]) });
    expect((await runIqPassRenewalJob(stamped)).renewals).toBe(0);
    expect(stamped.sendRenewal).not.toHaveBeenCalled();
    const early = deps({ now: () => at('2026-09-22T05:00:00.000Z') }); // 8 days before
    expect((await runIqPassRenewalJob(early)).renewals).toBe(0);
  });

  it('follow-up: 7 days after the last game, only when no newer pass exists, once; the pack is marked completed once its last game is past', async () => {
    const d = deps({ now: () => at('2026-10-07T05:00:00.000Z'), listRenewalCandidates: vi.fn().mockResolvedValue([pack({ renewalEmailSentAt: at('2026-09-23T05:00:00.000Z') })]) });
    const r = await runIqPassRenewalJob(d);
    expect(r).toEqual({ renewals: 0, followups: 1, completed: 1 });
    expect(d.sendFollowup).toHaveBeenCalledWith('t@example.com', expect.objectContaining({ packId: 'pk-1', tierLabel: 'Club Plus' }));
    expect(d.markFollowupSent).toHaveBeenCalledWith('pk-1', d.now());
    expect(d.markCompleted).toHaveBeenCalledWith('pk-1', d.now());

    const renewed = deps({ now: () => at('2026-10-07T05:00:00.000Z'), hasNewerPack: vi.fn().mockResolvedValue(true), listRenewalCandidates: vi.fn().mockResolvedValue([pack({ renewalEmailSentAt: at('2026-09-23T05:00:00.000Z') })]) });
    expect((await runIqPassRenewalJob(renewed)).followups).toBe(0);
    expect(renewed.sendFollowup).not.toHaveBeenCalled();

    const tooSoon = deps({ now: () => at('2026-10-03T05:00:00.000Z'), listRenewalCandidates: vi.fn().mockResolvedValue([pack({ renewalEmailSentAt: at('2026-09-23T05:00:00.000Z') })]) });
    const r2 = await runIqPassRenewalJob(tooSoon);
    expect(r2.followups).toBe(0);
    expect(r2.completed).toBe(1); // last game (30 Sep) is past → completed even though the follow-up is not due yet

    const done = deps({ now: () => at('2026-10-07T05:00:00.000Z'), listRenewalCandidates: vi.fn().mockResolvedValue([pack({ status: 'completed', renewalEmailSentAt: at('2026-09-23T05:00:00.000Z'), followupEmailSentAt: at('2026-10-07T05:00:00.000Z') })]) });
    expect(await runIqPassRenewalJob(done)).toEqual({ renewals: 0, followups: 0, completed: 0 });
  });

  it('a pack with no seats is skipped; a failing email leaves the stamp unset so the next run retries; the run still finishes ok', async () => {
    const d = deps({ listRenewalCandidates: vi.fn().mockResolvedValue([pack({ id: 'empty' }), pack()]), getLastGameDate: vi.fn().mockImplementation(async (id: string) => (id === 'empty' ? null : '2026-09-30')), sendRenewal: vi.fn().mockRejectedValue(new Error('resend down')) });
    const r = await runIqPassRenewalJob(d);
    expect(r.renewals).toBe(0);
    expect(d.markRenewalSent).not.toHaveBeenCalled();
    expect(d.finishRun).toHaveBeenCalledWith('run-1', 'ok', expect.objectContaining({ renewals: 0, candidates: 2 }));
  });

  it('a query failure records an error run', async () => {
    const d = deps({ listRenewalCandidates: vi.fn().mockRejectedValue(new Error('db down')) });
    await runIqPassRenewalJob(d);
    expect(d.finishRun).toHaveBeenCalledWith('run-1', 'error', expect.anything(), 'db down');
  });
});

describe('renewal + follow-up emails', () => {
  beforeEach(() => { sendMock.mockReset(); sendMock.mockResolvedValue({ data: { id: 'e' }, error: null }); });
  const input = { packId: 'pk-1', name: 'Akhila', tierLabel: 'Club Plus', lastGameDate: '2026-09-30' };

  it('renewal: names the last game day, links to the IQ Pass page, shows no money, no emoji', () => {
    const { subject, html } = buildIqPassRenewalEmail(input);
    expect(subject).toBe('Your IQ Pass wraps up on Wed 30 Sep — lock your next month');
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).toMatch(/Wed 30 Sep/);
    expect(html).toContain('https://shuttleiq.ai/marketplace/iq-pass');
    expect(text).not.toMatch(/AED|per game|save|saving/i);
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(iqPassRenewalIdempotencyKey('pk-1')).toBe('iq-pass-renewal/pk-1');
  });
  it('follow-up: one nudge, links to the IQ Pass page, no money', () => {
    const { subject, html } = buildIqPassFollowupEmail(input);
    expect(subject).toBe('Ready for another month on court?');
    expect(html).toContain('https://shuttleiq.ai/marketplace/iq-pass');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/AED|per game|save|saving/i);
    expect(iqPassFollowupIdempotencyKey('pk-1')).toBe('iq-pass-followup/pk-1');
  });
  it('senders: one Resend call each with the per-pack key; failures are swallowed', async () => {
    await sendIqPassRenewalEmail('a@example.com', input);
    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'iq-pass-renewal/pk-1' });
    await sendIqPassFollowupEmail('a@example.com', input);
    expect(sendMock.mock.calls[1][1]).toEqual({ idempotencyKey: 'iq-pass-followup/pk-1' });
    sendMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(sendIqPassRenewalEmail('a@example.com', input)).resolves.toBeUndefined();
  });
});

describe('wiring (tripwires)', () => {
  it('scheduler: the renewal job runs daily at 05:00 UTC inside the flag block', () => {
    const s = read('server/scheduler.ts');
    const block = s.slice(s.indexOf('if (isIqPassEnabled()) {'));
    expect(block.includes('scheduleDailyAtUtcHour(IQ_PASS_RENEWAL_UTC_HOUR, runIqPassRenewalJob)')).toBe(true);
    expect(s.includes('import { runIqPassRenewalJob, IQ_PASS_RENEWAL_UTC_HOUR } from "./iqPass/renewal";')).toBe(true);
  });
  it('store: candidates are active|completed packs; job runs are inserted then updated', () => {
    const st = read('server/iqPass/store.ts');
    const cand = st.slice(st.indexOf('async listRenewalCandidates('), st.indexOf('async listRenewalCandidates(') + 900);
    expect(cand.includes("IN ('active', 'completed')")).toBe(true);
    expect(st.includes('.insert(jobRuns)')).toBe(true);
    expect(st.includes('.update(jobRuns)')).toBe(true);
    expect(st.includes('async markJerseyHandedOver(')).toBe(true);
  });
  it('admin page exists at /admin/iq-pass behind ProtectedRoute and renders the handover control', () => {
    const app = read('client/src/App.tsx');
    expect(app.includes('<Route path="/admin/iq-pass">')).toBe(true);
    expect(app.indexOf('<IqPassAdmin />')).toBeGreaterThan(app.indexOf('<Route path="/admin/iq-pass">'));
    const page = read('client/src/pages/IqPassAdmin.tsx');
    expect(page.includes("'/api/admin/iq-pass/packs'")).toBe(true);
    expect(page.includes('jersey-handed-over')).toBe(true);
    expect(page.includes('data-testid={`button-jersey-${p.id}`}')).toBe(true);
  });
});

describe('HTTP: admin pack list + jersey handover', () => {
  let server: Server; let base = '';
  const prev = process.env.IQ_PASS_ENABLED;
  const admin = { listPacks: vi.fn().mockResolvedValue([{ id: 'pk-1', tier: 'club_elite', status: 'active', jerseySize: 'L', jerseyHandedOverAt: null, userName: 'Test Player', userEmail: 't@example.com' }]), markJerseyHandedOver: vi.fn().mockResolvedValue({ id: 'pk-1', jerseyHandedOverAt: '2026-09-23T05:00:00.000Z' }) };
  const tok = (role: string) => jwt.sign({ userId: 'u-1', email: 'a@example.com', role }, 'test-main-secret', { expiresIn: '1h' });
  const call = (method: string, path: string, role?: string) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tok(role)}` } : {}) }, body: method === 'POST' ? '{}' : undefined });
  beforeAll(async () => {
    const app = express(); app.use(express.json());
    app.use(createIqPassRouter({ purchase: {} as any, confirm: {} as any, admin }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.IQ_PASS_ENABLED = 'true';
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); if (prev === undefined) delete process.env.IQ_PASS_ENABLED; else process.env.IQ_PASS_ENABLED = prev; });

  it('404 while off; 401 without a token; 403 for a marketplace player; 200 for an admin', async () => {
    delete process.env.IQ_PASS_ENABLED;
    expect((await call('GET', '/api/admin/iq-pass/packs', 'admin')).status).toBe(404);
    process.env.IQ_PASS_ENABLED = 'true';
    expect((await call('GET', '/api/admin/iq-pass/packs')).status).toBe(401);
    expect((await call('GET', '/api/admin/iq-pass/packs', 'marketplace_player')).status).toBe(403);
    const ok = await call('GET', '/api/admin/iq-pass/packs', 'admin');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual([expect.objectContaining({ id: 'pk-1', jerseySize: 'L' })]);
  });
  it('POST /api/admin/iq-pass/packs/:id/jersey-handed-over marks it and answers the stamp', async () => {
    const res = await call('POST', '/api/admin/iq-pass/packs/pk-1/jersey-handed-over', 'admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'pk-1', jerseyHandedOverAt: '2026-09-23T05:00:00.000Z' });
    expect(admin.markJerseyHandedOver).toHaveBeenCalledWith('pk-1', expect.any(Date));
  });
});
