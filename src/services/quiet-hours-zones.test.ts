/**
 * Critical NANP area-code → IANA zone assertions (QC r8 P1-6).
 * quiet-hours-zones.ts is excluded from Stryker mutate (static data map);
 * mut.py #13 still string-replaces '850' dual zones — this suite kills it.
 */
import { describe, expect, it } from 'vitest';
import { AREA_CODE_ZONES, FL_AREA, OK_AREA } from './quiet-hours-zones';

const IANA_RE = /^[A-Za-z]+\/[A-Za-z0-9_\-+]+$/;

describe('quiet-hours-zones critical area codes', () => {
  it('850 panhandle requires BOTH Eastern and Central', () => {
    expect(AREA_CODE_ZONES['850']).toEqual([
      'America/New_York',
      'America/Chicago',
    ]);
  });

  it('808 Hawaii and 907 Alaska map to local zones', () => {
    expect(AREA_CODE_ZONES['808']).toEqual(['Pacific/Honolulu']);
    expect(AREA_CODE_ZONES['907']).toEqual(['America/Anchorage']);
  });

  it('212 Manhattan is Eastern', () => {
    expect(AREA_CODE_ZONES['212']).toEqual(['America/New_York']);
  });

  it('every mapped zone is a non-empty IANA-looking string', () => {
    const entries = Object.entries(AREA_CODE_ZONES);
    expect(entries.length).toBeGreaterThan(100);
    for (const [ac, zones] of entries) {
      expect(ac, ac).toMatch(/^\d{3}$/);
      expect(zones.length, ac).toBeGreaterThan(0);
      for (const z of zones) {
        expect(z, `${ac}:${z}`).toMatch(IANA_RE);
        expect(z.length, `${ac}:${z}`).toBeGreaterThan(0);
      }
    }
  });

  it('FL_AREA includes 850; OK_AREA is non-empty', () => {
    expect(FL_AREA.has('850')).toBe(true);
    expect(OK_AREA.size).toBeGreaterThan(0);
  });
});
