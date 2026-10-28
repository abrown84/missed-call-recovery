// @ts-nocheck
import { afterEach, describe, expect, it } from 'vitest';
import { PRODUCTION_DEFAULT_GATEWAY_URL, resolveGatewayUrl } from './gemini';

describe('ONE_GATEWAY_URL fail-closed', () => {
  afterEach(() => {
    delete process.env.ONE_GATEWAY_URL;
  });

  it('unset outside production throws (no live call)', () => {
    expect(() =>
      resolveGatewayUrl(undefined, { isProduction: false })
    ).toThrow(/fail closed/i);
  });

  it('unset in production requires explicit URL (no implicit live default)', () => {
    expect(() =>
      resolveGatewayUrl(undefined, { isProduction: true })
    ).toThrow(/explicitly/i);
  });

  it('production accepts the documented default when set explicitly', () => {
    expect(
      resolveGatewayUrl(PRODUCTION_DEFAULT_GATEWAY_URL, { isProduction: true })
    ).toBe(PRODUCTION_DEFAULT_GATEWAY_URL);
  });

  it('explicit URL wins', () => {
    expect(
      resolveGatewayUrl('https://gw.example.com/v1', { isProduction: false })
    ).toBe('https://gw.example.com/v1');
  });
});
