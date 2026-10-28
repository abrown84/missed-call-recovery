/**
 * Drive processDueCampaigns + reconcile post-pass branches under mocks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();
const mockCheckSupport = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'mock',
    sendMessage: mockSendMessage,
    checkLookupSupport: (...a: unknown[]) => mockCheckSupport(...a),
  }),
}));

vi.mock('@/services/send', async () => {
  const actual = await vi.importActual<typeof import('@/services/send')>(
    '@/services/send'
  );
  return {
    ...actual,
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    reconcileAmbiguousSms: vi.fn(async () => ({
      unknownCount: 0,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 0,
      parked: 0,
      needsReview: 0,
      alert: false,
    })),
    resolveRecoveryOutcome: vi.fn(async () => 'absent'),
  };
});

vi.mock('@/services/sms', () => ({
  processDeferredRecoveries: vi.fn(async () => ({
    sent: 0,
    deferred: 0,
    errors: 0,
  })),
  sendRecoverySMS: vi.fn(async () => undefined),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: vi.fn(async () => false),
  SuppressionLookupError: class extends Error {},
}));

import {
  listClaimableEnrollmentIds,
  processDueCampaigns,
  reconcileAmbiguousSms,
} from './campaigns';

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const method of [
    'select', 'insert', 'update', 'eq', 'lte', 'lt', 'is', 'or', 'in', 'like',
    'order', 'limit', 'single', 'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.select = vi.fn(() => {
    const nested = chainable(result);
    nested.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  obj.update = vi.fn(() => {
    const u = chainable(result);
    u.select = vi.fn(() => chainable(result));
    return u;
  });
  obj.insert = vi.fn(() => chainable(result));
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('campaigns cron DI', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    mockCheckSupport.mockReset();
    mockCheckSupport.mockResolvedValue({ supported: true });
    // Speed up delay in processDueCampaigns
    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as never;
    }) as typeof setTimeout);
  });

  it('listClaimableEnrollmentIds empty on error', async () => {
    mockFrom.mockImplementation(() =>
      chainable({ data: null, error: { message: 'x' } })
    );
    await expect(listClaimableEnrollmentIds(5)).resolves.toEqual([]);
  });

  it('processDueCampaigns claims and sends', async () => {
    let claimCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        claimCalls += 1;
        // First calls: listClaimable → ids; then claim update; then send fetch
        if (claimCalls <= 2) {
          return chainable({ data: [{ id: 'enr-1' }], error: null });
        }
        const enrollmentRow = {
          id: 'enr-1',
          current_step: 2,
          status: 'active',
          claim_token: 'tok',
          leads: {
            id: 'L',
            caller_phone: '+12135550100',
            opted_out: false,
            issue: '',
            businesses: { id: 'B', name: 'Acme', timezone: 'America/New_York' },
          },
          campaigns: { id: 'C', name: 'Standard' },
        };
        const b = chainable({ data: enrollmentRow, error: null });
        b.single = vi.fn(async () => ({ data: enrollmentRow, error: null }));
        b.update = vi.fn(() => {
          const u = chainable({
            data: [{ id: 'enr-1', claim_token: 'tok' }],
            error: null,
          });
          u.select = vi.fn(() =>
            chainable({
              data: [{ id: 'enr-1', claim_token: 'tok' }],
              error: null,
            })
          );
          return u;
        });
        return b;
      }
      if (table === 'campaign_steps') {
        return chainable({
          data: [
            { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
            { step_number: 2, delay_minutes: 60, template_key: 'standard_followup_1' },
          ],
          error: null,
        });
      }
      return chainable({ data: [], error: null });
    });

    mockSendMessage.mockResolvedValue({
      kind: 'sent',
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });

    const r = await processDueCampaigns();
    expect(r.messagingProvider).toBe('mock');
    expect(r.relayLookupSupported).toBe(true);
  });

  it('reconcileAmbiguousSms recovery abandoned resend path', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        return chainable({
          data: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'mlf:recovery:L:abandoned:99',
              status: 'abandoned_retry',
            },
          ],
          error: null,
        });
      }
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            caller_phone: '+12135550100',
            sms_outbound_sid: 'mlf:recovery:L',
            businesses: {
              id: 'B',
              name: 'Acme',
              timezone: 'America/New_York',
              vertical: 'plumbing',
              settings: {},
            },
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    const r = await reconcileAmbiguousSms();
    expect(r.requeued).toBeGreaterThanOrEqual(1);
  });
});
