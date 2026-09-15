// The client half of the re-book guard fixes (adversarial review, 2026-09-15):
//   • the 409 pending_booking_exists answer carries its human copy in `message` — both booking clients must show
//     that, not the raw slug;
//   • the waitlisted answer must release the in-flight lock (the deliberate no-reset is for the redirect only);
//   • on the native shell the Ziina sheet can be dismissed without ever navigating to the return URL, so the lock
//     is released when the sheet closes (onCheckoutDismissed) — a no-op on web, where the page navigates away.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const cap = vi.hoisted(() => ({ native: false, open: vi.fn(), addListener: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: cap.open, addListener: cap.addListener } }));

const { onCheckoutDismissed } = await import('@/lib/nativeAuth');
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => { cap.native = false; cap.open.mockReset(); cap.addListener.mockReset(); });

describe('onCheckoutDismissed', () => {
  it('web: a no-op — no listener, the callback never fires (the page is navigating away)', async () => {
    const cb = vi.fn();
    await onCheckoutDismissed(cb);
    expect(cap.addListener).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });
  it('native: fires the callback once when the browser sheet closes, then removes its own listener', async () => {
    cap.native = true;
    const handle = { remove: vi.fn().mockResolvedValue(undefined) };
    let fire: (() => void) | undefined;
    cap.addListener.mockImplementation(async (event: string, fn: () => void) => { if (event === 'browserFinished') fire = fn; return handle; });
    const cb = vi.fn();
    await onCheckoutDismissed(cb);
    expect(cap.addListener).toHaveBeenCalledWith('browserFinished', expect.any(Function));
    expect(cb).not.toHaveBeenCalled();
    fire!();
    fire!();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });
});

describe('source pins — both booking clients', () => {
  it('SessionDetails and Checkout show the server\'s sentence for a 409 (message first, slug as fallback)', () => {
    for (const f of ['client/src/pages/marketplace/SessionDetails.tsx', 'client/src/pages/marketplace/Checkout.tsx']) {
      const src = read(f);
      expect(src.includes("throw new Error(data.message || data.error || 'Booking failed')")).toBe(true);
      expect(src.includes("throw new Error(data.error || 'Booking failed')")).toBe(false);
    }
  });
  it('SessionDetails releases the lock on the waitlisted answer, and on native when the checkout sheet is dismissed', () => {
    const src = read('client/src/pages/marketplace/SessionDetails.tsx');
    const wl = src.indexOf('if (data.waitlisted) {');
    const waitlistBlock = src.slice(wl, src.indexOf('return;', wl));
    expect(waitlistBlock.includes('submitInFlight.current = false;')).toBe(true);
    expect(waitlistBlock.includes('setProcessing(false);')).toBe(true);
    const redirect = src.indexOf('await openCheckoutRedirect(data.redirectUrl);');
    const afterRedirect = src.slice(redirect, src.indexOf('return;', redirect));
    expect(afterRedirect.includes('onCheckoutDismissed(')).toBe(true);
  });
  it('Checkout releases its spinner on native when the checkout sheet is dismissed (same class of bug, same one-line fix)', () => {
    const src = read('client/src/pages/marketplace/Checkout.tsx');
    const redirect = src.indexOf('await openCheckoutRedirect(data.redirectUrl);');
    const after = src.slice(redirect, redirect + 200);
    expect(after.includes('onCheckoutDismissed(')).toBe(true);
  });
});
