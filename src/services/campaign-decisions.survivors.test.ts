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
    // skipped but multiple steps → ok (kills length===1 → true)
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

    // not skipped (Emergency) single step → ok (kills skippedInitial → true)
    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'confirmed',
        recoveryConfirmed: true,
        treatRecoveryAsInitial: false,
        now: new Date('2026-01-01T00:00:00Z'),
      })
    ).toMatchObject({ ok: true, currentStep: 1 });

    // all three: skipped + same step + length 1 → only_initial_already_sent
    expect(
      decideEnrollmentPlan({
        steps: [{ step_number: 1, delay_minutes: 0 }],
        recoveryState: 'confirmed',
        recoveryConfirmed: true,
        treatRecoveryAsInitial: true,
        now: new Date('2026-01-01T00:00:00Z'),
      })
    ).toEqual({ ok: false, reason: 'only_initial_already_sent' });
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
    const cases = [
      {
        o: {
          kind: 'skipped' as const,
          reason: 'recovery_already_sent_skip_step_1',
        },
        type: 'advance',
        success: true,
      },
      {
        o: { kind: 'blocked' as const, reason: 'quiet_hours_unresolved' },
        type: 'flag_unresolved_tz',
        success: false,
      },
      {
        o: { kind: 'blocked' as const, reason: 'invalid_phone' },
        type: 'noop_false',
        success: false,
      },
      {
        o: { kind: 'needs_review' as const, sid: 's', reason: 'r' },
        type: 'needs_review_terminal',
        success: false,
      },
      {
        o: { kind: 'blocked' as const, reason: 'suppressed' },
        type: 'pause_opt_out',
        success: true,
      },
      {
        o: {
          kind: 'blocked' as const,
          reason: 'quiet_hours_deferred',
          nextSendAt: 't',
        },
        type: 'release',
        success: true,
      },
      {
        o: { kind: 'ambiguous' as const, sid: 's', reason: 'r' },
        type: 'park',
        success: false,
      },
    ];
    for (const c of cases) {
      const d = decideCampaignSendDispatch(c.o, park);
      expect(d.type).toBe(c.type);
      expect(d.success).toBe(c.success);
    }
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
