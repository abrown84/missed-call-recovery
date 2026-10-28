/**
 * Pure SSL option resolver for staging evidence (mut.py #50).
 * Imported by staging-campaign-evidence.mjs — keep behaviour covered by
 * src/lib/staging-ssl.test.ts (dynamic import of this file).
 */
export function resolveStagingSsl(env = process.env) {
  const sslEnv = String(env.STAGING_PG_SSL ?? '1').trim().toLowerCase();
  const sslDisabled = sslEnv === '0' || sslEnv === 'false' || sslEnv === 'off';
  // QC r9: default rejectUnauthorized=true (set env to '0' to allow self-signed).
  const rejectUnauthorized =
    String(env.STAGING_PG_SSL_REJECT_UNAUTHORIZED ?? '1').trim() === '1';
  return sslDisabled ? false : { rejectUnauthorized };
}
