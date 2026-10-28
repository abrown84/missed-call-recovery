import { describe, expect, it } from 'vitest';
import { normalizeToE164, tryNormalizeToE164 } from './phone';

describe('normalizeToE164', () => {
  it('keeps already-E.164 numbers', () => {
    expect(normalizeToE164('+15551234567')).toBe('+15551234567');
  });

  it('adds +1 for 10-digit NANP', () => {
    expect(normalizeToE164('(555) 123-4567')).toBe('+15551234567');
  });

  it('handles 11-digit leading 1', () => {
    expect(normalizeToE164('15551234567')).toBe('+15551234567');
  });

  it('tryNormalize returns null on empty', () => {
    expect(tryNormalizeToE164('')).toBeNull();
  });
});
