// Automatic goodwill credit at booking confirmation — the hook that ends the
// manual-script ritual (the 2026-08-14 run missed 20 paid players because the
// script had to be remembered and re-run).
//
// The decision is a PURE planner (real code, no mocks). The DB boundary is the
// only thing faked, and the fake behaves like the real table: it remembers the
// markers it wrote, so idempotency is exercised for real rather than asserted.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const {
  GOODWILL_MARKER_PREFIX, goodwillMarker, planGoodwillCredits,
  applyGoodwillCreditForBooking, fireGoodwillCredit,
  MAX_GOODWILL_CREDITS_PER_PLAYER, atGoodwillCap,
} = await import('../server/goodwillCredit');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const OPS = '8a73c33c-fbaa-4f74-ab9c-4a277d4feb0c';
const FLAGGED = { opsSessionId: OPS, goodwillCreditFils: 1500 };
const UNFLAGGED = { opsSessionId: OPS, goodwillCreditFils: null };

const holder = (playerId: string | null, name = 'Holder') =>
  ({ playerId, personName: name, kind: 'holder' as const, slotInactive: false });
const guest = (playerId: string | null, name = 'Guest') =>
  ({ playerId, personName: name, kind: 'guest' as const, slotInactive: false });

// ── The DB boundary, faked with real table semantics ────────────────────────
function makeFakeDb(seedMarkers: Array<{ playerId: string; marker: string }> = []) {
  const ledger = [...seedMarkers.map(m => ({ ...m, fils: 1500, type: 'adjustment', bookingId: 'seed' }))];
  const bookingWrites: string[] = [];
  return {
    ledger,
    bookingWrites,
    deps: {
      loadContext: async (bookingId: string) => ctx[bookingId] ?? null,
      creditPlayer: async (c: { playerId: string; marker: string; creditFils: number; bookingId: string }) => {
        // The real one re-checks under a row lock; the fake enforces the same rules.
        if (ledger.some(l => l.playerId === c.playerId && l.marker === c.marker)) return 'already_credited';
        const promoCount = ledger.filter(l => l.playerId === c.playerId && l.marker.startsWith(GOODWILL_MARKER_PREFIX)).length;
        if (atGoodwillCap(promoCount)) return 'at_cap';
        ledger.push({ playerId: c.playerId, marker: c.marker, fils: c.creditFils, type: 'adjustment', bookingId: c.bookingId });
        return 'credited';
      },
    },
  };
}
let ctx: Record<string, any> = {};
beforeEach(() => { ctx = {}; });

describe('(a) confirm on a flagged session → exactly one 1500-fils marker credit lands', () => {
  it('credits the holder once, with the marker the script already uses', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] };

    const plan = await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(plan.credits.map(c => c.playerId)).toEqual(['p1']);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ playerId: 'p1', fils: 1500, type: 'adjustment', marker: `Dubailand goodwill · session ${OPS}` });
  });

  it('credits linked guests in their own right (the Ashel/Sandeep class the sweep found)', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1'), guest('p2', 'Ashel')], alreadyCredited: [] };

    await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(db.ledger.map(l => l.playerId).sort()).toEqual(['p1', 'p2']);
    expect(db.ledger.every(l => l.fils === 1500)).toBe(true);
  });

  it('a booking that is not confirmed credits nobody', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'pending', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] };
    await applyGoodwillCreditForBooking('bk1', db.deps);
    expect(db.ledger).toHaveLength(0);
  });

  it('a holder who cancelled their OWN spot is not credited (booking still live for guests)', () => {
    const plan = planGoodwillCredits({
      session: FLAGGED, bookingStatus: 'confirmed', alreadyCredited: [],
      candidates: [{ ...holder('p1'), slotInactive: true }, guest('p2')],
    });
    expect(plan.credits.map(c => c.playerId)).toEqual(['p2']);
  });
});

describe('(b) confirm on an UNFLAGGED session → zero credits', () => {
  it('no flag means no promo — nothing is written and no marker is formed', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: UNFLAGGED, candidates: [holder('p1'), guest('p2')], alreadyCredited: [] };

    const plan = await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(plan.credits).toEqual([]);
    expect(plan.marker).toBeNull();
    expect(db.ledger).toHaveLength(0);
  });

  it('a zero or negative flag is treated as off, never as a zero-fils ledger row', () => {
    for (const fils of [0, -1500]) {
      const plan = planGoodwillCredits({
        session: { opsSessionId: OPS, goodwillCreditFils: fils },
        bookingStatus: 'confirmed', candidates: [holder('p1')], alreadyCredited: [],
      });
      expect(plan.credits).toEqual([]);
    }
  });

  it('a bookable session with no linked ops row cannot form a marker, so it never credits', () => {
    const plan = planGoodwillCredits({
      session: { opsSessionId: null, goodwillCreditFils: 1500 },
      bookingStatus: 'confirmed', candidates: [holder('p1')], alreadyCredited: [],
    });
    expect(plan.credits).toEqual([]);
    expect(plan.marker).toBeNull();
  });
});

describe('(c) confirm twice / re-book after cancel → still exactly one credit', () => {
  it('a second confirm of the same booking writes nothing more', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] };

    await applyGoodwillCreditForBooking('bk1', db.deps);
    // second confirm sees the ledger the first one wrote
    ctx['bk1'].alreadyCredited = db.ledger.filter(l => l.marker === goodwillMarker(OPS)).map(l => l.playerId);
    await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(db.ledger).toHaveLength(1);
  });

  it('re-booking the same session after a cancel gets NO second credit — the marker is the memory', async () => {
    const db = makeFakeDb([{ playerId: 'p1', marker: goodwillMarker(OPS) }]);
    // brand-new booking id, same player, same session
    ctx['bk2'] = { bookingId: 'bk2', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: ['p1'] };

    const plan = await applyGoodwillCreditForBooking('bk2', db.deps);

    expect(plan.credits).toEqual([]);
    expect(plan.skipped).toContainEqual(expect.objectContaining({ playerId: 'p1', reason: 'already_credited' }));
    expect(db.ledger).toHaveLength(1);
  });

  it('the DB layer refuses a duplicate even if the planner is handed a stale already-credited read (race)', async () => {
    const db = makeFakeDb([{ playerId: 'p1', marker: goodwillMarker(OPS) }]);
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] /* stale */ };

    await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(db.ledger).toHaveLength(1); // the lock-and-recheck refused it
  });

  it('the same player appearing as both holder and guest is credited once', () => {
    const plan = planGoodwillCredits({
      session: FLAGGED, bookingStatus: 'confirmed', alreadyCredited: [],
      candidates: [holder('p1'), guest('p1')],
    });
    expect(plan.credits).toHaveLength(1);
  });
});

describe('(d) unlinked guest → no credit, no error, booking unaffected', () => {
  it('an unlinked guest is skipped silently and the rest of the booking still credits', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1'), guest(null, 'Ashhar')], alreadyCredited: [] };

    const plan = await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(db.ledger.map(l => l.playerId)).toEqual(['p1']);
    expect(plan.skipped).toContainEqual(expect.objectContaining({ personName: 'Ashhar', reason: 'unlinked' }));
    expect(db.bookingWrites).toHaveLength(0); // the hook never touches the booking
  });

  it('a booking whose every candidate is unlinked resolves cleanly with nothing written', async () => {
    const db = makeFakeDb();
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [guest(null), guest(null)], alreadyCredited: [] };
    await expect(applyGoodwillCreditForBooking('bk1', db.deps)).resolves.toBeTruthy();
    expect(db.ledger).toHaveLength(0);
  });
});

describe('(e) forced credit failure → the booking still confirms, the failure is logged', () => {
  it('fireGoodwillCredit swallows a thrown credit and logs it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = {
      loadContext: async () => { throw new Error('db down'); },
      creditPlayer: async () => true,
    };

    expect(() => fireGoodwillCredit('bk1', 'test-site', boom as any)).not.toThrow();
    await new Promise(r => setTimeout(r, 0));

    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('test-site');
    err.mockRestore();
  });

  it('a failure part-way through still credits the players it reached (best-effort, per player)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ledger: string[] = [];
    const flaky = {
      loadContext: async () => ({ bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1'), guest('p2')], alreadyCredited: [] }),
      creditPlayer: async (c: any) => { if (c.playerId === 'p1') throw new Error('nope'); ledger.push(c.playerId); return true; },
    };

    await applyGoodwillCreditForBooking('bk1', flaky as any);

    expect(ledger).toEqual(['p2']); // p1's failure did not abort p2
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('fireGoodwillCredit returns void synchronously — it can never be awaited into the request path', () => {
    const slow = { loadContext: async () => new Promise(() => {}), creditPlayer: async () => true };
    expect(fireGoodwillCredit('bk1', 'site', slow as any)).toBeUndefined();
  });
});

describe('(f) coexistence — the manual script over a hook-credited session inserts zero rows', () => {
  it('hook and script share ONE marker builder, so the script imports it rather than restating it', () => {
    const script = read('scripts/dubailand-goodwill-credit.mts');
    expect(script).toMatch(/import\s*\{[^}]*GOODWILL_MARKER_PREFIX[^}]*\}\s*from\s*'\.\.\/server\/goodwillCredit'/);
    expect(stripComments(script)).not.toContain("'Dubailand goodwill · session '"); // no second copy to drift
  });

  it('the marker is byte-identical to the one already in production', () => {
    expect(GOODWILL_MARKER_PREFIX).toBe('Dubailand goodwill · session ');
    expect(goodwillMarker('32fd24f9-6899-47ae-9496-87a1ebda9835'))
      .toBe('Dubailand goodwill · session 32fd24f9-6899-47ae-9496-87a1ebda9835');
  });

  it('every player the hook credited is already-credited to the script rule → zero to credit', () => {
    const hookCredited = planGoodwillCredits({
      session: FLAGGED, bookingStatus: 'confirmed', alreadyCredited: [],
      candidates: [holder('p1'), guest('p2')],
    }).credits.map(c => c.playerId);

    const scriptRerun = planGoodwillCredits({
      session: FLAGGED, bookingStatus: 'confirmed', alreadyCredited: hookCredited,
      candidates: [holder('p1'), guest('p2')],
    });

    expect(scriptRerun.credits).toEqual([]);
  });
});

describe('AED 45 promo cap — the same ceiling the script enforces', () => {
  it('the cap is 3 credits and the predicate closes at exactly 3', () => {
    expect(MAX_GOODWILL_CREDITS_PER_PLAYER).toBe(3);
    expect(atGoodwillCap(0)).toBe(false);
    expect(atGoodwillCap(2)).toBe(false);
    expect(atGoodwillCap(3)).toBe(true);
    expect(atGoodwillCap(4)).toBe(true); // defensive: never re-opens above the cap
  });

  it('a player already holding 3 goodwill markers is skipped on a 4th flagged session', async () => {
    const capped = ['s1', 's2', 's3'].map(s => ({ playerId: 'p1', marker: `${GOODWILL_MARKER_PREFIX}${s}` }));
    const db = makeFakeDb(capped);
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] };

    const plan = await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(plan.credits).toEqual([]);
    expect(plan.skipped).toContainEqual(expect.objectContaining({ playerId: 'p1', reason: 'at_cap' }));
    expect(db.ledger).toHaveLength(3); // nothing added
  });

  it('a capped player does not block the rest of the booking', async () => {
    const db = makeFakeDb(['s1', 's2', 's3'].map(s => ({ playerId: 'p1', marker: `${GOODWILL_MARKER_PREFIX}${s}` })));
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1'), guest('p2')], alreadyCredited: [] };

    await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(db.ledger.filter(l => l.playerId === 'p2')).toHaveLength(1);
    expect(db.ledger.filter(l => l.playerId === 'p1')).toHaveLength(3);
  });

  it('a player at 2 credits still gets their third', async () => {
    const db = makeFakeDb(['s1', 's2'].map(s => ({ playerId: 'p1', marker: `${GOODWILL_MARKER_PREFIX}${s}` })));
    ctx['bk1'] = { bookingId: 'bk1', bookingStatus: 'confirmed', session: FLAGGED, candidates: [holder('p1')], alreadyCredited: [] };

    const plan = await applyGoodwillCreditForBooking('bk1', db.deps);

    expect(plan.credits.map(c => c.playerId)).toEqual(['p1']);
    expect(db.ledger).toHaveLength(3);
  });

  it('the count is taken under the lock, on the marker PREFIX, before any money moves', () => {
    const src = read('server/goodwillCredit.ts');
    const fn = src.slice(src.indexOf('async function creditPlayerReal'), src.indexOf('async function loadContextReal'));
    const lock = fn.indexOf('FOR UPDATE');
    const count = fn.indexOf('GOODWILL_MARKER_PREFIX');
    const pay = fn.indexOf('applyWalletDelta');
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);   // counted inside the locked section
    expect(pay).toBeGreaterThan(count);    // and before the money moves
    expect(fn).toContain('LIKE');          // prefix match, not this session's marker
    expect(fn).toContain('atGoodwillCap');
  });

  it('hook and script share ONE cap constant, so the ceiling cannot drift either', () => {
    const script = read('scripts/dubailand-goodwill-credit.mts');
    expect(script).toMatch(/import\s*\{[^}]*MAX_GOODWILL_CREDITS_PER_PLAYER[^}]*\}\s*from\s*'\.\.\/server\/goodwillCredit'/);
    expect(stripComments(script)).not.toMatch(/const\s+MAX_CREDITS_PER_PLAYER\s*=\s*3/);
  });
});

describe('policy — no clawback, ever', () => {
  it('the module exposes no reversal path and writes no negative delta', () => {
    const code = stripComments(read('server/goodwillCredit.ts'));
    expect(/reverse|clawback|reversal/i.test(code)).toBe(false);
    expect(code.includes('-creditFils')).toBe(false);
    expect(code.includes('deltaFils: -')).toBe(false);
  });

  it('a cancelled slot on an already-credited player is a no-op, not a reversal', () => {
    const plan = planGoodwillCredits({
      session: FLAGGED, bookingStatus: 'cancelled', alreadyCredited: ['p1'],
      candidates: [{ ...holder('p1'), slotInactive: true }],
    });
    expect(plan.credits).toEqual([]);
    expect(plan).not.toHaveProperty('reversals');
  });
});

describe('money-path discipline + race safety', () => {
  const src = read('server/goodwillCredit.ts');

  it('applyWalletDelta is the only money writer — no raw balance UPDATE or ledger INSERT', () => {
    const code = stripComments(src);
    expect(code.includes('applyWalletDelta')).toBe(true);
    expect(/UPDATE\s+players/i.test(code)).toBe(false);
    expect(/INSERT\s+INTO\s+wallet_transactions/i.test(code)).toBe(false);
  });

  it('the player row is locked FOR UPDATE before the marker re-check (double-confirm race)', () => {
    const code = stripComments(src);
    expect(code.indexOf('FOR UPDATE')).toBeGreaterThan(-1);
    expect(code.indexOf('FOR UPDATE')).toBeLessThan(code.indexOf('wallet_transactions'));
  });

  it('the credit amount comes from the session flag, never a module constant', () => {
    const code = stripComments(src);
    expect(code.includes('goodwillCreditFils')).toBe(true);
    expect(/const\s+\w*CREDIT_FILS\s*=\s*1500/.test(code)).toBe(false);
  });
});

describe('wiring — every confirm transition fires the hook', () => {
  const routes = read('server/marketplace-routes.ts');
  const webhook = read('server/webhookHandler.ts');
  const expenses = read('server/portal/portalExpenses.ts');

  it('ziina booking confirm', () => {
    const fn = webhook.slice(webhook.indexOf('export async function confirmZiinaBookingByIntentId'));
    expect(fn).toContain('await storage.updateBooking(booking.id, { status: "confirmed" })');
    expect(fn).toContain("fireGoodwillCredit(booking.id, 'ziina-confirm')");
  });

  it('ziina EXTRA-GUEST slot confirm — the class the manual sweep had to catch by hand', () => {
    const i = webhook.indexOf('// Confirm the guest slot and clear the pending intent ID');
    expect(i).toBeGreaterThan(-1);
    expect(webhook.slice(i, i + 1600)).toContain('fireGoodwillCredit(parentBooking.id');
  });

  it('wallet-confirm, admin-confirm, admin-promote', () => {
    for (const site of ['wallet-confirm', 'admin-confirm', 'admin-promote']) {
      expect(routes).toContain(`fireGoodwillCredit(booking.id, '${site}')`);
    }
  });

  it('admin cash booking created directly as confirmed', () => {
    const i = routes.indexOf("syncFoundingMember(userId, 'admin-cash-booking')");
    expect(i).toBeGreaterThan(-1);
    expect(routes.slice(i - 200, i + 600)).toContain("fireGoodwillCredit(booking.id, 'admin-cash-booking')");
  });

  it('cash-paid toggle, as a backstop', () => {
    expect(expenses).toContain('fireGoodwillCredit(');
  });

  // Ordering matters as much as presence: several paths confirm the booking
  // first and flip its pending guest slots to 'confirmed' further down. A hook
  // fired in between sees the guests still pending and skips them — which is
  // precisely the miss this gate exists to end.
  it('ziina-confirm fires AFTER the pending guest slots are confirmed', () => {
    const fn = webhook.slice(webhook.indexOf('export async function confirmZiinaBookingByIntentId'));
    const slots = fn.indexOf('const pendingGuests = await storage.getBookingGuests(booking.id)');
    const hook = fn.indexOf("fireGoodwillCredit(booking.id, 'ziina-confirm')");
    expect(slots).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(slots);
  });

  it('admin-confirm fires AFTER the pending guest slots are confirmed', () => {
    const slots = routes.indexOf('const pendingSlots = await storage.getBookingGuests(booking.id)');
    const hook = routes.indexOf("fireGoodwillCredit(booking.id, 'admin-confirm')");
    expect(slots).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(slots);
  });

  it('admin-promote fires AFTER the pending guest slots are confirmed', () => {
    const slots = routes.indexOf('const slots = await storage.getBookingGuests(booking.id)');
    const hook = routes.indexOf("fireGoodwillCredit(booking.id, 'admin-promote')");
    expect(slots).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(slots);
  });

  it('wallet-confirm fires AFTER its slots are created confirmed', () => {
    const slots = routes.indexOf("createAllSlotsForBooking(booking.id, 'confirmed', true)");
    const hook = routes.indexOf("fireGoodwillCredit(booking.id, 'wallet-confirm')");
    expect(slots).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(slots);
  });

  it('every call site is fire-and-forget — never awaited into a payment or booking path', () => {
    for (const [name, src] of [['routes', routes], ['webhook', webhook], ['expenses', expenses]] as const) {
      expect(src.includes('await fireGoodwillCredit'), `${name} awaits the hook`).toBe(false);
      expect(/return\s+fireGoodwillCredit/.test(src), `${name} returns the hook`).toBe(false);
    }
  });

  it('the wrapper itself catches — the throw can never escape into the caller', () => {
    const src = read('server/goodwillCredit.ts');
    const wrap = src.slice(src.indexOf('export function fireGoodwillCredit'));
    expect(wrap).toContain('.catch(');
    expect(wrap).not.toContain('await ');
  });
});
