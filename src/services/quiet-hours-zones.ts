/**
 * NANP area-code → IANA zone lookups (QC r9).
 * Static map lives in quiet-hours-zones-data.ts (table-driven tests + mut.py #13).
 * This module is under Stryker mutate for zonesForAreaCode().
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
