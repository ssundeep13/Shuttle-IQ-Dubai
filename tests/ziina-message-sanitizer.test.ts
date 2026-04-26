import { describe, it, expect } from 'vitest';
import { sanitizeZiinaMessage } from '../server/ziinaClient';

const CAP = 50;

describe('sanitizeZiinaMessage', () => {
  it('passes through normal short input unchanged', () => {
    expect(sanitizeZiinaMessage('ShuttleIQ — Drop In')).toBe('ShuttleIQ — Drop In');
  });

  it('truncates long input under the cap and appends ellipsis', () => {
    const longTitle = 'A'.repeat(300);
    const out = sanitizeZiinaMessage(`Booking for ${longTitle} (2 spots)`);
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('Booking for ')).toBe(true);
  });

  it('clamps the actual production string that triggered MESSAGE_LENGTH_INVALID', () => {
    // Real prod failure case: 84-char message Ziina rejected
    const real = 'Booking for ISM Sports Services at Greenfield International School Session (2 spots)';
    const out = sanitizeZiinaMessage(real);
    expect(out.length).toBeLessThanOrEqual(CAP);
    expect(out.endsWith('…')).toBe(true);
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
    expect(out.endsWith('…')).toBe(false);
  });
});
