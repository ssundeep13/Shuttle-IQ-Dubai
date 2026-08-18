/**
 * Design Gate 1, Batch 1 — money-path correctness on the customer surfaces.
 *
 * Every one of these was a silent failure: a payment that stopped saying
 * "Loading…" and did nothing, an error card that could never render, a blank
 * bookings page, a wallet balance read from the wrong place, a login toast
 * with no reason. Pinned RED-first.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── 1.5 shared serverErrorMessage ───────────────────────────────────────────
describe('serverErrorMessage — the request layer throws a plain object, not an Error', () => {
  it('reads the server `error` field first', async () => {
    const { serverErrorMessage } = await import('../client/src/lib/serverError');
    expect(serverErrorMessage({ error: 'Invalid email or password', status: 401 })).toBe('Invalid email or password');
  });
  it('falls back to Error.message', async () => {
    const { serverErrorMessage } = await import('../client/src/lib/serverError');
    expect(serverErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
  });
  it('never returns empty — undefined / null / string / bare object all yield copy', async () => {
    const { serverErrorMessage } = await import('../client/src/lib/serverError');
    for (const e of [undefined, null, {}, 'oops', 42]) {
      const out = serverErrorMessage(e);
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });
  it('the ONE definition is shared — MyBookings and Login import it, no local copies remain', () => {
    const mb = stripComments(read('client/src/pages/marketplace/MyBookings.tsx'));
    const lg = stripComments(read('client/src/pages/marketplace/MarketplaceLogin.tsx'));
    expect(mb).toMatch(/import \{[^}]*serverErrorMessage[^}]*\} from ['"]@\/lib\/serverError['"]/);
    expect(lg).toMatch(/import \{[^}]*serverErrorMessage[^}]*\} from ['"]@\/lib\/serverError['"]/);
    expect(mb).not.toMatch(/function serverErrorMessage/);
    // Login: both catch sites use it; the bare err.message reads are gone
    expect(lg).not.toMatch(/description:\s*err\.message/);
    expect((lg.match(/serverErrorMessage\(err\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ── 1.2 checkout error gate ─────────────────────────────────────────────────
describe('Checkout — the session-load error card is reachable', () => {
  const src = stripComments(read('client/src/pages/marketplace/Checkout.tsx'));
  it('gates on the session having failed to load, not on a paymentMethod that is never null', () => {
    expect(src).not.toMatch(/if \(error && !paymentMethod\)/);
    expect(src).toMatch(/if \(error && !sessionInfo\)/);
  });
});

// ── 1.4 wallet endpoint ─────────────────────────────────────────────────────
describe('Checkout — wallet balance comes from the same endpoint My Bookings and Profile use', () => {
  const src = stripComments(read('client/src/pages/marketplace/Checkout.tsx'));
  it("queries /api/marketplace/me/wallet with no linkedPlayerId gate", () => {
    expect(src).toMatch(/queryKey:\s*\['\/api\/marketplace\/me\/wallet'\]/);
    expect(src).not.toMatch(/'\/api\/referrals\/player'/);
  });
});

// ── 1.1 Pay Now dead-end ────────────────────────────────────────────────────
describe('MyBookings — Pay Now never dead-ends silently', () => {
  const src = stripComments(read('client/src/pages/marketplace/MyBookings.tsx'));
  it('a success response with no redirectUrl surfaces a destructive toast', () => {
    const block = src.slice(src.indexOf('const initiatePaymentMutation'), src.indexOf('const initiatePaymentMutation') + 900);
    expect(block).toMatch(/if \(data\?\.redirectUrl\)[\s\S]*else[\s\S]*toast\(\{[\s\S]*variant:\s*'destructive'/);
  });
});

// ── 1.3 QueryErrorCard + MyBookings error branch ────────────────────────────
describe('QueryErrorCard — the shared "could not load, retry" surface', () => {
  it('renders the message and a Retry button that calls onRetry once per tap', async () => {
    const { QueryErrorCard } = await import('../client/src/components/marketplace/QueryErrorCard');
    const onRetry = vi.fn();
    render(<QueryErrorCard message="Couldn't load your bookings" onRetry={onRetry} testId="err-bookings" />);
    expect(screen.getByTestId('err-bookings').textContent).toContain("Couldn't load your bookings");
    const btn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('the Retry button is a real 44px-class touch target with press feedback', async () => {
    const { QueryErrorCard } = await import('../client/src/components/marketplace/QueryErrorCard');
    render(<QueryErrorCard message="x" onRetry={() => {}} testId="e" />);
    const btn = screen.getByRole('button', { name: /retry/i });
    expect(btn.className).toMatch(/min-h-11/);
    expect(btn.className).toMatch(/siq-press/);
  });
});

describe('MyBookings — an errored bookings query renders the error card, never a blank page', () => {
  const src = stripComments(read('client/src/pages/marketplace/MyBookings.tsx'));
  it('destructures isError + refetch and defaults bookings to [] so upcoming/past never see undefined', () => {
    const q = src.slice(src.indexOf("queryKey: ['/api/marketplace/bookings/mine']") - 200, src.indexOf("queryKey: ['/api/marketplace/bookings/mine']"));
    expect(q).toMatch(/data:\s*bookings\s*=\s*\[\]/);
    expect(q).toMatch(/isError/);
    expect(q).toMatch(/refetch/);
  });
  it('the error branch renders BEFORE the empty branch', () => {
    const iErr = src.indexOf('<QueryErrorCard');
    const iEmpty = src.indexOf("bookings.length === 0");
    expect(iErr).toBeGreaterThan(-1);
    expect(iEmpty).toBeGreaterThan(-1);
    expect(iErr).toBeLessThan(iEmpty);
  });
});
