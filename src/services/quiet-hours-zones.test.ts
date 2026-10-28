/**
 * Full-map pin against libphonenumber-generated golden fixture (QC r11).
 * Snapshot is produced by scripts/generate-nanp-zones.mjs from vendored
 * third_party/libphonenumber/map_data.txt — not a hand copy of the data module.
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
import { buildNpaZoneMap } from '../../scripts/generate-nanp-zones.mjs';

const GOLDEN_PATH = join(
  process.cwd(),
  'test/fixtures/nanp-area-code-zones.json'
);
const MAP_DATA_PATH = join(
  process.cwd(),
  'third_party/libphonenumber/map_data.txt'
);

function loadGolden(): Record<string, string[]> {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<
    string,
    string[]
  >;
}

describe('quiet-hours-zones full map (libphonenumber golden pin)', () => {
  const golden = loadGolden();
  const fromUpstream = buildNpaZoneMap(readFileSync(MAP_DATA_PATH, 'utf8'));
  const entries = Object.entries(AREA_CODE_ZONES);

  it('runtime map matches golden fixture and regenerates from map_data', () => {
    expect(Object.keys(AREA_CODE_ZONES).sort()).toEqual(
      Object.keys(golden).sort()
    );
    expect(AREA_CODE_ZONES).toEqual(golden);
    expect(golden).toEqual(fromUpstream);
    expect(entries.length).toBeGreaterThanOrEqual(400);
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
    const swapped = { ...AREA_CODE_ZONES, '702': ['America/New_York'] };
    expect(swapped).not.toEqual(golden);
    expect(swapped).not.toEqual(fromUpstream);
  });

  it('QC r11 dual-zone / territory pins from libphonenumber union', () => {
    expect(zonesForAreaCode('605')).toEqual(
      expect.arrayContaining(['America/Chicago', 'America/Denver'])
    );
    expect(zonesForAreaCode('541')).toEqual(
      expect.arrayContaining(['America/Los_Angeles', 'America/Denver'])
    );
    expect(zonesForAreaCode('620')).toEqual([
      'America/Chicago',
      'America/Denver',
    ]);
    expect(zonesForAreaCode('785')).toEqual(
      expect.arrayContaining(['America/Chicago', 'America/Denver'])
    );
    expect(zonesForAreaCode('701')).toEqual(
      expect.arrayContaining(['America/Chicago', 'America/Denver'])
    );
    // NV 775 — West Wendover Mountain (Boise/Denver)
    expect(zonesForAreaCode('775')).toEqual(
      expect.arrayContaining([
        'America/Los_Angeles',
        'America/Boise',
        'America/Denver',
      ])
    );
    // AZ 928 — Navajo Nation observes DST (Denver)
    expect(zonesForAreaCode('928')).toEqual([
      'America/Denver',
      'America/Phoenix',
    ]);
    // AK 907 — Aleutians (Adak)
    expect(zonesForAreaCode('907')).toEqual(
      expect.arrayContaining(['America/Adak', 'America/Anchorage'])
    );
    // TN 423 / KY 606 — Central portions
    expect(zonesForAreaCode('423')).toEqual([
      'America/Chicago',
      'America/New_York',
    ]);
    expect(zonesForAreaCode('606')).toEqual([
      'America/Chicago',
      'America/New_York',
    ]);
    // BC 250 — Canada in scope; Mountain (Edmonton) + Pacific
    expect(zonesForAreaCode('250')).toEqual([
      'America/Edmonton',
      'America/Vancouver',
    ]);
    expect(zonesForAreaCode('787')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('939')).toEqual(['America/Puerto_Rico']);
    expect(zonesForAreaCode('671')).toEqual(['Pacific/Guam']);
    expect(zonesForAreaCode('670')).toEqual(['Pacific/Saipan']);
    expect(zonesForAreaCode('684')).toEqual(['Pacific/Pago_Pago']);
  });

  it('US overlay NPAs are mapped (not parked as unknown)', () => {
    for (const ac of [
      '220',
      '279',
      '350',
      '447',
      '640',
      '659',
      '748',
      '820',
      '943',
    ]) {
      expect(zonesForAreaCode(ac)?.length, ac).toBeGreaterThan(0);
    }
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
