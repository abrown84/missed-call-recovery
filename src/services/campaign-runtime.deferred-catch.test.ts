/**
 * QC r7: processDeferredRecoveries throw must not abort processDue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/send', async () => {
  const actual = await vi.importActual<typeof import('@/services/send')>(
    '@/services/send'
  );
  return {
    ...actual,
    reconcileAmbiguousSms: vi.fn(async () => ({
      unknownCount: 0,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 0,
      parked: 0,
      needsReview: 0,
      alert: false,
    })),
  };
});

import { processDueCampaignsWithDeps } from './campaign-runtime';
import type { CampaignDeps } from './campaign-deps';

function chainList(data: unknown[] = []) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of [
    'select',
    'update',
    'eq',
    'lte',
    'lt',
    'is',
    'or',
    'in',
    'like',
    'order',
    'limit',
  ]) {
    api[m] = self;
  }
  api.maybeSingle = async () => ({ data: null, error: null });
  api.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return api;
}

function baseDeps(overrides: Partial<CampaignDeps> = {}): CampaignDeps {
  return {
    db: () => ({ from: () => chainList([]) }) as never,
    clock: () => new Date('2026-06-15T18:00:00.000Z'),
    adapter: () =>
      ({
        name: 'mock',
        checkLookupSupport: async () => ({ supported: true }),
      }) as never,
    sendMessage: vi.fn(),
    sendRecoverySMS: vi.fn(),
    processDeferredRecoveries: vi.fn(async () => ({
      sent: 0,
      deferred: 0,
      errors: 0,
    })),
    isPhoneSuppressed: async () => false,
    SuppressionLookupError: class extends Error {},
    getTemplate: () => 'hi',
    uuid: () => 'u',
    sleep: async () => undefined,
    notifyUnresolvedTimezone: async () => true,
    ...overrides,
  } as CampaignDeps;
}

describe('processDue deferred recovery isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues cron when processDeferredRecoveries throws', async () => {
    const deps = baseDeps({
      processDeferredRecoveries: vi.fn(async () => {
        throw new Error('deferred boom');
      }),
    });
    const r = await processDueCampaignsWithDeps(deps);
    expect(r.processed).toBe(0);
    expect(r.messagingProvider).toBe('mock');
  });
});
