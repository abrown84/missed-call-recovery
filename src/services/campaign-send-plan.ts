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
