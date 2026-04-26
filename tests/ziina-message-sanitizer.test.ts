import { describe, it, expect } from 'vitest';
import { sanitizeZiinaMessage } from '../server/ziinaClient';

describe('sanitizeZiinaMessage', () => {
  it('passes through normal short input unchanged', () => {
    expect(sanitizeZiinaMessage('Booking for Drop In Session')).toBe('Booking for Drop In Session');
  });

  it('truncates long input under 150 chars and appends ellipsis', () => {
    const longTitle = 'A'.repeat(300);
    const out = sanitizeZiinaMessage(`Booking for ${longTitle} (2 spots)`);
    expect(out.length).toBeLessThanOrEqual(150);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('Booking for ')).toBe(true);
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
    const exact = 'X'.repeat(150);
    const out = sanitizeZiinaMessage(exact);
    expect(out).toBe(exact);
    expect(out.endsWith('…')).toBe(false);
  });
});
