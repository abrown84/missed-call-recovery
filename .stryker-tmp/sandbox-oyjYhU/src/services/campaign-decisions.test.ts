// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  decideCampaignLeadGates,
  decideCampaignSendDispatch,
  decideEnrollmentGates,
  decideEnrollmentPlan,
  decideReconcileAdvanceEligibility,
  decideRequeueEligibility,
  decideSkipRecoveryGate,
  decideSwitchClaimGate,
  mapRecoveryOutcomeToState,
} from './campaign-decisions';
import type { SendOutcome } from '@/services/send/types';

describe('decideEnrollmentGates', () => {
  it('lead / opt-out / existing', () => {
    expect(
      decideEnrollmentGates({
        leadFound: false,
        optedOut: false,
      })
    ).toEqual({ ok: false, reason: 'lead_not_found' });
    expect(
      decideEnrollmentGates({
        leadFound: true,
        optedOut: true,
      })
    ).toEqual({ ok: false, reason: 'opted_out' });
    expect(
      decideEnrollmentGates({
        leadFound: true,
        optedOut: false,
        existingStatus: 'active',
      })
    ).toEqual({ ok: false, reason: 'already_enrolled:active' });
    expect(
      decideEnrollmentGates({
        leadFound: true,
        optedOut: false,
        existingStatus: null,
      })
    ).toEqual({ ok: true });
  });
});

describe('decideEnrollmentPlan', () => {
  const steps = [
    { step_number: 1, delay_minutes: 0 },
    { step_number: 2, delay_minutes: 60 },
  ];

  it('parks when recovery pending and not confirmed', () => {
    const parked = '2099-01-01T00:00:00.000Z';
    const d = decideEnrollmentPlan({
      steps,
      recoveryState: 'pending',
      recoveryConfirmed: false,
      treatRecoveryAsInitial: true,
      parkedIso: parked,
    });
    expect(d).toMatchObject({ ok: true, nextSendAt: parked, currentStep: 1 });
  });

  it('skips initial on Standard when recovery confirmed', () => {
    const d = decideEnrollmentPlan({
      steps,
      recoveryState: 'confirmed',
      recoveryConfirmed: true,
      treatRecoveryAsInitial: true,
      now: new Date('2026-01-01T12:00:00.000Z'),
    });
    expect(d).toMatchObject({ ok: true, skippedInitial: true, currentStep: 2 });
  });

  it('Emergency never treats recovery as initial', () => {
    const d = decideEnrollmentPlan({
      steps,
      recoveryState: 'confirmed',
      recoveryConfirmed: true,
      treatRecoveryAsInitial: false,
      now: new Date('2026-01-01T12:00:00.000Z'),
    });
    expect(d).toMatchObject({
      ok: true,
      skippedInitial: false,
      currentStep: 1,
    });
  });

  it('only_initial_already_sent', () => {
    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'confirmed',
        recoveryConfirmed: true,
        treatRecoveryAsInitial: true,
      })
    ).toEqual({ ok: false, reason: 'only_initial_already_sent' });
  });

  it('no_steps', () => {
    expect(
      decideEnrollmentPlan({
        steps: [],
        recoveryState: 'absent',
        recoveryConfirmed: false,
        treatRecoveryAsInitial: true,
      })
    ).toEqual({ ok: false, reason: 'no_steps' });
  });
});

describe('mapRecoveryOutcomeToState', () => {
  it('maps all outcomes', () => {
    expect(mapRecoveryOutcomeToState('resolved_sent')).toBe('confirmed');
    expect(mapRecoveryOutcomeToState('resolved_abandoned')).toBe('abandoned');
    expect(mapRecoveryOutcomeToState('pending')).toBe('pending');
    expect(mapRecoveryOutcomeToState('absent')).toBe('absent');
    expect(mapRecoveryOutcomeToState('other')).toBe('absent');
  });
});

describe('decideSkipRecoveryGate', () => {
  it('false only for delay-0 first step', () => {
    expect(
      decideSkipRecoveryGate({
        delayMinutes: 0,
        currentStep: 1,
        firstStepNumber: 1,
      })
    ).toBe(false);
    expect(
      decideSkipRecoveryGate({
        delayMinutes: 30,
        currentStep: 1,
        firstStepNumber: 1,
      })
    ).toBe(true);
    expect(
      decideSkipRecoveryGate({
        delayMinutes: 0,
        currentStep: 2,
        firstStepNumber: 1,
      })
    ).toBe(true);
  });
});

describe('decideCampaignSendDispatch', () => {
  const park = '2099-01-01T00:00:00.000Z';
  it('property: success flag matches action class', () => {
    const outcomes: SendOutcome[] = [
      { kind: 'skipped', reason: 'recovery_already_sent_skip_step_1' },
      {
        kind: 'blocked',
        reason: 'quiet_hours_deferred',
        nextSendAt: park,
      },
      { kind: 'blocked', reason: 'quiet_hours_unresolved' },
      { kind: 'blocked', reason: 'recovery_pending' },
      { kind: 'blocked', reason: 'suppressed' },
      { kind: 'blocked', reason: 'opted_out' },
      { kind: 'blocked', reason: 'sends_disabled' },
      { kind: 'blocked', reason: 'duplicate_in_flight' },
      { kind: 'blocked', reason: 'invalid_phone' },
      {
        kind: 'sent',
        sid: 's',
        messageId: 'm',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      },
      { kind: 'needs_review', sid: 's', reason: 'x' },
      { kind: 'ambiguous', sid: 's', reason: 'r', nextRetryAt: park },
      { kind: 'never_sent', sid: 's' },
    ];
    for (const outcome of outcomes) {
      const d = decideCampaignSendDispatch(outcome, park);
      if (d.type === 'release') {
        expect(d.success).toBe(d.ok);
      } else {
        const successTypes = new Set(['advance', 'pause_opt_out']);
        expect(d.success).toBe(successTypes.has(d.type));
      }
    }
  });
});

describe('decideCampaignLeadGates', () => {
  it('pause / release_fail / continue', () => {
    expect(
      decideCampaignLeadGates({
        optedOut: true,
        suppressed: false,
        suppressionLookupFailed: false,
      })
    ).toEqual({ action: 'pause', success: true });
    expect(
      decideCampaignLeadGates({
        optedOut: false,
        suppressed: true,
        suppressionLookupFailed: false,
      })
    ).toEqual({ action: 'pause', success: true });
    expect(
      decideCampaignLeadGates({
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: true,
      })
    ).toEqual({ action: 'release_fail', success: false });
    expect(
      decideCampaignLeadGates({
        optedOut: false,
        suppressed: false,
        suppressionLookupFailed: false,
      })
    ).toEqual({ action: 'continue' });
  });
});

describe('decideSwitchClaimGate / reconcile / requeue', () => {
  it('switch gates', () => {
    expect(
      decideSwitchClaimGate({ hasEnrollment: false, freshClaim: false })
    ).toEqual({ ok: false, reason: 'no_enrollment' });
    expect(
      decideSwitchClaimGate({ hasEnrollment: true, freshClaim: true })
    ).toEqual({ ok: false, reason: 'deferred_fresh_claim' });
    expect(
      decideSwitchClaimGate({ hasEnrollment: true, freshClaim: false })
    ).toEqual({ ok: true });
  });

  it('reconcile advance eligibility property', () => {
    fc.assert(
      fc.property(
        fc.record({
          enrollmentFound: fc.boolean(),
          campaignMatches: fc.boolean(),
          stepMatches: fc.boolean(),
          hasClaimToken: fc.boolean(),
        }),
        (input) => {
          const ok = decideReconcileAdvanceEligibility(input);
          expect(ok).toBe(
            input.enrollmentFound &&
              input.campaignMatches &&
              input.stepMatches &&
              !input.hasClaimToken
          );
        }
      ),
      { numRuns: 40 }
    );
  });

  it('requeue eligibility', () => {
    expect(
      decideRequeueEligibility({
        enrollmentFound: true,
        campaignMatches: true,
      })
    ).toBe(true);
    expect(
      decideRequeueEligibility({
        enrollmentFound: true,
        campaignMatches: false,
      })
    ).toBe(false);
  });
});
