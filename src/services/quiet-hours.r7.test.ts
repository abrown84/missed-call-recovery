/**
 * QC r7: behaviour tests for nextLocalHour + multi-zone deferral
 * (replaces undocumented Stryker disable-all blocks).
 */
import { describe, expect, it } from 'vitest';
import {
  QUIET_START_HOUR,
  deferUntilQuietHoursOpen,
  isWithinQuietHoursWindow,
  localParts,
  nextLocalHour,
  resolveLeadTimezones,
} from './quiet-hours';

describe('QC r7 quiet-hours: nextLocalHour behaviour', () => {
  const tz = 'America/New_York';

  it('exact-hour short-circuit returns the same instant', () => {
    // 08:00:00 EDT on 2026-07-01
    const exact = new Date('2026-07-01T12:00:00.000Z');
    const parts = localParts(exact, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    expect(parts.second).toBe(0);
    expect(nextLocalHour(exact, tz, QUIET_START_HOUR).getTime()).toBe(
      exact.getTime()
    );
  });

  it('walks to next 8:00 when already past start hour', () => {
    const noon = new Date('2026-07-01T16:00:00.000Z'); // 12:00 EDT
    const next = nextLocalHour(noon, tz, QUIET_START_HOUR);
    const p = localParts(next, tz);
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(0);
    expect(p.day).toBe(2);
  });

  it('DST spring-forward still lands on local 8:00', () => {
    // US 2026-03-08: clocks jump 2am→3am. From 01:30 EST, next 8:00 is same day.
    const before = new Date('2026-03-08T06:30:00.000Z'); // 01:30 EST
    const next = nextLocalHour(before, 'America/New_York', QUIET_START_HOUR);
    const p = localParts(next, 'America/New_York');
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(0);
    expect(p.day).toBe(8);
  });

  it('DST fall-back still lands on local 8:00 next morning', () => {
    const evening = new Date('2026-11-02T03:30:00.000Z'); // 22:30 EDT Nov 1
    const next = nextLocalHour(evening, 'America/New_York', QUIET_START_HOUR);
    const p = localParts(next, 'America/New_York');
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(0);
    expect(p.day).toBe(2);
  });
});

describe('QC r7 quiet-hours: 850 dual-zone uses Math.max (latest)', () => {
  it('defers until BOTH ET and CT are open — not the earlier zone alone', () => {
    // 12:00 UTC = 08:00 EDT / 07:00 CDT → CT still quiet
    const now = new Date('2026-07-01T12:00:00.000Z');
    const d = deferUntilQuietHoursOpen(now, {
      callerPhoneE164: '+18505550100',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed && !('unresolved' in d && d.unresolved)) {
      // Must wait for Central 8:00 (= 13:00 UTC), not Eastern 8:00 (= 12:00 UTC).
      // Math.min would wrongly schedule at ET-open while CT is still quiet.
      expect(d.nextSendAt.toISOString()).toBe('2026-07-01T13:00:00.000Z');
      expect(
        isWithinQuietHoursWindow(d.nextSendAt, 'America/New_York', d.endHour)
      ).toBe(true);
      expect(
        isWithinQuietHoursWindow(d.nextSendAt, 'America/Chicago', d.endHour)
      ).toBe(true);
    }
  });

  it('850 zones resolve to ET+CT', () => {
    expect(
      resolveLeadTimezones({ callerPhoneE164: '+18505550100' }).zones
    ).toEqual(['America/New_York', 'America/Chicago']);
  });
});

describe('QC r7 quiet-hours: HI / AK area codes', () => {
  it('808 Hawaii defers to Honolulu local 8:00', () => {
    // 2026-07-01 10:00 UTC = 00:00 HST — quiet
    const now = new Date('2026-07-01T10:00:00.000Z');
    const d = deferUntilQuietHoursOpen(now, {
      callerPhoneE164: '+18085550100',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed && !('unresolved' in d && d.unresolved)) {
      const p = localParts(d.nextSendAt, 'Pacific/Honolulu');
      expect(p.hour).toBe(8);
      expect(p.minute).toBe(0);
      expect(
        isWithinQuietHoursWindow(
          d.nextSendAt,
          'Pacific/Honolulu',
          d.endHour
        )
      ).toBe(true);
    }
  });

  it('907 Alaska defers to Anchorage local 8:00', () => {
    // 2026-07-01 10:00 UTC = 02:00 AKDT — quiet
    const now = new Date('2026-07-01T10:00:00.000Z');
    const d = deferUntilQuietHoursOpen(now, {
      callerPhoneE164: '+19075550100',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed && !('unresolved' in d && d.unresolved)) {
      const p = localParts(d.nextSendAt, 'America/Anchorage');
      expect(p.hour).toBe(8);
      expect(p.minute).toBe(0);
    }
  });

  it('808 / 907 resolve to single zone each', () => {
    expect(
      resolveLeadTimezones({ callerPhoneE164: '+18085550100' }).zones
    ).toEqual(['Pacific/Honolulu']);
    expect(
      resolveLeadTimezones({ callerPhoneE164: '+19075550100' }).zones
    ).toEqual(['America/Anchorage']);
  });
});
