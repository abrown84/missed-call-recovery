/**
 * Targeted killers for campaign-runtime Stryker survivors (honest scope).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReconcileViaSend = vi.fn(async () => ({
  unknownCount: 0,
  stuckSendingCount: 0,
  requeued: 0,
  confirmed: 0,
  parked: 0,
  needsReview: 0,
  alert: false,
}));

vi.mock('@/services/send', async () => {
  const actual = await vi.importActual<typeof import('@/services/send')>(
    '@/services/send'
  );
  return {
    ...actual,
    reconcileAmbiguousSms: ((...a: unknown[]) =>
      mockReconcileViaSend(...(a as []))) as typeof mockReconcileViaSend,
    resolveRecoveryOutcome: vi.fn(async () => 'absent'),
  };
});

import type { CampaignDeps } from './campaign-deps';
import {
  sendCampaignSMSWithDeps,
  processDueCampaignsWithDeps,
  listClaimableEnrollmentIdsWithDeps,
} from './campaign-runtime';
import { SuppressionLookupError } from './suppressions';

const FIXED = new Date('2026-06-15T12:00:00.000Z');

function baseDeps(overrides: Partial<CampaignDeps> = {}): CampaignDeps {
  return {
    db: () => ({ from: vi.fn() }) as any,
    clock: () => FIXED,
    adapter: () =>
      ({
        name: 'mock',
        checkLookupSupport: async () => ({ supported: true }),
      }) as any,
    sendMessage: vi.fn() as any,
    sendRecoverySMS: vi.fn() as any,
    processDeferredRecoveries: vi.fn(async () => ({
      sent: 0,
      deferred: 0,
      errors: 0,
    })) as any,
    isPhoneSuppressed: vi.fn(async () => false),
    SuppressionLookupError,
    getTemplate: (_k, v) => `${v.business}:${v.issue}:${v.name}`,
    uuid: () => 'u',
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('campaign-runtime survivor killers', () => {
  beforeEach(() => {
    mockReconcileViaSend.mockClear();
  });

  it('null enrollment: optional chaining must not throw; returns fail', async () => {
    const deps = baseDeps({
      db: () =>
        ({
          from: () => {
            const b: any = {};
            for (const m of ['select', 'eq', 'order']) {
              b[m] = vi.fn(() => b);
            }
            b.single = vi.fn(async () => ({ data: null, error: null }));
            b.then = (resolve: any, reject?: any) =>
              Promise.resolve({ data: null, error: null }).then(resolve, reject);
            return b;
          },
        }) as any,
    });
    // Mutating lead?.businesses → lead.businesses throws when lead is null.
    await expect(
      sendCampaignSMSWithDeps(deps, 'missing', 'tok')
    ).resolves.toBe(false);
  });

  it('non-SuppressionLookupError from isPhoneSuppressed rethrows (else branch)', async () => {
    const deps = baseDeps({
      isPhoneSuppressed: vi.fn(async () => {
        throw new Error('network');
      }),
      db: () =>
        ({
          from: (table: string) => {
            const b: any = {};
            for (const m of ['select', 'eq', 'order']) {
              b[m] = vi.fn(() => b);
            }
            b.single = vi.fn(async () => ({
              data: {
                id: 'e',
                claim_token: 'tok',
                current_step: 1,
                leads: {
                  id: 'L',
                  caller_phone: '+12135550100',
                  opted_out: false,
                  issue: 'x',
                  timezone: 'America/Los_Angeles',
                  businesses: {
                    id: 'B',
                    name: 'Acme',
                    timezone: 'America/Los_Angeles',
                  },
                },
                campaigns: { id: 'C', name: 'Standard' },
              },
              error: null,
            }));
            b.then = (resolve: any, reject?: any) => {
              if (table === 'campaign_steps') {
                return Promise.resolve({
                  data: [
                    { step_number: 1, delay_minutes: 0, template_key: 'a' },
                  ],
                  error: null,
                }).then(resolve, reject);
              }
              return Promise.resolve({ data: null, error: null }).then(
                resolve,
                reject
              );
            };
            return b;
          },
        }) as any,
    });
    await expect(sendCampaignSMSWithDeps(deps, 'e', 'tok')).rejects.toThrow(
      'network'
    );
  });

  it('orders steps ascending:true (not false / empty options)', async () => {
    const orderArgs: unknown[] = [];
    const deps = baseDeps({
      db: () =>
        ({
          from: (table: string) => {
            const b: any = {};
            for (const m of ['select', 'eq', 'update']) {
              b[m] = vi.fn(() => b);
            }
            b.order = vi.fn((...a: unknown[]) => {
              orderArgs.push(a);
              return b;
            });
            b.single = vi.fn(async () => ({
              data: {
                id: 'e',
                claim_token: 'tok',
                current_step: 1,
                leads: {
                  id: 'L',
                  caller_phone: '+12135550100',
                  opted_out: false,
                  issue: 'x',
                  timezone: null,
                  businesses: {
                    id: 'B',
                    name: 'Acme',
                    timezone: 'UTC',
                  },
                },
                campaigns: { id: 'C', name: 'Standard' },
              },
              error: null,
            }));
            b.then = (resolve: any, reject?: any) => {
              if (table === 'campaign_steps') {
                return Promise.resolve({
                  data: [
                    { step_number: 2, delay_minutes: 10, template_key: 'b' },
                    { step_number: 1, delay_minutes: 0, template_key: 'a' },
                  ],
                  error: null,
                }).then(resolve, reject);
              }
              // advanceEnrollment ownership hit
              return Promise.resolve({
                data: [{ id: 'e' }],
                error: null,
              }).then(resolve, reject);
            };
            return b;
          },
        }) as any,
      sendMessage: vi.fn(async () => ({
        kind: 'blocked',
        reason: 'sends_disabled',
      })) as any,
    });
    // release path still fetches steps (order) before send
    await sendCampaignSMSWithDeps(deps, 'e', 'tok');
    expect(orderArgs.length).toBeGreaterThan(0);
    expect(orderArgs.some((a) => (a as any[])[1]?.ascending === true)).toBe(
      true
    );
    expect(orderArgs.every((a) => (a as any[])[1]?.ascending !== false)).toBe(
      true
    );
  });

  it('processDue empty ids returns early (no sleep); checkLookupSupport probed', async () => {
    const checkLookupSupport = vi.fn(async () => ({ supported: false }));
    const sleep = vi.fn(async () => undefined);
    const deferred = vi.fn(async () => ({ sent: 0, deferred: 0, errors: 0 }));
    const deps = baseDeps({
      sleep,
      processDeferredRecoveries: deferred as any,
      adapter: () =>
        ({
          name: 'dry',
          checkLookupSupport,
        }) as any,
      db: () =>
        ({
          from: () => {
            const b: any = {};
            for (const m of [
              'select',
              'eq',
              'lte',
              'lt',
              'is',
              'order',
              'limit',
              'in',
              'like',
              'update',
            ]) {
              b[m] = vi.fn(() => b);
            }
            b.then = (resolve: any, reject?: any) =>
              Promise.resolve({ data: [], error: null }).then(resolve, reject);
            return b;
          },
        }) as any,
    });
    const result = await processDueCampaignsWithDeps(deps);
    expect(result.processed).toBe(0);
    expect(result.messagingProvider).toBe('dry');
    expect(result.relayLookupSupported).toBe(false);
    expect(checkLookupSupport).toHaveBeenCalled();
    expect(deferred).toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(mockReconcileViaSend).toHaveBeenCalled();
  });

  it('processDue send throw parks enrollment via processDueErrorParkPayload', async () => {
    const updates: unknown[] = [];
    const enrollmentSelects: string[] = [];
    const deps = baseDeps({
      sleep: vi.fn(async () => undefined),
      adapter: () => ({ name: 'mock' }) as any, // no checkLookupSupport
      db: () =>
        ({
          from: (table: string) => {
            const b: any = {};
            for (const m of [
              'select',
              'eq',
              'lte',
              'lt',
              'is',
              'or',
              'in',
              'like',
              'order',
              'limit',
              'single',
              'maybeSingle',
            ]) {
              b[m] = vi.fn(() => b);
            }
            b.update = vi.fn((payload: unknown) => {
              updates.push(payload);
              return b;
            });
            b.then = (resolve: any, reject?: any) => {
              if (table === 'sms_messages') {
                return Promise.resolve({ data: [], error: null }).then(
                  resolve,
                  reject
                );
              }
              if (table === 'campaign_enrollments') {
                // listClaimable uses select+limit (no update); claim uses update
                const isList = updates.length === 0 && enrollmentSelects.length < 2;
                if (isList) {
                  enrollmentSelects.push('list');
                  return Promise.resolve({
                    data:
                      enrollmentSelects.length === 1
                        ? [{ id: 'enr-boom' }]
                        : [],
                    error: null,
                  }).then(resolve, reject);
                }
                return Promise.resolve({
                  data: [{ id: 'enr-boom', claim_token: 'u' }],
                  error: null,
                }).then(resolve, reject);
              }
              return Promise.resolve({ data: [], error: null }).then(
                resolve,
                reject
              );
            };
            b.single = vi.fn(async () => {
              throw new Error('boom-send-path');
            });
            return b;
          },
        }) as any,
    });
    const result = await processDueCampaignsWithDeps(deps);
    expect(result.errors).toBeGreaterThan(0);
    expect(
      updates.some(
        (u) =>
          u &&
          typeof u === 'object' &&
          'next_send_at' in (u as object) &&
          (u as { claim_token?: unknown }).claim_token === null
      )
    ).toBe(true);
  });

  it('getTemplate name is exactly empty string (not Stryker filler)', async () => {
    let nameSeen: string | undefined;
    const deps = baseDeps({
      getTemplate: (_k, v) => {
        nameSeen = v.name;
        return 'body';
      },
      sendMessage: vi.fn(async () => ({
        kind: 'blocked',
        reason: 'sends_disabled',
      })) as any,
      db: () =>
        ({
          from: (table: string) => {
            const b: any = {};
            for (const m of ['select', 'eq', 'order', 'update']) {
              b[m] = vi.fn(() => b);
            }
            b.single = vi.fn(async () => ({
              data: {
                id: 'e',
                claim_token: 'tok',
                current_step: 1,
                leads: {
                  id: 'L',
                  caller_phone: '+12135550100',
                  opted_out: false,
                  issue: 'leak',
                  timezone: 'UTC',
                  businesses: { id: 'B', name: 'Acme', timezone: 'UTC' },
                },
                campaigns: { id: 'C', name: 'Standard' },
              },
              error: null,
            }));
            b.then = (resolve: any, reject?: any) => {
              if (table === 'campaign_steps') {
                return Promise.resolve({
                  data: [
                    { step_number: 1, delay_minutes: 0, template_key: 'a' },
                  ],
                  error: null,
                }).then(resolve, reject);
              }
              return Promise.resolve({
                data: [{ id: 'e' }],
                error: null,
              }).then(resolve, reject);
            };
            return b;
          },
        }) as any,
    });
    await sendCampaignSMSWithDeps(deps, 'e', 'tok');
    expect(nameSeen).toBe('');
  });

  it('listClaimableEnrollmentIds limit default slices correctly', async () => {
    let dueDone = false;
    const deps = baseDeps({
      db: () =>
        ({
          from: () => {
            const b: any = {};
            let kind: 'due' | 'stale' | null = null;
            for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
              b[m] = vi.fn(() => b);
            }
            b.lte = vi.fn(() => {
              kind = 'due';
              return b;
            });
            b.lt = vi.fn(() => {
              kind = 'stale';
              return b;
            });
            b.then = (resolve: any, reject?: any) => {
              const data =
                kind === 'due' || (!dueDone && kind === null)
                  ? (() => {
                      dueDone = true;
                      return Array.from({ length: 3 }, (_, i) => ({
                        id: `d${i}`,
                      }));
                    })()
                  : Array.from({ length: 3 }, (_, i) => ({ id: `s${i}` }));
              return Promise.resolve({ data, error: null }).then(
                resolve,
                reject
              );
            };
            return b;
          },
        }) as any,
    });
    const ids = await listClaimableEnrollmentIdsWithDeps(deps, 4);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids[0]).toBe('d0');
    expect(ids.length).toBeLessThanOrEqual(4);
  });
});
