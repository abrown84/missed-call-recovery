import { afterEach, describe, expect, it } from 'vitest';
import { isSendsEnabled } from './policy';

describe('isSendsEnabled', () => {
  afterEach(() => {
    delete process.env.SENDS_ENABLED;
  });

  it('defaults true when unset or empty', () => {
    expect(isSendsEnabled({})).toBe(true);
    expect(isSendsEnabled({ SENDS_ENABLED: '' })).toBe(true);
  });

  it('accepts true-ish values', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' On ']) {
      expect(isSendsEnabled({ SENDS_ENABLED: v }), v).toBe(true);
    }
  });

  it('accepts false-ish values', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'off', ' Off ']) {
      expect(isSendsEnabled({ SENDS_ENABLED: v }), v).toBe(false);
    }
  });

  it('fail-closes on unknown values', () => {
    expect(isSendsEnabled({ SENDS_ENABLED: 'maybe' })).toBe(false);
    expect(isSendsEnabled({ SENDS_ENABLED: 'enabled' })).toBe(false);
  });

  it('default env path uses process.env', () => {
    process.env.SENDS_ENABLED = 'false';
    expect(isSendsEnabled()).toBe(false);
    process.env.SENDS_ENABLED = 'true';
    expect(isSendsEnabled()).toBe(true);
  });
});

