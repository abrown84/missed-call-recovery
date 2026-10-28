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

    // AND-chain: missing any campaign field → ignore (kills || mutants)
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        campaignId: 'C',
        // stepNumber missing
      }).type
    ).toBe('ignore');
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        campaignId: 'C',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
    // recovery without leadId → ignore (|| mutant would still match kind)
    expect(
      planAbandonedSidAction({ kind: KIND_RECOVERY }).type
    ).toBe('ignore');
    // stepNumber 0 is valid (!= null)
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 0,
      }).type
    ).toBe('requeue_campaign');

    // kind≠campaign with ALL campaign fields still ignore
    // (kills `kind === CAMPAIGN && …` → `kind === CAMPAIGN || …`)
    expect(
      planAbandonedSidAction({
        kind: 'other',
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 1,
      }).type
    ).toBe('ignore');

    // campaign missing step but leadId present must NOT become recovery
    // (kills `kind === RECOVERY && leadId` → `kind === RECOVERY || leadId`)
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        campaignId: 'C',
        leadId: 'L',
      }).type
    ).toBe('ignore');

    // empty-string ids are falsy → ignore (not ConditionalExpression:true)
    expect(
      planAbandonedSidAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: '',
        campaignId: 'C',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
  });

  it('planAbandonedSidAction property: requeue iff all AND conjuncts hold', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(KIND_CAMPAIGN, KIND_RECOVERY, 'x', ''),
        fc.option(fc.constantFrom('E', ''), { nil: undefined }),
        fc.option(fc.constantFrom('C', ''), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
        fc.option(fc.constantFrom('L', ''), { nil: undefined }),
        (kind, enrollmentId, campaignId, stepNumber, leadId) => {
          const a = planAbandonedSidAction({
            kind,
            enrollmentId,
            campaignId,
            stepNumber,
            leadId,
          });
          const campaignOk =
            kind === KIND_CAMPAIGN &&
            Boolean(enrollmentId) &&
            Boolean(campaignId) &&
            stepNumber != null;
          const recoveryOk = kind === KIND_RECOVERY && Boolean(leadId);
          if (campaignOk) {
            expect(a).toEqual({
              type: 'requeue_campaign',
              enrollmentId,
              campaignId,
              stepNumber,
            });
          } else if (recoveryOk) {
            expect(a).toEqual({ type: 'resend_recovery', leadId });
          } else {
            expect(a).toEqual({ type: 'ignore' });
          }
        }
      ),
      { numRuns: 80 }
    );
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

    // eligibility false via campaign mismatch (not force-true)
    expect(
      planPostConfirmAdvance({
        enrollmentFound: true,
        campaignId: 'C',
        stepNumber: 1,
        enrollmentCampaignId: 'OTHER',
        enrollmentStep: 1,
        hasClaimToken: false,
        steps: [
          { step_number: 1, delay_minutes: 0 },
          { step_number: 2, delay_minutes: 1 },
        ],
        nowMs: 0,
        statusCompleted: 'completed',
      }).type
    ).toBe('skip');

    // null steps coalesce to empty → skip
    expect(
      planPostConfirmAdvance({
        enrollmentFound: true,
        campaignId: 'C',
        stepNumber: 1,
        enrollmentCampaignId: 'C',
        enrollmentStep: 1,
        hasClaimToken: false,
        steps: null,
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

    // Force-true on the eligibility negation would always skip — must advance
    // when eligible (kills ConditionalExpression:true on `if (!eligibility)`).
    expect(adv.type).not.toBe('skip');
    expect(done.type).not.toBe('skip');

    // hasClaimToken true must skip even with matching step/campaign
    expect(
      planPostConfirmAdvance({
        enrollmentFound: true,
        campaignId: 'C',
        stepNumber: 1,
        enrollmentCampaignId: 'C',
        enrollmentStep: 1,
        hasClaimToken: true,
        steps: [
          { step_number: 1, delay_minutes: 0 },
          { step_number: 2, delay_minutes: 10 },
        ],
        nowMs,
        statusCompleted: 'completed',
      }).type
    ).toBe('skip');
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

    // Partial campaign fields → ignore (AND not OR)
    expect(
      planConfirmedRowAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
    expect(
      planConfirmedRowAction({
        kind: KIND_CAMPAIGN,
        campaignId: 'C',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
    // non-campaign with full ids → ignore (|| after kind would advance)
    expect(
      planConfirmedRowAction({
        kind: 'x',
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 1,
      }).type
    ).toBe('ignore');
    // stepNumber 0 valid
    expect(
      planConfirmedRowAction({
        kind: KIND_CAMPAIGN,
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 0,
      }).type
    ).toBe('advance');
  });

  it('shouldResendRecovery property: true iff all three gates pass', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (l, o, b) => {
        expect(
          shouldResendRecovery({
            leadFound: l,
            optedOut: o,
            businessFound: b,
          })
        ).toBe(l && !o && b);
      }),
      { numRuns: 40 }
    );
  });
});
