/**
 * Pure pre-send + dispatch planning for sendCampaignSMS.
 * I/O shell fetches rows, calls sendMessage, then applies the plan.
 */

import {
  decideCampaignLeadGates,
  decideCampaignSendDispatch,
  decideSkipRecoveryGate,
} from '@/services/campaign-decisions';
import type { SendOutcome } from '@/services/send/types';

export type CampaignSendPrePlan =
  | { type: 'fail'; success: false; reason: 'no_enrollment' | 'no_claim_token' }
  | { type: 'pause'; success: true; reason: 'opted_out_or_suppressed' }
  | { type: 'release_fail'; success: false; reason: 'suppression_lookup_failed' }
  | { type: 'release_fail'; success: false; reason: 'no_steps' | 'step_missing' }
  | {
      type: 'send';
      skipRecoveryGate: boolean;
      templateKey: string;
      stepNumber: number;
      leadTimezone: string | null;
    };

/** Prefer explicit claim arg, else enrollment token. */
export function resolveClaimToken(
  claimToken: string | undefined,
  enrollmentClaimToken: string | null | undefined
): string | null {
  return claimToken || enrollmentClaimToken || null;
}

/** Empty steps when the fetch errored; otherwise coalesce null → []. */
export function stepsForSendPlan<T>(
  steps: T[] | null | undefined,
  stepsError: unknown
): T[] {
  return (stepsError ? [] : steps) ?? [];
}

export function coalesceCurrentStep(
  currentStep: number | null | undefined
): number {
  return currentStep ?? -1;
}

export function coalesceLeadTimezone(
  timezone: string | null | undefined
): string | null {
  return timezone ?? null;
}

export function coalesceIssue(issue: string | null | undefined): string {
  return issue || '';
}

export function shouldCheckSuppression(
  lead: unknown,
  business: unknown
): boolean {
  return Boolean(lead && business);
}

export type CampaignSendEffect =
  | { op: 'advance'; stepNumber: number }
  | { op: 'release'; nextSendAt?: string }
  | { op: 'flag_unresolved_tz'; nextSendAt?: string }
  | { op: 'park'; nextSendAt?: string }
  | { op: 'pause_opt_out' }
  | { op: 'needs_review_terminal'; reason: string }
  | { op: 'noop_release' };

/** Map post-send dispatch → ordered I/O effects (no DB). */
export function planCampaignSendEffects(
  dispatch: CampaignSendPostPlan,
  stepNumber: number
): { effects: CampaignSendEffect[]; success: boolean } {
  switch (dispatch.type) {
    case 'advance':
      return {
        effects: [{ op: 'advance', stepNumber }],
        success: dispatch.success,
      };
    case 'release':
      return {
        effects: [{ op: 'release', nextSendAt: dispatch.nextSendAt }],
        success: dispatch.success,
      };
    case 'flag_unresolved_tz':
      return {
        effects: [
          { op: 'flag_unresolved_tz', nextSendAt: dispatch.nextSendAt },
        ],
        success: dispatch.success,
      };
    case 'park':
      return {
        effects: [{ op: 'park', nextSendAt: dispatch.nextSendAt }],
        success: dispatch.success,
      };
    case 'pause_opt_out':
      return { effects: [{ op: 'pause_opt_out' }], success: dispatch.success };
    case 'needs_review_terminal':
      return {
        effects: [
          { op: 'needs_review_terminal', reason: dispatch.reason },
        ],
        success: dispatch.success,
      };
    case 'noop_false':
      return { effects: [{ op: 'noop_release' }], success: dispatch.success };
  }
}

export function planCampaignSendPre(input: {
  enrollmentFound: boolean;
  claimToken: string | null;
  optedOut: boolean;
  suppressed: boolean;
  suppressionLookupFailed: boolean;
  steps: Array<{ step_number: number; delay_minutes: number; template_key: string }>;
  currentStep: number;
  leadTimezone: string | null;
}): CampaignSendPrePlan {
  if (!input.enrollmentFound) {
    return { type: 'fail', success: false, reason: 'no_enrollment' };
  }
  if (!input.claimToken) {
    return { type: 'fail', success: false, reason: 'no_claim_token' };
  }
  const leadGate = decideCampaignLeadGates({
    optedOut: input.optedOut,
    suppressed: input.suppressed,
    suppressionLookupFailed: input.suppressionLookupFailed,
  });
  if (leadGate.action === 'pause') {
    return { type: 'pause', success: true, reason: 'opted_out_or_suppressed' };
  }
  if (leadGate.action === 'release_fail') {
    return {
      type: 'release_fail',
      success: false,
      reason: 'suppression_lookup_failed',
    };
  }
  if (input.steps.length === 0) {
    return { type: 'release_fail', success: false, reason: 'no_steps' };
  }
  const current = input.steps.find((s) => s.step_number === input.currentStep);
  if (!current) {
    return { type: 'release_fail', success: false, reason: 'step_missing' };
  }
  return {
    type: 'send',
    skipRecoveryGate: decideSkipRecoveryGate({
      delayMinutes: current.delay_minutes,
      currentStep: input.currentStep,
      firstStepNumber: input.steps[0]?.step_number,
    }),
    templateKey: current.template_key,
    stepNumber: input.currentStep,
    leadTimezone: input.leadTimezone,
  };
}

export type CampaignSendPostPlan = ReturnType<typeof decideCampaignSendDispatch>;

export function planCampaignSendPost(
  outcome: SendOutcome,
  parkedFallbackIso: string
): CampaignSendPostPlan {
  return decideCampaignSendDispatch(outcome, parkedFallbackIso);
}
