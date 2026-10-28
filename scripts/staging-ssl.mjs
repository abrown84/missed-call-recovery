/**
 * Pure SSL option resolver for staging evidence.
 * Canonical TypeScript copy: src/lib/staging-ssl.ts (keep in sync; mut.py #50).
 */
export function resolveStagingSsl(env = process.env) {
  const sslEnv = String(env.STAGING_PG_SSL ?? '1').trim().toLowerCase();
  const sslDisabled = sslEnv === '0' || sslEnv === 'false' || sslEnv === 'off';
  const rejectUnauthorized =
    String(env.STAGING_PG_SSL_REJECT_UNAUTHORIZED ?? '0').trim() === '1';
  return sslDisabled ? false : { rejectUnauthorized };
}
