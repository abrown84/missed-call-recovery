import { afterEach, describe, expect, it } from 'vitest';
import { getMessagingAdapter, resetMessagingAdapterCache } from './index';

describe('dry-run production guard', () => {
  afterEach(() => {
    delete process.env.MESSAGING_PROVIDER;
    delete process.env.VERCEL_ENV;
    resetMessagingAdapterCache();
  });

  it('allows dry-run outside production', () => {
    process.env.MESSAGING_PROVIDER = 'dry-run';
    process.env.VERCEL_ENV = 'preview';
    expect(getMessagingAdapter().name).toBe('dry-run');
  });

  it('throws if dry-run is set in production', () => {
    process.env.MESSAGING_PROVIDER = 'dry-run';
    process.env.VERCEL_ENV = 'production';
    expect(() => getMessagingAdapter()).toThrow(/forbidden.*production/i);
  });
});
