import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  coalesceRows,
  planAbandonedSidAction,
  planConfirmedRowAction,
  planPostConfirmAdvance,
  shouldResendRecovery,
} from './campaign-reconcile-plan';
import { KIND_CAMPAIGN, KIND_RECOVERY } from '@/services/db-strings';

describe('campaign-reconcile-plan', () => {
  it('coalesceRows null → [] (not filler)', () => {
    expect(coalesceRows(null)).toEqual([]);
    expect(coalesceRows(undefined)).toEqual([]);
    expect(coalesceRows([1, 2])).toEqual([1, 2]);
  });

  it('planAbandonedSidAction routes campaign/recovery/ignore', () => {
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 2,
      })
    ).toEqual({
      type: 'requeue_campaign',
      enrollmentId: 'E',
      campaignId: 'C',
      stepNumber: 2,
    });
    expect(
      planAbandonedSidAction({ kind: KIND_RECOVERY, leadId: 'L' })
    ).toEqual({ type: 'resend_recovery', leadId: 'L' });
    expect(planAbandonedSidAction({ kind: 'other' })).toEqual({
      type: 'ignore',
    });
  });

  it('shouldResendRecovery is AND of lead && !optedOut && business', () => {
    expect(
      shouldResendRecovery({
        leadFound: true,
        optedOut: false,
        businessFound: true,
      })
    ).toBe(true);
    expect(
      shouldResendRecovery({
        leadFound: true,
        optedOut: true,
        businessFound: true,
      })
    ).toBe(false);
    expect(
      shouldResendRecovery({
        leadFound: false,
        optedOut: false,
        businessFound: true,
      })
    ).toBe(false);
    expect(
      shouldResendRecovery({
        leadFound: true,
        optedOut: false,
        businessFound: false,
      })
    ).toBe(false);
  });

  it('planPostConfirmAdvance skips on claim / mismatch / empty steps', () => {
    expect(
      planPostConfirmAdvance({
        enrollmentFound: true,
        campaignId: 'C',
        stepNumber: 1,
        enrollmentCampaignId: 'C',
        enrollmentStep: 1,
        hasClaimToken: true,
        steps: [{ step_number: 1, delay_minutes: 0 }],
        nowMs: 0,
        statusCompleted: 'completed',
      }).type
    ).toBe('skip');

    expect(
      planPostConfirmAdvance({
        enrollmentFound: true,
        campaignId: 'C',
        stepNumber: 1,
        enrollmentCampaignId: 'C',
        enrollmentStep: 1,
        hasClaimToken: false,
        steps: [],
        nowMs: 0,
        statusCompleted: 'completed',
      }).type
    ).toBe('skip');
  });

  it('planPostConfirmAdvance advances or completes', () => {
    const nowMs = Date.parse('2026-06-15T12:00:00.000Z');
    const adv = planPostConfirmAdvance({
      enrollmentFound: true,
      campaignId: 'C',
      stepNumber: 1,
      enrollmentCampaignId: 'C',
      enrollmentStep: 1,
      hasClaimToken: false,
      steps: [
        { step_number: 1, delay_minutes: 0 },
        { step_number: 2, delay_minutes: 10 },
      ],
      nowMs,
      statusCompleted: 'completed',
    });
    expect(adv.type).toBe('advance');
    if (adv.type === 'advance') {
      expect(adv.payload).toMatchObject({ current_step: 2 });
    }

    const done = planPostConfirmAdvance({
      enrollmentFound: true,
      campaignId: 'C',
      stepNumber: 2,
      enrollmentCampaignId: 'C',
      enrollmentStep: 2,
      hasClaimToken: false,
      steps: [
        { step_number: 1, delay_minutes: 0 },
        { step_number: 2, delay_minutes: 10 },
      ],
      nowMs,
      statusCompleted: 'completed',
    });
    expect(done.type).toBe('complete');
  });

  it('planConfirmedRowAction property: only campaign with ids advances', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(KIND_CAMPAIGN, KIND_RECOVERY, 'x'),
        fc.option(fc.string({ minLength: 1, maxLength: 4 }), { nil: undefined }),
        (kind, id) => {
          const a = planConfirmedRowAction({
            kind,
            enrollmentId: id,
            campaignId: id,
            stepNumber: 1,
          });
          if (kind === KIND_CAMPAIGN && id) {
            expect(a.type).toBe('advance');
          } else {
            expect(a.type).toBe('ignore');
          }
        }
      ),
      { numRuns: 40 }
    );
  });
});
