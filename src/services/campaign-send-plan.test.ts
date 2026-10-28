import { describe, expect, it } from 'vitest';
import { planCampaignSendPost, planCampaignSendPre } from './campaign-send-plan';

const steps = [
  { step_number: 1, delay_minutes: 0, template_key: 'a' },
  { step_number: 2, delay_minutes: 60, template_key: 'b' },
];

describe('planCampaignSendPre', () => {
  it('fails without enrollment or claim token', () => {
    expect(
      planCampaignSendPre({
        enrollmentFound: false,
        claimToken: 't',
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: false,
        steps,
        currentStep: 1,
        leadTimezone: null,
      })
    ).toMatchObject({ type: 'fail', reason: 'no_enrollment' });

    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: null,
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: false,
        steps,
        currentStep: 1,
        leadTimezone: null,
      })
    ).toMatchObject({ type: 'fail', reason: 'no_claim_token' });
  });

  it('pauses on opted_out / suppressed; release_fail on lookup fail', () => {
    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: 't',
        optedOut: true,
        suppressed: false,
        suppressionLookupFailed: false,
        steps,
        currentStep: 1,
        leadTimezone: null,
      }).type
    ).toBe('pause');

    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: 't',
        optedOut: false,
        suppressed: true,
        suppressionLookupFailed: false,
        steps,
        currentStep: 1,
        leadTimezone: null,
      }).type
    ).toBe('pause');

    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: 't',
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: true,
        steps,
        currentStep: 1,
        leadTimezone: null,
      })
    ).toMatchObject({ type: 'release_fail', reason: 'suppression_lookup_failed' });
  });

  it('release_fail on no steps / missing step', () => {
    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: 't',
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: false,
        steps: [],
        currentStep: 1,
        leadTimezone: null,
      })
    ).toMatchObject({ reason: 'no_steps' });

    expect(
      planCampaignSendPre({
        enrollmentFound: true,
        claimToken: 't',
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: false,
        steps,
        currentStep: 99,
        leadTimezone: null,
      })
    ).toMatchObject({ reason: 'step_missing' });
  });

  it('send plan: skipRecoveryGate only for delay-0 first step', () => {
    const first = planCampaignSendPre({
      enrollmentFound: true,
      claimToken: 't',
      optedOut: false,
      suppressed: false,
      suppressionLookupFailed: false,
      steps,
      currentStep: 1,
      leadTimezone: 'America/New_York',
    });
    expect(first.type).toBe('send');
    if (first.type === 'send') {
      expect(first.skipRecoveryGate).toBe(false); // delay 0 first step → gate ON
      expect(first.templateKey).toBe('a');
      expect(first.leadTimezone).toBe('America/New_York');
    }

    const second = planCampaignSendPre({
      enrollmentFound: true,
      claimToken: 't',
      optedOut: false,
      suppressed: false,
      suppressionLookupFailed: false,
      steps,
      currentStep: 2,
      leadTimezone: null,
    });
    expect(second.type).toBe('send');
    if (second.type === 'send') {
      expect(second.skipRecoveryGate).toBe(true);
      expect(second.templateKey).toBe('b');
    }
  });
});

describe('planCampaignSendPost', () => {
  it('maps sent → advance success; needs_review → terminal fail', () => {
    expect(
      planCampaignSendPost(
        {
          kind: 'sent',
          sid: 's',
          messageId: 'm',
          providerStatus: 'queued',
          keySupportedAtSend: true,
        },
        'park'
      )
    ).toMatchObject({ type: 'advance', success: true });

    expect(
      planCampaignSendPost(
        { kind: 'needs_review', sid: 's', reason: 'x' },
        'park'
      )
    ).toMatchObject({ type: 'needs_review_terminal', success: false });
  });
});
