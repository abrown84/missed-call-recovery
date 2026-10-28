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
  const raw = (env.SENDS_ENABLED ?? 'true').trim().toLowerCase();
  return ENABLED_VALUES.has(raw);
}
