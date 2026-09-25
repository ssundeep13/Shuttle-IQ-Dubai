// Birthday free game — the player-facing cancel copy (Sandeep approves the exact words before they ship). One pure line
// for both My games dialogs ("Cancel your spot?" and "Cancel Booking"), judged on the Dubai date like the server.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const { birthdayCancelLine } = await import('../client/src/lib/primaryCancel');
const Z = (s: string) => new Date(s);
const yash = { birthDay: 24, birthMonth: 9 };

describe('birthdayCancelLine', () => {
  it('a free spot, outside 5 hours, window open → the free game comes back, until the last window day', () => {
    expect(birthdayCancelLine({ freeSpot: true, within5h: false, user: yash, now: Z('2026-09-25T08:00:00Z') }))
      .toBe('Your free birthday game comes back — book any session until Mon 28 Sep.');
  });
  it('a free spot inside 5 hours → it is used up', () => {
    expect(birthdayCancelLine({ freeSpot: true, within5h: true, user: yash, now: Z('2026-09-25T08:00:00Z') }))
      .toBe('Cancelling within 5 hours uses up your free birthday game.');
  });
  it('the window has closed (01:00 Dubai on 29 Sep) → no line, nothing to promise', () => {
    expect(birthdayCancelLine({ freeSpot: true, within5h: false, user: yash, now: Z('2026-09-28T21:00:00Z') })).toBeNull();
  });
  it('not a free spot → no line', () => {
    expect(birthdayCancelLine({ freeSpot: false, within5h: false, user: yash, now: Z('2026-09-25T08:00:00Z') })).toBeNull();
  });
});

describe('My games renders it in both dialogs', () => {
  const src = readFileSync(join(__dirname, '..', 'client/src/pages/marketplace/MyBookings.tsx'), 'utf8');
  it('"Cancel your spot?" and "Cancel Booking" each show the line when there is one', () => {
    expect(src.split('birthdayCancelLine(').length - 1).toBeGreaterThanOrEqual(2);
    expect(src).toContain('data-testid={`text-my-spot-birthday-${booking.id}`}');
    expect(src).toContain('data-testid={`text-cancel-birthday-${booking.id}`}');
  });
  it('"Cancel Booking": a free booking with nothing paid never shows the "AED 0 will be retained" box (window open or closed); money actually paid (guests) keeps it', () => {
    expect(src).toContain('const showLateFeeBox = lateFee && !(booking.birthdayDiscountApplied && booking.amountAed === 0);');
    expect(src).toContain('{showLateFeeBox && (');
    expect(src).not.toContain('{lateFee && (');
  });
  it('"Cancel Booking" within 5 hours, same case: the button reads "Cancel & Use Free Game"; money actually paid keeps "Cancel & Forfeit Payment"', () => {
    expect(src).toContain('const cancelUsesFreeGame = lateFee && !showLateFeeBox;');
    expect(src).toContain("cancelUsesFreeGame ? 'Cancel & Use Free Game' : lateFee ? 'Cancel & Forfeit Payment' : 'Yes, Cancel'");
  });
});
