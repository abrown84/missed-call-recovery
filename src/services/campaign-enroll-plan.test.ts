import { describe, expect, it } from 'vitest';
import { planEnroll, planSwitch } from './campaign-enroll-plan';

const steps = [
  { step_number: 1, delay_minutes: 0, template_key: 'a' },
  { step_number: 2, delay_minutes: 60, template_key: 'b' },
];

const standard = {
  id: 'C',
  name: 'Standard',
  urgency_filter: null as string | null,
  campaign_steps: steps,
};

describe('planEnroll', () => {
  it('rejects opted_out / no_campaigns / no_matching / no_steps', () => {
    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: true,
        existingStatus: null,
        campaigns: [standard],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'opted_out' });

    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: null,
        campaigns: [],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'no_campaigns' });

    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: null,
        campaigns: [
          {
            id: 'H',
            name: 'High',
            urgency_filter: 'high',
            campaign_steps: steps,
          },
        ],
        campaignError: false,
        urgency: 'emergency',
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'no_matching_campaign' });

    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: null,
        campaigns: [{ ...standard, campaign_steps: [] }],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'no_steps' });
  });

  it('inserts Standard for urgency null', () => {
    const p = planEnroll({
      leadId: 'L',
      leadFound: true,
      optedOut: false,
      existingStatus: null,
      campaigns: [standard],
      campaignError: false,
      urgency: null,
      recoveryState: 'absent',
      smsOutboundSid: null,
    });
    expect(p.type).toBe('insert');
    if (p.type === 'insert') {
      expect(p.result.campaignName).toBe('Standard');
      expect(p.payload.lead_id).toBe('L');
      expect(p.payload.campaign_id).toBe('C');
    }
  });
});

describe('planSwitch', () => {
  it('rejects fresh claim / missing lead / missing campaign / no steps', () => {
    expect(
      planSwitch({
        hasEnrollment: true,
        freshClaim: true,
        leadFound: true,
        campaignFound: true,
        campaign: {
          id: 'E',
          name: 'Emergency',
          urgency_filter: 'emergency',
          campaign_steps: steps,
        },
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'deferred_fresh_claim' });

    expect(
      planSwitch({
        hasEnrollment: true,
        freshClaim: false,
        leadFound: false,
        campaignFound: true,
        campaign: null,
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'lead_not_found' });

    expect(
      planSwitch({
        hasEnrollment: true,
        freshClaim: false,
        leadFound: true,
        campaignFound: false,
        campaign: null,
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'campaign_not_found' });

    expect(
      planSwitch({
        hasEnrollment: true,
        freshClaim: false,
        leadFound: true,
        campaignFound: true,
        campaign: {
          id: 'E',
          name: 'Emergency',
          urgency_filter: 'emergency',
          campaign_steps: [],
        },
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'no_steps' });
  });

  it('updates with treatRecoveryAsInitial false (stay step 1)', () => {
    const p = planSwitch({
      hasEnrollment: true,
      freshClaim: false,
      leadFound: true,
      campaignFound: true,
      campaign: {
        id: 'E',
        name: 'Emergency',
        urgency_filter: 'emergency',
        campaign_steps: steps,
      },
      targetCampaignId: 'E',
      smsOutboundSid: 'mlf:recovery:L',
      nowIso: 'n',
    });
    expect(p.type).toBe('update');
    if (p.type === 'update') {
      expect(p.result.switched).toBe(true);
      expect(p.result.currentStep).toBe(1);
      expect(p.payload.campaign_id).toBe('E');
    }
  });
});
