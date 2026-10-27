import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration-style tests for urgency-ordered enrollment and cron idempotency.
 * Supabase and the messaging adapter are mocked — no live SMS, no real DB.
 */

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();

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

import {
  claimDueEnrollment,
  enrollLeadInCampaign,
  processDueCampaigns,
  sendCampaignSMS,
} from './campaigns';

type Row = Record<string, unknown>;

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'lte',
    'in',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  // Terminal resolvers
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = undefined;
  // Make awaitable: supabase query builders are thenable in practice via await on the builder
  // Our code awaits .single() / uses data from update().select() — handle both.
  obj.select = vi.fn((..._cols: unknown[]) => {
    // update().eq().eq().lte().select() returns data directly when awaited in supabase-js
    const nested = chainable(result);
    // When select is the last call after update, returning the result via thenable
    (nested as any).then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  (obj as any).then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('enrollLeadInCampaign (after urgency)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('enrolls an emergency lead into Emergency Follow-up, skipping initial recovery step', async () => {
    const lead = {
      id: 'lead-1',
      urgency: 'emergency',
      sms_outbound_sid: 'recovery-sid-1',
      issue: 'flooding',
      businesses: { id: 'biz-1', name: 'Acme Plumbing' },
    };

    const campaigns = [
      {
        id: 'camp-em',
        name: 'Emergency Follow-up',
        urgency_filter: 'emergency',
        status: 'active',
        auto_enroll: true,
        campaign_steps: [
          { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
          { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
          { step_number: 3, delay_minutes: 240, template_key: 'emergency_followup_2' },
        ],
      },
      {
        id: 'camp-std',
        name: 'Standard Follow-up',
        urgency_filter: null,
        status: 'active',
        auto_enroll: true,
        campaign_steps: [
          { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
          { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
        ],
      },
    ];

    const inserted: Row[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({ data: lead, error: null });
      }
      if (table === 'campaigns') {
        return chainable({ data: campaigns, error: null });
      }
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: null, error: null });
        builder.insert = vi.fn((row: Row) => {
          inserted.push(row);
          return chainable({ data: row, error: null });
        });
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('lead-1');

    expect(result.enrolled).toBe(true);
    if (!result.enrolled) return;
    expect(result.campaignName).toBe('Emergency Follow-up');
    expect(result.campaignId).toBe('camp-em');
    expect(result.skippedInitial).toBe(true);
    expect(result.currentStep).toBe(2);
    expect(inserted[0]).toMatchObject({
      lead_id: 'lead-1',
      campaign_id: 'camp-em',
      current_step: 2,
      status: 'active',
    });
    // Must NOT be Standard
    expect(inserted[0]?.campaign_id).not.toBe('camp-std');
  });

  it('would have enrolled Standard when urgency is still null (documents the old bug)', async () => {
    const lead = {
      id: 'lead-2',
      urgency: null,
      sms_outbound_sid: null,
      businesses: { id: 'biz-1', name: 'Acme' },
    };
    const campaigns = [
      {
        id: 'camp-em',
        name: 'Emergency Follow-up',
        urgency_filter: 'emergency',
        campaign_steps: [
          { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
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
      if (table === 'campaigns') return chainable({ data: campaigns, error: null });
      if (table === 'campaign_enrollments') {
        const builder = chainable({ data: null, error: null });
        builder.insert = vi.fn((row: Row) => {
          inserted.push(row);
          return chainable({ data: row, error: null });
        });
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('lead-2');
    expect(result.enrolled).toBe(true);
    expect(inserted[0]?.campaign_id).toBe('camp-std');
  });
});

describe('processDueCampaigns timing + idempotency', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({ id: 'msg-1', status: 'queued' });
  });

  it('sends a due enrollment (next_send_at 2 minutes ago) via dry-run adapter', async () => {
    const dueAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const enrollmentId = 'enr-due-1';
    const enrollmentRow = {
      id: enrollmentId,
      current_step: 2,
      status: 'active',
      next_send_at: dueAt,
      leads: {
        id: 'lead-due',
        caller_phone: '+15551234567',
        sms_outbound_sid: 'recovery-sid',
        issue: 'no heat',
        businesses: {
          id: 'biz-1',
          name: 'Acme HVAC',
          phone: '+15559999999',
        },
      },
      campaigns: { id: 'camp-hi', name: 'High Priority Follow-up' },
    };
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'high_initial' },
      { step_number: 2, delay_minutes: 120, template_key: 'high_followup_1' },
      { step_number: 3, delay_minutes: 1440, template_key: 'high_followup_2' },
    ];

    const smsInserts: Row[] = [];
    let enrollSelectMode: 'list' | 'single' = 'list';

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const builder: Record<string, any> = {};
        const self = () => builder;
        builder.select = vi.fn((..._a: unknown[]) => {
          // After claim, sendCampaignSMS uses select().eq().single()
          enrollSelectMode = 'single';
          return builder;
        });
        builder.insert = vi.fn(self);
        builder.update = vi.fn(() => builder);
        builder.eq = vi.fn(self);
        builder.lte = vi.fn(self);
        builder.order = vi.fn(self);
        builder.limit = vi.fn(self);
        builder.single = vi.fn(async () => ({
          data: enrollmentRow,
          error: null,
        }));
        builder.maybeSingle = vi.fn(async () => ({
          data: enrollmentRow,
          error: null,
        }));
        builder.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => {
          // list due enrollments OR claim update().select()
          const data =
            enrollSelectMode === 'list'
              ? [{ id: enrollmentId, next_send_at: dueAt }]
              : [{ id: enrollmentId }];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        };
        return builder;
      }
      if (table === 'campaign_steps') {
        return chainable({ data: steps, error: null });
      }
      if (table === 'sms_messages') {
        const builder = chainable({ data: [], error: null });
        builder.insert = vi.fn((row: Row) => {
          smsInserts.push(row);
          return chainable({ data: row, error: null });
        });
        return builder;
      }
      return chainable({ data: null, error: null });
    });

    const started = new Date().toISOString();
    // Exercise send path directly (same code cron uses after claim) for stable mock.
    const claimed = await claimDueEnrollment(enrollmentId);
    expect(claimed).toBe(true);
    const sent = await sendCampaignSMS(enrollmentId);
    const finished = new Date().toISOString();

    expect(sent).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(smsInserts[0]?.message_sid).toBe(
      `campaign:${enrollmentId}:step:2`
    );

    // Also ensure processDueCampaigns reports structured counts.
    enrollSelectMode = 'list';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        return chainable({ data: [], error: null });
      }
      return chainable({ data: null, error: null });
    });
    const empty = await processDueCampaigns();
    expect(empty).toEqual({ processed: 0, errors: 0, skipped: 0 });

    console.log(
      JSON.stringify({
        evidence: 'due_send_within_minutes',
        dueAt,
        started,
        finished,
        lagMs: Date.parse(started) - Date.parse(dueAt),
        providerCall: mockSendMessage.mock.calls[0]?.[0],
        smsInserts,
      })
    );
  });

  it('claimDueEnrollment returns false when another worker already claimed', async () => {
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

  it('sendCampaignSMS skips duplicate step sid (idempotent)', async () => {
    const enrollmentId = 'enr-dup';
    const stepSid = `campaign:${enrollmentId}:step:2`;
    const enrollmentRow = {
      id: enrollmentId,
      current_step: 2,
      status: 'active',
      leads: {
        id: 'lead-dup',
        caller_phone: '+15551234567',
        sms_outbound_sid: 'recovery',
        issue: null,
        businesses: { id: 'b', name: 'Acme', phone: '+1' },
      },
      campaigns: { id: 'camp', name: 'High Priority Follow-up' },
    };
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'high_initial' },
      { step_number: 2, delay_minutes: 120, template_key: 'high_followup_1' },
      { step_number: 3, delay_minutes: 1440, template_key: 'high_followup_2' },
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
        return chainable({
          data: [{ message_sid: stepSid }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const ok = await sendCampaignSMS(enrollmentId);
    expect(ok).toBe(true);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
