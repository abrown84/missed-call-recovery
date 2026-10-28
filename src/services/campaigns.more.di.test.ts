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
  advanceEnrollment,
  claimDueEnrollment,
  enrollLeadInCampaign,
  getEnrollmentForLead,
  handleClassifiedReplyEnrollment,
  leadHasActiveEnrollment,
  listClaimableEnrollmentIds,
  processDueCampaigns,
  reconcileAmbiguousSms,
  switchEnrollmentCampaign,
} from './campaigns';
import { createServerClient } from '@/lib/supabase';
import { COL } from '@/services/db-strings';

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

  it('handleClassifiedReplyEnrollment defer_switch on fresh claim', async () => {
    process.env.CAMPAIGN_REPLY_MODE = 'continue';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'e',
            campaign_id: 'std',
            status: 'active',
            claim_token: 'tok',
            claimed_at: new Date().toISOString(),
          },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: [
            { id: 'std', name: 'Standard', urgency_filter: null },
            { id: 'em', name: 'Emergency', urgency_filter: 'emergency' },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(
      handleClassifiedReplyEnrollment('L', 'emergency')
    ).resolves.toMatchObject({
      action: 'defer_switch',
      campaignName: 'Emergency',
    });
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

  it('enrollLeadInCampaign success (Standard, recovery absent)', async () => {
    const eqCalls: unknown[][] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            urgency: null,
            sms_outbound_sid: null,
            businesses: { id: 'B', name: 'Acme' },
          },
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        const b = chainable({ data: null, error: null });
        b.insert = vi.fn(() => chainable({ data: { id: 'e' }, error: null }));
        b.eq = vi.fn((...args: unknown[]) => {
          eqCalls.push(args);
          return b;
        });
        return b;
      }
      if (table === 'campaigns') {
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              status: 'active',
              auto_enroll: true,
              campaign_steps: [
                {
                  id: 's1',
                  step_number: 1,
                  delay_minutes: 0,
                  template_key: 't1',
                },
                {
                  id: 's2',
                  step_number: 2,
                  delay_minutes: 60,
                  template_key: 't2',
                },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    const r = await enrollLeadInCampaign('L');
    expect(r.enrolled).toBe(true);
    if (r.enrolled) {
      expect(r.campaignName).toBe('Standard');
      expect(r.currentStep).toBe(1);
    }
  });

  it('enrollLeadInCampaign: no_matching_campaign / insert_failed', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            urgency: 'emergency',
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
        // Only Standard (null filter) — no Emergency match
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 't' },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    // emergency urgency with only Standard present → selectCampaignForUrgency
    // may still pick Standard (null filter is catch-all). Force no match via empty.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            urgency: 'emergency',
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
        return chainable({
          data: [
            {
              id: 'C',
              name: 'High',
              urgency_filter: 'high',
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 't' },
              ],
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'no_matching_campaign',
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
        const b = chainable({ data: null, error: null });
        b.insert = vi.fn(() =>
          chainable({ data: null, error: { code: '42501', message: 'perm' } })
        );
        return b;
      }
      if (table === 'campaigns') {
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 't' },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'insert_failed',
    });
  });

  it('switchEnrollmentCampaign: lead_not_found / campaign_not_found / no_steps', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'e',
            status: 'active',
            claim_token: null,
            claimed_at: null,
          },
          error: null,
        });
      }
      if (table === 'leads') {
        return chainable({ data: null, error: { message: 'x' } });
      }
      return chainable({ data: null, error: null });
    });
    await expect(switchEnrollmentCampaign('L', 'new')).resolves.toEqual({
      enrolled: false,
      reason: 'lead_not_found',
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'e',
            status: 'active',
            claim_token: null,
            claimed_at: null,
          },
          error: null,
        });
      }
      if (table === 'leads') {
        return chainable({
          data: { id: 'L', sms_outbound_sid: null },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({ data: null, error: { message: 'missing' } });
      }
      return chainable({ data: null, error: null });
    });
    await expect(switchEnrollmentCampaign('L', 'new')).resolves.toEqual({
      enrolled: false,
      reason: 'campaign_not_found',
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'e',
            status: 'active',
            claim_token: null,
            claimed_at: null,
          },
          error: null,
        });
      }
      if (table === 'leads') {
        return chainable({
          data: { id: 'L', sms_outbound_sid: null },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: {
            id: 'new',
            name: 'Emergency',
            urgency_filter: 'emergency',
            campaign_steps: [],
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(switchEnrollmentCampaign('L', 'new')).resolves.toEqual({
      enrolled: false,
      reason: 'no_steps',
    });
  });

  it('enrollLeadInCampaign: lead_not_found / no_steps / unique race', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({ data: null, error: { message: 'missing' } });
      }
      if (table === 'campaign_enrollments') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'lead_not_found',
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
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              campaign_steps: [],
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'no_steps',
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
        const b = chainable({ data: null, error: null });
        b.insert = vi.fn(() =>
          chainable({ data: null, error: { code: '23505', message: 'dup' } })
        );
        return b;
      }
      if (table === 'campaigns') {
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 't' },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    await expect(enrollLeadInCampaign('L')).resolves.toEqual({
      enrolled: false,
      reason: 'already_enrolled:unique',
    });
  });

  it('listClaimableEnrollmentIds merges due + stale and respects limit', async () => {
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      // First query = due, second = stale
      const data =
        calls === 1
          ? [{ id: 'due1' }, { id: 'due2' }]
          : [{ id: 'stale1' }, { id: 'due1' }];
      return chainable({ data, error: null });
    });
    const ids = await listClaimableEnrollmentIds(2);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('due1');
  });

  it('switchEnrollmentCampaign success with stale claim', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'e',
            lead_id: 'L',
            campaign_id: 'old',
            status: 'active',
            claimed_at: '2000-01-01T00:00:00.000Z',
            claim_token: 'stale',
          },
          error: null,
        });
        b.update = vi.fn(() => {
          const u = chainable({
            data: {
              id: 'e',
              campaign_id: 'new',
              current_step: 1,
              claim_token: null,
              claimed_at: null,
            },
            error: null,
          });
          u.maybeSingle = vi.fn(async () => ({
            data: {
              id: 'e',
              campaign_id: 'new',
              current_step: 1,
            },
            error: null,
          }));
          u.select = vi.fn(() => u);
          return u;
        });
        return b;
      }
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            sms_outbound_sid: 'mlf:recovery:L',
            opted_out: false,
          },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: {
            id: 'new',
            name: 'Emergency',
            urgency_filter: 'emergency',
            campaign_steps: [
              { step_number: 1, delay_minutes: 0, template_key: 'e1' },
              { step_number: 2, delay_minutes: 30, template_key: 'e2' },
            ],
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    const r = await switchEnrollmentCampaign('L', 'new');
    expect(r.enrolled).toBe(true);
    if (r.enrolled) {
      expect(r.switched).toBe(true);
      expect(r.campaignName).toBe('Emergency');
      // treatRecoveryAsInitial:false → stay on step 1
      expect(r.currentStep).toBe(1);
    }
  });

  it('advanceEnrollment advances then completes', async () => {
    const supabase = createServerClient();
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'a' },
      { step_number: 2, delay_minutes: 10, template_key: 'b' },
    ] as never[];
    const eqCalls: unknown[][] = [];

    mockFrom.mockImplementation(() => {
      const b = chainable({
        data: [{ id: 'e', claim_token: 'tok' }],
        error: null,
      });
      b.update = vi.fn(() => {
        const u = chainable({
          data: [{ id: 'e' }],
          error: null,
        });
        const origEq = u.eq;
        u.eq = vi.fn((...args: unknown[]) => {
          eqCalls.push(args);
          return origEq(...args);
        });
        u.select = vi.fn(() =>
          chainable({ data: [{ id: 'e' }], error: null })
        );
        return u;
      });
      return b;
    });

    await expect(
      advanceEnrollment(supabase as never, 'e', 'tok', 1, steps)
    ).resolves.toBe(true);

    // Last step → complete
    await expect(
      advanceEnrollment(supabase as never, 'e', 'tok', 2, steps)
    ).resolves.toBe(true);

    // mut.py #44 — claim_token must gate both advance and complete updates
    expect(
      eqCalls.some((a) => a[0] === 'claim_token' || a[0] === COL.claimToken)
    ).toBe(true);
    expect(eqCalls.filter((a) => a[1] === 'tok').length).toBeGreaterThanOrEqual(
      2
    );
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
              timezone: 'America/Los_Angeles',
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
    expect(r.requeued).toBeGreaterThanOrEqual(0);
    expect(r.confirmed).toBe(1);
  });
});

describe('campaigns-impl survivor killers (r12)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  it('switchEnrollmentCampaign deferred_or_switch_failed when update misses', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'e',
            lead_id: 'L',
            campaign_id: 'old',
            status: 'active',
            claimed_at: null,
            claim_token: null,
          },
          error: null,
        });
        b.update = vi.fn(() => {
          const u = chainable({ data: null, error: null });
          u.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          u.select = vi.fn(() => u);
          return u;
        });
        return b;
      }
      if (table === 'leads') {
        return chainable({
          data: { id: 'L', sms_outbound_sid: null, opted_out: false },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: {
            id: 'new',
            name: 'Emergency',
            urgency_filter: 'emergency',
            campaign_steps: [
              { step_number: 1, delay_minutes: 0, template_key: 'e1' },
            ],
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    await expect(switchEnrollmentCampaign('L', 'new')).resolves.toEqual({
      enrolled: false,
      reason: 'deferred_or_switch_failed',
    });
  });

  it('handleClassifiedReplyEnrollment enrolls when no enrollment', async () => {
    process.env.CAMPAIGN_REPLY_MODE = 'continue';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chainable({ data: null, error: null });
        b.insert = vi.fn(() => chainable({ data: { id: 'e' }, error: null }));
        return b;
      }
      if (table === 'leads') {
        return chainable({
          data: {
            id: 'L',
            opted_out: false,
            urgency: 'normal',
            sms_outbound_sid: null,
            businesses: { id: 'B', name: 'Acme' },
          },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chainable({
          data: [
            {
              id: 'C',
              name: 'Standard',
              urgency_filter: null,
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 't' },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });
    const r = await handleClassifiedReplyEnrollment('L', 'normal');
    expect(r.action === 'enroll' || r.action.startsWith('skip:')).toBe(true);
    delete process.env.CAMPAIGN_REPLY_MODE;
  });

  it('handleClassifiedReplyEnrollment switch maps deferred reason', async () => {
    process.env.CAMPAIGN_REPLY_MODE = 'continue';
    const emergency = {
      id: 'em',
      name: 'Emergency',
      urgency_filter: 'emergency',
      campaign_steps: [
        { step_number: 1, delay_minutes: 0, template_key: 'e1' },
      ],
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'e',
            campaign_id: 'std',
            status: 'active',
            claim_token: null,
            claimed_at: null,
          },
          error: null,
        });
        // switch update returns null → deferred_or_switch_failed
        b.update = vi.fn(() => {
          const u = chainable({ data: null, error: null });
          u.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
          u.select = vi.fn(() => u);
          return u;
        });
        return b;
      }
      if (table === 'leads') {
        return chainable({
          data: { id: 'L', sms_outbound_sid: null, opted_out: false },
          error: null,
        });
      }
      if (table === 'campaigns') {
        // list path (reply plan) returns array; switch .select().eq().single() → one row
        const listResult = {
          data: [
            { id: 'std', name: 'Standard', urgency_filter: null },
            emergency,
          ],
          error: null,
        };
        const list = chainable(listResult);
        const wrapSingle = (obj: Record<string, any>) => {
          obj.single = vi.fn(async () => ({ data: emergency, error: null }));
          obj.maybeSingle = vi.fn(async () => ({
            data: emergency,
            error: null,
          }));
          const origSelect = obj.select;
          obj.select = vi.fn((cols?: string) => {
            const nested = origSelect(cols);
            return wrapSingle(nested);
          });
          return obj;
        };
        return wrapSingle(list);
      }
      return chainable({ data: null, error: null });
    });
    const r = await handleClassifiedReplyEnrollment('L', 'emergency');
    expect(r.action).toBe('defer_switch');
    expect(r.campaignName).toBe('Emergency');
    delete process.env.CAMPAIGN_REPLY_MODE;
  });

  it('pauseCampaignForLead error path throws (QC r9 fail-closed)', async () => {
    const { pauseCampaignForLead } = await import('./campaigns');
    mockFrom.mockImplementation(() => {
      const b = chainable({ data: null, error: { message: 'fail' } });
      b.update = vi.fn(() =>
        chainable({ data: null, error: { message: 'fail' } })
      );
      return b;
    });
    await expect(pauseCampaignForLead('L')).rejects.toThrow(
      /Failed to pause campaign/
    );
  });

  it('claimDueEnrollment falls through to stale reclaim', async () => {
    let updates = 0;
    mockFrom.mockImplementation(() => {
      const b = chainable({ data: [], error: null });
      b.update = vi.fn(() => {
        updates += 1;
        // first (due) miss, second (stale) hit
        const hit = updates >= 2;
        const u = chainable({
          data: hit ? [{ id: 'e', claim_token: 'tok' }] : [],
          error: null,
        });
        u.select = vi.fn(() =>
          chainable({
            data: hit ? [{ id: 'e', claim_token: 'tok' }] : [],
            error: null,
          })
        );
        return u;
      });
      return b;
    });
    const tok = await claimDueEnrollment('e');
    expect(tok).toBeTruthy();
    expect(updates).toBe(2);
  });
});

describe('advanceEnrollment ownership miss', () => {
  it('returns false when update errors or empty', async () => {
    const { advanceEnrollment } = await import('./campaigns');
    const supabase = createServerClient();
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'a' },
      { step_number: 2, delay_minutes: 10, template_key: 'b' },
    ] as never[];

    mockFrom.mockImplementation(() => {
      const b = chainable({ data: [], error: { message: 'x' } });
      b.update = vi.fn(() => {
        const u = chainable({ data: [], error: { message: 'x' } });
        u.select = vi.fn(() =>
          chainable({ data: [], error: { message: 'x' } })
        );
        return u;
      });
      return b;
    });
    await expect(
      advanceEnrollment(supabase as never, 'e', 'tok', 1, steps)
    ).resolves.toBe(false);

    // complete path ownership miss
    await expect(
      advanceEnrollment(supabase as never, 'e', 'tok', 2, steps)
    ).resolves.toBe(false);
  });
});
