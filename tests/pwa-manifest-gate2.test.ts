/**
 * PWA metadata — Gate 2. The manifest carried a pre-brand navy (#0d2b45),
 * admin-era copy, no id/scope, and a rounded/transparent icon declared as
 * maskable. sw.js precaches the manifest + icons BY NAME and serves them
 * cache-first, so any change here is invisible to an installed client until
 * the cache name changes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const NAVY = '#002C84';

describe('manifest.webmanifest', () => {
  const m = JSON.parse(read('client/public/manifest.webmanifest'));

  it('splash + chrome use the navyBtn token', () => {
    expect(m.theme_color).toBe(NAVY);
    expect(m.background_color).toBe(NAVY);
  });

  it('identity, copy, id and scope', () => {
    expect(m.name).toBe('ShuttleIQ');
    expect(m.short_name).toBe('ShuttleIQ');
    expect(m.description).toBe('Book skill-matched badminton sessions in Dubai. Captain-verified scores and live rankings.');
    expect(m.id).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('icons: 192 + 512 as "any", plus a dedicated full-bleed 512 "maskable"', () => {
    const bySrc = Object.fromEntries(m.icons.map((i: { src: string }) => [i.src, i]));
    expect(bySrc['/icons/icon-192x192.png']).toMatchObject({ sizes: '192x192', type: 'image/png', purpose: 'any' });
    expect(bySrc['/icons/icon-512x512.png']).toMatchObject({ sizes: '512x512', type: 'image/png', purpose: 'any' });
    expect(bySrc['/icons/icon-512-maskable.png']).toMatchObject({ sizes: '512x512', type: 'image/png', purpose: 'maskable' });
    // no icon claims both purposes on one file any more
    for (const i of m.icons) expect(i.purpose).not.toMatch(/\s/);
    expect(existsSync(join(root, 'client/public/icons/icon-512-maskable.png'))).toBe(true);
  });
});

describe('index.html + icons + service worker', () => {
  it('<meta name="theme-color"> matches the manifest navy', () => {
    expect(read('client/index.html')).toMatch(new RegExp(`<meta name="theme-color" content="${NAVY}" />`));
  });

  it('the unreferenced icons/apple-touch-icon.png is gone; the root one stays', () => {
    expect(existsSync(join(root, 'client/public/icons/apple-touch-icon.png'))).toBe(false);
    expect(existsSync(join(root, 'client/public/apple-touch-icon.png'))).toBe(true);
    expect(read('client/index.html')).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  });

  it('sw cache name bumped past v4 (manifest + icons are precached by name, cache-first)', () => {
    const sw = read('client/public/sw.js');
    expect(sw).toMatch(/const CACHE_NAME = 'shuttleiq-v5';/);
    expect(sw).toContain("'/manifest.webmanifest'"); // still precached — hence the bump
  });
});
