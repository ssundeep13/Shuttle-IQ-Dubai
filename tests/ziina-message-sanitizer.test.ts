import { describe, it, expect } from 'vitest';
import { sanitizeZiinaMessage, buildZiinaBookingMessage } from '../server/ziinaClient';

const CAP = 50;

describe('sanitizeZiinaMessage', () => {
  it('passes through normal short input unchanged', () => {
    expect(sanitizeZiinaMessage('ShuttleIQ - Drop In')).toBe('ShuttleIQ - Drop In');
  });

  it('truncates long input under the cap and appends an ASCII ellipsis', () => {
    const longTitle = 'A'.repeat(300);
    const out = sanitizeZiinaMessage(`Booking for ${longTitle} (2 spots)`);
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out.endsWith('...')).toBe(true);
    expect(out.startsWith('Booking for ')).toBe(true);
  });

  it('clamps the actual production string that triggered MESSAGE_LENGTH_INVALID', () => {
    // Real prod failure case: 84-char message Ziina rejected
    const real = 'Booking for ISM Sports Services at Greenfield International School Session (2 spots)';
    const out = sanitizeZiinaMessage(real);
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out.endsWith('...')).toBe(true);
    expect(out.startsWith('Booking for ISM')).toBe(true);
  });

  it('collapses newlines, tabs and repeated spaces into single spaces', () => {
    expect(sanitizeZiinaMessage('Booking\nfor\t  Drop  In')).toBe('Booking for Drop In');
  });

  it('strips ASCII control characters', () => {
    expect(sanitizeZiinaMessage('Booking\x00for\x07Drop')).toBe('Booking for Drop');
  });

  it('falls back to a safe default when input is empty, whitespace, null, or undefined', () => {
    expect(sanitizeZiinaMessage('')).toBe('ShuttleIQ booking');
    expect(sanitizeZiinaMessage('   \n\t  ')).toBe('ShuttleIQ booking');
    expect(sanitizeZiinaMessage(null)).toBe('ShuttleIQ booking');
    expect(sanitizeZiinaMessage(undefined)).toBe('ShuttleIQ booking');
  });

  it('handles input exactly at the cap without truncating', () => {
    const exact = 'X'.repeat(CAP);
    const out = sanitizeZiinaMessage(exact);
    expect(out).toBe(exact);
    expect(out.endsWith('...')).toBe(false);
  });

  it('produces output whose UTF-8 byte length stays within the cap', () => {
    const longTitle = 'Ω'.repeat(300);
    const out = sanitizeZiinaMessage(`Booking for ${longTitle}`);
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(CAP);
  });
});

describe('buildZiinaBookingMessage', () => {
  it('uses the brand-first form when the title fits under the cap', () => {
    expect(buildZiinaBookingMessage({ title: 'Drop In' })).toBe('ShuttleIQ - Drop In');
  });

  it('appends the xN count suffix when more than one spot is booked', () => {
    expect(buildZiinaBookingMessage({ title: 'Drop In', spots: 3 })).toBe('ShuttleIQ - Drop In x3');
  });

  it('omits the count suffix for a single spot', () => {
    expect(buildZiinaBookingMessage({ title: 'Drop In', spots: 1 })).toBe('ShuttleIQ - Drop In');
  });

  it('downgrades to a length-safe brand-only form when the title would exceed the cap', () => {
    // Real prod failure title that previously broke Ziina
    const longTitle = 'ISM Sports Services at Greenfield International School Session';
    const out = buildZiinaBookingMessage({ title: longTitle, spots: 2 });
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out).toBe('ShuttleIQ booking x2');
  });

  it('uses the extra-spot variant prefix when extraSpot is true', () => {
    expect(buildZiinaBookingMessage({ title: 'Drop In', extraSpot: true })).toBe(
      'ShuttleIQ extra spot - Drop In',
    );
  });

  it('downgrades the extra-spot variant to a brand-only form for long titles', () => {
    const longTitle = 'ISM Sports Services at Greenfield International School Session';
    const out = buildZiinaBookingMessage({ title: longTitle, extraSpot: true });
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out).toBe('ShuttleIQ extra spot');
  });

  it('falls back to a brand-only form when the title is empty/null/undefined', () => {
    expect(buildZiinaBookingMessage({ title: '', spots: 2 })).toBe('ShuttleIQ booking x2');
    expect(buildZiinaBookingMessage({ title: null })).toBe('ShuttleIQ booking');
    expect(buildZiinaBookingMessage({ title: undefined, extraSpot: true })).toBe(
      'ShuttleIQ extra spot',
    );
  });

  it('downgrades when a short title would exceed the byte cap (non-ASCII)', () => {
    // 40 Ω chars = 40 × 2 = 80 UTF-8 bytes. Brand-first form would be
    // "ShuttleIQ - {ΩΩΩ...} x2" — under 50 chars but well over 50 bytes.
    const out = buildZiinaBookingMessage({ title: 'Ω'.repeat(40), spots: 2 });
    expect(out).toBe('ShuttleIQ booking x2');
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(CAP);
  });

  it('always returns ASCII-only output within the cap (chars and bytes)', () => {
    const cases = [
      { title: 'A'.repeat(500), spots: 2 },
      { title: 'A'.repeat(500), extraSpot: true },
      { title: 'B'.repeat(48) },
      { title: 'C'.repeat(49), spots: 99 },
      { title: 'Ω'.repeat(40), spots: 2 },
    ];
    for (const c of cases) {
      const out = buildZiinaBookingMessage(c);
      expect(out.length).toBeLessThanOrEqual(CAP);
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(CAP);
      // ASCII-only when title fits short forms; downgrades drop non-ASCII title
      // entirely so output is always ASCII.
      expect(/^[\x20-\x7e]*$/.test(out)).toBe(true);
    }
  });
});
