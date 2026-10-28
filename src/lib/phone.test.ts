import { describe, expect, it } from 'vitest';
import {
  digitCount,
  normalizeInternationalPrefix,
  normalizeToE164,
  stripExtension,
  tryNormalizeToE164,
} from './phone';

describe('normalizeToE164', () => {
  it('keeps already-E.164 numbers', () => {
    expect(normalizeToE164('+12125551234')).toBe('+12125551234');
  });

  it('adds +1 for 10-digit NANP', () => {
    expect(normalizeToE164('(212) 555-1234')).toBe('+12125551234');
  });

  it('handles 11-digit leading 1', () => {
    expect(normalizeToE164('12125551234')).toBe('+12125551234');
  });

  it('converts 00 international prefix without making +001…', () => {
    expect(normalizeInternationalPrefix('0012125551234')).toBe('+12125551234');
    expect(normalizeToE164('0012125551234')).toBe('+12125551234');
    expect(normalizeToE164('0012125551234')).not.toMatch(/^\+001/);
    // Classic QC fixture: 001555… must not become +001555…
    expect(normalizeInternationalPrefix('0015551234567')).toBe('+15551234567');
    expect(normalizeToE164('0015551234567')).toBe('+15551234567');
    expect(normalizeToE164('0015551234567')).not.toBe('+0015551234567');
  });

  it('strips extensions instead of appending them', () => {
    expect(stripExtension('+12125551234x123')).toBe('+12125551234');
    expect(stripExtension('212-555-1234 ext. 99')).toBe('212-555-1234');
    expect(normalizeToE164('+1 212 555 1234;ext=88')).toBe('+12125551234');
  });

  it('rejects 7-digit numbers like 555-1234', () => {
    expect(tryNormalizeToE164('555-1234')).toBeNull();
    expect(() => normalizeToE164('5551234')).toThrow(/Invalid phone/);
  });

  it('tryNormalize returns null on empty / non-numeric', () => {
    expect(tryNormalizeToE164('')).toBeNull();
    expect(tryNormalizeToE164('not-a-phone')).toBeNull();
    expect(tryNormalizeToE164('Customer')).toBeNull();
  });

  it('digitCount ignores punctuation', () => {
    expect(digitCount('(212) 555-1234')).toBe(10);
  });
});
