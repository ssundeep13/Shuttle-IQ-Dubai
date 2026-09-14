// Gate BT1 — bank transfer as a first-class payment method + Confirm Payment
// on pending_payment holds.
//
// The admin-confirm route gains an optional body { method: 'cash' |
// 'bank_transfer', note? }. The decision logic is a pure seam
// (server/adminConfirm.ts) so it is unit-tested here; the route is pinned at
// source (helper used, cash refusal only without an override, every hook-site
// string intact). Finance counts bank_transfer as collected; the email labels
// it; the schema documents it and gains bookings.admin_note through a ONE-SHOT
// migration (never drizzle push). The picker dialog renders in jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send: sendMock } }; }) }));

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.RESEND_API_KEY = 'test-key-not-real';
const { parseAdminConfirmBody, planAdminConfirm, shouldRefuseCash, ADMIN_CONFIRM_METHODS } = await import('../server/adminConfirm');
const { computeRevenueBasesFils } = await import('../server/portal/sessionProfit');
const { sendBookingConfirmationEmail } = await import('../server/emailClient');
const { ConfirmPaymentDialog } = await import('../client/src/components/ConfirmPaymentDialog');

const root = join(__dirname, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const MIGRATION = 'scripts/one-shot/2026-09-11-bookings-admin-note.mts';

// ── 1. body parsing ─────────────────────────────────────────────────────────
describe('parseAdminConfirmBody', () => {
  it('no body / empty body → no override (current behaviour)', () => {
    expect(parseAdminConfirmBody(undefined)).toEqual({ ok: true, method: undefined, note: undefined });
    expect(parseAdminConfirmBody({})).toEqual({ ok: true, method: undefined, note: undefined });
  });
  it('accepts cash and bank_transfer; trims the note; rejects anything else', () => {
    expect(ADMIN_CONFIRM_METHODS).toEqual(['cash', 'bank_transfer']);
    expect(parseAdminConfirmBody({ method: 'cash' })).toEqual({ ok: true, method: 'cash', note: undefined });
    expect(parseAdminConfirmBody({ method: 'bank_transfer', note: '  paid via bank transfer — confirmed by admin 11 Sep  ' }))
      .toEqual({ ok: true, method: 'bank_transfer', note: 'paid via bank transfer — confirmed by admin 11 Sep' });
    expect(parseAdminConfirmBody({ method: 'wallet' }).ok).toBe(false);
    expect(parseAdminConfirmBody({ method: 'ziina' }).ok).toBe(false);
    expect(parseAdminConfirmBody({ method: 'cash', note: 'x'.repeat(501) }).ok).toBe(false);
    expect(parseAdminConfirmBody({ note: '' })).toEqual({ ok: true, method: undefined, note: undefined });
  });
});

// ── 2. the confirm plan ─────────────────────────────────────────────────────
const ziinaHold = { paymentMethod: 'ziina', ziinaPaymentIntentId: 'pi-1', amountAed: 49 };
const cashBooking = { paymentMethod: 'cash', ziinaPaymentIntentId: null, amountAed: 49 };

describe('planAdminConfirm', () => {
  it('NO override → status only; payments row carries the Ziina intent (as today); email says ziina', () => {
    const plan = planAdminConfirm(ziinaHold, {}, []);
    expect(plan.bookingPatch).toEqual({ status: 'confirmed' });
    expect(plan.paymentInsert).toEqual({ ziinaPaymentIntentId: 'pi-1', amount: 49, currency: 'aed', status: 'completed' });
    expect(plan.emailMethod).toBe('ziina');
  });
  it('NO override, intent already recorded → no second payments row', () => {
    const plan = planAdminConfirm(ziinaHold, {}, [{ status: 'completed', ziinaPaymentIntentId: 'pi-1' }]);
    expect(plan.paymentInsert).toBeNull();
  });
  it('bank_transfer override → method set, cash_paid stays false, note stored, payments row WITHOUT an intent id, email labelled bank_transfer', () => {
    const plan = planAdminConfirm(ziinaHold, { method: 'bank_transfer', note: 'paid via bank transfer — confirmed by admin 11 Sep' }, []);
    expect(plan.bookingPatch).toEqual({ status: 'confirmed', paymentMethod: 'bank_transfer', cashPaid: false, adminNote: 'paid via bank transfer — confirmed by admin 11 Sep' });
    expect(plan.paymentInsert).toEqual({ ziinaPaymentIntentId: null, amount: 49, currency: 'aed', status: 'completed' });
    expect(plan.emailMethod).toBe('bank_transfer');
  });
  it('cash override → cash_paid true; no note leaves admin_note untouched', () => {
    const plan = planAdminConfirm(ziinaHold, { method: 'cash' }, []);
    expect(plan.bookingPatch).toEqual({ status: 'confirmed', paymentMethod: 'cash', cashPaid: true });
    expect('adminNote' in plan.bookingPatch).toBe(false);
    expect(plan.paymentInsert?.ziinaPaymentIntentId).toBeNull();
    expect(plan.emailMethod).toBe('cash');
  });
  it('an override never double-records: an existing completed payment suppresses the insert', () => {
    const plan = planAdminConfirm(ziinaHold, { method: 'bank_transfer' }, [{ status: 'completed', ziinaPaymentIntentId: null }]);
    expect(plan.paymentInsert).toBeNull();
  });
  it('a note without a method is still stored', () => {
    const plan = planAdminConfirm(ziinaHold, { note: 'late Ziina, verified' }, []);
    expect(plan.bookingPatch).toEqual({ status: 'confirmed', adminNote: 'late Ziina, verified' });
  });
  it('cash refusal applies only when there is no override', () => {
    expect(shouldRefuseCash(cashBooking, {})).toBe(true);
    expect(shouldRefuseCash(cashBooking, { method: 'cash' })).toBe(false);
    expect(shouldRefuseCash(cashBooking, { method: 'bank_transfer' })).toBe(false);
    expect(shouldRefuseCash(ziinaHold, {})).toBe(false);
  });
});

// ── 3. route pins ───────────────────────────────────────────────────────────
describe('admin-confirm route — pinned at source', () => {
  const routes = read('server/marketplace-routes.ts');
  const route = routes.slice(routes.indexOf('app.post("/api/marketplace/bookings/:id/admin-confirm"'), routes.indexOf('app.post("/api/marketplace/bookings/:id/admin-promote"'));

  it('parses the body first, refuses cash only without an override, applies the plan', () => {
    expect(routes).toMatch(/import \{ parseAdminConfirmBody, planAdminConfirm, shouldRefuseCash \} from "\.\/adminConfirm";/);
    const parse = route.indexOf('parseAdminConfirmBody(req.body)');
    const refuse = route.indexOf('shouldRefuseCash(booking, override)');
    const plan = route.indexOf('planAdminConfirm(booking, override, existingPayments)');
    const patch = route.indexOf('await storage.updateBooking(booking.id, plan.bookingPatch)');
    expect(parse).toBeGreaterThan(0);
    expect(refuse).toBeGreaterThan(parse);
    expect(plan).toBeGreaterThan(refuse);
    expect(patch).toBeGreaterThan(plan);
    expect(route).toMatch(/if \(plan\.paymentInsert\) \{[\s\S]*?await storage\.createPayment\(\{ bookingId: booking\.id, \.\.\.plan\.paymentInsert \}\);/);
    expect(route).toMatch(/sendBookingConfirmationEmail\(user\.email, user\.name, session, plan\.emailMethod, booking\.amountAed\)/);
    expect(route).not.toMatch(/sendBookingConfirmationEmail\(user\.email, user\.name, session, 'ziina'/);
    expect(route).toMatch(/return res\.status\(400\)\.json\(\{ error: parsed\.error \}\)/);
  });

  it('every hook-site string other tests pin is intact, and the hooks still fire after the status write', () => {
    for (const s of [
      'fireReferralOnPayment(booking.userId, booking.id);',
      "syncFoundingMember(booking.userId, 'admin-confirm');",
      "fireDubailandPromo(booking.userId, 'admin-confirm');",
      "fireGoodwillCredit(booking.id, 'admin-confirm');",
    ]) expect(route.includes(s), s).toBe(true);
    expect(route.indexOf('fireReferralOnPayment(')).toBeGreaterThan(route.indexOf('await storage.updateBooking(booking.id, plan.bookingPatch)'));
    expect(route.indexOf("fireGoodwillCredit(booking.id, 'admin-confirm')")).toBeGreaterThan(route.indexOf("updateBookingGuest(slot.id, { status: 'confirmed' })"));
  });

  it('the Ziina webhook path and the wallet code do not know about the admin override', () => {
    expect(read('server/webhookHandler.ts')).not.toMatch(/adminConfirm|planAdminConfirm/);
    expect(read('server/walletLedger.ts')).not.toMatch(/adminConfirm|bank_transfer/);
  });
});

// ── 4. finance ──────────────────────────────────────────────────────────────
describe('bank_transfer counts as collected revenue', () => {
  it('computeRevenueBasesFils: bank_transfer joins ziina + paid cash; wallet and unpaid cash unchanged', () => {
    const out = computeRevenueBasesFils([
      { id: 'a', amountAed: 49, paymentMethod: 'bank_transfer', cashPaid: false },
      { id: 'b', amountAed: 30, paymentMethod: 'cash', cashPaid: true },
      { id: 'c', amountAed: 20, paymentMethod: 'cash', cashPaid: false },
      { id: 'd', amountAed: 10, paymentMethod: 'wallet', cashPaid: false },
      { id: 'e', amountAed: 49, paymentMethod: 'ziina', cashPaid: false },
      { id: 'f', amountAed: 15, paymentMethod: 'birthday_free', cashPaid: false },
    ], new Map([['a', 900]]));
    expect(out.revenueFils).toBe((49 + 30 + 49) * 100 - 900);
    expect(out.walletPaidFils).toBe(1000);
    expect(out.unpaidCashFils).toBe(2000);
    expect(out.valueFils).toBe(out.revenueFils + 1000);
  });
  it('the admin session revenue summary counts bank_transfer as collected in both the monthly and the totals block', () => {
    const s = read('server/storage.ts');
    expect(s).toMatch(/sumField\(bkgs\.filter\(b => b\.paymentMethod === 'ziina' \|\| b\.paymentMethod === 'bank_transfer'\), 'amountAed'\)/);
    expect(s).toMatch(/const cardBookings = confirmed\.filter\(b => b\.paymentMethod === 'ziina' \|\| b\.paymentMethod === 'bank_transfer'\);/);
  });
});

// ── 5. email label ──────────────────────────────────────────────────────────
describe('booking confirmation email label', () => {
  beforeEach(() => { sendMock.mockReset(); sendMock.mockResolvedValue({ data: { id: 'e' }, error: null }); vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });
  const session = { title: 'Smash Sports Academy Session', venueName: 'Smash', venueLocation: null, venueMapUrl: null, date: new Date('2026-09-11'), startTime: '20:00', endTime: '22:00' } as any;
  it.each([
    ['bank_transfer', 'Bank transfer'],
    ['cash', 'Cash (pay at venue)'],
    ['ziina', 'Card (paid online)'],
  ])('%s → "%s"', async (method, label) => {
    await sendBookingConfirmationEmail('p@example.com', 'Micah', session, method, 49);
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).toContain(label);
    if (method === 'bank_transfer') expect(html).not.toContain('Card (paid online)');
  });
});

// ── 6. schema + migration ───────────────────────────────────────────────────
describe('schema + one-shot migration', () => {
  it('bookings gains admin_note (nullable text) and documents bank_transfer', () => {
    const s = read('shared/schema.ts');
    const bookings = s.slice(s.indexOf('export const bookings = pgTable'), s.indexOf('export const insertBookingSchema'));
    expect(bookings).toMatch(/adminNote: text\("admin_note"\),/);
    expect(bookings).toMatch(/'bank_transfer'/);
  });
  it('the migration adds exactly that one column, is registry-keyed, has a dry run, and never uses drizzle push', () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const m = read(MIGRATION);
    expect(m).toMatch(/const KEY = 'bookings_admin_note_v1';/);
    expect(m).toContain('ALTER TABLE "bookings" ADD COLUMN "admin_note" text;');
    expect((m.match(/ALTER TABLE/g) ?? []).length).toBe(1);
    expect(m).not.toMatch(/DROP|drizzle-kit push/);
    expect(m).toMatch(/--dry-run/);
    expect(m).toMatch(/INSERT INTO system_one_shot_migrations \(key\) VALUES \(\$1\)/);
    expect(m).toMatch(/information_schema\.columns/); // pre-check: column already present → no ALTER
  });
});

// ── 7. picker dialog ────────────────────────────────────────────────────────
describe('ConfirmPaymentDialog', () => {
  it('offers Cash and Bank transfer, disables Confirm until one is picked, passes method + trimmed note', () => {
    const onConfirm = vi.fn();
    render(<ConfirmPaymentDialog open onOpenChange={() => {}} playerName="Micah Furtado" amountAed={49} pending={false} onConfirm={onConfirm} />);
    const confirm = screen.getByTestId('button-confirm-payment-submit') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId('option-method-cash').textContent).toContain('Cash');
    expect(screen.getByTestId('option-method-bank_transfer').textContent).toContain('Bank transfer');
    fireEvent.click(screen.getByTestId('option-method-bank_transfer'));
    expect(screen.getByTestId('option-method-bank_transfer').getAttribute('aria-pressed')).toBe('true');
    expect(confirm.disabled).toBe(false);
    fireEvent.change(screen.getByTestId('input-confirm-note'), { target: { value: '  paid via bank transfer — confirmed by admin 11 Sep ' } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('bank_transfer', 'paid via bank transfer — confirmed by admin 11 Sep');
    expect(screen.getByTestId('dialog-confirm-payment').textContent).toContain('Micah Furtado');
    expect(screen.getByTestId('dialog-confirm-payment').textContent).toContain('49');
  });
  it('cash with an empty note passes undefined for the note', () => {
    const onConfirm = vi.fn();
    render(<ConfirmPaymentDialog open onOpenChange={() => {}} playerName="P" amountAed={49} pending={false} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('option-method-cash'));
    fireEvent.click(screen.getByTestId('button-confirm-payment-submit'));
    expect(onConfirm).toHaveBeenCalledWith('cash', undefined);
  });
  it('no emoji, no hex literals', () => {
    const d = read('client/src/components/ConfirmPaymentDialog.tsx');
    expect(d).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(d).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

// ── 8. admin panel wiring ───────────────────────────────────────────────────
describe('SessionsManagement — Confirm Payment on holds', () => {
  const admin = read('client/src/pages/SessionsManagement.tsx');
  it('the button renders for pending AND pending_payment and opens the picker; Release Hold stays alongside', () => {
    expect(admin).toMatch(/import \{ ConfirmPaymentDialog \} from '@\/components\/ConfirmPaymentDialog';/);
    const btn = admin.slice(admin.lastIndexOf('{booking.paymentMethod !== \'cash\' &&', admin.indexOf('button-admin-confirm-')), admin.indexOf('button-admin-confirm-'));
    expect(btn).toContain("(booking.status === 'pending' || booking.status === 'pending_payment')");
    expect(btn).toContain('setConfirmTarget(booking)');
    expect(admin).toMatch(/<ConfirmPaymentDialog[\s\S]*?onConfirm=\{\(method, note\) => adminConfirmMutation\.mutate\(\{ bookingId: confirmTarget\.id, method, note \}\)\}/);
    expect(admin).toContain("'Release Hold' : 'Payment Not Received'");
  });
  it('the mutation posts a JSON body with method + note', () => {
    const m = admin.slice(admin.indexOf('const adminConfirmMutation = useMutation({'), admin.indexOf('const paymentNotReceivedMutation'));
    expect(m).toMatch(/mutationFn: async \(\{ bookingId, method, note \}/);
    expect(m).toMatch(/body: JSON\.stringify\(\{ method, note \}\)/);
    expect(m).toMatch(/'Content-Type': 'application\/json'/);
  });
});
