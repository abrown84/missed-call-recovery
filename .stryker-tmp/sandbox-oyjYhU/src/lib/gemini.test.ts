// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { PRODUCTION_DEFAULT_GATEWAY_URL, resolveGatewayUrl } from './gemini';

describe('resolveGatewayUrl', () => {
  it('fails closed when unset outside production', () => {
    expect(() => resolveGatewayUrl(undefined, { isProduction: false })).toThrow(
      /fail closed/i
    );
  });

  it('requires ONE_GATEWAY_URL explicitly in production (no implicit default)', () => {
    expect(() => resolveGatewayUrl(undefined, { isProduction: true })).toThrow(
      /explicitly/i
    );
    expect(
      resolveGatewayUrl(PRODUCTION_DEFAULT_GATEWAY_URL, { isProduction: true })
    ).toBe(PRODUCTION_DEFAULT_GATEWAY_URL);
  });

  it('normalizes trailing slashes', () => {
    expect(resolveGatewayUrl('https://example.com/gw/', { isProduction: false })).toBe(
      'https://example.com/gw'
    );
  });

  it('allows http only for localhost', () => {
    expect(resolveGatewayUrl('http://localhost:8787', { isProduction: false })).toBe(
      'http://localhost:8787'
    );
    expect(() =>
      resolveGatewayUrl('http://evil.example', { isProduction: false })
    ).toThrow(/https/);
  });

  it('rejects invalid URLs and schemes', () => {
    expect(() =>
      resolveGatewayUrl('not a url', { isProduction: false })
    ).toThrow(/not a valid URL/);
    expect(() =>
      resolveGatewayUrl('ftp://example.com', { isProduction: false })
    ).toThrow(/http: and https/);
  });
});
