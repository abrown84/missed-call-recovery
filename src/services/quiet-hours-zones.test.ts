/**
 * Full-map pin against reviewed golden fixture (QC r10).
 * Swapping any code's zone (e.g. 702 → New_York) must fail.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './quiet-hours';
import {
  AREA_CODE_ZONES,
  FL_AREA,
  OK_AREA,
  zonesForAreaCode,
} from './quiet-hours-zones';

const GOLDEN_PATH = join(
  process.cwd(),
  'test/fixtures/nanp-area-code-zones.json'
);

function loadGolden(): Record<string, string[]> {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<
    string,
    string[]
  >;
}

describe('quiet-hours-zones full map (golden pin)', () => {
  const golden = loadGolden();
  const entries = Object.entries(AREA_CODE_ZONES);

  it('runtime map matches golden fixture entry-for-entry (324+)', () => {
    expect(Object.keys(AREA_CODE_ZONES).sort()).toEqual(
      Object.keys(golden).sort()
    );
    expect(AREA_CODE_ZONES).toEqual(golden);
    expect(entries.length).toBeGreaterThanOrEqual(324);
  });

  it.each(Object.entries(golden))(
    'golden %s → %j (Intl-valid)',
    (ac, expected) => {
      expect(ac).toMatch(/^\d{3}$/);
      expect(AREA_CODE_ZONES[ac]).toEqual(expected);
      expect(zonesForAreaCode(ac)).toEqual(expected);
      for (const z of expected) {
        expect(isValidTimeZone(z), `${ac}:${z}`).toBe(true);
        expect(() =>
          Intl.DateTimeFormat('en-US', { timeZone: z }).format(new Date())
        ).not.toThrow();
      }
    }
  );

  it('rejects swapping 702 Las Vegas to New_York (typo guard)', () => {
    expect(AREA_CODE_ZONES['702']).toEqual(['America/Los_Angeles']);
    expect(AREA_CODE_ZONES['702']).not.toEqual(['America/New_York']);
    // Simulate the QC failure mode: a wrong golden would fail deep-equal above;
    // also assert the live map is not the swapped value.
    const swapped = { ...AREA_CODE_ZONES, '702': ['America/New_York'] };
    expect(swapped).not.toEqual(golden);
  });

  it('QC r9/r10 dual-zone and territory pins', () => {
    expect(zonesForAreaCode('605')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('541')).toEqual([
      'America/Los_Angeles',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('620')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('701')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('785')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('931')).toEqual([
      'America/Chicago',
      'America/New_York',
    ]);
    expect(zonesForAreaCode('787')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('939')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('671')).toEqual(['Pacific/Guam']);
    expect(zonesForAreaCode('670')).toEqual(['Pacific/Saipan']);
    expect(zonesForAreaCode('684')).toEqual(['Pacific/Pago_Pago']);
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
