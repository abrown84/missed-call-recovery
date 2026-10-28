// @ts-nocheck
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatPhone, formatRelativeTime } from './utils';

describe('formatPhone', () => {
  it('formats 10-digit numbers', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
  });

  it('formats 11-digit numbers starting with 1', () => {
    expect(formatPhone('15551234567')).toBe('+1 (555) 123-4567');
  });

  it('returns original when unrecognized', () => {
    expect(formatPhone('+44 7700 900123')).toBe('+44 7700 900123');
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns relative labels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    expect(formatRelativeTime(new Date('2026-01-15T11:59:30Z'))).toBe('Just now');
    expect(formatRelativeTime(new Date('2026-01-15T11:45:00Z'))).toBe('15m ago');
    expect(formatRelativeTime(new Date('2026-01-15T09:00:00Z'))).toBe('3h ago');
    expect(formatRelativeTime(new Date('2026-01-13T12:00:00Z'))).toBe('2d ago');
  });
});
