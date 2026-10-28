import { describe, expect, it } from 'vitest';
import {
  decideCampaignLeadGates,
  decideCampaignSendDispatch,
  decideEnrollmentPlan,
  decideReconcileAdvanceEligibility,
  decideSkipRecoveryGate,
} from './campaign-decisions';

describe('campaign-decisions survivors', () => {
  it('only_initial requires skipped + same step + length 1', () => {
    // skipped but multiple steps → ok
    expect(
      decideEnrollmentPlan({
        steps: [
          { step_number: 1, delay_minutes: 0 },
          { step_number: 2, delay_minutes: 10 },
        ],
        recoveryState: 'confirmed',
        recoveryConfirmed: true,
        treatRecoveryAsInitial: true,
        now: new Date('2026-01-01T00:00:00Z'),
      }).ok
    ).toBe(true);

    // not skipped (Emergency) single step → ok
    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'confirmed',
        recoveryConfirmed: true,
        treatRecoveryAsInitial: false,
        now: new Date('2026-01-01T00:00:00Z'),
      })
    ).toMatchObject({ ok: true, currentStep: 1 });
  });

  it('pending park only when not recoveryConfirmed', () => {
    const parked = '2099-01-01T00:00:00.000Z';
    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'pending',
        recoveryConfirmed: true, // sid present
        treatRecoveryAsInitial: false,
        parkedIso: parked,
        now: new Date('2026-01-01T12:00:00Z'),
      })
    ).not.toMatchObject({ nextSendAt: parked });

    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'absent',
        recoveryConfirmed: false,
        treatRecoveryAsInitial: true,
        parkedIso: parked,
        now: new Date('2026-01-01T12:00:00Z'),
      })
    ).not.toMatchObject({ nextSendAt: parked });
  });

  it('decideSkipRecoveryGate firstStepNumber undefined', () => {
    expect(
      decideSkipRecoveryGate({
        delayMinutes: 0,
        currentStep: 1,
        firstStepNumber: undefined,
      })
    ).toBe(true);
  });

  it('decideCampaignSendDispatch exact type strings', () => {
    const park = 'p';
    const types = [
      decideCampaignSendDispatch(
        { kind: 'skipped', reason: 'recovery_already_sent_skip_step_1' },
        park
      ).type,
      decideCampaignSendDispatch(
        { kind: 'blocked', reason: 'quiet_hours_unresolved' },
        park
      ).type,
      decideCampaignSendDispatch(
        { kind: 'blocked', reason: 'invalid_phone' },
        park
      ).type,
      decideCampaignSendDispatch(
        { kind: 'needs_review', sid: 's', reason: 'r' },
        park
      ).type,
    ];
    expect(types).toEqual([
      'advance',
      'flag_unresolved_tz',
      'noop_false',
      'needs_review_terminal',
    ]);
  });

  it('decideCampaignLeadGates optedOut wins with suppressed', () => {
    expect(
      decideCampaignLeadGates({
        optedOut: true,
        suppressed: true,
        suppressionLookupFailed: true,
      })
    ).toEqual({ action: 'pause', success: true });
  });

  it('reconcile advance: each flag independently blocks', () => {
    expect(
      decideReconcileAdvanceEligibility({
        enrollmentFound: true,
        campaignMatches: true,
        stepMatches: true,
        hasClaimToken: false,
      })
    ).toBe(true);
    expect(
      decideReconcileAdvanceEligibility({
        enrollmentFound: false,
        campaignMatches: true,
        stepMatches: true,
        hasClaimToken: false,
      })
    ).toBe(false);
    expect(
      decideReconcileAdvanceEligibility({
        enrollmentFound: true,
        campaignMatches: false,
        stepMatches: true,
        hasClaimToken: false,
      })
    ).toBe(false);
    expect(
      decideReconcileAdvanceEligibility({
        enrollmentFound: true,
        campaignMatches: true,
        stepMatches: false,
        hasClaimToken: false,
      })
    ).toBe(false);
    expect(
      decideReconcileAdvanceEligibility({
        enrollmentFound: true,
        campaignMatches: true,
        stepMatches: true,
        hasClaimToken: true,
      })
    ).toBe(false);
  });
});
