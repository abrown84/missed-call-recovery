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
  resolveLeadTimezones,
} from './quiet-hours';

describe('quiet hours timezone resolution', () => {
  it('prefers lead timezone, then area code; never business fallback', () => {
    expect(
      resolveLeadTimezone({
        leadTimezone: 'America/Denver',
        callerPhoneE164: '+13055551234',
        businessTimezone: 'America/Chicago',
      })
    ).toBe('America/Denver');

    expect(
      resolveLeadTimezones({
        callerPhoneE164: '+13055551234',
        businessTimezone: 'America/Chicago',
      }).zones
    ).toEqual(['America/New_York']);

    // Unmapped / no phone → unresolved (empty). Deprecated helper may default.
    expect(
      resolveLeadTimezones({ businessTimezone: 'America/Chicago' }).zones
    ).toEqual([]);
  });

  it('uses 8pm end for FL/OK; 850 is Eastern AND Central', () => {
    expect(quietEndHourForPhone('+13055551234')).toBe(QUIET_END_HOUR_FL_OK);
    expect(quietEndHourForPhone('+12395551234')).toBe(QUIET_END_HOUR_FL_OK);
    expect(quietEndHourForPhone('+15725551234')).toBe(QUIET_END_HOUR_FL_OK);
    expect(resolveLeadTimezones({ callerPhoneE164: '+18505551234' }).zones).toEqual([
      'America/Chicago',
      'America/New_York',
    ]);
    expect(quietEndHourForPhone('+12125551234')).toBe(QUIET_END_HOUR_DEFAULT);
    expect(resolveLeadTimezones({ callerPhoneE164: '+18085551234' }).zones).toEqual([
      'Pacific/Honolulu',
    ]);
  });
});


describe('quiet hours window edges', () => {
  const tz = 'America/New_York';

  it('allows 8:00 local and blocks 7:59', () => {
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
    const at21 = new Date('2026-07-01T01:00:00.000Z');
    expect(localParts(at21, tz).hour).toBe(21);
    expect(isWithinQuietHoursWindow(at21, tz, QUIET_END_HOUR_DEFAULT)).toBe(
      false
    );

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
    const late = new Date('2026-07-01T02:00:00.000Z');
    const result = deferUntilQuietHoursOpen(late, {
      callerPhoneE164: '+12125551234',
      businessTimezone: tz,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed && !('unresolved' in result && result.unresolved)) {
      expect(result.nextSendAt.getTime()).toBeGreaterThan(late.getTime());
      const parts = localParts(result.nextSendAt, tz);
      expect(parts.hour).toBe(QUIET_START_HOUR);
      expect(parts.minute).toBe(0);
    }
  });

  it('7:59:59 → exactly 8:00:00 (not 8:00:59)', () => {
    const from = new Date('2026-07-01T11:59:59.000Z'); // 07:59:59 EDT
    const next = nextLocalHour(from, tz, QUIET_START_HOUR);
    expect(next.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('handles DST spring-forward (US 2026-03-08)', () => {
    const before = new Date('2026-03-08T11:30:00.000Z');
    const next = nextLocalHour(before, tz, QUIET_START_HOUR);
    const parts = localParts(next, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBe(8);
  });

  it('handles DST fall-back (US 2026-11-01)', () => {
    const evening = new Date('2026-11-02T03:30:00.000Z');
    const eveningLocal = localParts(evening, tz);
    expect(eveningLocal.hour).toBe(22);
    const next = nextLocalHour(evening, tz, QUIET_START_HOUR);
    const parts = localParts(next, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBeGreaterThan(eveningLocal.day);
  });
});
