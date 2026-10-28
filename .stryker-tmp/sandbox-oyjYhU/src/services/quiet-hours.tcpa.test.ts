// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  deferUntilQuietHoursOpen,
  quietEndHourForPhone,
  resolveLeadTimezones,
} from './quiet-hours';

describe('TCPA quiet hours (QC r5 D)', () => {
  it('850 is Eastern AND Central (stricter = both must be open)', () => {
    const r = resolveLeadTimezones({ callerPhoneE164: '+18505551234' });
    expect(r.zones).toEqual(['America/New_York', 'America/Chicago']);
    expect(r.ambiguous).toBe(true);
    expect(r.known).toBe(true);
    expect(r.endHour).toBe(20);
    expect(quietEndHourForPhone('+18505551234')).toBe(20);
    // Single-zone NY must NOT be marked ambiguous
    const ny = resolveLeadTimezones({ callerPhoneE164: '+12125550100' });
    expect(ny.zones).toEqual(['America/New_York']);
    expect(ny.ambiguous).toBe(false);
    expect(ny.endHour).toBe(21);
  });

  it('unmapped area code is UNRESOLVED — never falls back to business TZ', () => {
    const r = resolveLeadTimezones({
      callerPhoneE164: '+19995551234', // 999 unmapped
      businessTimezone: 'America/New_York',
    });
    expect(r.zones).toEqual([]);
    expect(r.known).toBe(false);

    const d = deferUntilQuietHoursOpen(new Date('2026-07-01T16:00:00.000Z'), {
      callerPhoneE164: '+19995551234',
      businessTimezone: 'America/New_York',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.unresolved).toBe(true);
  });

  it('lead timezone overrides area-code map when valid', () => {
    const r = resolveLeadTimezones({
      callerPhoneE164: '+12125550100',
      leadTimezone: 'America/Los_Angeles',
      businessTimezone: 'America/New_York',
    });
    expect(r.zones).toEqual(['America/Los_Angeles']);
  });

  it('604 Vancouver at 6am Pacific is blocked', () => {
    // 2026-07-01 13:00 UTC = 06:00 America/Vancouver (PDT)
    const now = new Date('2026-07-01T13:00:00.000Z');
    const r = resolveLeadTimezones({ callerPhoneE164: '+16045550100' });
    expect(r.zones).toEqual(['America/Vancouver']);

    const d = deferUntilQuietHoursOpen(now, {
      callerPhoneE164: '+16045550100',
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed && !('unresolved' in d && d.unresolved)) {
      expect(d.nextSendAt.toISOString()).toBe('2026-07-01T15:00:00.000Z'); // 08:00 PDT
    }
  });
});
