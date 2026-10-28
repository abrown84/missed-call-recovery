import { describe, expect, it } from 'vitest';
import {
  QUIET_END_HOUR_DEFAULT,
  QUIET_END_HOUR_FL_OK,
  QUIET_START_HOUR,
  deferUntilQuietHoursOpen,
  isWithinQuietHoursWindow,
  localParts,
  nextLocalHour,
  quietEndHourForPhone,
  resolveLeadTimezone,
} from './quiet-hours';

describe('quiet hours timezone resolution', () => {
  it('prefers lead timezone, then area code, then business', () => {
    expect(
      resolveLeadTimezone({
        leadTimezone: 'America/Denver',
        callerPhoneE164: '+13055551234',
        businessTimezone: 'America/Chicago',
      })
    ).toBe('America/Denver');

    expect(
      resolveLeadTimezone({
        callerPhoneE164: '+13055551234',
        businessTimezone: 'America/Chicago',
      })
    ).toBe('America/New_York'); // FL 305

    expect(
      resolveLeadTimezone({ businessTimezone: 'America/Chicago' })
    ).toBe('America/Chicago');
  });

  it('uses 8pm end for FL and OK area codes', () => {
    expect(quietEndHourForPhone('+13055551234')).toBe(QUIET_END_HOUR_FL_OK);
    expect(quietEndHourForPhone('+14055551234')).toBe(QUIET_END_HOUR_FL_OK);
    expect(quietEndHourForPhone('+12125551234')).toBe(QUIET_END_HOUR_DEFAULT);
  });
});

describe('quiet hours window edges', () => {
  const tz = 'America/New_York';

  it('allows 8:00 local and blocks 7:59', () => {
    // 2026-03-10 12:00 UTC = 08:00 EDT (DST starts March 8 2026)
    const at8 = new Date('2026-03-10T12:00:00.000Z');
    expect(localParts(at8, tz).hour).toBe(QUIET_START_HOUR);
    expect(isWithinQuietHoursWindow(at8, tz, QUIET_END_HOUR_DEFAULT)).toBe(
      true
    );

    const before8 = new Date('2026-03-10T11:59:00.000Z');
    expect(localParts(before8, tz).hour).toBe(7);
    expect(isWithinQuietHoursWindow(before8, tz, QUIET_END_HOUR_DEFAULT)).toBe(
      false
    );
  });

  it('blocks at end hour (exclusive) — 21:00 default, 20:00 FL', () => {
    // 2026-07-01 01:00 UTC = 21:00 EDT
    const at21 = new Date('2026-07-01T01:00:00.000Z');
    expect(localParts(at21, tz).hour).toBe(21);
    expect(isWithinQuietHoursWindow(at21, tz, QUIET_END_HOUR_DEFAULT)).toBe(
      false
    );

    // 2026-07-01 00:00 UTC = 20:00 EDT — blocked for FL
    const at20 = new Date('2026-07-01T00:00:00.000Z');
    expect(localParts(at20, tz).hour).toBe(20);
    expect(isWithinQuietHoursWindow(at20, tz, QUIET_END_HOUR_FL_OK)).toBe(
      false
    );
    expect(isWithinQuietHoursWindow(at20, tz, QUIET_END_HOUR_DEFAULT)).toBe(
      true
    );
  });

  it('defers (does not drop) outside window', () => {
    const late = new Date('2026-07-01T02:00:00.000Z'); // 22:00 EDT
    const result = deferUntilQuietHoursOpen(late, {
      callerPhoneE164: '+12125551234',
      businessTimezone: tz,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.nextSendAt.getTime()).toBeGreaterThan(late.getTime());
      const parts = localParts(result.nextSendAt, tz);
      expect(parts.hour).toBe(QUIET_START_HOUR);
      expect(parts.minute).toBe(0);
    }
  });

  it('handles DST spring-forward (US 2026-03-08)', () => {
    // 06:30 EST on spring-forward morning → next 8:00 is after the gap
    const before = new Date('2026-03-08T11:30:00.000Z'); // 06:30 EST
    const next = nextLocalHour(before, tz, QUIET_START_HOUR);
    const parts = localParts(next, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    // Should land on March 8 after DST (EDT)
    expect(parts.day).toBe(8);
  });

  it('handles DST fall-back (US 2026-11-01)', () => {
    // After fall-back, America/New_York is EST (UTC-5). 03:30 UTC = 22:30 local.
    const evening = new Date('2026-11-02T03:30:00.000Z');
    const eveningLocal = localParts(evening, tz);
    expect(eveningLocal.hour).toBe(22);
    const next = nextLocalHour(evening, tz, QUIET_START_HOUR);
    const parts = localParts(next, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    // Next local 08:00 after late evening is the following calendar morning
    expect(parts.day).toBeGreaterThan(eveningLocal.day);
  });
});
