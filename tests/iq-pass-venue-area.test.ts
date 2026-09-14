// IQ Pass Gate 11 — venues.area: the additive one-shot, the Drizzle mirror, the calendar rows
// and /bookings/mine carry the venue's area, and the shared four-colour venue map.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getTableColumns } from 'drizzle-orm';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const { venues } = await import('../shared/schema');
const { IQP, IQP_VENUE_PALETTE } = await import('../client/src/lib/iqPassTokens');
const { venueColour, VENUE_COLOUR_MAP } = await import('../client/src/lib/venueColours');

describe('venues.area — one-shot + Drizzle mirror', () => {
  it('the one-shot is additive, registers itself, and lists unknown venues instead of guessing', () => {
    const p = 'scripts/one-shot/2026-09-14-venues-area-v1.mts';
    expect(existsSync(join(__dirname, '..', p))).toBe(true);
    const src = read(p);
    expect(src).toMatch(/const KEY = 'venues_area_v1'/);
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS "area" text/);
    expect(src).toMatch(/UNKNOWN \(/);
    expect(src).not.toMatch(/DROP |ALTER COLUMN|DELETE FROM/);
  });
  it('the Drizzle venues table mirrors the new nullable column', () => {
    expect(Object.keys(getTableColumns(venues))).toContain('area');
    expect((getTableColumns(venues) as any).area.notNull).toBe(false);
  });
});

describe('venueArea on the payloads', () => {
  it('calendar rows join venues.area by venue name (sessions carry the name, not an id)', () => {
    const store = read('server/iqPass/store.ts');
    expect(store).toMatch(/venueArea: sql<string \| null>`\(SELECT v\.area FROM venues v WHERE v\.name = \$\{bookableSessions\.venueName\} LIMIT 1\)`/);
    expect(store).toMatch(/venueArea: string \| null;/);
  });
  it('/bookings/mine attaches venueArea through one storage read', () => {
    const routes = read('server/marketplace-routes.ts');
    expect(routes).toMatch(/const venueAreas = await storage\.getVenueAreasByNames\(merged\.map\(b => b\.session\.venueName\)\);/);
    expect(routes).toMatch(/venueArea: venueAreas\[b\.session\.venueName\] \?\? null,/);
    const storage = read('server/storage.ts');
    expect(storage).toMatch(/async getVenueAreasByNames\(names: string\[\]\): Promise<Record<string, string \| null>>/);
    expect(read('shared/schema.ts')).toMatch(/venueArea\?: string \| null;/);
  });
});

describe('shared venue-colour map', () => {
  it('exactly four colours: brand navy, brand teal and their two muted derivatives', () => {
    expect(IQP_VENUE_PALETTE).toEqual([IQP.navy, IQP.teal, IQP.navyMuted, IQP.tealMuted]);
    expect(IQP.navy).toBe('#003E8C'); expect(IQP.teal).toBe('#006B5F');
    expect(IQP.navyMuted).toMatch(/^#[0-9A-F]{6}$/); expect(IQP.tealMuted).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('the venues hosting sessions are pinned by name and every venue resolves to one of the four', () => {
    expect(VENUE_COLOUR_MAP['Smash Sports Academy']).toBe(IQP.navy);
    expect(VENUE_COLOUR_MAP['Bright Riders School Dubai']).toBe(IQP.teal);
    expect(VENUE_COLOUR_MAP['BASELINE SPORTS ACADEMY DIP']).toBe(IQP.navyMuted);
    expect(VENUE_COLOUR_MAP['Fire Rallies Sports Academy LLC']).toBe(IQP.tealMuted);
    for (const v of ['Smash Sports Academy', 'Bright Riders School Dubai', 'A Brand New Venue', 'Another One']) expect(IQP_VENUE_PALETTE).toContain(venueColour(v));
    expect(venueColour('A Brand New Venue')).toBe(venueColour(' A Brand New  Venue ')); // whitespace-stable
  });
  it('the map is the only client file that reads the palette', () => {
    const { execSync } = require('child_process');
    const out = execSync('grep -rl "IQP_VENUE_PALETTE" client/src --include=*.ts --include=*.tsx', { cwd: join(__dirname, '..'), encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).map((p: string) => p.replace(/\\/g, '/'));
    expect(out.sort()).toEqual(['client/src/lib/iqPassTokens.ts', 'client/src/lib/venueColours.ts']);
  });
});
