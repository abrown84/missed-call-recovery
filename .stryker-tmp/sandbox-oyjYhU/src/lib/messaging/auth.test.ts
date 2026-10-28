// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { bearerMatches } from './auth';

describe('bearerMatches', () => {
  it('accepts the correct bearer token', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('rejects wrong, missing, or malformed auth', () => {
    expect(bearerMatches('Bearer wrong', 's3cret')).toBe(false);
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
    expect(bearerMatches(null, 's3cret')).toBe(false);
    expect(bearerMatches('Bearer s3cret', '')).toBe(false);
    expect(bearerMatches('Bearer s3cret-extra', 's3cret')).toBe(false);
  });
});
