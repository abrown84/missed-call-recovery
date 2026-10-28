import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const handleClassifiedReplyEnrollment = vi.fn();
const pauseCampaignForLead = vi.fn();
const escalateLead = vi.fn();
const notifyPossibleOptOut = vi.fn();
const classifyUrgency = vi.fn();
const markLeadOptedOut = vi.fn();
const suppressPhoneForBusiness = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock('@/services/campaigns', () => ({
  handleClassifiedReplyEnrollment: (...args: unknown[]) =>
    handleClassifiedReplyEnrollment(...args),
  pauseCampaignForLead: (...args: unknown[]) => pauseCampaignForLead(...args),
  leadHasActiveEnrollment: async () => false,
}));

vi.mock('@/services/escalation', () => ({
  escalateLead: (...args: unknown[]) => escalateLead(...args),
  notifyPossibleOptOut: (...args: unknown[]) => notifyPossibleOptOut(...args),
}));

vi.mock('@/services/suppressions', () => ({
  markLeadOptedOut: (...args: unknown[]) => markLeadOptedOut(...args),
  suppressPhoneForBusiness: (...args: unknown[]) =>
    suppressPhoneForBusiness(...args),
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

describe('processInboundSms QC r2', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    handleClassifiedReplyEnrollment.mockReset();
    pauseCampaignForLead.mockReset();
    escalateLead.mockReset();
    notifyPossibleOptOut.mockReset();
    classifyUrgency.mockReset();
    markLeadOptedOut.mockReset();
    suppressPhoneForBusiness.mockReset();
    pauseCampaignForLead.mockResolvedValue(undefined);
    escalateLead.mockResolvedValue(undefined);
    notifyPossibleOptOut.mockResolvedValue(true);
    markLeadOptedOut.mockResolvedValue(undefined);
    suppressPhoneForBusiness.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it('records STOP even when no recent lead (after 7 days)', async () => {
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
      // No lead for this phone (age cutoff / none)
      if (table === 'leads') return thenable({ data: null, error: null });
      if (table === 'sms_messages') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });

    const result = await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'STOP',
      messageId: 'msg-stop-old',
    });

    expect(result).toEqual({ status: 'opt_out_recorded' });
    expect(suppressPhoneForBusiness).toHaveBeenCalledWith(
      'biz-1',
      '+15551234567',
      'opt_out'
    );
    expect(handleClassifiedReplyEnrollment).not.toHaveBeenCalled();
  });

  it('switches to Emergency on urgent reply', async () => {
    const lead = {
      id: 'lead-em',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'pending',
      urgency: null,
      created_at: new Date().toISOString(),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return thenable({
          data: {
            id: 'biz-1',
            phone: '+15559999999',
            name: 'Acme',
            vertical: 'plumbing',
          },
          error: null,
        });
      }
      if (table === 'leads') {
        const obj = thenable({ data: lead, error: null });
        obj.update = vi.fn(() => thenable({ data: lead, error: null }));
        return obj;
      }
      if (table === 'sms_messages') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });
    classifyUrgency.mockResolvedValue({
      urgency: 'emergency',
      confidence: 0.9,
      keywords: [],
      issue: 'flood',
    });
    handleClassifiedReplyEnrollment.mockResolvedValue({
      action: 'switch',
      campaignName: 'Emergency Follow-up',
    });

    const result = await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'Emergency flood!',
      messageId: 'msg-1',
    });

    expect(result).toMatchObject({
      status: 'processed',
      enrollmentAction: 'switch',
      enrolledCampaign: 'Emergency Follow-up',
    });
  });
});
