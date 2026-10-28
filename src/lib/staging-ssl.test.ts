/**
 * Behavioural coverage for scripts/staging-ssl.mjs (mut.py #50).
 */
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'url';
import { join } from 'path';

describe('staging-ssl.mjs resolveStagingSsl (mut.py #50)', () => {
  it('respects STAGING_PG_SSL disable and rejectUnauthorized flag', async () => {
    const mod = await import(
      pathToFileURL(join(process.cwd(), 'scripts/staging-ssl.mjs')).href
    );
    const { resolveStagingSsl } = mod as {
      resolveStagingSsl: (
        env?: Record<string, string | undefined>
      ) => false | { rejectUnauthorized: boolean };
    };

    expect(resolveStagingSsl({ STAGING_PG_SSL: '0' })).toBe(false);
    expect(resolveStagingSsl({ STAGING_PG_SSL: 'false' })).toBe(false);
    expect(resolveStagingSsl({ STAGING_PG_SSL: 'off' })).toBe(false);
    // QC r9: default rejectUnauthorized is true.
    expect(resolveStagingSsl({})).toEqual({ rejectUnauthorized: true });
    expect(
      resolveStagingSsl({ STAGING_PG_SSL_REJECT_UNAUTHORIZED: '0' })
    ).toEqual({ rejectUnauthorized: false });
    expect(
      resolveStagingSsl({ STAGING_PG_SSL_REJECT_UNAUTHORIZED: '1' })
    ).toEqual({ rejectUnauthorized: true });
    expect(
      resolveStagingSsl({
        STAGING_PG_SSL: '1',
        STAGING_PG_SSL_REJECT_UNAUTHORIZED: '1',
      })
    ).toEqual({ rejectUnauthorized: true });
    // Mutant that always returns { rejectUnauthorized: false } fails here.
    expect(
      resolveStagingSsl({
        STAGING_PG_SSL: '1',
        STAGING_PG_SSL_REJECT_UNAUTHORIZED: '1',
      })
    ).not.toEqual({ rejectUnauthorized: false });
  });
});
