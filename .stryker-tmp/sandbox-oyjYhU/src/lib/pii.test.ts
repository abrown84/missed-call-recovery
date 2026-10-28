// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { redactPhone, redactId } from './pii';

describe('redactPhone', () => {
  it('masks US numbers keeping last 4 digits', () => {
    expect(redactPhone('+15551234567')).toBe('***-***-4567');
    expect(redactPhone('(555) 123-4567')).toBe('***-***-4567');
  });

  it('handles missing / short input', () => {
    expect(redactPhone(null)).toBe('[no-phone]');
    expect(redactPhone('')).toBe('[no-phone]');
    expect(redactPhone('12')).toBe('***');
  });
});

describe('redactId', () => {
  it('keeps first 8 characters of a uuid', () => {
    expect(redactId('abcdef12-3456-7890-abcd-ef1234567890')).toBe('abcdef12…');
  });

  it('handles missing ids', () => {
    expect(redactId(undefined)).toBe('[no-id]');
    expect(redactId('short')).toBe('********');
  });
});
