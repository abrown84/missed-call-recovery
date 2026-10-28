/**
 * NANP area-code → IANA zone lookups (QC r9).
 * Static map lives in quiet-hours-zones-data.ts (table-driven tests + mut.py #13).
 * This module is under Stryker mutate for zonesForAreaCode().
 */
import { AREA_CODE_ZONES } from './quiet-hours-zones-data';

export { AREA_CODE_ZONES };

/** Lookup helper — preferred over direct map access so mutants are non-static. */
export function zonesForAreaCode(ac: string): string[] | undefined {
  return AREA_CODE_ZONES[ac];
}

export const FL_AREA = new Set([
  '239', '305', '321', '352', '386', '407', '448', '561', '645', '656', '689',
  '727', '728', '754', '772', '786', '813', '850', '863', '904', '941', '954',
]);
export const OK_AREA = new Set(['405', '539', '572', '580', '918']);

