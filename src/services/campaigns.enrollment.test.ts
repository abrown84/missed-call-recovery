import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'dry-run',
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    lookupByIdempotencyKey: vi.fn().mockResolvedValue({ found: false }),
  }),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...args: unknown[]) => isPhoneSuppressed(...args),
  SuppressionLookupError: class SuppressionLookupError extends Error {},
}));

import {
  advanceEnrollment,
  claimDueEnrollment,
  enrollLeadInCampaign,
  sendCampaignSMS,
  switchEnrollmentCampaign,
} from './campaigns';
import { campaignStepMessageSid } from './campaign-logic';

type Row = Record<string, unknown>;

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
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.select = vi.fn(() => {
    const nested = chainable(result);
    nested.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('enrollLeadInCampaign Standard at missed-call', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });
  afterEach(() => vi.clearAllMocks());

  it('enrolls Standard skipping initial when recovery already sent', async () => {
    const lead = {
      id: 'lead-1',
      urgency: null,
      opted_out: false,
      sms_outbound_sid: 'recovery:lead-1',
      businesses: { id: 'biz-1', name: 'Acme' },
    };
    const campaigns = [
      {
        id: 'camp-em',
        name: 'Emergency Follow-up',
        urgency_filter: 'emergency',
        campaign_steps: [
          { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
          { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
        ],
      },
      {
        id: 'camp-std',
        name: 'Standard Follow-up',
        urgency_filter: null,
        campaign_steps: [
          { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
          { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
        ],
      },
    ];
    const inserted: Row[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') return chainable({ data: lead, error: null });
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: null, error: null });
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.insert = vi.fn((row: Row) => {
          inserted.push(row);
          return chainable({ data: row, error: null });
        });
        return builder;
      }
      if (table === 'campaigns') return chainable({ data: campaigns, error: null });
      return chainable({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('lead-1');
    expect(result.enrolled).toBe(true);
    if (!result.enrolled) return;
    expect(result.campaignName).toBe('Standard Follow-up');
    expect(result.currentStep).toBe(2);
    expect(inserted[0]?.campaign_id).toBe('camp-std');
  });
});

describe('claim ownership on post-send advance', () => {
  it('advanceEnrollment fails when claim_token mismatches (pause mid-send)', async () => {
    const supabase = {
      from: () => {
        const builder = chainable({ data: [], error: null });
        builder.update = vi.fn(() => {
          const u = chainable({ data: [], error: null });
          u.select = vi.fn(() => chainable({ data: [], error: null }));
          return u;
        });
        return builder;
      },
    } as any;

    const ok = await advanceEnrollment(
      supabase,
      'enr-1',
      'stale-token',
      2,
      [
        { id: 's1', campaign_id: 'c', step_number: 2, delay_minutes: 0, template_key: 'a', created_at: '' },
        { id: 's2', campaign_id: 'c', step_number: 3, delay_minutes: 60, template_key: 'b', created_at: '' },
      ]
    );
    expect(ok).toBe(false);
  });
});

describe('switchEnrollmentCampaign refuses fresh claim', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns deferred_fresh_claim when claimed_at is fresh', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'enr-1',
            lead_id: 'lead-1',
            campaign_id: 'camp-std',
            status: 'active',
            claimed_at: new Date().toISOString(),
            claim_token: 'tok',
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const result = await switchEnrollmentCampaign('lead-1', 'camp-em');
    expect(result).toEqual({
      enrolled: false,
      reason: 'deferred_fresh_claim',
    });
  });
});

describe('sendCampaignSMS campaign-scoped sid after switch', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
    mockSendMessage.mockResolvedValue({ id: 'msg-1', status: 'queued' });
  });

  it('uses campaign id in sid so Emergency step 2 is not a Standard dupe', async () => {
    const enrollmentId = 'enr-1';
    const campEm = 'camp-em';
    const enrollmentRow = {
      id: enrollmentId,
      current_step: 2,
      status: 'active',
      claim_token: 'tok-1',
      leads: {
        id: 'lead-1',
        caller_phone: '+15551234567',
        sms_outbound_sid: 'recovery',
        opted_out: false,
        issue: 'flood',
        businesses: { id: 'b', name: 'Acme', phone: '+1' },
      },
      campaigns: { id: campEm, name: 'Emergency Follow-up' },
    };
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
      { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
      { step_number: 3, delay_minutes: 240, template_key: 'emergency_followup_2' },
    ];
    const inserted: Row[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: enrollmentRow, error: null });
        builder.single = vi.fn(async () => ({
          data: enrollmentRow,
          error: null,
        }));
        builder.update = vi.fn(() => {
          const u = chainable({ data: [{ id: enrollmentId }], error: null });
          u.select = vi.fn(() =>
            chainable({ data: [{ id: enrollmentId }], error: null })
          );
          return u;
        });
        return builder;
      }
      if (table === 'campaign_steps') {
        return chainable({ data: steps, error: null });
      }
      if (table === 'sms_messages') {
        const builder = chainable({ data: null, error: null });
        builder.insert = vi.fn((row: Row) => {
          inserted.push(row);
          return chainable({ data: row, error: null });
        });
        builder.update = vi.fn(() => chainable({ data: null, error: null }));
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const ok = await sendCampaignSMS(enrollmentId, 'tok-1');
    expect(ok).toBe(true);
    expect(inserted[0]?.message_sid).toBe(
      campaignStepMessageSid(enrollmentId, campEm, 2)
    );
    expect(inserted[0]?.message_sid).not.toBe(
      campaignStepMessageSid(enrollmentId, 'camp-std', 2)
    );
  });
});

describe('claimDueEnrollment', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns null when another worker holds the claim', async () => {
    mockFrom.mockImplementation(() => {
      const builder = chainable({ data: [], error: null });
      builder.update = vi.fn(() => {
        const u = chainable({ data: [], error: null });
        u.select = vi.fn(() => chainable({ data: [], error: null }));
        return u;
      });
      return builder;
    });
    await expect(claimDueEnrollment('enr-x')).resolves.toBeNull();
  });
});
