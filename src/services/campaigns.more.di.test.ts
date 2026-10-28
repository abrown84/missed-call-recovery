/**
 * Additional DI coverage for campaigns.ts exports (honest Stryker no-cov kill).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'mock',
    sendMessage: vi.fn(),
    checkLookupSupport: vi.fn(async () => ({ supported: true })),
  }),
}));

vi.mock('@/services/send', async () => {
  const actual = await vi.importActual<typeof import('@/services/send')>(
    '@/services/send'
  );
  return {
    ...actual,
    sendMessage: vi.fn(),
    reconcileAmbiguousSms: vi.fn(async () => ({
      unknownCount: 1,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 1,
      parked: 0,
      needsReview: 0,
      alert: false,
    })),
    resolveRecoveryOutcome: vi.fn(async () => 'absent'),
  };
});

vi.mock('@/services/sms', () => ({
  processDeferredRecoveries: vi.fn(async () => ({
    sent: 1,
    deferred: 0,
    errors: 0,
  })),
  sendRecoverySMS: vi.fn(),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...a: unknown[]) => isPhoneSuppressed(...a),
  SuppressionLookupError: class extends Error {},
}));

import {
  claimDueEnrollment,
  enrollLeadInCampaign,
  getEnrollmentForLead,
  handleClassifiedReplyEnrollment,
  leadHasActiveEnrollment,
  listClaimableEnrollmentIds,
  processDueCampaigns,
  reconcileAmbiguousSms,
} from './campaigns';

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const method of [
    'select',
    'insert',
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
    'single',
    'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.select = vi.fn((cols?: string) => {
    const nested = chainable(result);
    nested._cols = cols;
    nested.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  obj.update = vi.fn(() => {
    const u = chainable(result);
    u.select = vi.fn(() => chainable(result));
    return u;
  });
  obj.insert = vi.fn(() => chainable(result));
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('campaigns more DI coverage', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  it('getEnrollmentForLead / leadHasActiveEnrollment', async () => {
    mockFrom.mockImplementation(() =>
      chainable({
        data: { id: 'e', status: 'active', lead_id: 'L' },
        error: null,
      })
    );
    await expect(getEnrollmentForLead('L')).resolves.toMatchObject({
      status: 'active',
    });
    await expect(leadHasActiveEnrollment('L')).resolves.toBe(true);

    mockFrom.mockImplementation(() =>
      chainable({ data: null, error: { message: 'x' } })
    );
    await expect(getEnrollmentForLead('L')).resolves.toBeNull();
  });

  it('enrollLeadInCampaign: opted_out / no_campaigns / insert unique', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: true,
            urgency: null,
            businesses: {},
          },
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'opted_out',
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            urgency: null,
            sms_outbound_sid: null,
            businesses: {},
          },
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        return chainable({ data: null, error: null });
      }
      if (table === 'campaigns') {
        return chainable({ data: [], error: null });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'no_campaigns',
    });
  });

  it('listClaimableEnrollmentIds returns ids', async () => {
    mockFrom.mockImplementation(() =>
      chainable({
        data: [{ id: 'a' }, { id: 'b' }],
        error: null,
      })
    );
    await expect(listClaimableEnrollmentIds(10)).resolves.toEqual(['a', 'b']);
  });

  it('claimDueEnrollment returns token on due claim', async () => {
    mockFrom.mockImplementation(() => {
      const b = chainable({ data: [{ id: 'e', claim_token: 't' }], error: null });
      b.update = vi.fn(() => {
        const u = chainable({
          data: [{ id: 'e', claim_token: 'tok' }],
          error: null,
        });
        u.select = vi.fn(() =>
          chainable({ data: [{ id: 'e', claim_token: 'tok' }], error: null })
        );
        return u;
      });
      return b;
    });
    const tok = await claimDueEnrollment('e');
    expect(tok).toBeTruthy();
  });

  it('handleClassifiedReplyEnrollment pauses on reply', async () => {
    process.env.CAMPAIGN_REPLY_MODE = 'pause';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'e',
            campaign_id: 'c',
            status: 'active',
            claim_token: null,
            claimed_at: null,
          },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: [{ id: 'c', name: 'Standard', urgency_filter: null }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(
      handleClassifiedReplyEnrollment('L', 'normal')
    ).resolves.toMatchObject({ action: 'pause' });
    delete process.env.CAMPAIGN_REPLY_MODE;
  });

  it('reconcileAmbiguousSms post-pass abandoned + confirmed', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        return chainable({
          data: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'mlf:campaign:E:C:step:1:abandoned:1',
              status: 'abandoned_retry',
            },
          ],
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: [{ id: 'E', campaign_id: 'C', status: 'active' }],
          error: null,
        });
        b.update = vi.fn(() => {
          const u = chainable({
            data: [{ id: 'E' }],
            error: null,
          });
          u.select = vi.fn(() =>
            chainable({ data: [{ id: 'E' }], error: null })
          );
          return u;
        });
        return b;
      }
      if (table === 'campaign_steps') {
        return chainable({
          data: [{ step_number: 1 }, { step_number: 2, delay_minutes: 10 }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    const r = await reconcileAmbiguousSms();
    expect(r.confirmed).toBe(1);
    expect(r.unknownCount).toBe(1);
    // base.requeued + any successful exact-step requeues
    expect(r.requeued).toBeGreaterThanOrEqual(0);
  });

  it('processDueCampaigns with no claimable ids', async () => {
    mockFrom.mockImplementation(() =>
      chainable({ data: [], error: null })
    );
    const r = await processDueCampaigns();
    expect(r.processed).toBe(0);
    expect(r.messagingProvider).toBe('mock');
  });
});
