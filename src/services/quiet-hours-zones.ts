/**
 * NANP area-code → IANA zone lookups (QC r11).
 * Map generated from Google libphonenumber map_data.txt
 * (see third_party/libphonenumber/SOURCE.md + npm run generate:nanp-zones).
 * This module is under Stryker mutate for zonesForAreaCode(); the data file is not.
 */
import {
  AREA_CODE_ZONES,
  FL_AREA,
  OK_AREA,
} from './quiet-hours-zones-data';

export { AREA_CODE_ZONES, FL_AREA, OK_AREA };

/** Lookup helper — preferred over direct map access so mutants are non-static. */
export function zonesForAreaCode(ac: string): string[] | undefined {
  return AREA_CODE_ZONES[ac];
}
