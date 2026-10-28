import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  REPLY_ACTION,
  advanceStepPayload,
  claimDuePayload,
  clearOutboundSidPayload,
  completeEnrollmentPayload,
  computeNextSendAt,
  enrollmentInsertPayload,
  needsReviewEnrollmentPayload,
  nextStepDelayMs,
  pauseEnrollmentPayload,
  processDueErrorParkPayload,
  quietHoursReviewLeadPayload,
  reclaimStalePayload,
  reconcileAdvancePayload,
  reconcileCompletePayload,
  releaseClaimPayload,
  requeueStepPayload,
  sortCampaignSteps,
  stepsOrEmpty,
  switchUpdatePayload,
} from './campaign-io-plans';

describe('campaign-io-plans', () => {
  it('sortCampaignSteps is stable ascending by step_number', () => {
    expect(
      sortCampaignSteps([
        { step_number: 3 },
        { step_number: 1 },
        { step_number: 2 },
      ]).map((s) => s.step_number)
    ).toEqual([1, 2, 3]);
    // slice so original is untouched
    const orig = [{ step_number: 2 }, { step_number: 1 }];
    sortCampaignSteps(orig);
    expect(orig[0].step_number).toBe(2);
  });

  it('stepsOrEmpty coalesces null/undefined', () => {
    expect(stepsOrEmpty(null)).toEqual([]);
    expect(stepsOrEmpty(undefined)).toEqual([]);
    expect(stepsOrEmpty([{ step_number: 1 }])).toHaveLength(1);
  });

  it('payload builders exact shapes', () => {
    expect(
      enrollmentInsertPayload({
        leadId: 'L',
        campaignId: 'C',
        currentStep: 1,
        status: 'active',
        nextSendAt: 't',
      })
    ).toEqual({
      lead_id: 'L',
      campaign_id: 'C',
      current_step: 1,
      status: 'active',
      next_send_at: 't',
      claimed_at: null,
      claim_token: null,
    });

    expect(
      switchUpdatePayload({
        targetCampaignId: 'T',
        currentStep: 1,
        status: 'active',
        nextSendAt: 't',
        nowIso: 'n',
      })
    ).toMatchObject({
      campaign_id: 'T',
      current_step: 1,
      paused_at: null,
      completed_at: null,
      updated_at: 'n',
    });

    expect(
      advanceStepPayload({
        nextStepNumber: 2,
        nextSendAt: 't',
        nowIso: 'n',
      })
    ).toEqual({
      current_step: 2,
      next_send_at: 't',
      claimed_at: null,
      claim_token: null,
      updated_at: 'n',
    });

    expect(
      completeEnrollmentPayload({ status: 'completed', nowIso: 'n' })
    ).toMatchObject({
      status: 'completed',
      completed_at: 'n',
      next_send_at: null,
    });

    expect(
      pauseEnrollmentPayload({ status: 'paused', nowIso: 'n' })
    ).toMatchObject({ status: 'paused', paused_at: 'n', next_send_at: null });

    expect(
      needsReviewEnrollmentPayload({ status: 'needs_review', nowIso: 'n' })
    ).toMatchObject({
      status: 'needs_review',
      paused_at: 'n',
      next_send_at: null,
    });

    expect(claimDuePayload({ nowIso: 'n', token: 'tok' })).toEqual({
      next_send_at: null,
      claimed_at: 'n',
      claim_token: 'tok',
      updated_at: 'n',
    });

    expect(reclaimStalePayload({ nowIso: 'n', token: 'tok' })).toEqual({
      claimed_at: 'n',
      claim_token: 'tok',
      updated_at: 'n',
    });

    expect(
      releaseClaimPayload({ nextSendAt: 't', nowIso: 'n' })
    ).toEqual({
      claimed_at: null,
      claim_token: null,
      next_send_at: 't',
      updated_at: 'n',
    });

    expect(
      reconcileAdvancePayload({
        nextStepNumber: 2,
        nextSendAt: 't',
        nowIso: 'n',
      })
    ).toEqual({
      current_step: 2,
      next_send_at: 't',
      claimed_at: null,
      claim_token: null,
      updated_at: 'n',
    });

    expect(
      reconcileCompletePayload({ status: 'completed', nowIso: 'n' })
    ).toMatchObject({
      status: 'completed',
      completed_at: 'n',
      next_send_at: null,
      claim_token: null,
    });

    expect(requeueStepPayload({ stepNumber: 3, nowIso: 'n' })).toEqual({
      current_step: 3,
      next_send_at: 'n',
      claimed_at: null,
      claim_token: null,
      updated_at: 'n',
    });

    expect(clearOutboundSidPayload({ nowIso: 'n' })).toEqual({
      sms_outbound_sid: null,
      updated_at: 'n',
    });

    expect(
      processDueErrorParkPayload({ nextSendAt: 'park', nowIso: 'n' })
    ).toEqual({
      claim_token: null,
      claimed_at: null,
      next_send_at: 'park',
      updated_at: 'n',
    });

    expect(
      quietHoursReviewLeadPayload({ reason: 'quiet_hours', nowIso: 'n' })
    ).toEqual({
      needs_human_review: true,
      needs_human_review_at: 'n',
      needs_human_review_reason: 'quiet_hours',
    });
  });

  it('nextStepDelayMs / computeNextSendAt arithmetic', () => {
    expect(nextStepDelayMs(0)).toBe(0);
    expect(nextStepDelayMs(1)).toBe(60_000);
    expect(nextStepDelayMs(60)).toBe(3_600_000);
    expect(computeNextSendAt(0, 1)).toBe(new Date(60_000).toISOString());
  });

  it('REPLY_ACTION tokens', () => {
    expect(REPLY_ACTION.deferSwitch).toBe('defer_switch');
    expect(REPLY_ACTION.switch).toBe('switch');
    expect(REPLY_ACTION.pause).toBe('pause');
    expect(REPLY_ACTION.enroll).toBe('enroll');
    expect(REPLY_ACTION.noop).toBe('noop');
  });

  it('property: sort is idempotent and length-preserving', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ step_number: fc.integer({ min: 0, max: 20 }) }), {
          maxLength: 8,
        }),
        (steps) => {
          const once = sortCampaignSteps(steps);
          const twice = sortCampaignSteps(once);
          expect(twice).toEqual(once);
          expect(once).toHaveLength(steps.length);
          for (let i = 1; i < once.length; i++) {
            expect(once[i].step_number).toBeGreaterThanOrEqual(
              once[i - 1].step_number
            );
          }
        }
      ),
      { numRuns: 40 }
    );
  });
});
