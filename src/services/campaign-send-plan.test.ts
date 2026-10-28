import { describe, expect, it } from 'vitest';
import {
  coalesceCurrentStep,
  coalesceIssue,
  coalesceLeadTimezone,
  planCampaignSendEffects,
  planCampaignSendPost,
  planCampaignSendPre,
  resolveClaimToken,
  shouldCheckSuppression,
  stepsForSendPlan,
} from './campaign-send-plan';

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

describe('campaign-send-plan coalescers + effects', () => {
  it('resolveClaimToken prefers arg over enrollment (|| not &&)', () => {
    expect(resolveClaimToken('a', 'b')).toBe('a');
    expect(resolveClaimToken(undefined, 'b')).toBe('b');
    expect(resolveClaimToken(undefined, null)).toBeNull();
    expect(resolveClaimToken('', 'b')).toBe('b');
  });

  it('stepsForSendPlan empties on error; coalesces null', () => {
    expect(stepsForSendPlan([{ step_number: 1 }], null)).toEqual([
      { step_number: 1 },
    ]);
    expect(stepsForSendPlan([{ step_number: 1 }], { x: 1 })).toEqual([]);
    expect(stepsForSendPlan(null, null)).toEqual([]);
    // ArrayDeclaration filler must not appear
    expect(stepsForSendPlan(undefined, null)).toEqual([]);
  });

  it('coalesce helpers', () => {
    expect(coalesceCurrentStep(undefined)).toBe(-1);
    expect(coalesceCurrentStep(3)).toBe(3);
    expect(coalesceLeadTimezone(undefined)).toBeNull();
    expect(coalesceLeadTimezone('America/Chicago')).toBe('America/Chicago');
    expect(coalesceIssue(null)).toBe('');
    expect(coalesceIssue('leak')).toBe('leak');
    expect(coalesceIssue('')).toBe('');
  });

  it('shouldCheckSuppression is AND (not OR)', () => {
    expect(shouldCheckSuppression({ id: 1 }, { id: 2 })).toBe(true);
    expect(shouldCheckSuppression(null, { id: 2 })).toBe(false);
    expect(shouldCheckSuppression({ id: 1 }, null)).toBe(false);
  });

  it('planCampaignSendEffects covers every dispatch type', () => {
    expect(
      planCampaignSendEffects({ type: 'advance', success: true }, 2).effects
    ).toEqual([{ op: 'advance', stepNumber: 2 }]);
    expect(
      planCampaignSendEffects(
        { type: 'release', success: false, nextSendAt: 't' },
        1
      ).effects
    ).toEqual([{ op: 'release', nextSendAt: 't' }]);
    expect(
      planCampaignSendEffects(
        { type: 'flag_unresolved_tz', success: false, nextSendAt: 't' },
        1
      ).effects[0].op
    ).toBe('flag_unresolved_tz');
    expect(
      planCampaignSendEffects(
        { type: 'park', success: false, nextSendAt: 't', reason: 'r' },
        1
      ).effects[0].op
    ).toBe('park');
    expect(
      planCampaignSendEffects({ type: 'pause_opt_out', success: true }, 1)
        .effects
    ).toEqual([{ op: 'pause_opt_out' }]);
    expect(
      planCampaignSendEffects(
        { type: 'needs_review_terminal', success: false, reason: 'max' },
        1
      ).effects
    ).toEqual([{ op: 'needs_review_terminal', reason: 'max' }]);
    expect(
      planCampaignSendEffects({ type: 'noop_false', success: false }, 1).effects
    ).toEqual([{ op: 'noop_release' }]);
  });
});
