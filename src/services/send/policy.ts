/**
 * Send policy gates (no relay I/O).
 */

const ENABLED_VALUES = new Set(['', '1', 'true', 'yes', 'on']);

/**
 * App-side kill switch. Default true.
 * Set SENDS_ENABLED=false (or 0/off/no) to block every outbound path
 * without depending on dry-run or the relay.
 * Unknown values fail closed (do not send).
 */
export function isSendsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  // Missing var → enabled. Do not default via ?? 'true' (equivalent to ?? ''
  // because '' is also in ENABLED_VALUES).
  if (env.SENDS_ENABLED === undefined) return true;
  const raw = env.SENDS_ENABLED.trim().toLowerCase();
  return ENABLED_VALUES.has(raw);
}
