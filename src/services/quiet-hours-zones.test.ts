/**
 * QC r8: quiet-hours-zones.ts is excluded from Stryker mutate (vacuous
 * static-only scores). Assert critical area-code → IANA mappings here.
 */
import { describe, expect, it } from 'vitest';
import { AREA_CODE_ZONES, FL_AREA, OK_AREA } from './quiet-hours-zones';

describe('AREA_CODE_ZONES map invariants', () => {
  it('maps dual-zone 850 and single-zone HI/AK/NY', () => {
    expect(AREA_CODE_ZONES['850']).toEqual([
      'America/New_York',
      'America/Chicago',
    ]);
    expect(AREA_CODE_ZONES['808']).toEqual(['Pacific/Honolulu']);
    expect(AREA_CODE_ZONES['907']).toEqual(['America/Anchorage']);
    expect(AREA_CODE_ZONES['212']).toEqual(['America/New_York']);
  });

  it('every entry is a non-empty list of IANA-looking zone ids', () => {
    for (const [ac, zones] of Object.entries(AREA_CODE_ZONES)) {
      expect(ac, ac).toMatch(/^\d{3}$/);
      expect(zones.length, ac).toBeGreaterThan(0);
      for (const z of zones) {
        expect(z, `${ac}:${z}`).toMatch(/^[A-Za-z_+-]+\/[A-Za-z0-9_+-]+$/);
      }
    }
  });

  it('FL_AREA / OK_AREA are non-empty and subset of mapped codes where listed', () => {
    expect(FL_AREA.size).toBeGreaterThan(0);
    expect(OK_AREA.size).toBeGreaterThan(0);
    for (const ac of FL_AREA) {
      expect(AREA_CODE_ZONES[ac], `FL ${ac}`).toBeDefined();
    }
  });
});
