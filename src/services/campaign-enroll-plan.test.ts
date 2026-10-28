import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
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

const emergency = {
  id: 'E',
  name: 'Emergency',
  urgency_filter: 'emergency' as string | null,
  campaign_steps: steps,
};

describe('planEnroll', () => {
  it('rejects opted_out / already_enrolled / lead_not_found via gates', () => {
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
        leadFound: false,
        optedOut: false,
        existingStatus: null,
        campaigns: [standard],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'lead_not_found' });

    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: 'active',
        campaigns: [standard],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'already_enrolled:active' });
  });

  it('rejects no_campaigns for error OR null OR empty (not AND)', () => {
    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: null,
        campaigns: [standard],
        campaignError: true, // error alone must reject even with campaigns present
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
        campaigns: null,
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
        campaigns: [],
        campaignError: false,
        urgency: null,
        recoveryState: 'absent',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'no_campaigns' });
  });

  it('rejects no_matching / no_steps / only_initial_already_sent', () => {
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

    // Single delay-0 step + recovery confirmed → only_initial_already_sent
    expect(
      planEnroll({
        leadId: 'L',
        leadFound: true,
        optedOut: false,
        existingStatus: null,
        campaigns: [
          {
            ...standard,
            campaign_steps: [
              { step_number: 1, delay_minutes: 0, template_key: 'a' },
            ],
          },
        ],
        campaignError: false,
        urgency: null,
        recoveryState: 'confirmed',
        smsOutboundSid: null,
      })
    ).toEqual({ type: 'reject', reason: 'only_initial_already_sent' });
  });

  it('recoveryConfirmed via state OR sid; Standard treats recovery as initial', () => {
    // confirmed without sid
    const a = planEnroll({
      leadId: 'L',
      leadFound: true,
      optedOut: false,
      existingStatus: null,
      campaigns: [standard],
      campaignError: false,
      urgency: null,
      recoveryState: 'confirmed',
      smsOutboundSid: null,
    });
    expect(a.type).toBe('insert');
    if (a.type === 'insert') {
      expect(a.result.skippedInitial).toBe(true);
      expect(a.result.currentStep).toBe(2);
    }

    // sid without confirmed state
    const b = planEnroll({
      leadId: 'L',
      leadFound: true,
      optedOut: false,
      existingStatus: null,
      campaigns: [standard],
      campaignError: false,
      urgency: null,
      recoveryState: 'absent',
      smsOutboundSid: 'mlf:recovery:L',
    });
    expect(b.type).toBe('insert');
    if (b.type === 'insert') {
      expect(b.result.skippedInitial).toBe(true);
    }

    // neither → start at step 1
    const c = planEnroll({
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
    expect(c.type).toBe('insert');
    if (c.type === 'insert') {
      expect(c.result.skippedInitial).toBe(false);
      expect(c.result.currentStep).toBe(1);
    }
  });

  it('Emergency never treats recovery as initial (urgency_filter non-null)', () => {
    const p = planEnroll({
      leadId: 'L',
      leadFound: true,
      optedOut: false,
      existingStatus: null,
      campaigns: [emergency, standard],
      campaignError: false,
      urgency: 'emergency',
      recoveryState: 'confirmed',
      smsOutboundSid: 'mlf:recovery:L',
    });
    expect(p.type).toBe('insert');
    if (p.type === 'insert') {
      expect(p.result.campaignName).toBe('Emergency');
      // Must stay on step 1 even with recovery confirmed
      expect(p.result.currentStep).toBe(1);
      expect(p.result.skippedInitial).toBe(false);
    }
  });

  it('statusActive coalesce: custom wins, else active', () => {
    const custom = planEnroll({
      leadId: 'L',
      leadFound: true,
      optedOut: false,
      existingStatus: null,
      campaigns: [standard],
      campaignError: false,
      urgency: null,
      recoveryState: 'absent',
      smsOutboundSid: null,
      statusActive: 'queued_active',
    });
    expect(custom.type).toBe('insert');
    if (custom.type === 'insert') {
      expect(custom.payload.status).toBe('queued_active');
    }

    const def = planEnroll({
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
    expect(def.type).toBe('insert');
    if (def.type === 'insert') {
      expect(def.payload.status).toBe('active');
    }
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
      expect(p.result.enrolled).toBe(true);
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
        campaign: emergency,
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'deferred_fresh_claim' });

    expect(
      planSwitch({
        hasEnrollment: false,
        freshClaim: false,
        leadFound: true,
        campaignFound: true,
        campaign: emergency,
        targetCampaignId: 'E',
        smsOutboundSid: null,
        nowIso: 'n',
      })
    ).toEqual({ type: 'reject', reason: 'no_enrollment' });

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

    // campaignFound true but campaign null still rejects
    expect(
      planSwitch({
        hasEnrollment: true,
        freshClaim: false,
        leadFound: true,
        campaignFound: true,
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
        campaign: { ...emergency, campaign_steps: [] },
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
      campaign: emergency,
      targetCampaignId: 'E',
      smsOutboundSid: 'mlf:recovery:L',
      nowIso: 'n',
    });
    expect(p.type).toBe('update');
    if (p.type === 'update') {
      expect(p.result.switched).toBe(true);
      expect(p.result.currentStep).toBe(1);
      expect(p.result.skippedInitial).toBe(false);
      expect(p.payload.campaign_id).toBe('E');
      expect(p.payload.status).toBe('active');
      expect(p.payload.updated_at).toBe('n');
      expect(p.result.campaignName).toBe('Emergency');
    }
  });

  it('statusActive custom vs default active', () => {
    const p = planSwitch({
      hasEnrollment: true,
      freshClaim: false,
      leadFound: true,
      campaignFound: true,
      campaign: emergency,
      targetCampaignId: 'E',
      smsOutboundSid: null,
      nowIso: 'now',
      statusActive: 'reactivated',
    });
    expect(p.type).toBe('update');
    if (p.type === 'update') {
      expect(p.payload.status).toBe('reactivated');
    }
  });

  it('property: successful switch always reports switched + enrolled', () => {
    fc.assert(
      fc.property(fc.boolean(), (hasSid) => {
        const p = planSwitch({
          hasEnrollment: true,
          freshClaim: false,
          leadFound: true,
          campaignFound: true,
          campaign: emergency,
          targetCampaignId: 'E',
          smsOutboundSid: hasSid ? 'sid' : null,
          nowIso: 't',
        });
        expect(p.type).toBe('update');
        if (p.type === 'update') {
          expect(p.result.switched).toBe(true);
          expect(p.result.enrolled).toBe(true);
          expect(p.result.currentStep).toBe(1);
        }
      }),
      { numRuns: 20 }
    );
  });
});
