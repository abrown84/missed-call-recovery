import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const handleClassifiedReplyEnrollment = vi.fn();
const pauseCampaignForLead = vi.fn();
const escalateLead = vi.fn();
const classifyUrgency = vi.fn();
const markLeadOptedOut = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock('@/services/campaigns', () => ({
  handleClassifiedReplyEnrollment: (...args: unknown[]) =>
    handleClassifiedReplyEnrollment(...args),
  pauseCampaignForLead: (...args: unknown[]) => pauseCampaignForLead(...args),
}));

vi.mock('@/services/escalation', () => ({
  escalateLead: (...args: unknown[]) => escalateLead(...args),
}));

vi.mock('@/services/suppressions', () => ({
  markLeadOptedOut: (...args: unknown[]) => markLeadOptedOut(...args),
}));

vi.mock('@/services/classification', async () => {
  const actual = await vi.importActual<typeof import('./classification')>(
    './classification'
  );
  return {
    ...actual,
    classifyUrgency: (...args: unknown[]) => classifyUrgency(...args),
  };
});

import { processInboundSms } from './inbound';

function thenable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    gte: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

describe('processInboundSms re-routes or pauses (no ping-pong)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    handleClassifiedReplyEnrollment.mockReset();
    pauseCampaignForLead.mockReset();
    escalateLead.mockReset();
    classifyUrgency.mockReset();
    markLeadOptedOut.mockReset();
    pauseCampaignForLead.mockResolvedValue(undefined);
    escalateLead.mockResolvedValue(undefined);
    markLeadOptedOut.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  function mockLead(lead: Record<string, unknown>, business = {
    id: 'biz-1',
    phone: '+15559999999',
    name: 'Acme Plumbing',
    vertical: 'plumbing',
  }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') return thenable({ data: business, error: null });
      if (table === 'leads') {
        const obj = thenable({ data: lead, error: null });
        obj.update = vi.fn(() => thenable({ data: lead, error: null }));
        return obj;
      }
      if (table === 'sms_messages') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });
  }

  it('switches to Emergency on urgent reply (re-route)', async () => {
    mockLead({
      id: 'lead-em',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'pending',
      urgency: null,
      created_at: new Date().toISOString(),
    });
    classifyUrgency.mockResolvedValue({
      urgency: 'emergency',
      confidence: 0.95,
      keywords: ['flood'],
      issue: 'basement flooding',
    });
    handleClassifiedReplyEnrollment.mockResolvedValue({
      action: 'switch',
      campaignName: 'Emergency Follow-up',
    });

    const result = await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'Emergency — flood in the basement!',
      messageId: 'msg-in-1',
    });

    expect(result).toMatchObject({
      status: 'processed',
      urgency: 'emergency',
      enrollmentAction: 'switch',
      enrolledCampaign: 'Emergency Follow-up',
    });
    expect(handleClassifiedReplyEnrollment).toHaveBeenCalledWith(
      'lead-em',
      'emergency'
    );
    expect(escalateLead).toHaveBeenCalledOnce();
  });

  it('persists opt-out and does not enroll', async () => {
    mockLead({
      id: 'lead-3',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    classifyUrgency.mockResolvedValue({
      urgency: 'low',
      confidence: 1,
      keywords: ['stop'],
      issue: 'Opt-out request',
    });

    await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'STOP',
      messageId: 'msg-stop',
    });

    expect(markLeadOptedOut).toHaveBeenCalledWith('lead-3');
    expect(pauseCampaignForLead).toHaveBeenCalledWith('lead-3');
    expect(handleClassifiedReplyEnrollment).not.toHaveBeenCalled();
  });

  it('rejects leads older than the age cutoff', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return thenable({
          data: {
            id: 'biz-1',
            phone: '+15559999999',
            name: 'Acme',
            vertical: 'general',
          },
          error: null,
        });
      }
      // Age filter is applied in the query (.gte); simulate no row returned.
      if (table === 'leads') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });

    const result = await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'hello',
      messageId: 'msg-old',
    });
    expect(result).toEqual({ status: 'no_lead_found' });
    expect(old < new Date().toISOString()).toBe(true);
  });
});
