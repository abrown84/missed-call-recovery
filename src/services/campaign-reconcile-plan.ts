/**
 * Pure post-reconcile planning (abandoned sid / confirmed advance / resend gates).
 */

import {
  computeNextSendAt,
  reconcileAdvancePayload,
  reconcileCompletePayload,
} from '@/services/campaign-io-plans';
import { decideReconcileAdvanceEligibility } from '@/services/campaign-decisions';
import { KIND_CAMPAIGN, KIND_RECOVERY } from '@/services/db-strings';

export function coalesceRows<T>(rows: T[] | null | undefined): T[] {
  return rows ?? [];
}

export type AbandonedSidAction =
  | {
      type: 'requeue_campaign';
      enrollmentId: string;
      campaignId: string;
      stepNumber: number;
    }
  | { type: 'resend_recovery'; leadId: string }
  | { type: 'ignore' };

export function planAbandonedSidAction(parsed: {
  kind: string;
  enrollmentId?: string;
  campaignId?: string;
  stepNumber?: number;
  leadId?: string;
}): AbandonedSidAction {
  if (
    parsed.kind === KIND_CAMPAIGN &&
    parsed.enrollmentId &&
    parsed.campaignId &&
    parsed.stepNumber != null
  ) {
    return {
      type: 'requeue_campaign',
      enrollmentId: parsed.enrollmentId,
      campaignId: parsed.campaignId,
      stepNumber: parsed.stepNumber,
    };
  }
  if (parsed.kind === KIND_RECOVERY && parsed.leadId) {
    return { type: 'resend_recovery', leadId: parsed.leadId };
  }
  return { type: 'ignore' };
}

export function shouldResendRecovery(input: {
  leadFound: boolean;
  optedOut: boolean;
  businessFound: boolean;
}): boolean {
  return input.leadFound && !input.optedOut && input.businessFound;
}

export type PostConfirmAdvancePlan =
  | { type: 'skip' }
  | {
      type: 'advance';
      payload: ReturnType<typeof reconcileAdvancePayload>;
    }
  | {
      type: 'complete';
      payload: ReturnType<typeof reconcileCompletePayload>;
    };

export function planPostConfirmAdvance(input: {
  enrollmentFound: boolean;
  campaignId: string;
  stepNumber: number;
  enrollmentCampaignId: string | null | undefined;
  enrollmentStep: number | null | undefined;
  hasClaimToken: boolean;
  steps: Array<{ step_number: number; delay_minutes: number }> | null | undefined;
  nowMs: number;
  statusCompleted: string;
}): PostConfirmAdvancePlan {
  if (
    !decideReconcileAdvanceEligibility({
      enrollmentFound: input.enrollmentFound,
      campaignMatches: input.enrollmentCampaignId === input.campaignId,
      stepMatches: input.enrollmentStep === input.stepNumber,
      hasClaimToken: input.hasClaimToken,
    })
  ) {
    return { type: 'skip' };
  }
  const steps = coalesceRows(input.steps);
  if (steps.length === 0) return { type: 'skip' };

  const nextStep = steps.find((s) => s.step_number === input.stepNumber + 1);
  const nowIso = new Date(input.nowMs).toISOString();
  if (nextStep) {
    return {
      type: 'advance',
      payload: reconcileAdvancePayload({
        nextStepNumber: nextStep.step_number,
        nextSendAt: computeNextSendAt(input.nowMs, nextStep.delay_minutes),
        nowIso,
      }),
    };
  }
  return {
    type: 'complete',
    payload: reconcileCompletePayload({
      status: input.statusCompleted,
      nowIso,
    }),
  };
}

export function planConfirmedRowAction(parsed: {
  kind: string;
  enrollmentId?: string;
  campaignId?: string;
  stepNumber?: number;
}):
  | {
      type: 'advance';
      enrollmentId: string;
      campaignId: string;
      stepNumber: number;
    }
  | { type: 'ignore' } {
  if (
    parsed.kind === KIND_CAMPAIGN &&
    parsed.enrollmentId &&
    parsed.campaignId &&
    parsed.stepNumber != null
  ) {
    return {
      type: 'advance',
      enrollmentId: parsed.enrollmentId,
      campaignId: parsed.campaignId,
      stepNumber: parsed.stepNumber,
    };
  }
  return { type: 'ignore' };
}
