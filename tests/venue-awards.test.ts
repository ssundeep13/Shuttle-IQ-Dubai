// Founding Member — venue-scoped award, Silicon Oasis launch week.
//
// The lifecycle rules are the things that can silently break, so they are held
// as source tripwires: award fires live on confirmation, waitlist promotion to
// a confirmed spot awards, the last cancellation SOFT-revokes, rebooking
// reinstates, nothing is written after the seal, seen_at survives the whole
// revoke→rebook round trip, and every read filters revoked_at IS NULL. Strict
// separation from Founding Court is pinned too.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
const {
  isBookedStatus, QUALIFYING_STATUSES, FOUNDING_MEMBER_SESSION_IDS,
  SILICON_OASIS_VENUE_ID, FOUNDING_MEMBER_BADGE, SEAL_TIME, isBeforeSeal,
} = await import('../server/venueAwards');

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
/** Comments stripped — a tripwire on what the CODE touches must not be
 *  satisfied or defeated by prose that merely names a table. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const src = read('server/venueAwards.ts');
const routes = read('server/marketplace-routes.ts');

describe('eligibility — paid AND holding a spot', () => {
  it('counts exactly confirmed + attended', () => {
    expect([...QUALIFYING_STATUSES]).toEqual(['confirmed', 'attended']);
  });

  it('waitlisted, unpaid-pending and holds do NOT qualify', () => {
    for (const s of ['waitlisted', 'pending', 'pending_payment', 'cancelled']) {
      expect(isBookedStatus(s)).toBe(false);
    }
  });

  it('unknown statuses never qualify (fail closed)', () => {
    for (const s of ['', 'CONFIRMED', 'confirmedish', 'attended ']) expect(isBookedStatus(s)).toBe(false);
  });
});

describe('award target is pinned to the launch week', () => {
  it('exactly the three Silicon Oasis sessions, listed explicitly', () => {
    expect(FOUNDING_MEMBER_SESSION_IDS).toHaveLength(3);
    expect([...FOUNDING_MEMBER_SESSION_IDS]).toEqual([
      'b4674701-dc3e-4564-ba67-fd8edc3435f4',
      'a0ed2873-9595-4a43-92fb-d9691201aee2',
      '2d884572-6ba9-4009-91ad-e88bc732722e',
    ]);
    expect(SILICON_OASIS_VENUE_ID).toBe('67feab63-109f-41fc-8252-8645801ca9a2');
    expect(FOUNDING_MEMBER_BADGE).toBe('founding_member');
  });

  it('the session list is hard-coded, never derived from venue+date (a 4th session must not widen the cohort)', () => {
    const loader = src.slice(src.indexOf('async function loadCohort'), src.indexOf('async function countExcluded'));
    expect(loader.includes('session_id = ANY($1)')).toBe(true);
    expect(loader.includes('venue_id')).toBe(false);
    expect(loader.includes('date')).toBe(false);
  });
});

describe('the seal freezes the cohort in both directions', () => {
  it('SEAL_TIME is 2026-07-31 23:59 Asia/Dubai === 19:59Z', () => {
    expect(SEAL_TIME.toISOString()).toBe('2026-07-31T19:59:00.000Z');
  });

  it('isBeforeSeal is true a minute before and false at/after the instant', () => {
    expect(isBeforeSeal(new Date('2026-07-31T19:58:00.000Z'))).toBe(true);
    expect(isBeforeSeal(new Date(SEAL_TIME))).toBe(false);
    expect(isBeforeSeal(new Date('2026-08-01T00:00:00.000Z'))).toBe(false);
  });

  it('NO WRITES AFTER SEAL: every mutating helper returns early on !isBeforeSeal', () => {
    for (const fn of ['awardFoundingMember', 'revokeFoundingMemberIfUnqualified', 'syncFoundingMemberForUser']) {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, start + 400);
      expect(body.includes('if (!isBeforeSeal(now))')).toBe(true);
    }
  });

  it('the backfill pass refuses to execute after the seal', () => {
    expect(src.includes('if (!beforeSeal && opts.execute)')).toBe(true);
    expect(/Cohort sealed at/.test(src)).toBe(true);
  });
});

describe('award / soft revoke / reinstate mechanics', () => {
  it('INSTANT AWARD: insert is idempotent and reports only what it actually wrote', () => {
    expect(src.includes('.onConflictDoNothing()')).toBe(true);
    expect(src.includes('.returning({ userId: venueAwards.userId })')).toBe(true);
  });

  it('SOFT REVOKE: nothing in the module ever deletes an award row', () => {
    const code = stripComments(src);
    expect(code.includes('.delete(venueAwards)')).toBe(false);
    expect(/DELETE\s+FROM\s+venue_awards/i.test(code)).toBe(false);
  });

  it('REVOKE ON LAST CANCEL: fires only at zero qualifying bookings, stamping revoked_at once', () => {
    const start = src.indexOf('export async function revokeFoundingMemberIfUnqualified(');
    const body = src.slice(start, src.indexOf('export async function syncFoundingMemberForUser('));
    expect(body.includes('if ((await countQualifyingBookings(userId)) > 0) return false;')).toBe(true);
    expect(body.includes('.set({ revokedAt: now })')).toBe(true);
    // Idempotent: a second revoke on an already-revoked row writes nothing, so
    // revoked_at keeps the FIRST revocation time.
    expect(body.includes('sql`${venueAwards.revokedAt} IS NULL`')).toBe(true);
  });

  it('REINSTATE ON REBOOK: the award path clears revoked_at when the insert conflicts', () => {
    const body = src.slice(
      src.indexOf('export async function awardFoundingMember('),
      src.indexOf('export async function revokeFoundingMemberIfUnqualified('),
    );
    expect(body.includes('.set({ revokedAt: null })')).toBe(true);
    expect(body.includes('sql`${venueAwards.revokedAt} IS NOT NULL`')).toBe(true);
    expect(body.includes("return 'reinstated'") || body.includes("? 'reinstated'")).toBe(true);
  });

  it('RE-AWARD ON REBOOK: one both-directional helper drives both sides', () => {
    const start = src.indexOf('export async function syncFoundingMemberForUser(');
    const body = src.slice(start, start + 700);
    expect(body.includes('await awardFoundingMember(userId, now)')).toBe(true);
    expect(body.includes('await revokeFoundingMemberIfUnqualified(userId, now)')).toBe(true);
    expect(body.includes("'reinstated'")).toBe(true);
  });

  it('SEEN_AT SURVIVES REVOKE→REBOOK: no award, revoke or reinstate path touches seen_at', () => {
    const lifecycle = stripComments(src.slice(
      src.indexOf('export async function awardFoundingMember('),
      src.indexOf('export interface FoundingMemberView'),
    ));
    expect(lifecycle.includes('seenAt')).toBe(false);
    expect(lifecycle.includes('seen_at')).toBe(false);
    // The only writer stamps it once, only while NULL, and deliberately does
    // NOT filter revoked_at — the dismissal must outlive a revocation.
    const seen = src.slice(src.indexOf('export async function markFoundingMemberSeen('));
    expect(seen.includes('sql`${venueAwards.seenAt} IS NULL`')).toBe(true);
    expect(seen.includes('revokedAt')).toBe(false);
  });

  it('EVERY READ FILTERS revoked_at IS NULL', () => {
    for (const fn of ['getFoundingMemberForUser', 'getFoundingMemberPlayerIds']) {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, start + 800);
      expect(/revoked_at IS NULL/.test(body)).toBe(true);
    }
    // The backfill's holder set counts ACTIVE holders only.
    const pass = src.slice(src.indexOf('export async function awardFoundingMembers('));
    expect(pass.includes('revoked_at IS NULL')).toBe(true);
    // ...and it reinstates soft-revoked rows the bulk insert skips.
    expect(pass.includes('SET revoked_at = NULL')).toBe(true);
  });

  it('array params go through pool.query, never the drizzle sql template (ANY() array trap)', () => {
    expect(src.includes('pool.query(')).toBe(true);
    expect(src.includes('= ANY($2)')).toBe(true);
    expect(src.includes('db.execute')).toBe(false);
  });
});

describe('live hook wiring', () => {
  it('AWARD ON CONFIRMATION: the Ziina payment-success path syncs', () => {
    const wh = read('server/webhookHandler.ts');
    expect(wh.includes('syncFoundingMemberForUser')).toBe(true);
    const confirmIdx = wh.indexOf('await storage.updateBooking(booking.id, { status: "confirmed" });');
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(wh.slice(confirmIdx, confirmIdx + 500).includes('syncFoundingMemberForUser')).toBe(true);
  });

  it('AWARD ON WAITLIST PROMOTION to a confirmed spot', () => {
    expect(routes.includes("syncFoundingMember(booking.userId, 'admin-promote')")).toBe(true);
  });

  it('every other confirm path syncs too (wallet-full, admin cash booking, admin confirm)', () => {
    for (const site of ['wallet-confirm', 'admin-cash-booking', 'admin-confirm']) {
      expect(routes.includes(`syncFoundingMember(`) && routes.includes(`'${site}'`)).toBe(true);
    }
  });

  it('REVOKE fires from the cancel paths that can drop a qualifying booking', () => {
    expect(routes.includes("syncFoundingMember(booking.userId, 'player-cancel')")).toBe(true);
    expect(routes.includes("syncFoundingMember(booking.userId, 'last-guest-slot-cancel')")).toBe(true);
  });

  it('the hook is fire-and-forget: a badge failure can never break a payment or a cancel', () => {
    const helper = routes.slice(routes.indexOf('function syncFoundingMember('), routes.indexOf('async function refundBookingWalletCredit'));
    expect(helper.includes('.catch(')).toBe(true);
    expect(helper.includes('await ')).toBe(false);
  });
});

describe('schema — separate table, composite PK is the idempotency guarantee', () => {
  const schema = read('shared/schema.ts');

  it('venue_awards exists with the composite primary key and nullable seen_at + revoked_at', () => {
    const t = schema.slice(schema.indexOf('export const venueAwards'), schema.indexOf('export type VenueAward'));
    expect(t.includes('pgTable("venue_awards"')).toBe(true);
    expect(t.includes('primaryKey({ columns: [t.userId, t.venueId, t.badgeType] })')).toBe(true);
    expect(t.includes('earnedAt')).toBe(true);
    expect(t.includes('seenAt: timestamp("seen_at")')).toBe(true);
    expect(t.includes('seenAt: timestamp("seen_at").notNull()')).toBe(false);
    expect(t.includes('revokedAt: timestamp("revoked_at")')).toBe(true);
    expect(t.includes('revokedAt: timestamp("revoked_at").notNull()')).toBe(false);
  });

  it('FOUNDING COURT UNTOUCHED: its table still keys on user_id alone, two columns', () => {
    const f = schema.slice(schema.indexOf('export const foundingCourtAwards'), schema.indexOf('export type FoundingCourtAward'));
    expect(f.includes('userId: varchar("user_id").primaryKey()')).toBe(true);
    expect(f.includes('badgeType')).toBe(false);
    expect(f.includes('venueId')).toBe(false);
  });

  it('the awarding module never reads or writes founding_court_awards', () => {
    const code = stripComments(src);
    expect(code.includes('foundingCourtAwards')).toBe(false);
    expect(code.includes('founding_court_awards')).toBe(false);
  });
});

describe('display surfaces leak nothing raw', () => {
  it('the read path returns display strings, never the enum', () => {
    expect(src.includes("FOUNDING_MEMBER_LABEL = \"Founding Member\"")).toBe(true);
    expect(src.includes("FOUNDING_MEMBER_SUBTITLE = \"Silicon Oasis · July 2026\"")).toBe(true);
    const view = src.slice(src.indexOf('export async function getFoundingMemberForUser('));
    expect(view.includes('badge: FOUNDING_MEMBER_LABEL')).toBe(true);
    expect(view.includes('subtitle: FOUNDING_MEMBER_SUBTITLE')).toBe(true);
  });

  it('the award screen is server-gated on seenAt, not client state', () => {
    const award = read('client/src/components/FoundingMemberAward.tsx');
    expect(award.includes('if (!award || award.seenAt) return null;')).toBe(true);
    expect(award.includes('/api/marketplace/badges/founding-member/seen')).toBe(true);
  });

  it('the seal is boolean-driven, so "not a founding member" is unrenderable', () => {
    const seal = read('client/src/components/FoundingMemberSeal.tsx');
    expect(seal.includes('if (!show) return null;')).toBe(true);
    expect(seal.includes("alt=\"Founding Member\"")).toBe(true);
  });

  it('no emoji anywhere in the new UI', () => {
    const files = [
      'client/src/components/FoundingMemberAward.tsx',
      'client/src/components/FoundingMemberSeal.tsx',
    ];
    for (const f of files) {
      expect(/\p{Extended_Pictographic}/u.test(read(f))).toBe(false);
    }
  });
});

describe('operator scripts default to preview', () => {
  it('migration is dry-run unless --execute, creates the table idempotently, and adds seen_at + revoked_at', () => {
    const m = read('scripts/migrate-venue-awards.mjs');
    expect(m.includes("const EXECUTE = process.argv.includes('--execute')")).toBe(true);
    expect(m.includes('CREATE TABLE IF NOT EXISTS venue_awards')).toBe(true);
    expect(m.includes('seen_at    timestamp NULL')).toBe(true);
    expect(m.includes('revoked_at timestamp NULL')).toBe(true);
    expect(m.includes('ADD COLUMN IF NOT EXISTS seen_at')).toBe(true);
    expect(m.includes('ADD COLUMN IF NOT EXISTS revoked_at')).toBe(true);
    expect(m.includes('DRY RUN — nothing written')).toBe(true);
  });

  it('backfill script is dry-run unless --execute and surfaces every excluded cohort', () => {
    const a = read('scripts/award-founding-members.mts');
    expect(a.includes("const EXECUTE = process.argv.includes('--execute')")).toBe(true);
    expect(a.includes('awardFoundingMembers({ execute: EXECUTE })')).toBe(true);
    expect(a.includes('EXCLUDED by the current policy')).toBe(true);
    expect(a.includes('hold (pending_payment) only')).toBe(true);
    expect(a.includes('DRY RUN — nothing written')).toBe(true);
  });
});
