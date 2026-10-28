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
  }),
  resetMessagingAdapterCache: vi.fn(),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...args: unknown[]) => isPhoneSuppressed(...args),
}));

import {
  claimDueEnrollment,
  enrollLeadInCampaign,
  sendCampaignSMS,
} from './campaigns';

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

describe('enrollLeadInCampaign at missed-call (null urgency → Standard)', () => {
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
        // getEnrollmentForLead → maybeSingle null
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
    expect(result.skippedInitial).toBe(true);
    expect(inserted[0]?.campaign_id).toBe('camp-std');
  });

  it('refuses to enroll when any past enrollment exists', async () => {
    const lead = {
      id: 'lead-2',
      urgency: 'emergency',
      opted_out: false,
      sms_outbound_sid: 'recovery:lead-2',
      businesses: { id: 'biz-1', name: 'Acme' },
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') return chainable({ data: lead, error: null });
      if (table === 'campaign_enrollments') {
        return chainable({
          data: {
            id: 'enr-old',
            lead_id: 'lead-2',
            status: 'paused',
            campaign_id: 'camp-std',
          },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('lead-2');
    expect(result).toEqual({
      enrolled: false,
      reason: 'already_enrolled:paused',
    });
  });
});

describe('sendCampaignSMS insert-before-send + no auto-resend', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  it('on provider timeout marks unknown and does not requeue the same step', async () => {
    const enrollmentId = 'enr-to';
    const enrollmentRow = {
      id: enrollmentId,
      current_step: 2,
      status: 'active',
      leads: {
        id: 'lead-to',
        caller_phone: '+15551234567',
        sms_outbound_sid: 'recovery',
        opted_out: false,
        issue: null,
        businesses: { id: 'b', name: 'Acme', phone: '+1' },
      },
      campaigns: { id: 'camp', name: 'Standard Follow-up' },
    };
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
      { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
      { step_number: 3, delay_minutes: 1440, template_key: 'standard_followup_2' },
    ];

    const smsUpdates: Row[] = [];
    const enrollUpdates: Row[] = [];

    mockSendMessage.mockRejectedValue(new Error('timeout'));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: enrollmentRow, error: null });
        builder.single = vi.fn(async () => ({
          data: enrollmentRow,
          error: null,
        }));
        builder.update = vi.fn((row: Row) => {
          enrollUpdates.push(row);
          return chainable({ data: null, error: null });
        });
        return builder;
      }
      if (table === 'campaign_steps') {
        return chainable({ data: steps, error: null });
      }
      if (table === 'sms_messages') {
        const builder = chainable({ data: null, error: null });
        builder.insert = vi.fn(() => chainable({ data: null, error: null }));
        builder.update = vi.fn((row: Row) => {
          smsUpdates.push(row);
          return chainable({ data: null, error: null });
        });
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const ok = await sendCampaignSMS(enrollmentId);
    expect(ok).toBe(false);
    expect(smsUpdates.some((u) => u.status === 'unknown')).toBe(true);
    // Advanced to step 3 — not requeued at +60s on same step
    expect(enrollUpdates.some((u) => u.current_step === 3)).toBe(true);
    expect(
      enrollUpdates.some(
        (u) =>
          typeof u.next_send_at === 'string' &&
          u.current_step === undefined &&
          u.status === undefined
      )
    ).toBe(false);
  });

  it('treats duplicate message_sid insert as already sent', async () => {
    const enrollmentId = 'enr-dup';
    const enrollmentRow = {
      id: enrollmentId,
      current_step: 2,
      status: 'active',
      leads: {
        id: 'lead-dup',
        caller_phone: '+15551234567',
        sms_outbound_sid: 'recovery',
        opted_out: false,
        issue: null,
        businesses: { id: 'b', name: 'Acme', phone: '+1' },
      },
      campaigns: { id: 'camp', name: 'Standard Follow-up' },
    };
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
      { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
      { step_number: 3, delay_minutes: 1440, template_key: 'standard_followup_2' },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: enrollmentRow, error: null });
        builder.single = vi.fn(async () => ({
          data: enrollmentRow,
          error: null,
        }));
        builder.update = vi.fn(() => chainable({ data: null, error: null }));
        return builder;
      }
      if (table === 'campaign_steps') {
        return chainable({ data: steps, error: null });
      }
      if (table === 'sms_messages') {
        const builder = chainable({ data: null, error: null });
        builder.insert = vi.fn(() =>
          chainable({ data: null, error: { code: '23505' } })
        );
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const ok = await sendCampaignSMS(enrollmentId);
    expect(ok).toBe(true);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('claimDueEnrollment reclaim', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns false when another worker holds a fresh claim', async () => {
    mockFrom.mockImplementation(() => {
      const builder = chainable({ data: [], error: null });
      builder.update = vi.fn(() => {
        const u = chainable({ data: [], error: null });
        u.select = vi.fn(() => chainable({ data: [], error: null }));
        return u;
      });
      return builder;
    });
    await expect(claimDueEnrollment('enr-x')).resolves.toBe(false);
  });
});
