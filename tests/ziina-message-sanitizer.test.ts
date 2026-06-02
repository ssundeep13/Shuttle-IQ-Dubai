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
  it('formats as {name} - {ordinal day} {short month}', () => {
    expect(buildZiinaBookingMessage({ playerName: 'Ali', sessionDate: '2026-05-30' }))
      .toBe('Ali - 30th May');
  });

  it('formats dates with ordinal suffixes correctly', () => {
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-01' }))
      .toBe('Sara - 1st Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-02' }))
      .toBe('Sara - 2nd Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-03' }))
      .toBe('Sara - 3rd Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-21' }))
      .toBe('Sara - 21st Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-22' }))
      .toBe('Sara - 22nd Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: '2026-06-23' }))
      .toBe('Sara - 23rd Jun');
  });

  it('uses "th" for 11th, 12th, 13th (no "st"/"nd"/"rd" exception)', () => {
    expect(buildZiinaBookingMessage({ playerName: 'Alex', sessionDate: '2026-07-11' }))
      .toBe('Alex - 11th Jul');
    expect(buildZiinaBookingMessage({ playerName: 'Alex', sessionDate: '2026-07-12' }))
      .toBe('Alex - 12th Jul');
    expect(buildZiinaBookingMessage({ playerName: 'Alex', sessionDate: '2026-07-13' }))
      .toBe('Alex - 13th Jul');
  });

  it('falls back to "ShuttleIQ booking" when playerName is missing', () => {
    expect(buildZiinaBookingMessage({ sessionDate: '2026-05-30' }))
      .toBe('ShuttleIQ booking');
    expect(buildZiinaBookingMessage({ playerName: '', sessionDate: '2026-05-30' }))
      .toBe('ShuttleIQ booking');
    expect(buildZiinaBookingMessage({ playerName: null, sessionDate: '2026-05-30' }))
      .toBe('ShuttleIQ booking');
  });

  it('falls back to "ShuttleIQ booking" when sessionDate is missing or invalid', () => {
    expect(buildZiinaBookingMessage({ playerName: 'Ali' }))
      .toBe('ShuttleIQ booking');
    expect(buildZiinaBookingMessage({ playerName: 'Ali', sessionDate: null }))
      .toBe('ShuttleIQ booking');
    expect(buildZiinaBookingMessage({ playerName: 'Ali', sessionDate: 'not-a-date' }))
      .toBe('ShuttleIQ booking');
  });

  it('falls back when both are missing', () => {
    expect(buildZiinaBookingMessage({})).toBe('ShuttleIQ booking');
  });

  it('uses the first name when the full name would exceed the cap', () => {
    const out = buildZiinaBookingMessage({
      playerName: 'Mohammed Abdulrahman Al-Farsi Junior Senior',
      sessionDate: '2026-05-30',
    });
    expect(out).toBe('Mohammed - 30th May');
    expect(out.length).toBeLessThanOrEqual(CAP);
  });

  it('falls back to "ShuttleIQ booking" when even the first name exceeds the cap', () => {
    const longName = 'A'.repeat(60);
    const out = buildZiinaBookingMessage({ playerName: longName, sessionDate: '2026-05-30' });
    expect(out).toBe('ShuttleIQ booking');
    expect(out.length).toBeLessThanOrEqual(CAP);
  });

  it('accepts a Date object for sessionDate and formats it correctly', () => {
    expect(buildZiinaBookingMessage({ playerName: 'Ali', sessionDate: new Date(2026, 4, 30) }))
      .toBe('Ali - 30th May');
    expect(buildZiinaBookingMessage({ playerName: 'Sara', sessionDate: new Date(2026, 5, 1) }))
      .toBe('Sara - 1st Jun');
    expect(buildZiinaBookingMessage({ playerName: 'Alex', sessionDate: new Date(2026, 6, 11) }))
      .toBe('Alex - 11th Jul');
  });

  it('always returns ASCII-only output within the cap', () => {
    const cases = [
      { playerName: 'Ali', sessionDate: '2026-05-30' },
      { playerName: 'Sara', sessionDate: '2026-12-31' },
      { playerName: 'A'.repeat(60), sessionDate: '2026-05-30' },
      { playerName: 'Ali' },
      {},
    ];
    for (const c of cases) {
      const out = buildZiinaBookingMessage(c);
      expect(out.length).toBeLessThanOrEqual(CAP);
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(CAP);
      expect(/^[\x20-\x7e]*$/.test(out)).toBe(true);
    }
  });
});
