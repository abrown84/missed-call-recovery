// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  areaCodeFromE164,
  deferUntilQuietHoursOpen,
  isValidTimeZone,
  localParts,
  resolveLeadTimezone,
  resolveLeadTimezones,
} from './quiet-hours';

describe('quiet-hours mutation killers', () => {
  it('isValidTimeZone caches false (second call still false)', () => {
    const bad = 'Definitely/Not_A_Real_Zone_XYZ';
    expect(isValidTimeZone(bad)).toBe(false);
    // BooleanLiteral true on cache-set would make the second call return true
    expect(isValidTimeZone(bad)).toBe(false);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  it('areaCodeFromE164 requires leading 1 for 11-digit NANP', () => {
    expect(areaCodeFromE164('+12125550100')).toBe('212');
    expect(areaCodeFromE164('2125550100')).toBe('212');
    // 11 digits NOT starting with 1 → null (startsWith('') mutant would slice)
    expect(areaCodeFromE164('99955501001')).toBeNull();
    expect(areaCodeFromE164('01155501001')).toBeNull();
  });

  it('leadTimezone trim is required', () => {
    const padded = resolveLeadTimezones({
      leadTimezone: '  America/Denver  ',
      callerPhoneE164: '+12125550100',
    });
    expect(padded).toEqual({
      zones: ['America/Denver'],
      ambiguous: false,
      known: true,
      endHour: 21,
    });
    // Without trim, padded IANA fails validation and falls through to area code
    const untrimmedWouldFail = isValidTimeZone('  America/Denver  ');
    expect(untrimmedWouldFail).toBe(false);
  });

  it('single-zone mapped area is known non-ambiguous', () => {
    const r = resolveLeadTimezones({ callerPhoneE164: '+12125550100' });
    expect(r).toEqual({
      zones: ['America/New_York'],
      ambiguous: false,
      known: true,
      endHour: 21,
    });
  });

  it('localParts throws exact message on invalid TZ', () => {
    expect(() => localParts(new Date(), 'Not/AZone')).toThrow(
      'Invalid time zone: Not/AZone'
    );
    expect(() => localParts(new Date(), 'America/New_York')).not.toThrow();
  });

  it('deprecated resolveLeadTimezone defaults to America/New_York when unresolved', () => {
    expect(
      resolveLeadTimezone({ businessTimezone: 'America/Chicago' })
    ).toBe('America/New_York');
    expect(
      resolveLeadTimezone({ callerPhoneE164: '+19995550100' })
    ).toBe('America/New_York');
  });

  it('unresolved defer decision has exact reason no_valid_timezone', () => {
    const d = deferUntilQuietHoursOpen(new Date('2026-07-01T16:00:00.000Z'), {
      callerPhoneE164: '+19995550100',
    });
    expect(d).toEqual({
      allowed: false,
      unresolved: true,
      reason: 'no_valid_timezone',
      zones: [],
    });
  });
});
