/**
 * Behaviour tests targeting Stryker survivors in quiet-hours.ts (r7 gate).
 */
import { describe, expect, it } from 'vitest';
import {
  QUIET_START_HOUR,
  deferUntilQuietHoursOpen,
  isWithinQuietHoursWindow,
  localParts,
  nextLocalHour,
} from './quiet-hours';

describe('nextLocalHour survivors', () => {
  const tz = 'America/New_York';

  it('does not short-circuit when local second is non-zero at target hour', () => {
    // 08:00:01 EDT — minute/hour match short-circuit must not fire on second alone
    const from = new Date('2026-07-01T12:00:01.000Z');
    const parts = localParts(from, tz);
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
    expect(parts.second).toBe(1);
    const next = nextLocalHour(from, tz, QUIET_START_HOUR);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(localParts(next, tz).hour).toBe(8);
    expect(localParts(next, tz).minute).toBe(0);
  });

  it('does not short-circuit when local minute is non-zero (same hour)', () => {
    const from = new Date('2026-07-01T12:30:00.000Z'); // 08:30 EDT
    expect(localParts(from, tz).hour).toBe(8);
    expect(localParts(from, tz).minute).toBe(30);
    const next = nextLocalHour(from, tz, QUIET_START_HOUR);
    expect(next.getTime()).not.toBe(from.getTime());
    const p = localParts(next, tz);
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(0);
    expect(p.day).toBe(2);
  });

  it('uses +1 ms ceil so 07:59:59.999 lands on 08:00:00 not another :59', () => {
    const from = new Date('2026-07-01T11:59:59.999Z');
    expect(localParts(from, tz).hour).toBe(7);
    expect(localParts(from, tz).minute).toBe(59);
    expect(nextLocalHour(from, tz, QUIET_START_HOUR).toISOString()).toBe(
      '2026-07-01T12:00:00.000Z'
    );
  });

  it('falls back to +24h when target local hour never appears at :00', () => {
    const from = new Date('2026-07-01T12:00:00.000Z');
    const impossibleHour = 25;
    const next = nextLocalHour(from, tz, impossibleHour);
    expect(next.getTime()).toBe(from.getTime() + 24 * 60 * 60 * 1000);
  });

  it('search loop finds next-day 8:00 (not +24h fallback) from midday', () => {
    const noon = new Date('2026-07-01T16:00:00.000Z');
    const next = nextLocalHour(noon, tz, QUIET_START_HOUR);
    expect(next.toISOString()).toBe('2026-07-02T12:00:00.000Z');
    expect(next.getTime()).toBeLessThan(noon.getTime() + 24 * 60 * 60 * 1000);
  });
});

describe('deferUntilQuietHoursOpen survivors', () => {
  it('returns allowed when a single mapped zone is open (not unresolved)', () => {
    const noon = new Date('2026-07-01T16:00:00.000Z'); // 12:00 EDT
    expect(deferUntilQuietHoursOpen(noon, { callerPhoneE164: '+12125550100' })).toEqual({
      allowed: true,
      zones: ['America/New_York'],
    });
  });

  it('returns allowed when every dual-zone candidate is open', () => {
    const bothOpen = new Date('2026-07-01T14:00:00.000Z'); // 10:00 ET / 09:00 CT
    expect(
      deferUntilQuietHoursOpen(bothOpen, { callerPhoneE164: '+18505550100' })
    ).toEqual({
      allowed: true,
      zones: ['America/Chicago', 'America/New_York'],
    });
  });

  it('850 FL 20:00 end — ok uses every zone, not some, at aligned latest', () => {
    // 00:00 UTC = 20:00 ET (closed at end 20) but 19:00 CT (still open) → latest would be 12:00 UTC with only ET open
    const now = new Date('2026-07-01T00:00:00.000Z');
    const d = deferUntilQuietHoursOpen(now, { callerPhoneE164: '+18505550100' });
    expect(d.allowed).toBe(false);
    if (d.allowed || ('unresolved' in d && d.unresolved)) {
      throw new Error('expected deferred send time');
    }
    expect(d.endHour).toBe(20);
    expect(d.nextSendAt.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(
      isWithinQuietHoursWindow(d.nextSendAt, 'America/Chicago', d.endHour)
    ).toBe(true);
    expect(
      isWithinQuietHoursWindow(d.nextSendAt, 'America/New_York', d.endHour)
    ).toBe(true);
    expect(
      isWithinQuietHoursWindow(
        new Date('2026-07-01T12:00:00.000Z'),
        'America/Chicago',
        d.endHour
      )
    ).toBe(false);
  });

  it('850 defer uses latest open (Math.max) and requires every zone at nextSendAt', () => {
    const now = new Date('2026-07-01T12:00:00.000Z'); // 08:00 ET / 07:00 CT
    const d = deferUntilQuietHoursOpen(now, { callerPhoneE164: '+18505550100' });
    expect(d.allowed).toBe(false);
    if (d.allowed || ('unresolved' in d && d.unresolved)) {
      throw new Error('expected deferred send time');
    }
    expect(d.nextSendAt.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(d.nextSendAt.toISOString()).not.toBe('2026-07-01T12:00:00.000Z');
    expect(
      isWithinQuietHoursWindow(d.nextSendAt, 'America/New_York', d.endHour)
    ).toBe(true);
    expect(
      isWithinQuietHoursWindow(d.nextSendAt, 'America/Chicago', d.endHour)
    ).toBe(true);
    // CT still quiet at the earlier ET-only boundary
    expect(
      isWithinQuietHoursWindow(
        new Date('2026-07-01T12:00:00.000Z'),
        'America/Chicago',
        d.endHour
      )
    ).toBe(false);
  });

});
