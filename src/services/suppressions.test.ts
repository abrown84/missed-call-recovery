import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

import {
  SuppressionLookupError,
  isPhoneSuppressed,
  suppressPhone,
} from './suppressions';

function thenable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {
    select: vi.fn(() => obj),
    upsert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

describe('suppressions fail-closed + E.164', () => {
  beforeEach(() => mockFrom.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('normalizes phone on lookup', async () => {
    let lookedUp: string | null = null;
    mockFrom.mockImplementation(() => {
      const obj = thenable({ data: { id: 's1' }, error: null });
      obj.eq = vi.fn((col: string, val: string) => {
        if (col === 'phone') lookedUp = val;
        return obj;
      });
      return obj;
    });

    await expect(
      isPhoneSuppressed('biz', '(555) 123-4567')
    ).resolves.toBe(true);
    expect(lookedUp).toBe('+15551234567');
  });

  it('throws (fail-closed) when DB read errors', async () => {
    mockFrom.mockImplementation(() =>
      thenable({ data: null, error: { message: 'db down' } })
    );
    await expect(isPhoneSuppressed('biz', '+15551234567')).rejects.toBeInstanceOf(
      SuppressionLookupError
    );
  });

  it('throws when DB write errors', async () => {
    mockFrom.mockImplementation(() => {
      const obj = thenable({ data: null, error: { message: 'write fail' } });
      obj.upsert = vi.fn(() =>
        Promise.resolve({ data: null, error: { message: 'write fail' } })
      );
      return obj;
    });
    await expect(
      suppressPhone('biz', '+15551234567', 'opt_out')
    ).rejects.toBeInstanceOf(SuppressionLookupError);
  });
});
