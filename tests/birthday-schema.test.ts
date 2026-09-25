// Birthday free game — the schema half (decision 1: two columns + the database rule). The one-shot migration's DDL must
// mirror the Drizzle schema exactly, and it runs --dry-run / --rehearse / execute BEFORE the deploy.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getTableConfig } from 'drizzle-orm/pg-core';

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/dummy';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = 'scripts/one-shot/2026-09-25-birthday-restore-v1.mts';
const { marketplaceUsers, bookings } = await import('../shared/schema');

describe('Drizzle schema', () => {
  it('marketplace_users.birthday_discount_booking_id — nullable varchar: which booking consumed this year\'s free game', () => {
    const col = getTableConfig(marketplaceUsers).columns.find((c) => c.name === 'birthday_discount_booking_id');
    expect(col, 'column').toBeTruthy();
    expect(col!.getSQLType()).toBe('varchar');
    expect(col!.notNull).toBe(false);
  });
  it('bookings.birthday_window_key — nullable text: the anchor birthday of the window a free booking belongs to', () => {
    const col = getTableConfig(bookings).columns.find((c) => c.name === 'birthday_window_key');
    expect(col, 'column').toBeTruthy();
    expect(col!.getSQLType()).toBe('text');
    expect(col!.notNull).toBe(false);
  });
  it('the database rule: one live free booking per (user, window key) — partial unique index', () => {
    const idx = getTableConfig(bookings).indexes.find((i) => i.config.name === 'uq_bookings_one_live_birthday');
    expect(idx, 'index').toBeTruthy();
    expect(idx!.config.unique).toBe(true);
    expect(idx!.config.columns.map((c: any) => c.name)).toEqual(['user_id', 'birthday_window_key']);
    expect(idx!.config.where).toBeTruthy();
  });
});

describe(`one-shot migration ${MIGRATION}`, () => {
  it('exists, registers as birthday_restore_v1, and has the three modes', () => {
    expect(existsSync(join(__dirname, '..', MIGRATION))).toBe(true);
    const src = read(MIGRATION);
    expect(src).toContain("const KEY = 'birthday_restore_v1'");
    expect(src).toContain("process.argv.includes('--dry-run')");
    expect(src).toContain("process.argv.includes('--rehearse')");
    expect(src).toContain('ROLLBACK');
  });
  it('the DDL mirrors the Drizzle schema exactly (additive only)', () => {
    const src = read(MIGRATION);
    expect(src).toContain('ALTER TABLE "marketplace_users" ADD COLUMN "birthday_discount_booking_id" varchar');
    expect(src).toContain('ALTER TABLE "bookings" ADD COLUMN "birthday_window_key" text');
    expect(src).toContain(`CREATE UNIQUE INDEX "uq_bookings_one_live_birthday" ON "bookings" ("user_id", "birthday_window_key") WHERE "birthday_discount_applied" AND "status" <> 'cancelled'`);
    expect(src).not.toMatch(/DROP\s|ALTER COLUMN|DELETE FROM/i);
  });
  it('backfills the window key of existing free bookings and links each marker to the booking that set it, with a duplicate pre-check', () => {
    const src = read(MIGRATION);
    expect(src).toMatch(/UPDATE "bookings" SET "birthday_window_key"/);
    expect(src).toMatch(/UPDATE "marketplace_users" SET "birthday_discount_booking_id"/);
    expect(src).toMatch(/duplicate live window keys/i);
  });
});
