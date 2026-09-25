// Birthday free game — the database guarantees, on REAL Postgres (the throwaway local cluster with the
// birthday_restore_v1 migration applied). Skipped unless BIRTHDAY_PG_URL is set; it refuses any database but
// 127.0.0.1:5499/siq_local. Proves the unique rule, the conditional clear, the amendment and the cancel/rebook race
// through the real storage helpers.
//   BIRTHDAY_PG_URL=postgres://postgres@127.0.0.1:5499/siq_local npx vitest run tests/birthday-restore-db.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';

const URL = process.env.BIRTHDAY_PG_URL;
const KEY = '2026-09-24';

describe.skipIf(!URL)('birthday restore — real Postgres', () => {
  let storage: any, pool: any, db: any, isBirthdayConflict: (e: unknown) => boolean;
  const userId = randomUUID();
  const sessions = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const q = (s: string, p: unknown[] = []) => pool.query(s, p);
  const flagged = (sessionId: string, over: Record<string, unknown> = {}) => storage.createBooking({
    userId, sessionId, status: 'confirmed', paymentMethod: 'ziina', amountAed: 0, spotsBooked: 1,
    birthdayDiscountApplied: true, birthdayWindowKey: KEY, ...over,
  });
  const liveFree = async () => (await q(`select count(*)::int n from bookings where user_id = $1 and birthday_discount_applied and birthday_window_key = $2 and status <> 'cancelled'`, [userId, KEY])).rows[0].n;

  beforeAll(async () => {
    if (!/@127\.0\.0\.1:5499\/siq_local$/.test(URL!)) throw new Error('refusing: BIRTHDAY_PG_URL is not the throwaway local cluster');
    process.env.DATABASE_URL = URL;
    ({ storage } = await import('../server/storage'));
    ({ pool, db } = await import('../server/db'));
    ({ isBirthdayConflict } = await import('../server/birthdayRestore'));
    await q(`insert into marketplace_users (id, email, name, role, birth_day, birth_month) values ($1, $2, 'Local Birthday Test', 'player', 24, 9)`, [userId, `bday-${userId}@example.invalid`]);
    for (const id of sessions) await q(`insert into bookable_sessions (id, title, venue_name, date, start_time, end_time) values ($1, 'Local test', 'Local venue', '2026-09-26', '20:00', '22:00')`, [id]);
  });
  afterAll(async () => {
    if (!pool) return;
    await q(`delete from bookings where user_id = $1`, [userId]);
    await q(`delete from bookable_sessions where id = any($1)`, [sessions]);
    await q(`delete from marketplace_users where id = $1`, [userId]);
    await pool.end();
  });

  it('two free bookings for the same window at the same instant → exactly one is created; the loser is the birthday conflict', async () => {
    const r = await Promise.allSettled([flagged(sessions[0]), flagged(sessions[1])]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const lost = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(isBirthdayConflict(lost.reason)).toBe(true);
    expect(await liveFree()).toBe(1);
  });

  it('the marker is set and cleared only by the booking that consumed it', async () => {
    const [bk] = (await q(`select id from bookings where user_id = $1 and birthday_window_key = $2 and status <> 'cancelled'`, [userId, KEY])).rows;
    await storage.setBirthdayMarker(userId, bk.id, new Date('2026-09-25T08:00:00Z'));
    expect(await storage.clearBirthdayMarker(userId, randomUUID())).toBe(false);
    const u1 = (await q(`select birthday_discount_used_at is not null used, birthday_discount_booking_id bk from marketplace_users where id = $1`, [userId])).rows[0];
    expect(u1).toEqual({ used: true, bk: bk.id });
    expect(await storage.clearBirthdayMarker(userId, bk.id)).toBe(true);
    const u2 = (await q(`select birthday_discount_used_at, birthday_discount_booking_id from marketplace_users where id = $1`, [userId])).rows[0];
    expect(u2).toEqual({ birthday_discount_used_at: null, birthday_discount_booking_id: null });
  });

  it('(amendment) the key released on a still-live booking → a new free booking in the same window succeeds (no conflict)', async () => {
    const [bk] = (await q(`select id from bookings where user_id = $1 and birthday_window_key = $2 and status <> 'cancelled'`, [userId, KEY])).rows;
    expect(await storage.hasLiveBirthdayBooking(userId, KEY)).toBe(true);
    await storage.releaseBirthdayWindowKey(bk.id);
    expect(await storage.hasLiveBirthdayBooking(userId, KEY)).toBe(false);
    const again = await flagged(sessions[2]);
    expect(again.birthdayWindowKey).toBe(KEY);
    const old = (await q(`select status, birthday_discount_applied, birthday_window_key from bookings where id = $1`, [bk.id])).rows[0];
    expect(old).toEqual({ status: 'confirmed', birthday_discount_applied: true, birthday_window_key: null });
  });

  it('cancel + clear and a rebook fired together, 20 times → never two live free bookings in the window', async () => {
    for (let i = 0; i < 20; i++) {
      await q(`update bookings set status = 'cancelled' where user_id = $1`, [userId]);
      const bk = await flagged(sessions[i % 2]);
      await storage.setBirthdayMarker(userId, bk.id, new Date());
      const cancel = db.transaction(async (tx: any) => {
        await tx.execute(sql`update bookings set status = 'cancelled', cancelled_at = now() where id = ${bk.id}`);
        await storage.clearBirthdayMarker(userId, bk.id, tx);
      });
      const rebook = flagged(sessions[2 + (i % 2)]).catch((e: unknown) => { if (!isBirthdayConflict(e)) throw e; return null; });
      await Promise.all([cancel, rebook]);
      expect(await liveFree()).toBeLessThanOrEqual(1);
    }
  });
});
