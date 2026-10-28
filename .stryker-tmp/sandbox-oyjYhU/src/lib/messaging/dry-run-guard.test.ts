// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMessagingAdapter, resetMessagingAdapterCache } from './index';
import * as logic from '@/services/campaign-logic';

describe('dry-run production guard', () => {
  afterEach(() => {
    delete process.env.MESSAGING_PROVIDER;
    delete process.env.VERCEL_ENV;
    vi.restoreAllMocks();
    resetMessagingAdapterCache();
  });

  it('allows dry-run outside production', () => {
    process.env.MESSAGING_PROVIDER = 'dry-run';
    process.env.VERCEL_ENV = 'preview';
    vi.spyOn(logic, 'isProductionRuntime').mockReturnValue(false);
    expect(getMessagingAdapter().name).toBe('dry-run');
  });

  it('throws if dry-run when isProductionRuntime is true (VERCEL_ENV or NODE_ENV)', () => {
    process.env.MESSAGING_PROVIDER = 'dry-run';
    vi.spyOn(logic, 'isProductionRuntime').mockReturnValue(true);
    expect(() => getMessagingAdapter()).toThrow(/forbidden.*production/i);
  });
});

describe('isProductionRuntime', () => {
  it('is true for NODE_ENV=production or VERCEL_ENV=production', () => {
    expect(logic.isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(
      logic.isProductionRuntime({ VERCEL_ENV: 'production', NODE_ENV: 'test' })
    ).toBe(true);
    expect(
      logic.isProductionRuntime({ VERCEL_ENV: 'preview', NODE_ENV: 'test' })
    ).toBe(false);
  });
});
