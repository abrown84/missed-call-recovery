import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const enrollLeadInCampaign = vi.fn();
const leadHasActiveEnrollment = vi.fn();
const pauseCampaignForLead = vi.fn();
const escalateLead = vi.fn();
const classifyUrgency = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock('@/services/campaigns', () => ({
  enrollLeadInCampaign: (...args: unknown[]) => enrollLeadInCampaign(...args),
  leadHasActiveEnrollment: (...args: unknown[]) => leadHasActiveEnrollment(...args),
  pauseCampaignForLead: (...args: unknown[]) => pauseCampaignForLead(...args),
}));

vi.mock('@/services/escalation', () => ({
  escalateLead: (...args: unknown[]) => escalateLead(...args),
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
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

describe('processInboundSms enrolls after urgency classification', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    enrollLeadInCampaign.mockReset();
    leadHasActiveEnrollment.mockReset();
    pauseCampaignForLead.mockReset();
    escalateLead.mockReset();
    classifyUrgency.mockReset();

    leadHasActiveEnrollment.mockResolvedValue(false);
    pauseCampaignForLead.mockResolvedValue(undefined);
    escalateLead.mockResolvedValue(undefined);
    enrollLeadInCampaign.mockResolvedValue({
      enrolled: true,
      campaignId: 'camp-em',
      campaignName: 'Emergency Follow-up',
      currentStep: 2,
      nextSendAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      skippedInitial: true,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('classifies emergency, then enrolls in Emergency — does not pause on first reply', async () => {
    const business = {
      id: 'biz-1',
      phone: '+15559999999',
      name: 'Acme Plumbing',
      vertical: 'plumbing',
    };
    const lead = {
      id: 'lead-em',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'pending',
      urgency: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return thenable({ data: business, error: null });
      }
      if (table === 'leads') {
        const obj = thenable({ data: lead, error: null });
        // update path
        obj.update = vi.fn(() => thenable({ data: lead, error: null }));
        return obj;
      }
      if (table === 'sms_messages') {
        return thenable({ data: null, error: null });
      }
      return thenable({ data: null, error: null });
    });

    classifyUrgency.mockResolvedValue({
      urgency: 'emergency',
      confidence: 0.95,
      keywords: ['flood'],
      issue: 'basement flooding',
    });

    const started = new Date().toISOString();
    const result = await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'Emergency — flood in the basement, need help right now!',
      messageId: 'msg-in-1',
    });
    const finished = new Date().toISOString();

    expect(result).toMatchObject({
      status: 'processed',
      leadId: 'lead-em',
      urgency: 'emergency',
      enrolledCampaign: 'Emergency Follow-up',
    });

    expect(classifyUrgency).toHaveBeenCalledOnce();
    expect(enrollLeadInCampaign).toHaveBeenCalledWith('lead-em');
    expect(pauseCampaignForLead).not.toHaveBeenCalled();
    expect(escalateLead).toHaveBeenCalledOnce();

    console.log(
      JSON.stringify({
        evidence: 'urgent_lead_enrolls_emergency',
        started,
        finished,
        result,
        enrollArgs: enrollLeadInCampaign.mock.calls,
      })
    );
  });

  it('pauses instead of re-enrolling when a campaign is already active', async () => {
    leadHasActiveEnrollment.mockResolvedValue(true);

    const business = {
      id: 'biz-1',
      phone: '+15559999999',
      name: 'Acme',
      vertical: 'general',
    };
    const lead = {
      id: 'lead-2',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'qualified',
      urgency: 'high',
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses') return thenable({ data: business, error: null });
      if (table === 'leads') {
        // pending miss, then qualified hit
        const pendingMiss = thenable({ data: null, error: null });
        pendingMiss.eq = vi.fn((col: string, val: unknown) => {
          if (col === 'status' && val === 'pending') {
            return pendingMiss;
          }
          return pendingMiss;
        });
        // Simpler: always return qualified lead from maybeSingle
        const obj = thenable({ data: lead, error: null });
        obj.update = vi.fn(() => thenable({ data: lead, error: null }));
        return obj;
      }
      if (table === 'sms_messages') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });

    classifyUrgency.mockResolvedValue({
      urgency: 'high',
      confidence: 0.8,
      keywords: [],
      issue: 'still broken',
    });

    await processInboundSms({
      from: '+15551234567',
      businessPhone: '+15559999999',
      body: 'Still broken',
      messageId: 'msg-in-2',
    });

    expect(pauseCampaignForLead).toHaveBeenCalledWith('lead-2');
    expect(enrollLeadInCampaign).not.toHaveBeenCalled();
  });

  it('does not enroll on STOP / opt-out', async () => {
    const business = {
      id: 'biz-1',
      phone: '+15559999999',
      name: 'Acme',
      vertical: 'general',
    };
    const lead = {
      id: 'lead-3',
      business_id: 'biz-1',
      caller_phone: '+15551234567',
      status: 'pending',
      urgency: null,
    };

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

    // classifyUrgency short-circuits via isOptOutMessage inside real classify —
    // but we mocked classifyUrgency, so return low; opt-out is checked on raw body.
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

    expect(enrollLeadInCampaign).not.toHaveBeenCalled();
    expect(pauseCampaignForLead).toHaveBeenCalledWith('lead-3');
  });
});
