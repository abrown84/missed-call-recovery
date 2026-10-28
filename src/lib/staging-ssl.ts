/**
 * Pure SSL option resolver for staging evidence (mut.py #50).
 * Mirrors scripts/staging-ssl.mjs — keep in sync.
 */
export function resolveStagingSsl(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >
): false | { rejectUnauthorized: boolean } {
  const sslEnv = String(env.STAGING_PG_SSL ?? '1').trim().toLowerCase();
  const sslDisabled = sslEnv === '0' || sslEnv === 'false' || sslEnv === 'off';
  const rejectUnauthorized =
    String(env.STAGING_PG_SSL_REJECT_UNAUTHORIZED ?? '0').trim() === '1';
  return sslDisabled ? false : { rejectUnauthorized };
}
