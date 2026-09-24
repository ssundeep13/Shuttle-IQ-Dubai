// Tournament Gate 3 — the player-facing words, in one pure module (Sandeep's brand
// voice: direct, no emoji, tier display names only). Every screen reads its copy
// from client/src/lib/tournamentCopy.ts, so this file is the copy review.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const copy = await import('../client/src/lib/tournamentCopy');

describe('counter lines — "Competitive · 12 of 18 filled"', () => {
  it('open, waitlist and full', () => {
    expect(copy.counterLine({ tier: 'Competitive', cap: 18, held: 12, waitlisted: 0, waitlistCap: 2, state: 'open' })).toBe('Competitive · 12 of 18 filled');
    expect(copy.counterLine({ tier: 'Professional', cap: 6, held: 6, waitlisted: 1, waitlistCap: 2, state: 'waitlist' })).toBe('Professional · 6 of 6 filled · waitlist open');
    expect(copy.counterLine({ tier: 'Beginner', cap: 6, held: 6, waitlisted: 2, waitlistCap: 2, state: 'full' })).toBe('Beginner · 6 of 6 filled · waitlist full');
  });

  it('never shows a DB level name', () => {
    expect(copy.counterLine({ tier: 'Intermediate', cap: 18, held: 0, waitlisted: 0, waitlistCap: 2, state: 'open' })).toBe('Intermediate · 0 of 18 filled');
    expect(Object.values(copy).filter((v) => typeof v === 'string').join(' ')).not.toMatch(/lower_intermediate|upper_intermediate|Advanced|Novice/);
  });
});

describe('sponsorship card — exact copy (Sandeep, 2026-09-23)', () => {
  it('heading, line, link, tick', () => {
    expect(copy.SPONSOR_HEADING).toBe('Want to sponsor a team?');
    expect(copy.SPONSOR_LINE).toBe('Team sponsor AED 1,500 · Title sponsor AED 6,000 · in-kind welcome');
    expect(copy.SPONSOR_DECK_LABEL).toBe('View sponsorship deck');
    expect(copy.SPONSOR_TICK).toBe('My company may sponsor a team');
  });

  it('the deck link ships only together with the PDF (absolute URL for the native shell)', () => {
    const pdf = join(__dirname, '..', 'client/public/docs/shuttleiq-premier-league-sponsorship.pdf');
    expect(copy.TOURNAMENT_DECK_AVAILABLE).toBe(existsSync(pdf));
    expect(copy.TOURNAMENT_DECK_URL).toBe('https://shuttleiq.ai/docs/shuttleiq-premier-league-sponsorship.pdf');
  });
});

describe('withdraw dialog — refund before Thu 8 Oct 23:59, none after, manual via Ziina within 5 working days', () => {
  const deadline = '2026-10-08T20:00:00.000Z'; // exclusive instant

  it('states the rule with the Dubai wall-clock deadline', () => {
    expect(copy.refundDeadlineLabel(deadline)).toBe('Thu 8 Oct 23:59');
    const paid = copy.withdrawDialogCopy({ withdrawDeadlineAt: deadline, paid: true, now: new Date('2026-10-01T10:00:00Z') });
    expect(paid.title).toBe('Withdraw from the ShuttleIQ League?');
    expect(paid.body).toContain('Withdraw before Thu 8 Oct 23:59 for a full refund of AED 100.');
    expect(paid.body).toContain('After that your spot is released with no refund.');
    expect(paid.body).toContain('Refunds are handled manually via Ziina within 5 working days.');
    expect(paid.confirm).toBe('Withdraw and request refund');
  });

  it('after the deadline: says plainly there is no refund', () => {
    const late = copy.withdrawDialogCopy({ withdrawDeadlineAt: deadline, paid: true, now: new Date('2026-10-09T10:00:00Z') });
    expect(late.body).toContain('The refund deadline (Thu 8 Oct 23:59) has passed, so withdrawing now gives no refund.');
    expect(late.confirm).toBe('Withdraw without refund');
  });

  it('nothing paid: nothing to refund', () => {
    const unpaid = copy.withdrawDialogCopy({ withdrawDeadlineAt: deadline, paid: false, now: new Date('2026-10-01T10:00:00Z') });
    expect(unpaid.body).toContain('You have not paid, so there is nothing to refund.');
    expect(unpaid.confirm).toBe('Withdraw');
  });
});

describe('event line, status lines, errors', () => {
  it('event line in Dubai time with the venue in display case', () => {
    expect(copy.eventLine({ startsAt: '2026-10-17T14:00:00.000Z', endsAt: '2026-10-17T18:00:00.000Z', venueName: 'BASELINE SPORTS ACADEMY DIP' }))
      .toBe('Sat 17 Oct, 6:00 pm to 10:00 pm · Baseline Sports Academy DIP');
  });

  it('status lines', () => {
    expect(copy.statusLine({ status: 'pending_payment', tier: 'Competitive', holdExpiresAt: '2026-09-26T10:00:00.000Z', amountAed: 100 }))
      .toBe('Competitive · awaiting payment · pay AED 100 by 2:00 pm on Sat 26 Sept');
    expect(copy.statusLine({ status: 'confirmed', tier: 'Competitive', holdExpiresAt: null, amountAed: 100 })).toBe("Competitive · you're in");
    expect(copy.statusLine({ status: 'waitlisted', tier: 'Beginner', holdExpiresAt: null, amountAed: 100 })).toBe("Beginner · on the waitlist · we'll tell you if a spot opens");
  });

  it('every server error code has plain copy, and no emoji anywhere', () => {
    for (const code of ['tier_full', 'registration_closed', 'registration_not_open', 'link_player_first', 'tier_unresolved', 'hold_expired', 'payment_in_progress', 'payment_start_failed', 'payment_status_unavailable', 'already_registered', 'withdraw_closed', 'not_payable', 'invalid_t_shirt_size', 'invalid_company']) {
      expect(copy.errorCopy(code), code).toBeTruthy();
      expect(copy.errorCopy(code)).not.toBe(copy.errorCopy('something_else'));
    }
    const all = JSON.stringify(copy);
    expect(all).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('ShuttleIQ League rename (Sandeep, 2026-09-24)', () => {
  it('"Premier League" appears nowhere in the app code (client, server, shared)', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (/\.(ts|tsx|html)$/.test(e.name) && readFileSync(p, 'utf8').includes('Premier League')) hits.push(p);
      }
    };
    for (const d of ['client/src', 'server', 'shared']) walk(join(__dirname, '..', d));
    expect(hits).toEqual([]);
  });
});
