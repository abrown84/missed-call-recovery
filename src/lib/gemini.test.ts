import { describe, it, expect } from 'vitest';
import { resolveGatewayUrl } from './gemini';

describe('resolveGatewayUrl', () => {
  it('uses the production default when unset', () => {
    expect(resolveGatewayUrl(undefined)).toBe(
      'https://brwnindustries.com/labs/one-gateway'
    );
  });

  it('normalizes trailing slashes', () => {
    expect(resolveGatewayUrl('https://example.com/gw/')).toBe('https://example.com/gw');
  });

  it('allows http only for localhost', () => {
    expect(resolveGatewayUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(() => resolveGatewayUrl('http://evil.example')).toThrow(/https/);
  });

  it('rejects invalid URLs and schemes', () => {
    expect(() => resolveGatewayUrl('not a url')).toThrow(/not a valid URL/);
    expect(() => resolveGatewayUrl('ftp://example.com')).toThrow(/http: and https/);
  });
});
