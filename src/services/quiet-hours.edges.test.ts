import { describe, expect, it } from 'vitest';
import {
  areaCodeFromE164,
  deferUntilQuietHoursOpen,
  isValidTimeZone,
  quietEndHourForPhone,
  resolveLeadTimezones,
} from './quiet-hours';

describe('quiet-hours edge killers', () => {
  it('areaCodeFromE164 handles 10-digit, 11-digit, and junk', () => {
    expect(areaCodeFromE164('+12125550100')).toBe('212');
    expect(areaCodeFromE164('2125550100')).toBe('212');
    expect(areaCodeFromE164('+442071838750')).toBeNull();
    expect(areaCodeFromE164('123')).toBeNull();
  });

  it('isValidTimeZone rejects garbage', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  it('FL end hour vs default', () => {
    expect(quietEndHourForPhone('+13055550100')).toBe(20);
    expect(quietEndHourForPhone('+12125550100')).toBe(21);
    expect(quietEndHourForPhone(null)).toBe(21);
  });

  it('850 requires both zones open — 8am ET but 7am CT is deferred', () => {
    // 2026-07-01 12:00 UTC = 08:00 EDT, 07:00 CDT → CT still quiet
    const now = new Date('2026-07-01T12:00:00.000Z');
    const d = deferUntilQuietHoursOpen(now, {
      callerPhoneE164: '+18505550100',
    });
    expect(d.allowed).toBe(false);
  });

  it('invalid lead timezone ignored; falls through to area code', () => {
    const r = resolveLeadTimezones({
      callerPhoneE164: '+12125550100',
      leadTimezone: 'Not/AZone',
    });
    expect(r.zones).toEqual(['America/New_York']);
    expect(r.ambiguous).toBe(false);
    expect(r.known).toBe(true);
  });

  it('flags: lead TZ known; 850 ambiguous; unmapped unknown', () => {
    expect(
      resolveLeadTimezones({ leadTimezone: 'America/Denver' })
    ).toMatchObject({ ambiguous: false, known: true, zones: ['America/Denver'] });
    expect(
      resolveLeadTimezones({ callerPhoneE164: '+18505550100' })
    ).toMatchObject({ ambiguous: true, known: true });
    expect(
      resolveLeadTimezones({ callerPhoneE164: '+19995550100' })
    ).toMatchObject({ zones: [], known: false, ambiguous: false });
  });

  it('quietEndHour uses FL set membership (305 vs 212)', () => {
    expect(quietEndHourForPhone('+13055550100')).toBe(20);
    expect(quietEndHourForPhone('+12125550100')).toBe(21);
    expect(quietEndHourForPhone(undefined)).toBe(21);
  });
});

