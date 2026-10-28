/**
 * Table-driven NANP area-code → IANA zone assertions (QC r9).
 * Pins every map entry + critical dual-zone / territory fixes.
 */
import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './quiet-hours';
import {
  AREA_CODE_ZONES,
  FL_AREA,
  OK_AREA,
  zonesForAreaCode,
} from './quiet-hours-zones';

/** Key codes with pinned expected zones (typo / swap regressions must fail). */
const PINNED: Record<string, string[]> = {
  '212': ['America/New_York'],
  '213': ['America/Los_Angeles'],
  '305': ['America/New_York'],
  '312': ['America/Chicago'],
  '405': ['America/Chicago'],
  '503': ['America/Los_Angeles'],
  '541': ['America/Los_Angeles', 'America/Denver'],
  '605': ['America/Chicago', 'America/Denver'],
  '671': ['Pacific/Guam'],
  '787': ['America/Puerto_Rico'],
  '808': ['Pacific/Honolulu'],
  '850': ['America/New_York', 'America/Chicago'],
  '907': ['America/Anchorage'],
  '931': ['America/Chicago', 'America/New_York'],
  '939': ['America/Puerto_Rico'],
};

describe('quiet-hours-zones full map (table-driven)', () => {
  const entries = Object.entries(AREA_CODE_ZONES);

  it('map has a substantial NANP sample', () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it.each(entries)(
    'area %s is non-empty with valid IANA zones',
    (ac, zones) => {
      expect(ac).toMatch(/^\d{3}$/);
      expect(zones.length, ac).toBeGreaterThan(0);
      for (const z of zones) {
        expect(z.length, `${ac}:${z}`).toBeGreaterThan(0);
        expect(isValidTimeZone(z), `${ac}:${z}`).toBe(true);
        // Also exercise Intl directly (same contract as isValidTimeZone).
        expect(() =>
          Intl.DateTimeFormat('en-US', { timeZone: z }).format(new Date())
        ).not.toThrow();
      }
      expect(zonesForAreaCode(ac)).toEqual(zones);
    }
  );

  it.each(Object.entries(PINNED))(
    'pinned %s → %j',
    (ac, expected) => {
      expect(AREA_CODE_ZONES[ac]).toEqual(expected);
      expect(zonesForAreaCode(ac)).toEqual(expected);
    }
  );

  it('rejects swapping 212 to a wrong zone (typo guard)', () => {
    expect(AREA_CODE_ZONES['212']).not.toEqual(['America/Los_Angeles']);
    expect(AREA_CODE_ZONES['212']).not.toEqual(['America/Chicago']);
    expect(zonesForAreaCode('212')).toEqual(['America/New_York']);
  });

  it('QC r9 dual-zone / territory fixes', () => {
    expect(zonesForAreaCode('605')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('541')).toEqual([
      'America/Los_Angeles',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('931')).toEqual([
      'America/Chicago',
      'America/New_York',
    ]);
    expect(zonesForAreaCode('787')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('939')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('671')).toEqual(['Pacific/Guam']);
  });

  it('zonesForAreaCode returns undefined for unmapped codes', () => {
    expect(zonesForAreaCode('000')).toBeUndefined();
    expect(zonesForAreaCode('999')).toBeUndefined();
  });

  it('FL_AREA includes 850; OK_AREA is non-empty', () => {
    expect(FL_AREA.has('850')).toBe(true);
    expect(OK_AREA.size).toBeGreaterThan(0);
  });
});
